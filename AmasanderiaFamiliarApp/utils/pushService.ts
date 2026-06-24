/**
 * pushService.ts
 *
 * Obtiene el Expo Push Token del dispositivo y lo guarda en Firestore
 * en la colección `push_tokens`. La Cloud Function de Firebase lee estos
 * tokens para enviar notificaciones remotas en el momento correcto.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { collection, doc, setDoc } from "firebase/firestore";
import { db as firestore, authReady } from "../firebaseConfig";

const EAS_PROJECT_ID = "fb1f199e-5d20-47a7-aed2-47f7d3189ca3";

/**
 * Obtiene el push token del dispositivo y lo registra en Firestore.
 * Devuelve el token si tiene éxito, o null si no hay permisos / no es dispositivo.
 */
export async function registrarPushToken(): Promise<string | null> {
  // Las notificaciones solo funcionan en dispositivos físicos
  if (!Device.isDevice) {
    console.log("[Push] Saltando: ejecutando en emulador/simulador");
    return null;
  }

  try {
    // Solicitar permiso si no está concedido
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("[Push] Permiso de notificaciones denegado");
      return null;
    }

    // Canal Android (necesario para la prioridad HIGH)
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("encargos", {
        name: "Encargos",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // Obtener Expo Push Token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? EAS_PROJECT_ID;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Clave estable para este dispositivo
    const rawKey = `${Device.modelName ?? "device"}_${Platform.OS}`;
    const deviceKey = rawKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

    // Guardar / actualizar en Firestore (esperar sesión: las reglas la exigen)
    await authReady;
    await setDoc(doc(collection(firestore, "push_tokens"), deviceKey), {
      token,
      platform: Platform.OS,
      device: Device.modelName ?? "unknown",
      updatedAt: new Date().toISOString(),
    });

    console.log("✅ [Push] Token registrado en Firestore:", token);
    return token;
  } catch (e) {
    console.warn("⚠️ [Push] Error registrando token:", e);
    return null;
  }
}
