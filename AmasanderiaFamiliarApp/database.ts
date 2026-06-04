import * as SQLite from "expo-sqlite";

// Variable global con su tipo definido para TypeScript
let dbInstance: SQLite.SQLiteDatabase | null = null;

export const setupDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await SQLite.openDatabaseAsync("AmasanderiaFamiliar.sqlite");

    await dbInstance.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      
      CREATE TABLE IF NOT EXISTS productos(
          id_producto integer PRIMARY KEY AUTOINCREMENT,
          nombre text not null,
          precio_unitario integer not null,
          sincronizado INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ventas (
          id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
          id_producto INTEGER NOT NULL,
          cantidad REAL NOT NULL,
          total_venta INTEGER NOT NULL,
          fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
          sincronizado INTEGER DEFAULT 0,
          FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
      );

      CREATE TABLE IF NOT EXISTS recetas(
          id_receta integer PRIMARY KEY AUTOINCREMENT,
          id_producto integer,
          nombre text not null,
          ingredientes text not null,
          instrucciones text not null,
          sincronizado INTEGER DEFAULT 0,
          FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
      );

      CREATE TABLE IF NOT EXISTS encargos (
          id_encargo INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente TEXT NOT NULL,
          telefono TEXT,
          detalle TEXT,
          fecha_entrega DATE,
          estado TEXT DEFAULT 'Pendiente',
          abono INTEGER DEFAULT 0,
          sincronizado INTEGER DEFAULT 0
      );

      INSERT OR IGNORE INTO productos (id_producto, nombre, precio_unitario) VALUES
        (1, 'Hallulla Especial', 2000),
        (2, 'Marraqueta Crujiente', 1800),
        (3, 'Pan de Molde Artesanal', 3500),
        (4, 'Empanada de Pino', 2500),
        (5, 'Queque Casero Vainilla', 4500);

      -- Producto sistema para registrar encargos como ventas (oculto en UI)
      INSERT OR IGNORE INTO productos (id_producto, nombre, precio_unitario) VALUES
        (9999, '__ENCARGO_SISTEMA__', 0);
    `);

    // Migraciones seguras: agregar columnas nuevas si no existen
    try { await dbInstance.execAsync('ALTER TABLE ventas ADD COLUMN descripcion TEXT;'); } catch (_) {}
    try { await dbInstance.execAsync('ALTER TABLE ventas ADD COLUMN grupo_venta TEXT;'); } catch (_) {}
    try { await dbInstance.execAsync('ALTER TABLE encargos ADD COLUMN precio_total INTEGER DEFAULT 0;'); } catch (_) {}

    console.log("Base de datos inicializada correctamente");
    return dbInstance;
  } catch (error) {
    console.error("Error al inicializar la base de datos:", error);
    dbInstance = null;
    throw error;
  }
};
