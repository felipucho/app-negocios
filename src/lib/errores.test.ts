import { describe, expect, it } from 'vitest'
import { codigoDeError } from './errores'

describe('codigoDeError', () => {
  it('es el mensaje de un error de la base o de un Error', () => {
    expect(codigoDeError({ message: 'sin_turno' })).toBe('sin_turno')
    expect(codigoDeError(new Error('solo_jefe'))).toBe('solo_jefe')
  })

  it('es vacío si no hay mensaje o no es un objeto', () => {
    expect(codigoDeError(null)).toBe('')
    expect(codigoDeError(undefined)).toBe('')
    expect(codigoDeError('sin_turno')).toBe('')
    expect(codigoDeError({})).toBe('')
  })
})
