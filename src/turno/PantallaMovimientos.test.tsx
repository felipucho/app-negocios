import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ServicioTurno } from '../caja/PantallaCaja'
import type { MovimientoCaja, MovimientoDelTurno, ServicioMovimientosCaja, TipoMovimientoCaja } from './movimientosCaja'
import { PantallaMovimientos } from './PantallaMovimientos'

const FECHA = '2026-10-19T12:00:00Z'
const ERROR_LECTURA = 'No se pudieron leer los movimientos. Revisá la conexión.'
const ERROR_RED = 'No se pudo guardar. Revisá la conexión y probá de nuevo.'

function movimiento(p: Pick<MovimientoDelTurno, 'id' | 'tipo' | 'importe'> & Partial<MovimientoDelTurno>): MovimientoDelTurno {
  return { turno_id: 't1', dispositivo_id: 'pc-1', cuenta_id: 'u-caja', fecha: FECHA, detalle: null, ...p }
}

/** Servicio en memoria: registrar devuelve la fila como la base, con los datos que llegaron. */
function servicioFalso(lista: MovimientoDelTurno[] = []) {
  return {
    fijarMontoInicial: vi.fn(async (_monto: number) => undefined),
    registrar: vi.fn(
      async (id: string, tipo: TipoMovimientoCaja, importe: number, detalle?: string): Promise<MovimientoCaja> => ({
        id,
        turno_id: 't1',
        dispositivo_id: 'pc-1',
        cuenta_id: 'u-caja',
        fecha: FECHA,
        tipo,
        importe,
        detalle: detalle ?? null,
        ya_existia: false,
      }),
    ),
    listarDelTurno: vi.fn(async (_turnoId: string) => lista),
  } satisfies ServicioMovimientosCaja
}

function turnoAbierto(): Pick<ServicioTurno, 'leer'> {
  return { leer: vi.fn(async () => ({ turnoId: 't1', apertura: FECHA })) }
}

/** Textos de las celdas de una fila: Hora, Tipo, Detalle e Importe. */
const textosDe = (fila: HTMLElement) => within(fila).getAllByRole('cell').map((celda) => celda.textContent)

const LISTA = [
  movimiento({ id: 'm1', tipo: 'ingreso', importe: 1500, detalle: 'Cambio' }),
  movimiento({ id: 'm2', tipo: 'retiro', importe: 500 }),
  movimiento({ id: 'm3', tipo: 'gasto', importe: 300, detalle: 'Bolsas' }),
  movimiento({ id: 'm4', tipo: 'pago_proveedor', importe: 2000, detalle: 'Coca' }),
]

