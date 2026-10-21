import { describe, expect, it } from 'vitest'
import { formatearPesos, parsearPesos } from './plata'

describe('formatearPesos', () => {
  it('usa punto de miles y nunca decimales', () => {
    expect(formatearPesos(0)).toBe('$0')
    expect(formatearPesos(900)).toBe('$900')
    expect(formatearPesos(1500)).toBe('$1.500')
    expect(formatearPesos(1234567)).toBe('$1.234.567')
    expect(formatearPesos(-1500)).toBe('-$1.500')
  })
})

describe('parsearPesos', () => {
  it('lee enteros con o sin punto de miles', () => {
    expect(parsearPesos('1500')).toBe(1500)
    expect(parsearPesos('1.500')).toBe(1500)
    expect(parsearPesos(' 2.000.000 ')).toBe(2000000)
  })

  it('vacío es cero', () => {
    expect(parsearPesos('')).toBe(0)
  })

  it('rechaza centavos, negativos y texto', () => {
    expect(parsearPesos('10,5')).toBeNull()
    expect(parsearPesos('1.5')).toBeNull()
    expect(parsearPesos('-3')).toBeNull()
    expect(parsearPesos('abc')).toBeNull()
  })

  it('exige grupos de miles de 3 dígitos y como máximo 9 dígitos', () => {
    expect(parsearPesos('999.999.999')).toBe(999999999)
    expect(parsearPesos('1234567890')).toBeNull()
    expect(parsearPesos('1.50')).toBeNull()
    expect(parsearPesos('1.5000')).toBeNull()
  })
})
