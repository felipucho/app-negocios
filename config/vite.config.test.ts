import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Plugin } from 'vite'
import configurar from '../vite.config'

const SUPABASE = 'https://abcd.supabase.co'

/** JWT sintético: sólo importa el payload; la firma es basura a propósito. Nunca una clave real. */
function jwt(payload: object): string {
  return ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'firma'].join('.')
}

const VARIABLES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SENTRY_DSN'] as const
const previas = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]))

afterEach(() => {
  for (const v of VARIABLES) {
    if (previas[v] === undefined) delete process.env[v]
    else process.env[v] = previas[v]
  }
})

/**
 * Corre el build de Vite en ese modo y devuelve el emitFile del plugin que escribe _headers.
 * Las variables del proceso ganan a los .env en loadEnv: el test no depende de archivos locales.
 */
function buildCon(mode: string, supabaseUrl: string, anonKey: string) {
  process.env.VITE_SUPABASE_URL = supabaseUrl
  process.env.VITE_SUPABASE_ANON_KEY = anonKey
  process.env.VITE_SENTRY_DSN = ''
  const cfg = configurar({ command: 'build', mode })
  const plugin = (cfg.plugins as Plugin[]).flat().find((p) => p.name === 'headers-cloudflare')
  const emitFile = vi.fn()
  const contexto = {
    error: (mensaje: string): never => {
      throw new Error(mensaje)
    },
    emitFile,
  }
  const generar = plugin?.generateBundle as unknown as (this: typeof contexto) => void
  generar.call(contexto)
  return emitFile
}

describe('build de producción: claves y _headers (vite.config.ts)', () => {
  it('la service_role nunca llega al bundle: el build corta', () => {
    const service = jwt({ role: 'service_role', iss: 'supabase' })
    expect(() => buildCon('production', SUPABASE, service)).toThrow(/VITE_SUPABASE_ANON_KEY/)
  })

  it('una URL de Supabase local en producción corta el build', () => {
    expect(() => buildCon('production', 'http://127.0.0.1:54321', jwt({ role: 'anon', iss: 'supabase' }))).toThrow(
      /VITE_SUPABASE_URL/,
    )
  })

  it('con la clave pública del proyecto emite _headers', () => {
    const emitFile = buildCon('production', SUPABASE, jwt({ role: 'anon', iss: 'supabase' }))
    expect(emitFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'asset', fileName: '_headers' }))
  })
})
