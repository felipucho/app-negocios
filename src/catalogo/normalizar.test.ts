import { describe, expect, it } from 'vitest'
import { normalizar, palabras } from './normalizar'

describe('normalizar', () => {
  it('saca tildes y mayúsculas y colapsa espacios', () => {
    expect(normalizar('  Café   CON Leche ')).toBe('cafe con leche')
    expect(normalizar('Ñandú Águila')).toBe('nandu aguila')
  })

  it('texto vacío queda vacío', () => {
    expect(normalizar('')).toBe('')
    expect(normalizar('   ')).toBe('')
  })
})

describe('palabras', () => {
  it('parte en palabras alfanuméricas', () => {
    expect(palabras('Coca-Cola 1,5 L')).toEqual(['coca', 'cola', '1', '5', 'l'])
    expect(palabras('   ')).toEqual([])
  })
})
