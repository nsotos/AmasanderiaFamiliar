import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { setupDatabase } from '../../database';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface VentaGrupo {
  // Identificador único del grupo (o id_venta si es individual)
  clave: string;
  grupo_venta: string | null;
  producto: string;       // Nombre del único producto, o "Venta de X productos"
  cantidad: number;       // Total de unidades
  total_venta: number;    // Total combinado
  fecha: string;
  num_items: number;      // Cuántas filas componen este grupo
  es_encargo: boolean;
}

interface VentaDetalle {
  id_venta: number;
  producto: string;
  cantidad: number;
  total_venta: number;
}

const PAGE_SIZE = 15;

const formatearFecha = (fechaString: string) => {
  if (!fechaString) return 'Fecha desconocida';
  const fechaNormalizada = fechaString.replace(' ', 'T') + 'Z';
  const fecha = new Date(fechaNormalizada);
  if (isNaN(fecha.getTime())) return fechaString;
  const dia = fecha.getDate().toString().padStart(2, '0');
  const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const anio = fecha.getFullYear();
  let horasNum = fecha.getHours();
  const ampm = horasNum >= 12 ? 'PM' : 'AM';
  horasNum = horasNum % 12 || 12;
  const horas = horasNum.toString().padStart(2, '0');
  const minutos = fecha.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes}/${anio} ${horas}:${minutos} ${ampm}`;
};

// Parsea "Encargo de [cliente]|[detalle]" devolviendo { titulo, subtitulo }
const parsearDescripcion = (desc: string) => {
  if (desc && desc.includes('|')) {
    const partes = desc.split('|');
    return { titulo: partes[0].trim(), subtitulo: partes.slice(1).join('|').trim() };
  }
  return { titulo: desc, subtitulo: null };
};

export default function VentasScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();

  const [grupos, setGrupos] = useState<VentaGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalGrupos, setTotalGrupos] = useState(0);

  // Modal detalle
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [detalleItems, setDetalleItems] = useState<VentaDetalle[]>([]);
  const [detalleTitulo, setDetalleTitulo] = useState('');
  const [detalleTotal, setDetalleTotal] = useState(0);

  const totalPaginas = Math.max(1, Math.ceil(totalGrupos / PAGE_SIZE));

  const cargarGrupos = async (pagina: number, isRefresh = false) => {
    if (isRefresh) setRefrescando(true);
    else setCargando(true);

    try {
      const db = await setupDatabase();

      // Contar grupos únicos
      const countResult = await db.getAllAsync(`
        SELECT COUNT(DISTINCT COALESCE(grupo_venta, CAST(id_venta AS TEXT))) as total
        FROM ventas
      `) as { total: number }[];
      setTotalGrupos(countResult[0]?.total ?? 0);

      // Cargar página agrupada
      const offset = (pagina - 1) * PAGE_SIZE;
      const resultado = await db.getAllAsync(`
        SELECT
          COALESCE(v.grupo_venta, CAST(v.id_venta AS TEXT)) AS clave,
          v.grupo_venta,
          CASE
            WHEN COUNT(*) > 1 THEN 'Venta de ' || COUNT(*) || ' productos'
            ELSE COALESCE(v.descripcion, p.nombre, 'Producto desconocido')
          END AS producto,
          SUM(v.cantidad) AS cantidad,
          SUM(v.total_venta) AS total_venta,
          MAX(v.fecha) AS fecha,
          COUNT(*) AS num_items,
          CASE WHEN v.descripcion LIKE 'Encargo de%' THEN 1 ELSE 0 END AS es_encargo
        FROM ventas v
        LEFT JOIN productos p ON v.id_producto = p.id_producto
        GROUP BY COALESCE(v.grupo_venta, CAST(v.id_venta AS TEXT))
        ORDER BY MAX(v.fecha) DESC
        LIMIT ? OFFSET ?
      `, [PAGE_SIZE, offset]) as VentaGrupo[];

      setGrupos(resultado);
    } catch (error) {
      console.error('Error al cargar ventas:', error);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setPaginaActual(1);
      cargarGrupos(1);
    }, [])
  );

  const irAPagina = (pagina: number) => {
    if (pagina < 1 || pagina > totalPaginas) return;
    setPaginaActual(pagina);
    cargarGrupos(pagina);
  };

  const eliminarGrupo = (grupo: VentaGrupo) => {
    Alert.alert(
      'Eliminar venta',
      `¿Eliminar este registro de venta? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await setupDatabase();
              if (grupo.grupo_venta) {
                // Eliminar todas las filas del grupo
                await db.runAsync('DELETE FROM ventas WHERE grupo_venta = ?', [grupo.grupo_venta]);
              } else {
                await db.runAsync('DELETE FROM ventas WHERE id_venta = CAST(? AS INTEGER)', [grupo.clave]);
              }
              cargarGrupos(paginaActual);
            } catch (error) {
              console.error('Error al eliminar venta:', error);
              Alert.alert('Error', 'No se pudo eliminar la venta.');
            }
          },
        },
      ]
    );
  };

  const abrirDetalle = async (grupo: VentaGrupo) => {
    try {
      const db = await setupDatabase();
      let items: VentaDetalle[] = [];

      if (grupo.grupo_venta) {
        // Múltiples ventas del mismo carrito
        items = await db.getAllAsync(`
          SELECT v.id_venta,
            COALESCE(v.descripcion, p.nombre, 'Producto desconocido') AS producto,
            v.cantidad, v.total_venta
          FROM ventas v
          LEFT JOIN productos p ON v.id_producto = p.id_producto
          WHERE v.grupo_venta = ?
          ORDER BY v.id_venta ASC
        `, [grupo.grupo_venta]) as VentaDetalle[];
      } else {
        // Venta individual
        items = await db.getAllAsync(`
          SELECT v.id_venta,
            COALESCE(v.descripcion, p.nombre, 'Producto desconocido') AS producto,
            v.cantidad, v.total_venta
          FROM ventas v
          LEFT JOIN productos p ON v.id_producto = p.id_producto
          WHERE CAST(v.id_venta AS TEXT) = ?
        `, [grupo.clave]) as VentaDetalle[];
      }

      setDetalleItems(items);
      setDetalleTitulo(formatearFecha(grupo.fecha));
      setDetalleTotal(grupo.total_venta);
      setDetalleVisible(true);
    } catch (error) {
      console.error('Error al cargar detalle:', error);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={72} color={theme.border} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin ventas aún</Text>
      <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
        Toca el botón de abajo para registrar la primera venta del día.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            Historial de Ventas
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {totalGrupos > 0
              ? `${totalGrupos} registro${totalGrupos !== 1 ? 's' : ''} en total`
              : 'Supervisa los ingresos'}
          </Text>
        </View>

        {/* Lista */}
        {cargando && !refrescando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        ) : (
          <FlatList
            data={grupos}
            keyExtractor={(item) => item.clave}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              grupos.length === 0 ? styles.listEmpty : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refrescando}
                onRefresh={() => { setPaginaActual(1); cargarGrupos(1, true); }}
                colors={[theme.tint]}
                tintColor={theme.tint}
              />
            }
            ListFooterComponent={
              totalGrupos > 0 ? (
                <View style={[styles.paginacion, { borderTopColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.paginaBtn, { backgroundColor: theme.card, borderColor: theme.border }, paginaActual === 1 && styles.paginaBtnDisabled]}
                    onPress={() => irAPagina(paginaActual - 1)}
                    disabled={paginaActual === 1}
                  >
                    <Ionicons name="chevron-back" size={20} color={paginaActual === 1 ? theme.border : theme.tint} />
                  </TouchableOpacity>

                  <View style={[styles.paginaInfo, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.paginaTexto, { color: theme.text }]}>
                      Página <Text style={{ color: theme.tint, fontWeight: '800' }}>{paginaActual}</Text> de <Text style={{ fontWeight: '700' }}>{totalPaginas}</Text>
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.paginaBtn, { backgroundColor: theme.card, borderColor: theme.border }, paginaActual === totalPaginas && styles.paginaBtnDisabled]}
                    onPress={() => irAPagina(paginaActual + 1)}
                    disabled={paginaActual === totalPaginas}
                  >
                    <Ionicons name="chevron-forward" size={20} color={paginaActual === totalPaginas ? theme.border : theme.tint} />
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const esGrupo = item.num_items > 1;
              const esEncargo = !!item.es_encargo;
              const { titulo, subtitulo } = parsearDescripcion(item.producto);
              return (
                <TouchableOpacity
                  style={[styles.saleCard, { backgroundColor: theme.card, borderColor: esEncargo ? '#FBBF24' : theme.border }]}
                  onPress={() => abrirDetalle(item)}
                  onLongPress={() => eliminarGrupo(item)}
                  delayLongPress={500}
                  activeOpacity={0.75}
                >
                  {/* Ícono */}
                  <View style={[styles.iconBox, { backgroundColor: esEncargo ? '#FBBF2418' : `${theme.tint}15` }]}>
                    <Ionicons
                      name={esEncargo ? 'clipboard' : esGrupo ? 'layers' : 'cart'}
                      size={24}
                      color={esEncargo ? '#FBBF24' : theme.tint}
                    />
                  </View>

                  {/* Info */}
                  <View style={styles.saleInfo}>
                    <Text style={[styles.saleTitle, { color: theme.text }]} numberOfLines={1}>
                      {titulo}
                    </Text>
                    {subtitulo ? (
                      <Text style={[styles.saleSubtitulo, { color: theme.icon }]} numberOfLines={1}>
                        {subtitulo}
                      </Text>
                    ) : (
                      <Text style={[styles.saleDate, { color: theme.icon }]}>
                        {formatearFecha(item.fecha)}
                      </Text>
                    )}
                    {subtitulo && (
                      <Text style={[styles.saleDate, { color: theme.icon }]}>
                        {formatearFecha(item.fecha)}
                      </Text>
                    )}
                  </View>

                  {/* Montos + indicador detalle */}
                  <View style={styles.saleAmounts}>
                    <Text style={[styles.saleTotal, { color: theme.tint }]}>
                      ${item.total_venta.toLocaleString()}
                    </Text>
                    <View style={styles.saleQtyRow}>
                      <Text style={[styles.saleQty, { color: theme.icon }]}>
                        {item.cantidad} un.
                      </Text>
                      {esGrupo && (
                        <Ionicons name="chevron-forward" size={14} color={theme.icon} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* Botón grande de Nueva Venta */}
      <View style={[styles.footerBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.nuevaVentaBtn, { backgroundColor: theme.tint }]}
          onPress={() => router.push('/venta-modal')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Registrar nueva venta"
        >
          <Ionicons name="add-circle" size={32} color="#FFF" />
          <Text style={styles.nuevaVentaBtnText}>Nueva Venta</Text>
        </TouchableOpacity>
      </View>

      {/* ======== MODAL DETALLE DE VENTA GRUPAL ======== */}
      <Modal
        visible={detalleVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetalleVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            {/* Header modal */}
            <View style={styles.modalHeader}>
              <View style={styles.dragIndicatorContainer}>
                <View style={[styles.dragIndicator, { backgroundColor: theme.border }]} />
              </View>
              <View style={styles.modalTituloRow}>
                <View>
                  <Text style={[styles.modalTitulo, { color: theme.text }]}>Detalle de Venta</Text>
                  <Text style={[styles.modalFecha, { color: theme.icon }]}>{detalleTitulo}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDetalleVisible(false)}
                  style={[styles.cerrarBtn, { backgroundColor: theme.background }]}
                >
                  <Ionicons name="close" size={18} color={theme.icon} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Lista de ítems */}
            <FlatList
              data={detalleItems}
              keyExtractor={(item) => item.id_venta.toString()}
              contentContainerStyle={styles.detalleList}
              renderItem={({ item }) => {
                const { titulo, subtitulo } = parsearDescripcion(item.producto);
                return (
                  <View style={[styles.detalleItem, { borderBottomColor: theme.border }]}>
                    <View style={styles.detalleItemInfo}>
                      <Text style={[styles.detalleNombre, { color: theme.text }]}>{titulo}</Text>
                      {subtitulo && (
                        <Text style={[styles.detalleSubtituloModal, { color: theme.icon }]}>{subtitulo}</Text>
                      )}
                      <Text style={[styles.detalleCantidad, { color: theme.icon }]}>{item.cantidad} unidad(es)</Text>
                    </View>
                    <Text style={[styles.detalleSubtotal, { color: theme.tint }]}>
                      ${item.total_venta.toLocaleString()}
                    </Text>
                  </View>
                );
              }}
              ListFooterComponent={
                <View style={[styles.detalleTotalRow, { borderTopColor: theme.border }]}>
                  <Text style={[styles.detalleTotalLabel, { color: theme.icon }]}>Total</Text>
                  <Text style={[styles.detalleTotalValor, { color: theme.tint }]}>
                    ${detalleTotal.toLocaleString()}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  centerAll: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 20 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, fontWeight: '400' },
  listContainer: { paddingBottom: 8 },
  listEmpty: { flex: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24 },

  saleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  saleInfo: { flex: 1, marginRight: 12 },
  saleTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  saleSubtitulo: { fontSize: 12, fontStyle: 'italic', marginBottom: 2 },
  saleDate: { fontSize: 13 },
  saleAmounts: { alignItems: 'flex-end' },
  saleTotal: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  saleQtyRow: { flexDirection: 'row', alignItems: 'center' },
  saleQty: { fontSize: 13, fontWeight: '500' },

  /* Paginación */
  paginacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderTopWidth: 1,
    marginTop: 4,
  },
  paginaBtn: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  paginaBtnDisabled: { opacity: 0.35 },
  paginaInfo: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  paginaTexto: { fontSize: 15, fontWeight: '600' },

  /* Footer */
  footerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    borderTopWidth: 1,
  },
  nuevaVentaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 20, borderRadius: 20,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  nuevaVentaBtnText: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },

  /* Modal detalle */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '75%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 10,
  },
  modalHeader: { paddingHorizontal: 24 },
  dragIndicatorContainer: { alignItems: 'center', paddingVertical: 12 },
  dragIndicator: { width: 40, height: 5, borderRadius: 3 },
  modalTituloRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  modalTitulo: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  modalFecha: { fontSize: 14 },
  cerrarBtn: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  detalleList: { paddingHorizontal: 24, paddingBottom: 8 },
  detalleItem: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1,
  },
  detalleItemInfo: { flex: 1 },
  detalleNombre: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  detalleSubtituloModal: { fontSize: 13, fontStyle: 'italic', marginBottom: 4 },
  detalleCantidad: { fontSize: 13 },
  detalleSubtotal: { fontSize: 16, fontWeight: '800' },
  detalleTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingTop: 16, paddingHorizontal: 24,
    marginTop: 4, borderTopWidth: 1,
  },
  detalleTotalLabel: { fontSize: 16, fontWeight: '600' },
  detalleTotalValor: { fontSize: 24, fontWeight: '800' },
});
