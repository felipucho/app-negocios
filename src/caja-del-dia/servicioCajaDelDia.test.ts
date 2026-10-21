import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { crearServicioCajaDelDia, PAGINA_VENTAS, type VentaDelDia } from './servicioCajaDelDia'

function venta(n: number): VentaDelDia {
  return { venta_id: `v${n}`, prefijo: 'A', numero: n, hora: '10:00', total: 100, medios: [], anulada: false }
}

/** Imita a PostgREST: cada pedido devuelve como mucho PAGINA_VENTAS filas (max_rows). */
function supabaseFalso(todas: VentaDelDia[]) {
  const rangos: [number, number][] = []
  const cliente = {
    rpc: () => ({
      range: async (desde: number, hasta: number) => {
        rangos.push([desde, hasta])
        return { data: todas.slice(desde, Math.min(hasta + 1, desde + PAGINA_VENTAS)), error: null }
      },
    }),
  }
  return { cliente: cliente as unknown as SupabaseClient, rangos }
}

describe('leerVentas', () => {
  it('trae todas las ventas aunque pasen el límite de filas por pedido', async () => {
    const todas = Array.from({ length: PAGINA_VENTAS + 5 }, (_, i) => venta(PAGINA_VENTAS + 5 - i))
    const { cliente, rangos } = supabaseFalso(todas)
    const ventas = await crearServicioCajaDelDia(cliente, 'pc').leerVentas('2026-10-19')
    expect(ventas).toHaveLength(PAGINA_VENTAS + 5)
    expect(ventas.at(-1)?.numero).toBe(1)
    expect(rangos).toEqual([
      [0, PAGINA_VENTAS - 1],
      [PAGINA_VENTAS, 2 * PAGINA_VENTAS - 1],
    ])
  })

  it('no repite una venta si entre páginas entró una nueva', async () => {
    const todas = Array.from({ length: PAGINA_VENTAS + 1 }, (_, i) => venta(PAGINA_VENTAS + 1 - i))
    const cliente = {
      rpc: () => ({
        range: async (desde: number) => {
          // La segunda página llega corrida una fila por una venta nueva arriba de todo.
          const fuente = desde === 0 ? todas : [venta(9999), ...todas]
          return { data: fuente.slice(desde, desde + PAGINA_VENTAS), error: null }
        },
      }),
    } as unknown as SupabaseClient
    const ventas = await crearServicioCajaDelDia(cliente, 'pc').leerVentas('2026-10-19')
    expect(new Set(ventas.map((v) => v.venta_id)).size).toBe(ventas.length)
    expect(ventas).toHaveLength(PAGINA_VENTAS + 1)
  })
})
