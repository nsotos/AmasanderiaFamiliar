import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // Expo incluye esta librería por defecto

export default function HomeScreen() {
  const router = useRouter();

  // Estructuramos las opciones del menú en un arreglo para un código más limpio
  const menuOptions = [
    {
      id: "ventas",
      title: "Ventas",
      subtitle: "Registrar nueva",
      icon: "cart-outline",
      color: "#10B981", // Esmeralda (Principal)
      action: () => router.push("/ventas"),
    },
    {
      id: "productos",
      title: "Productos",
      subtitle: "Inventario",
      icon: "cube-outline",
      color: "#8B5CF6", // Púrpura
      action: () => router.push("/productos"),
    },
    {
      id: "pedidos",
      title: "Pedidos",
      subtitle: "Por entregar",
      icon: "clipboard-outline",
      color: "#3B82F6", // Azul
      action: () =>
        Alert.alert("Pedidos", "Funcionalidad pendiente - Navegar a pedidos"),
    },
    {
      id: "recetas",
      title: "Recetas",
      subtitle: "Preparaciones",
      icon: "book-outline",
      color: "#F59E0B", // Naranja
      action: () =>
        Alert.alert("Recetas", "Funcionalidad pendiente - Navegar a recetas"),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={styles.greeting} accessibilityRole="header">
            ¡Hola! 👋
          </Text>
          <Text style={styles.title}>Amasandería Familiar</Text>
          <Text style={styles.subtitle}>¿Qué haremos hoy?</Text>
        </View>

        {/* Cuadrícula de Botones (Dashboard) */}
        <View style={styles.gridContainer}>
          {menuOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.card}
              onPress={option.action}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Ir a la sección de ${option.title}`}
              accessibilityHint={option.subtitle}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${option.color}15` },
                ]}
              >
                {/* @ts-ignore - Tipado de Ionicons */}
                <Ionicons name={option.icon} size={32} color={option.color} />
              </View>
              <Text style={styles.cardTitle}>{option.title}</Text>
              <Text style={styles.cardSubtitle}>{option.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB", // Fondo muy claro, más moderno que #F5F5F5
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 40 : 20,
  },
  header: {
    marginBottom: 32,
    marginTop: 20,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#6B7280",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16, // Requiere React Native 0.71+, si usas uno más antiguo, usa márgenes en las tarjetas
  },
  card: {
    width: "47%", // Dos columnas con espacio en el medio
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    // Sombras modernas y sutiles
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#9CA3AF",
  },
});
