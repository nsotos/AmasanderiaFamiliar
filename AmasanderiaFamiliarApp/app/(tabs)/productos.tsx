import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Platform,
  TextInput,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../../database";
import { Colors } from "@/constants/theme";
import { TextoDesplazable } from "@/components/texto-desplazable";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { doc, updateDoc } from "firebase/firestore";
import { db as firestore } from "../../firebaseConfig";
import { eliminarConSync, getPendingDeletionIds } from "@/utils/deleteSync";
import { suscribirColeccion } from "@/utils/realtime";
import { FiltrosColapsables } from "@/components/filtros-colapsables";

interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
  tiene_receta: number;
  num_ventas: number;
}

type FiltroProducto = "TODOS" | "RECETAS" | "INACTIVOS";
type OrdenProducto = "NOMBRE" | "PRECIO_ASC" | "PRECIO_DESC";

const FILTROS: { id: FiltroProducto; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "RECETAS", label: "Con receta" },
  { id: "INACTIVOS", label: "Inactivos" },
];

const ORDENES: { id: OrdenProducto; label: string }[] = [
  { id: "NOMBRE", label: "Nombre" },
  { id: "PRECIO_ASC", label: "Menor $" },
  { id: "PRECIO_DESC", label: "Mayor $" },
];

const esInactivo = (nombre: string) => /inactivo/i.test(nombre);

const nombreInactivo = (nombre: string) =>
  esInactivo(nombre) ? nombre : `${nombre} (Inactivo)`;

const nombreActivo = (nombre: string) =>
  nombre.replace(/\s*\(inactivo\)\s*$/i, "").trim();

const formatearPrecio = (precio: number) =>
  `$${precio.toLocaleString("es-CL")}`;

