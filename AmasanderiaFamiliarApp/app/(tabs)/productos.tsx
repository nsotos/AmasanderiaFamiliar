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
import { setupDatabase } from "../../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

export default function ProductosScreen() {
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

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
          style: "destructive",
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

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="cube-outline" size={64} color={theme.border} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No hay productos
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
        Toca el botón inferior para comenzar a agregar productos a tu
        inventario.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            Productos
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            Gestiona tu inventario
          </Text>
        </View>

        {cargando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
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
              <View style={[styles.productCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.productInfo}>
                  <Text style={[styles.productName, { color: theme.text }]}>
                    {item.nombre}
                  </Text>
                  <Text style={[styles.productPrice, { color: theme.tint }]}>
                    ${item.precio_unitario}
                  </Text>
                </View>

                <View style={styles.actionsContainer}>
                  {/* Botón Editar */}
                  <TouchableOpacity
                    style={[styles.iconButton, { backgroundColor: `${theme.tint}18` }]}
                    onPress={() => handleEditarProducto(item)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Editar producto ${item.nombre}`}
                  >
                    <Ionicons name="pencil" size={20} color={theme.icon} />
                  </TouchableOpacity>

                  {/* Botón Eliminar */}
                  <TouchableOpacity
                    style={[styles.iconButton, styles.deleteIconContainer]}
                    onPress={() => handleEliminarProducto(item)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar producto ${item.nombre}`}
                  >
                    <Ionicons name="trash" size={20} color="#F87171" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}

        {/* Botón Flotante (Extended FAB) */}
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.tint }]}
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
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
  },
  productList: {
    paddingBottom: 100,
  },
  listEmpty: {
    flex: 1,
    justifyContent: "center",
  },
  productCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
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
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: "700",
  },
  actionsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteIconContainer: {
    backgroundColor: "#FEE2E2",
  },
  /* --- BOTÓN FLOTANTE (FAB) --- */
  fab: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 40 : 32,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: "#2563EB",
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
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
});
