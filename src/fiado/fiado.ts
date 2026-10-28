import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

/** Fila de saldos_fiado(). Un cliente suprimido sólo aparece si todavía debe. */
export interface SaldoFiado {
  cliente_id: string
  nombre: string
  saldo: number
  /** null = sin límite. */
  limite_fiado: number | null
}

export type MedioCobroFiado = 'efectivo' | 'transferencia' | 'tarjeta'

export interface CobroFiado {
  pago_id: string
  fecha: string
  /** Saldo que quedó después del cobro. */
  saldo: number
  ya_existia: boolean
}

export interface ServicioFiado {
  leerSaldos(): Promise<SaldoFiado[]>
  /** pagoId lo genera quien llama y se repite en cada reintento del mismo cobro: no cobra dos veces. */
  cobrar(pagoId: string, clienteId: string, medio: MedioCobroFiado, importe: number): Promise<CobroFiado>
  /** Sólo jefe. null = sin límite. */
  fijarLimite(clienteId: string, limite: number | null): Promise<number | null>
}

export const MENSAJES_FIADO: Record<string, string> = {
  importe_mayor_a_saldo: 'El importe es mayor que lo que debe.',
  importe_invalido: 'El importe tiene que ser mayor que cero.',
  pago_invalido: 'Elegí efectivo, transferencia o tarjeta.',
  pago_id_reusado: 'Este cobro ya se registró con otros datos. Empezá uno nuevo.',
  cliente_desconocido: 'Ese cliente no existe en este kiosco.',
  sin_turno: 'Para cobrar, abrí el turno en esta PC.',
  solo_jefe: 'Sólo el jefe puede fijar el límite.',
  fiado_deshabilitado: 'El fiado está desactivado en este kiosco.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

export function mensajeFiado(e: unknown): string {
  return MENSAJES_FIADO[codigoDeError(e)] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function crearServicioFiado(supabase: SupabaseClient, dispositivoId: string): ServicioFiado {
  return {
    async leerSaldos() {
      const { data, error } = await supabase.rpc('saldos_fiado')
      if (error) throw error
      return (data ?? []) as SaldoFiado[]
    },
    async cobrar(pagoId, clienteId, medio, importe) {
      const { data, error } = await supabase.rpc('cobrar_fiado', {
        p_pago_id: pagoId,
        p_dispositivo_id: dispositivoId,
        p_cliente_id: clienteId,
        p_medio: medio,
        p_importe: importe,
      })
      if (error) throw error
      return data as CobroFiado
    },
    async fijarLimite(clienteId, limite) {
      const { data, error } = await supabase.rpc('fijar_limite_fiado', { p_cliente_id: clienteId, p_limite: limite })
      if (error) throw error
      return (data as { limite_fiado: number | null }).limite_fiado
    },
  }
}
