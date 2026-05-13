import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // Expo incluye esta librería por defecto
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { setupDatabase } from "../../database";

export default function HomeScreen() {
  const [cargando, setCargando] = useState(true);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  useEffect(() => {
    const inicializar = async () => {
      try {
        const db = await setupDatabase();
        // Insertamos los datos solo si no existen para evitar errores de Foreign Key
        const productosCount = await db.getAllAsync('SELECT COUNT(*) as count FROM productos') as {count: number}[];
        if (productosCount[0].count === 0) {
          await db.execAsync(`
            INSERT INTO productos (nombre, precio_unitario) VALUES
            ('Hallulla Especial', 2000),
            ('Marraqueta Crujiente', 1800),
            ('Pan de Molde', 3500),
            ('Empanada de Pino', 2500),
            ('Empanada Queso', 2200),
            ('Dobladitas (6 u.)', 3000),
            ('Pan Amasado', 800),
            ('Queque Casero', 4500);
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

  // Estructuramos las opciones del menú en un arreglo para un código más limpio
  const menuOptions = [
    {
      id: "ventas",
      title: "Ventas",
      subtitle: "Registrar nueva",
      icon: "cart-outline",
      color: "#2563EB", // Azul profesional
      action: () => router.push("/ventas"),
    },
    {
      id: "pedidos",
      title: "Pedidos",
      subtitle: "Por entregar",
      icon: "clipboard-outline",
      color: "#38BDF8", // Celeste claro
      action: () => router.push('/(tabs)/encargos'),
    },
    {
      id: "recetas",
      title: "Recetas",
      subtitle: "Preparaciones",
      icon: "book-outline",
      color: "#FBBF24", // Amarillo cálido
      action: () =>
        Alert.alert("Recetas", "Funcionalidad pendiente - Navegar a recetas"),
    },
  ];

  const [firstOption, secondOption, thirdOption] = menuOptions;
  const goToProductos = () => router.push("/productos");

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            style={[styles.smallButton, { backgroundColor: theme.card }]}
            onPress={goToProductos}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ir a Productos"
          >
            {/* @ts-ignore - Tipado de Ionicons */}
            <Ionicons name="cube-outline" size={18} color={theme.tint} style={styles.smallButtonIcon} />
            <Text style={[styles.smallButtonText, { color: theme.tint }]}>Productos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Text style={styles.greeting} accessibilityRole="header">
            ¡Hola! 👋
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>Amasandería Familiar</Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>¿Qué haremos hoy?</Text>
        </View>

        {cargando ? (
          <ActivityIndicator size="large" color={theme.tint} />
        ) : (
          <View style={styles.gridContainer}>
            <View style={styles.row}>
              {[firstOption, secondOption].map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.card, styles.cardHalf, { backgroundColor: theme.card }]}
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
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{option.title}</Text>
                  <Text style={[styles.cardSubtitle, { color: theme.text }]}>{option.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              key={thirdOption.id}
              style={[styles.card, styles.cardFull, { backgroundColor: theme.card }]}
              onPress={thirdOption.action}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Ir a la sección de ${thirdOption.title}`}
              accessibilityHint={thirdOption.subtitle}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${thirdOption.color}15` },
                ]}
              >
                {/* @ts-ignore - Tipado de Ionicons */}
                <Ionicons name={thirdOption.icon} size={32} color={thirdOption.color} />
              </View>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{thirdOption.title}</Text>
              <Text style={[styles.cardSubtitle, { color: theme.text }]}>{thirdOption.subtitle}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC", // Fondo blanco frío y profesional
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 40 : 20,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 16,
  },
  headerSpacer: {
    flex: 1,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  smallButtonIcon: {
    marginRight: 8,
  },
  smallButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  header: {
    marginBottom: 24,
    marginTop: 8,
    alignItems: "center",
  },
  greeting: {
    fontSize: 18,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    textAlign: "center",
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
    // Sombras modernas y sutiles
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
  cardFull: {
    width: "100%",
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
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
});
