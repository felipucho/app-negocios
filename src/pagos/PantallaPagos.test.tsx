import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AVISO_ESCANEO_EN_COBRO, type SesionCobro } from '../caja/PantallaCaja'
import { escanear, relojDePrueba, tipear } from '../test/caja'
import type { LineaCarrito } from '../tipos'
import type { RespuestaRpc } from '../venta/confirmar'
import { crearIdVenta } from '../venta/idVenta'
import type { ClienteCaja, ServicioClientes } from './clientes'
import { PantallaPagos } from './PantallaPagos'

const LINEAS: LineaCarrito[] = [{ productoId: 'p1', nombre: 'Alfajor triple', precio: 900, cantidad: 2 }]
const JUAN: ClienteCaja = { id: 'cli-1', nombre: 'Juan del 5to' }

function sesionDePrueba(): SesionCobro {
  let n = 0
  return {
    lineas: LINEAS,
    total: 1800,
    ids: crearIdVenta(() => `id-${++n}`),
    volver: vi.fn(),
    nuevaVenta: vi.fn(),
    actualizarPrecios: vi.fn(),
    perderTurno: vi.fn(),
    avisar: vi.fn(),
  }
}

function clientesDePrueba(): ServicioClientes {
  return {
    listar: vi.fn(async () => [JUAN]),
    listarConTelefono: vi.fn(async () => []),
    alta: vi.fn(async (nombre: string, telefono: string | null) => ({ id: 'cli-2', nombre, telefono })),
  }
}

const confirmada = (numero: number): RespuestaRpc => ({
  data: { estado: 'confirmada', venta_id: 'v', prefijo: 'A', numero, total: 1800, fecha: '2026-10-19T15:30:00Z', vuelto: 200, ya_existia: false },
  error: null,
})
const errorDeRed: RespuestaRpc = { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: '' } }

/** RPC falso que responde en orden; la última respuesta se repite. */
function rpcCon(...respuestas: RespuestaRpc[]) {
  const cola = [...respuestas]
  return vi.fn(async (_funcion: string, _args: Record<string, unknown>): Promise<RespuestaRpc> =>
    cola.length > 1 ? (cola.shift() as RespuestaRpc) : cola[0],
  )
}

function armar(opciones: { rpc?: ReturnType<typeof rpcCon>; fiado?: boolean } = {}) {
  const sesion = sesionDePrueba()
  const clientes = clientesDePrueba()
  const rpc = opciones.rpc ?? rpcCon(confirmada(123))
  const reloj = relojDePrueba()
  const user = userEvent.setup()
  const { rerender } = render(
    <PantallaPagos
      sesion={sesion}
      dispositivoId="pc-1"
      fiadoHabilitado={opciones.fiado ?? true}
      clientes={clientes}
      rpc={rpc}
      ahora={reloj.ahora}
    />,
  )
  return { sesion, clientes, rpc, reloj, user, rerender }
}

const botonConfirmar = () => screen.getByRole('button', { name: 'Confirmar' })

