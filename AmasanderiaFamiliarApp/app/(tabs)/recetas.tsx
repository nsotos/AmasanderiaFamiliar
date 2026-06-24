import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { setupDatabase } from "../../database";
import { db as firestore } from "../../firebaseConfig";
import { suscribirColeccion } from "@/utils/realtime";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { generarId } from "@/utils/ids";

const STORAGE_KEY = "@amasanderia_recetas";
const MIGRATION_KEY = "@amasanderia_recetas_migrated";

interface Receta {
  id_receta: number;
  id_producto: number | null;
  nombre: string;
  ingredientes: string;
  instrucciones: string;
}

interface RecetaLegacy {
  id: string;
  nombre: string;
  receta: string;
}

function textoReceta(receta: Receta): string {
  return [receta.ingredientes, receta.instrucciones].filter(Boolean).join("\n\n");
}

function firebaseDocId(receta: Receta): string {
  return receta.id_producto
    ? receta.id_producto.toString()
    : receta.id_receta.toString();
}

async function upsertRecetaDesdeFirestore(
  db: Awaited<ReturnType<typeof setupDatabase>>,
  data: Record<string, unknown>,
  docId: string,
) {
  const idProducto =
    typeof data.id_producto === "number" ? data.id_producto : null;
  const idReceta =
    typeof data.id_receta === "number"
      ? data.id_receta
      : idProducto
        ? null
        : Number(docId);

  if (!idReceta && !idProducto) return;

  const nombre = String(data.nombre ?? "");
  const ingredientes = String(data.ingredientes ?? "");
  const instrucciones = String(data.instrucciones ?? "");

  if (idReceta) {
    await db.runAsync(
      `INSERT OR REPLACE INTO recetas
        (id_receta, id_producto, nombre, ingredientes, instrucciones, sincronizado)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [idReceta, idProducto, nombre, ingredientes, instrucciones],
    );
    return;
  }

  const existente = await db.getFirstAsync<{ id_receta: number }>(
    "SELECT id_receta FROM recetas WHERE id_producto = ?",
    [idProducto],
  );

  if (existente) {
    await db.runAsync(
      `UPDATE recetas
       SET nombre = ?, ingredientes = ?, instrucciones = ?, sincronizado = 1
       WHERE id_producto = ?`,
      [nombre, ingredientes, instrucciones, idProducto],
    );
  } else {
    await db.runAsync(
      `INSERT INTO recetas (id_receta, id_producto, nombre, ingredientes, instrucciones, sincronizado)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [generarId(), idProducto, nombre, ingredientes, instrucciones],
    );
  }
}

async function syncRecetaAFirebase(receta: Receta) {
  const payload = {
    id_receta: receta.id_receta,
    id_producto: receta.id_producto,
    nombre: receta.nombre,
    ingredientes: receta.ingredientes,
    instrucciones: receta.instrucciones,
  };

  await setDoc(
    doc(collection(firestore, "recetas"), firebaseDocId(receta)),
    payload,
    { merge: true },
  );
}

