/** Lo que hace falta para armar dist/_headers. Sale de las variables VITE_ del build. */
export interface OpcionesHeaders {
  supabaseUrl: string
  sentryDsn?: string
}

/** Origen (esquema, host y puerto) de una URL: sin usuario, ruta ni consulta. Tira error si no es http(s). */
export function origen(url: string): string {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`URL sin http(s): ${url}`)
  return u.origin
}

/** Tira error si la URL no sirve para un build de producción: tiene que ser https y no apuntar a esta PC. */
export function exigirSupabaseDeProduccion(url: string): void {
  const { protocol, hostname } = new URL(url)
  if (protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error(`VITE_SUPABASE_URL de producción tiene que ser https y no local (¿falta .env.production.local?): ${url}`)
  }
}

/**
 * Tira error si la clave no es la pública de un proyecto real: sb_publishable_ o un JWT con role anon
 * que no sea la demo local (iss supabase-demo, viene de .env.local). La service_role nunca puede llegar al bundle.
 * El mensaje nunca incluye la clave.
 */
export function exigirClaveAnonDeProduccion(clave: string | undefined): void {
  if (clave?.startsWith('sb_publishable_')) return
  const partes = clave?.split('.') ?? []
  let datos: { role?: unknown; iss?: unknown } | null = null
  try {
    if (partes.length === 3) datos = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    // No es un JWT: cae en el error de abajo.
  }
  if (datos?.role === 'anon' && datos.iss !== 'supabase-demo') return
  throw new Error(
    'VITE_SUPABASE_ANON_KEY de producción tiene que ser la clave pública del proyecto (anon o sb_publishable_), ' +
      'nunca la service_role ni la demo local (¿falta .env.production.local?)',
  )
}

/**
 * CSP: scripts y estilos sólo propios (sin 'unsafe-inline'); red sólo a la app, Supabase y Sentry;
 * imágenes propias, data: y Supabase (logos); nadie puede meter la app en un iframe.
 */
export function politicaDeContenido({ supabaseUrl, sentryDsn }: OpcionesHeaders): string {
  const supabase = origen(supabaseUrl)
  const conexiones = ["'self'", supabase, ...(sentryDsn ? [origen(sentryDsn)] : [])]
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${supabase}`,
    `connect-src ${conexiones.join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** La app no usa cámara, micrófono, ubicación, pagos del navegador ni WebUSB (el escáner es un teclado). */
export const PERMISOS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'

/** Contenido de dist/_headers: una regla para todo el sitio (Cloudflare: máximo 100 reglas, 2.000 caracteres por línea). */
export function archivoHeaders(opciones: OpcionesHeaders): string {
  return [
    '/*',
    `  Content-Security-Policy: ${politicaDeContenido(opciones)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    `  Permissions-Policy: ${PERMISOS}`,
    '  Strict-Transport-Security: max-age=31536000',
    '',
  ].join('\n')
}
