import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { crearServicioClientes, fiadoActivo } from '../../src/pagos/clientes'
import { abrirTurno, cerrarTurno, leerUltimoTurnoCerrado } from '../../src/turno/turno'
import { pagosAEnviar, type ImportesPorMedio } from '../../src/venta/cobro'
import {
  claveContenido,
  confirmarVenta,
  type LlamarRpc,
  type PedidoVenta,
  type ResultadoConfirmar,
  type VentaConfirmada,
} from '../../src/venta/confirmar'
import { crearIdVenta } from '../../src/venta/idVenta'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

interface ProductoDePrueba {
  id: string
  nombre: string
  precio: number
}

/** El mismo adaptador que arma la app (parte 2, "Para las partes siguientes"). */
const rpcDe =
  (cliente: SupabaseClient): LlamarRpc =>
  (funcion, args) =>
    cliente.rpc(funcion, args)

const SIN_PAGOS: ImportesPorMedio = { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 }

async function prepararKiosco(nombre: string, conTurno = true) {
  const kiosco = await crearKioscoDePrueba(nombre)
  const productos = await clienteAdmin()
    .from('productos')
    .insert([
      { negocio_id: kiosco.negocioId, nombre: 'Alfajor', precio: 900 },
      { negocio_id: kiosco.negocioId, nombre: 'Gaseosa', precio: 1500 },
    ])
    .select('id, nombre, precio')
  if (productos.error) throw productos.error
  const alfajor = (productos.data as ProductoDePrueba[]).find((p) => p.nombre === 'Alfajor')
  if (!alfajor) throw new Error('No se creó el alfajor de prueba')
  const dispositivoId = crypto.randomUUID()
  const alta = await kiosco.caja.cliente.rpc('registrar_dispositivo', { p_dispositivo_id: dispositivoId })
  if (alta.error) throw alta.error
  if (conTurno) await abrirTurno(kiosco.caja.cliente, dispositivoId)
  return { kiosco, dispositivoId, alfajor, rpc: rpcDe(kiosco.caja.cliente) }
}

function pedidoDe(
  dispositivoId: string,
  producto: ProductoDePrueba,
  cantidad = 1,
  importes?: ImportesPorMedio,
  clienteId: string | null = null,
): PedidoVenta {
  const total = producto.precio * cantidad
  return {
    dispositivoId,
    lineas: [{ productoId: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad }],
    pagos: pagosAEnviar(importes ?? { ...SIN_PAGOS, efectivo: total }, clienteId),
    total,
    efectivoEntregado: null,
  }
}

function venta(r: ResultadoConfirmar): VentaConfirmada {
  if (r.tipo !== 'confirmada') throw new Error(`Se esperaba una venta confirmada y llegó ${JSON.stringify(r)}`)
  return r.venta
}

async function contarVentas(negocioId: string): Promise<number> {
  const { count, error } = await clienteAdmin()
    .from('ventas')
    .select('id', { count: 'exact', head: true })
    .eq('negocio_id', negocioId)
  if (error) throw error
  return count ?? 0
}

