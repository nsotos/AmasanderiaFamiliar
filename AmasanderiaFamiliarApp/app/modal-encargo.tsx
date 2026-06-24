import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { setupDatabase } from "../database";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

// ─── IMPORTACIONES DE FIREBASE ───
import { collection, doc, setDoc } from "firebase/firestore";
import { db as firestore } from "../firebaseConfig";
import { guardarEncargoConItems } from "@/utils/encargosService";
import { generarId } from "@/utils/ids";
import {
  formatearFechaHoraDB,
  programarNotificacionesEncargo,
} from "@/utils/alertasService";

interface ClienteMini {
  id_cliente: number;
  nombre: string;
}

interface ProductoMini {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

interface ItemCarrito {
  producto: ProductoMini;
  cantidad: number;
}

export default function ModalEncargo() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  // ─── ESTADOS DE DATOS ───
  const [clientes, setClientes] = useState<ClienteMini[]>([]);
  const [productos, setProductos] = useState<ProductoMini[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardandoVecino, setGuardandoVecino] = useState(false);

  // ─── ESTADOS DEL FORMULARIO ───
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | null>(
    null,
  );
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [estadoPago, setEstadoPago] = useState<"PAGADO" | "ABONADO" | "FIADO">(
    "PAGADO",
  );
  const [abono, setAbono] = useState("");
  const [modalVecinosVisible, setModalVecinosVisible] = useState(false);
  const [nombreVecino, setNombreVecino] = useState("");
  const [telefonoVecino, setTelefonoVecino] = useState("+56 9 ");

