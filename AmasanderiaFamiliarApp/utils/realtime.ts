import {
  collection,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { db as firestore, authReady } from "../firebaseConfig";

/**
 * Suscribe a una colección de Firestore en tiempo real, pero SOLO después de
 * que la sesión anónima esté lista (`authReady`).
 *
 * Si se adjunta el listener antes del login, Firestore lo rechaza por permisos
 * y el listener muere en silencio: la data no llega hasta reiniciar la app
 * (el clásico "hay que entrar y salir para que cargue"). Aquí esperamos al
 * login y además registramos los errores en vez de tragárnoslos.
 *
 * Devuelve una función para cancelar la suscripción, segura aunque se llame
 * antes de que el login termine.
 */
export function suscribirColeccion(
  nombre: string,
  onData: (snap: QuerySnapshot<DocumentData>) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelado = false;

  authReady.then(() => {
    if (cancelado) return;
    unsub = onSnapshot(collection(firestore, nombre), onData, (error) =>
      console.warn(`[Firestore ${nombre}] error en listener:`, error),
    );
  });

  return () => {
    cancelado = true;
    if (unsub) unsub();
  };
}
