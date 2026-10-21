import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerDispositivoId } from './dispositivo'

describe('obtenerDispositivoId', () => {
  beforeEach(() => localStorage.clear())

  it('genera el id una vez y después lo reusa (las pestañas lo comparten)', () => {
    const nuevoId = vi.fn(() => 'pc-1')
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(nuevoId).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dispositivo-id:negocio-1')).toBe('pc-1')
  })

  it('cada kiosco tiene su propio id en el mismo navegador', () => {
    let n = 0
    const nuevoId = () => `pc-${++n}`
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(obtenerDispositivoId('negocio-2', localStorage, nuevoId)).toBe('pc-2')
    expect(localStorage.length).toBe(2)
  })
})
