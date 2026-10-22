import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PedirApertura, ResumenCierre } from './PantallaTurno'
import type { CierreTurno } from './turno'

const CIERRE: CierreTurno = {
  turnoId: 't1',
  apertura: '2026-10-19T11:00:00Z',
  cierre: '2026-10-19T20:00:00Z',
  totales: { efectivo: 900, transferencia: 700, tarjeta: 500, fiado: 300, cobrado: 2100 },
}

const sinUltimo = async () => null

function totalesALaVista() {
  expect(within(screen.getByRole('row', { name: /^Efectivo/ })).getByText('$900')).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /^Transferencia/ })).getByText('$700')).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /^Tarjeta/ })).getByText('$500')).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /^Total cobrado/ })).getByText('$2.100')).toBeInTheDocument()
  expect(within(screen.getByRole('row', { name: /^Fiado/ })).getByText('$300')).toBeInTheDocument()
}

describe('PedirApertura', () => {
  it('no pide monto inicial', () => {
    render(<PedirApertura alAbrir={vi.fn(async () => undefined)} leerUltimoCerrado={sinUltimo} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('doble clic abre una sola vez', async () => {
    const alAbrir = vi.fn(() => new Promise<void>(() => undefined))
    render(<PedirApertura alAbrir={alAbrir} leerUltimoCerrado={sinUltimo} />)
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(alAbrir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Abriendo…' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('si falla avisa y deja reintentar', async () => {
    const alAbrir = vi.fn(async () => {
      throw new Error('sin red')
    })
    render(<PedirApertura alAbrir={alAbrir} leerUltimoCerrado={sinUltimo} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el turno')
    expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()
  })

  it('si la base rechaza la PC manda a avisar al dueño', async () => {
    const alAbrir = vi.fn(async () => {
      throw Object.assign(new Error('dispositivo_desconocido'), { code: 'P0001' })
    })
    render(<PedirApertura alAbrir={alAbrir} leerUltimoCerrado={sinUltimo} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Avisá al dueño')
    expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()
  })

  it('muestra el último turno cerrado con su horario y el total por medio de pago', async () => {
    render(<PedirApertura alAbrir={vi.fn(async () => undefined)} leerUltimoCerrado={async () => CIERRE} />)
    expect(await screen.findByRole('heading', { name: 'Último turno cerrado' })).toBeInTheDocument()
    // 11:00 y 20:00 UTC: 8:00 y 17:00 en Buenos Aires.
    expect(screen.getByText(/–/)).toHaveTextContent(/19\/10\/26.*\b8:00.*–.*19\/10\/26.*\b(17|5):00/)
    totalesALaVista()
  })

  it('sin turnos cerrados en la PC no muestra el bloque', async () => {
    const leer = vi.fn(sinUltimo)
    render(<PedirApertura alAbrir={vi.fn(async () => undefined)} leerUltimoCerrado={leer} />)
    await waitFor(() => expect(leer).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Último turno cerrado' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('si no se puede leer el último turno cerrado, lo oculta y abrir el turno sigue andando', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const alAbrir = vi.fn(async () => undefined)
    render(
      <PedirApertura
        alAbrir={alAbrir}
        leerUltimoCerrado={async () => {
          throw new Error('sin red')
        }}
      />,
    )
    await waitFor(() => expect(aviso).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('heading', { name: 'Último turno cerrado' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(alAbrir).toHaveBeenCalledTimes(1)
    aviso.mockRestore()
  })
})

describe('ResumenCierre', () => {
  it('muestra el total por medio de pago y el fiado aparte', () => {
    render(<ResumenCierre cierre={CIERRE} alSeguir={vi.fn()} />)
    totalesALaVista()
  })
})
