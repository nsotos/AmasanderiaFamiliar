import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Device from "expo-device";
import { setupDatabase } from "../database";

export const HORAS_LIMITE_ALERTA = 4;
export const HORAS_NOTIFICACION = [4, 2] as const;

const STORAGE_NOTIFICACIONES = "encargo_notificaciones_ids";
const HORA_DEFAULT_SIN_HORA = 18;

export type AlertaEncargo = {
  id_encargo: number;
  cliente: string;
  fecha_entrega: string;
  total: number;
};

type MapaNotificaciones = Record<string, string[]>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Convierte fecha_entrega (YYYY-MM-DD o YYYY-MM-DD HH:MM:SS) a Date local. */
export function parsearFechaEntrega(
  fecha: string | null | undefined,
): Date | null {
  if (!fecha?.trim()) return null;

  const limpia = fecha.trim().replace(" ", "T");
  const soloFecha = limpia.length <= 10;

  if (soloFecha) {
    const [y, m, d] = limpia.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, HORA_DEFAULT_SIN_HORA, 0, 0, 0);
  }

  const parsed = new Date(limpia);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function msHastaEntrega(fechaEntrega: Date): number {
  return fechaEntrega.getTime() - Date.now();
}

export function estaProximoAVencer(
  fecha: string,
  horasLimite = HORAS_LIMITE_ALERTA,
): boolean {
  const fechaEntrega = parsearFechaEntrega(fecha);
  if (!fechaEntrega) return false;
  return msHastaEntrega(fechaEntrega) <= horasLimite * 60 * 60 * 1000;
}

export function formatearTiempoRestante(ms: number): string {
  if (ms <= 0) return "Vencido";

  const horas = Math.floor(ms / (1000 * 60 * 60));
  const minutos = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (horas > 0) return `${horas}h ${minutos}m`;
  return `${minutos} min`;
}

export function formatearHoraEntrega(fecha: string): string {
  const parsed = parsearFechaEntrega(fecha);
  if (!parsed) return "Sin hora";

  const tieneHora = fecha.trim().length > 10;
  if (!tieneHora) {
    return parsed.toLocaleTimeString("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return parsed.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearFechaHoraDB(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

async function leerMapaNotificaciones(): Promise<MapaNotificaciones> {
  const raw = await AsyncStorage.getItem(STORAGE_NOTIFICACIONES);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MapaNotificaciones;
  } catch {
    return {};
  }
}

async function guardarMapaNotificaciones(mapa: MapaNotificaciones): Promise<void> {
  await AsyncStorage.setItem(STORAGE_NOTIFICACIONES, JSON.stringify(mapa));
}

export async function solicitarPermisosNotificaciones(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("encargos", {
      name: "Encargos",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: actual } = await Notifications.getPermissionsAsync();
  if (actual === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function cancelarNotificacionesEncargo(
  idEncargo: number,
): Promise<void> {
  const mapa = await leerMapaNotificaciones();
  const clave = idEncargo.toString();
  const ids = mapa[clave] ?? [];

  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
  );

  delete mapa[clave];
  await guardarMapaNotificaciones(mapa);
}

export async function programarNotificacionesEncargo(
  idEncargo: number,
  cliente: string,
  fechaEntrega: string,
): Promise<void> {
  const tienePermiso = await solicitarPermisosNotificaciones();
  if (!tienePermiso) return;

  await cancelarNotificacionesEncargo(idEncargo);

  const fecha = parsearFechaEntrega(fechaEntrega);
  if (!fecha) return;

  const ahora = Date.now();
  const nuevosIds: string[] = [];

  for (const horas of HORAS_NOTIFICACION) {
    const momentoAviso = new Date(fecha.getTime() - horas * 60 * 60 * 1000);
    if (momentoAviso.getTime() <= ahora) continue;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Encargo próximo a vencer",
        body: `El pedido de ${cliente} se entrega en ${horas} horas.`,
        data: { id_encargo: idEncargo },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: momentoAviso,
        channelId: Platform.OS === "android" ? "encargos" : undefined,
      },
    });
    nuevosIds.push(id);
  }

  if (nuevosIds.length > 0) {
    const mapa = await leerMapaNotificaciones();
    mapa[idEncargo.toString()] = nuevosIds;
    await guardarMapaNotificaciones(mapa);
  }
}

export async function obtenerEncargosProximosAVencer(): Promise<AlertaEncargo[]> {
  const db = await setupDatabase();
  const resultado = await db.getAllAsync<AlertaEncargo>(`
    SELECT e.id_encargo, c.nombre as cliente,
           e.fecha_entrega, e.total
    FROM encargos e
    JOIN clientes c ON e.id_cliente = c.id_cliente
    WHERE e.estado_pedido = 'PENDIENTE'
    ORDER BY e.fecha_entrega ASC
  `);

  return resultado.filter((encargo) =>
    estaProximoAVencer(encargo.fecha_entrega),
  );
}

export async function sincronizarNotificacionesEncargos(): Promise<void> {
  const tienePermiso = await solicitarPermisosNotificaciones();
  if (!tienePermiso) return;

  const db = await setupDatabase();
  const encargos = await db.getAllAsync<{
    id_encargo: number;
    cliente: string;
    fecha_entrega: string;
  }>(`
    SELECT e.id_encargo, c.nombre as cliente, e.fecha_entrega
    FROM encargos e
    JOIN clientes c ON e.id_cliente = c.id_cliente
    WHERE e.estado_pedido = 'PENDIENTE'
  `);

  for (const encargo of encargos) {
    await programarNotificacionesEncargo(
      encargo.id_encargo,
      encargo.cliente,
      encargo.fecha_entrega,
    );
  }
}

export async function inicializarSistemaAlertas(): Promise<void> {
  await solicitarPermisosNotificaciones();
  await sincronizarNotificacionesEncargos();
}
