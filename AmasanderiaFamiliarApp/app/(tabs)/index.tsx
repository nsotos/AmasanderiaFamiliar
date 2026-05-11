import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  const handleButton1 = () => {
    router.push('/ventas');
  };

  const handleButton2 = () => {
    // Futuro: router.push('/pedidos');
    Alert.alert('Pedidos', 'Funcionalidad pendiente - Navegar a pedidos');
  };

  const handleButton3 = () => {
    // Futuro: router.push('/recetas');
    Alert.alert('Recetas', 'Funcionalidad pendiente - Navegar a recetas');
  };

  const handleButton4 = () => {
    router.push('/productos');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bienvenido a Amasandería Familiar</Text>
      <Text style={styles.subtitle}>¿Qué haremos hoy?</Text>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={handleButton1}>
          <Text style={styles.buttonText}>Ventas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleButton2}>
          <Text style={styles.buttonText}>Pedidos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleButton3}>
          <Text style={styles.buttonText}>Recetas</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.productButton} onPress={handleButton4}>
        <Text style={styles.productButtonText}>Productos</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  subtitle: { fontSize: 20, fontWeight: '500', color: '#666', marginBottom: 40, textAlign: 'center' },
  buttonContainer: { flex: 1, flexDirection: 'column', justifyContent: 'space-around', width: '100%', alignItems: 'center', paddingTop: 20, paddingBottom: 20 },
  button: { backgroundColor: '#4CAF50', paddingVertical: 50, paddingHorizontal: 40, borderRadius: 20, marginVertical: 10, width: '80%', justifyContent: 'center', alignItems: 'center' },
  productButton: { position: 'absolute', bottom: 10, right: 20, backgroundColor: '#FF9800', paddingVertical: 15, paddingHorizontal: 14, borderRadius: 16, elevation: 4 },
  productButtonText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});