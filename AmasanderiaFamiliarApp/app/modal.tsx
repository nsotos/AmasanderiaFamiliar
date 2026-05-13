import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { setupDatabase } from "../database";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function ModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id_producto?: string;
    nombre?: string;
    precio_unitario?: string;
  }>();

  const isEditing =
    typeof params.id_producto === "string" && params.id_producto.length > 0;

  const [nombre, setNombre] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  useEffect(() => {
    if (typeof params.nombre === "string") setNombre(params.nombre);
    if (typeof params.precio_unitario === "string")
      setPrecioUnitario(params.precio_unitario);
  }, [params.nombre, params.precio_unitario]);

  const handleGuardar = async () => {
    const precio = Number(precioUnitario);
    if (!nombre.trim() || Number.isNaN(precio)) {
      Alert.alert(
        "Datos inválidos",
        "Revisa el nombre y el precio antes de guardar.",
      );
      return;
    }

    setGuardando(true);
    try {
      const db = await setupDatabase();
      if (isEditing) {
        const idProducto = Number(params.id_producto);
        await db.runAsync(
          "UPDATE productos SET nombre = ?, precio_unitario = ? WHERE id_producto = ?",
          [nombre.trim(), precio, idProducto],
        );
      } else {
        await db.runAsync(
          "INSERT INTO productos (nombre, precio_unitario) VALUES (?, ?)",
          [nombre.trim(), precio],
        );
      }
      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo guardar el producto.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            {isEditing ? "Editar Producto" : "Nuevo Producto"}
          </ThemedText>
          <ThemedText style={styles.description}>
            {isEditing
              ? "Modifica el nombre y el precio del producto seleccionado."
              : "Agrega un nuevo producto con nombre y precio para el inventario."}
          </ThemedText>
        </View>

        <View style={styles.form}>
          {/* Input: Nombre */}
          <View>
            <Text style={styles.label}>Nombre</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Ej. Manzanas"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          {/* Input: Precio unitario */}
          <View>
            <Text style={styles.label}>Precio unitario ($)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.textInput, styles.priceInput]}
                value={precioUnitario}
                onChangeText={setPrecioUnitario}
                placeholder="0.00"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* Botones */}
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
                {guardando
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar Cambios"
                    : "Crear Producto"}
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
    color: "#475569",
    lineHeight: 22,
  },
  form: {
    gap: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 56,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#0F172A",
    height: "100%",
  },
  priceInput: {
    fontWeight: "600",
    color: "#2563EB", // Azul profesional para los precios
  },
  footer: {
    marginTop: 12,
    gap: 12,
  },
  saveButton: {
    backgroundColor: "#2563EB",
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "rgba(37,99,235,0.25)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: "#CBD5E1",
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
    color: "#475569",
    fontSize: 16,
    fontWeight: "600",
  },
});
