import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PedirApertura, ResumenCierre } from './PantallaTurno'

describe('PedirApertura', () => {
  it('no pide monto inicial', () => {
    render(<PedirApertura alAbrir={vi.fn(async () => undefined)} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('doble clic abre una sola vez', async () => {
    const alAbrir = vi.fn(() => new Promise<void>(() => undefined))
    render(<PedirApertura alAbrir={alAbrir} />)
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(alAbrir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Abriendo…' })).toBeDisabled()
  })

  it('si falla avisa y deja reintentar', async () => {
    const alAbrir = vi.fn(async () => {
      throw new Error('sin red')
    })
    render(<PedirApertura alAbrir={alAbrir} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el turno')
    expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()
  })

  it('si la base rechaza la PC manda a avisar al dueño', async () => {
    const alAbrir = vi.fn(async () => {
      throw Object.assign(new Error('dispositivo_desconocido'), { code: 'P0001' })
    })
    render(<PedirApertura alAbrir={alAbrir} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Avisá al dueño')
    expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()
  })
})

describe('ResumenCierre', () => {
  it('muestra el total por medio de pago y el fiado aparte', () => {
    render(
      <ResumenCierre
        cierre={{
          turnoId: 't1',
          apertura: '2026-10-19T11:00:00Z',
          cierre: '2026-10-19T20:00:00Z',
          totales: { efectivo: 900, transferencia: 700, tarjeta: 500, fiado: 300, cobrado: 2100 },
        }}
        alSeguir={vi.fn()}
      />,
    )
    expect(within(screen.getByRole('row', { name: /^Efectivo/ })).getByText('$900')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Transferencia/ })).getByText('$700')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Tarjeta/ })).getByText('$500')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Total cobrado/ })).getByText('$2.100')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Fiado/ })).getByText('$300')).toBeInTheDocument()
  })
})
