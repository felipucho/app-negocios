import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { crearServicioProductos, ErrorProducto, MENSAJES_ERROR_PRODUCTO, mensajeErrorProducto, validarProducto } from './productos'

type Respuesta = { data: unknown; error: { message: string; details?: string | null } | null }

function supabaseFalso(respuesta: Respuesta) {
  const rpc = vi.fn(async (_funcion: string, _args: Record<string, unknown>) => respuesta)
  return { cliente: { rpc } as unknown as SupabaseClient, rpc }
}

const AGUA = { id: 'p2', nombre: 'Agua', precio: 1200, codigo_barras: '7790002', activo: true, creado_en_caja: true }

describe('crearServicioProductos', () => {
  it('alta llama a alta_producto_caja con la PC, el código, el nombre y el precio, y avisa el cambio', async () => {
    const { cliente, rpc } = supabaseFalso({ data: AGUA, error: null })
    const alCambiar = vi.fn()
    const producto = await crearServicioProductos(cliente, 'pc-1', alCambiar).alta('7790002', 'Agua', 1200)
    expect(rpc).toHaveBeenCalledWith('alta_producto_caja', {
      p_dispositivo_id: 'pc-1',
      p_codigo_barras: '7790002',
      p_nombre: 'Agua',
      p_precio: 1200,
    })
    expect(producto).toEqual(AGUA)
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  it('alta sin código manda p_codigo_barras null', async () => {
    const { cliente, rpc } = supabaseFalso({ data: { ...AGUA, codigo_barras: null }, error: null })
    const producto = await crearServicioProductos(cliente, 'pc-1').alta(null, 'Agua', 1200)
    expect(rpc).toHaveBeenCalledWith('alta_producto_caja', {
      p_dispositivo_id: 'pc-1',
      p_codigo_barras: null,
      p_nombre: 'Agua',
      p_precio: 1200,
    })
    expect(producto.codigo_barras).toBeNull()
  })

  it('codigo_existente_inactivo trae el id del producto para reactivarlo', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'codigo_existente_inactivo', details: 'p9' } })
    await expect(crearServicioProductos(cliente, 'pc-1').alta('7790008', 'Turrón', 400)).rejects.toMatchObject({
      codigo: 'codigo_existente_inactivo',
      productoId: 'p9',
    })
  })

  it('editar manda null en lo que no cambia', async () => {
    const { cliente, rpc } = supabaseFalso({ data: { ...AGUA, activo: false }, error: null })
    await crearServicioProductos(cliente, 'pc-1').editar('p2', { activo: false })
    expect(rpc).toHaveBeenCalledWith('editar_producto', {
      p_producto_id: 'p2',
      p_dispositivo_id: 'pc-1',
      p_nombre: null,
      p_precio: null,
      p_activo: false,
    })
  })

  it('un error que no es de la base queda como desconocido y no avisa cambios', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const alCambiar = vi.fn()
    const promesa = crearServicioProductos(cliente, 'pc-1', alCambiar).editar('p2', { precio: 1300 })
    await expect(promesa).rejects.toBeInstanceOf(ErrorProducto)
    expect(mensajeErrorProducto(await promesa.catch((e: unknown) => e))).toBe(MENSAJES_ERROR_PRODUCTO.desconocido)
    expect(alCambiar).not.toHaveBeenCalled()
  })
})

describe('validarProducto', () => {
  it('recorta el nombre y lee el precio en pesos enteros', () => {
    expect(validarProducto('  Turrón nuevo ', '1.450')).toEqual({ nombre: 'Turrón nuevo', precio: 1450 })
  })

  it('sin nombre avisa aunque el precio también esté mal', () => {
    expect(validarProducto('   ', '0')).toEqual({ error: MENSAJES_ERROR_PRODUCTO.nombre_invalido })
  })

  it.each(['', '0', '10,5', 'abc'])('precio "%s" no es pesos enteros mayores que cero', (precio) => {
    expect(validarProducto('Turrón', precio)).toEqual({ error: MENSAJES_ERROR_PRODUCTO.precio_invalido })
  })
})
