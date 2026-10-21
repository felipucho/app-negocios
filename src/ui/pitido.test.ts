import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pitido', () => {
  it('sin Web Audio no rompe la venta', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { pitido } = await import('./pitido')
    expect(() => pitido()).not.toThrow()
  })

  it('suena un tono corto', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const oscilador = { type: '', frequency: { value: 0 }, connect: vi.fn((n: unknown) => n), start, stop }
    const volumen = { gain: { value: 0 }, connect: vi.fn((n: unknown) => n) }
    class AudioContextFalso {
      state = 'running'
      currentTime = 2
      destination = {}
      createOscillator = () => oscilador
      createGain = () => volumen
      resume = vi.fn(async () => undefined)
    }
    vi.stubGlobal('AudioContext', AudioContextFalso)
    const { pitido } = await import('./pitido')
    pitido()
    expect(oscilador.frequency.value).toBe(1000)
    expect(start).toHaveBeenCalledWith(2)
    expect(stop.mock.calls[0][0]).toBeCloseTo(2.08)
  })
})
