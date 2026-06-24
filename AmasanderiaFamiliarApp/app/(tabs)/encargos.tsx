import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { setupDatabase } from "../../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// ─── IMPORTACIONES DE FIREBASE ───
import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db as firestore } from "../../firebaseConfig";
import { eliminarConSync, getPendingDeletionIds } from "@/utils/deleteSync";
import { suscribirColeccion } from "@/utils/realtime";
import {
  insertarVentaEncargo,
  syncVentaAFirebase,
} from "@/utils/ventasService";
import { productoVentaEncargo } from "@/utils/encargosService";
import {
  cancelarNotificacionesEncargo,
  formatearHoraEntrega,
  parsearFechaEntrega,
  programarNotificacionesEncargo,
} from "@/utils/alertasService";

interface EncargoItem {
  producto_nombre: string;
  cantidad: number;
  subtotal: number;
}

interface EncargoConDetalle {
  id_encargo: number;
  id_cliente: number;
  cliente_nombre: string;
  items: EncargoItem[];
  productos_resumen: string;
  cantidad_total: number;
  total: number;
  fecha_entrega: string;
  estado_pedido: "PENDIENTE" | "ENTREGADO";
  estado_pago: "PAGADO" | "ABONADO" | "FIADO";
  abono: number;
}

interface EncargoItemRow extends EncargoItem {
  id_encargo: number;
}

const armarResumenProductos = (items: EncargoItem[]): string =>
  items.length > 0
    ? items.map((i) => `${i.producto_nombre} x${i.cantidad}`).join(", ")
    : "Sin productos";

type EstiloTarjetaEstado = {
  cardBg: string;
  borderColor: string;
  accent: string;
  accentSoft: string;
  itemsBg: string;
  divider: string;
  estadoLabel: string;
  estadoIcon: "hourglass-outline" | "checkmark-circle";
};

const getEstiloTarjeta = (
  isEntregado: boolean,
  isDark: boolean,
): EstiloTarjetaEstado => {
  if (isEntregado) {
    return isDark
      ? {
          cardBg: "#052E16",
          borderColor: "#22C55E",
          accent: "#4ADE80",
          accentSoft: "#22C55E30",
          itemsBg: "#0F172A99",
          divider: "#22C55E40",
          estadoLabel: "Entregado",
          estadoIcon: "checkmark-circle",
        }
      : {
          cardBg: "#F0FDF4",
          borderColor: "#86EFAC",
          accent: "#15803D",
          accentSoft: "#BBF7D0",
          itemsBg: "#FFFFFF",
          divider: "#BBF7D0",
          estadoLabel: "Entregado",
          estadoIcon: "checkmark-circle",
        };
  }
  return isDark
    ? {
        cardBg: "#422006",
        borderColor: "#F59E0B",
        accent: "#FBBF24",
        accentSoft: "#F59E0B35",
        itemsBg: "#0F172A99",
        divider: "#F59E0B40",
        estadoLabel: "Pendiente",
        estadoIcon: "hourglass-outline",
      }
    : {
        cardBg: "#FFFBEB",
        borderColor: "#FCD34D",
        accent: "#B45309",
        accentSoft: "#FDE68A",
        itemsBg: "#FFFFFF",
        divider: "#FDE68A",
        estadoLabel: "Pendiente",
        estadoIcon: "hourglass-outline",
      };
};

const formatearFechaDisplay = (fechaIso: string) => {
  try {
    const parsed = parsearFechaEntrega(fechaIso);
    if (!parsed) return fechaIso;

    const fecha = parsed.toLocaleDateString("es-CL");
    const hora = formatearHoraEntrega(fechaIso);
    return fechaIso.trim().length > 10 ? `${fecha} ${hora}` : fecha;
  } catch {
    return fechaIso;
  }
};

