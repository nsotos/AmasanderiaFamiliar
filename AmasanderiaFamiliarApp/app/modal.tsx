import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { setupDatabase } from "../database";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

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
    <ThemedView style={styles.container}>
      <ThemedText type="title">
        {isEditing ? "Editar producto" : "Crear producto"}
      </ThemedText>
      <ThemedText style={styles.description}>
        {isEditing
          ? "Modifica el nombre y el precio del producto seleccionado."
          : "Agrega un nuevo producto con nombre y precio."}
      </ThemedText>

      <View style={styles.form}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Nombre del producto"
        />

        <Text style={styles.label}>Precio unitario</Text>
        <TextInput
          style={styles.input}
          value={precioUnitario}
          onChangeText={setPrecioUnitario}
          placeholder="0"
          keyboardType="numeric"
        />

        <TouchableOpacity
          style={[styles.saveButton, guardando && styles.saveButtonDisabled]}
          onPress={handleGuardar}
          disabled={guardando}
        >
          <Text style={styles.saveButtonText}>
            {guardando
              ? "Guardando..."
              : isEditing
                ? "Guardar cambios"
                : "Crear producto"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  description: {
    marginTop: 10,
    marginBottom: 24,
    textAlign: "center",
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
});
