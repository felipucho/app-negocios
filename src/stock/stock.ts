import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

/** Fila de stock_productos. La cantidad puede ser negativa: la venta nunca se frena por stock. */
export interface StockProducto {
  producto_id: string
  cantidad: number
  minimo: number
}

/** Fila de faltantes(). proveedor llega vacío a la caja (productos_gestion es sólo del jefe). */
export interface Faltante {
  producto_id: string
  nombre: string
  cantidad: number
  minimo: number
  proveedor: string | null
}

export interface ItemIngreso {
  productoId: string
  cantidad: number
}

export interface ServicioStock {
  leerStock(): Promise<StockProducto[]>
  leerFaltantes(): Promise<Faltante[]>
  /** loteId lo genera quien llama y se repite en cada reintento del mismo ingreso: no suma dos veces. */
  ingresar(loteId: string, items: ItemIngreso[]): Promise<{ ya_existia: boolean }>
  /** Sólo jefe. undefined = no cambia. Cambiar la cantidad pide motivo. */
  ajustar(productoId: string, cambio: { cantidad?: number; minimo?: number; motivo?: string }): Promise<StockProducto>
}

export const MENSAJES_STOCK: Record<string, string> = {
  modulo_deshabilitado: 'Este kiosco no tiene activado el módulo de stock.',
  solo_jefe: 'Sólo el jefe puede ajustar el stock.',
  linea_invalida: 'Revisá las cantidades: enteras, mayores que cero y un renglón por producto.',
  producto_desconocido: 'Ese producto no existe en este kiosco.',
  motivo_invalido: 'Para corregir la cantidad, escribí el motivo (de 3 a 200 letras).',
  cantidad_invalida: 'El mínimo no puede ser negativo.',
  lote_id_reusado: 'Este ingreso ya se registró. Empezá uno nuevo.',
  pedido_invalido: 'El ingreso está vacío o tiene más de 200 productos.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

export function mensajeStock(e: unknown): string {
  return MENSAJES_STOCK[codigoDeError(e)] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function crearServicioStock(supabase: SupabaseClient, dispositivoId: string): ServicioStock {
  return {
    async leerStock() {
      const { data, error } = await supabase.from('stock_productos').select('producto_id, cantidad, minimo')
      if (error) throw error
      return (data ?? []) as StockProducto[]
    },
    async leerFaltantes() {
      const { data, error } = await supabase.rpc('faltantes')
      if (error) throw error
      return (data ?? []) as Faltante[]
    },
    async ingresar(loteId, items) {
      const { data, error } = await supabase.rpc('ingresar_stock', {
        p_lote_id: loteId,
        p_dispositivo_id: dispositivoId,
        p_items: items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
      })
      if (error) throw error
      return data as { ya_existia: boolean }
    },
    async ajustar(productoId, c) {
      const { data, error } = await supabase.rpc('ajustar_stock', {
        p_dispositivo_id: dispositivoId,
        p_producto_id: productoId,
        p_cantidad: c.cantidad ?? null,
        p_minimo: c.minimo ?? null,
        p_motivo: c.motivo ?? null,
      })
      if (error) throw error
      return data as StockProducto
    },
  }
}
