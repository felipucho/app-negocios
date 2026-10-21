import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { CacheCatalogo } from './catalogo/cache'
import { crearServicios } from './servicios'

describe('crearServicios: auth.cerrar', () => {
  it('si signOut falla (token vencido y sin red), borra igual la sesión guardada y propaga el error (V35)', async () => {
    const error = new Error('sin red')
    const signOut = vi.fn(async () => ({ error }))
    const supabase = { auth: { signOut } } as unknown as SupabaseClient
    localStorage.setItem('sesion-prueba', '{"access_token":"vencido"}')
    const servicios = crearServicios(supabase, {} as CacheCatalogo, 'sesion-prueba')

    await expect(servicios.auth.cerrar()).rejects.toBe(error)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(localStorage.getItem('sesion-prueba')).toBeNull()
  })
})
