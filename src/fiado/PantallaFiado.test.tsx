import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CobroFiado, MedioCobroFiado, SaldoFiado } from './fiado'
import { PantallaFiado } from './PantallaFiado'

const SALDOS: SaldoFiado[] = [
  { cliente_id: 'c1', nombre: 'Juan del 5to', saldo: 1500, limite_fiado: 2000 },
  { cliente_id: 'c2', nombre: 'Marta', saldo: 300, limite_fiado: null },
]

const COBRO_HECHO: CobroFiado = { pago_id: 'p1', fecha: '2026-10-27T15:00:00Z', saldo: 0, ya_existia: false }

function servicioFalso(saldos: SaldoFiado[] = SALDOS) {
  return {
    leerSaldos: vi.fn(async (): Promise<SaldoFiado[]> => saldos),
    cobrar: vi.fn(
      async (_pagoId: string, _clienteId: string, _medio: MedioCobroFiado, _importe: number): Promise<CobroFiado> =>
        COBRO_HECHO,
    ),
    fijarLimite: vi.fn(async (_clienteId: string, limite: number | null): Promise<number | null> => limite),
  }
}

interface OpcionesArmar {
  esJefe?: boolean
  fiadoActivo?: boolean | null
  saldos?: SaldoFiado[]
}

type Usuario = ReturnType<typeof userEvent.setup>

function armar({ esJefe = false, fiadoActivo = true, saldos = SALDOS }: OpcionesArmar = {}) {
  const servicio = servicioFalso(saldos)
  const user = userEvent.setup()
  render(<PantallaFiado servicio={servicio} esJefe={esJefe} fiadoActivo={fiadoActivo} />)
  return { servicio, user }
}

/** Abre el cobro de la fila y devuelve su formulario. */
async function abrirCobro(user: Usuario, nombre: string) {
  const fila = await screen.findByRole('row', { name: new RegExp(nombre) })
  await user.click(within(fila).getByRole('button', { name: 'Cobrar' }))
  return screen.getByRole('form', { name: `Cobrar a ${nombre}` })
}

/** Abre el límite de la fila (sólo el jefe lo ve) y devuelve su formulario. */
async function abrirLimite(user: Usuario, nombre: string) {
  const fila = await screen.findByRole('row', { name: new RegExp(nombre) })
  await user.click(within(fila).getByRole('button', { name: 'Límite' }))
  return screen.getByRole('form', { name: `Límite de ${nombre}` })
}

