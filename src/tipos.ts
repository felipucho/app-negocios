export type Medio = 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'

export const MEDIOS: readonly Medio[] = ['efectivo', 'transferencia', 'tarjeta', 'fiado']

export const NOMBRE_MEDIO: Record<Medio, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
}

export type Rol = 'caja' | 'jefe'

/** Producto del catálogo, como viene de public.productos. Precio en pesos enteros. */
export interface Producto {
  id: string
  nombre: string
  precio: number
  codigo_barras: string | null
  activo: boolean
  creado_en_caja: boolean
}

/** Producto guardado en la caché, con las palabras normalizadas del nombre (índice multiEntry). */
export interface ProductoCache extends Producto {
  palabras: string[]
}

/** Línea de un producto del catálogo. */
export interface LineaProducto {
  varios?: false
  productoId: string
  nombre: string
  precio: number
  cantidad: number
}

/** Línea "Varios" (módulo varios): importe libre sin producto. lineaId sólo la identifica en la pantalla. */
export interface LineaVarios {
  varios: true
  lineaId: string
  /** Descripción tipeada, o "Varios" si quedó vacía. Hasta 40 letras. */
  nombre: string
  precio: number
  cantidad: number
}

export type LineaCarrito = LineaProducto | LineaVarios

/** Id de la línea en la pantalla y en el carrito: el del producto, o el propio de una línea Varios. */
export function idLinea(l: LineaCarrito): string {
  return l.varios ? l.lineaId : l.productoId
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
}
