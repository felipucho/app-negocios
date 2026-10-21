import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { authFalso } from '../test/servicios'
import { resultadoLogin, useSesion } from './useSesion'

describe('resultadoLogin', () => {
  it('traduce los errores de Supabase sin revelar si el email existe', () => {
    expect(resultadoLogin(null)).toBe('ok')
    expect(resultadoLogin(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe('credenciales')
    expect(resultadoLogin(new AuthApiError('Esta cuenta no está vinculada a ningún kiosco.', 403, undefined))).toBe('sin_cuenta')
    expect(resultadoLogin(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('red')
    expect(resultadoLogin(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'))).toBe('red')
    expect(resultadoLogin(new AuthApiError('Error running hook URI', 500, 'unexpected_failure'))).toBe('red')
    expect(resultadoLogin(new Error('otra cosa'))).toBe('credenciales')
  })
})

describe('useSesion', () => {
  it('arranca con la sesión guardada', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const { result } = renderHook(() => useSesion(auth, async () => undefined))
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'abierta', sesion: { usuarioId: 'u-caja' } }))
  })

  it('cerrar sesión: primero la memoria, después la caché, después Supabase', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    let terminarBorrado = () => {}
    const borrarCache = vi.fn(() => new Promise<void>((r) => (terminarBorrado = r)))
    const { result } = renderHook(() => useSesion(auth, borrarCache))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    let cerrando: Promise<void> = Promise.resolve()
    act(() => {
      cerrando = result.current.cerrarSesion()
    })
    // Con la caché todavía borrándose, el kiosco ya está desmontado y Supabase no se tocó.
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
    expect(auth.cerrar).not.toHaveBeenCalled()
    await act(async () => {
      terminarBorrado()
      await cerrando
    })
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
    expect(borrarCache).toHaveBeenCalledTimes(1)
    expect(auth.cerrar).toHaveBeenCalledTimes(1)
    expect(borrarCache.mock.invocationCallOrder[0]).toBeLessThan(auth.cerrar.mock.invocationCallOrder[0])
  })

  it('si Supabase cierra la sesión solo (token revocado, otra pestaña), también borra la caché', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const borrarCache = vi.fn(async () => undefined)
    const { result } = renderHook(() => useSesion(auth, borrarCache))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    act(() => auth.emitir(null)) // SIGNED_OUT
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
    expect(borrarCache).toHaveBeenCalledTimes(1)
  })

  it('si borrar la caché falla, la sesión se cierra igual', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const borrarCache = vi.fn(async () => {
      throw new Error('IndexedDB bloqueada')
    })
    const { result } = renderHook(() => useSesion(auth, borrarCache))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    await act(() => result.current.cerrarSesion())
    expect(auth.cerrar).toHaveBeenCalledTimes(1)
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
  })

  it('si signOut falla sin red, una sesión que reaparece no reabre el kiosco; un login nuevo sí (V35)', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    auth.cerrar.mockRejectedValueOnce(new AuthRetryableFetchError('Failed to fetch', 0))
    const { result } = renderHook(() => useSesion(auth, async () => undefined))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    await act(() => result.current.cerrarSesion())
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
    act(() => auth.emitir({ usuarioId: 'u-caja' })) // TOKEN_REFRESHED al volver la red
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })

    auth.iniciar.mockResolvedValueOnce('credenciales')
    await act(() => result.current.iniciar('caja@kiosco.local', 'mala'))
    act(() => auth.emitir({ usuarioId: 'u-caja' }))
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })

    await act(() => result.current.iniciar('caja@kiosco.local', 'secreta'))
    expect(result.current.estado).toEqual({ tipo: 'abierta', sesion: { usuarioId: 'u-caja' } })
  })

  it('un refresco del token del mismo usuario no cambia el estado (no remonta el kiosco)', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const { result } = renderHook(() => useSesion(auth, async () => undefined))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    const antes = result.current.estado
    act(() => auth.emitir({ usuarioId: 'u-caja' }))
    expect(result.current.estado).toBe(antes)
  })
})
