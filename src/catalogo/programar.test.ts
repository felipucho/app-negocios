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

  it('una caída se avisa una vez como error y el resto de la racha como aviso; un éxito la cierra', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    let caido = true
    const sincronizar = vi.fn(async () => {
      if (caido) throw new Error('sin red')
    })
    const cancelar = programarSincronizacion(sincronizar)
    await vi.advanceTimersByTimeAsync(INTERVALO_CATALOGO_MS * 2)
    expect(sincronizar).toHaveBeenCalledTimes(3)
    expect(error).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(2)
    caido = false
    await vi.advanceTimersByTimeAsync(INTERVALO_CATALOGO_MS)
    caido = true
    await vi.advanceTimersByTimeAsync(INTERVALO_CATALOGO_MS)
    expect(error).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(2)
    cancelar()
    error.mockRestore()
    warn.mockRestore()
  })
})
