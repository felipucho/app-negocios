import { UMBRALES } from './umbrales'

export interface Lectura {
  codigo: string
  t: number
}

export interface FiltroDobleLectura {
  /** true = lectura válida; false = lectura doble, se ignora. */
  aceptar(lectura: Lectura): boolean
}

/** El mismo código antes de umbralMs es lectura doble (spec sección 9, caso 4). */
export function esDobleLectura(anterior: Lectura | null, actual: Lectura, umbralMs: number = UMBRALES.dobleLecturaMs): boolean {
  return anterior !== null && anterior.codigo === actual.codigo && actual.t - anterior.t < umbralMs
}

/**
 * Aplica a la lectura del escáner, no a la venta: para más unidades se usa el +.
 * Compara contra la lectura anterior, aunque esa también se haya ignorado.
 */
export function crearFiltroDobleLectura(umbralMs: number = UMBRALES.dobleLecturaMs): FiltroDobleLectura {
  let anterior: Lectura | null = null
  return {
    aceptar(lectura) {
      const doble = esDobleLectura(anterior, lectura, umbralMs)
      anterior = lectura
      return !doble
    },
  }
}
