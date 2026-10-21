import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_CATALOGO_MS, programarSincronizacion } from './programar'

describe('programarSincronizacion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('revisa al arrancar, cada 3 minutos y al volver a la pestaña', () => {
    const sincronizar = vi.fn(async () => undefined)
    const cancelar = programarSincronizacion(sincronizar)
    expect(INTERVALO_CATALOGO_MS).toBe(180_000)
    expect(sincronizar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(INTERVALO_CATALOGO_MS)
    expect(sincronizar).toHaveBeenCalledTimes(2)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sincronizar).toHaveBeenCalledTimes(3)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sincronizar).toHaveBeenCalledTimes(3)
    cancelar()
    vi.advanceTimersByTime(INTERVALO_CATALOGO_MS * 2)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sincronizar).toHaveBeenCalledTimes(3)
  })

  it('un error de red no corta las revisiones siguientes', async () => {
    const sincronizar = vi.fn(async () => {
      throw new Error('sin red')
    })
    programarSincronizacion(sincronizar)
    await vi.advanceTimersByTimeAsync(INTERVALO_CATALOGO_MS)
    expect(sincronizar).toHaveBeenCalledTimes(2)
  })
})
