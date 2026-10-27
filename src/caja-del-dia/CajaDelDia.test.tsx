import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Rol } from '../tipos'
import { CajaDelDia } from './CajaDelDia'
import type { AnulacionHecha, CajaDia, VentaDelDia } from './servicioCajaDelDia'

const CAJA: CajaDia = {
  fecha: '2026-10-19',
  efectivo: 5000,
  transferencia: 1500,
  tarjeta: 2000,
  cobrado: 8500,
  fiado: 700,
  anulaciones: {
    cantidad: 1,
    total: 900,
    detalle: [
      { venta_id: 'v9', prefijo: 'A', numero: 9, fecha_venta: '2026-10-18T15:00:00Z', fecha: '2026-10-19T13:00:00Z', total: 900, motivo: 'Se cobró dos veces' },
    ],
  },
}

const VENTAS: VentaDelDia[] = [
  { venta_id: 'v1', prefijo: 'A', numero: 12, hora: '10:15', total: 1500, medios: [{ medio: 'efectivo', importe: 800 }, { medio: 'fiado', importe: 700 }], anulada: false },
  { venta_id: 'v2', prefijo: 'A', numero: 11, hora: '09:40', total: 900, medios: [{ medio: 'tarjeta', importe: 900 }], anulada: true },
]

function servicioFalso() {
  return {
    hoy: vi.fn(async () => '2026-10-19'),
    leerCaja: vi.fn(async (_fecha: string): Promise<CajaDia> => CAJA),
    leerVentas: vi.fn(async (_fecha: string): Promise<VentaDelDia[]> => VENTAS),
    anular: vi.fn(async (ventaId: string, motivo: string): Promise<AnulacionHecha> => ({
      anulacion_id: 'an1',
      venta_id: ventaId,
      fecha: '2026-10-19T16:00:00Z',
      motivo,
      ya_existia: false,
    })),
  }
}

function armar(rol: Rol, servicio = servicioFalso()) {
  const user = userEvent.setup()
  render(<CajaDelDia rol={rol} servicio={servicio} />)
  return { servicio, user }
}

describe('CajaDelDia', () => {
  it('la caja ve sólo hoy: sin selector de fecha, con el día que dice la base', async () => {
    const { servicio } = armar('caja')
    await screen.findByRole('table', { name: 'Cobrado' })
    expect(screen.queryByLabelText('Fecha')).toBeNull()
    expect(servicio.leerCaja).toHaveBeenCalledWith('2026-10-19')
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenCalledWith('2026-10-19'))
  })

  it('muestra el fiado y las anulaciones aparte del total cobrado', async () => {
    armar('caja')
    const cobrado = await screen.findByRole('table', { name: 'Cobrado' })
    expect(within(cobrado).getByRole('row', { name: /Total cobrado/ })).toHaveTextContent('$8.500')
    expect(within(cobrado).queryByText(/Fiado/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Fiado' })).toHaveTextContent('$700')
    const anulaciones = screen.getByRole('region', { name: 'Anulaciones' })
    expect(anulaciones).toHaveTextContent('A-000009')
    expect(anulaciones).toHaveTextContent('Se cobró dos veces')
  })

  it('el jefe elige la fecha', async () => {
    const { servicio } = armar('jefe')
    const fecha = await screen.findByLabelText('Fecha')
    await waitFor(() => expect(fecha).toHaveValue('2026-10-19'))
    fireEvent.change(fecha, { target: { value: '2026-10-10' } })
    await waitFor(() => expect(servicio.leerCaja).toHaveBeenLastCalledWith('2026-10-10'))
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenLastCalledWith('2026-10-10'))
  })

  it('si el jefe elige la fecha antes de que llegue hoy(), la respuesta tardía no la pisa', async () => {
    const servicio = servicioFalso()
    let responderHoy: (hoy: string) => void = () => undefined
    servicio.hoy.mockImplementation(() => new Promise<string>((resolver) => (responderHoy = resolver)))
    armar('jefe', servicio)
    const fecha = screen.getByLabelText('Fecha')
    fireEvent.change(fecha, { target: { value: '2026-10-10' } })
    await waitFor(() => expect(servicio.leerCaja).toHaveBeenCalledWith('2026-10-10'))
    await act(async () => responderHoy('2026-10-19'))
    expect(fecha).toHaveValue('2026-10-10')
    expect(servicio.leerCaja).not.toHaveBeenCalledWith('2026-10-19')
  })

  it('anular pide motivo; con motivo anula y recarga los totales', async () => {
    const { servicio, user } = armar('caja')
    await user.click(await screen.findByRole('button', { name: 'Anular A-000012' }))
    await user.type(screen.getByLabelText('Motivo'), 'no')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('de 3 a 200 letras')
    expect(servicio.anular).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Motivo'))
    await user.type(screen.getByLabelText('Motivo'), 'El cliente se arrepintió')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(servicio.anular).toHaveBeenCalledWith('v1', 'El cliente se arrepintió')
    await waitFor(() => expect(servicio.leerCaja).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenCalledTimes(2))
  })

  it('sin turno abierto en la PC, la base rechaza la anulación y se pide abrirlo', async () => {
    const servicio = servicioFalso()
    servicio.anular.mockRejectedValueOnce({ message: 'sin_turno' })
    const { user } = armar('jefe', servicio)
    await user.click(await screen.findByRole('button', { name: 'Anular A-000012' }))
    await user.type(screen.getByLabelText('Motivo'), 'Devolución del cliente')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Para anular, abrí el turno en esta PC.')
    expect(screen.getByRole('form', { name: 'Anular venta' })).toBeInTheDocument()
    expect(servicio.leerCaja).toHaveBeenCalledTimes(1)
  })

  it('si la anulación falla por la red, dice que no se pudo anular (no que no se pudo leer)', async () => {
    const servicio = servicioFalso()
    servicio.anular.mockRejectedValueOnce(new Error('Failed to fetch'))
    const { user } = armar('jefe', servicio)
    await user.click(await screen.findByRole('button', { name: 'Anular A-000012' }))
    await user.type(screen.getByLabelText('Motivo'), 'Devolución del cliente')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo anular. Revisá la conexión y probá de nuevo.')
  })

  it('una venta anulada se marca y no ofrece anular', async () => {
    armar('jefe')
    const fila = await screen.findByRole('row', { name: /A-000011/ })
    expect(fila).toHaveTextContent('Anulada')
    expect(screen.queryByRole('button', { name: 'Anular A-000011' })).toBeNull()
  })

  it('si la base dice fuera_de_dia, se muestra el aviso', async () => {
    const servicio = servicioFalso()
    servicio.leerCaja.mockRejectedValueOnce({ message: 'fuera_de_dia' })
    armar('caja', servicio)
    const avisos = await screen.findAllByRole('alert')
    expect(avisos[0]).toHaveTextContent('La caja sólo ve y anula ventas de hoy.')
  })
})
