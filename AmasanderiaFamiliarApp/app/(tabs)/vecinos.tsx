import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { db as firestore } from "../../firebaseConfig";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { setupDatabase } from "../../database";
import { eliminarConSync, getPendingDeletionIds } from "@/utils/deleteSync";
import { FiltrosColapsables } from "@/components/filtros-colapsables";
import { generarId } from "@/utils/ids";
import { suscribirColeccion } from "@/utils/realtime";

interface Cliente {
  id_cliente: number;
  nombre: string;
  telefono: string;
  deuda_pendiente: number;
  fecha_registro: string;
  total_encargos?: number;
}
const PREFIJO_TELEFONO = "+56 9 ";

function limpiarDigitosTelefono(text: string): string {
  let cleaned = text.replace(/\D/g, "");
  if (cleaned.startsWith("569")) cleaned = cleaned.substring(3);
  else if (cleaned.startsWith("56")) cleaned = cleaned.substring(2);
  if (cleaned.length > 8) cleaned = cleaned.substring(0, 8);
  return cleaned;
}

function formatearTelefonoDisplay(digitos: string): string {
  if (!digitos) return PREFIJO_TELEFONO;
  if (digitos.length > 4) {
    return `+56 9 ${digitos.substring(0, 4)} ${digitos.substring(4)}`;
  }
  return `+56 9 ${digitos}`;
}

const formatearTelefono = (text: string) => {
  if (text.length < PREFIJO_TELEFONO.length) return PREFIJO_TELEFONO;
  return formatearTelefonoDisplay(limpiarDigitosTelefono(text));
};

const mostrarTelefono = (
  telefono: string | null | undefined,
): string | null => {
  if (!telefono?.trim()) return null;
  const digitos = limpiarDigitosTelefono(telefono);
  if (!digitos) return null;
  return formatearTelefonoDisplay(digitos);
};

type FiltroVecinos = "TODOS" | "CON_DEUDA" | "AL_DIA";

const FILTROS_VECINOS: { id: FiltroVecinos; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "CON_DEUDA", label: "Con deuda" },
  { id: "AL_DIA", label: "Al día" },
];

// <-- 1. NUEVA OPCIÓN "ENCARGOS_DESC" -->
type OrdenVecinos = "NOMBRE" | "DEUDA_DESC" | "DEUDA_ASC" | "ENCARGOS_DESC";

const ORDENES_VECINOS: { id: OrdenVecinos; label: string }[] = [
  { id: "NOMBRE", label: "Nombre" },
  { id: "DEUDA_DESC", label: "+ Deuda" }, // Acortado para que quepan 4 botones
  { id: "DEUDA_ASC", label: "- Deuda" }, // Acortado para que quepan 4 botones
  { id: "ENCARGOS_DESC", label: "Mayor Gasto" }, // <-- NUEVO BOTÓN
];

