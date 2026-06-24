import * as SQLite from "expo-sqlite";

// Variables globales para manejar el singleton y evitar condiciones de carrera
let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const initDb = async (): Promise<SQLite.SQLiteDatabase> => {
  try {
    const db = await SQLite.openDatabaseAsync(
      "AmasanderiaFamiliar_v3.sqlite",
    );

    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      
      -- 1. Crear clientes primero (no depende de nadie)
      CREATE TABLE IF NOT EXISTS clientes (
          id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          telefono TEXT,
          deuda_pendiente REAL DEFAULT 0,
          fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. Crear productos (no depende de nadie)
      CREATE TABLE IF NOT EXISTS productos(
          id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          precio_unitario INTEGER NOT NULL,
          sincronizado INTEGER DEFAULT 0
      );

      -- 3. Encargo = cabecera del pedido (un pedido, N productos en encargo_items)
      CREATE TABLE IF NOT EXISTS encargos (
          id_encargo INTEGER PRIMARY KEY AUTOINCREMENT,
          id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
          total REAL NOT NULL,
          fecha_entrega DATE,
          estado_pedido TEXT DEFAULT 'PENDIENTE',
          estado_pago TEXT DEFAULT 'PAGADO',
          abono REAL DEFAULT 0,
          sincronizado INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS encargo_items (
          id_item INTEGER PRIMARY KEY AUTOINCREMENT,
          id_encargo INTEGER NOT NULL REFERENCES encargos(id_encargo) ON DELETE CASCADE,
          id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
          cantidad INTEGER NOT NULL,
          subtotal REAL NOT NULL
      );

      -- 4. Crear ventas (Esquema Nuevo y Relacional)
      CREATE TABLE IF NOT EXISTS ventas (
          id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
          id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
          id_cliente INTEGER REFERENCES clientes(id_cliente),
          id_encargo INTEGER REFERENCES encargos(id_encargo),
          cantidad REAL NOT NULL,
          total_venta INTEGER NOT NULL,
          grupo_venta TEXT,
          fecha_venta DATETIME DEFAULT CURRENT_TIMESTAMP,
          sincronizado INTEGER DEFAULT 0
      );

      -- Una sola venta por encargo entregado (evita duplicados al cambiar estado)
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_id_encargo
        ON ventas(id_encargo) WHERE id_encargo IS NOT NULL;

      -- 5. Crear recetas (depende de productos)
      CREATE TABLE IF NOT EXISTS recetas(
          id_receta INTEGER PRIMARY KEY AUTOINCREMENT,
          id_producto INTEGER REFERENCES productos(id_producto),
          nombre TEXT NOT NULL,
          ingredientes TEXT NOT NULL,
          instrucciones TEXT NOT NULL,
          sincronizado INTEGER DEFAULT 0
      );


      -- Producto sistema para registrar encargos como ventas (oculto en UI)
      INSERT OR IGNORE INTO productos (id_producto, nombre, precio_unitario) VALUES
        (9999, '__ENCARGO_SISTEMA__', 0);

      -- Rastrea borrados pendientes de sincronizar con Firestore (para modo offline)
      CREATE TABLE IF NOT EXISTS pending_deletions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tabla TEXT NOT NULL,
        record_id TEXT NOT NULL,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tabla, record_id)
      );
    `);

    // Migración: agregar sincronizado a clientes si no existe
    try {
      await db.execAsync(
        "ALTER TABLE clientes ADD COLUMN sincronizado INTEGER DEFAULT 0;",
      );
    } catch (_) {
      // La columna ya existe, ignorar
    }

    // Migración: agregar sincronizado a encargo_items si no existe
    try {
      await db.execAsync(
        "ALTER TABLE encargo_items ADD COLUMN sincronizado INTEGER DEFAULT 0;",
      );
    } catch (_) {
      // La columna ya existe, ignorar
    }

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_venta DESC);
      CREATE INDEX IF NOT EXISTS idx_encargos_estado ON encargos(estado_pedido, fecha_entrega);
    `);

    // Solo asignar el singleton una vez que TODO el setup esté completo
    dbInstance = db;
    console.log("Base de datos inicializada correctamente");
    return dbInstance;
  } catch (error) {
    console.error("Error al inicializar la base de datos:", error);
    dbInstance = null;
    throw error;
  }
};

// Exportación robusta usando el patrón de inicialización segura
// INCLUYE FIX C-05: Resetear initPromise si falla para permitir reintentos
export const setupDatabase = (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!initPromise) {
    initPromise = initDb().catch((err) => {
      initPromise = null; // permitir reintento
      dbInstance = null;
      throw err;
    });
  }
  return initPromise;
};
