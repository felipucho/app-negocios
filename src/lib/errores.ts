/** Código de error de la base o de la red ('sin_turno', 'Failed to fetch'…): e.message, o '' si no hay. */
export function codigoDeError(e: unknown): string {
  return typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
}
