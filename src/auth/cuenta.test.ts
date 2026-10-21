import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { leerCuenta } from './cuenta'

function supabaseFalso(respuesta: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => respuesta)
  const eq = vi.fn((_columna: string, _valor: string) => ({ maybeSingle }))
  const select = vi.fn((_columnas: string) => ({ eq }))
  const from = vi.fn((_tabla: string) => ({ select }))
  return { cliente: { from } as unknown as SupabaseClient, from, eq }
}

describe('leerCuenta', () => {
  it('lee rol y negocio propios desde cuentas', async () => {
    const { cliente, from, eq } = supabaseFalso({ data: { usuario_id: 'u1', negocio_id: 'n1', rol: 'jefe' }, error: null })
    expect(await leerCuenta(cliente, 'u1')).toEqual({ usuarioId: 'u1', negocioId: 'n1', rol: 'jefe' })
    expect(from).toHaveBeenCalledWith('cuentas')
    expect(eq).toHaveBeenCalledWith('usuario_id', 'u1')
  })

  it('sin fila en cuentas devuelve null', async () => {
    const { cliente } = supabaseFalso({ data: null, error: null })
    expect(await leerCuenta(cliente, 'u1')).toBeNull()
  })

  it('un error de la base se propaga', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'sin red' } })
    await expect(leerCuenta(cliente, 'u1')).rejects.toEqual({ message: 'sin red' })
  })
})
