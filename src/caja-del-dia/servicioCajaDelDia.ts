import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'
import type { Medio } from '../tipos'

export interface TotalesMedios {
  efectivo: number
  transferencia: number
  tarjeta: number
  fiado: number
}

export interface AnulacionDelDia {
  venta_id: string
  prefijo: string
  numero: number
  fecha_venta: string
  fecha: string
  total: number
  motivo: string
}

/** caja_del_dia(p_fecha) (tarea 11). Los totales por medio ya vienen netos de las anulaciones del día. */
export interface CajaDia extends TotalesMedios {
  fecha: string
  /** Efectivo + transferencia + tarjeta. El fiado no es plata cobrada. */
  cobrado: number
  anulaciones: { cantidad: number; total: number; detalle: AnulacionDelDia[] }
}

/** Fila de ventas_del_dia(p_fecha) (tarea 11). Sin datos de clientes. */
export interface VentaDelDia {
  venta_id: string
  prefijo: string
  numero: number
  hora: string
  total: number
  medios: { medio: Medio; importe: number }[]
  anulada: boolean
}

/** anular_venta (tarea 11). */
export interface AnulacionHecha {
  anulacion_id: string
  venta_id: string
  fecha: string
  motivo: string
  ya_existia: boolean
}

export interface ServicioCajaDelDia {
  /** Día operativo según la base (public.hoy()), no según el reloj de la PC. YYYY-MM-DD. */
  hoy(): Promise<string>
  leerCaja(fecha: string): Promise<CajaDia>
  leerVentas(fecha: string): Promise<VentaDelDia[]>
  anular(ventaId: string, motivo: string): Promise<AnulacionHecha>
}

export const MENSAJES_CAJA_DEL_DIA: Record<string, string> = {
  fuera_de_dia: 'La caja sólo ve y anula ventas de hoy.',
  motivo_invalido: 'Escribí el motivo (de 3 a 200 letras).',
  venta_desconocida: 'Esa venta no existe en este kiosco.',
  sin_turno: 'Para anular, abrí el turno en esta PC.',
  fecha_invalida: 'Elegí una fecha.',
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

/** porDefecto: lo que se muestra si la base no devuelve un código conocido (cada acción tiene el suyo). */
export function mensajeCajaDelDia(e: unknown, porDefecto = 'No se pudo leer. Revisá la conexión y probá de nuevo.'): string {
  return MENSAJES_CAJA_DEL_DIA[codigoDeError(e)] ?? porDefecto
}

/** Igual a max_rows de supabase/config.toml: una página nunca puede venir cortada por el servidor. */
export const PAGINA_VENTAS = 1000

export function crearServicioCajaDelDia(supabase: SupabaseClient, dispositivoId: string): ServicioCajaDelDia {
  return {
    async hoy() {
      const { data, error } = await supabase.rpc('hoy')
      if (error) throw error
      return String(data)
    },
    async leerCaja(fecha) {
      const { data, error } = await supabase.rpc('caja_del_dia', { p_fecha: fecha })
      if (error) throw error
      return data as CajaDia
    },
    async leerVentas(fecha) {
      // PostgREST corta en max_rows (1000): se pide de a páginas hasta que una venga corta.
      // Una venta nueva entre páginas corre el offset y repite una fila: se descarta por id.
      const ventas = new Map<string, VentaDelDia>()
      for (let desde = 0; ; desde += PAGINA_VENTAS) {
        const { data, error } = await supabase
          .rpc('ventas_del_dia', { p_fecha: fecha })
          .range(desde, desde + PAGINA_VENTAS - 1)
        if (error) throw error
        const pagina = (data ?? []) as VentaDelDia[]
        for (const v of pagina) if (!ventas.has(v.venta_id)) ventas.set(v.venta_id, v)
        if (pagina.length < PAGINA_VENTAS) return [...ventas.values()]
      }
    },
    async anular(ventaId, motivo) {
      const { data, error } = await supabase.rpc('anular_venta', {
        p_venta_id: ventaId,
        p_dispositivo_id: dispositivoId,
        p_motivo: motivo,
      })
      if (error) throw error
      return data as AnulacionHecha
    },
  }
}
