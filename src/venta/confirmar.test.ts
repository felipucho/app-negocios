import { describe, expect, it, vi } from 'vitest'
import { argumentosConfirmar, claveContenido, confirmarVenta, formatearNumeroVenta, type LlamarRpc, type PedidoVenta } from './confirmar'

const pedido: PedidoVenta = {
  dispositivoId: 'pc-1',
  lineas: [{ productoId: 'p1', nombre: 'Alfajor', precio: 900, cantidad: 2 }],
  pagos: [{ medio: 'efectivo', importe: 1800, cliente_id: null }],
  total: 1800,
  efectivoEntregado: 2000,
}

const responde = (r: Awaited<ReturnType<LlamarRpc>>): LlamarRpc => vi.fn(async () => r)

describe('argumentosConfirmar y claveContenido', () => {
  it('manda el precio visto por línea y los importes enteros', () => {
    expect(argumentosConfirmar('v1', pedido)).toEqual({
      p_venta_id: 'v1',
      p_dispositivo_id: 'pc-1',
      p_lineas: [{ producto_id: 'p1', cantidad: 2, precio_visto: 900 }],
      p_pagos: [{ medio: 'efectivo', importe: 1800, cliente_id: null }],
      p_total: 1800,
      p_efectivo_entregado: 2000,
    })
  })

  it('una línea Varios va sin producto_id, con su precio, cantidad y descripción', () => {
    const conVarios: PedidoVenta = { ...pedido, lineas: [{ varios: true, lineaId: 'v1', nombre: 'Recarga', precio: 500, cantidad: 3 }] }
    expect(argumentosConfirmar('v1', conVarios).p_lineas).toEqual([{ varios: true, precio: 500, cantidad: 3, descripcion: 'Recarga' }])
  })

  it('la clave cambia si cambia el contenido', () => {
    expect(claveContenido(pedido)).toBe(claveContenido({ ...pedido }))
    expect(claveContenido(pedido)).not.toBe(
      claveContenido({ ...pedido, pagos: [{ medio: 'efectivo', importe: 800, cliente_id: null }, { medio: 'tarjeta', importe: 1000, cliente_id: null }] }),
    )
  })

  it('la entrega en efectivo no es parte de la clave (no se guarda)', () => {
    expect(claveContenido({ ...pedido, efectivoEntregado: 5000 })).toBe(claveContenido(pedido))
    expect(claveContenido({ ...pedido, efectivoEntregado: null })).toBe(claveContenido(pedido))
  })
})

describe('confirmarVenta', () => {
  it('devuelve la venta confirmada', async () => {
    const rpc = responde({
      data: { estado: 'confirmada', venta_id: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 200, ya_existia: false, anulada: false },
      error: null,
    })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({
      tipo: 'confirmada',
      venta: { ventaId: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 200, yaExistia: false, anulada: false },
    })
    expect(rpc).toHaveBeenCalledWith('confirmar_venta', argumentosConfirmar('v1', pedido))
  })

  it('reintento de una venta anulada: la marca llega a la pantalla', async () => {
    const rpc = responde({
      data: { estado: 'confirmada', venta_id: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 0, ya_existia: true, anulada: true },
      error: null,
    })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({
      tipo: 'confirmada',
      venta: { ventaId: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 0, yaExistia: true, anulada: true },
    })
  })

  it('devuelve las diferencias de precio', async () => {
    const rpc = responde({
      data: { estado: 'precios_distintos', diferencias: [{ producto_id: 'p1', nombre: 'Alfajor', precio_visto: 900, precio_actual: 1000 }] },
      error: null,
    })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({
      tipo: 'precios_distintos',
      diferencias: [{ productoId: 'p1', nombre: 'Alfajor', precioVisto: 900, precioActual: 1000 }],
    })
  })

  it('traduce el código de rechazo de la base', async () => {
    const rpc = responde({ data: null, error: { message: 'sin_turno', code: 'P0001', details: null } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'rechazada', codigo: 'sin_turno', detalle: null })
  })

  it('sin código de error es falla de red (V5): se reintenta con el mismo id', async () => {
    const rpc = responde({ data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: '' } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'error_red' })
    const rota: LlamarRpc = vi.fn(async () => {
      throw new Error('sin red')
    })
    expect(await confirmarVenta(rota, 'v1', pedido)).toEqual({ tipo: 'error_red' })
  })

  it('un JWT vencido o inválido (PostgREST lo rechaza antes de la función) pide volver a entrar', async () => {
    for (const code of ['PGRST301', 'PGRST302', 'PGRST303']) {
      const rpc = responde({ data: null, error: { message: 'JWT expired', code, details: null } })
      expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'sesion_vencida' })
    }
  })

  it('un mensaje que no es un código conocido queda como desconocido', async () => {
    const rpc = responde({ data: null, error: { message: 'otra cosa', code: '42883', details: null } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'desconocido', mensaje: 'otra cosa' })
  })
})

describe('formatearNumeroVenta', () => {
  it('prefijo de la PC y seis dígitos', () => {
    expect(formatearNumeroVenta('A', 123)).toBe('A-000123')
    expect(formatearNumeroVenta('AB', 7)).toBe('AB-000007')
  })
})
