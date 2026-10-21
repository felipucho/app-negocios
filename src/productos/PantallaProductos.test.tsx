import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import type { Producto } from '../tipos'
import { PantallaProductos } from './PantallaProductos'

const PRODUCTOS = [
  productoDePrueba({ id: 'p1', nombre: 'Alfajor triple', precio: 900, codigo_barras: '7790001' }),
  productoDePrueba({ id: 'p2', nombre: 'Agua mineral', precio: 1200, codigo_barras: 'ABC-55', creado_en_caja: true }),
  productoDePrueba({ id: 'p3', nombre: 'Chipá', precio: 800 }),
  productoDePrueba({ id: 'p4', nombre: 'Turrón viejo', precio: 400, codigo_barras: '7790008', activo: false }),
]

function armar() {
  const servicio = servicioProductosFalso(PRODUCTOS)
  const user = userEvent.setup()
  render(<PantallaProductos servicio={servicio} />)
  return { servicio, user }
}

const filasDeDatos = () => within(screen.getByRole('table', { name: 'Productos' })).getAllByRole('row').slice(1)

describe('PantallaProductos', () => {
  it('lista todo, marca "creado en caja" y desactivados, y busca por nombre sin tildes', async () => {
    const { user } = armar()
    expect(await screen.findByRole('row', { name: /Agua mineral.*creado en caja/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Turrón viejo.*Desactivado/ })).toBeInTheDocument()
    expect(filasDeDatos()).toHaveLength(4)
    await user.type(screen.getByLabelText('Buscar producto'), 'chipa')
    expect(filasDeDatos()).toHaveLength(1)
    expect(filasDeDatos()[0]).toHaveTextContent('Chipá')
  })

  it('edita el precio y muestra el nuevo', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Alfajor triple' }))
    const precio = screen.getByLabelText('Precio')
    await user.clear(precio)
    await user.type(precio, '1.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p1', { precio: 1000 })
    expect(await screen.findByRole('row', { name: /Alfajor triple.*\$1\.000/ })).toBeInTheDocument()
  })

  it('un guardado que llega tarde no cierra el editor de otro producto', async () => {
    const { servicio, user } = armar()
    let terminar: (p: Producto) => void = () => undefined
    servicio.editar.mockImplementationOnce(() => new Promise<Producto>((r) => (terminar = r)))
    await user.click(await screen.findByRole('button', { name: 'Editar Alfajor triple' }))
    await user.clear(screen.getByLabelText('Precio'))
    await user.type(screen.getByLabelText('Precio'), '1000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.click(screen.getByRole('button', { name: 'Editar Chipá' }))
    await user.clear(screen.getByLabelText('Precio'))
    await user.type(screen.getByLabelText('Precio'), '850')
    await act(async () => terminar({ ...PRODUCTOS[0], precio: 1000 }))
    expect(screen.getByRole('form', { name: 'Editar Chipá' })).toBeInTheDocument()
    expect(screen.getByLabelText('Precio')).toHaveValue('850')
    expect(screen.getByRole('row', { name: /Alfajor triple.*\$1\.000/ })).toBeInTheDocument()
  })

  it('reactiva un producto desactivado con la casilla Activo', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Turrón viejo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Activo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p4', { activo: true })
    expect(await screen.findByRole('row', { name: /Turrón viejo.*Activo/ })).toBeInTheDocument()
  })

  it('da de alta un producto sin código (va a la grilla F2) y uno con código', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Agregar producto' }))
    let alta = screen.getByRole('form', { name: 'Nuevo producto' })
    await user.type(within(alta).getByLabelText('Nombre'), 'Pan casero')
    await user.type(within(alta).getByLabelText('Precio'), '800')
    await user.click(within(alta).getByRole('button', { name: 'Guardar producto' }))
    expect(servicio.alta).toHaveBeenCalledWith(null, 'Pan casero', 800)
    expect(await screen.findByRole('row', { name: /Pan casero.*creado en caja.*Sin código/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
    alta = screen.getByRole('form', { name: 'Nuevo producto' })
    await user.type(within(alta).getByLabelText('Nombre'), 'Turrón')
    await user.type(within(alta).getByLabelText('Precio'), '450')
    await user.type(within(alta).getByLabelText('Código de barras (opcional)'), ' 7790099 ')
    await user.click(within(alta).getByRole('button', { name: 'Guardar producto' }))
    expect(servicio.alta).toHaveBeenLastCalledWith('7790099', 'Turrón', 450)
  })

  it('el código de barras se muestra pero no se edita', async () => {
    const { user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Agua mineral' }))
    const editor = screen.getByRole('form', { name: 'Editar Agua mineral' })
    expect(within(editor).getByText(/ABC-55/)).toBeInTheDocument()
    expect(within(editor).getAllByRole('textbox')).toHaveLength(2)
    expect(within(editor).queryByLabelText(/Código/)).toBeNull()
  })

  it('un precio con centavos no llama a la base', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Chipá' }))
    const precio = screen.getByLabelText('Precio')
    await user.clear(precio)
    await user.type(precio, '10,5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('pesos enteros, mayor que cero')
    expect(servicio.editar).not.toHaveBeenCalled()
  })
})
