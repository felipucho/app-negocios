import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import { PantallaPrecios } from './PantallaPrecios'
import { MENSAJES_PRECIOS, type GestionProducto, type PedidoAumento, type ResultadoAumento, type ServicioPrecios } from './precios'

const PRODUCTOS = [
  productoDePrueba({ id: 'p1', nombre: 'Alfajor triple', precio: 900 }),
  productoDePrueba({ id: 'p2', nombre: 'Agua mineral', precio: 1200 }),
  productoDePrueba({ id: 'p3', nombre: 'Chipá', precio: 800 }),
  productoDePrueba({ id: 'p4', nombre: 'Turrón viejo', precio: 400, activo: false }),
]

// Agua mineral no tiene fila de gestión: todo aparece como "Sin cargar".
const GESTION: GestionProducto[] = [
  { producto_id: 'p1', costo: 500, rubro: 'Golosinas', proveedor: 'Distribuidora Sur' },
  { producto_id: 'p3', costo: 400, rubro: null, proveedor: null },
  { producto_id: 'p4', costo: 200, rubro: 'Golosinas', proveedor: null },
]

function servicioPreciosFalso(gestion: readonly GestionProducto[]) {
  return {
    leerGestion: vi.fn(async () => gestion.map((g) => ({ ...g }))),
    editarGestion: vi.fn(
      async (productoId: string, datos: Omit<GestionProducto, 'producto_id'>): Promise<GestionProducto> => ({
        producto_id: productoId,
        ...datos,
      }),
    ),
    aumentarPrecios: vi.fn(async (_pedido: PedidoAumento): Promise<ResultadoAumento> => ({ cantidad: 2, ya_existia: false })),
  } satisfies ServicioPrecios
}

function armar() {
  const servicio = servicioPreciosFalso(GESTION)
  const productos = servicioProductosFalso(PRODUCTOS)
  const alCambiarPrecios = vi.fn()
  const user = userEvent.setup()
  render(<PantallaPrecios servicio={servicio} productos={productos} alCambiarPrecios={alCambiarPrecios} />)
  return { servicio, productos, alCambiarPrecios, user }
}

