/** Minúsculas, sin tildes (la ñ queda como n), espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras alfanuméricas normalizadas: es lo que guarda el índice multiEntry de la caché. */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0)
}
