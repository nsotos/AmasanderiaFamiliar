import { collection, getDocs } from "firebase/firestore";
import { db as firestore, authReady } from "../firebaseConfig";
import { setupDatabase } from "../database";
import { getPendingDeletionIds } from "./deleteSync";

export const sincronizarTodoConFirebase = async () => {
  try {
    await authReady; // Las reglas exigen sesión: esperar al login anónimo.
    const db = await setupDatabase();

    // Descargar todas las colecciones en paralelo (antes era secuencial: 5x más lento)
    const [clientesSnap, productosSnap, encargosSnap, ventasSnap, recetasSnap] =
      await Promise.all([
        getDocs(collection(firestore, "clientes")),
        getDocs(collection(firestore, "productos")),
        getDocs(collection(firestore, "encargos")),
        getDocs(collection(firestore, "ventas")),
        getDocs(collection(firestore, "recetas")),
      ]);

    // Obtener IDs pendientes de borrar para no reinsertarlos
    const [
      deletedClientes,
      deletedProductos,
      deletedEncargos,
      deletedVentas,
      deletedRecetas,
    ] = await Promise.all([
      getPendingDeletionIds(db, "clientes"),
      getPendingDeletionIds(db, "productos"),
      getPendingDeletionIds(db, "encargos"),
      getPendingDeletionIds(db, "ventas"),
      getPendingDeletionIds(db, "recetas"),
    ]);

    // Escribir todo en SQLite en una sola transacción
    await db.withTransactionAsync(async () => {
      // Clientes
      for (const doc of clientesSnap.docs) {
        if (deletedClientes.has(doc.id)) continue;
        const data = doc.data();
        await db.runAsync(
          `INSERT OR REPLACE INTO clientes (id_cliente, nombre, telefono, deuda_pendiente, sincronizado) VALUES (?, ?, ?, ?, 1)`,
          [data.id, data.nombre, data.telefono, data.deuda_pendiente || 0],
        );
      }

      // Productos
      for (const doc of productosSnap.docs) {
        if (deletedProductos.has(doc.id)) continue;
        const data = doc.data();
        await db.runAsync(
          `INSERT OR REPLACE INTO productos (id_producto, nombre, precio_unitario, sincronizado) VALUES (?, ?, ?, 1)`,
          [data.id_producto, data.nombre, data.precio_unitario],
        );
      }

      // Encargos
      for (const doc of encargosSnap.docs) {
        if (deletedEncargos.has(doc.id)) continue;
        const data = doc.data();
        const idEncargo = data.id_encargo ?? Number(doc.id);
        if (!idEncargo || typeof data.id_cliente !== "number") continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO encargos
            (id_encargo, id_cliente, total, fecha_entrega, estado_pedido, estado_pago, abono, sincronizado)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            idEncargo,
            data.id_cliente,
            data.total ?? 0,
            data.fecha_entrega ?? null,
            data.estado_pedido ?? "PENDIENTE",
            data.estado_pago ?? "PAGADO",
            data.abono ?? 0,
          ],
        );

        if (Array.isArray(data.items)) {
          await db.runAsync("DELETE FROM encargo_items WHERE id_encargo = ?", [
            idEncargo,
          ]);
          for (const item of data.items) {
            if (typeof item.id_producto !== "number") continue;
            await db.runAsync(
              `INSERT INTO encargo_items (id_encargo, id_producto, cantidad, subtotal) VALUES (?, ?, ?, ?)`,
              [idEncargo, item.id_producto, item.cantidad ?? 1, item.subtotal ?? 0],
            );
          }
        }
      }

      // Ventas
      for (const doc of ventasSnap.docs) {
        if (deletedVentas.has(doc.id)) continue;
        const data = doc.data();
        if (
          typeof data.id_venta !== "number" ||
          typeof data.id_producto !== "number"
        )
          continue;
        await db.runAsync(
          `INSERT OR REPLACE INTO ventas
            (id_venta, id_producto, id_cliente, id_encargo, cantidad, total_venta, fecha_venta, grupo_venta, sincronizado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            data.id_venta,
            data.id_producto,
            data.id_cliente ?? null,
            data.id_encargo ?? null,
            data.cantidad ?? 1,
            data.total_venta ?? 0,
            data.fecha_venta ?? new Date().toISOString(),
            data.grupo_venta ?? null,
          ],
        );
      }

      // Recetas
      for (const doc of recetasSnap.docs) {
        if (deletedRecetas.has(doc.id)) continue;
        const data = doc.data();
        const idProducto =
          typeof data.id_producto === "number" ? data.id_producto : null;
        const idReceta =
          typeof data.id_receta === "number"
            ? data.id_receta
            : idProducto
              ? null
              : Number(doc.id);

        if (!idReceta && !idProducto) continue;

        const nombre = data.nombre ?? "";
        const ingredientes = data.ingredientes ?? "";
        const instrucciones = data.instrucciones ?? "";

        if (idReceta) {
          await db.runAsync(
            `INSERT OR REPLACE INTO recetas (id_receta, id_producto, nombre, ingredientes, instrucciones, sincronizado) VALUES (?, ?, ?, ?, ?, 1)`,
            [idReceta, idProducto, nombre, ingredientes, instrucciones],
          );
        } else if (idProducto) {
          const existente = await db.getFirstAsync<{ id_receta: number }>(
            "SELECT id_receta FROM recetas WHERE id_producto = ?",
            [idProducto],
          );
          if (existente) {
            await db.runAsync(
              `UPDATE recetas SET nombre = ?, ingredientes = ?, instrucciones = ?, sincronizado = 1 WHERE id_producto = ?`,
              [nombre, ingredientes, instrucciones, idProducto],
            );
          } else {
            await db.runAsync(
              `INSERT INTO recetas (id_producto, nombre, ingredientes, instrucciones, sincronizado) VALUES (?, ?, ?, ?, 1)`,
              [idProducto, nombre, ingredientes, instrucciones],
            );
          }
        }
      }
    });

    console.log("✅ Sincronización global terminada");
  } catch (error) {
    console.error("Error en sincronización global:", error);
  }
};