export default function ClientesScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [modalClienteVisible, setModalClienteVisible] = useState(false);
  const [modalDetalleVisible, setModalDetalleVisible] = useState(false);
  const [modalDeudaVisible, setModalDeudaVisible] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<Cliente | null>(null);
  const [modoEdicion, setModoEdicion] = useState(false);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  const [monto, setMonto] = useState("");
  const [tipoOperacion, setTipoOperacion] = useState<"ABONO" | "FIADO">(
    "ABONO",
  );
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroDeuda, setFiltroDeuda] = useState<FiltroVecinos>("TODOS");
  const [orden, setOrden] = useState<OrdenVecinos>("NOMBRE");

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const digitosBusqueda = busqueda.replace(/\D/g, "");

    const filtrados = clientes.filter((cliente) => {
      if (filtroDeuda === "CON_DEUDA" && cliente.deuda_pendiente <= 0) {
        return false;
      }
      if (filtroDeuda === "AL_DIA" && cliente.deuda_pendiente > 0) {
        return false;
      }

      if (!termino && !digitosBusqueda) return true;

      const coincideNombre = cliente.nombre.toLowerCase().includes(termino);
      const coincideTelefono =
        digitosBusqueda.length > 0 &&
        cliente.telefono.replace(/\D/g, "").includes(digitosBusqueda);

      return coincideNombre || coincideTelefono;
    });

    const ordenados = [...filtrados];

    switch (orden) {
      case "DEUDA_DESC":
        ordenados.sort(
          (a, b) =>
            b.deuda_pendiente - a.deuda_pendiente ||
            a.nombre.localeCompare(b.nombre, "es"),
        );
        break;
      case "DEUDA_ASC":
        ordenados.sort(
          (a, b) =>
            a.deuda_pendiente - b.deuda_pendiente ||
            a.nombre.localeCompare(b.nombre, "es"),
        );
        break;
      // <-- 2. LÓGICA DE ORDENAMIENTO POR GASTO -->
      case "ENCARGOS_DESC":
        ordenados.sort(
          (a, b) =>
            (b.total_encargos ?? 0) - (a.total_encargos ?? 0) ||
            a.nombre.localeCompare(b.nombre, "es"),
        );
        break;
      default:
        ordenados.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }

    return ordenados;
  }, [clientes, busqueda, filtroDeuda, orden]);

  const hayFiltroActivo =
    busqueda.trim().length > 0 || filtroDeuda !== "TODOS" || orden !== "NOMBRE";

  useEffect(() => {
    return suscribirColeccion("clientes", async (snapshot) => {
      try {
        const dbSQLite = await setupDatabase();
        const pendingDeletes = await getPendingDeletionIds(
          dbSQLite,
          "clientes",
        );

        for (const documento of snapshot.docs) {
          if (pendingDeletes.has(documento.id)) continue;
          // Escritura local aún no confirmada por el servidor: no marcar como
          // respaldada (ya está en SQLite como pendiente).
          if (documento.metadata.hasPendingWrites) continue;
          const cliente = documento.data();

          await dbSQLite.runAsync(
            `INSERT OR REPLACE INTO clientes (id_cliente, nombre, telefono, deuda_pendiente, sincronizado)
             VALUES (?, ?, ?, ?, 1)`,
            [
              cliente.id,
              cliente.nombre,
              cliente.telefono,
              cliente.deuda_pendiente || 0,
            ],
          );
        }

        cargarClientes();
      } catch (error) {
        console.error("Error en la sincronización automática:", error);
      }
    });
  }, []);

  const cargarClientes = async () => {
    try {
      const db = await setupDatabase();
      const querySQL = `
        SELECT 
          c.*, 
          COALESCE(
            (SELECT SUM(total) FROM encargos WHERE id_cliente = c.id_cliente), 
            0
          ) AS total_encargos
        FROM clientes c 
        ORDER BY c.nombre ASC;
      `;
      const resultado = await db.getAllAsync<Cliente>(querySQL);
      setClientes(resultado);
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      cargarClientes();
    }, []),
  );

  const abrirNuevoCliente = () => {
    setNombre("");
    setTelefono(PREFIJO_TELEFONO);
    setClienteSeleccionado(null);
    setModoEdicion(false);
    setModalClienteVisible(true);
  };

  const abrirEditarCliente = () => {
    if (!clienteSeleccionado) return;

    setNombre(clienteSeleccionado.nombre);
    setTelefono(
      mostrarTelefono(clienteSeleccionado.telefono) ?? PREFIJO_TELEFONO,
    );
    setModoEdicion(true);

    setModalDetalleVisible(false);

    setTimeout(() => {
      setModalClienteVisible(true);
    }, 150);
  };

  const abrirDetalle = (cliente: Cliente) => {
    setClienteSeleccionado(cliente);
    setModalDetalleVisible(true);
  };

  const abrirFormularioDeuda = (tipo: "ABONO" | "FIADO") => {
    setTipoOperacion(tipo);
    setMonto("");
    setModalDetalleVisible(false);

    setTimeout(() => {
      setModalDeudaVisible(true);
    }, 150);
  };

  const handleGuardarCliente = async () => {
    if (!nombre.trim()) {
      Alert.alert("Faltan datos", "El nombre del vecino es obligatorio.");
      return;
    }

    const soloNumeros = telefono.replace(/\D/g, "");

    if (telefono.trim().length > 6 && soloNumeros.length !== 11) {
      Alert.alert(
        "Teléfono inválido",
        "El número debe tener el formato +56 9 XXXX XXXX.",
      );
      return;
    }

    setGuardando(true);
    try {
      const db = await setupDatabase();
      const telefonoAGuardar = soloNumeros === "569" ? "" : soloNumeros;

      if (modoEdicion && clienteSeleccionado) {
        await db.runAsync(
          "UPDATE clientes SET nombre = ?, telefono = ?, sincronizado = 0 WHERE id_cliente = ?",
          [nombre.trim(), telefonoAGuardar, clienteSeleccionado.id_cliente],
        );

        updateDoc(
          doc(firestore, "clientes", clienteSeleccionado.id_cliente.toString()),
          {
            nombre: nombre.trim(),
            telefono: telefonoAGuardar,
          },
        ).catch((error) => {
          console.warn("⚠️ Actualizado localmente, pero error en nube:", error);
        });
      } else {
        const nuevoId = generarId().toString();
        await db.runAsync(
          "INSERT INTO clientes (id_cliente, nombre, telefono, deuda_pendiente) VALUES (?, ?, ?, 0)",
          [nuevoId, nombre.trim(), telefonoAGuardar],
        );

        setDoc(doc(collection(firestore, "clientes"), nuevoId), {
          id: nuevoId,
          nombre: nombre.trim(),
          telefono: telefonoAGuardar,
          deuda_pendiente: 0,
          fecha_registro: new Date().toISOString(),
        }).catch((error) => {
          console.warn("⚠️ Creado localmente, pero error en nube:", error);
        });
      }

      setModalClienteVisible(false);
      setNombre("");
      setTelefono(PREFIJO_TELEFONO);
      cargarClientes();
    } catch (error) {
      console.error("Error al procesar cliente:", error);
      Alert.alert("Error", "No se pudo procesar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  const handleActualizarDeuda = async () => {
    const valorMonto = parseFloat(monto.replace(/\./g, "").replace(/,/g, ""));
    if (isNaN(valorMonto) || valorMonto <= 0) {
      Alert.alert("Error", "Ingresa un monto válido mayor a 0.");
      return;
    }

    if (!clienteSeleccionado) return;

    try {
      const db = await setupDatabase();

      const clienteActual = await db.getFirstAsync<{ deuda_pendiente: number }>(
        "SELECT deuda_pendiente FROM clientes WHERE id_cliente = ?",
        [clienteSeleccionado.id_cliente],
      );

      const deudaActual = clienteActual?.deuda_pendiente ?? 0;

      if (tipoOperacion === "ABONO" && valorMonto > deudaActual) {
        Alert.alert(
          "Abono excesivo",
          `El abono de $${valorMonto.toLocaleString("es-CL")} supera la deuda actual de $${deudaActual.toLocaleString("es-CL")}.`,
        );
        return;
      }

      const factor = tipoOperacion === "ABONO" ? -1 : 1;
      const nuevoCambio = valorMonto * factor;

      await db.withTransactionAsync(async () => {
        const clienteEnTx = await db.getFirstAsync<{ deuda_pendiente: number }>(
          "SELECT deuda_pendiente FROM clientes WHERE id_cliente = ?",
          [clienteSeleccionado.id_cliente],
        );
        const deudaEnTx = clienteEnTx?.deuda_pendiente ?? 0;

        if (tipoOperacion === "ABONO" && valorMonto > deudaEnTx) {
          throw new Error("ABONO_EXCESIVO");
        }

        await db.runAsync(
          "UPDATE clientes SET deuda_pendiente = MAX(0, deuda_pendiente + ?), sincronizado = 0 WHERE id_cliente = ?",
          [nuevoCambio, clienteSeleccionado.id_cliente],
        );
      });

      setModalDeudaVisible(false);
      cargarClientes();
    } catch (error) {
      if (error instanceof Error && error.message === "ABONO_EXCESIVO") {
        Alert.alert(
          "Abono excesivo",
          "El abono supera la deuda actual del cliente.",
        );
        return;
      }
      console.error("Error al actualizar deuda:", error);
      Alert.alert("Error", "No se pudo actualizar el saldo.");
    }
  };

  const handleEliminarCliente = (cliente: Cliente) => {
    Alert.alert(
      "Eliminar Vecino",
      `¿Seguro que quieres eliminar a ${cliente.nombre} del registro?\n\nSi tiene deudas pendientes, este saldo se perderá para siempre.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              const db = await setupDatabase();
              await db.runAsync("DELETE FROM clientes WHERE id_cliente = ?;", [
                cliente.id_cliente,
              ]);
              eliminarConSync(db, "clientes", cliente.id_cliente.toString());
              setModalDetalleVisible(false);
              cargarClientes();
            } catch (error) {
              console.error("Error al eliminar cliente:", error);
              Alert.alert("Error", "No se pudo eliminar al vecino.");
            }
          },
        },
      ],
    );
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroDeuda("TODOS");
    setOrden("NOMBRE");
  };

  const renderEmpty = () => {
    if (clientes.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={72} color={theme.border} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Sin clientes aún
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.icon }]}>
            Toca el botón para registrar a tu primer vecino.
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
          No hay vecinos que coincidan con tu búsqueda o filtro.
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
            Vecinos
          </Text>
          <Text style={[styles.subtitle, { color: theme.icon }]}>
            {clientes.length === 0
              ? "Directorio de clientes y fiados"
              : hayFiltroActivo
                ? `${clientesFiltrados.length} de ${clientes.length} vecino${clientes.length !== 1 ? "s" : ""}`
                : `${clientes.length} vecino${clientes.length !== 1 ? "s" : ""} registrado${clientes.length !== 1 ? "s" : ""}`}
          </Text>

          <TouchableOpacity
            style={[styles.nuevoBtn, { backgroundColor: theme.tint }]}
            onPress={abrirNuevoCliente}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={32} color="#FFF" />
            <Text style={styles.nuevoBtnText}>Nuevo Vecino</Text>
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
            placeholder="Buscar por nombre o teléfono..."
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

        <FiltrosColapsables
          style={styles.filtrosColapsables}
          hayFiltroActivo={filtroDeuda !== "TODOS" || orden !== "NOMBRE"}
        >
          <View
            style={[
              styles.filtrosContainer,
              {
                backgroundColor: colorScheme === "dark" ? "#1E293B" : "#E2E8F0",
              },
            ]}
          >
            {FILTROS_VECINOS.map((filtro) => {
              const activo = filtroDeuda === filtro.id;
              return (
                <TouchableOpacity
                  key={filtro.id}
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
                  onPress={() => setFiltroDeuda(filtro.id)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.filtroText,
                      { color: activo ? theme.tint : theme.icon },
                    ]}
                  >
                    {filtro.label}
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
            {ORDENES_VECINOS.map((opcion) => {
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
                      styles.ordenText,
                      { color: activo ? theme.tint : theme.icon },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {opcion.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FiltrosColapsables>

        <FlatList
          data={clientesFiltrados}
          keyExtractor={(item) => item.id_cliente.toString()}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            clientesFiltrados.length === 0
              ? styles.listEmpty
              : styles.listContainer
          }
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => {
            const tieneDeuda = item.deuda_pendiente > 0;
            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => abrirDetalle(item)}
                onLongPress={() => handleEliminarCliente(item)}
                delayLongPress={500}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.cardIcon,
                    { backgroundColor: `${theme.tint}18` },
                  ]}
                >
                  <Ionicons name="person" size={22} color={theme.tint} />
                </View>

                <View style={styles.cardInfo}>
                  <Text
                    style={[styles.cardNombre, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {item.nombre}
                  </Text>
                  <Text
                    style={[styles.cardPreview, { color: theme.icon }]}
                    numberOfLines={1}
                  >
                    {mostrarTelefono(item.telefono) ?? "Sin teléfono"}
                  </Text>

                  {(item.total_encargos ?? 0) > 0 && (
                    <View style={styles.encargosPreviewRow}>
                      <Ionicons
                        name="bag-check-outline"
                        size={13}
                        color={theme.tint}
                      />
                      <Text
                        style={[
                          styles.encargosPreviewText,
                          { color: theme.tint },
                        ]}
                      >
                        Gastado en encargos: $
                        {item.total_encargos?.toLocaleString("es-CL")}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Badge de deuda */}
                <View
                  style={[
                    styles.deudaBadge,
                    {
                      backgroundColor: tieneDeuda
                        ? "#FEE2E2"
                        : `${theme.tint}18`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.deudaBadgeText,
                      { color: tieneDeuda ? "#EF4444" : theme.tint },
                    ]}
                  >
                    ${item.deuda_pendiente.toLocaleString("es-CL")}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ══════════ MODAL DETALLE (Perfil del Cliente) ══════════ */}
      <Modal
        visible={modalDetalleVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalDetalleVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalDetalleVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View
                style={[styles.sheetContainer, { backgroundColor: theme.card }]}
              >
                {/* Handle */}
                <View style={styles.handleBar}>
                  <View
                    style={[styles.handle, { backgroundColor: theme.border }]}
                  />
                </View>

                {/* Header detalle */}
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.sheetTitle, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {clienteSeleccionado?.nombre}
                    </Text>
                    <Text style={[styles.cardPreview, { color: theme.icon }]}>
                      {mostrarTelefono(clienteSeleccionado?.telefono) ??
                        "Sin teléfono registrado"}
                    </Text>

                    {(clienteSeleccionado?.total_encargos ?? 0) > 0 && (
                      <View
                        style={[styles.encargosPreviewRow, { marginTop: 6 }]}
                      >
                        <Ionicons
                          name="bag-check-outline"
                          size={16}
                          color={theme.tint}
                        />
                        <Text
                          style={[
                            styles.encargosPreviewText,
                            { color: theme.tint, fontSize: 14 },
                          ]}
                        >
                          Total en encargos: $
                          {clienteSeleccionado?.total_encargos?.toLocaleString(
                            "es-CL",
                          )}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={abrirEditarCliente}
                      style={[
                        styles.cerrarBtn,
                        { backgroundColor: `${theme.tint}18` },
                      ]}
                    >
                      <Ionicons name="pencil" size={18} color={theme.tint} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        clienteSeleccionado &&
                        handleEliminarCliente(clienteSeleccionado)
                      }
                      style={[styles.cerrarBtn, { backgroundColor: "#FEE2E2" }]}
                    >
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setModalDetalleVisible(false)}
                      style={[
                        styles.cerrarBtn,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Ionicons name="close" size={18} color={theme.icon} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Info de la Deuda */}
                <View style={styles.deudaContainer}>
                  <Text style={[styles.deudaLabel, { color: theme.icon }]}>
                    Saldo Actual
                  </Text>
                  <Text
                    style={[
                      styles.deudaGrande,
                      {
                        color:
                          (clienteSeleccionado?.deuda_pendiente || 0) > 0
                            ? "#EF4444"
                            : theme.tint,
                      },
                    ]}
                  >
                    $
                    {clienteSeleccionado?.deuda_pendiente.toLocaleString(
                      "es-CL",
                    ) || 0}
                  </Text>
                </View>

                {/* Acciones */}
                <View
                  style={[styles.sheetFooter, { borderTopColor: theme.border }]}
                >
                  <TouchableOpacity
                    style={[styles.sheetBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() => abrirFormularioDeuda("FIADO")}
                  >
                    <Ionicons name="add-circle" size={20} color="#EF4444" />
                    <Text style={[styles.sheetBtnText, { color: "#EF4444" }]}>
                      Fiar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sheetBtn, { backgroundColor: "#DCFCE7" }]}
                    onPress={() => abrirFormularioDeuda("ABONO")}
                  >
                    <Ionicons name="remove-circle" size={20} color="#16A34A" />
                    <Text style={[styles.sheetBtnText, { color: "#16A34A" }]}>
                      Abonar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ══════════ MODAL FORMULARIO DEUDA (Abono / Fiado) ══════════ */}
      <Modal
        visible={modalDeudaVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalDeudaVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback onPress={() => setModalDeudaVisible(false)}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.formContainer,
                    { backgroundColor: theme.card },
                  ]}
                >
                  <View style={styles.handleBar}>
                    <View
                      style={[styles.handle, { backgroundColor: theme.border }]}
                    />
                  </View>

                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: theme.text }]}>
                      {tipoOperacion === "ABONO"
                        ? "Registrar Abono"
                        : "Cargar Fiado"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalDeudaVisible(false)}
                      style={[
                        styles.cerrarBtn,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Ionicons name="close" size={18} color={theme.icon} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formBody}
                  >
                    <Text style={[styles.label, { color: theme.text }]}>
                      Monto ($)
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
                      value={monto}
                      onChangeText={setMonto}
                      placeholder="Ej. 1500"
                      placeholderTextColor={theme.icon}
                      keyboardType="numeric"
                      autoFocus
                    />

                    <TouchableOpacity
                      style={[
                        styles.guardarBtn,
                        {
                          backgroundColor:
                            tipoOperacion === "ABONO" ? "#16A34A" : "#EF4444",
                        },
                      ]}
                      onPress={handleActualizarDeuda}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#FFF"
                      />
                      <Text style={styles.guardarBtnText}>Confirmar</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══════════ MODAL FORMULARIO NUEVO CLIENTE ══════════ */}
      <Modal
        visible={modalClienteVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalClienteVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableWithoutFeedback
            onPress={() => setModalClienteVisible(false)}
          >
            <View style={styles.overlay}>
              <TouchableWithoutFeedback>
                <View
                  style={[
                    styles.formContainer,
                    { backgroundColor: theme.card },
                  ]}
                >
                  <View style={styles.handleBar}>
                    <View
                      style={[styles.handle, { backgroundColor: theme.border }]}
                    />
                  </View>

                  <View style={styles.sheetHeader}>
                    <Text style={[styles.sheetTitle, { color: theme.text }]}>
                      {modoEdicion ? "Editar Vecino" : "Nuevo Vecino"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalClienteVisible(false)}
                      style={[
                        styles.cerrarBtn,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Ionicons name="close" size={18} color={theme.icon} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.formBody}
                  >
                    <Text style={[styles.label, { color: theme.text }]}>
                      Nombre
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
                      value={nombre}
                      onChangeText={setNombre}
                      placeholder="Ej. María"
                      placeholderTextColor={theme.icon}
                      returnKeyType="next"
                    />

                    <Text style={[styles.label, { color: theme.text }]}>
                      Teléfono (Opcional)
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
                      value={telefono}
                      onChangeText={(text) =>
                        setTelefono(formatearTelefono(text))
                      }
                      placeholder="Ej. +56 9 1234 5678"
                      placeholderTextColor={theme.icon}
                      keyboardType="phone-pad"
                    />

                    <TouchableOpacity
                      style={[
                        styles.guardarBtn,
                        {
                          backgroundColor: guardando
                            ? theme.border
                            : theme.tint,
                        },
                      ]}
                      onPress={handleGuardarCliente}
                      activeOpacity={0.85}
                      disabled={guardando}
                    >
                      {guardando ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Ionicons name="save" size={22} color="#FFF" />
                          <Text style={styles.guardarBtnText}>
                            {modoEdicion ? "Actualizar" : "Guardar Cliente"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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
  header: { marginBottom: 20 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: { fontSize: 16, fontWeight: "400", marginBottom: 20 },

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
    marginBottom: 16,
  },
  filtrosContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 12,
  },
  ordenContainer: {
    marginBottom: 16,
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
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  ordenText: {
    fontSize: 11,
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
  cardInfo: { flex: 1, marginRight: 8 },
  cardNombre: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  cardPreview: { fontSize: 13, lineHeight: 18 },

  encargosPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  encargosPreviewText: {
    fontSize: 12,
    fontWeight: "600",
  },

  deudaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deudaBadgeText: {
    fontSize: 14,
    fontWeight: "700",
  },

  emptyContainer: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: { fontSize: 16, textAlign: "center", lineHeight: 24 },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handleBar: { alignItems: "center", paddingVertical: 12 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", marginRight: 12 },
  cerrarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  deudaContainer: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  deudaLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  deudaGrande: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -1,
  },
  sheetFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    borderTopWidth: 1,
  },
  sheetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  sheetBtnText: { fontSize: 16, fontWeight: "700" },

  formContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  formBody: { paddingHorizontal: 24, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8, marginLeft: 4 },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  guardarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    marginTop: 4,
  },
  guardarBtnText: { color: "#FFF", fontSize: 18, fontWeight: "800" },
});
