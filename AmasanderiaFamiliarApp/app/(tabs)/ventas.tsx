import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  TouchableWithoutFeedback,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setupDatabase } from "../../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  aplicarVentaDesdeFirebase,
  eliminarVentaGrupo,
} from "@/utils/ventasService";
import { eliminarConSync, getPendingDeletionIds } from "@/utils/deleteSync";
import { suscribirColeccion } from "@/utils/realtime";

interface VentaGrupo {
  clave: string;
  grupo_venta: string | null;
  id_mostrar: number; // <-- NUEVO: Para mostrar el número de la venta
  producto: string;
  cantidad: number;
  total_venta: number;
  fecha: string;
  num_items: number;
  es_encargo: boolean;
}

interface VentaDetalle {
  id_venta: number;
  producto: string;
  cantidad: number;
  total_venta: number;
}

const PAGE_SIZE = 15;

const parseFechaVenta = (fechaString: string): Date | null => {
  if (!fechaString?.trim()) return null;
  const s = fechaString.trim();

  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  const normalized = s.replace(" ", "T");
  const utc = new Date(`${normalized}Z`);
  if (!isNaN(utc.getTime())) return utc;

  const local = new Date(normalized);
  return isNaN(local.getTime()) ? null : local;
};

const formatearFecha = (fechaString: string) => {
  const fecha = parseFechaVenta(fechaString);
  if (!fecha) return fechaString || "Fecha desconocida";
  return fecha.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const parsearDescripcion = (desc: string) => {
  if (desc && desc.includes("|")) {
    const partes = desc.split("|");
    return {
      titulo: partes[0].trim(),
      subtitulo: partes.slice(1).join("|").trim(),
    };
  }
  return { titulo: desc, subtitulo: null };
};

type ListItem =
  | { type: "header"; dateLabel: string; dayKey: string }
  | { type: "venta"; data: VentaGrupo };

const formatDayLabel = (fechaStr: string): string => {
  const d = parseFechaVenta(fechaStr);
  if (!d) return fechaStr.substring(0, 10);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const num = d.getDate();
  const mes = meses[d.getMonth()];
  const anioSufijo =
    d.getFullYear() !== hoy.getFullYear() ? ` ${d.getFullYear()}` : "";
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${num} ${mes}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${num} ${mes}`;
  return `${num} ${mes}${anioSufijo}`;
};

const buildListData = (grupos: VentaGrupo[]): ListItem[] => {
  const items: ListItem[] = [];
  let lastKey = "";
  for (const g of grupos) {
    const d = parseFechaVenta(g.fecha);
    const dayKey = d ? d.toDateString() : g.fecha.substring(0, 10);
    if (dayKey !== lastKey) {
      items.push({
        type: "header",
        dateLabel: formatDayLabel(g.fecha),
        dayKey,
      });
      lastKey = dayKey;
    }
    items.push({ type: "venta", data: g });
  }
  return items;
};

export default function VentasScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const router = useRouter();

  const [grupos, setGrupos] = useState<VentaGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState<Date | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Modal detalle
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [detalleItems, setDetalleItems] = useState<VentaDetalle[]>([]);
  const [detalleTitulo, setDetalleTitulo] = useState("");
  const [detalleTotal, setDetalleTotal] = useState(0);
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaGrupo | null>(
    null,
  );
  const [detalleEsEncargo, setDetalleEsEncargo] = useState(false);
  const [detalleEncargoCliente, setDetalleEncargoCliente] = useState("");

  // <-- SQL ACTUALIZADO PARA EXTRAER "id_mostrar" y FILTRAR POR NÚMERO -->
  const getQueryGrupos = (conFiltro: boolean, conBusqueda: boolean) => `
    SELECT
      COALESCE(v.grupo_venta, CAST(v.id_venta AS TEXT)) AS clave,
      v.grupo_venta,
      MIN(v.id_venta) AS id_mostrar,
      CASE
        WHEN COUNT(*) > 1 THEN 'Venta de ' || COUNT(*) || ' productos'
        WHEN MAX(v.id_encargo) IS NOT NULL THEN 'Encargo de ' || COALESCE(MAX(c.nombre), 'Cliente')
        ELSE COALESCE(MAX(p.nombre), 'Producto desconocido')
      END AS producto,
      SUM(v.cantidad) AS cantidad,
      SUM(v.total_venta) AS total_venta,
      MAX(v.fecha_venta) AS fecha,
      COUNT(*) AS num_items,
      CASE WHEN v.id_encargo IS NOT NULL THEN 1 ELSE 0 END AS es_encargo
    FROM ventas v
    LEFT JOIN productos p ON v.id_producto = p.id_producto
    LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
    WHERE 1=1
    ${conFiltro ? "AND substr(v.fecha_venta, 1, 10) = ?" : ""}
    ${conBusqueda ? "AND CAST(v.id_venta AS TEXT) LIKE ?" : ""}
    GROUP BY COALESCE(v.grupo_venta, CAST(v.id_venta AS TEXT))
    ORDER BY MAX(v.fecha_venta) DESC
    LIMIT ? OFFSET ?
  `;

  const cargarGrupos = async (
    isRefresh = false,
    fecha: Date | null = filtroFecha,
    textoBusqueda: string = busqueda,
  ) => {
    if (isRefresh) setRefrescando(true);
    else setCargando(true);
    try {
      const db = await setupDatabase();
      const params: (string | number)[] = [];
      const term = textoBusqueda.replace(/\D/g, "");
      const hasSearch = term.length > 0;

      if (fecha) {
        const pad = (n: number) => n.toString().padStart(2, "0");
        params.push(
          `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`,
        );
      }

      if (hasSearch) {
        params.push(`%${term}%`);
      }

      params.push(PAGE_SIZE, 0);

      const resultado = (await db.getAllAsync(
        getQueryGrupos(!!fecha, hasSearch),
        params,
      )) as VentaGrupo[];
      setGrupos(resultado);
      setHasMore(resultado.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error al cargar ventas:", error);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  // Ref para que el onSnapshot siempre llame la versión más reciente de
  // cargarGrupos (con los filtros actuales, no los del mount)
  const cargarGruposRef = useRef(cargarGrupos);
  useEffect(() => { cargarGruposRef.current = cargarGrupos; });

  useEffect(() => {
    return suscribirColeccion("ventas", async (snapshot) => {
      try {
        const dbSQLite = await setupDatabase();
        const pendingDeletes = await getPendingDeletionIds(dbSQLite, "ventas");
        for (const documento of snapshot.docs) {
          if (pendingDeletes.has(documento.id)) continue;
          // Escritura local aún no confirmada por el servidor: no marcar como
          // respaldada (ya está en SQLite como pendiente).
          if (documento.metadata.hasPendingWrites) continue;
          await aplicarVentaDesdeFirebase(dbSQLite, documento.data());
        }
        cargarGruposRef.current();
      } catch (error) {
        console.error("Error sincronizando ventas:", error);
      }
    });
  }, []);

  // <-- DEBOUNCE PARA BUSCADOR Y FECHA -->
  useEffect(() => {
    const timer = setTimeout(() => {
      cargarGrupos(false, filtroFecha, busqueda);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda, filtroFecha]);

  useFocusEffect(
    useCallback(() => {
      cargarGruposRef.current(true);
    }, []),
  );

  const cargarMas = async () => {
    if (cargandoMas || !hasMore) return;
    setCargandoMas(true);
    try {
      const db = await setupDatabase();
      const params: (string | number)[] = [];
      const term = busqueda.replace(/\D/g, "");
      const hasSearch = term.length > 0;

      if (filtroFecha) {
        const pad = (n: number) => n.toString().padStart(2, "0");
        params.push(
          `${filtroFecha.getFullYear()}-${pad(filtroFecha.getMonth() + 1)}-${pad(filtroFecha.getDate())}`,
        );
      }

      if (hasSearch) {
        params.push(`%${term}%`);
      }

      params.push(PAGE_SIZE, grupos.length);

      const resultado = (await db.getAllAsync(
        getQueryGrupos(!!filtroFecha, hasSearch),
        params,
      )) as VentaGrupo[];
      setGrupos((prev) => [...prev, ...resultado]);
      setHasMore(resultado.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error al cargar más ventas:", error);
    } finally {
      setCargandoMas(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(Platform.OS === "ios");
    if (selectedDate) {
      setFiltroFecha(selectedDate);
    }
  };

  const eliminarGrupo = (grupo: VentaGrupo) => {
    Alert.alert("Eliminar venta", "¿Seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const db = await setupDatabase();
            const idsEliminadas = await eliminarVentaGrupo(db, grupo);

            for (const idVenta of idsEliminadas) {
              eliminarConSync(db, "ventas", idVenta.toString());
            }

            cargarGrupos(true, filtroFecha, busqueda);
          } catch (error) {
            Alert.alert("Error", "No se pudo eliminar.");
          }
        },
      },
    ]);
  };

  const abrirDetalle = async (grupo: VentaGrupo) => {
    try {
      const db = await setupDatabase();
      let items: VentaDetalle[] = [];
      let esEncargo = false;
      let clienteEncargo = "";

      const esVentaEncargo = !!grupo.es_encargo && !grupo.grupo_venta;

      if (esVentaEncargo) {
        const ventaEncargo = await db.getFirstAsync<{ id_encargo: number }>(
          `SELECT id_encargo FROM ventas WHERE CAST(id_venta AS TEXT) = ?`,
          [grupo.clave],
        );

        if (ventaEncargo?.id_encargo) {
          const itemsEncargo = await db.getAllAsync<{
            id_item: number;
            producto: string;
            cantidad: number;
            total_venta: number;
          }>(
            `
            SELECT
              ei.id_item,
              p.nombre AS producto,
              ei.cantidad,
              ei.subtotal AS total_venta
            FROM encargo_items ei
            JOIN productos p ON p.id_producto = ei.id_producto
            WHERE ei.id_encargo = ?
            ORDER BY ei.id_item ASC
          `,
            [ventaEncargo.id_encargo],
          );

          if (itemsEncargo.length > 0) {
            items = itemsEncargo.map((row) => ({
              id_venta: row.id_item,
              producto: row.producto,
              cantidad: row.cantidad,
              total_venta: row.total_venta,
            }));
            esEncargo = true;
            clienteEncargo = grupo.producto.replace(/^Encargo de\s*/i, "");
          }
        }
      }

      if (items.length === 0) {
        if (grupo.grupo_venta) {
          items = (await db.getAllAsync(
            `
            SELECT v.id_venta,
              COALESCE(p.nombre, 'Producto desconocido') AS producto,
              v.cantidad, v.total_venta
            FROM ventas v
            LEFT JOIN productos p ON v.id_producto = p.id_producto
            WHERE v.grupo_venta = ?
            ORDER BY v.id_venta ASC
          `,
            [grupo.grupo_venta],
          )) as VentaDetalle[];
        } else {
          items = (await db.getAllAsync(
            `
            SELECT v.id_venta,
              COALESCE(p.nombre, 'Producto desconocido') AS producto,
              v.cantidad, v.total_venta
            FROM ventas v
            LEFT JOIN productos p ON v.id_producto = p.id_producto
            WHERE CAST(v.id_venta AS TEXT) = ?
          `,
            [grupo.clave],
          )) as VentaDetalle[];
        }
      }

      setDetalleItems(items);
      setDetalleEsEncargo(esEncargo);
      setDetalleEncargoCliente(clienteEncargo);
      setDetalleTitulo(formatearFecha(grupo.fecha));
      setDetalleTotal(grupo.total_venta);
      setVentaSeleccionada(grupo);
      setDetalleVisible(true);
    } catch (error) {
      console.error("Error al cargar detalle:", error);
    }
  };

  const renderEmptyState = () => {
    if (busqueda.length > 0 || filtroFecha) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={72} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Sin resultados
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
            No hay ventas que coincidan con tu búsqueda.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="receipt-outline" size={72} color={theme.border} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          Sin ventas aún
        </Text>
        <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
          Toca el botón de abajo para registrar la primera venta del día.
        </Text>
      </View>
    );
  };

  const renderListItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return (
        <View style={styles.dayHeader}>
          <View
            style={[
              styles.dayHeaderLine,
              { backgroundColor: theme.border },
            ]}
          />
          <Text
            style={[
              styles.dayHeaderText,
              {
                color: theme.icon,
                backgroundColor: theme.background,
              },
            ]}
          >
            {item.dateLabel}
          </Text>
          <View
            style={[
              styles.dayHeaderLine,
              { backgroundColor: theme.border },
            ]}
          />
        </View>
      );
    }

    const venta = item.data;
    const esGrupo = venta.num_items > 1;
    const esEncargo = !!venta.es_encargo;
    const { titulo, subtitulo } = parsearDescripcion(venta.producto);
    return (
      <TouchableOpacity
        style={[
          styles.saleCard,
          {
            backgroundColor: theme.card,
            borderColor: esEncargo ? "#FBBF24" : theme.border,
          },
        ]}
        onPress={() => abrirDetalle(venta)}
        onLongPress={() => eliminarGrupo(venta)}
        delayLongPress={500}
        activeOpacity={0.75}
      >
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: esEncargo
                ? "#FBBF2418"
                : `${theme.tint}15`,
            },
          ]}
        >
          <Ionicons
            name={
              esEncargo ? "clipboard" : esGrupo ? "layers" : "cart"
            }
            size={24}
            color={esEncargo ? "#FBBF24" : theme.tint}
          />
        </View>

        <View style={styles.saleInfo}>
          {/* <-- AQUÍ AGREGAMOS EL NÚMERO DE LA VENTA --> */}
          <Text
            style={[
              styles.saleNum,
              { color: esEncargo ? "#B45309" : theme.tint },
            ]}
          >
            {esEncargo ? "Encargo" : "Venta"} #{venta.id_mostrar}
          </Text>

          <Text
            style={[styles.saleTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            {titulo}
          </Text>
          {subtitulo ? (
            <Text
              style={[styles.saleSubtitulo, { color: theme.icon }]}
              numberOfLines={1}
            >
              {subtitulo}
            </Text>
          ) : (
            <Text style={[styles.saleDate, { color: theme.icon }]}>
              {formatearFecha(venta.fecha)}
            </Text>
          )}
          {subtitulo && (
            <Text style={[styles.saleDate, { color: theme.icon }]}>
              {formatearFecha(venta.fecha)}
            </Text>
          )}
        </View>

        <View style={styles.saleAmounts}>
          <Text style={[styles.saleTotal, { color: theme.tint }]}>
            ${venta.total_venta.toLocaleString("es-CL")}
          </Text>
          <View style={styles.saleQtyRow}>
            <Text style={[styles.saleQty, { color: theme.icon }]}>
              {venta.cantidad} un.
            </Text>
            {esGrupo && (
              <Ionicons
                name="chevron-forward"
                size={14}
                color={theme.icon}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [theme, abrirDetalle, eliminarGrupo]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.nuevaVentaBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push("/venta-modal")}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="add-circle" size={48} color="#FFF" />
            <Text style={styles.nuevaVentaBtnText}>Nueva Venta</Text>
          </TouchableOpacity>

          <View style={styles.headerTop}>
            <View>
              <Text
                style={[styles.title, { color: theme.text }]}
                accessibilityRole="header"
              >
                Historial de Ventas
              </Text>
              <Text style={[styles.subtitle, { color: theme.icon }]}>
                {filtroFecha
                  ? `Filtrado por: ${filtroFecha.toLocaleDateString()}`
                  : grupos.length > 0
                    ? `${grupos.length}+ registros cargados`
                    : "Supervisa los ingresos"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {filtroFecha && (
                <TouchableOpacity
                  style={{ marginRight: 12 }}
                  onPress={() => setFiltroFecha(null)}
                >
                  <Ionicons name="close-circle" size={24} color={theme.icon} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                style={{
                  padding: 8,
                  backgroundColor: theme.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Ionicons
                  name="calendar"
                  size={24}
                  color={filtroFecha ? theme.tint : theme.icon}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* <-- NUEVA BARRA DE BÚSQUEDA --> */}
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: "rgba(0,0,0,0.03)",
                borderColor: theme.border,
              },
            ]}
          >
            <Ionicons name="search" size={20} color={theme.icon} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Buscar por # de venta o encargo..."
              placeholderTextColor={theme.icon}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {busqueda.length > 0 && (
              <TouchableOpacity
                onPress={() => setBusqueda("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={theme.icon} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {showPicker && (
          <DateTimePicker
            value={filtroFecha || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Lista */}
        {cargando && !refrescando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        ) : (
          <FlatList
            data={buildListData(grupos)}
            keyExtractor={(item) =>
              item.type === "header" ? `h_${item.dayKey}` : item.data.clave
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              grupos.length === 0 ? styles.listEmpty : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refrescando}
                onRefresh={() => cargarGrupos(true, filtroFecha, busqueda)}
                colors={[theme.tint]}
                tintColor={theme.tint}
              />
            }
            onEndReached={cargarMas}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              cargandoMas ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={theme.tint} />
                </View>
              ) : null
            }
            renderItem={renderListItem}
          />
        )}
      </View>

      <Modal
        visible={detalleVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetalleVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetalleVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[styles.modalContent, { backgroundColor: theme.card }]}
              >
                <View style={styles.modalHeader}>
                  <View style={styles.dragIndicatorContainer}>
                    <View
                      style={[
                        styles.dragIndicator,
                        { backgroundColor: theme.border },
                      ]}
                    />
                  </View>
                  <View style={styles.modalTituloRow}>
                    <View>
                      <Text style={[styles.modalTitulo, { color: theme.text }]}>
                        {detalleEsEncargo
                          ? `Detalle Encargo #${ventaSeleccionada?.id_mostrar}`
                          : `Detalle Venta #${ventaSeleccionada?.id_mostrar}`}
                      </Text>
                      {detalleEsEncargo && detalleEncargoCliente ? (
                        <Text
                          style={[
                            styles.modalEncargoCliente,
                            { color: theme.tint },
                          ]}
                        >
                          {detalleEncargoCliente}
                        </Text>
                      ) : null}
                      <Text style={[styles.modalFecha, { color: theme.icon }]}>
                        {detalleTitulo}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (ventaSeleccionada) {
                            setDetalleVisible(false);
                            setTimeout(
                              () => eliminarGrupo(ventaSeleccionada),
                              200,
                            );
                          }
                        }}
                        style={[
                          styles.cerrarBtn,
                          { backgroundColor: "#FEE2E2" },
                        ]}
                      >
                        <Ionicons name="trash" size={18} color="#EF4444" />
                      </TouchableOpacity>

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
                  </View>
                </View>

                <FlatList
                  data={detalleItems}
                  keyExtractor={(item) => item.id_venta.toString()}
                  contentContainerStyle={styles.detalleList}
                  renderItem={({ item }) => {
                    const { titulo, subtitulo } = detalleEsEncargo
                      ? { titulo: item.producto, subtitulo: null }
                      : parsearDescripcion(item.producto);
                    return (
                      <View
                        style={[
                          styles.detalleItem,
                          { borderBottomColor: theme.border },
                        ]}
                      >
                        <View style={styles.detalleItemInfo}>
                          {detalleEsEncargo ? (
                            <View style={styles.detalleEncargoQtyRow}>
                              <View
                                style={[
                                  styles.detalleEncargoBadge,
                                  { backgroundColor: `${theme.tint}18` },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.detalleEncargoBadgeText,
                                    { color: theme.tint },
                                  ]}
                                >
                                  {item.cantidad}×
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.detalleNombre,
                                  { color: theme.text, flex: 1 },
                                ]}
                              >
                                {titulo}
                              </Text>
                            </View>
                          ) : (
                            <>
                              <Text
                                style={[
                                  styles.detalleNombre,
                                  { color: theme.text },
                                ]}
                              >
                                {titulo}
                              </Text>
                              {subtitulo && (
                                <Text
                                  style={[
                                    styles.detalleSubtituloModal,
                                    { color: theme.icon },
                                  ]}
                                >
                                  {subtitulo}
                                </Text>
                              )}
                            </>
                          )}
                          {!detalleEsEncargo && (
                            <Text
                              style={[
                                styles.detalleCantidad,
                                { color: theme.icon },
                              ]}
                            >
                              {item.cantidad}{" "}
                              {item.cantidad === 1 ? "unidad" : "unidades"}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.detalleSubtotal,
                            { color: theme.tint },
                          ]}
                        >
                          ${item.total_venta.toLocaleString("es-CL")}
                        </Text>
                      </View>
                    );
                  }}
                  ListFooterComponent={
                    <View
                      style={[
                        styles.detalleTotalRow,
                        { borderTopColor: theme.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.detalleTotalLabel,
                          { color: theme.icon },
                        ]}
                      >
                        Total
                      </Text>
                      <Text
                        style={[
                          styles.detalleTotalValor,
                          { color: theme.tint },
                        ]}
                      >
                        ${detalleTotal.toLocaleString("es-CL")}
                      </Text>
                    </View>
                  }
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
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
  centerAll: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: 12 },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 28,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: { fontSize: 16, fontWeight: "400" },

  // Estilos del buscador
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 6,
    marginTop: 16,
    marginBottom: 8,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === "android" ? 4 : 0,
  },

  listContainer: { paddingBottom: 8 },
  listEmpty: { flex: 1, justifyContent: "center" },
  emptyContainer: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },

  saleCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  saleInfo: { flex: 1, marginRight: 12 },
  // Estilo del número de venta
  saleNum: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  saleTitle: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  saleSubtitulo: { fontSize: 12, fontStyle: "italic", marginBottom: 2 },
  saleDate: { fontSize: 13 },
  saleAmounts: { alignItems: "flex-end" },
  saleTotal: { fontSize: 17, fontWeight: "800", marginBottom: 2 },
  saleQtyRow: { flexDirection: "row", alignItems: "center" },
  saleQty: { fontSize: 13, fontWeight: "500" },

  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  dayHeaderLine: {
    flex: 1,
    height: 1,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },

  nuevaVentaBtn: {
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
  nuevaVentaBtnText: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    maxHeight: "75%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: { paddingHorizontal: 24 },
  dragIndicatorContainer: { alignItems: "center", paddingVertical: 12 },
  dragIndicator: { width: 40, height: 5, borderRadius: 3 },
  modalTituloRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  modalTitulo: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
  modalEncargoCliente: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  modalFecha: { fontSize: 14 },
  detalleEncargoQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  detalleEncargoBadge: {
    minWidth: 40,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  detalleEncargoBadgeText: {
    fontSize: 14,
    fontWeight: "800",
  },
  cerrarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  detalleList: { paddingHorizontal: 24, paddingBottom: 8 },
  detalleItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  detalleItemInfo: { flex: 1 },
  detalleNombre: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  detalleSubtituloModal: { fontSize: 13, fontStyle: "italic", marginBottom: 4 },
  detalleCantidad: { fontSize: 13 },
  detalleSubtotal: { fontSize: 16, fontWeight: "800" },
  detalleTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    paddingHorizontal: 24,
    marginTop: 4,
    borderTopWidth: 1,
  },
  detalleTotalLabel: { fontSize: 16, fontWeight: "600" },
  detalleTotalValor: { fontSize: 24, fontWeight: "800" },
});
