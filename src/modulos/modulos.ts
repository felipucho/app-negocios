import type { SupabaseClient } from '@supabase/supabase-js'

/** Claves de public.modulos (spec 2026-10-27). Felipe las prende por negocio desde Studio. */
export type ClaveModulo = 'fiado' | 'precios' | 'movimientos_caja' | 'stock' | 'varios' | 'proveedores'

export interface Modulo {
  clave: ClaveModulo
  descripcion: string
  activo: boolean
}

/** Estado efectivo de cada módulo para el negocio del token: mis_modulos ya calcula plan, excepciones y uso. */
export async function leerModulos(supabase: SupabaseClient): Promise<Modulo[]> {
  const { data, error } = await supabase.rpc('mis_modulos')
  if (error) throw error
  return (data ?? []) as Modulo[]
}