  const [fechaEntrega, setFechaEntrega] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 2);
    return d;
  });
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [mostrarHora, setMostrarHora] = useState(false);

  // ─── ESTADO DE BÚSQUEDA ───
  const [busquedaVecino, setBusquedaVecino] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");

  // ─── CARGAR DATOS ───
  useEffect(() => {
    const cargarDatosBasicos = async () => {
      try {
        const db = await setupDatabase();
        const resClientes = await db.getAllAsync<ClienteMini>(
          "SELECT id_cliente, nombre FROM clientes ORDER BY nombre ASC",
        );
        setClientes(resClientes);

        const resProductos = await db.getAllAsync<ProductoMini>(
          "SELECT id_producto, nombre, precio_unitario FROM productos WHERE id_producto != 9999 AND LOWER(nombre) NOT LIKE '%inactivo%' ORDER BY nombre ASC",
        );
        setProductos(resProductos);
      } catch (error) {
        console.error("Error al cargar datos básicos:", error);
      } finally {
        setCargandoDatos(false);
      }
    };
    cargarDatosBasicos();
  }, []);

  // ─── LÓGICA DEL CARRITO Y BÚSQUEDA ───
  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busquedaVecino.toLowerCase().trim()),
  );
  const productosFiltrados = productos.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()),
  );

  const agregarAlCarrito = (prod: ProductoMini) => {
    setCarrito((prev) => {
      const existe = prev.find(
        (item) => item.producto.id_producto === prod.id_producto,
      );
      if (existe) {
        return prev.map((item) =>
          item.producto.id_producto === prod.id_producto
            ? { ...item, cantidad: item.cantidad + 1 }
            : item,
        );
      }
      return [...prev, { producto: prod, cantidad: 1 }];
    });
  };

  const modificarCantidad = (id_producto: number, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((item) => {
          if (item.producto.id_producto === id_producto) {
            return { ...item, cantidad: item.cantidad + delta };
          }
          return item;
        })
        .filter((item) => item.cantidad > 0),
    );
  };

  const totalCarrito = carrito.reduce(
    (suma, item) => suma + item.producto.precio_unitario * item.cantidad,
    0,
  );

  // ─── LÓGICA DE GUARDADO ───
  const handleGuardarNuevoVecino = async () => {
    if (guardandoVecino) return; // Bloqueo si ya está guardando

    if (!nombreVecino.trim()) {
      Alert.alert("Error", "El nombre es obligatorio");
      return;
    }

    setGuardandoVecino(true); // Bloqueamos el botón

    try {
      const db = await setupDatabase();
      const nuevoId = generarId();
      await db.runAsync(
        "INSERT INTO clientes (id_cliente, nombre, telefono, deuda_pendiente) VALUES (?, ?, ?, 0)",
        [nuevoId, nombreVecino.trim(), telefonoVecino],
      );

      // Sincronización Firebase (no bloqueante — funciona offline)
      setDoc(
        doc(collection(firestore, "clientes"), nuevoId.toString()),
        {
          id: nuevoId.toString(),
          nombre: nombreVecino.trim(),
          telefono: telefonoVecino,
          deuda_pendiente: 0,
          fecha_registro: new Date().toISOString(),
        },
      )
        .then(() =>
          db
            .runAsync(
              "UPDATE clientes SET sincronizado = 1 WHERE id_cliente = ?",
              [nuevoId],
            )
            .catch(console.warn),
        )
        .catch(() => {
          /* Sin conexión — offlineSync lo subirá luego */
        });

      const nuevoCliente = {
        id_cliente: nuevoId,
        nombre: nombreVecino.trim(),
      };

      setClientes((prev) =>
        [...prev, nuevoCliente].sort((a, b) =>
          a.nombre.localeCompare(b.nombre),
        ),
      );
      setClienteSeleccionado(nuevoCliente.id_cliente);

      setModalVecinosVisible(false);
      setNombreVecino("");
      setTelefonoVecino("+56 9 ");
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar el vecino");
    } finally {
      setGuardandoVecino(false); // Desbloqueamos al finalizar
    }
  };
  const handleGuardar = async () => {
    if (guardando) return;

    if (!clienteSeleccionado) {
      Alert.alert("Faltan datos", "Por favor, selecciona un vecino.");
      return;
    }
    if (carrito.length === 0) {
      Alert.alert(
        "Carrito vacío",
        "Por favor, agrega al menos un producto al pedido.",
      );
      return;
    }

    let abonoTotal = 0;

    if (estadoPago === "ABONADO") {
      const valorAbono = parseFloat(abono.replace(/\./g, "").replace(/,/g, ""));
      if (isNaN(valorAbono) || valorAbono <= 0 || valorAbono >= totalCarrito) {
        Alert.alert(
          "Error en Abono",
          `El abono debe ser mayor a $0 y menor al total ($${totalCarrito}).`,
        );
        return;
      }
      abonoTotal = valorAbono;
    } else if (estadoPago === "PAGADO") {
      abonoTotal = totalCarrito;
    }

    setGuardando(true);

    try {
      const db = await setupDatabase();
      const fechaDB = formatearFechaHoraDB(fechaEntrega);

      const items = carrito.map((item) => ({
        id_producto: item.producto.id_producto,
        cantidad: item.cantidad,
        subtotal: item.producto.precio_unitario * item.cantidad,
        nombre: item.producto.nombre,
      }));

      const encargo = await guardarEncargoConItems(db, {
        id_cliente: clienteSeleccionado,
        items,
        total: totalCarrito,
        fecha_entrega: fechaDB,
        estado_pago: estadoPago,
        abono: abonoTotal,
      });

      // Sincronización Firebase (no bloqueante — funciona offline)
      setDoc(
        doc(collection(firestore, "encargos"), encargo.id_encargo.toString()),
        {
          id_encargo: encargo.id_encargo,
          id_cliente: encargo.id_cliente,
          items: items.map((i) => ({
            id_producto: i.id_producto,
            nombre: i.nombre,
            cantidad: i.cantidad,
            subtotal: i.subtotal,
          })),
          total: encargo.total,
          fecha_entrega: encargo.fecha_entrega,
          estado_pedido: encargo.estado_pedido,
          estado_pago: encargo.estado_pago,
          abono: encargo.abono,
        },
      )
        .then(() =>
          db
            .runAsync(
              "UPDATE encargos SET sincronizado = 1 WHERE id_encargo = ?",
              [encargo.id_encargo],
            )
            .catch(console.warn),
        )
        .catch(() => {
          /* Sin conexión — offlineSync lo subirá luego */
        });

      const nombreCliente =
        clientes.find((c) => c.id_cliente === clienteSeleccionado)?.nombre ??
        "Cliente";
      await programarNotificacionesEncargo(
        encargo.id_encargo,
        nombreCliente,
        encargo.fecha_entrega,
      );

      router.back();
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo registrar el pedido.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoDatos) {
    return (
      <View style={[styles.centerAll, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.closeButton, { backgroundColor: theme.card }]}
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Nuevo Pedido
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* 1. SELECCIÓN DE VECINO (LISTA VERTICAL CON BUSCADOR) */}
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, paddingBottom: 10 },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text
                style={[styles.label, { color: theme.text, marginBottom: 0 }]}
              >
                1. ¿Para quién es?
              </Text>
              <TouchableOpacity onPress={() => setModalVecinosVisible(true)}>
                <Ionicons name="add-circle" size={28} color={theme.tint} />
              </TouchableOpacity>
            </View>

            {/* Buscador de Vecinos */}
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="search" size={20} color={theme.icon} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Buscar vecino..."
                placeholderTextColor={theme.icon}
                value={busquedaVecino}
                onChangeText={setBusquedaVecino}
              />
              {busquedaVecino.length > 0 && (
                <TouchableOpacity onPress={() => setBusquedaVecino("")}>
                  <Ionicons name="close-circle" size={20} color={theme.icon} />
                </TouchableOpacity>
              )}
            </View>

            {clientes.length === 0 ? (
              <Text style={{ color: theme.icon, marginTop: 8 }}>
                No tienes vecinos registrados.
              </Text>
            ) : clientesFiltrados.length === 0 ? (
              <Text style={{ color: theme.icon, marginTop: 8 }}>
                No se encontró ningún vecino con ese nombre.
              </Text>
            ) : (
              <ScrollView
                style={styles.listaVertical}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                {clientesFiltrados.map((c) => (
                  <TouchableOpacity
                    key={c.id_cliente}
                    style={[
                      styles.productoFila,
                      {
                        backgroundColor:
                          clienteSeleccionado === c.id_cliente
                            ? `${theme.tint}20`
                            : theme.background,
                        borderColor:
                          clienteSeleccionado === c.id_cliente
                            ? theme.tint
                            : theme.border,
                      },
                    ]}
                    onPress={() => setClienteSeleccionado(c.id_cliente)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.productoFilaNombre,
                          { color: theme.text },
                        ]}
                      >
                        {c.nombre}
                      </Text>
                    </View>
                    {clienteSeleccionado === c.id_cliente && (
                      <Ionicons
                        name="checkmark-circle"
                        size={24}
                        color={theme.tint}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* 2. CATÁLOGO DE PRODUCTOS (LISTA VERTICAL) */}
          <View
            style={[
              styles.card,
              { backgroundColor: theme.card, paddingBottom: 10 },
            ]}
          >
            <Text style={[styles.label, { color: theme.text }]}>
              2. Catálogo
            </Text>

            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="search" size={20} color={theme.icon} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Buscar producto..."
                placeholderTextColor={theme.icon}
                value={busquedaProducto}
                onChangeText={setBusquedaProducto}
              />
              {busquedaProducto.length > 0 && (
                <TouchableOpacity onPress={() => setBusquedaProducto("")}>
                  <Ionicons name="close-circle" size={20} color={theme.icon} />
                </TouchableOpacity>
              )}
            </View>

            {productosFiltrados.length === 0 ? (
              <Text
                style={{ color: theme.icon, marginTop: 8, paddingBottom: 10 }}
              >
                No se encontraron productos.
              </Text>
            ) : (
              <ScrollView
                style={styles.listaVertical}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                {productosFiltrados.map((p) => (
                  <TouchableOpacity
                    key={p.id_producto}
                    style={[
                      styles.productoFila,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => agregarAlCarrito(p)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.productoFilaNombre,
                          { color: theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {p.nombre}
                      </Text>
                      <Text style={{ color: theme.icon, fontSize: 13 }}>
                        ${p.precio_unitario.toLocaleString("es-CL")}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={26} color={theme.tint} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* 3. CARRITO DE COMPRAS */}
          {carrito.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <Ionicons name="cart" size={24} color={theme.tint} />
                <Text
                  style={[styles.label, { color: theme.text, marginBottom: 0 }]}
                >
                  3. Carrito
                </Text>
              </View>

              {carrito.map((item) => (
                <View
                  key={item.producto.id_producto}
                  style={[
                    styles.carritoItem,
                    { borderBottomColor: theme.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.carritoItemNombre, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {item.producto.nombre}
                    </Text>
                    <Text style={{ color: theme.icon, fontSize: 13 }}>
                      ${item.producto.precio_unitario.toLocaleString("es-CL")}{" "}
                      c/u
                    </Text>
                  </View>

                  <View style={styles.stepperControls}>
                    <TouchableOpacity
                      style={[
                        styles.stepperBtn,
                        { backgroundColor: theme.border },
                      ]}
                      onPress={() =>
                        modificarCantidad(item.producto.id_producto, -1)
                      }
                    >
                      <Ionicons name="remove" size={18} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={[styles.stepperValue, { color: theme.text }]}>
                      {item.cantidad}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.stepperBtn,
                        { backgroundColor: `${theme.tint}20` },
                      ]}
                      onPress={() =>
                        modificarCantidad(item.producto.id_producto, 1)
                      }
                    >
                      <Ionicons name="add" size={18} color={theme.tint} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 4. FECHA DE ENTREGA CON CALENDARIO */}
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>
              4. Fecha y Hora de Entrega
            </Text>
            <TouchableOpacity
              style={[
                styles.datePickerBtn,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setMostrarCalendario(true)}
              activeOpacity={0.7}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons name="calendar" size={22} color={theme.tint} />
                <Text
                  style={{
                    fontSize: 16,
                    color: theme.text,
                    textTransform: "capitalize",
                  }}
                >
                  {fechaEntrega.toLocaleDateString("es-CL", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.datePickerBtn,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  marginTop: 10,
                },
              ]}
              onPress={() => setMostrarHora(true)}
              activeOpacity={0.7}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons name="time" size={22} color={theme.tint} />
                <Text style={{ fontSize: 16, color: theme.text }}>
                  {fechaEntrega.toLocaleTimeString("es-CL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </TouchableOpacity>

            {mostrarCalendario && (
              <DateTimePicker
                value={fechaEntrega}
                mode="date"
                display="default"
                minimumDate={new Date()}
                onChange={(event, selectedDate) => {
                  setMostrarCalendario(Platform.OS === "ios");
                  if (selectedDate) {
                    setFechaEntrega((prev) => {
                      const nueva = new Date(selectedDate);
                      nueva.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                      return nueva;
                    });
                  }
                }}
              />
            )}

            {mostrarHora && (
              <DateTimePicker
                value={fechaEntrega}
                mode="time"
                display="default"
                onChange={(event, selectedDate) => {
                  setMostrarHora(Platform.OS === "ios");
                  if (selectedDate) {
                    setFechaEntrega((prev) => {
                      const nueva = new Date(prev);
                      nueva.setHours(
                        selectedDate.getHours(),
                        selectedDate.getMinutes(),
                        0,
                        0,
                      );
                      return nueva;
                    });
                  }
                }}
              />
            )}
          </View>

          {/* 5. ESTADO DE PAGO */}
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.label, { color: theme.text }]}>5. Pago</Text>
            <View style={styles.pagosContainer}>
              {(["PAGADO", "ABONADO", "FIADO"] as const).map((tipo) => (
                <TouchableOpacity
                  key={tipo}
                  style={[
                    styles.pagoBtn,
                    estadoPago === tipo
                      ? { backgroundColor: theme.tint, borderColor: theme.tint }
                      : {
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        },
                  ]}
                  onPress={() => setEstadoPago(tipo)}
                >
                  <Text
                    style={[
                      styles.pagoText,
                      { color: estadoPago === tipo ? "#FFF" : theme.text },
                    ]}
                  >
                    {tipo}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {estadoPago === "ABONADO" && (
              <View style={{ marginTop: 16 }}>
                <Text
                  style={[
                    styles.subLabel,
                    { color: theme.icon, marginBottom: 8 },
                  ]}
                >
                  ¿Cuánto dejó abonado?
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      color: theme.text,
                      borderColor: theme.border,
                    },
                  ]}
                  value={abono}
                  onChangeText={setAbono}
                  placeholder="Ej. 1000"
                  placeholderTextColor={theme.icon}
                  keyboardType="numeric"
                />
              </View>
            )}

            {/* Resumen Total Dinámico */}
            <View
              style={[
                styles.totalContainer,
                { backgroundColor: `${theme.tint}10` },
              ]}
            >
              <Text style={[styles.totalLabel, { color: theme.tint }]}>
                Total del Pedido:
              </Text>
              <Text style={[styles.totalValue, { color: theme.tint }]}>
                ${totalCarrito.toLocaleString("es-CL")}
              </Text>
            </View>
          </View>

          {/* BOTÓN GUARDAR */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              {
                backgroundColor:
                  guardando || !clienteSeleccionado || carrito.length === 0
                    ? theme.border
                    : theme.tint,
              },
            ]}
            onPress={handleGuardar}
            activeOpacity={0.8}
            disabled={guardando || !clienteSeleccionado || carrito.length === 0}
          >
            {guardando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={26} color="#FFF" />
                <Text style={styles.saveButtonText}>Confirmar Pedido</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
        <Modal visible={modalVecinosVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.label, { color: theme.text }]}>
                Nuevo Vecino
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                    marginBottom: 12,
                  },
                ]}
                value={nombreVecino}
                onChangeText={setNombreVecino}
                placeholder="Nombre del vecino"
                placeholderTextColor={theme.icon}
              />
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.border,
                    marginBottom: 20,
                  },
                ]}
                value={telefonoVecino}
                onChangeText={setTelefonoVecino}
                placeholder="+56 9 XXXX XXXX"
                placeholderTextColor={theme.icon}
                keyboardType="phone-pad"
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    setModalVecinosVisible(false);
                    setNombreVecino("");
                    setTelefonoVecino("+56 9 ");
                  }}
                >
                  <Text style={[styles.modalBtnText, { color: theme.text }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalBtn,
                    {
                      backgroundColor: guardandoVecino
                        ? theme.border
                        : theme.tint,
                    },
                  ]}
                  onPress={handleGuardarNuevoVecino}
                  disabled={guardandoVecino} // <--- Esto es lo importante
                >
                  {guardandoVecino ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: "#FFF" }]}>
                      Guardar
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerAll: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  scrollContent: { padding: 20, paddingBottom: 60 },

  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  label: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  subLabel: { fontSize: 14, fontWeight: "600" },

  chipScroll: { flexDirection: "row", marginHorizontal: -4, paddingBottom: 6 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  chipText: { fontSize: 15, fontWeight: "600" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },

  // --- NUEVOS ESTILOS DE LA LISTA VERTICAL ---
  listaVertical: {
    maxHeight: 220, // Evita que la lista ocupe toda la pantalla
    marginTop: 4,
  },
  productoFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  productoFilaNombre: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },

  carritoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  carritoItemNombre: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: "700",
    width: 24,
    textAlign: "center",
  },

  pagosContainer: { flexDirection: "row", gap: 8, marginTop: 8 },
  pagoBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  pagoText: { fontSize: 14, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
  },

  totalContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
  },
  totalLabel: { fontSize: 16, fontWeight: "700" },
  totalValue: { fontSize: 24, fontWeight: "800" },

  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    borderRadius: 20,
    gap: 12,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveButtonText: { color: "#FFF", fontSize: 18, fontWeight: "700" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: { fontSize: 15, fontWeight: "700" },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
    marginTop: 10,
  },
});
