import React, { useCallback, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { setupDatabase } from "../../database";
import {
  type FiltroTiempo,
  type ReporteStats,
  calcularTendencia,
  cargarReporteStats,
  etiquetaComparacion,
  etiquetaFiltro,
  etiquetaFiltroCorta,
  formatearDiaCorto,
  formatearMonto,
} from "@/utils/statsService";

const FILTROS: FiltroTiempo[] = ["DIARIO", "SEMANAL", "MENSUAL", "HISTORICO"];

const REPORTE_VACIO: ReporteStats = {
  ventas: {
    total_general: 0,
    total_pan: 0,
    total_encargos: 0,
    num_transacciones: 0,
    unidades_vendidas: 0,
    ticket_promedio: 0,
  },
  ventasPeriodoAnterior: {
    total_general: 0,
    total_pan: 0,
    total_encargos: 0,
    num_transacciones: 0,
    unidades_vendidas: 0,
    ticket_promedio: 0,
  },
  ranking: [],
  ventasPorDia: [],
  encargos: {
    pendientes: 0,
    entregados: 0,
    valor_pendiente: 0,
    fiados_activos: 0,
  },
  deudas: { total_deuda: 0, clientes_con_deuda: 0 },
};

interface KpiCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  theme: (typeof Colors)["light"];
}