export default function RecetasScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<Receta | null>(
    null,
  );
  const [guardando, setGuardando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [recetaTexto, setRecetaTexto] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const migrarDesdeAsyncStorage = async () => {
    const yaMigrado = await AsyncStorage.getItem(MIGRATION_KEY);
    if (yaMigrado) return;

    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) {
        await AsyncStorage.setItem(MIGRATION_KEY, "1");
        return;
      }

      const legacy = JSON.parse(json) as RecetaLegacy[];
      if (!Array.isArray(legacy) || legacy.length === 0) {
        await AsyncStorage.setItem(MIGRATION_KEY, "1");
        return;
      }

      const db = await setupDatabase();
      for (const item of legacy) {
        const idReceta = generarId();
        await db.runAsync(
          "INSERT INTO recetas (id_receta, nombre, ingredientes, instrucciones) VALUES (?, ?, ?, ?)",
          [idReceta, item.nombre, "", item.receta],
        );
        const receta: Receta = {
          id_receta: idReceta,
          id_producto: null,
          nombre: item.nombre,
          ingredientes: "",
          instrucciones: item.receta,
        };

        try {
          await syncRecetaAFirebase(receta);
        } catch (error) {
          console.warn("Error subiendo receta migrada a Firebase:", error);
        }
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.setItem(MIGRATION_KEY, "1");
      console.log("✅ Recetas migradas de AsyncStorage a SQLite/Firebase");
    } catch (error) {
      console.error("Error migrando recetas:", error);
    }
  };

  const cargarRecetas = async () => {
    try {
      await migrarDesdeAsyncStorage();
      const db = await setupDatabase();
      const resultado = await db.getAllAsync<Receta>(
        "SELECT * FROM recetas ORDER BY nombre ASC",
      );
      setRecetas(resultado);
    } catch (e) {
      console.error("Error cargando recetas:", e);
    }
  };

  useEffect(() => {
    return suscribirColeccion("recetas", async (snapshot) => {
      try {
        const db = await setupDatabase();

        for (const documento of snapshot.docs) {
          // Escritura local aún no confirmada por el servidor: no marcar como
          // respaldada (ya está en SQLite como pendiente).
          if (documento.metadata.hasPendingWrites) continue;
          await upsertRecetaDesdeFirestore(db, documento.data(), documento.id);
        }

        cargarRecetas();
        console.log("🔄 Sincronización automática de recetas completada");
      } catch (error) {
        console.error("Error sincronizando recetas:", error);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarRecetas();
    }, []),
  );

  const abrirNueva = () => {
    setNombre("");
    setRecetaTexto("");
    setEditandoId(null);
    setModalVisible(true);
  };

  const abrirEditar = (receta: Receta) => {
    setNombre(receta.nombre);
    setRecetaTexto(textoReceta(receta));
    setEditandoId(receta.id_receta);
    setDetalleVisible(false);
    setModalVisible(true);
  };

  const abrirDetalle = (receta: Receta) => {
    setRecetaSeleccionada(receta);
    setDetalleVisible(true);
  };

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      Alert.alert(
        "Campo requerido",
        "El nombre de la receta no puede estar vacío.",
      );
      return;
    }
    if (!recetaTexto.trim()) {
      Alert.alert(
        "Campo requerido",
        "El texto de la receta no puede estar vacío.",
      );
      return;
    }

    setGuardando(true);
    try {
      const db = await setupDatabase();
      const nombreFinal = nombre.trim();
      const instruccionesFinal = recetaTexto.trim();

      if (editandoId) {
        const actual = recetas.find((r) => r.id_receta === editandoId);
        await db.runAsync(
          `UPDATE recetas
           SET nombre = ?, ingredientes = ?, instrucciones = ?
           WHERE id_receta = ?`,
          [nombreFinal, "", instruccionesFinal, editandoId],
        );

        const recetaActualizada: Receta = {
          id_receta: editandoId,
          id_producto: actual?.id_producto ?? null,
          nombre: nombreFinal,
          ingredientes: "",
          instrucciones: instruccionesFinal,
        };

        syncRecetaAFirebase(recetaActualizada).catch((error) => {
          console.warn("⚠️ Receta guardada localmente, error en nube:", error);
        });
      } else {
        const idReceta = generarId();
        await db.runAsync(
          "INSERT INTO recetas (id_receta, nombre, ingredientes, instrucciones) VALUES (?, ?, ?, ?)",
          [idReceta, nombreFinal, "", instruccionesFinal],
        );

        const nuevaReceta: Receta = {
          id_receta: idReceta,
          id_producto: null,
          nombre: nombreFinal,
          ingredientes: "",
          instrucciones: instruccionesFinal,
        };

        syncRecetaAFirebase(nuevaReceta).catch((error) => {
          console.warn("⚠️ Receta creada localmente, error en nube:", error);
        });
      }

      setModalVisible(false);
      await cargarRecetas();
    } catch (error) {
      console.error("Error guardando receta:", error);
      Alert.alert("Error", "No se pudo guardar la receta.");
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = (receta: Receta) => {
    Alert.alert(
      "Eliminar receta",
      `¿Eliminar "${receta.nombre}"? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await setupDatabase();
              await db.runAsync("DELETE FROM recetas WHERE id_receta = ?", [
                receta.id_receta,
              ]);

              try {
                await deleteDoc(
                  doc(firestore, "recetas", firebaseDocId(receta)),
                );
              } catch (error) {
                console.warn(
                  "⚠️ Receta eliminada localmente, error en nube:",
                  error,
                );
              }

              setDetalleVisible(false);
              await cargarRecetas();
            } catch (error) {
              console.error("Error eliminando receta:", error);
              Alert.alert("Error", "No se pudo eliminar la receta.");
            }
          },
        },
      ],
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="book-outline" size={72} color={theme.border} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        Sin recetas aún
      </Text>
      <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
        Toca el botón para agregar tu primera receta.
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text
            style={[styles.title, { color: theme.text }]}
            accessibilityRole="header"
          >
            Recetas
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {recetas.length > 0
              ? `${recetas.length} receta${recetas.length !== 1 ? "s" : ""} guardadas`
              : "Tu libro de recetas"}
          </Text>

          <TouchableOpacity
            style={[styles.nuevaRecetaBtn, { backgroundColor: theme.tint }]}
            onPress={abrirNueva}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Agregar nueva receta"
          >
            <Ionicons name="add-circle" size={48} color="#FFF" />
            <Text style={styles.nuevaRecetaBtnText}>Nueva Receta</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={recetas}
          keyExtractor={(item) => item.id_receta.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            recetas.length === 0 ? styles.listEmpty : styles.listContainer
          }
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
              onPress={() => abrirDetalle(item)}
              onLongPress={() => handleEliminar(item)}
              delayLongPress={500}
              activeOpacity={0.75}
            >
              <View
                style={[
                  styles.cardIcon,
                  { backgroundColor: `${theme.tint}18` },
                ]}
              >
                <Ionicons name="restaurant" size={22} color={theme.tint} />
              </View>
              <View style={styles.cardInfo}>
                <Text
                  style={[styles.cardNombre, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.nombre}
                </Text>
                <Text
                  style={[styles.cardPreview, { color: theme.icon }]}
                  numberOfLines={2}
                >
                  {textoReceta(item)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.border} />
            </TouchableOpacity>
          )}
        />
      </View>

      <Modal
        visible={detalleVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetalleVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetalleVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View
                style={[styles.sheetContainer, { backgroundColor: theme.card }]}
              >
                <View style={styles.handleBar}>
                  <View
                    style={[styles.handle, { backgroundColor: theme.border }]}
                  />
                </View>

                <View style={styles.sheetHeader}>
                  <Text
                    style={[styles.sheetTitle, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {recetaSeleccionada?.nombre}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDetalleVisible(false)}
                    style={[
                      styles.cerrarBtn,
                      { backgroundColor: theme.background },
                    ]}
                  >
                    <Ionicons name="close" size={18} color={theme.icon} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.sheetScroll}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <Text style={[styles.recetaTexto, { color: theme.text }]}>
                    {recetaSeleccionada ? textoReceta(recetaSeleccionada) : ""}
                  </Text>
                </ScrollView>

                <View
                  style={[styles.sheetFooter, { borderTopColor: theme.border }]}
                >
                  <TouchableOpacity
                    style={[
                      styles.sheetBtn,
                      { backgroundColor: `${theme.tint}18` },
                    ]}
                    onPress={() =>
                      recetaSeleccionada && abrirEditar(recetaSeleccionada)
                    }
                  >
                    <Ionicons name="pencil" size={18} color={theme.tint} />
                    <Text style={[styles.sheetBtnText, { color: theme.tint }]}>
                      Editar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sheetBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() =>
                      recetaSeleccionada && handleEliminar(recetaSeleccionada)
                    }
                  >
                    <Ionicons name="trash" size={18} color="#EF4444" />
                    <Text style={[styles.sheetBtnText, { color: "#EF4444" }]}>
                      Eliminar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.formContainer,
                    { backgroundColor: theme.card },
                  ]}
                >
                  <View style={styles.handleBar}>
                    <View
                      style={[styles.handle, { backgroundColor: theme.border }]}
                    />
                  </View>

                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: theme.text }]}>
                      {editandoId ? "Editar Receta" : "Nueva Receta"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalVisible(false)}
                      style={[
                        styles.cerrarBtn,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Ionicons name="close" size={18} color={theme.icon} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.formBody}
                  >
                    <Text style={[styles.label, { color: theme.text }]}>
                      Nombre
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
                      placeholder="Ej. Pan de mantequilla"
                      placeholderTextColor={theme.icon}
                      returnKeyType="next"
                    />

                    <Text style={[styles.label, { color: theme.text }]}>
                      Receta
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputMultiline,
                        {
                          backgroundColor: theme.background,
                          color: theme.text,
                          borderColor: theme.border,
                        },
                      ]}
                      value={recetaTexto}
                      onChangeText={setRecetaTexto}
                      placeholder="Ingredientes y preparación..."
                      placeholderTextColor={theme.icon}
                      multiline
                      textAlignVertical="top"
                    />

                    <TouchableOpacity
                      style={[
                        styles.guardarBtn,
                        {
                          backgroundColor: guardando
                            ? theme.border
                            : theme.tint,
                        },
                      ]}
                      onPress={handleGuardar}
                      activeOpacity={0.85}
                      disabled={guardando}
                    >
                      {guardando ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-circle"
                            size={22}
                            color="#FFF"
                          />
                          <Text style={styles.guardarBtnText}>
                            {editandoId ? "Guardar Cambios" : "Crear Receta"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 40 : 20,
  },
  header: { marginBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: { fontSize: 16, fontWeight: "400", marginBottom: 20 },
  nuevaRecetaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  nuevaRecetaBtnText: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  listContainer: { paddingBottom: 24 },
  listEmpty: { flex: 1, justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardInfo: { flex: 1, marginRight: 8 },
  cardNombre: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  cardPreview: { fontSize: 13, lineHeight: 18 },
  emptyContainer: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handleBar: { alignItems: "center", paddingVertical: 12 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", flex: 1, marginRight: 12 },
  cerrarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetScroll: { paddingHorizontal: 24 },
  recetaTexto: { fontSize: 16, lineHeight: 26 },
  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    borderTopWidth: 1,
  },
  sheetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  sheetBtnText: { fontSize: 15, fontWeight: "700" },
  formContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  formBody: { paddingHorizontal: 24, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8, marginLeft: 4 },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  inputMultiline: {
    height: 180,
    paddingTop: 14,
  },
  guardarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    marginTop: 4,
  },
  guardarBtnText: { color: "#FFF", fontSize: 18, fontWeight: "800" },
});
