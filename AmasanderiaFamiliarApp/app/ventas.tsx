import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Platform,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../database";

interface Venta {
  id_venta: number;
  producto: string;
  cantidad: number;
  total_venta: number;
  fecha: string;
}

// Función auxiliar para formatear la fecha ajustando la zona horaria
const formatearFecha = (fechaString: string) => {
  if (!fechaString) return "Fecha desconocida";

  // 1. Reemplazamos el espacio por "T" y añadimos "Z" al final.
  // Esto convierte "2024-05-12 04:32:00" en "2024-05-12T04:32:00Z"
  // La "Z" le indica a JavaScript que esta hora es UTC.
  const fechaNormalizada = fechaString.replace(" ", "T") + "Z";
  const fecha = new Date(fechaNormalizada);

  if (isNaN(fecha.getTime())) return fechaString;

  const dia = fecha.getDate().toString().padStart(2, "0");
  const mes = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const anio = fecha.getFullYear();

  // Opcional: Formato 12 horas (AM/PM) en lugar de 24h para que diga "12:32 AM" en vez de "00:32"
  let horasNum = fecha.getHours();
  const ampm = horasNum >= 12 ? "PM" : "AM";
  horasNum = horasNum % 12;
  horasNum = horasNum ? horasNum : 12; // Si es 0, lo convierte a 12

  const horas = horasNum.toString().padStart(2, "0");
  const minutos = fecha.getMinutes().toString().padStart(2, "0");

  // Retorna formato: dd/mm/aaaa HH:MM AM/PM
  return `${dia}/${mes}/${anio} ${horas}:${minutos} ${ampm}`;
};

export default function VentasScreen() {
  const router = useRouter();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);

  const loadVentas = async (isRefresh = false) => {
    if (isRefresh) {
      setRefrescando(true);
    } else {
      setCargando(true);
    }

    try {
      const db = await setupDatabase();
      const resultado = await db.getAllAsync(
        `SELECT v.id_venta, p.nombre AS producto, v.cantidad, v.total_venta, v.fecha
         FROM ventas v
         LEFT JOIN productos p ON v.id_producto = p.id_producto
         ORDER BY v.fecha DESC`,
      );
      setVentas(resultado as Venta[]);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudieron cargar las ventas.");
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadVentas();
    }, []),
  );

  const handleNuevaVenta = () => {
    router.push("/venta-modal");
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>Sin ventas aún</Text>
      <Text style={styles.emptySubtitle}>
        Toca el botón inferior para registrar la primera venta del día.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title} accessibilityRole="header">
              Historial de Ventas
            </Text>
            <Text style={styles.subtitle}>Supervisa los ingresos</Text>
          </View>
        </View>

        {/* Lista de Ventas */}
        {cargando && !refrescando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <FlatList
            data={ventas}
            keyExtractor={(item) => item.id_venta.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              ventas.length === 0 ? styles.listEmpty : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refrescando}
                onRefresh={() => loadVentas(true)}
                colors={["#10B981"]}
                tintColor="#10B981"
              />
            }
            renderItem={({ item }) => (
              <View style={styles.saleCard}>
                <View style={styles.iconBox}>
                  <Ionicons name="cart" size={24} color="#10B981" />
                </View>

                <View style={styles.saleInfo}>
                  <Text style={styles.saleTitle} numberOfLines={1}>
                    {item.producto || "Producto desconocido"}
                  </Text>
                  {/* Aquí aplicamos la función formatearFecha */}
                  <Text style={styles.saleDate}>
                    {formatearFecha(item.fecha)}
                  </Text>
                </View>

                <View style={styles.saleAmounts}>
                  <Text style={styles.saleTotal}>${item.total_venta}</Text>
                  <Text style={styles.saleQuantity}>{item.cantidad} un.</Text>
                </View>
              </View>
            )}
          />
        )}

        {/* Botón Flotante (FAB) */}
        <TouchableOpacity
          style={styles.fab}
          onPress={handleNuevaVenta}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Registrar nueva venta"
        >
          <Ionicons name="add-circle" size={24} color="#FFF" />
          <Text style={styles.fabText}>Nueva Venta</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 20 : 10,
  },
  centerAll: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    fontWeight: "400",
  },

  listContainer: {
    paddingBottom: 100,
  },
  listEmpty: {
    flex: 1,
    justifyContent: "center",
  },
  saleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  saleInfo: {
    flex: 1,
    marginRight: 12,
  },
  saleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  saleDate: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  saleAmounts: {
    alignItems: "flex-end",
  },
  saleTotal: {
    fontSize: 17,
    fontWeight: "800",
    color: "#10B981",
    marginBottom: 2,
  },
  saleQuantity: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },

  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },

  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 32,
    right: 24,
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    gap: 8,
  },
  fabText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
