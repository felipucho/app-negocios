// Piezas que comparten las funciones de operador: cabeceras, códigos de error y validación de claves.

export const CABECERAS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'content-type': 'application/json',
  // La respuesta trae claves en claro: que ningún caché la guarde.
  'cache-control': 'no-store',
}

export const SIN_SESION = { auth: { persistSession: false, autoRefreshToken: false } }

export function responder(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS })
}

// Sólo códigos de la base o de las funciones de operador (minúsculas y guiones bajos): el resto no sale al cliente.
export function codigo(e: unknown, porDefecto = 'alta_fallida'): string {
  const mensaje = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  return /^[a-z_]+$/.test(mensaje) ? mensaje : porDefecto
}

// Un texto opcional: lo que no es texto cuenta como vacío y la base decide si sirve.
export function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

// Sin trim: es la clave exacta que va a escribir el dueño. Vacía = se genera una.
export function claveElegida(valor: unknown): string {
  return typeof valor === 'string' ? valor : ''
}

// Espacios en los bordes se rechazan (no se cortan: el dueño no los tipea). bcrypt sólo mira 72 bytes:
// más largo se rechaza en vez de truncarse en silencio.
export function claveValida(clave: string): boolean {
  return clave.length >= 8 && clave === clave.trim() && new TextEncoder().encode(clave).length <= 72
}

export function claveNueva(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
