import type { ProductoCache } from '../tipos'
import { normalizar, palabras } from './normalizar'

export const MAX_RESULTADOS = 8
export const MIN_LETRAS = 2

type Buscable = Pick<ProductoCache, 'id' | 'nombre' | 'palabras' | 'activo'>

/** Términos normalizados, o null si hay menos de 2 letras para buscar. */
export function terminosDeBusqueda(consulta: string): string[] | null {
  const terminos = palabras(consulta)
  return terminos.join('').length >= MIN_LETRAS ? terminos : null
}

function coincide(palabrasProducto: readonly string[], terminos: readonly string[]): boolean {
  return terminos.every((t) => palabrasProducto.some((p) => p.startsWith(t)))
}

/** Orden determinista: nombre normalizado y, si empata, id. */
export function compararPorNombre(a: Pick<Buscable, 'id' | 'nombre'>, b: Pick<Buscable, 'id' | 'nombre'>): number {
  const na = normalizar(a.nombre)
  const nb = normalizar(b.nombre)
  if (na !== nb) return na < nb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function buscarPorNombre<T extends Buscable>(productos: readonly T[], consulta: string): T[] {
  const terminos = terminosDeBusqueda(consulta)
  if (!terminos) return []
  return productos
    .filter((p) => p.activo && coincide(p.palabras, terminos))
    .sort(compararPorNombre)
    .slice(0, MAX_RESULTADOS)
}