describe('venta completa contra Supabase local', () => {
  it('confirma una venta y la numera desde 1 con el prefijo de la PC', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco venta')
    const v = venta(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor, 2)))
    expect(v).toMatchObject({ prefijo: 'A', numero: 1, total: 1800, yaExistia: false })
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('el reintento con el mismo id devuelve la misma venta, sin duplicar', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco reintento')
    const pedido = pedidoDe(dispositivoId, alfajor)
    const ids = crearIdVenta()
    const primera = venta(await confirmarVenta(rpc, ids.idPara(claveContenido(pedido)), pedido))
    const reintento = venta(await confirmarVenta(rpc, ids.idPara(claveContenido(pedido)), pedido))
    expect(reintento).toMatchObject({ ventaId: primera.ventaId, numero: primera.numero, yaExistia: true })
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('doble clic: el mismo id dos veces a la vez deja una sola venta', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco doble clic')
    const pedido = pedidoDe(dispositivoId, alfajor)
    const id = crypto.randomUUID()
    const [a, b] = await Promise.all([confirmarVenta(rpc, id, pedido), confirmarVenta(rpc, id, pedido)])
    expect(venta(a).numero).toBe(venta(b).numero)
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('dos pestañas: ids distintos a la vez no repiten números ni dejan huecos', async () => {
    const { dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco pestañas')
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))),
    )
    expect(resultados.map((r) => venta(r).numero).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('sin turno abierto la base rechaza la venta', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco sin turno', false)
    expect(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))).toMatchObject({
      tipo: 'rechazada',
      codigo: 'sin_turno',
    })
    expect(await contarVentas(kiosco.negocioId)).toBe(0)
  })

  it('precio cambiado: no graba nada y devuelve las diferencias', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco precio')
    const cambio = await clienteAdmin().from('productos').update({ precio: 1000 }).eq('id', alfajor.id)
    if (cambio.error) throw cambio.error
    expect(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))).toEqual({
      tipo: 'precios_distintos',
      diferencias: [{ productoId: alfajor.id, nombre: 'Alfajor', precioVisto: 900, precioActual: 1000 }],
    })
    expect(await contarVentas(kiosco.negocioId)).toBe(0)
  })

  it('fiado parcial con un cliente dado de alta desde la caja', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco fiado')
    expect(await fiadoActivo(kiosco.caja.cliente)).toBe(true)
    const servicio = crearServicioClientes(kiosco.caja.cliente)
    const cliente = await servicio.alta('Juan del 5to', '11 5555-1234')
    const pedido = pedidoDe(dispositivoId, alfajor, 1, { ...SIN_PAGOS, efectivo: 400, fiado: 500 }, cliente.id)
    expect(venta(await confirmarVenta(rpc, crypto.randomUUID(), pedido)).total).toBe(900)
    // Ley 25.326: el teléfono no vuelve a la caja en la lista.
    expect(await servicio.listar()).toEqual([{ id: cliente.id, nombre: 'Juan del 5to' }])
    // La base lo impone, no sólo la pantalla: ni select de la columna ni la función del jefe.
    const directo = await kiosco.caja.cliente.from('clientes').select('nombre, telefono')
    expect(directo.error?.code).toBe('42501')
    await expect(servicio.listarConTelefono()).rejects.toMatchObject({ message: 'solo_jefe' })
    // El jefe sí lo ve, para no anonimizar al Juan equivocado.
    expect(await crearServicioClientes(kiosco.jefe.cliente).listarConTelefono()).toEqual([
      { id: cliente.id, nombre: 'Juan del 5to', telefono: '11 5555-1234' },
    ])
  })

  it('dos PCs que se registran a la vez reciben prefijos distintos (V20)', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco dos PCs')
    const [a, b] = await Promise.all(
      [1, 2].map(() => kiosco.caja.cliente.rpc('registrar_dispositivo', { p_dispositivo_id: crypto.randomUUID() })),
    )
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect([a.data.prefijo, b.data.prefijo].sort()).toEqual(['A', 'B'])
  })

  it('una cuenta de otro kiosco no confirma con una PC ajena', async () => {
    const a = await prepararKiosco('Kiosco A aislado')
    const b = await crearKioscoDePrueba('Kiosco B aislado')
    expect(
      await confirmarVenta(rpcDe(b.caja.cliente), crypto.randomUUID(), pedidoDe(a.dispositivoId, a.alfajor)),
    ).toMatchObject({ tipo: 'rechazada', codigo: 'dispositivo_desconocido' })
    expect(await contarVentas(a.kiosco.negocioId)).toBe(0)
  })

  it('el último turno cerrado de la PC trae lo mismo que devolvió el cierre', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco último turno', false)
    const cliente = kiosco.caja.cliente
    expect(await leerUltimoTurnoCerrado(cliente, dispositivoId)).toBeNull()
    await abrirTurno(cliente, dispositivoId)
    const pedido = pedidoDe(dispositivoId, alfajor, 1, { ...SIN_PAGOS, efectivo: 400, tarjeta: 500 })
    venta(await confirmarVenta(rpc, crypto.randomUUID(), pedido))
    const cierre = await cerrarTurno(cliente, dispositivoId)
    expect(cierre.totales).toEqual({ efectivo: 400, transferencia: 0, tarjeta: 500, fiado: 0, cobrado: 900 })
    expect(await leerUltimoTurnoCerrado(cliente, dispositivoId)).toEqual(cierre)
    // El turno nuevo, abierto, no lo tapa.
    await abrirTurno(cliente, dispositivoId)
    expect(await leerUltimoTurnoCerrado(cliente, dispositivoId)).toEqual(cierre)
  })

  it('abrir con un turno abierto en la PC devuelve el que cerró solo, como el último turno cerrado', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco turno cerrado solo', false)
    const cliente = kiosco.caja.cliente
    const primero = await abrirTurno(cliente, dispositivoId)
    expect(primero.turnoCerrado).toBeNull()
    const pedido = pedidoDe(dispositivoId, alfajor, 1, { ...SIN_PAGOS, efectivo: 400, tarjeta: 500 })
    venta(await confirmarVenta(rpc, crypto.randomUUID(), pedido))
    const { turnoCerrado } = await abrirTurno(cliente, dispositivoId)
    expect(turnoCerrado).toMatchObject({
      turnoId: primero.turnoId,
      apertura: primero.apertura,
      totales: { efectivo: 400, transferencia: 0, tarjeta: 500, fiado: 0, cobrado: 900 },
    })
    expect(turnoCerrado).toEqual(await leerUltimoTurnoCerrado(cliente, dispositivoId))
  })
})
