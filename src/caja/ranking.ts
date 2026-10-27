import type { SupabaseClient } from '@supabase/supabase-js'
import { compararPorNombre } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'

/** Fila de ranking_sin_codigo() (tarea 11). Sin precio: el panel usa el de la caché, que es el vigente. */
export interface FilaRanking {
  producto_id: string
  nombre: string
  cantidad_ventas: number
}

/** Grilla de 4 × 5 (spec sección 6). */
export const LUGARES_PANEL = 20

/** La tarea 17 lo pasa a PantallaCaja como leerRanking. */
export async function leerRankingSinCodigo(supabase: SupabaseClient): Promise<FilaRanking[]> {
  const { data, error } = await supabase.rpc('ranking_sin_codigo')
  if (error) throw error
  return (data ?? []) as FilaRanking[]
}

/**
 * Productos del panel: activos sin código de la caché, por cantidad de ventas del ranking del turno.
 * Lo que no está en el ranking cuenta 0. Empates: orden alfabético normalizado (el mismo del buscador).
 */
export function ordenarSinCodigo(ranking: readonly FilaRanking[], productos: readonly ProductoCache[]): ProductoCache[] {
  const ventas = new Map(ranking.map((f) => [f.producto_id, f.cantidad_ventas]))
  return productos
    .filter((p) => p.activo && p.codigo_barras === null)
    .sort((a, b) => (ventas.get(b.id) ?? 0) - (ventas.get(a.id) ?? 0) || compararPorNombre(a, b))
}

/** Lo escrito con el panel abierto filtra por inicio de palabra, desde una letra. Máximo 20 lugares. */
export function filtrarPanel(productos: readonly ProductoCache[], texto: string): ProductoCache[] {
  const terminos = palabras(texto)
  const lista =
    terminos.length === 0
      ? productos
      : productos.filter((p) => terminos.every((t) => p.palabras.some((w) => w.startsWith(t))))
  return lista.slice(0, LUGARES_PANEL)
}
