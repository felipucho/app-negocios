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
