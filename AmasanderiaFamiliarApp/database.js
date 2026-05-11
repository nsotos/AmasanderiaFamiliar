import * as SQLite from 'expo-sqlite';

export const setupDatabase = async () => {
  const db = await SQLite.openDatabaseAsync('AmasanderiaFamiliar.sqlite');
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS productos(
        id_producto integer PRIMARY KEY AUTOINCREMENT,
        nombre text not null,
        precio_unitario integer not null,
        sincronizado INTEGER DEFAULT 0 /*Para verificar y actualizar datos en firebase.*/
    );

    CREATE TABLE IF NOT EXISTS ventas (
        id_venta INTEGER PRIMARY KEY AUTOINCREMENT,
        id_producto INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        total_venta INTEGER NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        sincronizado INTEGER DEFAULT 0, /*Para verificar y actualizar datos en firebase.*/
        FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
    );

    CREATE TABLE IF NOT EXISTS recetas(
        id_receta integer PRIMARY KEY AUTOINCREMENT,
        id_producto integer,
        nombre text not null,
        ingredientes text not null,
        instrucciones text not null,
        sincronizado INTEGER DEFAULT 0,/*Para verificar y actualizar datos en firebase.*/
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
        sincronizado INTEGER DEFAULT 0 /*Para verificar y actualizar datos en firebase.*/
    );`);
  console.log("Base de datos inicializada correctamente");
  return db;
};