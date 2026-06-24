import { Tabs } from "expo-router";
import React from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: true, // Muestra los textos de la barra inferior
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,

        // 1. Ajustamos la altura y el padding para darle aire al texto
        tabBarStyle: {
          height: 70 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 10), // Garantiza un espacio mínimo abajo
          paddingTop: 8,
        },

        // 2. Forzamos el tamaño y grosor de la fuente
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color }) => (
            // 3. Reducimos el ícono de 32 a 28 para equilibrar el espacio con el texto
            <MaterialIcons size={28} name="home" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ventas"
        options={{
          title: "Ventas",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={28} name="point-of-sale" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="encargos"
        options={{
          title: "Encargos",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={28} name="event-note" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: "Alertas",
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={28} name="notifications" color={color} />
          ),
        }}
      />
      {/* ── Pestañas ocultas de la barra inferior ── */}
      {/* Siguen siendo accesibles desde los botones grandes del HomeScreen */}
      <Tabs.Screen
        name="productos"
        options={{
          href: null,
          title: "Productos",
        }}
      />
      <Tabs.Screen
        name="recetas"
        options={{
          href: null,
          title: "Recetas",
        }}
      />
      <Tabs.Screen
        name="vecinos"
        options={{
          href: null,
          title: "Vecinos",
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          href: null,
          title: "Estadísticas",
        }}
      />
    </Tabs>
  );
}