export default function ProductosScreen() {
  const router = useRouter();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroProducto>("TODOS");
  const [orden, setOrden] = useState<OrdenProducto>("NOMBRE");

  const haCargadoRef = useRef(false);
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const cargarProductos = useCallback(async (silencioso = false) => {
    if (!haCargadoRef.current && !silencioso) {
      setCargando(true);
    }

    try {
      const db = await setupDatabase();
      const resultado = await db.getAllAsync<Producto>(`
        SELECT
          p.id_producto,
          p.nombre,
          p.precio_unitario,
          MAX(CASE WHEN r.id_receta IS NOT NULL THEN 1 ELSE 0 END) AS tiene_receta,
          COUNT(DISTINCT v.id_venta) AS num_ventas
        FROM productos p
        LEFT JOIN recetas r ON r.id_producto = p.id_producto
        LEFT JOIN ventas v ON v.id_producto = p.id_producto
        WHERE p.id_producto != 9999
        GROUP BY p.id_producto, p.nombre, p.precio_unitario
        ORDER BY p.nombre ASC
      `);
      setProductos(resultado);
    } catch (error) {
      console.error(error);
    } finally {
      if (!haCargadoRef.current) {
        haCargadoRef.current = true;
        setCargando(false);
      }
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    return suscribirColeccion("productos", async (snapshot) => {
        try {
          const dbSQLite = await setupDatabase();
          const pendingDeletes = await getPendingDeletionIds(
            dbSQLite,
            "productos",
          );

          for (const documento of snapshot.docs) {
            if (pendingDeletes.has(documento.id)) continue;
            // Escritura local aún no confirmada por el servidor: no marcar como
            // respaldada (ya está en SQLite como pendiente).
            if (documento.metadata.hasPendingWrites) continue;
            const prod = documento.data();
            if (prod.id_producto === 9999) continue;

            await dbSQLite.runAsync(
              `INSERT OR REPLACE INTO productos (id_producto, nombre, precio_unitario, sincronizado)
               VALUES (?, ?, ?, 1)`,
              [
                prod.id_producto || prod.id,
                prod.nombre,
                prod.precio_unitario || prod.precio,
              ],
            );
          }

          cargarProductos(true);
        } catch (error) {
          console.error("Error sincronizando productos:", error);
        }
    });
  }, [cargarProductos]);

  useFocusEffect(
    useCallback(() => {
      cargarProductos(true);
    }, [cargarProductos]),
  );

  const productosVisibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    const filtrados = productos.filter((p) => {
      if (filtro === "RECETAS" && !p.tiene_receta) return false;
      if (filtro === "INACTIVOS" && !esInactivo(p.nombre)) return false;
      if (filtro === "TODOS" && esInactivo(p.nombre)) return false;

      if (!termino) return true;
      return p.nombre.toLowerCase().includes(termino);
    });

    const ordenados = [...filtrados];
    switch (orden) {
      case "PRECIO_ASC":
        ordenados.sort(
          (a, b) =>
            a.precio_unitario - b.precio_unitario ||
            a.nombre.localeCompare(b.nombre, "es"),
        );
        break;
      case "PRECIO_DESC":
        ordenados.sort(
          (a, b) =>
            b.precio_unitario - a.precio_unitario ||
            a.nombre.localeCompare(b.nombre, "es"),
        );
        break;
      default:
        ordenados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }

    return ordenados;
  }, [productos, busqueda, filtro, orden]);

  const hayFiltroActivo =
    busqueda.trim().length > 0 || filtro !== "TODOS" || orden !== "NOMBRE";

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltro("TODOS");
    setOrden("NOMBRE");
  };

  const onRefresh = () => {
    setRefrescando(true);
    cargarProductos(true);
  };

  const handleAgregarProducto = () => {
    router.push("/modal");
  };

  const handleEditarProducto = (producto: Producto) => {
    router.push({
      pathname: "/modal",
      params: {
        id_producto: producto.id_producto.toString(),
        nombre: producto.nombre,
        precio_unitario: producto.precio_unitario.toString(),
      },
    });
  };

  const desactivarProducto = async (producto: Producto) => {
    try {
      const db = await setupDatabase();
      const nuevoNombre = nombreInactivo(producto.nombre);

      await db.runAsync(
        "UPDATE productos SET nombre = ?, sincronizado = 0 WHERE id_producto = ?",
        [nuevoNombre, producto.id_producto],
      );

      if (producto.tiene_receta) {
        await db.runAsync(
          "UPDATE recetas SET nombre = ?, sincronizado = 0 WHERE id_producto = ?",
          [nuevoNombre, producto.id_producto],
        );
      }

      try {
        await updateDoc(
          doc(firestore, "productos", producto.id_producto.toString()),
          { nombre: nuevoNombre },
        );
        if (producto.tiene_receta) {
          await updateDoc(
            doc(firestore, "recetas", producto.id_producto.toString()),
            { nombre: nuevoNombre },
          ).catch(() => {});
        }
      } catch (firebaseError) {
        console.warn(
          "⚠️ Producto desactivado localmente, error en nube:",
          firebaseError,
        );
      }

      setProductos((prev) =>
        prev.map((p) =>
          p.id_producto === producto.id_producto
            ? { ...p, nombre: nuevoNombre }
            : p,
        ),
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo desactivar el producto.");
    }
  };

  const eliminarProducto = async (producto: Producto) => {
    try {
      const db = await setupDatabase();

      // Las ventas y encargo_items tienen FK a productos: hay que borrarlos
      // antes (si no, el DELETE del producto falla por foreign key constraint).
      const ventasAsociadas = await db.getAllAsync<{ id_venta: number }>(
        "SELECT id_venta FROM ventas WHERE id_producto = ?",
        [producto.id_producto],
      );

      await db.withTransactionAsync(async () => {
        await db.runAsync("DELETE FROM ventas WHERE id_producto = ?", [
          producto.id_producto,
        ]);
        await db.runAsync("DELETE FROM encargo_items WHERE id_producto = ?", [
          producto.id_producto,
        ]);
        await db.runAsync("DELETE FROM recetas WHERE id_producto = ?", [
          producto.id_producto,
        ]);
        await db.runAsync("DELETE FROM productos WHERE id_producto = ?", [
          producto.id_producto,
        ]);
      });

      const id = producto.id_producto.toString();
      eliminarConSync(db, "recetas", id);
      eliminarConSync(db, "productos", id);
      for (const v of ventasAsociadas) {
        eliminarConSync(db, "ventas", v.id_venta.toString());
      }

      setProductos((prev) =>
        prev.filter((p) => p.id_producto !== producto.id_producto),
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo eliminar el producto.");
    }
  };

  const reactivarProducto = async (producto: Producto) => {
    try {
      const db = await setupDatabase();
      const nuevoNombre = nombreActivo(producto.nombre);

      await db.runAsync(
        "UPDATE productos SET nombre = ?, sincronizado = 0 WHERE id_producto = ?",
        [nuevoNombre, producto.id_producto],
      );

      if (producto.tiene_receta) {
        await db.runAsync(
          "UPDATE recetas SET nombre = ?, sincronizado = 0 WHERE id_producto = ?",
          [nuevoNombre, producto.id_producto],
        );
      }

      try {
        await updateDoc(
          doc(firestore, "productos", producto.id_producto.toString()),
          { nombre: nuevoNombre },
        );
        if (producto.tiene_receta) {
          await updateDoc(
            doc(firestore, "recetas", producto.id_producto.toString()),
            { nombre: nuevoNombre },
          ).catch(() => {});
        }
      } catch (firebaseError) {
        console.warn(
          "⚠️ Producto reactivado localmente, error en nube:",
          firebaseError,
        );
      }

      setProductos((prev) =>
        prev.map((p) =>
          p.id_producto === producto.id_producto
            ? { ...p, nombre: nuevoNombre }
            : p,
        ),
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo reactivar el producto.");
    }
  };

  const handleReactivarProducto = (producto: Producto) => {
    const nombreRestaurado = nombreActivo(producto.nombre);
    Alert.alert(
      "Reactivar producto",
      `¿Reactivar "${nombreRestaurado}"?\nVolverá a aparecer en ventas y encargos.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Reactivar", onPress: () => reactivarProducto(producto) },
      ],
    );
  };

  const handleEliminarInactivo = (producto: Producto) => {
    Alert.alert(
      "Eliminar producto",
      `¿Eliminar "${producto.nombre}" permanentemente?\nEsta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => eliminarProducto(producto),
        },
      ],
    );
  };

  const handleAccionProducto = (producto: Producto) => {
    if (esInactivo(producto.nombre)) return;

    if (producto.num_ventas > 0) {
      Alert.alert(
        "Desactivar producto",
        `¿Desactivar "${producto.nombre}"?\nYa no aparecerá en ventas nuevas, pero se conservará su historial de ${producto.num_ventas} venta${producto.num_ventas === 1 ? "" : "s"}.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Desactivar", onPress: () => desactivarProducto(producto) },
        ],
      );
      return;
    }

    Alert.alert(
      `"${producto.nombre}"`,
      "Este producto no tiene ventas registradas.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Desactivar", onPress: () => desactivarProducto(producto) },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => eliminarProducto(producto),
        },
      ],
    );
  };

  const renderEmptyState = () => {
    if (productos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={72} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Sin productos aún
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
            Toca el botón para agregar tu primer producto al catálogo.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={72} color={theme.border} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          Sin resultados
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
          No hay productos que coincidan con tu búsqueda o filtro.
        </Text>
        {hayFiltroActivo && (
          <TouchableOpacity
            style={[styles.limpiarBtn, { backgroundColor: theme.tint }]}
            onPress={limpiarFiltros}
          >
            <Text style={styles.limpiarBtnText}>Limpiar filtros</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

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
            Productos
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {productos.length === 0
              ? "Gestiona tu inventario y precios"
              : hayFiltroActivo
                ? `${productosVisibles.length} de ${productos.length} producto${productos.length !== 1 ? "s" : ""}`
                : `${productos.length} producto${productos.length !== 1 ? "s" : ""} en catálogo`}
          </Text>

          <TouchableOpacity
            style={[styles.nuevoBtn, { backgroundColor: theme.tint }]}
            onPress={handleAgregarProducto}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={32} color="#FFF" />
            <Text style={styles.nuevoBtnText}>Nuevo Producto</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.icon} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Buscar producto..."
            placeholderTextColor={theme.icon}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {busqueda.length > 0 && (
            <TouchableOpacity onPress={() => setBusqueda("")}>
              <Ionicons name="close-circle" size={20} color={theme.icon} />
            </TouchableOpacity>
          )}
        </View>

        <FiltrosColapsables
          style={styles.filtrosColapsables}
          hayFiltroActivo={filtro !== "TODOS" || orden !== "NOMBRE"}
        >
          <View
            style={[
              styles.filtrosContainer,
              {
                backgroundColor: colorScheme === "dark" ? "#1E293B" : "#E2E8F0",
              },
            ]}
          >
            {FILTROS.map((opcion) => {
              const activo = filtro === opcion.id;
              return (
                <TouchableOpacity
                  key={opcion.id}
                  style={[
                    styles.filtroBtn,
                    activo && {
                      backgroundColor: theme.card,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: colorScheme === "dark" ? 0.3 : 0.12,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setFiltro(opcion.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filtroText,
                      { color: activo ? theme.tint : theme.icon },
                    ]}
                  >
                    {opcion.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.ordenLabel, { color: theme.icon }]}>
            Ordenar por
          </Text>
          <View
            style={[
              styles.filtrosContainer,
              styles.ordenContainer,
              {
                backgroundColor: colorScheme === "dark" ? "#1E293B" : "#E2E8F0",
              },
            ]}
          >
            {ORDENES.map((opcion) => {
              const activo = orden === opcion.id;
              return (
                <TouchableOpacity
                  key={opcion.id}
                  style={[
                    styles.filtroBtn,
                    activo && {
                      backgroundColor: theme.card,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: colorScheme === "dark" ? 0.3 : 0.12,
                      shadowRadius: 3,
                      elevation: 2,
                    },
                  ]}
                  onPress={() => setOrden(opcion.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filtroText,
                      { color: activo ? theme.tint : theme.icon },
                    ]}
                  >
                    {opcion.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FiltrosColapsables>

        {cargando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        ) : (
          <FlatList
            data={productosVisibles}
            keyExtractor={(item) => item.id_producto.toString()}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refrescando}
                onRefresh={onRefresh}
                tintColor={theme.tint}
              />
            }
            contentContainerStyle={
              productosVisibles.length === 0
                ? styles.listEmpty
                : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            renderItem={({ item }) => {
              const inactivo = esInactivo(item.nombre);

              return (
                <TouchableOpacity
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: inactivo ? 0.72 : 1,
                    },
                  ]}
                  onPress={() => handleEditarProducto(item)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.cardIcon,
                      {
                        backgroundColor: inactivo
                          ? `${theme.icon}18`
                          : `${theme.tint}18`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.tiene_receta ? "restaurant" : "cube"}
                      size={22}
                      color={inactivo ? theme.icon : theme.tint}
                    />
                  </View>

                  <View style={styles.cardInfo}>
                    <View style={styles.nombreRow}>
                      <View style={styles.nombreContainer}>
                        <TextoDesplazable
                          text={item.nombre}
                          style={[styles.cardNombre, { color: theme.text }]}
                        />
                      </View>
                      {item.tiene_receta > 0 && (
                        <View
                          style={[styles.badge, { backgroundColor: "#FEF3C7" }]}
                        >
                          <Text style={styles.badgeText}>Receta</Text>
                        </View>
                      )}
                      {inactivo && (
                        <View
                          style={[styles.badge, { backgroundColor: "#F1F5F9" }]}
                        >
                          <Text
                            style={[styles.badgeText, { color: theme.icon }]}
                          >
                            Inactivo
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.cardPrecio, { color: theme.tint }]}>
                      {formatearPrecio(item.precio_unitario)}
                    </Text>
                    {item.num_ventas > 0 && (
                      <Text style={[styles.cardMeta, { color: theme.icon }]}>
                        {item.num_ventas}{" "}
                        {item.num_ventas === 1
                          ? "venta registrada"
                          : "ventas registradas"}
                      </Text>
                    )}
                  </View>

                  <View style={styles.actionsContainer}>
                    <TouchableOpacity
                      style={[
                        styles.iconButton,
                        { backgroundColor: `${theme.tint}18` },
                      ]}
                      onPress={() => handleEditarProducto(item)}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="pencil" size={20} color={theme.tint} />
                    </TouchableOpacity>

                    {inactivo ? (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.iconButton,
                            styles.reactivarIconContainer,
                          ]}
                          onPress={() => handleReactivarProducto(item)}
                          activeOpacity={0.6}
                        >
                          <Ionicons name="eye" size={20} color="#10B981" />
                        </TouchableOpacity>
                        {item.num_ventas === 0 && (
                          <TouchableOpacity
                            style={[
                              styles.iconButton,
                              styles.deleteIconContainer,
                            ]}
                            onPress={() => handleEliminarInactivo(item)}
                            activeOpacity={0.6}
                          >
                            <Ionicons name="trash" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.iconButton,
                          styles.desactivarIconContainer,
                        ]}
                        onPress={() => handleAccionProducto(item)}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="eye-off" size={20} color="#F59E0B" />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
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
  header: { marginBottom: 16 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: { fontSize: 16, fontWeight: "400", marginBottom: 16 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 4,
    marginBottom: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === "android" ? 8 : 0,
  },
  filtrosColapsables: {
    marginBottom: 14,
  },
  filtrosContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  ordenContainer: {
    marginBottom: 14,
  },
  ordenLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
  },
  filtroBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  filtroText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  limpiarBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  limpiarBtnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  nuevoBtn: {
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
  nuevoBtnText: {
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
  cardInfo: { flex: 1, marginRight: 8, minWidth: 0 },
  nombreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    overflow: "hidden",
  },
  nombreContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  cardNombre: {
    fontSize: 17,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  cardPrecio: { fontSize: 16, fontWeight: "800", marginBottom: 2 },
  cardMeta: { fontSize: 12, fontWeight: "500" },
  actionsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  desactivarIconContainer: {
    backgroundColor: "#FEF3C7",
  },
  reactivarIconContainer: {
    backgroundColor: "#D1FAE5",
  },
  deleteIconContainer: {
    backgroundColor: "#FEE2E2",
  },
  emptyContainer: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  centerAll: { flex: 1, justifyContent: "center", alignItems: "center" },
});