export default function EncargosScreen() {
  const router = useRouter();
  const [todosEncargos, setTodosEncargos] = useState<EncargoConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<
    "TODOS" | "PENDIENTE" | "ENTREGADO"
  >("PENDIENTE");

  const encargosVisibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const terminoLimpio = termino.replace("#", "");

    return todosEncargos.filter((e) => {
      // 1. Filtro por Pestañas (Estado)
      if (filtroEstado !== "TODOS" && e.estado_pedido !== filtroEstado) {
        return false;
      }

      // 2. Filtro por Búsqueda de texto
      if (termino) {
        const coincideId = e.id_encargo.toString().includes(terminoLimpio);
        const coincideNombre = e.cliente_nombre.toLowerCase().includes(termino);

        const fechaDisplay = formatearFechaDisplay(
          e.fecha_entrega,
        ).toLowerCase();
        const coincideFecha =
          fechaDisplay.includes(termino) || e.fecha_entrega.includes(termino);

        if (!coincideId && !coincideNombre && !coincideFecha) {
          return false;
        }
      }

      return true;
    });
  }, [todosEncargos, filtroEstado, busqueda]);

  const hayFiltroActivo =
    busqueda.trim().length > 0 || filtroEstado !== "PENDIENTE";

  const haCargadoRef = useRef(false);

  const colorScheme = useColorScheme() ?? "light";
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme];

  // ─── CARGA LOCAL ───
  const cargarEncargos = useCallback(async (silencioso = false) => {
    if (!haCargadoRef.current && !silencioso) {
      setCargando(true);
    }

    try {
      const db = await setupDatabase();
      const querySQL = `
        SELECT
          e.id_encargo,
          e.id_cliente,
          e.total,
          e.fecha_entrega,
          e.estado_pedido,
          e.estado_pago,
          e.abono,
          c.nombre AS cliente_nombre
        FROM encargos e
        JOIN clientes c ON e.id_cliente = c.id_cliente
        ORDER BY date(e.fecha_entrega) ASC
      `;

      const filas =
        await db.getAllAsync<
          Omit<
            EncargoConDetalle,
            "items" | "productos_resumen" | "cantidad_total"
          >
        >(querySQL);

      const itemsRows = await db.getAllAsync<EncargoItemRow>(`
        SELECT ei.id_encargo, p.nombre AS producto_nombre, ei.cantidad, ei.subtotal
        FROM encargo_items ei
        JOIN productos p ON p.id_producto = ei.id_producto
        ORDER BY ei.id_item ASC
      `);

      const itemsPorEncargo = new Map<number, EncargoItem[]>();
      for (const row of itemsRows) {
        const lista = itemsPorEncargo.get(row.id_encargo) ?? [];
        lista.push({
          producto_nombre: row.producto_nombre,
          cantidad: row.cantidad,
          subtotal: row.subtotal,
        });
        itemsPorEncargo.set(row.id_encargo, lista);
      }

      setTodosEncargos(
        filas.map((e) => {
          const items = itemsPorEncargo.get(e.id_encargo) ?? [];
          return {
            ...e,
            items,
            productos_resumen: armarResumenProductos(items),
            cantidad_total: items.reduce((sum, i) => sum + i.cantidad, 0),
          };
        }),
      );
    } catch (error) {
      console.error(error);
    } finally {
      if (!haCargadoRef.current) {
        haCargadoRef.current = true;
        setCargando(false);
      }
    }
  }, []);

  // ─── ESCUCHADOR AUTOMÁTICO DE FIREBASE ───
  useEffect(() => {
    return suscribirColeccion("encargos", async (snapshot) => {
        try {
          const dbSQLite = await setupDatabase();
          const pendingDeletes = await getPendingDeletionIds(
            dbSQLite,
            "encargos",
          );

          for (const documento of snapshot.docs) {
            if (pendingDeletes.has(documento.id)) continue;
            // Escritura local aún no confirmada por el servidor: no marcar como
            // respaldada (ya está en SQLite como pendiente).
            if (documento.metadata.hasPendingWrites) continue;
            const e = documento.data();
            const idEncargo = Number(e.id_encargo ?? documento.id);
            if (!idEncargo || typeof e.id_cliente !== "number") continue;

            await dbSQLite.withTransactionAsync(async () => {
              await dbSQLite.runAsync(
                `INSERT OR REPLACE INTO encargos
                  (id_encargo, id_cliente, total, fecha_entrega, estado_pedido, estado_pago, abono, sincronizado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                  idEncargo,
                  e.id_cliente,
                  e.total ?? 0,
                  e.fecha_entrega ?? null,
                  e.estado_pedido ?? "PENDIENTE",
                  e.estado_pago ?? "PAGADO",
                  e.abono ?? 0,
                ],
              );

              if (Array.isArray(e.items) && e.items.length > 0) {
                await dbSQLite.runAsync(
                  "DELETE FROM encargo_items WHERE id_encargo = ?",
                  [idEncargo],
                );
                for (const item of e.items) {
                  if (typeof item.id_producto !== "number") continue;
                  await dbSQLite.runAsync(
                    `INSERT INTO encargo_items (id_encargo, id_producto, cantidad, subtotal)
                     VALUES (?, ?, ?, ?)`,
                    [
                      idEncargo,
                      item.id_producto,
                      item.cantidad ?? 1,
                      item.subtotal ?? 0,
                    ],
                  );
                }
              }
            });
          }
          cargarEncargos(true);
        } catch (error) {
          console.error(
            "Error sincronizando encargos en segundo plano:",
            error,
          );
        }
    });
  }, [cargarEncargos]);

  useFocusEffect(
    useCallback(() => {
      cargarEncargos(true);
    }, [cargarEncargos]),
  );

  const cambiarEstado = async (encargo: EncargoConDetalle) => {
    const nuevoEstado =
      encargo.estado_pedido === "PENDIENTE" ? "ENTREGADO" : "PENDIENTE";
    const mensaje =
      nuevoEstado === "ENTREGADO"
        ? "¿Marcar este pedido como entregado?\n\nSi es fiado, la deuda se sumará al saldo del cliente."
        : "¿Devolver este pedido a estado Pendiente?\n\nSi es fiado, se restará la deuda al cliente.";

    Alert.alert("Cambiar Estado", mensaje, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Confirmar",
        onPress: async () => {
          try {
            const db = await setupDatabase();

            await db.withTransactionAsync(async () => {
              // 1. Actualizar el estado del encargo
              await db.runAsync(
                "UPDATE encargos SET estado_pedido = ?, sincronizado = 0 WHERE id_encargo = ?",
                [nuevoEstado, encargo.id_encargo],
              );

              // 2. Lógica para estado_pago = FIADO (Afecta la deuda del cliente)
              if (encargo.estado_pago === "FIADO") {
                const montoDeuda = encargo.total - (encargo.abono || 0);

                if (nuevoEstado === "ENTREGADO") {
                  await db.runAsync(
                    "UPDATE clientes SET deuda_pendiente = deuda_pendiente + ?, sincronizado = 0 WHERE id_cliente = ?",
                    [montoDeuda, encargo.id_cliente],
                  );
                } else {
                  await db.runAsync(
                    "UPDATE clientes SET deuda_pendiente = MAX(0, deuda_pendiente - ?), sincronizado = 0 WHERE id_cliente = ?",
                    [montoDeuda, encargo.id_cliente],
                  );
                }
              }

              // 3. Historial de ventas (atómico e idempotente por id_encargo)
              if (nuevoEstado === "ENTREGADO") {
                await insertarVentaEncargo(db, {
                  id_encargo: encargo.id_encargo,
                  id_producto: productoVentaEncargo(),
                  id_cliente: encargo.id_cliente,
                  cantidad: encargo.cantidad_total || 1,
                  total_venta: encargo.total,
                });
              } else {
                await db.runAsync("DELETE FROM ventas WHERE id_encargo = ?", [
                  encargo.id_encargo,
                ]);
              }
            });

            // ─── SINCRONIZACIÓN FIREBASE (No bloqueante — funciona offline) ───
            (async () => {
              try {
                // A. Actualizar estado del Encargo en la nube
                await updateDoc(
                  doc(firestore, "encargos", encargo.id_encargo.toString()),
                  {
                    estado_pedido: nuevoEstado,
                  },
                );

                // B. Sincronizar deuda del cliente si correspondía
                if (encargo.estado_pago === "FIADO") {
                  const clienteActual = await db.getFirstAsync<{
                    deuda_pendiente: number;
                  }>(
                    "SELECT deuda_pendiente FROM clientes WHERE id_cliente = ?",
                    [encargo.id_cliente],
                  );
                  if (clienteActual) {
                    await updateDoc(
                      doc(firestore, "clientes", encargo.id_cliente.toString()),
                      {
                        deuda_pendiente: clienteActual.deuda_pendiente,
                      },
                    );
                  }
                }

                // C. Sincronizar Ventas en la nube
                if (nuevoEstado === "ENTREGADO") {
                  const ventaDB = await db.getFirstAsync<{
                    id_venta: number;
                    fecha_venta: string;
                  }>(
                    "SELECT id_venta, fecha_venta FROM ventas WHERE id_encargo = ? ORDER BY id_venta DESC LIMIT 1",
                    [encargo.id_encargo],
                  );
                  if (ventaDB) {
                    await syncVentaAFirebase(db, {
                      id_venta: ventaDB.id_venta,
                      id_producto: productoVentaEncargo(),
                      id_cliente: encargo.id_cliente,
                      id_encargo: encargo.id_encargo,
                      cantidad: encargo.cantidad_total || 1,
                      total_venta: encargo.total,
                      grupo_venta: null,
                      fecha_venta: ventaDB.fecha_venta,
                    });
                  }
                } else {
                  const q = query(
                    collection(firestore, "ventas"),
                    where("id_encargo", "==", encargo.id_encargo),
                  );
                  const snapshot = await getDocs(q);
                  for (const docVenta of snapshot.docs) {
                    await deleteDoc(docVenta.ref);
                  }
                }
                console.log(
                  "✅ Sincronización completa de estado, deudas y ventas",
                );
              } catch (firebaseError) {
                console.warn(
                  "⚠️ Estado guardado localmente, error en nube:",
                  firebaseError,
                );
              }
            })();

            if (nuevoEstado === "ENTREGADO") {
              await cancelarNotificacionesEncargo(encargo.id_encargo);
            } else {
              // Resetear tracking de notificaciones remotas para que la Cloud
              // Function vuelva a enviarlas si quedan más de 2h o 4h
              try {
                await deleteDoc(
                  doc(firestore, "encargo_notificaciones", encargo.id_encargo.toString()),
                );
              } catch {}
              await programarNotificacionesEncargo(
                encargo.id_encargo,
                encargo.cliente_nombre,
                encargo.fecha_entrega,
              );
            }

            cargarEncargos(true);
          } catch (error) {
            console.error(error);
            Alert.alert("Error", "No se pudo actualizar el estado.");
          }
        },
      },
    ]);
  };

  const handleEliminarEncargo = (encargo: EncargoConDetalle) => {
    if (encargo.estado_pedido === "ENTREGADO") {
      Alert.alert(
        "No se puede eliminar",
        "Este pedido ya fue entregado y forma parte de tu contabilidad.\n\nSi te equivocaste, primero cámbialo a 'Pendiente' usando el switch y luego podrás borrarlo.",
      );
      return;
    }

    Alert.alert(
      "Cancelar Pedido",
      `¿Estás seguro de que deseas eliminar el pedido (${encargo.productos_resumen}) de ${encargo.cliente_nombre}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Sí, cancelar",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await setupDatabase();

              await db.runAsync("DELETE FROM encargos WHERE id_encargo = ?", [
                encargo.id_encargo,
              ]);
              await cancelarNotificacionesEncargo(encargo.id_encargo);

              const id = encargo.id_encargo.toString();
              eliminarConSync(db, "encargos", id);
              eliminarConSync(db, "encargo_notificaciones", id);

              setTodosEncargos((prev) =>
                prev.filter((e) => e.id_encargo !== encargo.id_encargo),
              );
            } catch (error) {
              console.error(error);
              Alert.alert("Error", "No se pudo eliminar el pedido.");
            }
          },
        },
      ],
    );
  };

  const handleNuevoEncargo = () => {
    router.push("../modal-encargo");
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("PENDIENTE");
  };

  const renderFiltros = () => (
    <View style={styles.filtrosContainer}>
      <TouchableOpacity
        style={[
          styles.filtroBtn,
          filtroEstado === "PENDIENTE" && { backgroundColor: theme.tint },
        ]}
        onPress={() => setFiltroEstado("PENDIENTE")}
      >
        <Text
          style={[
            styles.filtroText,
            filtroEstado === "PENDIENTE" && { color: "#FFF" },
          ]}
        >
          Pendientes
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filtroBtn,
          filtroEstado === "ENTREGADO" && { backgroundColor: theme.tint },
        ]}
        onPress={() => setFiltroEstado("ENTREGADO")}
      >
        <Text
          style={[
            styles.filtroText,
            filtroEstado === "ENTREGADO" && { color: "#FFF" },
          ]}
        >
          Entregados
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filtroBtn,
          filtroEstado === "TODOS" && { backgroundColor: theme.tint },
        ]}
        onPress={() => setFiltroEstado("TODOS")}
      >
        <Text
          style={[
            styles.filtroText,
            filtroEstado === "TODOS" && { color: "#FFF" },
          ]}
        >
          Todos
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => {
    if (todosEncargos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={72} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Sin pedidos
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
            No hay encargos registrados en el sistema.
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
          No hay encargos que coincidan con tu búsqueda o filtro.
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

  const renderEncargo = useCallback(({ item }: { item: EncargoConDetalle }) => {
    const isEntregado = item.estado_pedido === "ENTREGADO";
    const estilo = getEstiloTarjeta(isEntregado, isDark);

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: estilo.cardBg,
            borderColor: estilo.borderColor,
            borderLeftColor: estilo.accent,
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.clienteInfo}>
            <View
              style={[
                styles.avatarMini,
                { backgroundColor: estilo.accentSoft },
              ]}
            >
              <Ionicons
                name="person"
                size={16}
                color={estilo.accent}
              />
            </View>
            <View style={styles.clienteDatos}>
              <Text
                style={[styles.encargoNum, { color: estilo.accent }]}
              >
                Encargo #{item.id_encargo}
              </Text>
              <Text
                style={[styles.clienteText, { color: theme.text }]}
              >
                {item.cliente_nombre}
              </Text>
            </View>
          </View>
          <View style={styles.headerBadges}>
            <View
              style={[
                styles.estadoPedidoBadge,
                { backgroundColor: estilo.accentSoft },
              ]}
            >
              <Ionicons
                name={estilo.estadoIcon}
                size={13}
                color={estilo.accent}
              />
              <Text
                style={[
                  styles.estadoPedidoText,
                  { color: estilo.accent },
                ]}
              >
                {estilo.estadoLabel}
              </Text>
            </View>
            <View
              style={[
                styles.fechaBadge,
                { backgroundColor: estilo.itemsBg },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={estilo.accent}
              />
              <Text style={[styles.fechaText, { color: theme.text }]}>
                {formatearFechaDisplay(item.fecha_entrega)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.itemsHeader}>
            <Ionicons
              name="bag-handle-outline"
              size={15}
              color={estilo.accent}
            />
            <Text
              style={[
                styles.itemsHeaderText,
                { color: estilo.accent },
              ]}
            >
              Productos del pedido
            </Text>
          </View>
          <View
            style={[
              styles.itemsContainer,
              {
                backgroundColor: estilo.itemsBg,
                borderColor: estilo.divider,
                borderWidth: 1,
              },
            ]}
          >
            {item.items.length === 0 ? (
              <Text style={[styles.itemVacio, { color: theme.icon }]}>
                Sin productos registrados
              </Text>
            ) : (
              item.items.map((prod, idx) => (
                <View
                  key={`${item.id_encargo}-${idx}`}
                  style={[
                    styles.itemFila,
                    idx < item.items.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: estilo.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.cantidadBadge,
                      { backgroundColor: estilo.accentSoft },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cantidadBadgeText,
                        { color: estilo.accent },
                      ]}
                    >
                      {prod.cantidad}×
                    </Text>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text
                      style={[
                        styles.itemNombre,
                        { color: theme.text },
                      ]}
                      numberOfLines={2}
                    >
                      {prod.producto_nombre}
                    </Text>
                    <Text
                      style={[
                        styles.itemPrecioUnit,
                        { color: theme.icon },
                      ]}
                    >
                      $
                      {Math.round(
                        prod.subtotal / prod.cantidad,
                      ).toLocaleString("es-CL")}{" "}
                      c/u
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.itemSubtotal,
                      { color: theme.text },
                    ]}
                  >
                    ${prod.subtotal.toLocaleString("es-CL")}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View
            style={[
              styles.totalRow,
              { borderTopColor: estilo.divider },
            ]}
          >
            <View>
              <Text
                style={[styles.totalLabel, { color: theme.icon }]}
              >
                Total del pedido
              </Text>
              {item.cantidad_total > 0 && (
                <Text
                  style={[
                    styles.totalUnidades,
                    { color: theme.icon },
                  ]}
                >
                  {item.cantidad_total}{" "}
                  {item.cantidad_total === 1 ? "unidad" : "unidades"}
                </Text>
              )}
            </View>
            <Text
              style={[styles.totalText, { color: estilo.accent }]}
            >
              ${item.total.toLocaleString("es-CL")}
            </Text>
          </View>
        </View>

        <View
          style={[styles.cardFooter, { borderColor: estilo.divider }]}
        >
          <View style={styles.pagoInfo}>
            <View
              style={[
                styles.estadoPagoBadge,
                item.estado_pago === "PAGADO"
                  ? { backgroundColor: "#DCFCE7" }
                  : item.estado_pago === "ABONADO"
                    ? { backgroundColor: "#FEF9C3" }
                    : { backgroundColor: "#FEE2E2" },
              ]}
            >
              <Text
                style={[
                  styles.estadoPagoText,
                  item.estado_pago === "PAGADO"
                    ? { color: "#16A34A" }
                    : item.estado_pago === "ABONADO"
                      ? { color: "#CA8A04" }
                      : { color: "#EF4444" },
                ]}
              >
                {item.estado_pago}
              </Text>
            </View>
            {item.estado_pago === "ABONADO" && (
              <Text style={[styles.abonoText, { color: theme.icon }]}>
                (Pagó ${item.abono?.toLocaleString("es-CL")})
              </Text>
            )}
          </View>

          <View style={styles.accionesContainer}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isEntregado
                    ? estilo.accentSoft
                    : estilo.accent,
                },
              ]}
              onPress={() => cambiarEstado(item)}
            >
              <Ionicons
                name={
                  isEntregado
                    ? "arrow-undo"
                    : "checkmark-circle-outline"
                }
                size={20}
                color={isEntregado ? estilo.accent : "#FFF"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                { backgroundColor: "#FEE2E2" },
              ]}
              onPress={() => handleEliminarEncargo(item)}
            >
              <Ionicons name="trash" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [isDark, theme, cambiarEstado, handleEliminarEncargo]);

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
            Agenda
          </Text>

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
              placeholder="Buscar por #, nombre o fecha..."
              placeholderTextColor={theme.icon}
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

          {renderFiltros()}

          <TouchableOpacity
            style={[styles.nuevoBtn, { backgroundColor: theme.tint }]}
            onPress={handleNuevoEncargo}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar" size={24} color="#FFF" />
            <Text style={styles.nuevoBtnText}>Nuevo Pedido</Text>
          </TouchableOpacity>
        </View>

        {cargando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        ) : (
          <FlatList
            data={encargosVisibles}
            keyExtractor={(item) => item.id_encargo.toString()}
            showsVerticalScrollIndicator={false}
            extraData={filtroEstado}
            contentContainerStyle={
              encargosVisibles.length === 0
                ? styles.listEmpty
                : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            renderItem={renderEncargo}
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 40 : 20,
  },
  header: { marginBottom: 16 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 4,
    marginBottom: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Platform.OS === "android" ? 8 : 0,
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
  filtrosContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  filtroBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
  },
  filtroText: { fontSize: 13, fontWeight: "600", color: "#666" },

  nuevoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
  },
  nuevoBtnText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  listContainer: { paddingBottom: 24 },
  listEmpty: { flex: 1, justifyContent: "center" },

  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderLeftWidth: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  headerBadges: {
    alignItems: "flex-end",
    gap: 6,
  },
  estadoPedidoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  estadoPedidoText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clienteInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  clienteDatos: {
    flex: 1,
    gap: 2,
  },
  encargoNum: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  clienteText: { fontSize: 15, fontWeight: "600" },
  fechaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fechaText: { fontSize: 12, fontWeight: "500" },

  cardBody: {
    marginBottom: 16,
  },
  itemsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingLeft: 2,
  },
  itemsHeaderText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  itemsContainer: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  itemVacio: {
    fontSize: 14,
    fontStyle: "italic",
    paddingVertical: 12,
    textAlign: "center",
  },
  itemFila: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  cantidadBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cantidadBadgeText: {
    fontSize: 16,
    fontWeight: "800",
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemNombre: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 2,
  },
  itemPrecioUnit: {
    fontSize: 12,
    fontWeight: "500",
  },
  itemSubtotal: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  totalUnidades: {
    fontSize: 12,
    fontWeight: "500",
  },
  totalText: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },

  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
  },
  pagoInfo: { alignItems: "flex-start", gap: 4 },
  estadoPagoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  estadoPagoText: { fontSize: 12, fontWeight: "700" },
  abonoText: { fontSize: 12, fontWeight: "500" },

  accionesContainer: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
