import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn((..._args: unknown[]) => ({})) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

describe('cliente de supabase', () => {
  beforeEach(() => {
    vi.resetModules()
    createClient.mockClear()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_sintetica')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('no toma sesiones de la URL: un enlace con #access_token no inicia sesión', async () => {
    await import('./supabase')
    expect(createClient).toHaveBeenCalledWith(
      'https://proyecto.supabase.co',
      'sb_publishable_sintetica',
      expect.objectContaining({ auth: expect.objectContaining({ detectSessionInUrl: false }) }),
    )
  })
})
