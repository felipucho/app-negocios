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

export interface LineaCarrito {
  productoId: string
  nombre: string
  precio: number
  cantidad: number
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
}
