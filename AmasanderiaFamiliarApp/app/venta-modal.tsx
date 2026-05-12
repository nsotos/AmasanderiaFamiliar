import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";

import { setupDatabase } from "../database";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

export default function VentaModalScreen() {
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [productoSeleccionado, setProductoSeleccionado] =
    useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [total, setTotal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  useEffect(() => {
    const cargarProductos = async () => {
      try {
        const db = await setupDatabase();
        const resultado = await db.getAllAsync("SELECT * FROM productos");
        setProductos(resultado as Producto[]);
      } catch (error) {
        console.error(error);
        Alert.alert("Error", "No se pudieron cargar los productos.");
      } finally {
        setCargando(false);
      }
    };
    cargarProductos();
  }, []);

  useEffect(() => {
    if (productoSeleccionado && cantidad) {
      const cant = parseFloat(cantidad);
      if (!isNaN(cant)) {
        const totalCalculado = cant * productoSeleccionado.precio_unitario;
        setTotal(totalCalculado.toString());
      } else {
        setTotal("");
      }
    } else {
      setTotal("");
    }
  }, [cantidad, productoSeleccionado]);

  // Funciones para sumar y restar cantidad
  const sumarCantidad = () => {
    const cantActual = parseFloat(cantidad || "0");
    if (!isNaN(cantActual)) {
      setCantidad((cantActual + 1).toString());
    }
  };

  const restarCantidad = () => {
    const cantActual = parseFloat(cantidad || "0");
    if (!isNaN(cantActual) && cantActual > 1) {
      setCantidad((cantActual - 1).toString());
    } else {
      setCantidad("0"); // Evita números negativos
    }
  };

  const handleGuardar = async () => {
    if (!productoSeleccionado) {
      Alert.alert("Validación", "Selecciona un producto.");
      return;
    }

    const cant = parseFloat(cantidad);
    const tot = parseFloat(total);

    if (isNaN(cant) || cant <= 0) {
      Alert.alert("Validación", "Ingresa una cantidad válida mayor a 0.");
      return;
    }

    if (isNaN(tot) || tot <= 0) {
      Alert.alert("Validación", "El total debe ser mayor a 0.");
      return;
    }

    setGuardando(true);
    try {
      const db = await setupDatabase();
      await db.runAsync(
        "INSERT INTO ventas (id_producto, cantidad, total_venta) VALUES (?, ?, ?)",
        [productoSeleccionado.id_producto, cant, tot],
      );
      Alert.alert("Éxito", "Venta registrada correctamente.");
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo guardar la venta.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <ThemedView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#10B981" />
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Nueva Venta
          </ThemedText>
          <ThemedText style={styles.description}>
            Selecciona un producto, ingresa la cantidad y confirma.
          </ThemedText>
        </View>

        <View style={styles.form}>
          {/* Selector de Producto */}
          <Text style={styles.label}>Producto</Text>
          <TouchableOpacity
            style={styles.inputContainer}
            activeOpacity={0.7}
            onPress={() => setMostrarSelector(true)}
          >
            <Text
              style={[
                styles.inputText,
                !productoSeleccionado && styles.placeholderText,
              ]}
            >
              {productoSeleccionado
                ? productoSeleccionado.nombre
                : "Selecciona un producto..."}
            </Text>
            <Text style={styles.chevron}>▼</Text>
          </TouchableOpacity>

          {/* Modal Selector */}
          <Modal
            visible={mostrarSelector}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setMostrarSelector(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.dragIndicatorContainer}>
                  <View style={styles.dragIndicator} />
                </View>

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Seleccionar Producto</Text>
                  <TouchableOpacity
                    onPress={() => setMostrarSelector(false)}
                    style={styles.closeButtonContainer}
                  >
                    <Text style={styles.closeButton}>✕</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  data={productos}
                  keyExtractor={(item) => item.id_producto.toString()}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContainer}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.productOption,
                        productoSeleccionado?.id_producto ===
                          item.id_producto && styles.productOptionSelected,
                      ]}
                      activeOpacity={0.7}
                      onPress={() => {
                        setProductoSeleccionado(item);
                        setMostrarSelector(false);
                      }}
                    >
                      <View>
                        <Text style={styles.productOptionName}>
                          {item.nombre}
                        </Text>
                        <Text style={styles.productOptionPrice}>
                          ${item.precio_unitario}
                        </Text>
                      </View>
                      {productoSeleccionado?.id_producto ===
                        item.id_producto && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </Modal>

          {/* Cantidad y Total */}
          <View style={styles.row}>
            {/* Campo Cantidad con Botones + y - */}
            <View style={styles.halfWidth}>
              <Text style={styles.label}>Cantidad</Text>
              <View style={[styles.inputContainer, styles.quantityContainer]}>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={restarCantidad}
                  activeOpacity={0.6}
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </TouchableOpacity>

                <TextInput
                  style={[styles.textInput, styles.qtyInput]}
                  value={cantidad}
                  onChangeText={setCantidad}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  textAlign="center"
                />

                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={sumarCantidad}
                  activeOpacity={0.6}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.halfWidth}>
              <Text style={styles.label}>Total ($)</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.textInput, styles.totalInput]}
                  value={total}
                  onChangeText={setTotal}
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  editable={false}
                />
              </View>
            </View>
          </View>

          {/* Botones Guardar/Cancelar */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                guardando && styles.saveButtonDisabled,
              ]}
              onPress={handleGuardar}
              disabled={guardando}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {guardando ? "Guardando..." : "Registrar Venta"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.back()}
              activeOpacity={0.6}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  centerAll: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: "#6B7280",
    lineHeight: 22,
  },
  form: {
    gap: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  halfWidth: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fffffffd",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
  },
  /* --- ESTILOS NUEVOS PARA CANTIDAD --- */
  quantityContainer: {
    paddingHorizontal: 4, // Menos padding para dar espacio a los botones
    justifyContent: "space-between",
  },
  qtyButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF", // Fondo blanco para que los botones resalten sobre el input gris
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyButtonText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 24,
  },
  qtyInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    paddingHorizontal: 8,
  },
  /* ------------------------------------ */
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
    height: "100%",
  },
  totalInput: {
    fontWeight: "700",
    color: "#10B981",
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: "#1F2937",
  },
  placeholderText: {
    color: "#9CA3AF",
  },
  chevron: {
    fontSize: 12,
    color: "#6B7280",
  },

  /* --- ESTILOS DEL MODAL --- */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  dragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeButtonContainer: {
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButton: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4B5563",
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  productOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  productOptionSelected: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    borderBottomWidth: 0,
  },
  productOptionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  productOptionPrice: {
    fontSize: 15,
    color: "#10B981",
    fontWeight: "700",
  },
  checkmark: {
    fontSize: 18,
    color: "#10B981",
    fontWeight: "bold",
  },

  /* --- BOTONES DE GUARDAR/CANCELAR --- */
  footer: {
    marginTop: 12,
    gap: 12,
  },
  saveButton: {
    backgroundColor: "#10B981",
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  cancelButton: {
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
  },
});
