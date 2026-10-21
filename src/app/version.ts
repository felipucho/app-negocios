import type { SupabaseClient } from '@supabase/supabase-js'
import { programarSincronizacion } from '../catalogo/programar'

export const ESPERA_RECARGA_MS = 3_000
/** Marca en la URL la mínima para la que ya se recargó: evita recargas en bucle sin guardar nada en el navegador. */
export const PARAMETRO_RECARGA = 'version-minima'
export const AVISO_VERSION =
  'Hay una versión nueva de la app: la página se va a recargar en unos segundos. Si estabas cargando una venta, revisá las ventas de hoy antes de cargarla de nuevo.'
export const AVISO_VERSION_TRABADA =
  'Hay una versión nueva de la app, pero esta PC no la pudo cargar. Podés seguir vendiendo; avisale a Felipe.'

type Version = readonly [number, number, number]

/** "1.10.0" → [1, 10, 0]. Ignora un sufijo como "-beta". Texto inválido: null. */
export function leerVersion(texto: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(texto.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Negativo si a < b, 0 si son iguales, positivo si a > b; null si alguna es ilegible. 1.10.0 > 1.9.0. */
export function compararVersiones(a: string, b: string): number | null {
  const va = leerVersion(a)
  const vb = leerVersion(b)
  if (!va || !vb) return null
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i]
  }
  return 0
}

/** Una versión ilegible nunca fuerza la recarga: mejor una app vieja que una PC recargando sin fin. */
export function esAnterior(actual: string, minima: string): boolean {
  const c = compararVersiones(actual, minima)
  return c !== null && c < 0
}

/** Lo que la revisión necesita del navegador. En las pruebas, falsos. */
export interface EntornoVersion {
  actual: string
  leerMinima(): Promise<string | null>
  url(): URL
  avisar(texto: string): void
  esperar(ms: number, hacer: () => void): void
  recargar(url: string): void
}

export type ResultadoVersion = 'al_dia' | 'recargando' | 'trabada'

/** Spec sección 9, caso 6: si la app quedó bajo la versión mínima, avisa y recarga. */
export async function revisarVersion(e: EntornoVersion): Promise<ResultadoVersion> {
  const minima = await e.leerMinima()
  if (minima === null || !esAnterior(e.actual, minima)) return 'al_dia'
  const url = e.url()
  // Ya recargó una vez para esta mínima y sigue vieja (el deploy no llegó): avisa sin recargar en bucle.
  if (url.searchParams.get(PARAMETRO_RECARGA) === minima) {
    e.avisar(AVISO_VERSION_TRABADA)
    return 'trabada'
  }
  url.searchParams.set(PARAMETRO_RECARGA, minima)
  e.avisar(AVISO_VERSION)
  e.esperar(ESPERA_RECARGA_MS, () => e.recargar(url.toString()))
  return 'recargando'
}

/**
 * Revisa al arrancar, al volver a la pestaña y cada 3 minutos (misma programación que el catálogo, tarea 7).
 * Después de programar una recarga, o de avisar que quedó trabada, no vuelve a revisar. Devuelve cómo cancelar.
 */
export function vigilarVersion(e: EntornoVersion): () => void {
  let enCurso = false
  let listo = false
  return programarSincronizacion(async () => {
    if (enCurso || listo) return
    enCurso = true
    try {
      listo = (await revisarVersion(e)) !== 'al_dia'
    } finally {
      enCurso = false
    }
  })
}

/** Aviso fuera de React: se ve también antes del login. Uno solo, arriba de todo. */
export function avisarEnPantalla(texto: string, doc: Document = document): void {
  let aviso = doc.getElementById('aviso-version')
  if (!aviso) {
    aviso = doc.createElement('p')
    aviso.id = 'aviso-version'
    aviso.setAttribute('role', 'alert')
    aviso.className = 'aviso aviso--version'
    doc.body.prepend(aviso)
  }
  aviso.textContent = texto
}

/** version_minima() la pueden leer anon y authenticated (tarea 18, migración 121800). */
export async function leerVersionMinima(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc('version_minima')
  if (error) throw error
  return typeof data === 'string' ? data : null
}

export function entornoNavegador(leerMinima: () => Promise<string | null>): EntornoVersion {
  return {
    actual: __APP_VERSION__,
    leerMinima,
    url: () => new URL(window.location.href),
    avisar: (texto) => avisarEnPantalla(texto),
    esperar: (ms, hacer) => {
      window.setTimeout(hacer, ms)
    },
    recargar: (url) => window.location.replace(url),
  }
}
