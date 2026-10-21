import { describe, expect, it } from 'vitest'
import { crearFiltroDobleLectura, esDobleLectura } from './dobleLectura'

describe('esDobleLectura', () => {
  it.each([
    { caso: 'mismo código a 149 ms: se ignora', t: 149, codigo: '7790001', esperado: true },
    { caso: 'mismo código a 150 ms: vale', t: 150, codigo: '7790001', esperado: false },
    { caso: 'mismo código a 151 ms: vale', t: 151, codigo: '7790001', esperado: false },
    { caso: 'otro código a 10 ms: vale', t: 10, codigo: '7790002', esperado: false },
  ])('$caso', ({ t, codigo, esperado }) => {
    expect(esDobleLectura({ codigo: '7790001', t: 0 }, { codigo, t })).toBe(esperado)
  })

  it('sin lectura anterior nunca es doble', () => {
    expect(esDobleLectura(null, { codigo: '7790001', t: 0 })).toBe(false)
  })
})

describe('crearFiltroDobleLectura', () => {
  it('acepta la primera lectura y descarta la repetida a 149 ms', () => {
    const filtro = crearFiltroDobleLectura()
    expect(filtro.aceptar({ codigo: '7790001', t: 1000 })).toBe(true)
    expect(filtro.aceptar({ codigo: '7790001', t: 1149 })).toBe(false)
  })

  it('a 151 ms acepta las dos lecturas', () => {
    const filtro = crearFiltroDobleLectura()
    expect(filtro.aceptar({ codigo: '7790001', t: 1000 })).toBe(true)
    expect(filtro.aceptar({ codigo: '7790001', t: 1151 })).toBe(true)
  })
})