describe('PantallaPagos', () => {
  it('propone el total en efectivo y calcula el vuelto exacto', async () => {
    const { user, reloj } = armar()
    expect(screen.getByLabelText('Efectivo')).toHaveValue('1800')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '2000')
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto: $200')
    expect(botonConfirmar()).toBeEnabled()
  })

  it('pagos combinados: un medio vacío propone el saldo restante', async () => {
    const { user, reloj } = armar()
    const efectivo = screen.getByLabelText('Efectivo')
    const tarjeta = screen.getByLabelText('Tarjeta')
    await user.clear(efectivo)
    await user.click(tarjeta)
    expect(tarjeta).toHaveValue('1800')
    await user.clear(tarjeta)
    await tipear(user, reloj, '1000')
    expect(screen.getByText('Faltan $800.')).toBeInTheDocument()
    await user.click(efectivo)
    expect(efectivo).toHaveValue('800')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '1000')
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto: $200')
    expect(botonConfirmar()).toBeEnabled()
  })

  it('sin el módulo fiado no aparece el medio fiado', () => {
    armar({ fiado: false })
    expect(screen.queryByLabelText('Fiado')).toBeNull()
    expect(screen.getByLabelText('Tarjeta')).toBeInTheDocument()
  })

  it('el fiado exige elegir un cliente; el alta rápida lo deja elegido', async () => {
    const { user, reloj, clientes } = armar()
    await user.clear(screen.getByLabelText('Efectivo'))
    await user.click(screen.getByLabelText('Fiado'))
    expect(screen.getByLabelText('Fiado')).toHaveValue('1800')
    expect(botonConfirmar()).toBeDisabled()
    await user.click(await screen.findByRole('button', { name: 'Juan del 5to' }))
    expect(screen.getByText('Juan del 5to')).toBeInTheDocument()
    expect(botonConfirmar()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.click(screen.getByLabelText('Nombre o alias'))
    await tipear(user, reloj, 'Marta')
    await user.click(screen.getByRole('button', { name: 'Agregar cliente' }))
    expect(clientes.alta).toHaveBeenCalledWith('Marta', null)
    expect(await screen.findByText('Marta')).toBeInTheDocument()
    expect(botonConfirmar()).toBeEnabled()
  })

  it('elegir el cliente deja el foco en el cobro: un escaneo después avisa', async () => {
    const { user, reloj, sesion } = armar()
    await user.clear(screen.getByLabelText('Efectivo'))
    await user.click(screen.getByLabelText('Fiado'))
    await user.click(await screen.findByRole('button', { name: 'Juan del 5to' }))
    expect(document.body).not.toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
  })

  it('cambiar de cliente, cancelar el alta y dar de alta también dejan el foco en el cobro', async () => {
    const { user, reloj } = armar()
    await user.clear(screen.getByLabelText('Efectivo'))
    const fiado = screen.getByLabelText('Fiado')
    await user.click(fiado)
    await user.click(await screen.findByRole('button', { name: 'Juan del 5to' }))
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    expect(fiado).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    expect(screen.getByLabelText('Nombre o alias')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(fiado).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await tipear(user, reloj, 'Marta')
    await user.click(screen.getByRole('button', { name: 'Agregar cliente' }))
    await screen.findByText('Marta')
    expect(fiado).toHaveFocus()
  })

  it('si cambia el total, vuelve a proponer los importes y vacía la entrega', async () => {
    const { user, reloj, sesion, clientes, rpc, rerender } = armar()
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '5000')
    await user.clear(screen.getByLabelText('Efectivo'))
    await tipear(user, reloj, '1000')
    await user.click(screen.getByLabelText('Tarjeta'))
    expect(screen.getByLabelText('Tarjeta')).toHaveValue('800')
    expect(screen.getByLabelText('Entrega en efectivo')).toHaveValue('5000')
    rerender(<PantallaPagos sesion={{ ...sesion, total: 2000 }} dispositivoId="pc-1" fiadoHabilitado clientes={clientes} rpc={rpc} />)
    expect(screen.getByLabelText('Efectivo')).toHaveValue('2000')
    expect(screen.getByLabelText('Tarjeta')).toHaveValue('')
    expect(screen.getByLabelText('Entrega en efectivo')).toHaveValue('')
  })

  it('doble clic: una sola llamada y el botón deshabilitado durante la confirmación', async () => {
    let soltar: (r: RespuestaRpc) => void = () => undefined
    const rpc = vi.fn(
      (_funcion: string, _args: Record<string, unknown>) =>
        new Promise<RespuestaRpc>((resolver) => {
          soltar = resolver
        }),
    )
    const sesion = sesionDePrueba()
    render(<PantallaPagos sesion={sesion} dispositivoId="pc-1" fiadoHabilitado clientes={clientesDePrueba()} rpc={rpc} />)
    // Dos clics en el mismo act: React no re-renderiza en el medio, así que el que frena es el guard.
    const boton = botonConfirmar()
    await act(async () => {
      boton.click()
      boton.click()
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirmando…' })).toBeDisabled()
    await act(async () => soltar(confirmada(123)))
    expect(await screen.findByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
  })

  it('error de red: aviso, el carrito queda igual y el reintento usa el mismo id', async () => {
    const { user, rpc, sesion } = armar({ rpc: rpcCon(errorDeRed, confirmada(7)) })
    await user.click(botonConfirmar())
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('tocá Confirmar de nuevo sin cambiar los pagos')
    expect(aviso).toHaveTextContent('Si tenés que cambiar los pagos, antes revisá las ventas de hoy')
    expect(sesion.actualizarPrecios).not.toHaveBeenCalled()
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
    await user.click(botonConfirmar())
    expect(await screen.findByRole('heading', { name: 'Venta A-000007' })).toBeInTheDocument()
    expect(rpc.mock.calls[1][1].p_venta_id).toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('si cambia el contenido después de un error, el id es nuevo', async () => {
    const { user, rpc, reloj } = armar({ rpc: rpcCon(errorDeRed, confirmada(8)) })
    await user.click(botonConfirmar())
    await screen.findByRole('alert')
    await user.clear(screen.getByLabelText('Efectivo'))
    await tipear(user, reloj, '800')
    await user.click(screen.getByLabelText('Tarjeta'))
    expect(screen.getByLabelText('Tarjeta')).toHaveValue('1000')
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000008' })
    expect(rpc.mock.calls[1][1].p_venta_id).not.toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('sin turno: la caja pierde el turno y el cobro no muestra aviso', async () => {
    const sinTurno: RespuestaRpc = { data: null, error: { message: 'sin_turno', code: 'P0001' } }
    const { user, sesion } = armar({ rpc: rpcCon(sinTurno) })
    await user.click(botonConfirmar())
    await waitFor(() => expect(sesion.perderTurno).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('venta_id_reusado: el reintento usa un id nuevo', async () => {
    const reusado: RespuestaRpc = { data: null, error: { message: 'venta_id_reusado', code: 'P0001' } }
    const { user, rpc } = armar({ rpc: rpcCon(reusado, confirmada(9)) })
    await user.click(botonConfirmar())
    await screen.findByRole('alert')
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000009' })
    expect(rpc.mock.calls[1][1].p_venta_id).not.toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('cambiar sólo la entrega después de un error no cambia el id (la entrega no se guarda)', async () => {
    const { user, rpc, reloj } = armar({ rpc: rpcCon(errorDeRed, confirmada(8)) })
    await user.click(botonConfirmar())
    await screen.findByRole('alert')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '2000')
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000008' })
    expect(rpc.mock.calls[1][1].p_efectivo_entregado).toBe(2000)
    expect(rpc.mock.calls[1][1].p_venta_id).toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('el comprobante muestra número con prefijo y vuelto hasta tocar Nueva venta', async () => {
    const { user, sesion } = armar()
    await user.click(botonConfirmar())
    expect(await screen.findByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto $200')
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Nueva venta' }))
    expect(sesion.nuevaVenta).toHaveBeenCalledTimes(1)
  })

  it('precio cambiado: muestra las diferencias y actualiza el carrito', async () => {
    const preciosDistintos: RespuestaRpc = {
      data: {
        estado: 'precios_distintos',
        diferencias: [{ producto_id: 'p1', nombre: 'Alfajor triple', precio_visto: 900, precio_actual: 1000 }],
      },
      error: null,
    }
    const { user, sesion } = armar({ rpc: rpcCon(preciosDistintos) })
    await user.click(botonConfirmar())
    expect(await screen.findByRole('list', { name: 'Precios que cambiaron' })).toHaveTextContent(
      'Alfajor triple: $900 → $1.000',
    )
    expect(sesion.actualizarPrecios).toHaveBeenCalledWith({ p1: 1000 })
  })

  it('un escaneo que cae en un importe se ignora y avisa', async () => {
    const { user, reloj, sesion } = armar()
    const entrega = screen.getByLabelText('Entrega en efectivo')
    await user.click(entrega)
    await tipear(user, reloj, '2000')
    await escanear(user, reloj, '7790001')
    expect(entrega).toHaveValue('2000')
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
  })

  it('un escaneo con el comprobante a la vista se ignora y avisa; Enter a mano inicia la venta nueva', async () => {
    const { user, reloj, sesion } = armar()
    await user.click(botonConfirmar())
    const nueva = await screen.findByRole('button', { name: 'Nueva venta' })
    expect(nueva).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
    expect(screen.getByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
    reloj.tipeo()
    await user.keyboard('{Enter}')
    expect(sesion.nuevaVenta).toHaveBeenCalledTimes(1)
  })
})
