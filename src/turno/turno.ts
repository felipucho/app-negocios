import type { SupabaseClient } from '@supabase/supabase-js'

export interface TotalesTurno {
  efectivo: number
  transferencia: number
  tarjeta: number
  fiado: number
  /** Efectivo + transferencia + tarjeta. El fiado no es plata cobrada. */
  cobrado: number
}

export interface TurnoAbierto {
  turnoId: string
  apertura: string
}

/** Sólo con el módulo movimientos_caja (spec 2026-10-27). */
export interface ArqueoTurno {
  monto_inicial: number | null
  ingresos: number
  retiros: number
  gastos: number
  pagos_proveedor: number
  efectivo_esperado: number
  /** null si se cerró sin contar. */
  efectivo_contado: number | null
  /** Contado − esperado: negativo = falta plata. null si se cerró sin contar. */
  diferencia: number | null
}

export interface CierreTurno {
  turnoId: string
  apertura: string
  cierre: string
  totales: TotalesTurno
  arqueo?: ArqueoTurno
}

export async function leerTurnoAbierto(supabase: SupabaseClient, dispositivoId: string): Promise<TurnoAbierto | null> {
  const { data, error } = await supabase
    .from('turnos')
    .select('id, apertura')
    .eq('dispositivo_id', dispositivoId)
    .is('cierre', null)
    .maybeSingle()
  if (error) throw error
  return data ? { turnoId: data.id as string, apertura: data.apertura as string } : null
}

type FilaCierre = { turno_id: string; apertura: string; cierre: string; totales: TotalesTurno; arqueo?: ArqueoTurno }

const aCierre = (r: FilaCierre): CierreTurno => ({
  turnoId: r.turno_id,
  apertura: r.apertura,
  cierre: r.cierre,
  totales: r.totales,
  ...(r.arqueo && { arqueo: r.arqueo }),
})

export interface AperturaTurno extends TurnoAbierto {
  /** El turno abierto de la PC que esta apertura cerró solo, como lo devuelve cerrarTurno. null si no había. */
  turnoCerrado: CierreTurno | null
}

export async function abrirTurno(supabase: SupabaseClient, dispositivoId: string): Promise<AperturaTurno> {
  const { data, error } = await supabase.rpc('abrir_turno', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  const r = data as { turno_id: string; apertura: string; turno_cerrado: FilaCierre | null }
  return { turnoId: r.turno_id, apertura: r.apertura, turnoCerrado: r.turno_cerrado ? aCierre(r.turno_cerrado) : null }
}

/** efectivoContado sólo con el módulo movimientos_caja: la base guarda el arqueo. */
export async function cerrarTurno(supabase: SupabaseClient, dispositivoId: string, efectivoContado?: number): Promise<CierreTurno> {
  const { data, error } = await supabase.rpc('cerrar_turno', {
    p_dispositivo_id: dispositivoId,
    ...(efectivoContado !== undefined && { p_efectivo_contado: efectivoContado }),
  })
  if (error) throw error
  return aCierre(data as FilaCierre)
}

/** El mismo resultado que cerrarTurno, para el último turno cerrado de la PC. null si no cerró ninguno. */
export async function leerUltimoTurnoCerrado(supabase: SupabaseClient, dispositivoId: string): Promise<CierreTurno | null> {
  const { data, error } = await supabase.rpc('ultimo_turno_cerrado', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  return data ? aCierre(data as FilaCierre) : null
}
