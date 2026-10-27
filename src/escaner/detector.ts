import type { Umbrales } from './umbrales'

export interface Pulsacion {
  tecla: string
  t: number
}

export interface Escaneo {
  codigo: string
  /** Índice de la primera pulsación del escaneo: lo anterior fue tipeado a mano. */
  desde: number
}

/**
 * Escaneo contra tipeo (spec sección 6). Desde el Enter hacia atrás, junta la racha de pulsaciones
 * separadas por no más de intervaloEscaneoMs. Si la racha tiene al menos minimoCaracteres, es un
 * escaneo y el código es la racha, tenga letras o no. Si no, es tipeo y devuelve null.
 */
export function detectarEscaneo(
  pulsaciones: readonly Pulsacion[],
  tEnter: number,
  u: Pick<Umbrales, 'intervaloEscaneoMs' | 'minimoCaracteres'>,
): Escaneo | null {
  let desde = pulsaciones.length
  let siguiente = tEnter
  while (desde > 0 && siguiente - pulsaciones[desde - 1].t <= u.intervaloEscaneoMs) {
    desde -= 1
    siguiente = pulsaciones[desde].t
  }
  if (pulsaciones.length - desde < u.minimoCaracteres) return null
  return {
    codigo: pulsaciones
      .slice(desde)
      .map((p) => p.tecla)
      .join(''),
    desde,
  }
}

/** Tecla que cuenta para la racha: un carácter sin Ctrl, Alt ni Meta (un atajo no es tipeo ni escaneo). */
export function esTeclaDeRacha(e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey
}

/** Pulsación con el campo que la recibió y su valor antes de la tecla: sirve para deshacer lo tipeado. */
export interface PulsacionEnCampo extends Pulsacion {
  campo: string
  antes: string
}

/** Agrega la tecla a la racha. La racha guarda las últimas 64. */
export function registrarPulsacion(
  racha: readonly PulsacionEnCampo[],
  tecla: string,
  t: number,
  campo: { name: string; value: string } | null,
): PulsacionEnCampo[] {
  return [...racha, { tecla, t, campo: campo?.name ?? '', antes: campo?.value ?? '' }].slice(-64)
}

/** Hay una pulsación dentro del intervalo de escaneo antes de t: t sigue una racha en curso. */
export function enRacha(pulsaciones: readonly Pulsacion[], t: number, u: Pick<Umbrales, 'intervaloEscaneoMs'>): boolean {
  const ultima = pulsaciones.at(-1)
  return ultima !== undefined && t - ultima.t <= u.intervaloEscaneoMs
}
