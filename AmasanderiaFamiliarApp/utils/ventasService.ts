import type * as SQLite from "expo-sqlite";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db as firestore } from "../firebaseConfig";
import type { ItemCarrito } from "@/hooks/useCarrito";
import { generarId } from "./ids";

export interface VentaRow {
  id_venta: number;
  id_producto: number;
  id_cliente: number | null;
  id_encargo: number | null;
  cantidad: number;
  total_venta: number;
  grupo_venta: string | null;
  fecha_venta: string;
}

export interface VentaGrupoRef {
  clave: string;
  grupo_venta: string | null;
  es_encargo: boolean;
}

/** Inserta una venta de mostrador (carrito) de forma atómica. */
export async function registrarVentaDesdeCarrito(
  db: SQLite.SQLiteDatabase,
  carrito: ItemCarrito[],
): Promise<VentaRow[]> {
  const grupoVenta =
    carrito.length >= 2 ? `grupo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : null;
  const fechaVenta = new Date().toISOString();
  const insertadas: VentaRow[] = [];

  await db.withTransactionAsync(async () => {
    for (const item of carrito) {
      const idVenta = generarId();
      await db.runAsync(
        `INSERT INTO ventas (id_venta, id_producto, cantidad, total_venta, grupo_venta, fecha_venta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          idVenta,
          item.producto.id_producto,
          item.cantidad,
          item.subtotal,
          grupoVenta,
          fechaVenta,
        ],
      );
      insertadas.push({
        id_venta: idVenta,
        id_producto: item.producto.id_producto,
        id_cliente: null,
        id_encargo: null,
        cantidad: item.cantidad,
        total_venta: item.subtotal,
        grupo_venta: grupoVenta,
        fecha_venta: fechaVenta,
      });
    }
  });

  return insertadas;
}

