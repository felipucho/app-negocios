import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Login } from './Login'
import type { ResultadoLogin } from './useSesion'

function armar(iniciar = vi.fn(async (_email: string, _password: string): Promise<ResultadoLogin> => 'ok')) {
  const user = userEvent.setup()
  render(<Login iniciar={iniciar} />)
  return { iniciar, user }
}

async function entrar(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Login', () => {
  it('manda email (sin espacios) y contraseña', async () => {
    const { iniciar, user } = armar()
    await entrar(user, '  caja@kiosco.local ', 'secreta')
    expect(iniciar).toHaveBeenCalledWith('caja@kiosco.local', 'secreta')
  })

  it('credenciales malas: mensaje genérico y contraseña vacía', async () => {
    const { user } = armar(vi.fn(async (): Promise<ResultadoLogin> => 'credenciales'))
    await entrar(user, 'nadie@kiosco.local', 'mala')
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
  })

  it('sin red o con un error inesperado: avisa que no se pudo conectar', async () => {
    const iniciar = vi.fn(async (): Promise<ResultadoLogin> => {
      throw new Error('fetch')
    })
    const { user } = armar(iniciar)
    await entrar(user, 'caja@kiosco.local', 'secreta')
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar')
  })

  it('el botón se deshabilita mientras entra', async () => {
    const iniciar = vi.fn((): Promise<ResultadoLogin> => new Promise(() => undefined))
    const { user } = armar(iniciar)
    await entrar(user, 'caja@kiosco.local', 'secreta')
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()
    expect(iniciar).toHaveBeenCalledTimes(1)
  })
})
