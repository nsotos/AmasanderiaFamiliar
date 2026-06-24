import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { sincronizarTodoConFirebase } from "@/utils/sync";
import { inicializarSistemaAlertas } from "@/utils/alertasService";
import { syncPendingToFirebase } from "@/utils/offlineSync";
import { registrarPushToken } from "@/utils/pushService";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Sincronización inicial al arrancar
    sincronizarTodoConFirebase();
    inicializarSistemaAlertas();

    // Registrar push token en Firestore (para notificaciones remotas)
    registrarPushToken();

    // Subir datos pendientes al arrancar
    syncPendingToFirebase();

    // Subir datos pendientes cada 30 segundos (mientras la app está abierta)
    const intervalo = setInterval(() => {
      syncPendingToFirebase();
    }, 30_000);

    // Subir datos pendientes cuando la app vuelve al frente (tras perder foco)
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          syncPendingToFirebase();
        }
        appState.current = nextState;
      },
    );

    return () => {
      clearInterval(intervalo);
      subscription.remove();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Producto" }}
        />
        <Stack.Screen
          name="modal-encargo"
          options={{ presentation: "modal", headerShown: false }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