function KpiCard({ icon, label, value, color, theme }: KpiCardProps) {
  return (
    <View
      style={[
        styles.kpiCard,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View style={[styles.kpiIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.kpiLabel, { color: theme.icon }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export default function ReportesScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [filtroActivo, setFiltroActivo] = useState<FiltroTiempo>("DIARIO");
  const [reporte, setReporte] = useState<ReporteStats>(REPORTE_VACIO);
  const haCargadoRef = useRef(false);
  const filtroRef = useRef(filtroActivo);
  filtroRef.current = filtroActivo;

  const cargarReporte = useCallback(
    async (filtro: FiltroTiempo, silencioso = false) => {
      if (!silencioso && !haCargadoRef.current) setCargandoInicial(true);
      try {
        const db = await setupDatabase();
        const data = await cargarReporteStats(db, filtro);
        setReporte(data);
        haCargadoRef.current = true;
      } catch (error) {
        console.error("Error al cargar reportes:", error);
      } finally {
        setCargandoInicial(false);
        setRefrescando(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      cargarReporte(filtroRef.current, haCargadoRef.current);
    }, [cargarReporte]),
  );

  const cambiarFiltro = (filtro: FiltroTiempo) => {
    if (filtro === filtroActivo) return;
    setFiltroActivo(filtro);
    cargarReporte(filtro, true);
  };

  const onRefresh = () => {
    setRefrescando(true);
    cargarReporte(filtroActivo, true);
  };

  const { ventas, ventasPeriodoAnterior, ranking, ventasPorDia, encargos, deudas } =
    reporte;

  const tendencia = calcularTendencia(
    ventas.total_general,
    ventasPeriodoAnterior.total_general,
  );
  const comparacionLabel = etiquetaComparacion(filtroActivo);
  const maxBarra = Math.max(...ventasPorDia.map((d) => d.total), 1);
  const maxRanking = ranking[0]?.cantidad_vendida ?? 1;
  const pctPan =
    ventas.total_general > 0
      ? Math.round((ventas.total_pan / ventas.total_general) * 100)
      : 0;
  const pctEncargos = 100 - pctPan;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Estadísticas</Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            Resumen del negocio
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          onPress={onRefresh}
          disabled={cargandoInicial}
        >
          <Ionicons name="refresh" size={20} color={theme.tint} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.tabsContainer,
          {
            backgroundColor: colorScheme === "dark" ? "#1E293B" : "#E2E8F0",
          },
        ]}
      >
        {FILTROS.map((f) => {
          const activo = filtroActivo === f;
          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.tab,
                activo && {
                  backgroundColor: theme.card,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: colorScheme === "dark" ? 0.3 : 0.12,
                  shadowRadius: 3,
                  elevation: 2,
                },
              ]}
              onPress={() => cambiarFiltro(f)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activo ? theme.tint : theme.icon },
                ]}
                numberOfLines={1}
              >
                {etiquetaFiltroCorta(f)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {cargandoInicial ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={theme.tint} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={onRefresh}
              tintColor={theme.tint}
            />
          }
        >
          <View style={[styles.totalCard, { backgroundColor: theme.tint }]}>
            <View style={styles.totalHeader}>
              <Text style={styles.totalLabel}>
                Ingresos · {etiquetaFiltro(filtroActivo)}
              </Text>
              {comparacionLabel && tendencia.visible && (
                <View
                  style={[
                    styles.trendBadge,
                    {
                      backgroundColor: tendencia.positiva
                        ? "rgba(20,184,166,0.25)"
                        : "rgba(239,68,68,0.25)",
                    },
                  ]}
                >
                  <Ionicons
                    name={tendencia.positiva ? "trending-up" : "trending-down"}
                    size={14}
                    color="#FFF"
                  />
                  <Text style={styles.trendText}>
                    {tendencia.texto} {comparacionLabel}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.totalValue}>
              {formatearMonto(ventas.total_general)}
            </Text>
            {filtroActivo !== "HISTORICO" && (
              <Text style={styles.totalSub}>
                Período anterior:{" "}
                {formatearMonto(ventasPeriodoAnterior.total_general)}
              </Text>
            )}
          </View>

          <View style={styles.kpiGrid}>
            <KpiCard
              icon="receipt-outline"
              label="Transacciones"
              value={ventas.num_transacciones.toLocaleString("es-CL")}
              color="#2563EB"
              theme={theme}
            />
            <KpiCard
              icon="pricetag-outline"
              label="Ticket promedio"
              value={formatearMonto(ventas.ticket_promedio)}
              color="#8B5CF6"
              theme={theme}
            />
            <KpiCard
              icon="layers-outline"
              label="Unidades"
              value={ventas.unidades_vendidas.toLocaleString("es-CL")}
              color="#F59E0B"
              theme={theme}
            />
            <KpiCard
              icon="pie-chart-outline"
              label="Encargos"
              value={`${pctEncargos}%`}
              color="#16A34A"
              theme={theme}
            />
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Origen de ingresos
            </Text>
            <View style={styles.splitBar}>
              {pctPan > 0 && (
                <View
                  style={[styles.splitSegment, { flex: pctPan, backgroundColor: "#EA580C" }]}
                />
              )}
              {pctEncargos > 0 && (
                <View
                  style={[
                    styles.splitSegment,
                    { flex: pctEncargos, backgroundColor: "#16A34A" },
                  ]}
                />
              )}
              {ventas.total_general === 0 && (
                <View
                  style={[
                    styles.splitSegment,
                    { flex: 1, backgroundColor: theme.border },
                  ]}
                />
              )}
            </View>
            <View style={styles.splitLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#EA580C" }]} />
                <Text style={[styles.legendText, { color: theme.icon }]}>
                  Mostrador {formatearMonto(ventas.total_pan)}
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#16A34A" }]} />
                <Text style={[styles.legendText, { color: theme.icon }]}>
                  Encargos {formatearMonto(ventas.total_encargos)}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Últimos 7 días
            </Text>
            <View style={styles.chartRow}>
              {ventasPorDia.map((dia) => {
                const altura = Math.max(8, (dia.total / maxBarra) * 72);
                const d = new Date();
                const hoyLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const activo = dia.dia === hoyLocal;
                const etiquetaMonto =
                  dia.total >= 1000
                    ? `$${Math.round(dia.total / 1000)}k`
                    : dia.total > 0
                      ? `$${dia.total}`
                      : "·";

                return (
                  <View key={dia.dia} style={styles.barCol}>
                    <Text style={[styles.barValue, { color: theme.icon }]}>
                      {etiquetaMonto}
                    </Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: altura,
                          backgroundColor: activo ? theme.tint : `${theme.tint}55`,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.barLabel,
                        { color: activo ? theme.tint : theme.icon },
                      ]}
                    >
                      {formatearDiaCorto(dia.dia)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.rankingSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Productos más vendidos
            </Text>

            {ranking.length === 0 ? (
              <View
                style={[
                  styles.emptyBox,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <Ionicons name="bar-chart-outline" size={40} color={theme.border} />
                <Text style={[styles.emptyText, { color: theme.icon }]}>
                  No hay ventas en este período.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.rankingBox,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                {ranking.map((item, index) => {
                  const pct = Math.round(
                    (item.cantidad_vendida / maxRanking) * 100,
                  );
                  return (
                    <View
                      key={`${item.nombre}-${index}`}
                      style={[
                        styles.rankingItem,
                        index !== ranking.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: theme.border,
                        },
                      ]}
                    >
                      <View style={styles.rankingTop}>
                        <View style={styles.rankingPosition}>
                          <Text style={styles.positionText}>{index + 1}</Text>
                        </View>
                        <View style={styles.rankingInfo}>
                          <Text
                            style={[styles.rankingName, { color: theme.text }]}
                            numberOfLines={1}
                          >
                            {item.nombre}
                          </Text>
                          <Text
                            style={[styles.rankingDetails, { color: theme.icon }]}
                          >
                            {item.cantidad_vendida} unid. ·{" "}
                            {formatearMonto(item.ingreso_generado)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: theme.background },
                        ]}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${pct}%`, backgroundColor: theme.tint },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>
            Estado del negocio
          </Text>
          <View style={styles.negocioGrid}>
            <View
              style={[
                styles.negocioCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Ionicons name="hourglass-outline" size={22} color="#F59E0B" />
              <Text style={[styles.negocioValue, { color: theme.text }]}>
                {encargos.pendientes}
              </Text>
              <Text style={[styles.negocioLabel, { color: theme.icon }]}>
                Pedidos pendientes
              </Text>
              <Text style={[styles.negocioExtra, { color: "#F59E0B" }]}>
                {formatearMonto(encargos.valor_pendiente)} por cobrar
              </Text>
            </View>

            <View
              style={[
                styles.negocioCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Ionicons name="wallet-outline" size={22} color="#EF4444" />
              <Text style={[styles.negocioValue, { color: theme.text }]}>
                {formatearMonto(deudas.total_deuda)}
              </Text>
              <Text style={[styles.negocioLabel, { color: theme.icon }]}>
                Deuda vecinos
              </Text>
              <Text style={[styles.negocioExtra, { color: theme.icon }]}>
                {deudas.clientes_con_deuda} con saldo
              </Text>
            </View>

            <View
              style={[
                styles.negocioCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Ionicons name="checkmark-circle-outline" size={22} color="#16A34A" />
              <Text style={[styles.negocioValue, { color: theme.text }]}>
                {encargos.entregados}
              </Text>
              <Text style={[styles.negocioLabel, { color: theme.icon }]}>
                Pedidos entregados
              </Text>
              <Text style={[styles.negocioExtra, { color: theme.icon }]}>
                {encargos.fiados_activos} fiados activos
              </Text>
            </View>

            <View
              style={[
                styles.negocioCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <Ionicons name="stats-chart" size={22} color={theme.tint} />
              <Text style={[styles.negocioValue, { color: theme.text }]}>
                {ventas.unidades_vendidas}
              </Text>
              <Text style={[styles.negocioLabel, { color: theme.icon }]}>
                Unid. en período
              </Text>
              <Text style={[styles.negocioExtra, { color: theme.icon }]}>
                {ventas.num_transacciones} ventas
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "android" ? 40 : 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: { fontSize: 16, fontWeight: "400" },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginBottom: 20,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  totalCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  totalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  totalLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  trendText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  totalValue: {
    color: "#FFF",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 4,
  },
  totalSub: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: "500",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 10,
  },
  kpiCard: {
    width: "48%",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  splitBar: {
    flexDirection: "row",
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  splitSegment: {
    minWidth: 4,
  },
  splitLegend: {
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 14,
    fontWeight: "500",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 110,
    paddingTop: 8,
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barValue: {
    fontSize: 9,
    fontWeight: "600",
    marginBottom: 4,
    height: 12,
  },
  bar: {
    width: "70%",
    borderRadius: 6,
    minHeight: 8,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  rankingSection: {
    marginBottom: 8,
  },
  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
  },
  rankingBox: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  rankingItem: {
    padding: 16,
  },
  rankingTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  rankingPosition: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  positionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
  },
  rankingInfo: {
    flex: 1,
  },
  rankingName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  rankingDetails: {
    fontSize: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  negocioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  negocioCard: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  negocioValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  negocioLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  negocioExtra: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
});
