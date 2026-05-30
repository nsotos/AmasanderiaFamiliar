import React, { useCallback, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const STORAGE_KEY = "@amasanderia_recetas";

interface Receta {
  id: string;
  nombre: string;
  receta: string;
}

export default function RecetasScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [recetaSeleccionada, setRecetaSeleccionada] = useState<Receta | null>(null);

  // Formulario
  const [nombre, setNombre] = useState("");
  const [recetaTexto, setRecetaTexto] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // ── Cargar desde AsyncStorage ──────────────────────────────────────────────
  const cargarRecetas = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (json) setRecetas(JSON.parse(json));
    } catch (e) {
      console.error("Error cargando recetas:", e);
    }
  };

  const guardarRecetas = async (lista: Receta[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
      setRecetas(lista);
    } catch (e) {
      console.error("Error guardando recetas:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargarRecetas();
    }, [])
  );

  // ── Abrir modal nueva / editar ─────────────────────────────────────────────
  const abrirNueva = () => {
    setNombre("");
    setRecetaTexto("");
    setEditandoId(null);
    setModalVisible(true);
  };

  const abrirEditar = (receta: Receta) => {
    setNombre(receta.nombre);
    setRecetaTexto(receta.receta);
    setEditandoId(receta.id);
    setDetalleVisible(false);
    setModalVisible(true);
  };

  const abrirDetalle = (receta: Receta) => {
    setRecetaSeleccionada(receta);
    setDetalleVisible(true);
  };

  // ── Guardar receta ─────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Campo requerido", "El nombre de la receta no puede estar vacío.");
      return;
    }
    if (!recetaTexto.trim()) {
      Alert.alert("Campo requerido", "El texto de la receta no puede estar vacío.");
      return;
    }

    let nuevaLista: Receta[];
    if (editandoId) {
      nuevaLista = recetas.map((r) =>
        r.id === editandoId
          ? { ...r, nombre: nombre.trim(), receta: recetaTexto.trim() }
          : r
      );
    } else {
      const nueva: Receta = {
        id: Date.now().toString(),
        nombre: nombre.trim(),
        receta: recetaTexto.trim(),
      };
      nuevaLista = [nueva, ...recetas];
    }

    await guardarRecetas(nuevaLista);
    setModalVisible(false);
  };

  // ── Eliminar receta ────────────────────────────────────────────────────────
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
            const nuevaLista = recetas.filter((r) => r.id !== receta.id);
            await guardarRecetas(nuevaLista);
            setDetalleVisible(false);
          },
        },
      ]
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="book-outline" size={72} color={theme.border} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin recetas aún</Text>
      <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
        Toca el botón para agregar tu primera receta.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Cabecera + botón Nueva Receta */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            Recetas
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {recetas.length > 0
              ? `${recetas.length} receta${recetas.length !== 1 ? "s" : ""} guardadas`
              : "Tu libro de recetas"}
          </Text>

          {/* Botón Nueva Receta — debajo del título */}
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

        {/* Lista */}
        <FlatList
          data={recetas}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            recetas.length === 0 ? styles.listEmpty : styles.listContainer
          }
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => abrirDetalle(item)}
              onLongPress={() => handleEliminar(item)}
              delayLongPress={500}
              activeOpacity={0.75}
            >
              <View style={[styles.cardIcon, { backgroundColor: `${theme.tint}18` }]}>
                <Ionicons name="restaurant" size={22} color={theme.tint} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardNombre, { color: theme.text }]} numberOfLines={1}>
                  {item.nombre}
                </Text>
                <Text style={[styles.cardPreview, { color: theme.icon }]} numberOfLines={2}>
                  {item.receta}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.border} />
            </TouchableOpacity>
          )}
        />
      </View>

      {/* ══════════ MODAL DETALLE ══════════ */}
      <Modal
        visible={detalleVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDetalleVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetalleVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.sheetContainer, { backgroundColor: theme.card }]}>
            {/* Handle */}
            <View style={styles.handleBar}>
              <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            {/* Header detalle */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.text }]} numberOfLines={2}>
                {recetaSeleccionada?.nombre}
              </Text>
              <TouchableOpacity
                onPress={() => setDetalleVisible(false)}
                style={[styles.cerrarBtn, { backgroundColor: theme.background }]}
              >
                <Ionicons name="close" size={18} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {/* Texto receta */}
            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <Text style={[styles.recetaTexto, { color: theme.text }]}>
                {recetaSeleccionada?.receta}
              </Text>
            </ScrollView>

            {/* Acciones */}
            <View style={[styles.sheetFooter, { borderTopColor: theme.border }]}>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: `${theme.tint}18` }]}
                onPress={() => recetaSeleccionada && abrirEditar(recetaSeleccionada)}
              >
                <Ionicons name="pencil" size={18} color={theme.tint} />
                <Text style={[styles.sheetBtnText, { color: theme.tint }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetBtn, { backgroundColor: "#FEE2E2" }]}
                onPress={() => recetaSeleccionada && handleEliminar(recetaSeleccionada)}
              >
                <Ionicons name="trash" size={18} color="#EF4444" />
                <Text style={[styles.sheetBtnText, { color: "#EF4444" }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ══════════ MODAL FORMULARIO ══════════ */}
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
                <View style={[styles.formContainer, { backgroundColor: theme.card }]}>
                  {/* Handle */}
                  <View style={styles.handleBar}>
                    <View style={[styles.handle, { backgroundColor: theme.border }]} />
                  </View>

                  {/* Header form */}
                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: theme.text }]}>
                      {editandoId ? "Editar Receta" : "Nueva Receta"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalVisible(false)}
                      style={[styles.cerrarBtn, { backgroundColor: theme.background }]}
                    >
                      <Ionicons name="close" size={18} color={theme.icon} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.formBody}
                  >
                    {/* Campo: Nombre */}
                    <Text style={[styles.label, { color: theme.text }]}>Nombre</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                      ]}
                      value={nombre}
                      onChangeText={setNombre}
                      placeholder="Ej. Pan de mantequilla"
                      placeholderTextColor={theme.icon}
                      returnKeyType="next"
                    />

                    {/* Campo: Receta */}
                    <Text style={[styles.label, { color: theme.text }]}>Receta</Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputMultiline,
                        { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
                      ]}
                      value={recetaTexto}
                      onChangeText={setRecetaTexto}
                      placeholder="Ingredientes y preparación..."
                      placeholderTextColor={theme.icon}
                      multiline
                      textAlignVertical="top"
                    />

                    {/* Botón guardar */}
                    <TouchableOpacity
                      style={[styles.guardarBtn, { backgroundColor: theme.tint }]}
                      onPress={handleGuardar}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                      <Text style={styles.guardarBtnText}>
                        {editandoId ? "Guardar Cambios" : "Crear Receta"}
                      </Text>
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

  // Botón Nueva Receta
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
  nuevaRecetaBtnText: { color: "#FFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },

  listContainer: { paddingBottom: 24 },
  listEmpty: { flex: 1, justifyContent: "center" },

  // Tarjeta
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

  // (FAB removido — botón integrado en el header)

  // Estado vacío
  emptyContainer: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },

  // Modal overlay
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },

  // Bottom sheet detalle
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

  // Formulario
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
