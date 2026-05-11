import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, FlatList } from 'react-native';
import { setupDatabase } from '../../database';

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
} 

export default function HomeScreen() {
  const [mensaje, setMensaje] = useState('Inicializando...');
  const [cargando, setCargando] = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);

  useEffect(() => {
    // Función asíncrona para manejar la carga
    const inicializar = async () => {
      try {
        // 1. Ejecutamos la creación de tablas y obtenemos la db
        const db = await setupDatabase();

        // 2. Insertamos los datos usando execAsync (que es más robusto)
        await db.execAsync(`
          DELETE FROM productos;
          INSERT INTO productos (nombre, precio_unitario) VALUES 
          ('Hallulla Especial', 2000),
          ('Marraqueta Crujiente', 1800),
          ('Pan de Molde Artesanal', 3500),
          ('Empanada de Pino', 2500),
          ('Empanada Queso', 2200),
          ('Dobladitas (6 unidades)', 3000),
          ('Pan Amasado con Chicharrón', 800),
          ('Queque Casero Vainilla', 4500),
          ('Brazo de Reina', 6000),
          ('Pan Integral con Semillas', 3800);
        `);

        // 3. Consultamos los productos
        const productosData = await db.getAllAsync('SELECT * FROM productos') as Producto[];
        setProductos(productosData);

        setMensaje(`¡Conexión Exitosa!\n${productosData.length} Productos listos.`);
      } catch (error) {
        console.error(error);
        setMensaje("Error al conectar: " + (error as Error).message);
      } finally {
        setCargando(false);
      }
    };

    inicializar();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🍞 Amasandería Familiar</Text>
      <View style={styles.card}>
        {cargando ? (
          <ActivityIndicator size="large" color="#4CAF50" />
        ) : (
          <>
            <Text style={styles.statusText}>{mensaje}</Text>
            <FlatList
              data={productos}
              keyExtractor={(item) => item.id_producto.toString()}
              renderItem={({ item }) => (
                <View style={styles.productItem}>
                  <Text style={styles.productName}>{item.nombre}</Text>
                  <Text style={styles.productPrice}>${item.precio_unitario}</Text>
                </View>
              )}
              style={styles.productList}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 20 },
  card: { backgroundColor: '#FFF', padding: 30, borderRadius: 20, width: '100%', alignItems: 'center', elevation: 5 },
  statusText: { fontSize: 18, fontWeight: '600', color: '#2E7D32', textAlign: 'center', marginBottom: 20 },
  productList: { width: '100%' },
  productItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  productName: { fontSize: 16, fontWeight: '500' },
  productPrice: { fontSize: 16, fontWeight: 'bold', color: '#4CAF50' }
});