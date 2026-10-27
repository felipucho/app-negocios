import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UMBRALES } from '../escaner/umbrales'
import { escanear, relojDePrueba } from '../test/caja'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import type { Producto } from '../tipos'
import { AltaRapidaProducto } from './AltaRapidaProducto'
import { ErrorProducto } from './productos'

function armar(servicio = servicioProductosFalso()) {
  const alListo = vi.fn()
  const alCancelar = vi.fn()
  const user = userEvent.setup()
  render(<AltaRapidaProducto codigo="7790099" servicio={servicio} alListo={alListo} alCancelar={alCancelar} />)
  return { servicio, alListo, alCancelar, user }
}

async function completar(user: ReturnType<typeof userEvent.setup>, nombre: string, precio: string) {
  if (nombre) await user.type(screen.getByLabelText('Nombre'), nombre)
  if (precio) await user.type(screen.getByLabelText('Precio'), precio)
  await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
}

describe('AltaRapidaProducto', () => {
  it('guarda nombre y precio con el código escaneado y entrega el producto creado en caja', async () => {
    const { servicio, alListo, user } = armar()
    expect(screen.getByText('7790099')).toBeInTheDocument()
    await completar(user, '  Turrón nuevo ', '1.450')
    expect(servicio.alta).toHaveBeenCalledWith('7790099', 'Turrón nuevo', 1450)
    expect(alListo).toHaveBeenCalledWith(expect.objectContaining({ codigo_barras: '7790099', creado_en_caja: true }))
  })

  it.each(['0', '10,5', 'abc'])('precio "%s": avisa y no llama a la base', async (precio) => {
    const { servicio, alListo, user } = armar()
    await completar(user, 'Turrón', precio)
    expect(await screen.findByRole('alert')).toHaveTextContent('pesos enteros, mayor que cero')
    expect(servicio.alta).not.toHaveBeenCalled()
    expect(alListo).not.toHaveBeenCalled()
  })

  it('sin nombre avisa y no llama a la base', async () => {
    const { servicio, user } = armar()
    await completar(user, '', '450')
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribí un nombre')
    expect(servicio.alta).not.toHaveBeenCalled()
  })

  it('si el código es de un producto desactivado, ofrece reactivarlo en vez de crear otro', async () => {
    const servicio = servicioProductosFalso([
      productoDePrueba({ id: 'p9', nombre: 'Turrón viejo', precio: 400, codigo_barras: '7790099', activo: false }),
    ])
    servicio.alta.mockRejectedValueOnce(new ErrorProducto('codigo_existente_inactivo', 'p9'))
    const { alListo, user } = armar(servicio)
    await completar(user, 'Turrón nuevo', '450')
    expect(await screen.findByRole('alert')).toHaveTextContent('producto desactivado')
    expect(screen.queryByRole('button', { name: 'Guardar y agregar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reactivar y agregar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p9', { nombre: 'Turrón nuevo', precio: 450, activo: true })
    expect(servicio.alta).toHaveBeenCalledTimes(1)
    expect(alListo).toHaveBeenCalledWith(expect.objectContaining({ id: 'p9', nombre: 'Turrón nuevo', precio: 450, activo: true }))
  })

  it('reactivar también valida el precio: con un precio inválido no llama a la base', async () => {
    const servicio = servicioProductosFalso([
      productoDePrueba({ id: 'p9', nombre: 'Turrón viejo', precio: 400, codigo_barras: '7790099', activo: false }),
    ])
    servicio.alta.mockRejectedValueOnce(new ErrorProducto('codigo_existente_inactivo', 'p9'))
    const { user } = armar(servicio)
    await completar(user, 'Turrón nuevo', '450')
    await screen.findByRole('button', { name: 'Reactivar y agregar' })
    await user.clear(screen.getByLabelText('Precio'))
    await user.type(screen.getByLabelText('Precio'), '0')
    await user.click(screen.getByRole('button', { name: 'Reactivar y agregar' }))
    expect(await screen.findByText(/pesos enteros, mayor que cero/)).toBeInTheDocument()
    expect(servicio.editar).not.toHaveBeenCalled()
  })

  it('mientras guarda, otro clic no vuelve a llamar', async () => {
    const servicio = servicioProductosFalso()
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>(() => undefined))
    const { user } = armar(servicio)
    await completar(user, 'Turrón', '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(servicio.alta).toHaveBeenCalledTimes(1)
  })

  it('un escaneo con espacio y el foco en Guardar y agregar no guarda el producto', async () => {
    const servicio = servicioProductosFalso()
    const reloj = relojDePrueba()
    const alEscanear = vi.fn()
    const user = userEvent.setup()
    render(
      <AltaRapidaProducto
        codigo="7790099"
        servicio={servicio}
        alListo={vi.fn()}
        alCancelar={vi.fn()}
        escaner={{ umbrales: UMBRALES, ahora: reloj.ahora, alEscanear }}
      />,
    )
    await user.type(screen.getByLabelText('Nombre'), 'Turrón')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Guardar y agregar' })).toHaveFocus()
    await escanear(user, reloj, 'E2E NUEVO')
    expect(servicio.alta).not.toHaveBeenCalled()
    expect(alEscanear).toHaveBeenCalledWith('E2E NUEVO', expect.any(Number))
  })

  it('Cancelar no guarda nada', async () => {
    const { servicio, alCancelar, user } = armar()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(alCancelar).toHaveBeenCalledTimes(1)
    expect(servicio.alta).not.toHaveBeenCalled()
  })
})
