import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

/** Fila de productos_gestion: sólo la lee el jefe (RLS). */
export interface GestionProducto {
  producto_id: string
  costo: number | null
  rubro: string | null
  proveedor: string | null
}

export type Redondeo = 1 | 5 | 10 | 50 | 100

export interface PedidoAumento {
  /** Id de la operación: lo elige quien llama y lo repite en cada reintento del mismo aumento. */
  operacionId: string
  /** De −90 a 1000, distinto de 0. */
  porcentaje: number
  /** Redondea hacia arriba al múltiplo. */
  redondeo: Redondeo
  /** Sin rubro ni proveedor: todos los productos. */
  rubro?: string
  proveedor?: string
}

/** ya_existia: esa operación ya se había aplicado; esta vez no cambió nada y cantidad es lo que cambió entonces. */
export interface ResultadoAumento {
  cantidad: number
  ya_existia: boolean
}

export interface ServicioPrecios {
  leerGestion(): Promise<GestionProducto[]>
  /** Reemplaza los tres valores; null = sin dato. */
  editarGestion(productoId: string, datos: Omit<GestionProducto, 'producto_id'>): Promise<GestionProducto>
  /** Cuántos precios cambiaron. Con el mismo operacionId, una segunda vez no aplica nada. */
  aumentarPrecios(pedido: PedidoAumento): Promise<ResultadoAumento>
}

export const MENSAJES_PRECIOS: Record<string, string> = {
  solo_jefe: 'Sólo el jefe puede cambiar precios y costos.',
  modulo_deshabilitado: 'Este kiosco no tiene activado el módulo de precios.',
  producto_desconocido: 'Ese producto no existe en este kiosco.',
  costo_invalido: 'El costo es en pesos enteros, sin centavos.',
  texto_invalido: 'El rubro (hasta 40 letras) o el proveedor (hasta 60) no son válidos.',
  porcentaje_invalido: 'El porcentaje va de −90 a 1000 y no puede ser 0.',
  redondeo_invalido: 'Elegí redondear a 1, 5, 10, 50 o 100.',
  precio_invalido: 'Algún precio quedaría demasiado alto. No se cambió nada.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

export function mensajePrecios(e: unknown): string {
  return MENSAJES_PRECIOS[codigoDeError(e)] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function crearServicioPrecios(supabase: SupabaseClient, dispositivoId: string): ServicioPrecios {
  return {
    async leerGestion() {
      const { data, error } = await supabase.from('productos_gestion').select('producto_id, costo, rubro, proveedor')
      if (error) throw error
      return (data ?? []) as GestionProducto[]
    },
    async editarGestion(productoId, d) {
      const { data, error } = await supabase.rpc('editar_gestion_producto', {
        p_producto_id: productoId,
        p_costo: d.costo,
        p_rubro: d.rubro,
        p_proveedor: d.proveedor,
      })
      if (error) throw error
      return data as GestionProducto
    },
    async aumentarPrecios(p) {
      const { data, error } = await supabase.rpc('aumentar_precios', {
        p_dispositivo_id: dispositivoId,
        p_operacion_id: p.operacionId,
        p_porcentaje: p.porcentaje,
        p_redondeo: p.redondeo,
        p_rubro: p.rubro ?? null,
        p_proveedor: p.proveedor ?? null,
      })
      if (error) throw error
      return data as ResultadoAumento
    },
  }
}
