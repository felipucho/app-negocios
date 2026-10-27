import type { LineaCarrito, Producto } from '../tipos'

/** Venta en armado. Puro: el id de la venta vive aparte (idVenta.ts). */
export interface Carrito {
  lineas: LineaCarrito[]
}

export type AccionCarrito =
  | { tipo: 'agregar'; producto: Pick<Producto, 'id' | 'nombre' | 'precio'> }
  | { tipo: 'cambiarCantidad'; productoId: string; delta: 1 | -1 }
  | { tipo: 'actualizarPrecios'; precios: Record<string, number> }
  | { tipo: 'vaciar' }

export const carritoVacio: Carrito = { lineas: [] }

export function carritoReducer(c: Carrito, a: AccionCarrito): Carrito {
  switch (a.tipo) {
    case 'agregar': {
      const existe = c.lineas.some((l) => l.productoId === a.producto.id)
      return {
        lineas: existe
          ? c.lineas.map((l) => (l.productoId === a.producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
          : [...c.lineas, { productoId: a.producto.id, nombre: a.producto.nombre, precio: a.producto.precio, cantidad: 1 }],
      }
    }
    case 'cambiarCantidad':
      return {
        lineas: c.lineas
          .map((l) => (l.productoId === a.productoId ? { ...l, cantidad: l.cantidad + a.delta } : l))
          .filter((l) => l.cantidad > 0),
      }
    case 'actualizarPrecios':
      return {
        lineas: c.lineas.map((l) => (l.productoId in a.precios ? { ...l, precio: a.precios[l.productoId] } : l)),
      }
    case 'vaciar':
      return carritoVacio
  }
}

export function totalCarrito(c: Carrito): number {
  return c.lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0)
}
