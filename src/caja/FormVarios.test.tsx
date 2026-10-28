import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormVarios, validarVarios } from './FormVarios'

describe('validarVarios', () => {
  it('descripción vacía queda como Varios; precio y cantidad van enteros', () => {
    expect(validarVarios('  ', '1.500', ' 2 ')).toEqual({ nombre: 'Varios', precio: 1500, cantidad: 2 })
  })

  it('rechaza precio cero o con centavos, y cantidad cero', () => {
    expect(validarVarios('Recarga', '0', '1')).toEqual({ error: expect.stringContaining('precio') })
    expect(validarVarios('Recarga', '10,5', '1')).toEqual({ error: expect.stringContaining('precio') })
    expect(validarVarios('Recarga', '500', '0')).toEqual({ error: expect.stringContaining('cantidad') })
  })

  it('rechaza más de 40 letras y caracteres invisibles', () => {
    expect(validarVarios('a'.repeat(41), '500', '1')).toEqual({ error: expect.stringContaining('40 letras') })
    expect(validarVarios('Re​carga', '500', '1')).toEqual({ error: expect.stringContaining('40 letras') })
  })
})

describe('FormVarios', () => {
  it('agrega con la descripción, el precio y la cantidad tipeados', async () => {
    const alAgregar = vi.fn()
    const user = userEvent.setup()
    render(<FormVarios alAgregar={alAgregar} alCancelar={vi.fn()} />)
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Recarga')
    await user.type(screen.getByLabelText('Precio'), '500')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(alAgregar).toHaveBeenCalledWith({ nombre: 'Recarga', precio: 500, cantidad: 1 })
  })

  it('con precio vacío muestra el error y no agrega', async () => {
    const alAgregar = vi.fn()
    const user = userEvent.setup()
    render(<FormVarios alAgregar={alAgregar} alCancelar={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('precio')
    expect(alAgregar).not.toHaveBeenCalled()
  })

  it('Cancelar cierra sin agregar nada', async () => {
    const alCancelar = vi.fn()
    const alAgregar = vi.fn()
    const user = userEvent.setup()
    render(<FormVarios alAgregar={alAgregar} alCancelar={alCancelar} />)
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(alCancelar).toHaveBeenCalledTimes(1)
    expect(alAgregar).not.toHaveBeenCalled()
  })
})
