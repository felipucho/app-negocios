import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

export type TipoMovimientoCaja = 'ingreso' | 'retiro' | 'gasto' | 'pago_proveedor'

/** Fila de movimientos_caja como la devuelve registrar_movimiento_caja. */
export interface MovimientoCaja {
  id: string
  turno_id: string
  dispositivo_id: string
  cuenta_id: string
  fecha: string
  tipo: TipoMovimientoCaja
  importe: number
  detalle: string | null
  ya_existia: boolean
}

export interface ServicioMovimientosCaja {
  /** Una vez por turno. */
  fijarMontoInicial(monto: number): Promise<void>
  /** movimientoId lo genera quien llama y se repite en cada reintento: no registra dos veces. */
  registrar(movimientoId: string, tipo: TipoMovimientoCaja, importe: number, detalle?: string): Promise<MovimientoCaja>
}

export const MENSAJES_MOVIMIENTOS_CAJA: Record<string, string> = {
  modulo_deshabilitado: 'Este kiosco no tiene activados los movimientos de caja.',
  monto_inicial_fijado: 'El monto inicial de este turno ya se cargó.',
  sin_turno: 'Abrí el turno en esta PC.',
  importe_invalido: 'El importe tiene que ser mayor que cero.',
  tipo_invalido: 'Elegí ingreso, retiro, gasto o pago a proveedor.',
  texto_invalido: 'El detalle tiene hasta 120 letras.',
  movimiento_id_reusado: 'Este movimiento ya se registró con otros datos. Empezá uno nuevo.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

export function mensajeMovimientosCaja(e: unknown): string {
  return MENSAJES_MOVIMIENTOS_CAJA[codigoDeError(e)] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function crearServicioMovimientosCaja(supabase: SupabaseClient, dispositivoId: string): ServicioMovimientosCaja {
  return {
    async fijarMontoInicial(monto) {
      const { error } = await supabase.rpc('fijar_monto_inicial', { p_dispositivo_id: dispositivoId, p_monto: monto })
      if (error) throw error
    },
    async registrar(movimientoId, tipo, importe, detalle) {
      const { data, error } = await supabase.rpc('registrar_movimiento_caja', {
        p_movimiento_id: movimientoId,
        p_dispositivo_id: dispositivoId,
        p_tipo: tipo,
        p_importe: importe,
        p_detalle: detalle ?? null,
      })
      if (error) throw error
      return data as MovimientoCaja
    },
  }
}
