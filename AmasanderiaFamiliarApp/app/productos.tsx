import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { setupDatabase } from '../database';

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

export default function ProductosScreen() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const db = await setupDatabase();
      const resultado = await db.getAllAsync('SELECT * FROM productos');
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
    }, [])
  );

  const handleAgregarProducto = () => {
    // Aquí se debe implementar la lógica real para agregar un producto.
    Alert.alert('No implementado', 'La función de agregar producto aún no está disponible.');
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
              <Text style={styles.productName}>{item.nombre}</Text>
              <Text style={styles.productPrice}>${item.precio_unitario}</Text>
            </View>
          )}
          contentContainerStyle={styles.productList}
        />
      )}
      <TouchableOpacity style={styles.addButton} onPress={handleAgregarProducto}>
        <Text style={styles.addButtonText}>Agregar producto</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 20, textAlign: 'center' },
  subtitle: { fontSize: 18, fontWeight: '500', color: '#666', marginBottom: 20, textAlign: 'center' },
  productList: { paddingBottom: 20 },
  productItem: { backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginVertical: 8, elevation: 2 },
  productName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  productPrice: { fontSize: 16, fontWeight: 'bold', color: '#4CAF50' },
  addButton: { position: 'absolute', right: 20, bottom: 30, backgroundColor: '#FF9800', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 28, elevation: 4 },
  addButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});