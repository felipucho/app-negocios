import { describe, expect, it } from 'vitest'
import { intervalos, umbralSugerido } from './calibrar'

describe('calibración del escáner', () => {
  it('intervalos entre pulsaciones consecutivas', () => {
    expect(intervalos([0, 5, 12, 20])).toEqual([5, 7, 8])
  })

  it('sugiere el máximo medido más la mitad, redondeado hacia arriba', () => {
    expect(umbralSugerido([5, 7, 8])).toEqual({ minimo: 5, maximo: 8, sugerido: 12 })
    expect(umbralSugerido([10.2, 33])).toEqual({ minimo: 10.2, maximo: 33, sugerido: 50 })
  })

  it('sin mediciones no sugiere nada', () => {
    expect(umbralSugerido([])).toBeNull()
  })
})
