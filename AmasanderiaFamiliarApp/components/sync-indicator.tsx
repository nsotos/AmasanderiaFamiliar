import React, { useCallback } from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useEstadoSync } from "@/utils/syncStatus";
import { refrescarPendientes, syncPendingToFirebase } from "@/utils/offlineSync";

const AMBAR = "#D97706"; // ámbar legible en ambos temas

/**
 * Muestra el estado del respaldo en la nube: "Todo respaldado",
 * "Respaldando…" o "N por respaldar". Al tocarlo, reintenta la subida.
 * Así el usuario sabe que sus datos están a salvo y nada se pierde en silencio.
 */
export function SyncIndicator({ style }: { style?: StyleProp<ViewStyle> }) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const { pendientes, sincronizando } = useEstadoSync();

  // Recuenta al entrar a la pantalla y cada pocos segundos mientras está
  // visible, para reflejar al instante ventas/encargos creados sin conexión
  // (aunque la subida a la nube esté esperando red).
  useFocusEffect(
    useCallback(() => {
      refrescarPendientes();
      const id = setInterval(refrescarPendientes, 5000);
      return () => clearInterval(id);
    }, []),
  );

  const hayPendientes = pendientes > 0;
  const color = sincronizando
    ? theme.icon
    : hayPendientes
      ? AMBAR
      : theme.success;
  const texto = sincronizando
    ? "Respaldando…"
    : hayPendientes
      ? `${pendientes} por respaldar`
      : "Todo respaldado";

  return (
    <TouchableOpacity
      style={[
        styles.contenedor,
        { backgroundColor: theme.card, borderColor: theme.border },
        style,
      ]}
      onPress={() => syncPendingToFirebase()}
      disabled={sincronizando}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={
        sincronizando
          ? "Respaldando datos en la nube"
          : hayPendientes
            ? `${pendientes} registros por respaldar. Toca para reintentar.`
            : "Todo respaldado en la nube"
      }
    >
      {sincronizando ? (
        <ActivityIndicator size="small" color={theme.tint} />
      ) : (
        <Ionicons
          name={hayPendientes ? "cloud-upload-outline" : "cloud-done-outline"}
          size={18}
          color={color}
        />
      )}
      <Text style={[styles.texto, { color }]}>{texto}</Text>
      {hayPendientes && !sincronizando && (
        <Ionicons name="refresh" size={16} color={theme.icon} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  texto: {
    fontSize: 14,
    fontWeight: "600",
  },
});
