import { collection, doc, deleteDoc } from "firebase/firestore";
import { db as firestore } from "../firebaseConfig";
import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Borra un registro de Firestore y registra el borrado como pendiente en SQLite
 * para que se procese offline si no hay conexión.
 */
export async function eliminarConSync(
  db: SQLiteDatabase,
  tabla: string,
  recordId: string,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO pending_deletions (tabla, record_id) VALUES (?, ?)`,
    [tabla, recordId],
  );

  deleteDoc(doc(collection(firestore, tabla), recordId))
    .then(() =>
      db
        .runAsync(
          `DELETE FROM pending_deletions WHERE tabla = ? AND record_id = ?`,
          [tabla, recordId],
        )
        .catch(console.warn),
    )
    .catch(() => {});
}

/**
 * Devuelve el conjunto de IDs pendientes de borrar para una tabla dada.
 * Usado por onSnapshot y sincronizarTodoConFirebase para no reinsertar borrados.
 */
export async function getPendingDeletionIds(
  db: SQLiteDatabase,
  tabla: string,
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ record_id: string }>(
    `SELECT record_id FROM pending_deletions WHERE tabla = ?`,
    [tabla],
  );
  return new Set(rows.map((r) => r.record_id));
}
