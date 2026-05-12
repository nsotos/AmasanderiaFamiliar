import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
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
      `¿Estás seguro de eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`,
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
              // recargar lista
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Productos</Text>
      <Text style={styles.subtitle}>Lista de productos registrados</Text>
      {cargando ? (
        <ActivityIndicator size="large" color="#4CAF50" />
      ) : (
        <FlatList
          data={productos}
          keyExtractor={(item) => item.id_producto.toString()}
          renderItem={({ item }) => (
            <View style={styles.productItem}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.nombre}</Text>
                <Text style={styles.productPrice}>${item.precio_unitario}</Text>
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => handleEditarProducto(item)}
                >
                  <Text style={styles.editButtonText}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleEliminarProducto(item)}
                >
                  <Text style={styles.deleteButtonText}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={styles.productList}
        />
      )}
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAgregarProducto}
      >
        <Text style={styles.addButtonText}>Agregar producto</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5", padding: 20 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 20,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  productList: { paddingBottom: 20 },
  productItem: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 16,
    marginVertical: 8,
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  productPrice: { fontSize: 16, fontWeight: "bold", color: "#4CAF50" },
  editButton: {
    backgroundColor: "#1976D2",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  editButtonText: { color: "#FFF", fontSize: 14, fontWeight: "bold" },
  rowActions: { flexDirection: "row", gap: 8 },
  deleteButton: {
    backgroundColor: "#D32F2F",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteButtonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  addButton: {
    position: "absolute",
    right: 20,
    bottom: 30,
    backgroundColor: "#FF9800",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 4,
  },

  addButtonText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },
});
