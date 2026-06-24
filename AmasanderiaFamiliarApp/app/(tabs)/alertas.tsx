import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { setupDatabase } from "../../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import {
  AlertaEncargo,
  cancelarNotificacionesEncargo,
  formatearHoraEntrega,
  formatearTiempoRestante,
  msHastaEntrega,
  obtenerEncargosProximosAVencer,
  parsearFechaEntrega,
} from "@/utils/alertasService";
import { doc, updateDoc } from "firebase/firestore";
import { db as firestore } from "../../firebaseConfig";
import { productoVentaEncargo } from "@/utils/encargosService";
import {
  insertarVentaEncargo,
  syncVentaAFirebase,
} from "@/utils/ventasService";

export default function AlertasScreen() {
  const [alertas, setAlertas] = useState<AlertaEncargo[]>([]);
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const cargarDatos = useCallback(async () => {
    try {
      const resultado = await obtenerEncargosProximosAVencer();
      setAlertas(resultado);
    } catch (error) {
      console.error("Error cargando alertas:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [cargarDatos]),
  );

  const marcarEntregado = useCallback(async (id: number, cliente: string) => {
    Alert.alert(
      "Confirmar Entrega",
      `¿Marcar el pedido de ${cliente} como entregado?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, Entregado",
          onPress: async () => {
            try {
              const db = await setupDatabase();

              const encargo = await db.getFirstAsync<{
                id_encargo: number;
                id_cliente: number;
                total: number;
                abono: number;
                estado_pago: string;
                cantidad_total: number;
              }>(
                `SELECT e.id_encargo, e.id_cliente, e.total, e.abono, e.estado_pago,
                        COALESCE(SUM(ei.cantidad), 1) AS cantidad_total
                 FROM encargos e
                 LEFT JOIN encargo_items ei ON ei.id_encargo = e.id_encargo
                 WHERE e.id_encargo = ?
                 GROUP BY e.id_encargo`,
                [id],
              );
              if (!encargo) return;

              await db.withTransactionAsync(async () => {
                await db.runAsync(
                  "UPDATE encargos SET estado_pedido = 'ENTREGADO', sincronizado = 0 WHERE id_encargo = ?",
                  [id],
                );

                if (encargo.estado_pago === "FIADO") {
                  const montoDeuda = encargo.total - (encargo.abono ?? 0);
                  await db.runAsync(
                    "UPDATE clientes SET deuda_pendiente = deuda_pendiente + ?, sincronizado = 0 WHERE id_cliente = ?",
                    [montoDeuda, encargo.id_cliente],
                  );
                }

                await insertarVentaEncargo(db, {
                  id_encargo: encargo.id_encargo,
                  id_producto: productoVentaEncargo(),
                  id_cliente: encargo.id_cliente,
                  cantidad: encargo.cantidad_total,
                  total_venta: encargo.total,
                });
              });

              // Sincronización Firebase (no bloqueante)
              updateDoc(
                doc(firestore, "encargos", id.toString()),
                { estado_pedido: "ENTREGADO" },
              ).catch(console.warn);

              const ventaDB = await db.getFirstAsync<{
                id_venta: number;
                fecha_venta: string;
              }>(
                "SELECT id_venta, fecha_venta FROM ventas WHERE id_encargo = ? ORDER BY id_venta DESC LIMIT 1",
                [id],
              );
              if (ventaDB) {
                syncVentaAFirebase(db, {
                  id_venta: ventaDB.id_venta,
                  id_producto: productoVentaEncargo(),
                  id_cliente: encargo.id_cliente,
                  id_encargo: encargo.id_encargo,
                  cantidad: encargo.cantidad_total,
                  total_venta: encargo.total,
                  grupo_venta: null,
                  fecha_venta: ventaDB.fecha_venta,
                }).catch(console.warn);
              }

              await cancelarNotificacionesEncargo(id);
              cargarDatos();
            } catch (error) {
              console.error("Error al marcar entregado:", error);
              Alert.alert("Error", "No se pudo actualizar el pedido.");
            }
          },
        },
      ],
    );
  }, [cargarDatos]);

  const renderAlerta = useCallback(({ item }: { item: AlertaEncargo }) => {
    const fechaEntrega = parsearFechaEntrega(item.fecha_entrega);
    const msRestantes = fechaEntrega ? msHastaEntrega(fechaEntrega) : 0;
    const esVencido = msRestantes <= 0;
    const esCritico = msRestantes > 0 && msRestantes <= 2 * 60 * 60 * 1000;

    const colorEstado = esVencido ? "#EF4444" : esCritico ? "#F59E0B" : "#3B82F6";
    const bgEstado = esVencido ? "#FEE2E2" : esCritico ? "#FEF3C7" : "#DBEAFE";
    const etiquetaEstado = esVencido
      ? "VENCIDO"
      : esCritico
        ? "URGENTE"
        : "PRÓXIMO";

    const horaTexto = formatearHoraEntrega(item.fecha_entrega);
    const tiempoRestante = formatearTiempoRestante(msRestantes);

    return (
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={[styles.prioridadBar, { backgroundColor: colorEstado }]} />

        <View style={styles.cardContent}>
          <View style={styles.headerCard}>
            <View style={[styles.badge, { backgroundColor: bgEstado }]}>
              <Text style={[styles.badgeText, { color: colorEstado }]}>
                {etiquetaEstado}
              </Text>
            </View>
            <Text style={[styles.hora, { color: theme.icon }]}>
              <Ionicons name="time-outline" size={14} /> {horaTexto}
            </Text>
          </View>

          <Text style={[styles.cliente, { color: theme.text }]}>
            {item.cliente}
          </Text>
          <Text style={[styles.producto, { color: theme.icon }]}>
            {esVencido
              ? "Pedido vencido — entregar cuanto antes"
              : `Faltan ${tiempoRestante} para la entrega`}
          </Text>

          <View style={styles.footerCard}>
            <Text style={[styles.total, { color: theme.tint }]}>
              ${item.total.toLocaleString()}
            </Text>
            <TouchableOpacity
              style={[styles.btnEntregar, { backgroundColor: theme.tint }]}
              onPress={() => marcarEntregado(item.id_encargo, item.cliente)}
            >
              <Ionicons name="checkmark-done" size={20} color="#FFF" />
              <Text style={styles.btnText}>Entregar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [theme, marcarEntregado]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
      />

      <View style={styles.headerPrincipal}>
        <Text style={[styles.tituloPagina, { color: theme.text }]}>
          Alertas de Pedidos
        </Text>
        <View style={[styles.contador, { backgroundColor: theme.tint }]}>
          <Text style={styles.contadorText}>{alertas.length}</Text>
        </View>
      </View>

      <Text style={[styles.subtitulo, { color: theme.icon }]}>
        Pedidos que vencen en 4 horas o menos
      </Text>

      <FlatList
        data={alertas}
        renderItem={renderAlerta}
        keyExtractor={(item) => item.id_encargo.toString()}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name="checkmark-circle-outline"
              size={80}
              color={theme.border}
            />
            <Text style={[styles.emptyText, { color: theme.icon }]}>
              ¡Todo al día! No hay pedidos próximos a vencer.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerPrincipal: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 8,
    gap: 10,
  },
  subtitulo: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    fontSize: 14,
    fontWeight: "500",
  },
  tituloPagina: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  contador: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  contadorText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  lista: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    borderRadius: 20,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  prioridadBar: { width: 6 },
  cardContent: { flex: 1, padding: 16 },
  headerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  hora: { fontSize: 13, fontWeight: "600" },
  cliente: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  producto: { fontSize: 15, fontWeight: "500", marginBottom: 12 },
  footerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
  },
  total: { fontSize: 20, fontWeight: "800" },
  btnEntregar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  emptyState: { alignItems: "center", marginTop: 100, opacity: 0.6 },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
    textAlign: "center",
  },
});
