import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// ─── IMPORTACIONES DE FIREBASE ───
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db as firestore } from "../firebaseConfig";
import { eliminarConSync } from "@/utils/deleteSync";
import { generarId } from "@/utils/ids";

export default function ProductoModal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id_producto?: string;
    nombre?: string;
    precio_unitario?: string;
  }>();

  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [nombre, setNombre] = useState(params.nombre || "");
  const [precio, setPrecio] = useState(params.precio_unitario || "");
  const [ingredientes, setIngredientes] = useState("");
  const [instrucciones, setInstrucciones] = useState("");
  const [esReceta, setEsReceta] = useState(false);
  const [guardando, setGuardando] = useState(false); // Estado para evitar doble toque

  // Cargar datos si estamos en modo edición
  useEffect(() => {
    if (params.id_producto) {
      const cargarDatosEdicion = async () => {
        try {
          const db = await setupDatabase();
          const checkReceta = await db.getFirstAsync<{
            ingredientes: string;
            instrucciones: string;
          }>("SELECT * FROM recetas WHERE id_producto = ?", [
            Number(params.id_producto),
          ]);

          if (checkReceta) {
            setEsReceta(true);
            setIngredientes(checkReceta.ingredientes || "");
            setInstrucciones(checkReceta.instrucciones || "");
          }
        } catch (error) {
          console.error("Error al cargar datos de edición:", error);
        }
      };
      cargarDatosEdicion();
    }
  }, [params.id_producto]);

  const handleGuardar = async () => {
    if (guardando) return; // Bloqueo anti doble-toque

    if (!nombre.trim() || !precio.trim()) {
      Alert.alert("Faltan datos", "El nombre y el precio son obligatorios.");
      return;
    }

    const valorPrecio = parseFloat(precio.replace(/\./g, "").replace(/,/g, ""));
    if (isNaN(valorPrecio) || valorPrecio <= 0) {
      Alert.alert("Error", "Ingresa un precio válido mayor a 0.");
      return;
    }

    setGuardando(true); // Iniciamos la carga

    try {
      const db = await setupDatabase();
      let idProductoFinal = Number(params.id_producto);

      if (params.id_producto) {
        // ─── MODO EDICIÓN ───
        await db.runAsync(
          "UPDATE productos SET nombre = ?, precio_unitario = ?, sincronizado = 0 WHERE id_producto = ?",
          [nombre.trim(), valorPrecio, idProductoFinal],
        );

        const teniaReceta = !!(await db.getFirstAsync(
          "SELECT 1 FROM recetas WHERE id_producto = ?",
          [idProductoFinal],
        ));

        if (esReceta) {
          if (teniaReceta) {
            await db.runAsync(
              "UPDATE recetas SET nombre = ?, ingredientes = ?, instrucciones = ?, sincronizado = 0 WHERE id_producto = ?",
              [
                nombre.trim(),
                ingredientes.trim(),
                instrucciones.trim(),
                idProductoFinal,
              ],
            );
          } else {
            await db.runAsync(
              "INSERT INTO recetas (id_receta, id_producto, nombre, ingredientes, instrucciones) VALUES (?, ?, ?, ?, ?)",
              [
                generarId(),
                idProductoFinal,
                nombre.trim(),
                ingredientes.trim(),
                instrucciones.trim(),
              ],
            );
          }
        } else if (teniaReceta) {
          // Solo borrar si realmente había receta: así editar un producto sin
          // receta cuenta como 1 cambio, no 2 (evita un borrado fantasma).
          await db.runAsync("DELETE FROM recetas WHERE id_producto = ?", [
            idProductoFinal,
          ]);
        }

        // Firestore Actualización
        updateDoc(
          doc(collection(firestore, "productos"), idProductoFinal.toString()),
          {
            nombre: nombre.trim(),
            precio_unitario: valorPrecio,
          },
        ).catch((firebaseError) => {
          console.warn("⚠️ Error en Firestore (Edición):", firebaseError);
        });

        if (esReceta) {
          setDoc(
            doc(collection(firestore, "recetas"), idProductoFinal.toString()),
            {
              id_producto: idProductoFinal,
              nombre: nombre.trim(),
              ingredientes: ingredientes.trim(),
              instrucciones: instrucciones.trim(),
            },
            { merge: true },
          ).catch(() => {});
        } else if (teniaReceta) {
          eliminarConSync(db, "recetas", idProductoFinal.toString());
        }
      } else {
        // ─── MODO CREACIÓN ───
        console.log("1. Guardando producto en SQLite...");
        idProductoFinal = generarId();
        await db.runAsync(
          "INSERT INTO productos (id_producto, nombre, precio_unitario) VALUES (?, ?, ?)",
          [idProductoFinal, nombre.trim(), valorPrecio],
        );
        console.log("2. ID generado localmente:", idProductoFinal);

        if (esReceta) {
          await db.runAsync(
            "INSERT INTO recetas (id_receta, id_producto, nombre, ingredientes, instrucciones) VALUES (?, ?, ?, ?, ?)",
            [
              generarId(),
              idProductoFinal,
              nombre.trim(),
              ingredientes.trim(),
              instrucciones.trim(),
            ],
          );
        }

        // Firestore Creación
        setDoc(
          doc(collection(firestore, "productos"), idProductoFinal.toString()),
          {
            id_producto: idProductoFinal,
            nombre: nombre.trim(),
            precio_unitario: valorPrecio,
          },
        ).catch((firebaseError) => {
          console.warn("⚠️ Error al subir producto a Firestore:", firebaseError);
        });

        if (esReceta) {
          setDoc(
            doc(collection(firestore, "recetas"), idProductoFinal.toString()),
            {
              id_producto: idProductoFinal,
              nombre: nombre.trim(),
              ingredientes: ingredientes.trim(),
              instrucciones: instrucciones.trim(),
            },
          ).catch(() => {});
        }
      }

      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo guardar el producto.");
      setGuardando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.closeButton, { backgroundColor: theme.card }]}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {params.id_producto ? "Editar" : "Nuevo"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>
                Nombre del producto
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Ej. Pan Amasado"
                placeholderTextColor={theme.icon}
                autoFocus={!params.id_producto}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: theme.text }]}>
                Precio Unitario ($)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                value={precio}
                onChangeText={setPrecio}
                placeholder="Ej. 1500"
                placeholderTextColor={theme.icon}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.switchContainer}>
              <View style={styles.switchTextContainer}>
                <Text style={[styles.switchTitle, { color: theme.text }]}>
                  Es una receta
                </Text>
                <Text style={[styles.switchSubtitle, { color: theme.icon }]}>
                  Guarda ingredientes y pasos de preparación
                </Text>
              </View>
              <Switch
                value={esReceta}
                onValueChange={setEsReceta}
                trackColor={{ false: theme.border, true: theme.tint }}
                thumbColor="#FFF"
              />
            </View>

            {esReceta && (
              <View style={styles.recetaContainer}>
                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Ingredientes
                  </Text>
                  <TextInput
                    style={[
                      styles.textArea,
                      {
                        backgroundColor: theme.background,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    value={ingredientes}
                    onChangeText={setIngredientes}
                    placeholder="Ej. 1kg Harina, 10g Levadura..."
                    placeholderTextColor={theme.icon}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>
                    Instrucciones
                  </Text>
                  <TextInput
                    style={[
                      styles.textArea,
                      {
                        backgroundColor: theme.background,
                        color: theme.text,
                        borderColor: theme.border,
                      },
                    ]}
                    value={instrucciones}
                    onChangeText={setInstrucciones}
                    placeholder="Ej. 1. Mezclar harina...\n2. Hornear a 180°C..."
                    placeholderTextColor={theme.icon}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: guardando ? theme.border : theme.tint },
            ]}
            onPress={handleGuardar}
            activeOpacity={0.8}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                <Text style={styles.saveButtonText}>Guardar</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 20,
  },
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    fontSize: 16,
    minHeight: 100,
  },
  switchContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    marginTop: 8,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  switchSubtitle: {
    fontSize: 13,
  },
  recetaContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    borderRadius: 20,
    gap: 12,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
