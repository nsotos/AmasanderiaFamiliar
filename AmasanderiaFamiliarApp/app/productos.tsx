import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../database";

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

export default function ProductosScreen() {
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const db = await setupDatabase();
      const resultado = await db.getAllAsync("SELECT * FROM productos");
      setProductos(resultado as Producto[]);
    } catch (error) {
      console.error(error);
    } finally {
      setCargando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargarProductos();
    }, []),
  );

  const handleAgregarProducto = () => {
    router.push("/modal");
  };

  const handleEditarProducto = (producto: Producto) => {
    router.push({
      pathname: "/modal",
      params: {
        id_producto: producto.id_producto.toString(),
        nombre: producto.nombre,
        precio_unitario: producto.precio_unitario.toString(),
      },
    });
  };

  const handleEliminarProducto = (producto: Producto) => {
    Alert.alert(
      "Eliminar producto",
      `¿Estás seguro de que deseas eliminar "${producto.nombre}"?\nEsta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive", // En iOS esto pone el texto en rojo automáticamente
          onPress: async () => {
            setCargando(true);
            try {
              const db = await setupDatabase();
              await db.runAsync("DELETE FROM productos WHERE id_producto = ?", [
                producto.id_producto,
              ]);
              await cargarProductos();
            } catch (error) {
              console.error(error);
              Alert.alert("Error", "No se pudo eliminar el producto.");
            } finally {
              setCargando(false);
            }
          },
        },
      ],
    );
  };

  // Componente para cuando no hay productos registrados
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cube-outline" size={64} color="#D1D5DB" />
      <Text style={styles.emptyTitle}>No hay productos</Text>
      <Text style={styles.emptySubtitle}>
        Toca el botón inferior para comenzar a agregar productos a tu
        inventario.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Productos
          </Text>
          <Text style={styles.subtitle}>Gestiona tu inventario</Text>
        </View>

        {cargando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <FlatList
            data={productos}
            keyExtractor={(item) => item.id_producto.toString()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              productos.length === 0 ? styles.listEmpty : styles.productList
            }
            ListEmptyComponent={renderEmptyState}
            renderItem={({ item }) => (
              <View style={styles.productCard}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{item.nombre}</Text>
                  <Text style={styles.productPrice}>
                    ${item.precio_unitario}
                  </Text>
                </View>

                <View style={styles.actionsContainer}>
                  {/* Botón Editar */}
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => handleEditarProducto(item)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar producto ${item.nombre}`}
                  >
                    <Ionicons name="pencil" size={20} color="#4B5563" />
                  </TouchableOpacity>

                  {/* Botón Eliminar */}
                  <TouchableOpacity
                    style={[styles.iconButton, styles.deleteIconContainer]}
                    onPress={() => handleEliminarProducto(item)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar producto ${item.nombre}`}
                  >
                    <Ionicons name="trash" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        {/* Botón Flotante (Extended FAB) */}
        <TouchableOpacity
          style={styles.fab}
          onPress={handleAgregarProducto}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Agregar nuevo producto"
        >
          <Ionicons name="add" size={24} color="#FFF" />
          <Text style={styles.fabText}>Nuevo Producto</Text>
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
    paddingTop: Platform.OS === "android" ? 40 : 20,
  },
  centerAll: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "400",
  },
  productList: {
    paddingBottom: 100, // Espacio para que el FAB no tape el último elemento
  },
  listEmpty: {
    flex: 1,
    justifyContent: "center",
  },
  productCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  productInfo: {
    flex: 1,
    paddingRight: 12,
  },
  productName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10B981", // Verde esmeralda para el precio
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F3F4F6", // Fondo gris claro
    justifyContent: "center",
    alignItems: "center",
  },
  deleteIconContainer: {
    backgroundColor: "#FEF2F2", // Fondo rojo muy claro
  },
  /* --- BOTÓN FLOTANTE (FAB) --- */
  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 32,
    right: 24,
    backgroundColor: "#10B981", // Verde principal
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999, // Bordes completamente redondeados (forma de píldora)
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
  /* --- ESTADO VACÍO --- */
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
});
