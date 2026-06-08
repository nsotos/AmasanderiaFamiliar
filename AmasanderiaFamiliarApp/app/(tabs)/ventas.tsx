import React, { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setupDatabase } from '../../database';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

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

// Tipos para la lista con encabezados de día
type ListItem =
  | { type: 'header'; dateLabel: string; dayKey: string }
  | { type: 'venta'; data: VentaGrupo };

// Formatea el encabezado de día (Hoy / Ayer / fecha)
const formatDayLabel = (fechaStr: string): string => {
  const normalized = fechaStr.replace(' ', 'T') + (fechaStr.includes('Z') ? '' : 'Z');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return fechaStr.substring(0, 10);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const num = d.getDate();
  const mes = meses[d.getMonth()];
  const anioSufijo = d.getFullYear() !== hoy.getFullYear() ? ` ${d.getFullYear()}` : '';
  if (d.toDateString() === hoy.toDateString()) return `Hoy, ${num} ${mes}`;
  if (d.toDateString() === ayer.toDateString()) return `Ayer, ${num} ${mes}`;
  return `${num} ${mes}${anioSufijo}`;
};

// Construye el array de la lista inyectando encabezados por día
const buildListData = (grupos: VentaGrupo[]): ListItem[] => {
  const items: ListItem[] = [];
  let lastKey = '';
  for (const g of grupos) {
    const normalized = g.fecha.replace(' ', 'T') + (g.fecha.includes('Z') ? '' : 'Z');
    const d = new Date(normalized);
    const dayKey = isNaN(d.getTime()) ? g.fecha.substring(0, 10) : d.toDateString();
    if (dayKey !== lastKey) {
      items.push({ type: 'header', dateLabel: formatDayLabel(g.fecha), dayKey });
      lastKey = dayKey;
    }
    items.push({ type: 'venta', data: g });
  }
  return items;
};

