import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearIdVenta } from './idVenta'

describe('crearIdVenta', () => {
  afterEach(() => vi.restoreAllMocks())

  const generador = () => {
    let n = 0
    return crearIdVenta(() => `id-${++n}`)
  }

  it('el reintento con el mismo contenido usa el mismo id', () => {
    const ids = generador()
    expect(ids.idPara('carrito A')).toBe('id-1')
    expect(ids.idPara('carrito A')).toBe('id-1')
  })

  it('un cambio de carrito o de pagos genera un id nuevo', () => {
    const ids = generador()
    ids.idPara('carrito A')
    expect(ids.idPara('carrito A + 1 alfajor')).toBe('id-2')
  })

  it('después de confirmar, una venta igual lleva otro id', () => {
    const ids = generador()
    ids.idPara('carrito A')
    ids.reiniciar()
    expect(ids.idPara('carrito A')).toBe('id-2')
  })

  it('nunca guarda nada en el navegador', () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem')
    const ids = crearIdVenta()
    ids.idPara('carrito A')
    expect(guardar).not.toHaveBeenCalled()
  })
})
