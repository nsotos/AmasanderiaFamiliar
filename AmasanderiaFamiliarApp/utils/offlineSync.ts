/**
 * offlineSync.ts
 *
 * Sincroniza todos los registros locales con sincronizado = 0 hacia Firebase.
 * Se llama automáticamente cuando la app vuelve al frente o cada 30 segundos.
 * Si no hay conexión, los setDoc lanzan error y la función termina sin marcar nada.
 */

import { collection, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db as firestore, authReady } from "../firebaseConfig";
import { setupDatabase } from "../database";
import { setEstadoSync } from "./syncStatus";

/**
 * Las escrituras de Firestore NO se resuelven mientras no haya conexión: la
 * promesa queda pendiente hasta volver a estar online. Sin un límite de tiempo,
 * el ciclo de sincronización se quedaría colgado y el indicador no se
 * actualizaría. Con este timeout, una escritura que no responde se trata como
 * "sin conexión" (el mensaje incluye "timeout", que `esErrorDeRed` reconoce) y
 * el ciclo termina ordenadamente para reintentar después.
 */
function conTimeout<T>(promesa: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout de red")), ms),
    ),
  ]);
}

// ─── TIPOS LOCALES ─────────────────────────────────────────────────────────

interface ClienteRow {
  id_cliente: number;
  nombre: string;
  telefono: string | null;
  deuda_pendiente: number;
  fecha_registro: string | null;
}

