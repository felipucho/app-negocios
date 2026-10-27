import { describe, expect, it } from 'vitest'
import { carritoReducer, carritoVacio, totalCarrito } from './carrito'

const coca = { id: 'p1', nombre: 'Coca Cola 500', precio: 1500 }
const pan = { id: 'p2', nombre: 'Pan casero', precio: 800 }
const con = (...productos: (typeof coca)[]) =>
  productos.reduce((c, producto) => carritoReducer(c, { tipo: 'agregar', producto }), carritoVacio)

describe('carritoReducer', () => {
  it('agregar un producto que ya está suma 1 a su línea', () => {
    expect(con(coca, coca).lineas).toEqual([{ productoId: 'p1', nombre: 'Coca Cola 500', precio: 1500, cantidad: 2 }])
  })

  it('+ suma y − en 1 quita la línea', () => {
    let c = carritoReducer(con(coca), { tipo: 'cambiarCantidad', productoId: 'p1', delta: 1 })
    expect(c.lineas[0].cantidad).toBe(2)
    c = carritoReducer(c, { tipo: 'cambiarCantidad', productoId: 'p1', delta: -1 })
    c = carritoReducer(c, { tipo: 'cambiarCantidad', productoId: 'p1', delta: -1 })
    expect(c.lineas).toEqual([])
  })

  it('actualizarPrecios cambia sólo los indicados', () => {
    const c = carritoReducer(con(coca, pan), { tipo: 'actualizarPrecios', precios: { p1: 1700 } })
    expect(c.lineas.map((l) => l.precio)).toEqual([1700, 800])
  })

  it('vaciar deja el carrito en blanco', () => {
    expect(carritoReducer(con(coca, pan), { tipo: 'vaciar' })).toEqual(carritoVacio)
  })

  it('el total es la suma de precio por cantidad, en enteros', () => {
    expect(totalCarrito(con(coca, pan, pan))).toBe(3100)
  })
})
