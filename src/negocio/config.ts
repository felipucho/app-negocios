import type { SupabaseClient } from '@supabase/supabase-js'

/** Valores del enum public.estado_abono (tarea 3). Los carga Felipe a mano desde Studio. */
export type EstadoAbono = 'activo' | 'gracia' | 'suspendido'

/** Config visual del negocio (spec sección 5a). Sólo Felipe la cambia, desde Studio; la app sólo la lee. */
export interface ConfigNegocio {
  nombreVisible: string
  logoUrl: string | null
  colorPrimario: string | null
}

/** Fila de public.config_negocio (tarea 3). */
export interface FilaConfigNegocio {
  nombre_visible: string
  logo_url: string | null
  color_primario: string
}

const COLOR = /^#[0-9a-fA-F]{6}$/

/** La CSP (tarea 19) sólo deja cargar imágenes propias y del Supabase del proyecto: otro origen no se muestra. */
export function logoPermitido(url: string | null, origenLogos: string): string | null {
  if (!url) return null
  try {
    const logo = new URL(url)
    return logo.protocol === 'https:' && logo.origin === new URL(origenLogos).origin ? logo.toString() : null
  } catch {
    return null
  }
}

export function aConfig(fila: FilaConfigNegocio, origenLogos: string): ConfigNegocio {
  return {
    nombreVisible: fila.nombre_visible,
    logoUrl: logoPermitido(fila.logo_url, origenLogos),
    // La base ya lo chequea (tarea 3); se repite porque el valor termina en una variable CSS.
    colorPrimario: COLOR.test(fila.color_primario) ? fila.color_primario : null,
  }
}

/** Config del negocio del token (RLS config_negocio_select). Sin fila: null y queda la pantalla genérica. */
export async function leerConfigNegocio(supabase: SupabaseClient, origenLogos: string): Promise<ConfigNegocio | null> {
  const { data, error } = await supabase
    .from('config_negocio')
    .select('nombre_visible, logo_url, color_primario')
    .maybeSingle()
  if (error) throw error
  return data ? aConfig(data as FilaConfigNegocio, origenLogos) : null
}

/** Estado del abono del negocio del token (RLS negocios_select). Sólo aviso: nunca bloquea (spec sección 8). */
export async function leerEstadoAbonoNegocio(supabase: SupabaseClient): Promise<EstadoAbono | null> {
  const { data, error } = await supabase.from('negocios').select('estado_abono').maybeSingle()
  if (error) throw error
  return data ? (data as { estado_abono: EstadoAbono }).estado_abono : null
}

/** Aplica la config después del login (decisión 23). Devuelve cómo volver a la pantalla genérica. */
export function aplicarConfig(config: ConfigNegocio, doc: Document = document): () => void {
  const raiz = doc.documentElement
  const tituloAntes = doc.title
  const colorAntes = raiz.style.getPropertyValue('--color-primario')
  if (config.colorPrimario) raiz.style.setProperty('--color-primario', config.colorPrimario)
  doc.title = config.nombreVisible
  return () => {
    if (colorAntes) raiz.style.setProperty('--color-primario', colorAntes)
    else raiz.style.removeProperty('--color-primario')
    doc.title = tituloAntes
  }
}
