import React, { useEffect, useState, ComponentProps } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { setupDatabase } from "../../database";
import { SyncIndicator } from "@/components/sync-indicator";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface MenuOption {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  action: () => void;
}
export default function HomeScreen() {
  const [cargando, setCargando] = useState(true);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  useEffect(() => {
    const inicializar = async () => {
      try {
        const db = await setupDatabase();
        const productosCount = (await db.getAllAsync(
          "SELECT COUNT(*) as count FROM productos",
        )) as { count: number }[];
        if (productosCount[0].count === 0) {
          // IDs fijos (1..8) para que los productos semilla sean idénticos en
          // todos los teléfonos y no se dupliquen al sincronizar con Firestore.
          // Los registros creados por el usuario usan IDs aleatorios (>= 1000).
          await db.execAsync(`
            INSERT INTO productos (id_producto, nombre, precio_unitario) VALUES
            (1, 'Hallulla Especial', 2000),
            (2, 'Marraqueta Crujiente', 1800),
            (3, 'Pan de Molde', 3500),
            (4, 'Empanada de Pino', 2500),
            (5, 'Empanada Queso', 2200),
            (6, 'Dobladitas (6 u.)', 3000),
            (7, 'Pan Amasado', 800),
            (8, 'Queque Casero', 4500);
          `);
        }
      } catch (error) {
        console.error("Error al conectar: ", error);
      } finally {
        setCargando(false);
      }
    };

    inicializar();
  }, []);

  // Estructuramos las 6 opciones del menú en orden lógico
  const menuOptions: MenuOption[] = [
    {
      id: "ventas",
      title: "Ventas",
      subtitle: "Registrar nueva",
      icon: "cart-outline",
      color: "#2563EB",
      action: () => router.push("/ventas"),
    },
    {
      id: "pedidos",
      title: "Pedidos",
      subtitle: "Por entregar",
      icon: "clipboard-outline",
      color: "#38BDF8", // Celeste
      action: () => router.push("/(tabs)/encargos"),
    },
    {
      id: "productos",
      title: "Productos",
      subtitle: "Inventario y precios",
      icon: "cube-outline",
      color: "#F43F5E", // Rosa/Rojo
      action: () => router.push("/productos"),
    },
    {
      id: "recetas",
      title: "Recetas",
      subtitle: "Preparaciones",
      icon: "book-outline",
      color: "#FBBF24", // Amarillo
      action: () => router.push("/(tabs)/recetas"),
    },
    {
      id: "vecinos",
      title: "Vecinos",
      subtitle: "Gestión y fiados",
      icon: "person",
      color: "#10B981", // Verde
      action: () => router.push("/(tabs)/vecinos"),
    },
    {
      id: "estadisticas",
      title: "Estadísticas",
      subtitle: "Resumen del negocio",
      icon: "stats-chart",
      color: "#8B5CF6", // Morado
      action: () => router.push("/(tabs)/stats"),
    },
  ];

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Cabecera Principal */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Amasandería Familiar
          </Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>
            ¿Qué haremos hoy?
          </Text>
          <SyncIndicator style={styles.syncIndicator} />
        </View>

        {cargando ? (
          <ActivityIndicator size="large" color={theme.tint} />
        ) : (
          <View style={styles.gridContainer}>
            {/* Primera fila: Ventas y Pedidos */}
            <View style={styles.row}>
              {[menuOptions[0], menuOptions[1]].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.card,
                    styles.cardHalf,
                    { backgroundColor: theme.card },
                  ]}
                  onPress={option.action}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: `${option.color}15` },
                    ]}
                  >
                    {/* @ts-ignore */}
                    <Ionicons
                      name={option.icon}
                      size={32}
                      color={option.color}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.text }]}>
                    {option.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Segunda fila: Productos y Recetas */}
            <View style={styles.row}>
              {[menuOptions[2], menuOptions[3]].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.card,
                    styles.cardHalf,
                    { backgroundColor: theme.card },
                  ]}
                  onPress={option.action}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: `${option.color}15` },
                    ]}
                  >
                    {/* @ts-ignore */}
                    <Ionicons
                      name={option.icon}
                      size={32}
                      color={option.color}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.text }]}>
                    {option.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tercera fila: Vecinos y Estadísticas */}
            <View style={styles.row}>
              {[menuOptions[4], menuOptions[5]].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.card,
                    styles.cardHalf,
                    { backgroundColor: theme.card },
                  ]}
                  onPress={option.action}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: `${option.color}15` },
                    ]}
                  >
                    {/* @ts-ignore */}
                    <Ionicons
                      name={option.icon}
                      size={32}
                      color={option.color}
                    />
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: theme.text }]}>
                    {option.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 40 : 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
    marginTop: 20,
    alignItems: "center",
  },
  syncIndicator: {
    marginTop: 16,
    alignSelf: "center",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#475569",
    textAlign: "center",
  },
  gridContainer: {
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16,
  },
  cardHalf: {
    width: "48%",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 6,
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
});