export default function VentasScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();

  const [grupos, setGrupos] = useState<VentaGrupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtroFecha, setFiltroFecha] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Modal detalle
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [detalleItems, setDetalleItems] = useState<VentaDetalle[]>([]);
  const [detalleTitulo, setDetalleTitulo] = useState('');
  const [detalleTotal, setDetalleTotal] = useState(0);

  const getQueryGrupos = (conFiltro: boolean) => `
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
    ${conFiltro ? "WHERE substr(v.fecha, 1, 10) = ?" : ""}
    GROUP BY COALESCE(v.grupo_venta, CAST(v.id_venta AS TEXT))
    ORDER BY MAX(v.fecha) DESC
    LIMIT ? OFFSET ?
  `;

  const cargarGrupos = async (isRefresh = false, fecha: Date | null = filtroFecha) => {
    if (isRefresh) setRefrescando(true);
    else setCargando(true);
    try {
      const db = await setupDatabase();
      const params: any[] = [];
      if (fecha) {
        // Formato ISO: YYYY-MM-DD
        const pad = (n: number) => n.toString().padStart(2, '0');
        params.push(`${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`);
      }
      params.push(PAGE_SIZE, 0);

      const resultado = await db.getAllAsync(getQueryGrupos(!!fecha), params) as VentaGrupo[];
      setGrupos(resultado);
      setHasMore(resultado.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error al cargar ventas:', error);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  };

  const cargarMas = async () => {
    if (cargandoMas || !hasMore) return;
    setCargandoMas(true);
    try {
      const db = await setupDatabase();
      const params: any[] = [];
      if (filtroFecha) {
        const pad = (n: number) => n.toString().padStart(2, '0');
        params.push(`${filtroFecha.getFullYear()}-${pad(filtroFecha.getMonth() + 1)}-${pad(filtroFecha.getDate())}`);
      }
      params.push(PAGE_SIZE, grupos.length);

      const resultado = await db.getAllAsync(getQueryGrupos(!!filtroFecha), params) as VentaGrupo[];
      setGrupos(prev => [...prev, ...resultado]);
      setHasMore(resultado.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error al cargar más ventas:', error);
    } finally {
      setCargandoMas(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFiltroFecha(selectedDate);
      cargarGrupos(false, selectedDate);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargarGrupos();
    }, [])
  );

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
              cargarGrupos();
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
        {/* Cabecera + botón Nueva Venta */}
        <View style={styles.header}>
          {/* Botón Nueva Venta — encima del título */}
          <TouchableOpacity
            style={[styles.nuevaVentaBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push('/venta-modal')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Registrar nueva venta"
          >
            <Ionicons name="add-circle" size={48} color="#FFF" />
            <Text style={styles.nuevaVentaBtnText}>Nueva Venta</Text>
          </TouchableOpacity>

          <View style={[styles.headerTop, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <View>
              <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
                Historial de Ventas
              </Text>
              <Text style={[styles.subtitle, { color: theme.icon }]}>
                {filtroFecha
                  ? `Filtrado por: ${filtroFecha.toLocaleDateString()}`
                  : grupos.length > 0
                    ? `${grupos.length}+ registros cargados`
                    : 'Supervisa los ingresos'}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {filtroFecha && (
                <TouchableOpacity
                  style={{ marginRight: 12 }}
                  onPress={() => {
                    setFiltroFecha(null);
                    cargarGrupos(false, null);
                  }}
                >
                  <Ionicons name="close-circle" size={24} color={theme.icon} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                style={{ padding: 8, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
              >
                <Ionicons name="calendar" size={24} color={filtroFecha ? theme.tint : theme.icon} />
              </TouchableOpacity>
            </View>
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
              item.type === 'header' ? `h_${item.dayKey}` : item.data.clave
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              grupos.length === 0 ? styles.listEmpty : styles.listContainer
            }
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refrescando}
                onRefresh={() => cargarGrupos(true)}
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
            renderItem={({ item }) => {
              // Encabezado de día
              if (item.type === 'header') {
                return (
                  <View style={styles.dayHeader}>
                    <View style={[styles.dayHeaderLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.dayHeaderText, { color: theme.icon, backgroundColor: theme.background }]}>
                      {item.dateLabel}
                    </Text>
                    <View style={[styles.dayHeaderLine, { backgroundColor: theme.border }]} />
                  </View>
                );
              }

              // Tarjeta de venta
              const venta = item.data;
              const esGrupo = venta.num_items > 1;
              const esEncargo = !!venta.es_encargo;
              const { titulo, subtitulo } = parsearDescripcion(venta.producto);
              return (
                <TouchableOpacity
                  style={[styles.saleCard, { backgroundColor: theme.card, borderColor: esEncargo ? '#FBBF24' : theme.border }]}
                  onPress={() => abrirDetalle(venta)}
                  onLongPress={() => eliminarGrupo(venta)}
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
                        {formatearFecha(venta.fecha)}
                      </Text>
                    )}
                    {subtitulo && (
                      <Text style={[styles.saleDate, { color: theme.icon }]}>
                        {formatearFecha(venta.fecha)}
                      </Text>
                    )}
                  </View>

                  {/* Montos + indicador detalle */}
                  <View style={styles.saleAmounts}>
                    <Text style={[styles.saleTotal, { color: theme.tint }]}>
                      ${venta.total_venta.toLocaleString()}
                    </Text>
                    <View style={styles.saleQtyRow}>
                      <Text style={[styles.saleQty, { color: theme.icon }]}>
                        {venta.cantidad} un.
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



      {/* ======== MODAL DETALLE DE VENTA GRUPAL ======== */}
      <Modal
        visible={detalleVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDetalleVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setDetalleVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
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
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  centerAll: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { marginBottom: 20 },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 28,
    marginBottom: 16,
  },
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

  /* Encabezados de día e infinite scroll */
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 4,
  },
  dayHeaderLine: {
    flex: 1,
    height: 1,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  nuevaVentaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 14, paddingVertical: 18, borderRadius: 18,
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
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
