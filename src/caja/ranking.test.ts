import { describe, expect, it } from 'vitest'
import { palabras } from '../catalogo/normalizar'
import { ALFAJOR, BIZCOCHOS, CHIPA, FACTURAS, PAN_VIEJO } from '../test/caja'
import type { ProductoCache } from '../tipos'
import { filtrarPanel, LUGARES_PANEL, ordenarSinCodigo, type FilaRanking } from './ranking'

const fila = (p: ProductoCache, cantidad_ventas: number): FilaRanking => ({ producto_id: p.id, nombre: p.nombre, cantidad_ventas })

describe('ordenarSinCodigo', () => {
  it('ordena por cantidad de ventas y desempata en orden alfabético', () => {
    const ranking = [fila(FACTURAS, 5), fila(CHIPA, 2), fila(BIZCOCHOS, 2)]
    expect(ordenarSinCodigo(ranking, [CHIPA, BIZCOCHOS, FACTURAS]).map((p) => p.nombre)).toEqual([
      'Facturas', 'Bizcochos', 'Chipá',
    ])
  })

  it('saca desactivados y productos con código aunque estén en el ranking', () => {
    const ranking = [fila(PAN_VIEJO, 9), fila(ALFAJOR, 9), fila(BIZCOCHOS, 1)]
    expect(ordenarSinCodigo(ranking, [PAN_VIEJO, ALFAJOR, BIZCOCHOS]).map((p) => p.nombre)).toEqual(['Bizcochos'])
  })

  it('lo que no está en el ranking cuenta 0 y va en orden alfabético', () => {
    expect(ordenarSinCodigo([], [FACTURAS, CHIPA, BIZCOCHOS]).map((p) => p.nombre)).toEqual([
      'Bizcochos', 'Chipá', 'Facturas',
    ])
    expect(ordenarSinCodigo([fila(FACTURAS, 1)], [CHIPA, BIZCOCHOS, FACTURAS]).map((p) => p.nombre)).toEqual([
      'Facturas', 'Bizcochos', 'Chipá',
    ])
  })
})

describe('filtrarPanel', () => {
  it('filtra por inicio de palabra, sin tildes ni mayúsculas, desde una letra', () => {
    const lista = [BIZCOCHOS, CHIPA, FACTURAS]
    expect(filtrarPanel(lista, 'chi').map((p) => p.nombre)).toEqual(['Chipá'])
    expect(filtrarPanel(lista, 'CHIPA').map((p) => p.nombre)).toEqual(['Chipá'])
    expect(filtrarPanel(lista, 'f').map((p) => p.nombre)).toEqual(['Facturas'])
  })

  it('sin texto muestra todo, hasta los 20 lugares de la grilla', () => {
    const muchos: ProductoCache[] = Array.from({ length: 25 }, (_, i) => ({
      ...BIZCOCHOS,
      id: `m${i}`,
      nombre: `Producto ${i}`,
      palabras: palabras(`Producto ${i}`),
    }))
    expect(filtrarPanel(muchos, '')).toHaveLength(LUGARES_PANEL)
    expect(LUGARES_PANEL).toBe(20)
  })
})
