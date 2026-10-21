import { describe, expect, it } from 'vitest'
import { crearFuenteSupabase, PAGINA_CATALOGO } from '../../src/catalogo/fuente'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

describe('lectura paginada del catálogo', () => {
  it('trae los 1500 productos de su kiosco y ninguno de otro', async () => {
    const a = await crearKioscoDePrueba('Kiosco catálogo A')
    const b = await crearKioscoDePrueba('Kiosco catálogo B')
    const filas = Array.from({ length: 1500 }, (_, i) => ({
      negocio_id: a.negocioId,
      nombre: `Producto ${String(i + 1).padStart(4, '0')}`,
      precio: 100 + i,
    }))
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await clienteAdmin().from('productos').insert(filas.slice(i, i + 500))
      if (error) throw error
    }
    const otro = await clienteAdmin().from('productos').insert({ negocio_id: b.negocioId, nombre: 'De B', precio: 1 })
    if (otro.error) throw otro.error

    const productos = await crearFuenteSupabase(a.caja.cliente).leerProductos()
    expect(productos.length).toBeGreaterThan(PAGINA_CATALOGO)
    expect(productos).toHaveLength(1500)
    expect(new Set(productos.map((p) => p.id)).size).toBe(1500)
    expect(productos.some((p) => p.nombre === 'De B')).toBe(false)
  })

  it('catalogo_version sube con cada cambio y la caja la lee', async () => {
    const k = await crearKioscoDePrueba('Kiosco versión')
    const fuente = crearFuenteSupabase(k.caja.cliente)
    expect(await fuente.leerVersion()).toEqual({ negocioId: k.negocioId, version: 0 })
    const alta = await clienteAdmin().from('productos').insert({ negocio_id: k.negocioId, nombre: 'Chicle', precio: 200 })
    if (alta.error) throw alta.error
    expect((await fuente.leerVersion()).version).toBe(1)
  })
})
