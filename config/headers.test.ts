import { describe, expect, it } from 'vitest'
import { archivoHeaders, exigirClaveAnonDeProduccion, exigirSupabaseDeProduccion, origen, politicaDeContenido } from './headers'

const SUPABASE = 'https://abcd.supabase.co'
const DSN = 'https://clave123@o111.ingest.us.sentry.io/222'

/** JWT sintético: sólo importa el payload; la firma es basura a propósito. Nunca una clave real. */
function jwt(payload: object): string {
  return ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'firma'].join('.')
}

function directivas(csp: string): Map<string, string> {
  return new Map(
    csp.split('; ').map((directiva) => {
      const [nombre, ...valores] = directiva.split(' ')
      return [nombre, valores.join(' ')]
    }),
  )
}

describe('CSP de _headers', () => {
  it('scripts y estilos sólo propios, sin unsafe-inline ni unsafe-eval', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    const d = directivas(csp)
    expect(d.get('default-src')).toBe("'self'")
    expect(d.get('script-src')).toBe("'self'")
    expect(d.get('style-src')).toBe("'self'")
    expect(d.get('object-src')).toBe("'none'")
    expect(d.get('frame-ancestors')).toBe("'none'")
    expect(csp).not.toMatch(/unsafe-/)
  })

  it('connect-src: la app, Supabase y el origen de Sentry, sin la clave del DSN', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    expect(directivas(csp).get('connect-src')).toBe("'self' https://abcd.supabase.co https://o111.ingest.us.sentry.io")
    expect(csp).not.toContain('clave123')
  })

  it('sin DSN, connect-src queda en la app y Supabase', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE })
    expect(directivas(csp).get('connect-src')).toBe("'self' https://abcd.supabase.co")
  })

  it('img-src: imágenes propias, data: y Supabase (logos de la config visual)', () => {
    const csp = politicaDeContenido({ supabaseUrl: `${SUPABASE}/` })
    expect(directivas(csp).get('img-src')).toBe("'self' data: https://abcd.supabase.co")
  })

  it('archivo _headers: una regla para todo el sitio con los cinco headers', () => {
    const texto = archivoHeaders({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    const lineas = texto.trimEnd().split('\n')
    expect(lineas[0]).toBe('/*')
    expect(lineas.slice(1).map((l) => l.split(':')[0].trim())).toEqual([
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ])
    expect(lineas.every((l) => l.length <= 2000)).toBe(true)
    expect(texto).toContain('  X-Content-Type-Options: nosniff\n')
    expect(texto).toContain('  Referrer-Policy: strict-origin-when-cross-origin\n')
    expect(texto).toContain('  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n')
    expect(texto).toContain('  Strict-Transport-Security: max-age=31536000\n')
  })

  it('build de producción: Supabase tiene que ser https y no local', () => {
    expect(() => exigirSupabaseDeProduccion(SUPABASE)).not.toThrow()
    expect(() => exigirSupabaseDeProduccion('http://127.0.0.1:54321')).toThrow(/VITE_SUPABASE_URL/)
    expect(() => exigirSupabaseDeProduccion('http://abcd.supabase.co')).toThrow()
    expect(() => exigirSupabaseDeProduccion('https://localhost:54321')).toThrow()
    expect(() => exigirSupabaseDeProduccion('https://127.0.0.1')).toThrow()
    expect(() => exigirSupabaseDeProduccion('https://[::1]:54321')).toThrow()
    expect(() => exigirSupabaseDeProduccion('abcd.supabase.co')).toThrow()
  })

  it('build de producción: la clave tiene que ser la pública del proyecto, nunca la service_role ni la demo', () => {
    expect(() => exigirClaveAnonDeProduccion('sb_publishable_sintetica')).not.toThrow()
    expect(() => exigirClaveAnonDeProduccion(jwt({ role: 'anon', iss: 'supabase' }))).not.toThrow()
    const rechazadas = [jwt({ role: 'service_role', iss: 'supabase' }), jwt({ role: 'anon', iss: 'supabase-demo' }), 'sb_secret_sintetica', 'a.b.c', '', undefined]
    for (const clave of rechazadas) {
      expect(() => exigirClaveAnonDeProduccion(clave)).toThrow(/VITE_SUPABASE_ANON_KEY/)
    }
  })

  it('el error de la clave nunca imprime la clave', () => {
    const service = jwt({ role: 'service_role', iss: 'supabase' })
    expect.assertions(1)
    try {
      exigirClaveAnonDeProduccion(service)
    } catch (error) {
      expect((error as Error).message).not.toContain(service)
    }
  })

  it('una URL de Supabase mal escrita corta el build', () => {
    expect(() => origen('abcd.supabase.co')).toThrow()
    expect(() => archivoHeaders({ supabaseUrl: 'ftp://abcd.supabase.co' })).toThrow()
  })
})