/** Inserta venta de encargo dentro de una transacción ya abierta (idempotente). */
export async function insertarVentaEncargo(
  db: SQLite.SQLiteDatabase,
  params: {
    id_encargo: number;
    id_producto: number;
    id_cliente: number;
    cantidad: number;
    total_venta: number;
  },
): Promise<VentaRow | null> {
  const existente = await db.getFirstAsync<{ id_venta: number }>(
    "SELECT id_venta FROM ventas WHERE id_encargo = ? LIMIT 1",
    [params.id_encargo],
  );
  if (existente) return null;

  const fechaVenta = new Date().toISOString();
  const idVenta = generarId();
  await db.runAsync(
    `INSERT INTO ventas (id_venta, id_producto, id_cliente, cantidad, total_venta, id_encargo, fecha_venta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      idVenta,
      params.id_producto,
      params.id_cliente,
      params.cantidad,
      params.total_venta,
      params.id_encargo,
      fechaVenta,
    ],
  );

  return {
    id_venta: idVenta,
    id_producto: params.id_producto,
    id_cliente: params.id_cliente,
    id_encargo: params.id_encargo,
    cantidad: params.cantidad,
    total_venta: params.total_venta,
    grupo_venta: null,
    fecha_venta: fechaVenta,
  };
}

/** Registra la venta generada al entregar un encargo (transacción propia). */
export async function registrarVentaDesdeEncargo(
  db: SQLite.SQLiteDatabase,
  params: {
    id_encargo: number;
    id_producto: number;
    id_cliente: number;
    cantidad: number;
    total_venta: number;
  },
): Promise<VentaRow | null> {
  let insertada: VentaRow | null = null;
  await db.withTransactionAsync(async () => {
    insertada = await insertarVentaEncargo(db, params);
  });
  return insertada;
}

/**
 * Elimina un grupo o venta individual y revierte encargo asociado si aplica.
 * Devuelve los id_venta eliminados para registrar su borrado en Firestore.
 */
export async function eliminarVentaGrupo(
  db: SQLite.SQLiteDatabase,
  grupo: VentaGrupoRef,
): Promise<number[]> {
  const idsEliminadas: number[] = [];
  await db.withTransactionAsync(async () => {
    if (grupo.grupo_venta) {
      const filas = await db.getAllAsync<{ id_venta: number }>(
        "SELECT id_venta FROM ventas WHERE grupo_venta = ?",
        [grupo.grupo_venta],
      );
      idsEliminadas.push(...filas.map((f) => f.id_venta));
      await db.runAsync("DELETE FROM ventas WHERE grupo_venta = ?", [
        grupo.grupo_venta,
      ]);
      return;
    }

    if (grupo.es_encargo) {
      const ventaEncargo = await db.getFirstAsync<{
        id_encargo: number;
        id_cliente: number;
        total: number;
        abono: number;
        estado_pago: string;
      }>(
        `SELECT v.id_encargo, e.id_cliente, e.total, e.abono, e.estado_pago
         FROM ventas v
         JOIN encargos e ON e.id_encargo = v.id_encargo
         WHERE CAST(v.id_venta AS TEXT) = ?`,
        [grupo.clave],
      );

      if (ventaEncargo) {
        await db.runAsync(
          "UPDATE encargos SET estado_pedido = 'PENDIENTE', sincronizado = 0 WHERE id_encargo = ?",
          [ventaEncargo.id_encargo],
        );
        if (ventaEncargo.estado_pago === "FIADO") {
          const montoDeuda = ventaEncargo.total - (ventaEncargo.abono || 0);
          await db.runAsync(
            "UPDATE clientes SET deuda_pendiente = MAX(0, deuda_pendiente - ?), sincronizado = 0 WHERE id_cliente = ?",
            [montoDeuda, ventaEncargo.id_cliente],
          );
        }
      }
    }

    await db.runAsync("DELETE FROM ventas WHERE id_venta = CAST(? AS INTEGER)", [
      grupo.clave,
    ]);
    idsEliminadas.push(Number(grupo.clave));
  });
  return idsEliminadas;
}

/** Sincroniza una fila de venta a Firestore y marca sincronizado=1 en SQLite. */
export async function syncVentaAFirebase(
  db: SQLite.SQLiteDatabase,
  venta: VentaRow,
): Promise<void> {
  await setDoc(
    doc(collection(firestore, "ventas"), venta.id_venta.toString()),
    {
      id_venta: venta.id_venta,
      id_producto: venta.id_producto,
      id_cliente: venta.id_cliente,
      id_encargo: venta.id_encargo,
      cantidad: venta.cantidad,
      total_venta: venta.total_venta,
      grupo_venta: venta.grupo_venta,
      fecha_venta: venta.fecha_venta,
    },
  );
  await db.runAsync(
    "UPDATE ventas SET sincronizado = 1 WHERE id_venta = ?",
    [venta.id_venta],
  );
}

/**
 * Sincroniza un lote de ventas a Firebase (no bloqueante — fire-and-forget).
 * Marca sincronizado=1 en SQLite cuando cada venta se sube con éxito.
 * Si no hay conexión, quedan con sincronizado=0 y offlineSync las subirá después.
 */
export function syncVentasAFirebase(
  db: SQLite.SQLiteDatabase,
  ventas: VentaRow[],
): void {
  for (const v of ventas) {
    syncVentaAFirebase(db, v).catch((err) =>
      console.warn(`[Firebase] Sync venta ${v.id_venta} pendiente:`, err),
    );
  }
}

export async function eliminarVentaDeFirebase(idVenta: number): Promise<void> {
  await deleteDoc(doc(firestore, "ventas", idVenta.toString()));
}

/** Aplica un documento de Firestore a SQLite solo si tiene la forma relacional esperada. */
export async function aplicarVentaDesdeFirebase(
  db: SQLite.SQLiteDatabase,
  data: Record<string, unknown>,
): Promise<void> {
  const idVenta = data.id_venta;
  const idProducto = data.id_producto;
  if (typeof idVenta !== "number" || typeof idProducto !== "number") return;

  await db.runAsync(
    `INSERT OR REPLACE INTO ventas
      (id_venta, id_producto, id_cliente, id_encargo, cantidad, total_venta, grupo_venta, fecha_venta, sincronizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      idVenta,
      idProducto,
      typeof data.id_cliente === "number" ? data.id_cliente : null,
      typeof data.id_encargo === "number" ? data.id_encargo : null,
      typeof data.cantidad === "number" ? data.cantidad : 1,
      typeof data.total_venta === "number" ? data.total_venta : 0,
      typeof data.grupo_venta === "string" ? data.grupo_venta : null,
      typeof data.fecha_venta === "string"
        ? data.fecha_venta
        : new Date().toISOString(),
    ],
  );
}
