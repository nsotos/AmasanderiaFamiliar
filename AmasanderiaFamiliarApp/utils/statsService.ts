import type * as SQLite from "expo-sqlite";

export type FiltroTiempo = "DIARIO" | "SEMANAL" | "MENSUAL" | "HISTORICO";

export interface ResumenVentas {
  total_general: number;
  total_pan: number;
  total_encargos: number;
  num_transacciones: number;
  unidades_vendidas: number;
  ticket_promedio: number;
}

export interface ProductoRanking {
  nombre: string;
  cantidad_vendida: number;
  ingreso_generado: number;
}

export interface VentaDiaria {
  dia: string;
  total: number;
}

export interface ResumenEncargos {
  pendientes: number;
  entregados: number;
  valor_pendiente: number;
  fiados_activos: number;
}

export interface ResumenDeudas {
  total_deuda: number;
  clientes_con_deuda: number;
}

export interface ReporteStats {
  ventas: ResumenVentas;
  ventasPeriodoAnterior: ResumenVentas;
  ranking: ProductoRanking[];
  ventasPorDia: VentaDiaria[];
  encargos: ResumenEncargos;
  deudas: ResumenDeudas;
}

const FECHA_LOCAL = "date(datetime(fecha_venta), 'localtime')";
const HOY = "date('now', 'localtime')";

function wherePeriodo(filtro: FiltroTiempo): string {
  switch (filtro) {
    case "DIARIO":
      return `WHERE ${FECHA_LOCAL} = ${HOY}`;
    case "SEMANAL":
      return `WHERE ${FECHA_LOCAL} >= date(${HOY}, '-6 days')`;
    case "MENSUAL":
      return `WHERE strftime('%Y-%m', datetime(fecha_venta), 'localtime') = strftime('%Y-%m', 'now', 'localtime')`;
    default:
      return "";
  }
}

function wherePeriodoAnterior(filtro: FiltroTiempo): string {
  switch (filtro) {
    case "DIARIO":
      return `WHERE ${FECHA_LOCAL} = date(${HOY}, '-1 day')`;
    case "SEMANAL":
      return `WHERE ${FECHA_LOCAL} >= date(${HOY}, '-13 days') AND ${FECHA_LOCAL} < date(${HOY}, '-6 days')`;
    case "MENSUAL":
      return `WHERE strftime('%Y-%m', datetime(fecha_venta), 'localtime') = strftime('%Y-%m', date('now', 'localtime', 'start of month', '-1 day'), 'localtime')`;
    default:
      return "WHERE 1=0";
  }
}

async function queryResumenVentas(
  db: SQLite.SQLiteDatabase,
  whereClause: string,
): Promise<ResumenVentas> {
  const res = await db.getFirstAsync<{
    total_general: number;
    total_pan: number;
    total_encargos: number;
    num_transacciones: number;
    unidades_vendidas: number;
  }>(`
    SELECT
      COALESCE(SUM(total_venta), 0) AS total_general,
      COALESCE(SUM(CASE WHEN id_encargo IS NULL THEN total_venta ELSE 0 END), 0) AS total_pan,
      COALESCE(SUM(CASE WHEN id_encargo IS NOT NULL THEN total_venta ELSE 0 END), 0) AS total_encargos,
      COUNT(DISTINCT COALESCE(grupo_venta, 'single_' || id_venta)) AS num_transacciones,
      COALESCE(SUM(cantidad), 0) AS unidades_vendidas
    FROM ventas
    ${whereClause};
  `);

  const total = res?.total_general ?? 0;
  const transacciones = res?.num_transacciones ?? 0;

  return {
    total_general: total,
    total_pan: res?.total_pan ?? 0,
    total_encargos: res?.total_encargos ?? 0,
    num_transacciones: transacciones,
    unidades_vendidas: res?.unidades_vendidas ?? 0,
    ticket_promedio: transacciones > 0 ? Math.round(total / transacciones) : 0,
  };
}

async function queryRanking(
  db: SQLite.SQLiteDatabase,
  whereClause: string,
): Promise<ProductoRanking[]> {
  const extra = whereClause
    ? `AND ${whereClause.replace(/^WHERE\s+/i, "")}`
    : "";

  return db.getAllAsync<ProductoRanking>(`
    SELECT
      p.nombre,
      COALESCE(SUM(v.cantidad), 0) AS cantidad_vendida,
      COALESCE(SUM(v.total_venta), 0) AS ingreso_generado
    FROM ventas v
    JOIN productos p ON v.id_producto = p.id_producto
    WHERE p.id_producto != 9999
    ${extra}
    GROUP BY p.id_producto
    ORDER BY cantidad_vendida DESC, ingreso_generado DESC
    LIMIT 8;
  `);
}

