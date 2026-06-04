import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  SafeAreaView,
} from 'react-native';
import { setupDatabase } from '../../database';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

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

type Encargo = {
  id_encargo: number;
  cliente: string;
  telefono: string;
  detalle: string;
  fecha_entrega: string;
  estado: string;
  precio_total: number;
  abono: number;
};

const ESTADOS = ['Pendiente', 'En preparación', 'Terminado'];

const getColorEstado = (estado: string) => {
  if (estado === 'Terminado') return '#22C55E';
  if (estado === 'En preparación') return '#FBBF24';
  return '#F87171';
};

const formatearFechaDisplay = (fechaString: string) => {
  if (!fechaString) return '';
  const partes = fechaString.split(' ');
  if (partes.length < 2) return fechaString;
  const [anio, mes, dia] = partes[0].split('-');
  const hora = partes[1].substring(0, 5);
  return `${dia}/${mes}/${anio} a las ${hora}`;
};

export default function EncargosScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const [encargos, setEncargos] = useState<Encargo[]>([]);
  const [cargando, setCargando] = useState(true);
  // Modal y Pasos
  const [modalVisible, setModalVisible] = useState(false);
  const [pasoModal, setPasoModal] = useState<1 | 2>(1);

  // Carrito de productos
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // Form states (Paso 2)
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [abono, setAbono] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());

  // DateTimePicker states
  const [mostrarPickerFecha, setMostrarPickerFecha] = useState(false);
  const [mostrarPickerHora, setMostrarPickerHora] = useState(false);

  const totalCarrito = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnidades = carrito.reduce((sum, item) => sum + item.cantidad, 0);

  // ✅ Fix: useFocusEffect para recargar al volver a la pantalla
  const cargarDatos = async () => {
    setCargando(true);
    try {
      const db = await setupDatabase();
      const listaEncargos = await db.getAllAsync(
        'SELECT * FROM encargos ORDER BY fecha_entrega ASC'
      ) as Encargo[];
      setEncargos(listaEncargos);

      const listaProductos = await db.getAllAsync("SELECT * FROM productos WHERE nombre != '__ENCARGO_SISTEMA__'");
      setProductos(listaProductos as Producto[]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setCargando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [])
  );

  // Lógica de Carrito
  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existe = prev.find((item) => item.producto.id_producto === producto.id_producto);
      if (existe) {
        return prev.map((item) =>
          item.producto.id_producto === producto.id_producto
            ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * item.producto.precio_unitario }
            : item
        );
      }
      return [...prev, { producto, cantidad: 1, subtotal: producto.precio_unitario }];
    });
  };

  const quitarDelCarrito = (id: number) => {
    setCarrito((prev) => {
      return prev.map((item) => {
        if (item.producto.id_producto === id) {
          const nuevaCantidad = item.cantidad - 1;
          if (nuevaCantidad <= 0) return null;
          return { ...item, cantidad: nuevaCantidad, subtotal: nuevaCantidad * item.producto.precio_unitario };
        }
        return item;
      }).filter(Boolean) as ItemCarrito[];
    });
  };

  const eliminarDelCarrito = (producto: Producto) => {
    Alert.alert(
      "Quitar del carrito",
      `¿Eliminar todas las unidades de "${producto.nombre}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () =>
            setCarrito((prev) =>
              prev.filter((item) => item.producto.id_producto !== producto.id_producto)
            ),
        },
      ]
    );
  };

  const cantidadEnCarrito = (id: number) => {
    return carrito.find((item) => item.producto.id_producto === id)?.cantidad ?? 0;
  };

  const abrirModal = () => {
    setCliente('');
    setTelefono('');
    setCarrito([]);
    setPasoModal(1);
    setAbono('');
    setFechaSeleccionada(new Date());
    setModalVisible(true);
  };

  const guardarEncargo = async () => {
    if (!cliente.trim() || carrito.length === 0) {
      Alert.alert('Faltan datos', 'Debes ingresar el nombre del cliente y agregar al menos un producto al carrito.');
      return;
    }

    // Serializar el carrito para guardarlo en detalle
    const detalleJson = JSON.stringify(carrito.map(item => ({
      id_producto: item.producto.id_producto,
      nombre: item.producto.nombre,
      precio_unitario: item.producto.precio_unitario,
      cantidad: item.cantidad,
      subtotal: item.subtotal
    })));

    // Formato SQLite: YYYY-MM-DD HH:MM:SS
    const pad = (n: number) => n.toString().padStart(2, '0');
    const f = fechaSeleccionada;
    const fechaEntrega = `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())} ${pad(f.getHours())}:${pad(f.getMinutes())}:00`;
    const abonoNum = parseFloat(abono) || 0;
    const precioTotalNum = totalCarrito;

    try {
      const db = await setupDatabase();
      await db.runAsync(
        'INSERT INTO encargos (cliente, telefono, detalle, fecha_entrega, estado, precio_total, abono) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cliente.trim(), telefono.trim(), detalleJson, fechaEntrega, 'Pendiente', precioTotalNum, abonoNum]
      );
      setModalVisible(false);
      await cargarDatos();
      Alert.alert('✅ Éxito', 'Encargo guardado correctamente.');
    } catch (error) {
      console.error('Error al guardar encargo:', error);
      Alert.alert('Error', 'No se pudo guardar el encargo.');
    }
  };

  const cambiarEstado = async (id: number, estadoActual: string) => {
    // Flujo estrictamente unidireccional: no avanza si ya está Terminado
    const idxActual = ESTADOS.indexOf(estadoActual);
    if (idxActual === -1 || idxActual >= ESTADOS.length - 1) return;

    const nuevoEstado = ESTADOS[idxActual + 1];

    Alert.alert(
      'Cambiar estado',
      `¿Cambiar el pedido a "${nuevoEstado}"?${nuevoEstado === 'Terminado' ? '\nEsto registrará el pedido como venta.' : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              const db = await setupDatabase();
              await db.runAsync('UPDATE encargos SET estado = ? WHERE id_encargo = ?', [nuevoEstado, id]);

              // Al marcar como Terminado → registrar como venta automáticamente
              if (nuevoEstado === 'Terminado') {
                const encargo = encargos.find(e => e.id_encargo === id);
                if (encargo) {
                  let detalleVenta = encargo.detalle || 'Sin detalle';
                  try {
                    const items = JSON.parse(detalleVenta);
                    if (Array.isArray(items)) {
                      detalleVenta = items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
                    }
                  } catch {}
                  const descripcion = `Encargo de ${encargo.cliente}|${detalleVenta}`;
                  // Usar precio_total si está definido, si no usar abono
                  const total = encargo.precio_total > 0 ? encargo.precio_total : encargo.abono;
                  await db.runAsync(
                    'INSERT INTO ventas (id_producto, cantidad, total_venta, descripcion) VALUES (?, ?, ?, ?)',
                    [9999, 1, total, descripcion]
                  );
                }
              }

              await cargarDatos();
            } catch (error) {
              console.error('Error al actualizar estado:', error);
              Alert.alert('Error', 'No se pudo actualizar el estado.');
            }
          },
        },
      ]
    );
  };

  // ✅ Fix: eliminar encargo
  const eliminarEncargo = (item: Encargo) => {
    Alert.alert(
      'Eliminar encargo',
      '¿Eliminar el pedido de "' + item.cliente + '"? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await setupDatabase();
              await db.runAsync('DELETE FROM encargos WHERE id_encargo = ?', [item.id_encargo]);
              await cargarDatos();
            } catch (error) {
              console.error('Error al eliminar encargo:', error);
              Alert.alert('Error', 'No se pudo eliminar el encargo.');
            }
          },
        },
      ]
    );
  };

  const isUrgente = (fechaString: string, estado: string) => {
    if (!fechaString || estado === 'Terminado') return false;
    const fechaEntrega = new Date(fechaString.replace(' ', 'T'));
    const difHoras = (fechaEntrega.getTime() - Date.now()) / (1000 * 60 * 60);
    return difHoras > 0 && difHoras <= 3;
  };

  const renderEncargo = ({ item }: { item: Encargo }) => {
    const urgente = isUrgente(item.fecha_entrega, item.estado);
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: urgente ? '#F87171' : theme.border },
          urgente && styles.cardUrgente,
        ]}
      >
        {/* Encabezado */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={[styles.cardCliente, { color: theme.text }]}>{item.cliente}</Text>
            {item.telefono ? (
              <Text style={[styles.cardTelefono, { color: theme.icon }]}>📞 {item.telefono}</Text>
            ) : null}
          </View>
          <View style={styles.cardHeaderRight}>
            {urgente && (
              <View style={styles.badgeUrgente}>
                <Text style={styles.badgeUrgenteText}>¡URGENTE!</Text>
              </View>
            )}
            {/* ✅ Fix: botón eliminar */}
            <TouchableOpacity
              style={styles.eliminarBtn}
              onPress={() => eliminarEncargo(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#F87171" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Detalle */}
        {(() => {
          try {
            const items = JSON.parse(item.detalle);
            if (Array.isArray(items)) {
              return (
                <View style={{ marginBottom: 12 }}>
                  {items.map((i: any, idx: number) => (
                    <Text key={idx} style={[styles.cardDetalle, { color: theme.text, marginBottom: 2, fontSize: 15 }]}>
                      • {i.cantidad}x {i.nombre}
                    </Text>
                  ))}
                </View>
              );
            }
            throw new Error();
          } catch {
            // Texto libre (pedidos antiguos)
            return <Text style={[styles.cardDetalle, { color: theme.text }]}>{item.detalle}</Text>;
          }
        })()}

        {/* Fecha, precio, abono y saldo */}
        <View style={styles.cardMeta}>
          <View style={[styles.metaChip, { backgroundColor: `${theme.tint}12` }]}>
            <Ionicons name="calendar-outline" size={14} color={theme.tint} />
            <Text style={[styles.metaTexto, { color: theme.tint }]}>
              {formatearFechaDisplay(item.fecha_entrega)}
            </Text>
          </View>
          {item.precio_total > 0 && (
            <View style={[styles.metaChip, { backgroundColor: '#6366F118' }]}>
              <Ionicons name="pricetag-outline" size={14} color="#6366F1" />
              <Text style={[styles.metaTexto, { color: '#6366F1' }]}>
                Total: ${item.precio_total.toLocaleString()}
              </Text>
            </View>
          )}
          {item.abono > 0 && (
            <View style={[styles.metaChip, { backgroundColor: '#22C55E18' }]}>
              <Ionicons name="cash-outline" size={14} color="#22C55E" />
              <Text style={[styles.metaTexto, { color: '#22C55E' }]}>
                Abono: ${item.abono.toLocaleString()}
              </Text>
            </View>
          )}
          {item.precio_total > 0 && (
            <View style={[styles.metaChip, { backgroundColor: '#F8711818' }]}>
              <Ionicons name="alert-circle-outline" size={14} color="#F87118" />
              <Text style={[styles.metaTexto, { color: '#F87118' }]}>
                Saldo: ${Math.max(0, item.precio_total - item.abono).toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Botón de estado */}
        <TouchableOpacity
          style={[
            styles.estadoBtn,
            { backgroundColor: getColorEstado(item.estado) },
            item.estado === 'Terminado' && styles.estadoBtnTerminado,
          ]}
          onPress={() => cambiarEstado(item.id_encargo, item.estado)}
          disabled={item.estado === 'Terminado'}
          activeOpacity={0.8}
        >
          <Text style={styles.estadoBtnText}>{item.estado.toUpperCase()}</Text>
          {item.estado !== 'Terminado' && (
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  // Label de la fecha seleccionada para el botón
  const pad = (n: number) => n.toString().padStart(2, '0');
  const f = fechaSeleccionada;
  const fechaLabel = `${pad(f.getDate())}/${pad(f.getMonth() + 1)}/${f.getFullYear()}`;
  const horaLabel = `${pad(f.getHours())}:${pad(f.getMinutes())}`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {/* Cabecera */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            Agenda de Pedidos
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {encargos.length > 0
              ? `${encargos.length} pedido${encargos.length !== 1 ? 's' : ''} registrado${encargos.length !== 1 ? 's' : ''}`
              : 'Sin pedidos pendientes'}
          </Text>
        </View>

        {/* Lista */}
        {cargando ? (
          <View style={styles.centerAll}>
            <ActivityIndicator size="large" color={theme.tint} />
          </View>
        ) : (
          <FlatList
            data={encargos}
            keyExtractor={(item) => item.id_encargo.toString()}
            renderItem={renderEncargo}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={
              encargos.length === 0 ? styles.listEmpty : styles.listContainer
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="clipboard-outline" size={72} color={theme.border} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Sin pedidos</Text>
                <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
                  Toca el botón de abajo para agregar un nuevo pedido.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Botón Nuevo Encargo */}
      <View style={[styles.footerBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.nuevoBtn, { backgroundColor: theme.tint }]}
          onPress={abrirModal}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={48} color="#FFF" />
          <Text style={styles.nuevoBtnText}>Nuevo Pedido</Text>
        </TouchableOpacity>
      </View>

      {/* ==================== MODAL FORMULARIO ==================== */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background }]}>

            {/* Header modal */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitulo, { color: theme.text }]}>Nuevo Pedido</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalCerrar, { backgroundColor: theme.card }]}>
                <Ionicons name="close" size={20} color={theme.icon} />
              </TouchableOpacity>
            </View>

            {pasoModal === 1 ? (
              <View style={{ flex: 1, minHeight: 400 }}>
                {productos.length === 0 ? (
                  <View style={[styles.centerAll, { paddingVertical: 40 }]}>
                    <ActivityIndicator size="large" color={theme.tint} />
                  </View>
                ) : (
                  <FlatList
                    data={productos}
                    keyExtractor={(item) => item.id_producto.toString()}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listaProductos}
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
                              enCarrito ? quitarDelCarrito(item.id_producto) : agregarAlCarrito(item)
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
                                { color: enCarrito ? "rgba(255,255,255,0.85)" : theme.tint },
                              ]}
                            >
                              ${item.precio_unitario.toLocaleString()}
                            </Text>
                            {enCarrito && (
                              <Text style={styles.hintText}>mantén para vaciar</Text>
                            )}
                          </TouchableOpacity>

                          {/* Divisor visual sutil cuando está en carrito */}
                          {enCarrito && (
                            <View style={styles.divisor} />
                          )}

                          {/* Mitad derecha — controles: − | cantidad | + */}
                          <View style={styles.mitadDerecha}>
                            {enCarrito ? (
                              <View style={styles.controlesCarrito}>
                                <TouchableOpacity
                                  style={styles.ctrlBtn}
                                  onPress={() => quitarDelCarrito(item.id_producto)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="remove-circle" size={30} color="rgba(255,255,255,0.85)" />
                                </TouchableOpacity>

                                <View style={[styles.badge, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                                  <Text style={[styles.badgeText, { color: "#FFF" }]}>{qty}</Text>
                                </View>

                                <TouchableOpacity
                                  style={styles.ctrlBtn}
                                  onPress={() => agregarAlCarrito(item)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="add-circle" size={30} color="rgba(255,255,255,0.85)" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={[styles.badge, { backgroundColor: `${theme.tint}18` }]}
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
                )}

                {/* Footer Paso 1 */}
                <View style={[styles.modalBotones, { marginTop: 16 }]}>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={[styles.totalLabel, { color: theme.icon }]}>{totalUnidades} ítems</Text>
                    <Text style={[styles.totalValue, { color: theme.text }]}>${totalCarrito.toLocaleString()}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.btnGuardar, { backgroundColor: carrito.length > 0 ? theme.tint : theme.border, flex: 1.5 }]}
                    onPress={() => setPasoModal(2)}
                    disabled={carrito.length === 0}
                  >
                    <Text style={styles.btnGuardarText}>Continuar →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Resumen Carrito */}
                <View style={[styles.resumenCarrito, { backgroundColor: `${theme.tint}12`, borderColor: theme.tint }]}>
                  <Text style={[styles.resumenTitulo, { color: theme.tint }]}>Resumen del pedido</Text>
                  {carrito.map(item => (
                    <Text key={item.producto.id_producto} style={[styles.resumenItem, { color: theme.text }]}>
                      {item.cantidad}x {item.producto.nombre}
                    </Text>
                  ))}
                  <Text style={[styles.resumenTotal, { color: theme.tint }]}>Total: ${totalCarrito.toLocaleString()}</Text>
                </View>

                {/* Cliente */}
                <Text style={[styles.label, { color: theme.text }]}>Nombre del cliente *</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
                  value={cliente}
                  onChangeText={setCliente}
                  placeholder="Ej. Doña María"
                  placeholderTextColor={theme.icon}
                />

                {/* Teléfono */}
                <Text style={[styles.label, { color: theme.text }]}>Teléfono (opcional)</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
                  value={telefono}
                  onChangeText={setTelefono}
                  placeholder="+56 9 1234 5678"
                  placeholderTextColor={theme.icon}
                  keyboardType="phone-pad"
                />

              {/* Abono */}
              <Text style={[styles.label, { color: theme.text }]}>Abono recibido ($)</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
                value={abono}
                onChangeText={setAbono}
                placeholder="0"
                placeholderTextColor={theme.icon}
                keyboardType="numeric"
              />

              {/* Saldo calculado automáticamente */}
              {(totalCarrito > 0 || parseFloat(abono) > 0) && (
                <View style={[styles.saldoBox, { backgroundColor: `${theme.tint}12`, borderColor: theme.border }]}>
                  <Text style={[styles.saldoLabel, { color: theme.icon }]}>Saldo pendiente</Text>
                  <Text style={[styles.saldoValor, { color: theme.tint }]}>
                    ${Math.max(0, totalCarrito - (parseFloat(abono) || 0)).toLocaleString()}
                  </Text>
                </View>
              )}

              {/* Fecha — botón que abre el calendario */}
              <Text style={[styles.label, { color: theme.text }]}>Fecha de entrega</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => setMostrarPickerFecha(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="calendar" size={22} color={theme.tint} />
                <Text style={[styles.pickerBtnText, { color: theme.text }]}>{fechaLabel}</Text>
                <Ionicons name="chevron-down" size={18} color={theme.icon} />
              </TouchableOpacity>

              {/* Hora — botón que abre el reloj */}
              <Text style={[styles.label, { color: theme.text }]}>Hora de entrega</Text>
              <TouchableOpacity
                style={[styles.pickerBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => setMostrarPickerHora(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="time" size={22} color={theme.tint} />
                <Text style={[styles.pickerBtnText, { color: theme.text }]}>{horaLabel}</Text>
                <Ionicons name="chevron-down" size={18} color={theme.icon} />
              </TouchableOpacity>

              {/* Pickers nativos de Android/iOS */}
              {mostrarPickerFecha && (
                <DateTimePicker
                  value={fechaSeleccionada}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    setMostrarPickerFecha(false);
                    if (date) {
                      const nueva = new Date(fechaSeleccionada);
                      nueva.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                      setFechaSeleccionada(nueva);
                    }
                  }}
                />
              )}

              {mostrarPickerHora && (
                <DateTimePicker
                  value={fechaSeleccionada}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                  is24Hour={true}
                  onChange={(_, date) => {
                    setMostrarPickerHora(false);
                    if (date) {
                      const nueva = new Date(fechaSeleccionada);
                      nueva.setHours(date.getHours(), date.getMinutes());
                      setFechaSeleccionada(nueva);
                    }
                  }}
                />
              )}

              <View style={{ height: 20 }} />
              <View style={[styles.modalBotones, { marginTop: 24 }]}>
                <TouchableOpacity style={[styles.btnCancelar, { borderColor: theme.border }]} onPress={() => setPasoModal(1)}>
                  <Text style={[styles.btnCancelarText, { color: theme.icon }]}>← Volver</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btnGuardar, { backgroundColor: theme.tint }]} onPress={guardarEncargo}>
                  <Text style={styles.btnGuardarText}>Guardar Pedido</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            )}
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
    paddingHorizontal: 20,
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

  /* --- TARJETA DE ENCARGO --- */
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  cardUrgente: { borderWidth: 2.5 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardHeaderLeft: { flex: 1 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  cardCliente: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  cardTelefono: { fontSize: 14, fontWeight: '400' },
  badgeUrgente: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeUrgenteText: { color: '#B91C1C', fontWeight: '800', fontSize: 13 },
  eliminarBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardDetalle: { fontSize: 16, lineHeight: 22, marginBottom: 12 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  metaTexto: { fontSize: 13, fontWeight: '600' },
  estadoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  estadoBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  estadoBtnTerminado: { opacity: 0.65 },

  /* --- BOTÓN FOOTER --- */
  footerBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
    borderTopWidth: 1,
  },
  nuevoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  nuevoBtnText: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },

  /* --- MODAL Y PASOS --- */
  listaProductos: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  botonProducto: {
    flexDirection: "row",
    borderRadius: 22,
    borderWidth: 2,
    marginBottom: 16,
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
  totalLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  resumenCarrito: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    marginTop: 10,
  },
  resumenTitulo: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  resumenItem: {
    fontSize: 14,
    marginBottom: 4,
  },
  resumenTotal: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)'
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    height: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitulo: { fontSize: 24, fontWeight: '800' },
  modalCerrar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: { marginBottom: 16 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginTop: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  inputArea: { height: 90, textAlignVertical: 'top' },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerBtnText: { flex: 1, fontSize: 17, fontWeight: '600' },
  saldoBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saldoLabel: { fontSize: 15, fontWeight: '600' },
  saldoValor: { fontSize: 20, fontWeight: '800' },
  modalBotones: { flexDirection: 'row', gap: 12 },
  btnCancelar: {
    flex: 1,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnCancelarText: { fontSize: 16, fontWeight: '700' },
  btnGuardar: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  btnGuardarText: { color: '#FFF', fontSize: 17, fontWeight: '800' },
});
