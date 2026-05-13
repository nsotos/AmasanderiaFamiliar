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
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

export default function VentaModalScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const totalCarrito = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnidades = carrito.reduce((sum, item) => sum + item.cantidad, 0);

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

  // Toca un producto → agrega 1 unidad al carrito
  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existe = prev.find(
        (item) => item.producto.id_producto === producto.id_producto
      );
      if (existe) {
        return prev.map((item) =>
          item.producto.id_producto === producto.id_producto
            ? {
                ...item,
                cantidad: item.cantidad + 1,
                subtotal: (item.cantidad + 1) * item.producto.precio_unitario,
              }
            : item
        );
      }
      return [
        ...prev,
        { producto, cantidad: 1, subtotal: producto.precio_unitario },
      ];
    });
  };

  const quitarDelCarrito = (id: number) => {
    setCarrito((prev) => {
      return prev
        .map((item) => {
          if (item.producto.id_producto === id) {
            const nuevaCantidad = item.cantidad - 1;
            if (nuevaCantidad <= 0) return null;
            return {
              ...item,
              cantidad: nuevaCantidad,
              subtotal: nuevaCantidad * item.producto.precio_unitario,
            };
          }
          return item;
        })
        .filter(Boolean) as ItemCarrito[];
    });
  };

  const cantidadEnCarrito = (id: number) => {
    return carrito.find((item) => item.producto.id_producto === id)?.cantidad ?? 0;
  };

  const handleConfirmar = async () => {
    if (carrito.length === 0) {
      Alert.alert("Carrito vacío", "Agrega al menos un producto.");
      return;
    }
    setGuardando(true);
    try {
      const db = await setupDatabase();
      // Generar grupo si hay 2 o más ítems distintos en el carrito
      const grupoVenta = carrito.length >= 2 ? `grupo_${Date.now()}` : null;
      for (const item of carrito) {
        await db.runAsync(
          "INSERT INTO ventas (id_producto, cantidad, total_venta, grupo_venta) VALUES (?, ?, ?, ?)",
          [item.producto.id_producto, item.cantidad, item.subtotal, grupoVenta]
        );
      }
      Alert.alert(
        "¡Venta registrada!",
        `${totalUnidades} unidad(es) — Total: $${totalCarrito.toLocaleString()}`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo guardar la venta.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <View style={[styles.container, styles.centerAll, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* Cabecera */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Nueva Venta</Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            Toca un producto para agregarlo
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.cancelBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
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
            <TouchableOpacity
              style={[
                styles.botonProducto,
                {
                  backgroundColor: enCarrito ? theme.tint : theme.card,
                  borderColor: enCarrito ? theme.tint : theme.border,
                },
              ]}
              onPress={() => agregarAlCarrito(item)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${item.nombre} al carrito`}
            >
              {/* Nombre y precio */}
              <View style={styles.productoInfo}>
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
                    { color: enCarrito ? "rgba(255,255,255,0.85)" : theme.tint },
                  ]}
                >
                  ${item.precio_unitario.toLocaleString()}
                </Text>
              </View>

              {/* Badge de cantidad + botón quitar */}
              <View style={styles.productoAcciones}>
                {enCarrito && (
                  <TouchableOpacity
                    style={styles.quitarBtn}
                    onPress={() => quitarDelCarrito(item.id_producto)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove-circle" size={28} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                )}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: enCarrito
                        ? "rgba(255,255,255,0.25)"
                        : `${theme.tint}18`,
                    },
                  ]}
                >
                  {enCarrito ? (
                    <Text style={[styles.badgeText, { color: "#FFF" }]}>{qty}</Text>
                  ) : (
                    <Ionicons name="add" size={22} color={theme.tint} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
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
              (guardando || carrito.length === 0) && styles.confirmarBtnDisabled,
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
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  productoInfo: {
    flex: 1,
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
  productoAcciones: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quitarBtn: {
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