describe('PantallaMovimientos', () => {
  it('sin turno abierto muestra el aviso y no lista movimientos', async () => {
    const servicio = servicioFalso()
    render(<PantallaMovimientos servicio={servicio} turno={{ leer: vi.fn(async () => null) }} />)
    expect(
      await screen.findByText('No hay turno abierto en esta PC. Abrilo para registrar movimientos.'),
    ).toBeInTheDocument()
    expect(servicio.listarDelTurno).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Registrar movimiento' })).toBeNull()
  })

  it('si no se puede leer el turno avisa y no deja cargar nada', async () => {
    const turno = {
      leer: vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    }
    render(<PantallaMovimientos servicio={servicioFalso()} turno={turno} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_LECTURA)
    expect(screen.queryByRole('button', { name: 'Registrar movimiento' })).toBeNull()
  })

  it('muestra los tipos en español y pone signo menos en lo que sale', async () => {
    render(<PantallaMovimientos servicio={servicioFalso(LISTA)} turno={turnoAbierto()} />)
    const tabla = await screen.findByRole('table', { name: 'Movimientos del turno' })
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas.map((fila) => textosDe(fila).slice(1))).toEqual([
      ['Ingreso', 'Cambio', '$1.500'],
      ['Retiro', '-', '-$500'],
      ['Gasto', 'Bolsas', '-$300'],
      ['Pago a proveedor', 'Coca', '-$2.000'],
    ])
  })

  it('sin movimientos en el turno lo dice', async () => {
    render(<PantallaMovimientos servicio={servicioFalso()} turno={turnoAbierto()} />)
    expect(await screen.findByText('Todavía no hay movimientos en este turno.')).toBeInTheDocument()
  })

  it('si no se puede leer la lista avisa en lugar de la tabla', async () => {
    const servicio = servicioFalso()
    servicio.listarDelTurno.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_LECTURA)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('efectivo inicial vacío no llama a fijarMontoInicial', async () => {
    const servicio = servicioFalso()
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.click(await screen.findByRole('button', { name: 'Guardar efectivo inicial' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Escribí el efectivo con el que arrancaste. Si no hubo, escribí 0.',
    )
    expect(servicio.fijarMontoInicial).not.toHaveBeenCalled()
  })

  it('fija el efectivo inicial con el monto escrito y lo confirma', async () => {
    const servicio = servicioFalso()
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.type(await screen.findByLabelText('Monto'), '1.000')
    await user.click(screen.getByRole('button', { name: 'Guardar efectivo inicial' }))
    expect(await screen.findByText('Efectivo inicial cargado.')).toBeInTheDocument()
    expect(servicio.fijarMontoInicial).toHaveBeenCalledWith(1000)
  })

  it('un importe de cero no llama a registrar', async () => {
    const servicio = servicioFalso()
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.type(await screen.findByLabelText('Importe'), '0')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El importe tiene que ser mayor que cero.')
    expect(servicio.registrar).not.toHaveBeenCalled()
  })

  it('registrar manda tipo, importe y detalle, y reusa el movimientoId tras un error de red', async () => {
    const servicio = servicioFalso()
    servicio.registrar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.selectOptions(await screen.findByLabelText('Tipo'), 'Retiro')
    await user.type(screen.getByLabelText('Importe'), '500')
    await user.type(screen.getByLabelText('Detalle (opcional)'), '  Pago al proveedor ')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_RED)
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByText('Movimiento registrado.')).toBeInTheDocument()
    const [primero, segundo] = servicio.registrar.mock.calls
    expect(primero).toEqual([expect.any(String), 'retiro', 500, 'Pago al proveedor'])
    expect(segundo).toEqual(primero)
  })

  it('si cambia el importe tras un error, el movimientoId es otro', async () => {
    const servicio = servicioFalso()
    servicio.registrar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    const importe = await screen.findByLabelText('Importe')
    await user.type(importe, '500')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    await screen.findByRole('alert')
    await user.clear(importe)
    await user.type(importe, '600')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    await waitFor(() => expect(servicio.registrar).toHaveBeenCalledTimes(2))
    const [primero, segundo] = servicio.registrar.mock.calls
    expect(segundo[0]).not.toBe(primero[0])
  })

  it('un doble clic en Registrar movimiento registra una sola vez', async () => {
    const servicio = servicioFalso()
    servicio.registrar.mockImplementationOnce(() => new Promise<MovimientoCaja>(() => undefined))
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.type(await screen.findByLabelText('Importe'), '300')
    await user.dblClick(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(servicio.registrar).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('tras registrar, vuelve a leer la lista del turno y limpia el importe', async () => {
    const servicio = servicioFalso()
    const user = userEvent.setup()
    render(<PantallaMovimientos servicio={servicio} turno={turnoAbierto()} />)
    await user.type(await screen.findByLabelText('Importe'), '1200')
    await user.click(screen.getByRole('button', { name: 'Registrar movimiento' }))
    expect(await screen.findByText('Movimiento registrado.')).toBeInTheDocument()
    expect(servicio.registrar).toHaveBeenCalledWith(expect.any(String), 'ingreso', 1200, undefined)
    expect(screen.getByLabelText('Importe')).toHaveValue('')
    await waitFor(() => expect(servicio.listarDelTurno).toHaveBeenCalledTimes(2))
  })
})
