import type { SupabaseClient } from '@supabase/supabase-js'

export interface Dispositivo {
  dispositivoId: string
  prefijo: string
}

/** Id de esta PC para este kiosco. Lo comparten todas las pestañas del navegador. */
export function obtenerDispositivoId(
  negocioId: string,
  storage: Storage = localStorage,
  nuevoId: () => string = () => crypto.randomUUID(),
): string {
  const clave = `dispositivo-id:${negocioId}`
  const guardado = storage.getItem(clave)
  if (guardado) return guardado
  const id = nuevoId()
  storage.setItem(clave, id)
  return id
}

/** Alta automática en el primer login (decisión 34); después devuelve el prefijo ya asignado. */
export async function registrarDispositivo(supabase: SupabaseClient, negocioId: string): Promise<Dispositivo> {
  const { data, error } = await supabase.rpc('registrar_dispositivo', {
    p_dispositivo_id: obtenerDispositivoId(negocioId),
  })
  if (error) throw error
  const r = data as { dispositivo_id: string; prefijo: string }
  return { dispositivoId: r.dispositivo_id, prefijo: r.prefijo }
}
