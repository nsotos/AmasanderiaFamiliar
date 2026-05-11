import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { setupDatabase } from '../database';

interface Venta {
  id_venta: number;
  producto: string;
  cantidad: number;
  total_venta: number;
  fecha: string;
}

export default function VentasScreen() {
  const router = useRouter();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(false);

  const loadVentas = async () => {
    setCargando(true);
    try {
      const db = await setupDatabase();
      const resultado = await db.getAllAsync(
        `SELECT v.id_venta, p.nombre AS producto, v.cantidad, v.total_venta, v.fecha
         FROM ventas v
         LEFT JOIN productos p ON v.id_producto = p.id_producto
         ORDER BY v.fecha DESC`
      );
      setVentas(resultado as Venta[]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron cargar las ventas.');
    } finally {
      setCargando(false);
    }
  };

  const handleNuevaVenta = async () => {
    Alert.alert('No implementado', 'La función de nueva venta aún no está disponible.');
  };

  const handleVerVentas = async () => {
    await loadVentas();
  };

  useEffect(() => {
    loadVentas();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ventas</Text>
      <Text style={styles.subtitle}>Gestiona las ventas de la panadería</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleNuevaVenta}>
          <Text style={styles.buttonText}>Nueva Venta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleVerVentas}>
          <Text style={styles.buttonText}>Ver Ventas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listContainer}>
        {cargando ? (
          <ActivityIndicator size="large" color="#4CAF50" />
        ) : (
          <FlatList
            data={ventas}
            keyExtractor={(item) => item.id_venta.toString()}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>No hay ventas registradas aún.</Text>
            )}
            renderItem={({ item }) => (
              <View style={styles.saleItem}>
                <Text style={styles.saleTitle}>{item.producto || 'Producto desconocido'}</Text>
                <Text style={styles.saleText}>Cantidad: {item.cantidad}</Text>
                <Text style={styles.saleText}>Total: ${item.total_venta}</Text>
                <Text style={styles.saleDate}>{item.fecha}</Text>
              </View>
            )}
            contentContainerStyle={styles.productList}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 20, fontWeight: '500', color: '#666', marginBottom: 20, textAlign: 'center' },
  buttonContainer: { flexDirection: 'column', justifyContent: 'space-around', width: '100%', alignItems: 'center' },
  button: { backgroundColor: '#4CAF50', padding: 18, borderRadius: 10, marginVertical: 8, width: '80%', justifyContent: 'center', alignItems: 'center' },
  backButton: { backgroundColor: '#757575', padding: 18, borderRadius: 10, marginVertical: 8, width: '80%', justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  listContainer: { flex: 1, marginTop: 20 },
  productList: { paddingBottom: 20 },
  saleItem: { backgroundColor: '#FFF', borderRadius: 10, padding: 16, marginBottom: 12, elevation: 2 },
  saleTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  saleText: { fontSize: 16, marginBottom: 4 },
  saleDate: { fontSize: 14, color: '#666' },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center', marginTop: 20 }
});