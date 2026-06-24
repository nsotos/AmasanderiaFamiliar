import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCarrito } from "@/hooks/useCarrito";
import type { Producto } from "@/hooks/useCarrito";
import {
  registrarVentaDesdeCarrito,
  syncVentasAFirebase,
} from "@/utils/ventasService";

export default function VentaModalScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [productos, setProductos] = useState<Producto[]>([]);
  const {
    carrito,
    totalCarrito,
    totalUnidades,
    agregarAlCarrito,
    quitarDelCarrito,
    eliminarDelCarrito,
    cantidadEnCarrito,
  } = useCarrito();
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarProductos = async () => {
      try {
        const db = await setupDatabase();
        const resultado = await db.getAllAsync(
          "SELECT * FROM productos WHERE id_producto != 9999 AND LOWER(nombre) NOT LIKE '%inactivo%' ORDER BY nombre ASC",
        );
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

  const handleConfirmar = async () => {
    if (carrito.length === 0) {
      Alert.alert("Carrito vacío", "Agrega al menos un producto.");
      return;
    }
    setGuardando(true);
    try {
      const db = await setupDatabase();
      const ventasInsertadas = await registrarVentaDesdeCarrito(db, carrito);

      // Sync: un documento por fila SQLite (id = id_venta) — no bloqueante
      syncVentasAFirebase(db, ventasInsertadas);

      Alert.alert(
        "¡Venta registrada!",
        `${totalUnidades} unidad(es) — Total: $${totalCarrito.toLocaleString()}`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Error",
        "No se pudo guardar la venta. Inténtalo nuevamente.",
      );
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View
        style={[
          styles.container,
          styles.centerAll,
          { backgroundColor: theme.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      {/* Cabecera */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Nueva Venta</Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            Toca un producto para agregarlo
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.cancelBtn,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={22} color={theme.icon} />
        </TouchableOpacity>
      </View>

      {/* Lista de productos — botones grandes */}
      <FlatList
        data={productos}
        keyExtractor={(item) => item.id_producto.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listaProductos}
        ListEmptyComponent={
          <View style={styles.centerAll}>
            <Ionicons name="cube-outline" size={60} color={theme.border} />
            <Text style={[styles.emptyText, { color: theme.icon }]}>
              No hay productos registrados
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const qty = cantidadEnCarrito(item.id_producto);
          const enCarrito = qty > 0;
          return (
            <View
              style={[
                styles.botonProducto,
                {
                  backgroundColor: enCarrito ? theme.tint : theme.card,
                  borderColor: enCarrito ? theme.tint : theme.border,
                },
              ]}
            >
              {/* Mitad izquierda — baja cantidad (o agrega si no está en carrito) */}
              <TouchableOpacity
                style={styles.mitadIzquierda}
                onPress={() =>
                  enCarrito
                    ? quitarDelCarrito(item.id_producto)
                    : agregarAlCarrito(item)
                }
                onLongPress={() => enCarrito && eliminarDelCarrito(item)}
                delayLongPress={500}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.productoNombre,
                    { color: enCarrito ? "#FFF" : theme.text },
                  ]}
                >
                  {item.nombre}
                </Text>
                <Text
                  style={[
                    styles.productoPrecio,
                    {
                      color: enCarrito ? "rgba(255,255,255,0.85)" : theme.tint,
                    },
                  ]}
                >
                  ${item.precio_unitario.toLocaleString()}
                </Text>
                {enCarrito && (
                  <Text style={styles.hintText}>mantén para vaciar</Text>
                )}
              </TouchableOpacity>

              {/* Divisor visual sutil cuando está en carrito */}
              {enCarrito && <View style={styles.divisor} />}

              {/* Mitad derecha — controles: − | cantidad | + */}
              <View style={styles.mitadDerecha}>
                {enCarrito ? (
                  <View style={styles.controlesCarrito}>
                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => quitarDelCarrito(item.id_producto)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="remove-circle"
                        size={30}
                        color="rgba(255,255,255,0.85)"
                      />
                    </TouchableOpacity>

                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: "rgba(255,255,255,0.25)" },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: "#FFF" }]}>
                        {qty}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.ctrlBtn}
                      onPress={() => agregarAlCarrito(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="add-circle"
                        size={30}
                        color="rgba(255,255,255,0.85)"
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.badge,
                      { backgroundColor: `${theme.tint}18` },
                    ]}
                    onPress={() => agregarAlCarrito(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={22} color={theme.tint} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Footer con carrito y botón confirmar */}
      <View
        style={[
          styles.footer,
          { backgroundColor: theme.card, borderTopColor: theme.border },
        ]}
      >
        <View style={styles.totalRow}>
          <View>
            <Text style={[styles.totalLabel, { color: theme.icon }]}>
              {totalUnidades} ítem{totalUnidades !== 1 ? "s" : ""} en el carrito
            </Text>
            <Text style={[styles.totalValue, { color: theme.tint }]}>
              ${totalCarrito.toLocaleString()}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.confirmarBtn,
              { backgroundColor: theme.tint },
              (guardando || carrito.length === 0) &&
                styles.confirmarBtnDisabled,
            ]}
            onPress={handleConfirmar}
            disabled={guardando || carrito.length === 0}
            activeOpacity={0.85}
          >
            {guardando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={26} color="#FFF" />
                <Text style={styles.confirmarBtnText}>Confirmar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centerAll: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 48 : 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  listaProductos: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 12,
    fontWeight: "500",
  },
  /* --- BOTONES DE PRODUCTO GRANDES --- */
  botonProducto: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  mitadIzquierda: {
    flex: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  mitadDerecha: {
    paddingVertical: 22,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  divisor: {
    width: 1,
    marginVertical: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  productoNombre: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  productoPrecio: {
    fontSize: 18,
    fontWeight: "700",
  },
  hintText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: 6,
    fontWeight: "500",
  },
  controlesCarrito: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ctrlBtn: {
    padding: 2,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 20,
    fontWeight: "800",
  },
  /* --- FOOTER --- */
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 10 : 14,
    borderTopWidth: 1,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  confirmarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmarBtnDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmarBtnText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
  },
});
