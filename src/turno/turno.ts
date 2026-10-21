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

export interface CierreTurno {
  turnoId: string
  apertura: string
  cierre: string
  totales: TotalesTurno
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

export async function abrirTurno(supabase: SupabaseClient, dispositivoId: string): Promise<TurnoAbierto> {
  const { data, error } = await supabase.rpc('abrir_turno', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  const r = data as { turno_id: string; apertura: string }
  return { turnoId: r.turno_id, apertura: r.apertura }
}

export async function cerrarTurno(supabase: SupabaseClient, dispositivoId: string): Promise<CierreTurno> {
  const { data, error } = await supabase.rpc('cerrar_turno', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  const r = data as { turno_id: string; apertura: string; cierre: string; totales: TotalesTurno }
  return { turnoId: r.turno_id, apertura: r.apertura, cierre: r.cierre, totales: r.totales }
}
