import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModuloFiado } from './ModuloFiado'

function armar(activo: boolean, cambiar = vi.fn(async (a: boolean) => a)) {
  const alCambiar = vi.fn()
  const user = userEvent.setup()
  render(<ModuloFiado activo={activo} servicio={{ cambiarModuloFiado: cambiar }} alCambiar={alCambiar} />)
  return { cambiar, alCambiar, user }
}

describe('ModuloFiado', () => {
  it('muestra el estado y explica qué pasa con el fiado apagado', () => {
    armar(true)
    expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
    expect(screen.getByText(/la base rechaza los pagos fiados y las altas de clientes/)).toBeInTheDocument()
  })

  it('el interruptor apaga el módulo en la base y avisa el nuevo estado', async () => {
    const { cambiar, alCambiar, user } = armar(true)
    await user.click(screen.getByRole('checkbox', { name: 'Fiado activo' }))
    expect(cambiar).toHaveBeenCalledWith(false)
    expect(alCambiar).toHaveBeenCalledWith(false)
  })

  it('si la base rechaza, el estado no cambia y se avisa', async () => {
    const cambiar = vi.fn(async (_a: boolean): Promise<boolean> => {
      throw { message: 'solo_jefe' }
    })
    const { alCambiar, user } = armar(true, cambiar)
    await user.click(screen.getByRole('checkbox', { name: 'Fiado activo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sólo el jefe puede hacer esto.')
    expect(alCambiar).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
  })
})
