import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cliente } from '../tipos'
import { AnonimizarCliente } from './AnonimizarCliente'

const CLIENTES: Cliente[] = [
  { id: 'c1', nombre: 'Juan del 5to', telefono: '11 5555-1234' },
  { id: 'c2', nombre: 'Marta', telefono: null },
]

function armar(anonimizar = vi.fn(async (id: string): Promise<Cliente> => ({ id, nombre: 'Cliente suprimido', telefono: null }))) {
  const user = userEvent.setup()
  render(<AnonimizarCliente clientes={{ listarConTelefono: async () => CLIENTES }} servicio={{ anonimizarCliente: anonimizar }} />)
  return { anonimizar, user }
}

describe('AnonimizarCliente', () => {
  it('dos clientes con el mismo nombre se distinguen por el teléfono', async () => {
    const juanes: Cliente[] = [
      { id: 'j1', nombre: 'Juan', telefono: '11 5555-1234' },
      { id: 'j2', nombre: 'Juan', telefono: '11 4444-9876' },
    ]
    render(<AnonimizarCliente clientes={{ listarConTelefono: async () => juanes }} servicio={{ anonimizarCliente: vi.fn() }} />)
    expect(await screen.findByRole('option', { name: 'Juan (11 5555-1234)' })).toHaveValue('j1')
    expect(screen.getByRole('option', { name: 'Juan (11 4444-9876)' })).toHaveValue('j2')
  })

  it('pide confirmación explícita y después anonimiza', async () => {
    const { anonimizar, user } = armar()
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c1')
    const boton = screen.getByRole('button', { name: 'Anonimizar' })
    expect(boton).toBeDisabled()
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Entiendo que no se puede deshacer' }))
    await user.click(boton)
    expect(anonimizar).toHaveBeenCalledWith('c1')
    expect(await screen.findByRole('status')).toHaveTextContent('Juan del 5to quedó como "Cliente suprimido"')
    expect(screen.queryByRole('option', { name: /Juan del 5to/ })).toBeNull()
  })

  it('Cancelar no anonimiza', async () => {
    const { anonimizar, user } = armar()
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c2')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('button', { name: 'Anonimizar' })).toBeNull()
    expect(anonimizar).not.toHaveBeenCalled()
  })

  it('un rechazo de la base se muestra', async () => {
    const anonimizar = vi.fn(async (_id: string): Promise<Cliente> => {
      throw { message: 'solo_jefe' }
    })
    const { user } = armar(anonimizar)
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c1')
    await user.click(screen.getByRole('checkbox', { name: 'Entiendo que no se puede deshacer' }))
    await user.click(screen.getByRole('button', { name: 'Anonimizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sólo el jefe puede hacer esto.')
  })
})
