import { useSyncExternalStore } from "react";

/**
 * Estado global y observable de la sincronización con la nube.
 *
 * `pendientes` = registros locales aún no subidos + borrados aún no propagados.
 * `sincronizando` = hay una subida en curso.
 *
 * Sirve para mostrar al usuario un indicador ("Todo respaldado" / "3 pendientes")
 * y así no perder datos por subidas silenciosas que fallan sin avisar.
 */
export interface EstadoSync {
  pendientes: number;
  sincronizando: boolean;
}

let estado: EstadoSync = { pendientes: 0, sincronizando: false };
const listeners = new Set<() => void>();

export function getEstadoSync(): EstadoSync {
  return estado;
}

export function setEstadoSync(parcial: Partial<EstadoSync>): void {
  const siguiente = { ...estado, ...parcial };
  // Evita re-renders innecesarios si nada cambió.
  if (
    siguiente.pendientes === estado.pendientes &&
    siguiente.sincronizando === estado.sincronizando
  ) {
    return;
  }
  estado = siguiente;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Hook para leer el estado de sincronización dentro de un componente. */
export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(subscribe, getEstadoSync, getEstadoSync);
}
