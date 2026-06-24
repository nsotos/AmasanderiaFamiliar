import type * as SQLite from "expo-sqlite";
import { generarId } from "./ids";

export interface ItemEncargoInput {
  id_producto: number;
  cantidad: number;
  subtotal: number;
}

export interface EncargoGuardado {
  id_encargo: number;
  id_cliente: number;
  total: number;
  fecha_entrega: string;
  estado_pedido: string;
  estado_pago: string;
  abono: number;
  items: (ItemEncargoInput & { nombre?: string })[];
}

const PRODUCTO_ENCARGO_SISTEMA = 9999;

/** Crea un encargo con múltiples productos en una sola transacción. */
export async function guardarEncargoConItems(
  db: SQLite.SQLiteDatabase,
  params: {
    id_cliente: number;
    items: ItemEncargoInput[];
    total: number;
    fecha_entrega: string;
    estado_pago: "PAGADO" | "ABONADO" | "FIADO";
    abono: number;
  },
): Promise<EncargoGuardado> {
  let encargo: EncargoGuardado | null = null;

  await db.withTransactionAsync(async () => {
    const idEncargo = generarId();
    await db.runAsync(
      `INSERT INTO encargos (id_encargo, id_cliente, total, fecha_entrega, estado_pedido, estado_pago, abono)
       VALUES (?, ?, ?, ?, 'PENDIENTE', ?, ?)`,
      [
        idEncargo,
        params.id_cliente,
        params.total,
        params.fecha_entrega,
        params.estado_pago,
        params.abono,
      ],
    );

    for (const item of params.items) {
      await db.runAsync(
        `INSERT INTO encargo_items (id_encargo, id_producto, cantidad, subtotal)
         VALUES (?, ?, ?, ?)`,
        [idEncargo, item.id_producto, item.cantidad, item.subtotal],
      );
    }

    encargo = {
      id_encargo: idEncargo,
      id_cliente: params.id_cliente,
      total: params.total,
      fecha_entrega: params.fecha_entrega,
      estado_pedido: "PENDIENTE",
      estado_pago: params.estado_pago,
      abono: params.abono,
      items: params.items,
    };
  });

  if (!encargo) throw new Error("No se pudo crear el encargo");
  return encargo;
}

/** Producto sistema para ventas de encargos multi-ítem. */
export function productoVentaEncargo(): number {
  return PRODUCTO_ENCARGO_SISTEMA;
}
