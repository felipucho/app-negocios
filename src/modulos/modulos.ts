import type { SupabaseClient } from '@supabase/supabase-js'

/** Claves de public.modulos (spec 2026-10-27). Felipe las prende por negocio desde Studio. */
export type ClaveModulo = 'fiado' | 'precios' | 'movimientos_caja' | 'stock' | 'varios'

export interface Modulo {
  clave: ClaveModulo
  descripcion: string
  activo: boolean
}

/** Catálogo de módulos con su estado para el negocio del token: sin fila en modulos_negocio vale el defecto. */
export async function leerModulos(supabase: SupabaseClient): Promise<Modulo[]> {
  const [catalogo, propios] = await Promise.all([
    supabase.from('modulos').select('clave, activo_por_defecto, descripcion').order('clave'),
    supabase.from('modulos_negocio').select('modulo, activo'),
  ])
  if (catalogo.error) throw catalogo.error
  if (propios.error) throw propios.error
  const activos = new Map((propios.data ?? []).map((f) => [f.modulo as string, f.activo as boolean]))
  return (catalogo.data ?? []).map((m) => ({
    clave: m.clave as ClaveModulo,
    descripcion: m.descripcion as string,
    activo: activos.get(m.clave as string) ?? (m.activo_por_defecto as boolean),
  }))
}