async function queryVentasPorDia(
  db: SQLite.SQLiteDatabase,
  dias: number,
): Promise<VentaDiaria[]> {
  const rows = await db.getAllAsync<{ dia: string; total: number }>(`
    SELECT
      ${FECHA_LOCAL} AS dia,
      COALESCE(SUM(total_venta), 0) AS total
    FROM ventas
    WHERE ${FECHA_LOCAL} >= date(${HOY}, '-${dias - 1} days')
    GROUP BY dia
    ORDER BY dia ASC;
  `);

  const mapa = new Map(rows.map((r) => [r.dia, r.total]));
  const resultado: VentaDiaria[] = [];

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = fechaLocalIso(d);
    resultado.push({ dia: key, total: mapa.get(key) ?? 0 });
  }

  return resultado;
}

async function queryEncargos(db: SQLite.SQLiteDatabase): Promise<ResumenEncargos> {
  const res = await db.getFirstAsync<ResumenEncargos>(`
    SELECT
      COALESCE(SUM(CASE WHEN estado_pedido = 'PENDIENTE' THEN 1 ELSE 0 END), 0) AS pendientes,
      COALESCE(SUM(CASE WHEN estado_pedido = 'ENTREGADO' THEN 1 ELSE 0 END), 0) AS entregados,
      COALESCE(SUM(CASE WHEN estado_pedido = 'PENDIENTE' THEN (total - abono) ELSE 0 END), 0) AS valor_pendiente,
      COALESCE(SUM(CASE WHEN estado_pago = 'FIADO' AND estado_pedido = 'PENDIENTE' THEN 1 ELSE 0 END), 0) AS fiados_activos
    FROM encargos;
  `);

  return (
    res ?? {
      pendientes: 0,
      entregados: 0,
      valor_pendiente: 0,
      fiados_activos: 0,
    }
  );
}

async function queryDeudas(db: SQLite.SQLiteDatabase): Promise<ResumenDeudas> {
  const res = await db.getFirstAsync<ResumenDeudas>(`
    SELECT
      COALESCE(SUM(deuda_pendiente), 0) AS total_deuda,
      COALESCE(SUM(CASE WHEN deuda_pendiente > 0 THEN 1 ELSE 0 END), 0) AS clientes_con_deuda
    FROM clientes;
  `);

  return res ?? { total_deuda: 0, clientes_con_deuda: 0 };
}

export async function cargarReporteStats(
  db: SQLite.SQLiteDatabase,
  filtro: FiltroTiempo,
): Promise<ReporteStats> {
  const where = wherePeriodo(filtro);
  const whereAnterior = wherePeriodoAnterior(filtro);

  const [
    ventas,
    ventasPeriodoAnterior,
    ranking,
    ventasPorDia,
    encargos,
    deudas,
  ] = await Promise.all([
    queryResumenVentas(db, where),
    filtro !== "HISTORICO"
      ? queryResumenVentas(db, whereAnterior)
      : Promise.resolve({
          total_general: 0,
          total_pan: 0,
          total_encargos: 0,
          num_transacciones: 0,
          unidades_vendidas: 0,
          ticket_promedio: 0,
        }),
    queryRanking(db, where),
    queryVentasPorDia(db, 7),
    queryEncargos(db),
    queryDeudas(db),
  ]);

  return {
    ventas,
    ventasPeriodoAnterior,
    ranking,
    ventasPorDia,
    encargos,
    deudas,
  };
}

export function etiquetaFiltro(filtro: FiltroTiempo): string {
  switch (filtro) {
    case "DIARIO":
      return "Hoy";
    case "SEMANAL":
      return "Últimos 7 días";
    case "MENSUAL":
      return "Este mes";
    default:
      return "Histórico";
  }
}

export function etiquetaFiltroCorta(filtro: FiltroTiempo): string {
  switch (filtro) {
    case "DIARIO":
      return "Hoy";
    case "SEMANAL":
      return "7 días";
    case "MENSUAL":
      return "Mes";
    default:
      return "Todo";
  }
}

export function etiquetaComparacion(filtro: FiltroTiempo): string | null {
  switch (filtro) {
    case "DIARIO":
      return "vs ayer";
    case "SEMANAL":
      return "vs semana anterior";
    case "MENSUAL":
      return "vs mes anterior";
    default:
      return null;
  }
}

export function calcularTendencia(actual: number, anterior: number) {
  if (anterior === 0 && actual === 0) {
    return { texto: "Sin cambio", positiva: true, visible: false };
  }
  if (anterior === 0) {
    return { texto: "Nuevo", positiva: true, visible: true };
  }
  const pct = ((actual - anterior) / anterior) * 100;
  const signo = pct >= 0 ? "+" : "";
  return {
    texto: `${signo}${pct.toFixed(0)}%`,
    positiva: pct >= 0,
    visible: true,
  };
}

function fechaLocalIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatearDiaCorto(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const fecha = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  if (fecha.toDateString() === hoy.toDateString()) return "Hoy";
  if (fecha.toDateString() === ayer.toDateString()) return "Ayer";

  return fecha.toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
}

export function formatearMonto(monto: number): string {
  return `$${Math.round(monto).toLocaleString("es-CL")}`;
}
