import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// 1. Cargamos variables. Si no existen, usamos strings vacíos para evitar que Firebase
// lance un error fatal durante el arranque de la aplicación.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "faltan_credenciales",
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "faltan_credenciales",
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "faltan_credenciales",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "faltan_credenciales",
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "faltan_credenciales",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "faltan_credenciales",
};

// 2. Comprobamos si las variables reales fueron cargadas
const isConfigValid = process.env.EXPO_PUBLIC_FIREBASE_API_KEY !== undefined;

// 3. Inicializamos de forma segura y directa.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 4. Exportamos las instancias listas para usarse.
// Usamos initializeFirestore para permitir que Firebase maneje su caché interno
// cuando se pierda la conexión a internet.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});
export const auth = getAuth(app);

/**
 * Promesa que se resuelve cuando la sesión anónima está lista.
 *
 * Las reglas de Firestore exigen estar autenticado, y el login anónimo tarda
 * un instante en el arranque en frío. Si se hicieran lecturas o se adjuntaran
 * listeners antes de eso, Firestore los rechazaría por permisos y morirían en
 * silencio (la data nunca llegaría hasta reiniciar la app). Por eso toda
 * operación con la nube debe esperar a `authReady` primero.
 */
export const authReady: Promise<void> = !isConfigValid
  ? Promise.resolve()
  : new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(auth, (user) => {
        if (user) {
          unsub();
          resolve();
        }
      });
    });

// 5. Manejamos la seguridad y las alertas
if (!isConfigValid) {
  console.warn(
    "⚠️ [Firebase] Faltan variables de entorno EXPO_PUBLIC. La nube está desconectada.",
  );
} else {
  // Iniciar sesión anónimamente de forma automática por debajo
  signInAnonymously(auth)
    .then(() =>
      console.log("✅ [Firebase] Autenticado anónimamente de forma segura."),
    )
    .catch((error) =>
      console.error("⚠️ [Firebase] Error de auth anónima:", error),
    );
}