describe('PantallaPrecios', () => {
  it('muestra una fila por producto, con margen, "Sin cargar" y los inactivos marcados', async () => {
    armar()
    expect(
      await screen.findByRole('row', { name: /Alfajor triple.*\$500.*44 %.*Golosinas.*Distribuidora Sur/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Agua mineral.*Sin cargar.*Sin cargar.*Sin cargar/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Turrón viejo \(Desactivado\).*\$200.*50 %/ })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Precios y costos' })).getAllByRole('row')).toHaveLength(5)
  })

  it('edita costo, rubro y proveedor: manda los tres y reemplaza la fila con lo que devuelve el servicio', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Alfajor triple' }))
    const editor = screen.getByRole('form', { name: 'Costo, rubro y proveedor de Alfajor triple' })
    const costo = within(editor).getByLabelText('Costo')
    await user.clear(costo)
    await user.type(costo, '550')
    await user.click(within(editor).getByRole('button', { name: 'Guardar' }))
    expect(servicio.editarGestion).toHaveBeenCalledWith('p1', {
      costo: 550,
      rubro: 'Golosinas',
      proveedor: 'Distribuidora Sur',
    })
    expect(await screen.findByRole('row', { name: /Alfajor triple.*\$550.*39 %/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Costo, rubro y proveedor de Alfajor triple' })).toBeNull()
  })

  it.each(['-5', '10,5'])('el costo "%s" no llama al servicio', async (tipeado) => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Chipá' }))
    const editor = screen.getByRole('form', { name: 'Costo, rubro y proveedor de Chipá' })
    const costo = within(editor).getByLabelText('Costo')
    await user.clear(costo)
    await user.type(costo, tipeado)
    await user.click(within(editor).getByRole('button', { name: 'Guardar' }))
    expect(await within(editor).findByRole('alert')).toHaveTextContent(MENSAJES_PRECIOS.costo_invalido)
    expect(servicio.editarGestion).not.toHaveBeenCalled()
  })

  it('revisa el aumento, lo aplica, muestra el conteo y avisa a la caja', async () => {
    const { servicio, productos, alCambiarPrecios, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    await user.type(screen.getByLabelText('Porcentaje'), '10')
    await user.selectOptions(screen.getByLabelText('Redondeo'), '5')
    await user.type(screen.getByLabelText('Rubro (opcional)'), 'Golosinas')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    expect(
      screen.getByText(
        'Vas a subir los precios de los productos del rubro Golosinas un 10 %, redondeando hacia arriba a múltiplos de 5. ¿Aplicar?',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    expect(servicio.aumentarPrecios).toHaveBeenCalledWith(
      expect.objectContaining({ porcentaje: 10, redondeo: 5, rubro: 'Golosinas' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Se cambiaron 2 precios.')
    expect(alCambiarPrecios).toHaveBeenCalledTimes(1)
    expect(productos.listar).toHaveBeenCalledTimes(2)
  })

  it('un porcentaje negativo dice que va a bajar, y cambiar un campo oculta la confirmación', async () => {
    const { user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    await user.type(screen.getByLabelText('Porcentaje'), '-10')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    expect(
      screen.getByText(
        'Vas a bajar los precios de todos los productos un 10 %, redondeando hacia arriba a múltiplos de 1. ¿Aplicar?',
      ),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Proveedor (opcional)'), 'x')
    expect(screen.queryByRole('button', { name: 'Aplicar aumento' })).toBeNull()
  })

  it.each(['0', '-91', '1001', '1,5', '1.000'])('el porcentaje "%s" no se revisa ni llama al servicio', async (porcentaje) => {
    const { servicio, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    await user.type(screen.getByLabelText('Porcentaje'), porcentaje)
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_PRECIOS.porcentaje_invalido)
    expect(screen.queryByRole('button', { name: 'Aplicar aumento' })).toBeNull()
    expect(servicio.aumentarPrecios).not.toHaveBeenCalled()
  })

  it('un error al aplicar muestra el mensaje del servicio y no avisa a la caja', async () => {
    const { servicio, alCambiarPrecios, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    servicio.aumentarPrecios.mockRejectedValueOnce({ message: 'precio_invalido', code: 'P0001' })
    await user.type(screen.getByLabelText('Porcentaje'), '50')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(MENSAJES_PRECIOS.precio_invalido)
    expect(screen.getByRole('alert')).not.toHaveTextContent('no lo repite')
    expect(alCambiarPrecios).not.toHaveBeenCalled()
  })

  it('si la respuesta se pierde, avisa que el aumento puede haberse guardado igual', async () => {
    const { servicio, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    servicio.aumentarPrecios.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.type(screen.getByLabelText('Porcentaje'), '5')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no lo repite')
  })

  it('volver a aplicar lo mismo después de un corte reusa el id de operación', async () => {
    const { servicio, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    servicio.aumentarPrecios.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.type(screen.getByLabelText('Porcentaje'), '5')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Se cambiaron 2 precios.')
    const [primero, reintento] = servicio.aumentarPrecios.mock.calls
    expect(reintento[0].operacionId).toBe(primero[0].operacionId)
  })

  it('si la base dice que el aumento ya estaba aplicado, no lo cuenta como nuevo', async () => {
    const { servicio, user } = armar()
    await screen.findByRole('row', { name: /Agua mineral/ })
    servicio.aumentarPrecios.mockResolvedValueOnce({ cantidad: 2, ya_existia: true })
    await user.type(screen.getByLabelText('Porcentaje'), '5')
    await user.click(screen.getByRole('button', { name: 'Revisar aumento' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar aumento' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ese aumento ya estaba aplicado: no se volvió a aplicar.')
  })
})
