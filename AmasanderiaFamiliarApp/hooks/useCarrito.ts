import { useState } from "react";
import { Alert } from "react-native";

export interface Producto {
  id_producto: number;
  nombre: string;
  precio_unitario: number;
}

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

export function useCarrito() {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const totalCarrito = carrito.reduce((sum, item) => sum + item.subtotal, 0);
  const totalUnidades = carrito.reduce((sum, item) => sum + item.cantidad, 0);

  const agregarAlCarrito = (producto: Producto) => {
    setCarrito((prev) => {
      const existe = prev.find(
        (item) => item.producto.id_producto === producto.id_producto,
      );
      if (existe) {
        return prev.map((item) =>
          item.producto.id_producto === producto.id_producto
            ? {
                ...item,
                cantidad: item.cantidad + 1,
                subtotal: (item.cantidad + 1) * item.producto.precio_unitario,
              }
            : item,
        );
      }
      return [
        ...prev,
        { producto, cantidad: 1, subtotal: producto.precio_unitario },
      ];
    });
  };

  const quitarDelCarrito = (id: number) => {
    setCarrito(
      (prev) =>
        prev
          .map((item) => {
            if (item.producto.id_producto === id) {
              const nuevaCantidad = item.cantidad - 1;
              if (nuevaCantidad <= 0) return null;
              return {
                ...item,
                cantidad: nuevaCantidad,
                subtotal: nuevaCantidad * item.producto.precio_unitario,
              };
            }
            return item;
          })
          .filter(Boolean) as ItemCarrito[],
    );
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
              prev.filter(
                (item) => item.producto.id_producto !== producto.id_producto,
              ),
            ),
        },
      ],
    );
  };

  const cantidadEnCarrito = (id: number): number =>
    carrito.find((item) => item.producto.id_producto === id)?.cantidad ?? 0;

  const limpiarCarrito = () => setCarrito([]);

  return {
    carrito,
    totalCarrito,
    totalUnidades,
    agregarAlCarrito,
    quitarDelCarrito,
    eliminarDelCarrito,
    cantidadEnCarrito,
    limpiarCarrito,
  };
}
