import React, { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// Habilita la animación de expandir/colapsar en Android.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FiltrosColapsablesProps {
  /** Muestra un punto indicador cuando hay algún filtro aplicado. */
  hayFiltroActivo?: boolean;
  /** Texto corto que resume el filtro activo (visible al estar colapsado). */
  resumen?: string;
  /** Si el panel inicia abierto. Por defecto colapsado para ahorrar espacio. */
  inicialAbierto?: boolean;
  /** Etiqueta del botón. Por defecto "Filtros". */
  etiqueta?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Contenedor de filtros que se despliega u oculta con un botón, para reducir
 * el espacio que ocupan los filtros y mejorar la accesibilidad de la pantalla.
 */
export function FiltrosColapsables({
  hayFiltroActivo = false,
  resumen,
  inicialAbierto = false,
  etiqueta = "Filtros",
  children,
  style,
}: FiltrosColapsablesProps) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const [abierto, setAbierto] = useState(inicialAbierto);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAbierto((prev) => !prev);
  };

  return (
    <View style={style}>
      <TouchableOpacity
        style={[
          styles.toggle,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        onPress={toggle}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={abierto ? "Ocultar filtros" : "Mostrar filtros"}
      >
        <View style={styles.toggleIzq}>
          <Ionicons name="options-outline" size={20} color={theme.tint} />
          <Text style={[styles.toggleLabel, { color: theme.text }]}>
            {etiqueta}
          </Text>
          {hayFiltroActivo && (
            <View style={[styles.dot, { backgroundColor: theme.tint }]} />
          )}
          {!abierto && resumen ? (
            <Text
              style={[styles.resumen, { color: theme.icon }]}
              numberOfLines={1}
            >
              {resumen}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={abierto ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.icon}
        />
      </TouchableOpacity>

      {abierto && <View style={styles.contenido}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleIzq: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  resumen: {
    fontSize: 13,
    flexShrink: 1,
  },
  contenido: {
    marginTop: 12,
  },
});