interface ProductoRow {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

interface EncargoRow {
  id_encargo: number;
  id_cliente: number;
  total: number;
  fecha_entrega: string | null;
  estado_pedido: string;
  estado_pago: string;
  abono: number;
}

interface EncargoItemRow {
  id_producto: number;
  nombre: string;
  cantidad: number;
  subtotal: number;
}

interface VentaRow {
  id_venta: number;
  id_producto: number;
  id_cliente: number | null;
  id_encargo: number | null;
  cantidad: number;
  total_venta: number;
  grupo_venta: string | null;
  fecha_venta: string;
}

interface RecetaRow {
  id_receta: number;
  id_producto: number | null;
  nombre: string;
  ingredientes: string;
  instrucciones: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function esErrorDeRed(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("offline") ||
    msg.includes("failed to fetch") ||
    msg.includes("unable to resolve")
  );
}

// ─── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────

let syncEnCurso = false;

/** Cuenta registros locales sin subir + borrados pendientes de propagar. */
export async function contarPendientes(): Promise<number> {
  const db = await setupDatabase();
  const consultas = [
    "SELECT COUNT(*) AS n FROM clientes WHERE sincronizado = 0",
    "SELECT COUNT(*) AS n FROM productos WHERE sincronizado = 0 AND id_producto != 9999",
    "SELECT COUNT(*) AS n FROM encargos WHERE sincronizado = 0",
    "SELECT COUNT(*) AS n FROM ventas WHERE sincronizado = 0",
    "SELECT COUNT(*) AS n FROM recetas WHERE sincronizado = 0",
    "SELECT COUNT(*) AS n FROM pending_deletions",
  ];
  let total = 0;
  for (const q of consultas) {
    const r = await db.getFirstAsync<{ n: number }>(q);
    total += r?.n ?? 0;
  }
  return total;
}

/** Recalcula el contador de pendientes y lo publica al indicador. */
export async function refrescarPendientes(): Promise<void> {
  try {
    setEstadoSync({ pendientes: await contarPendientes() });
  } catch {
    /* sin base lista — se reintentará */
  }
}

export async function syncPendingToFirebase(): Promise<void> {
  if (syncEnCurso) return; // Evitar ejecuciones concurrentes
  syncEnCurso = true;
  setEstadoSync({ sincronizando: true });

  try {
    await authReady; // Las reglas exigen sesión: esperar al login anónimo.
    const db = await setupDatabase();

    // ── 0. Borrados pendientes ───────────────────────────────────────────────
    const pendingDels = await db.getAllAsync<{ tabla: string; record_id: string }>(
      "SELECT tabla, record_id FROM pending_deletions ORDER BY deleted_at ASC",
    );
    for (const { tabla, record_id } of pendingDels) {
      try {
        await conTimeout(deleteDoc(doc(firestore, tabla, record_id)));
        await db.runAsync(
          "DELETE FROM pending_deletions WHERE tabla = ? AND record_id = ?",
          [tabla, record_id],
        );
      } catch (e) {
        if (esErrorDeRed(e)) throw e;
      }
    }

    // ── 1. Clientes ──────────────────────────────────────────────────────────
    const clientesPending = await db.getAllAsync<ClienteRow>(
      "SELECT * FROM clientes WHERE sincronizado = 0",
    );
    for (const c of clientesPending) {
      try {
        await conTimeout(
          setDoc(
            doc(collection(firestore, "clientes"), c.id_cliente.toString()),
            {
              id: c.id_cliente.toString(),
              nombre: c.nombre,
              telefono: c.telefono ?? "",
              deuda_pendiente: c.deuda_pendiente ?? 0,
              fecha_registro: c.fecha_registro ?? new Date().toISOString(),
            },
          ),
        );
        await db.runAsync(
          "UPDATE clientes SET sincronizado = 1 WHERE id_cliente = ?",
          [c.id_cliente],
        );
      } catch (e) {
        console.warn("[OfflineSync] cliente", c.id_cliente, "→ pendiente:", e);
        if (esErrorDeRed(e)) throw e;
      }
    }

    // ── 2. Productos (excluye el sistema) ────────────────────────────────────
    const productosPending = await db.getAllAsync<ProductoRow>(
      "SELECT * FROM productos WHERE sincronizado = 0 AND id_producto != 9999",
    );
    for (const p of productosPending) {
      try {
        await conTimeout(
          setDoc(
            doc(collection(firestore, "productos"), p.id_producto.toString()),
            {
              id_producto: p.id_producto,
              nombre: p.nombre,
              precio_unitario: p.precio_unitario,
            },
          ),
        );
        await db.runAsync(
          "UPDATE productos SET sincronizado = 1 WHERE id_producto = ?",
          [p.id_producto],
        );
      } catch (e) {
        console.warn("[OfflineSync] producto", p.id_producto, "→ pendiente:", e);
        if (esErrorDeRed(e)) throw e;
      }
    }

    // ── 3. Encargos ──────────────────────────────────────────────────────────
    const encargosPending = await db.getAllAsync<EncargoRow>(
      "SELECT * FROM encargos WHERE sincronizado = 0",
    );
    for (const enc of encargosPending) {
      try {
        const items = await db.getAllAsync<EncargoItemRow>(
          `SELECT ei.id_producto, p.nombre, ei.cantidad, ei.subtotal
           FROM encargo_items ei
           JOIN productos p ON p.id_producto = ei.id_producto
           WHERE ei.id_encargo = ?`,
          [enc.id_encargo],
        );
        await conTimeout(
          setDoc(
            doc(collection(firestore, "encargos"), enc.id_encargo.toString()),
            {
              id_encargo: enc.id_encargo,
              id_cliente: enc.id_cliente,
              items: items.map((i) => ({
                id_producto: i.id_producto,
                nombre: i.nombre,
                cantidad: i.cantidad,
                subtotal: i.subtotal,
              })),
              total: enc.total,
              fecha_entrega: enc.fecha_entrega ?? null,
              estado_pedido: enc.estado_pedido,
              estado_pago: enc.estado_pago,
              abono: enc.abono,
            },
          ),
        );
        await db.runAsync(
          "UPDATE encargos SET sincronizado = 1 WHERE id_encargo = ?",
          [enc.id_encargo],
        );
      } catch (e) {
        console.warn("[OfflineSync] encargo", enc.id_encargo, "→ pendiente:", e);
        if (esErrorDeRed(e)) throw e;
      }
    }

    // ── 4. Ventas ────────────────────────────────────────────────────────────
    const ventasPending = await db.getAllAsync<VentaRow>(
      "SELECT * FROM ventas WHERE sincronizado = 0",
    );
    for (const v of ventasPending) {
      try {
        await conTimeout(
          setDoc(
            doc(collection(firestore, "ventas"), v.id_venta.toString()),
            {
              id_venta: v.id_venta,
              id_producto: v.id_producto,
              id_cliente: v.id_cliente ?? null,
              id_encargo: v.id_encargo ?? null,
              cantidad: v.cantidad,
              total_venta: v.total_venta,
              grupo_venta: v.grupo_venta ?? null,
              fecha_venta: v.fecha_venta,
            },
          ),
        );
        await db.runAsync(
          "UPDATE ventas SET sincronizado = 1 WHERE id_venta = ?",
          [v.id_venta],
        );
      } catch (e) {
        console.warn("[OfflineSync] venta", v.id_venta, "→ pendiente:", e);
        if (esErrorDeRed(e)) throw e;
      }
    }

    // ── 5. Recetas ───────────────────────────────────────────────────────────
    const recetasPending = await db.getAllAsync<RecetaRow>(
      "SELECT * FROM recetas WHERE sincronizado = 0",
    );
    for (const r of recetasPending) {
      try {
        await conTimeout(
          setDoc(
            doc(collection(firestore, "recetas"), r.id_receta.toString()),
            {
              id_receta: r.id_receta,
              id_producto: r.id_producto ?? null,
              nombre: r.nombre,
              ingredientes: r.ingredientes,
              instrucciones: r.instrucciones,
            },
          ),
        );
        await db.runAsync(
          "UPDATE recetas SET sincronizado = 1 WHERE id_receta = ?",
          [r.id_receta],
        );
      } catch (e) {
        console.warn("[OfflineSync] receta", r.id_receta, "→ pendiente:", e);
        if (esErrorDeRed(e)) throw e;
      }
    }

    const totalPendientes =
      clientesPending.length +
      productosPending.length +
      encargosPending.length +
      ventasPending.length +
      recetasPending.length;

    if (totalPendientes > 0) {
      console.log(`✅ OfflineSync: ${totalPendientes} registro(s) sincronizados`);
    }
  } catch (_) {
    // Sin conexión o error de Firebase — se reintentará en el próximo ciclo
  } finally {
    syncEnCurso = false;
    try {
      setEstadoSync({
        pendientes: await contarPendientes(),
        sincronizando: false,
      });
    } catch {
      setEstadoSync({ sincronizando: false });
    }
  }
}
