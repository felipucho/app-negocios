import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVISO_VERSION,
  AVISO_VERSION_TRABADA,
  ESPERA_RECARGA_MS,
  PARAMETRO_RECARGA,
  avisarEnPantalla,
  compararVersiones,
  esAnterior,
  leerVersionMinima,
  revisarVersion,
  vigilarVersion,
  type EntornoVersion,
} from './version'

function entorno(actual: string, minima: string | null, url = 'https://caja.ejemplo/') {
  return {
    actual,
    leerMinima: vi.fn(async () => minima),
    url: () => new URL(url),
    avisar: vi.fn((_texto: string) => undefined),
    esperar: vi.fn((_ms: number, hacer: () => void) => hacer()),
    recargar: vi.fn((_url: string) => undefined),
  } satisfies EntornoVersion
}

afterEach(() => {
  document.getElementById('aviso-version')?.remove()
})

describe('compararVersiones', () => {
  it('compara número por número: 1.10.0 es mayor que 1.9.0', () => {
    expect(compararVersiones('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compararVersiones('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compararVersiones('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(esAnterior('1.9.0', '1.10.0')).toBe(true)
  })

  it('versiones iguales dan 0 y no fuerzan recarga', () => {
    expect(compararVersiones('1.10.0', '1.10.0')).toBe(0)
    expect(esAnterior('1.10.0', '1.10.0')).toBe(false)
    expect(esAnterior('1.10.1', '1.10.0')).toBe(false)
  })

  it('una versión ilegible nunca fuerza recarga; un sufijo se ignora', () => {
    expect(compararVersiones('1.10', '1.9.0')).toBeNull()
    expect(esAnterior('1.0.0', 'nueva')).toBe(false)
    expect(compararVersiones('1.2.3-beta', '1.2.3')).toBe(0)
  })
})

describe('revisarVersion', () => {
  it('app anterior a la mínima: avisa y recarga después de la espera, con la mínima en la URL', async () => {
    const e = entorno('1.9.0', '1.10.0')
    expect(await revisarVersion(e)).toBe('recargando')
    expect(e.avisar).toHaveBeenCalledWith(AVISO_VERSION)
    expect(e.esperar).toHaveBeenCalledWith(ESPERA_RECARGA_MS, expect.any(Function))
    expect(e.recargar).toHaveBeenCalledWith(`https://caja.ejemplo/?${PARAMETRO_RECARGA}=1.10.0`)
  })

  it('app al día o más nueva: no avisa ni recarga', async () => {
    for (const actual of ['1.10.0', '1.11.0', '2.0.0']) {
      const e = entorno(actual, '1.10.0')
      expect(await revisarVersion(e)).toBe('al_dia')
      expect(e.avisar).not.toHaveBeenCalled()
      expect(e.recargar).not.toHaveBeenCalled()
    }
  })

  it('sin mínima cargada: no hace nada', async () => {
    const e = entorno('1.0.0', null)
    expect(await revisarVersion(e)).toBe('al_dia')
    expect(e.recargar).not.toHaveBeenCalled()
  })

  it('si ya recargó para esa mínima y sigue vieja, avisa sin recargar de nuevo', async () => {
    const e = entorno('1.9.0', '1.10.0', `https://caja.ejemplo/?${PARAMETRO_RECARGA}=1.10.0`)
    expect(await revisarVersion(e)).toBe('trabada')
    expect(e.avisar).toHaveBeenCalledWith(AVISO_VERSION_TRABADA)
    expect(e.recargar).not.toHaveBeenCalled()
  })
})

describe('vigilarVersion', () => {
  it('revisa al arrancar y programa una sola recarga', async () => {
    const e = entorno('1.0.0', '2.0.0')
    const cancelar = vigilarVersion(e)
    await vi.waitFor(() => expect(e.recargar).toHaveBeenCalledTimes(1))
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(e.leerMinima).toHaveBeenCalledTimes(1)
    cancelar()
  })
})

describe('avisarEnPantalla', () => {
  it('muestra un solo aviso y lo actualiza', () => {
    avisarEnPantalla('uno')
    avisarEnPantalla('dos')
    const avisos = document.querySelectorAll('#aviso-version')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toHaveTextContent('dos')
    expect(avisos[0]).toHaveAttribute('role', 'alert')
  })
})

describe('leerVersionMinima', () => {
  it('lee version_minima por rpc', async () => {
    const rpc = vi.fn(async (_funcion: string) => ({ data: '1.2.0', error: null }))
    expect(await leerVersionMinima({ rpc } as unknown as SupabaseClient)).toBe('1.2.0')
    expect(rpc).toHaveBeenCalledWith('version_minima')
  })

  it('un error se propaga (programarSincronizacion lo ignora y reintenta en la próxima vuelta)', async () => {
    const rpc = vi.fn(async (_funcion: string) => ({ data: null, error: { message: 'sin red' } }))
    await expect(leerVersionMinima({ rpc } as unknown as SupabaseClient)).rejects.toEqual({ message: 'sin red' })
  })
})
