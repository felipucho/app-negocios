import { describe, expect, it } from 'vitest'
import { detectarEscaneo, type Pulsacion } from './detector'
import { UMBRALES } from './umbrales'

/** Pulsaciones de `texto` desde `inicio`, separadas por `paso` ms. */
function teclas(texto: string, inicio: number, paso: number): Pulsacion[] {
  return [...texto].map((tecla, i) => ({ tecla, t: inicio + i * paso }))
}

/** Momento del Enter: `espera` ms después de la última pulsación. */
const enter = (p: Pulsacion[], espera: number) => p[p.length - 1].t + espera

const lento = teclas('alfajor', 0, 200)
const rapido = teclas('7790001', 0, 5)
const conLetras = teclas('ABC-123', 0, 5)
const mezcla = [...teclas('co', 0, 200), ...teclas('7790001', 1200, 5)]
const corto = teclas('779', 0, 5)
const enElLimite = teclas('7790001', 0, 50)
const pasado = teclas('7790001', 0, 51)

describe('detectarEscaneo', () => {
  it.each([
    { caso: 'tipeo lento', pulsaciones: lento, tEnter: enter(lento, 200), esperado: null },
    { caso: 'escaneo rápido con Enter', pulsaciones: rapido, tEnter: enter(rapido, 5), esperado: { codigo: '7790001', desde: 0 } },
    { caso: 'escaneo con letras', pulsaciones: conLetras, tEnter: enter(conLetras, 5), esperado: { codigo: 'ABC-123', desde: 0 } },
    { caso: 'tipeo y después escaneo: gana el código', pulsaciones: mezcla, tEnter: enter(mezcla, 5), esperado: { codigo: '7790001', desde: 2 } },
    { caso: 'racha rápida más corta que el mínimo', pulsaciones: corto, tEnter: enter(corto, 5), esperado: null },
    { caso: 'caracteres rápidos pero Enter tardío', pulsaciones: rapido, tEnter: enter(rapido, 300), esperado: null },
    { caso: 'Enter solo', pulsaciones: [], tEnter: 100, esperado: null },
    { caso: '50 ms entre caracteres todavía es escaneo', pulsaciones: enElLimite, tEnter: enter(enElLimite, 50), esperado: { codigo: '7790001', desde: 0 } },
    { caso: '51 ms entre caracteres ya es tipeo', pulsaciones: pasado, tEnter: enter(pasado, 51), esperado: null },
  ])('$caso', ({ pulsaciones, tEnter, esperado }) => {
    expect(detectarEscaneo(pulsaciones, tEnter, UMBRALES)).toEqual(esperado)
  })
})
