import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { serviciosFalsos } from './test/servicios'

async function entrar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'caja@kiosco.local')
  await user.type(screen.getByLabelText('Contraseña'), 'secreta')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('App', () => {
  it('sin sesión muestra el login; con login correcto entra al kiosco de su cuenta', async () => {
    const servicios = serviciosFalsos()
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.leerCuenta).toHaveBeenCalledWith('u-caja')
  })

  it('un login con error muestra el mensaje genérico y no entra', async () => {
    const servicios = serviciosFalsos()
    servicios.auth.iniciar.mockResolvedValueOnce('credenciales')
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(servicios.leerCuenta).not.toHaveBeenCalled()
  })

  it('el hook rechaza a un usuario sin cuenta (plan A de la tarea 4)', async () => {
    const servicios = serviciosFalsos()
    servicios.auth.iniciar.mockResolvedValueOnce('sin_cuenta')
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no está vinculada a ningún kiosco.')
  })

  it('una sesión sin fila en cuentas no entra al kiosco (plan B de la tarea 4)', async () => {
    const servicios = serviciosFalsos({ sesion: { usuarioId: 'u-suelto' }, cuenta: null })
    render(<App servicios={servicios} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no está vinculada a ningún kiosco.')
    expect(servicios.registrarDispositivo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('cerrar sesión borra la caché, cierra Supabase y desmonta el kiosco con su venta en memoria', async () => {
    const servicios = serviciosFalsos({ sesion: { usuarioId: 'u-caja' } })
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    await user.click(await screen.findByRole('combobox', { name: 'Escanear o buscar' }))
    await user.keyboard('7790001{Enter}')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByText('Caja · PC A')).toBeNull()
    expect(servicios.borrarCache).toHaveBeenCalledTimes(1)
    expect(servicios.auth.cerrar).toHaveBeenCalledTimes(1)
    expect(servicios.borrarCache.mock.invocationCallOrder[0]).toBeLessThan(servicios.auth.cerrar.mock.invocationCallOrder[0])

    // Al volver a entrar, la venta en armado no está: vivía en el kiosco desmontado.
    await entrar(user)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('combobox', { name: 'Escanear o buscar' })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Alfajor triple/ })).toBeNull()
  })
})
