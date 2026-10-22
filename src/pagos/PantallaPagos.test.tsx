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
  data: { estado: 'confirmada', venta_id: 'v', prefijo: 'A', numero, total: 1800, fecha: '2026-10-19T15:30:00Z', vuelto: 200, ya_existia: false, anulada: false },
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
  const alCambiarPrecios = vi.fn()
  const user = userEvent.setup()
  const { rerender } = render(
    <PantallaPagos
      sesion={sesion}
      dispositivoId="pc-1"
      fiadoHabilitado={opciones.fiado ?? true}
      clientes={clientes}
      rpc={rpc}
      ahora={reloj.ahora}
      alCambiarPrecios={alCambiarPrecios}
    />,
  )
  return { sesion, clientes, rpc, reloj, user, rerender, alCambiarPrecios }
}

const botonConfirmar = () => screen.getByRole('button', { name: 'Confirmar' })

describe('PantallaPagos', () => {
  it('propone el total en efectivo y calcula el vuelto exacto', async () => {
    const { user, reloj } = armar()
    expect(screen.getByLabelText('Efectivo')).toHaveValue('1800')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '2000')
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto: $200')
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'false')
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
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'false')
  })

  it('el saldo propuesto queda seleccionado: tipear un importe lo reemplaza', async () => {
    const { user, reloj } = armar()
    await user.clear(screen.getByLabelText('Efectivo'))
    const tarjeta = screen.getByLabelText('Tarjeta')
    await user.click(tarjeta)
    await tipear(user, reloj, '1200')
    expect(tarjeta).toHaveValue('1200')
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
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'true')
    await user.click(await screen.findByRole('button', { name: 'Juan del 5to' }))
    expect(screen.getByText('Juan del 5to')).toBeInTheDocument()
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'false')
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.click(screen.getByLabelText('Nombre o alias'))
    await tipear(user, reloj, 'Marta')
    await user.click(screen.getByRole('button', { name: 'Agregar cliente' }))
    expect(clientes.alta).toHaveBeenCalledWith('Marta', null)
    expect(await screen.findByText('Marta')).toBeInTheDocument()
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'false')
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
    expect(screen.getByRole('button', { name: 'Confirmando…' })).toHaveAttribute('aria-disabled', 'true')
    await act(async () => soltar(confirmada(123)))
    expect(await screen.findByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
  })

  it('sesión vencida: pide volver a entrar y no da la venta por hecha', async () => {
    const vencida: RespuestaRpc = { data: null, error: { message: 'JWT expired', code: 'PGRST303', details: null } }
    const { user, sesion } = armar({ rpc: rpcCon(vencida) })
    await user.click(botonConfirmar())
    expect(await screen.findByRole('alert')).toHaveTextContent('Cerrá la sesión y volvé a entrar')
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
  })

  it('error de red: aviso, el carrito queda igual y el reintento usa el mismo id', async () => {
    const { user, rpc, sesion } = armar({ rpc: rpcCon(errorDeRed, confirmada(7)) })
    await user.click(botonConfirmar())
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('tocá Confirmar de nuevo sin cambiar la venta ni los pagos')
    expect(aviso).toHaveTextContent('Si tenés que cambiar la venta o los pagos, antes revisá las ventas de hoy')
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

  it('reintento de una venta que el jefe anuló entretanto: avisa que no cuenta como cobrada y no muestra vuelto', async () => {
    const anulada: RespuestaRpc = {
      data: { estado: 'confirmada', venta_id: 'v', prefijo: 'A', numero: 7, total: 1800, fecha: '2026-10-19T15:30:00Z', vuelto: 0, ya_existia: true, anulada: true },
      error: null,
    }
    const { user } = armar({ rpc: rpcCon(errorDeRed, anulada) })
    await user.click(botonConfirmar())
    await screen.findByRole('alert')
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000007' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esta venta ya estaba grabada y después se anuló: no cuenta como cobrada. No hay vuelto para dar.',
    )
    expect(screen.queryByText(/Vuelto/)).toBeNull()
    expect(screen.queryByText('Esta venta ya estaba grabada: no se duplicó.')).toBeNull()
  })

  it('venta anulada en el reintento: "Cobrarla de nuevo" vuelve a la venta sin vaciar el carrito', async () => {
    const anulada: RespuestaRpc = {
      data: { estado: 'confirmada', venta_id: 'v', prefijo: 'A', numero: 7, total: 1800, fecha: '2026-10-19T15:30:00Z', vuelto: 0, ya_existia: true, anulada: true },
      error: null,
    }
    const { user, sesion } = armar({ rpc: rpcCon(anulada) })
    await user.click(botonConfirmar())
    await user.click(await screen.findByRole('button', { name: 'Cobrarla de nuevo' }))
    expect(sesion.volver).toHaveBeenCalledTimes(1)
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
  })

  it('una venta normal no ofrece "Cobrarla de nuevo"', async () => {
    const { user } = armar()
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000123' })
    expect(screen.queryByRole('button', { name: 'Cobrarla de nuevo' })).toBeNull()
  })

  it('si se apaga el fiado con un importe fiado cargado, avisa que ya no cuenta', async () => {
    const { user, reloj, sesion, clientes, rpc, rerender, alCambiarPrecios } = armar()
    await user.click(screen.getByLabelText('Fiado'))
    await tipear(user, reloj, '500')
    rerender(
      <PantallaPagos
        sesion={sesion}
        dispositivoId="pc-1"
        fiadoHabilitado={false}
        clientes={clientes}
        rpc={rpc}
        ahora={reloj.ahora}
        alCambiarPrecios={alCambiarPrecios}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Se apagó el fiado mientras cobrabas')
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
    const { user, sesion, alCambiarPrecios } = armar({ rpc: rpcCon(preciosDistintos) })
    await user.click(botonConfirmar())
    expect(await screen.findByRole('list', { name: 'Precios que cambiaron' })).toHaveTextContent(
      'Alfajor triple: $900 → $1.000',
    )
    expect(sesion.actualizarPrecios).toHaveBeenCalledWith({ p1: 1000 })
    // La caché del catálogo se pone al día ya: la venta siguiente no repite el rechazo.
    expect(alCambiarPrecios).toHaveBeenCalledTimes(1)
  })

  it('error de red tras tocar Confirmar: el foco vuelve al importe y un escaneo avisa en vez de reintentar', async () => {
    const { user, reloj, rpc, sesion } = armar({ rpc: rpcCon(errorDeRed) })
    const efectivo = screen.getByLabelText('Efectivo')
    // Teclado: Tab hasta Confirmar y Enter, así el botón sí toma el foco.
    botonConfirmar().focus()
    reloj.tipeo()
    await user.keyboard('{Enter}')
    await screen.findByRole('alert')
    expect(efectivo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('el clic en Confirmar (aun sin poder confirmar) no le saca el foco al importe', async () => {
    const { user, reloj, rpc, sesion } = armar()
    const efectivo = screen.getByLabelText('Efectivo')
    await user.clear(efectivo)
    expect(botonConfirmar()).toHaveAttribute('aria-disabled', 'true')
    await user.click(botonConfirmar())
    expect(rpc).not.toHaveBeenCalled()
    expect(efectivo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
  })

  it('"Volver a la venta" no hace nada mientras confirma', async () => {
    let soltar: (r: RespuestaRpc) => void = () => undefined
    const rpc = vi.fn(
      (_funcion: string, _args: Record<string, unknown>) =>
        new Promise<RespuestaRpc>((resolver) => {
          soltar = resolver
        }),
    )
    const sesion = sesionDePrueba()
    const user = userEvent.setup()
    render(<PantallaPagos sesion={sesion} dispositivoId="pc-1" fiadoHabilitado clientes={clientesDePrueba()} rpc={rpc} />)
    await user.click(botonConfirmar())
    const volver = screen.getByRole('button', { name: 'Volver a la venta' })
    expect(volver).toHaveAttribute('aria-disabled', 'true')
    await user.click(volver)
    expect(sesion.volver).not.toHaveBeenCalled()
    await act(async () => soltar(confirmada(5)))
    await screen.findByRole('heading', { name: 'Venta A-000005' })
  })

  it('si el alta del cliente falla, el foco vuelve al Nombre y no a <body>', async () => {
    const { user, reloj, clientes } = armar()
    vi.mocked(clientes.alta).mockRejectedValueOnce(new Error('nombre_invalido'))
    await user.clear(screen.getByLabelText('Efectivo'))
    await user.click(screen.getByLabelText('Fiado'))
    await user.click(await screen.findByRole('button', { name: 'Nuevo cliente' }))
    await tipear(user, reloj, 'X')
    await user.click(screen.getByRole('button', { name: 'Agregar cliente' }))
    expect(await screen.findByText(/Escribí un nombre o alias válido/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre o alias')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Agregar cliente' })).toHaveAttribute('aria-disabled', 'false')
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
