import type * as SQLite from "expo-sqlite";

/** Saldo pendiente del pedido (total menos abono inicial). */
export function calcularSaldoEncargo(
  precioTotal: number,
  abono: number,
): number {
  return Math.max(0, precioTotal - abono);
}

/** Ajusta deuda_pendiente del cliente de forma atómica (nunca queda negativa). */
export async function ajustarDeudaCliente(
  db: SQLite.SQLiteDatabase,
  idCliente: number | null | undefined,
  delta: number,
): Promise<void> {
  if (!idCliente || delta === 0) return;
  await db.runAsync(
    "UPDATE clientes SET deuda_pendiente = MAX(0, deuda_pendiente + ?), sincronizado = 0 WHERE id_cliente = ?",
    [delta, idCliente],
  );
}