describe('PantallaFiado', () => {
  it('lista saldos y límites, y dice "Sin límite" cuando no hay', async () => {
    armar()
    const tabla = await screen.findByRole('table', { name: 'Clientes con saldo' })
    expect(within(tabla).getByRole('row', { name: /Juan del 5to.*\$1\.500.*\$2\.000/ })).toBeInTheDocument()
    expect(within(tabla).getByRole('row', { name: /Marta.*\$300.*Sin límite/ })).toBeInTheDocument()
  })

  it('sin saldos, avisa que nadie debe nada', async () => {
    armar({ saldos: [] })
    expect(await screen.findByText('Ningún cliente debe nada.')).toBeInTheDocument()
  })

  it('con el fiado apagado avisa, pero deja cobrar lo que se debe', async () => {
    armar({ fiadoActivo: false })
    expect(
      await screen.findByText('El fiado está apagado: no se dan fiados nuevos. Igual podés cobrar lo que se debe.'),
    ).toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: 'Cobrar' })).toHaveLength(2)
  })

  it('cobra el saldo de la fila por defecto y muestra lo que queda', async () => {
    const { servicio, user } = armar()
    const form = await abrirCobro(user, 'Juan del 5to')
    expect(within(form).getByLabelText('Medio')).toHaveValue('efectivo')
    expect(within(form).getByLabelText('Importe')).toHaveValue('1500')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(servicio.cobrar).toHaveBeenCalledWith(expect.any(String), 'c1', 'efectivo', 1500)
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrado. Quedan $0.')
    expect(screen.queryByRole('form', { name: 'Cobrar a Juan del 5to' })).toBeNull()
    expect(servicio.leerSaldos).toHaveBeenCalledTimes(2)
  })

  it('un importe mayor que el saldo no llama al servicio', async () => {
    const { servicio, user } = armar()
    const form = await abrirCobro(user, 'Juan del 5to')
    await user.clear(within(form).getByLabelText('Importe'))
    await user.type(within(form).getByLabelText('Importe'), '1501')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('El importe es mayor que lo que debe.')
    expect(servicio.cobrar).not.toHaveBeenCalled()
  })

  it('un importe vacío no llama al servicio', async () => {
    const { servicio, user } = armar()
    const form = await abrirCobro(user, 'Juan del 5to')
    await user.clear(within(form).getByLabelText('Importe'))
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'El importe tiene que ser un número de pesos enteros, mayor que cero.',
    )
    expect(servicio.cobrar).not.toHaveBeenCalled()
  })

  it('un error de red no cambia el cobro: el reintento reusa el mismo pagoId', async () => {
    const { servicio, user } = armar()
    servicio.cobrar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const form = await abrirCobro(user, 'Juan del 5to')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'No se pudo guardar. Revisá la conexión y probá de nuevo.',
    )
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrado. Quedan $0.')
    const [primero, reintento] = servicio.cobrar.mock.calls
    expect(reintento[0]).toBe(primero[0])
  })

  it('cambiar el importe después de un error da un pagoId nuevo', async () => {
    const { servicio, user } = armar()
    servicio.cobrar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const form = await abrirCobro(user, 'Juan del 5to')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    await within(form).findByRole('alert')
    await user.clear(within(form).getByLabelText('Importe'))
    await user.type(within(form).getByLabelText('Importe'), '1000')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrado. Quedan $0.')
    const [primero, cambiado] = servicio.cobrar.mock.calls
    expect(cambiado).toEqual([expect.any(String), 'c1', 'efectivo', 1000])
    expect(cambiado[0]).not.toBe(primero[0])
  })

  it('cancelar y volver a cobrar lo mismo reusa el pagoId', async () => {
    const { servicio, user } = armar()
    servicio.cobrar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const form = await abrirCobro(user, 'Juan del 5to')
    await user.click(within(form).getByRole('button', { name: 'Cobrar' }))
    await within(form).findByRole('alert')
    await user.click(within(form).getByRole('button', { name: 'Cancelar' }))
    const reabierto = await abrirCobro(user, 'Juan del 5to')
    await user.click(within(reabierto).getByRole('button', { name: 'Cobrar' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrado. Quedan $0.')
    const [primero, reintento] = servicio.cobrar.mock.calls
    expect(reintento[0]).toBe(primero[0])
  })

  it('el botón Límite sólo aparece para el jefe', async () => {
    armar()
    await screen.findByRole('table', { name: 'Clientes con saldo' })
    expect(screen.queryByRole('button', { name: 'Límite' })).toBeNull()
  })

  it('con el fiado apagado el jefe no ve Límite: la base no fija límites sin fiado', async () => {
    armar({ esJefe: true, fiadoActivo: false })
    await screen.findByRole('table', { name: 'Clientes con saldo' })
    expect(screen.queryByRole('button', { name: 'Límite' })).toBeNull()
  })

  it('un límite vacío manda null y recarga la lista', async () => {
    const { servicio, user } = armar({ esJefe: true })
    const form = await abrirLimite(user, 'Juan del 5to')
    expect(within(form).getByLabelText('Límite')).toHaveValue('2000')
    await user.clear(within(form).getByLabelText('Límite'))
    await user.click(within(form).getByRole('button', { name: 'Guardar límite' }))
    expect(servicio.fijarLimite).toHaveBeenCalledWith('c1', null)
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Límite de Juan del 5to' })).toBeNull())
    expect(servicio.leerSaldos).toHaveBeenCalledTimes(2)
  })

  it('un límite que no son pesos enteros mayores que cero no llama al servicio', async () => {
    const { servicio, user } = armar({ esJefe: true })
    const form = await abrirLimite(user, 'Marta')
    await user.type(within(form).getByLabelText('Límite'), '10,5')
    await user.click(within(form).getByRole('button', { name: 'Guardar límite' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'El límite es un importe en pesos enteros, mayor que cero.',
    )
    expect(servicio.fijarLimite).not.toHaveBeenCalled()
  })

  it('abrir otro formulario cierra el que estaba abierto', async () => {
    const { user } = armar({ esJefe: true })
    await abrirCobro(user, 'Juan del 5to')
    await abrirLimite(user, 'Marta')
    expect(screen.queryByRole('form', { name: 'Cobrar a Juan del 5to' })).toBeNull()
    expect(screen.getByRole('form', { name: 'Límite de Marta' })).toBeInTheDocument()
  })
})
