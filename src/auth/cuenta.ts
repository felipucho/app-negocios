import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '../tipos'

export const SIN_CUENTA = 'Esta cuenta no está vinculada a ningún kiosco.'

export interface Cuenta {
  usuarioId: string
  negocioId: string
  rol: Rol
}

/** Rol y negocio propios, leídos de cuentas (RLS: sólo la fila de auth.uid()). null = sin cuenta (plan B de la tarea 4). */
export async function leerCuenta(supabase: SupabaseClient, usuarioId: string): Promise<Cuenta | null> {
  const { data, error } = await supabase
    .from('cuentas')
    .select('usuario_id, negocio_id, rol')
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const fila = data as { usuario_id: string; negocio_id: string; rol: Rol }
  return { usuarioId: fila.usuario_id, negocioId: fila.negocio_id, rol: fila.rol }
}
