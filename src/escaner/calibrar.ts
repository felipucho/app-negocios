/** Intervalos entre pulsaciones consecutivas de una lectura (ms). */
export function intervalos(tiempos: readonly number[]): number[] {
  return tiempos.slice(1).map((t, i) => t - tiempos[i])
}

export interface ResumenCalibracion {
  minimo: number
  maximo: number
  /** Valor para intervaloEscaneoMs en umbrales.ts. */
  sugerido: number
}

/** Máximo medido con el escáner real más la mitad de margen, redondeado hacia arriba. null sin datos. */
export function umbralSugerido(intervalosMs: readonly number[]): ResumenCalibracion | null {
  if (intervalosMs.length === 0) return null
  const minimo = Math.min(...intervalosMs)
  const maximo = Math.max(...intervalosMs)
  return { minimo, maximo, sugerido: Math.ceil(maximo * 1.5) }
}
