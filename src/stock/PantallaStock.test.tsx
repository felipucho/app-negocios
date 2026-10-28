import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { productoDePrueba } from '../test/productos'
import type { Producto } from '../tipos'
import { PantallaStock } from './PantallaStock'
import { MENSAJES_STOCK, type Faltante, type ItemIngreso, type ServicioStock, type StockProducto } from './stock'

const PRODUCTOS: Producto[] = [
  productoDePrueba({ id: 'p1', nombre: 'Alfajor triple', precio: 900 }),
  productoDePrueba({ id: 'p2', nombre: 'Agua mineral', precio: 1200 }),
  productoDePrueba({ id: 'p3', nombre: 'Chipá', precio: 800 }),
  productoDePrueba({ id: 'p4', nombre: 'Turrón viejo', precio: 400, activo: false }),
]

const STOCK: StockProducto[] = [
  { producto_id: 'p1', cantidad: 2, minimo: 5 },
  { producto_id: 'p2', cantidad: -3, minimo: 0 },
]

const FALTANTES: Faltante[] = [
  { producto_id: 'p1', nombre: 'Alfajor triple', cantidad: 2, minimo: 5, proveedor: 'Dulcor' },
  { producto_id: 'p2', nombre: 'Agua mineral', cantidad: -3, minimo: 0, proveedor: null },
]

/** Servicio de stock en memoria: registra las llamadas y responde bien salvo que el test diga otra cosa. */
function servicioStockFalso(stock: StockProducto[], faltantes: Faltante[]) {
  return {
    leerStock: vi.fn(async () => stock),
    leerFaltantes: vi.fn(async () => faltantes),
    ingresar: vi.fn(async (_loteId: string, _items: ItemIngreso[]) => ({ ya_existia: false })),
    ajustar: vi.fn(async (productoId: string, _cambio: { cantidad?: number; minimo?: number; motivo?: string }) => ({
      producto_id: productoId,
      cantidad: 0,
      minimo: 0,
    })),
  } satisfies ServicioStock
}

function armar({ esJefe = true, stock = STOCK, faltantes = FALTANTES } = {}) {
  const servicio = servicioStockFalso(stock, faltantes)
  const productos = { listar: vi.fn(async () => PRODUCTOS) }
  const user = userEvent.setup()
  render(<PantallaStock servicio={servicio} productos={productos} esJefe={esJefe} />)
  return { servicio, user }
}

/** Texto de cada celda, fila por fila, sin el encabezado. */
const filas = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell').map((celda) => celda.textContent))

const encabezados = (tabla: HTMLElement) => within(tabla).getAllByRole('columnheader').map((th) => th.textContent)

describe('PantallaStock', () => {
  it('muestra faltantes y el stock de los productos activos', async () => {
    armar({ esJefe: false })
    expect(filas(await screen.findByRole('table', { name: 'En mínimo o sin stock' }))).toEqual([
      ['Alfajor triple', '2', '5'],
      ['Agua mineral', '-3', '0'],
    ])
    expect(filas(screen.getByRole('table', { name: 'Stock' }))).toEqual([
      ['Agua mineral', '-3 (Vendido sin stock)', '0'],
      ['Alfajor triple', '2', '5'],
      ['Chipá', '0', '0'],
    ])
  })

  it('sin esJefe no hay columna Proveedor, ni botones Ajustar, ni formulario de ajuste', async () => {
    armar({ esJefe: false })
    const faltantes = await screen.findByRole('table', { name: 'En mínimo o sin stock' })
    expect(encabezados(faltantes)).toEqual(['Producto', 'Quedan', 'Mínimo'])
    expect(screen.queryByRole('button', { name: /Ajustar/ })).toBeNull()
    expect(screen.queryByRole('form', { name: 'Ajustar stock' })).toBeNull()
  })

  it('con esJefe muestra el proveedor, o "Sin cargar" si no hay', async () => {
    armar()
    const faltantes = await screen.findByRole('table', { name: 'En mínimo o sin stock' })
    expect(encabezados(faltantes)).toEqual(['Producto', 'Quedan', 'Mínimo', 'Proveedor'])
    expect(filas(faltantes)).toEqual([
      ['Alfajor triple', '2', '5', 'Dulcor'],
      ['Agua mineral', '-3', '0', 'Sin cargar'],
    ])
  })

  it('sin faltantes lo dice', async () => {
    armar({ faltantes: [] })
    expect(await screen.findByText('Nada está en mínimo ni sin stock.')).toBeInTheDocument()
  })

  it('Ajustar abre el formulario con ese producto elegido', async () => {
    const { user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Ajustar Chipá' }))
    expect(within(screen.getByRole('form', { name: 'Ajustar stock' })).getByLabelText('Producto')).toHaveValue('p3')
  })

  it('ingreso con dos productos: el reintento reusa el lote y el ingreso siguiente usa otro', async () => {
    const { servicio, user } = armar()
    const ingreso = await screen.findByRole('form', { name: 'Ingreso de mercadería' })
    servicio.ingresar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.selectOptions(within(ingreso).getAllByLabelText('Producto')[0], 'p1')
    await user.type(within(ingreso).getAllByLabelText('Cantidad')[0], '3')
    await user.click(within(ingreso).getByRole('button', { name: 'Agregar otro producto' }))
    await user.selectOptions(within(ingreso).getAllByLabelText('Producto')[1], 'p3')
    await user.type(within(ingreso).getAllByLabelText('Cantidad')[1], '10')
    await user.click(within(ingreso).getByRole('button', { name: 'Registrar ingreso' }))
    expect(await within(ingreso).findByRole('alert')).toHaveTextContent('No se pudo guardar')
    await user.click(within(ingreso).getByRole('button', { name: 'Registrar ingreso' }))
    expect(await within(ingreso).findByRole('status')).toHaveTextContent('Ingreso registrado.')
    expect(within(ingreso).getAllByLabelText('Producto')).toHaveLength(1)

    await user.selectOptions(within(ingreso).getByLabelText('Producto'), 'p2')
    await user.type(within(ingreso).getByLabelText('Cantidad'), '1')
    await user.click(within(ingreso).getByRole('button', { name: 'Registrar ingreso' }))
    expect(await within(ingreso).findByRole('status')).toHaveTextContent('Ingreso registrado.')

    const dos = [
      { productoId: 'p1', cantidad: 3 },
      { productoId: 'p3', cantidad: 10 },
    ]
    const llamadas = servicio.ingresar.mock.calls
    expect(llamadas.map(([, items]) => items)).toEqual([dos, dos, [{ productoId: 'p2', cantidad: 1 }]])
    expect(llamadas[1][0]).toBe(llamadas[0][0])
    expect(llamadas[2][0]).not.toBe(llamadas[0][0])
  })

  it('un producto repetido en el ingreso no llama al servicio', async () => {
    const { servicio, user } = armar()
    const ingreso = await screen.findByRole('form', { name: 'Ingreso de mercadería' })
    await user.selectOptions(within(ingreso).getAllByLabelText('Producto')[0], 'p1')
    await user.type(within(ingreso).getAllByLabelText('Cantidad')[0], '2')
    await user.click(within(ingreso).getByRole('button', { name: 'Agregar otro producto' }))
    await user.selectOptions(within(ingreso).getAllByLabelText('Producto')[1], 'p1')
    await user.type(within(ingreso).getAllByLabelText('Cantidad')[1], '3')
    await user.click(within(ingreso).getByRole('button', { name: 'Registrar ingreso' }))
    expect(await within(ingreso).findByRole('alert')).toHaveTextContent(MENSAJES_STOCK.linea_invalida)
    expect(servicio.ingresar).not.toHaveBeenCalled()
  })

  it('dos clics seguidos en Registrar ingreso mandan un solo ingreso', async () => {
    const { servicio, user } = armar()
    const ingreso = await screen.findByRole('form', { name: 'Ingreso de mercadería' })
    let terminar: () => void = () => undefined
    servicio.ingresar.mockImplementationOnce(
      () => new Promise<{ ya_existia: boolean }>((resolver) => (terminar = () => resolver({ ya_existia: false }))),
    )
    await user.selectOptions(within(ingreso).getAllByLabelText('Producto')[0], 'p1')
    await user.type(within(ingreso).getAllByLabelText('Cantidad')[0], '3')
    const boton = within(ingreso).getByRole('button', { name: 'Registrar ingreso' })
    await user.click(boton)
    await user.click(boton)
    expect(boton).toHaveAttribute('aria-disabled', 'true')
    expect(servicio.ingresar).toHaveBeenCalledTimes(1)
    await act(async () => terminar())
    expect(await within(ingreso).findByRole('status')).toHaveTextContent('Ingreso registrado.')
  })

  it('cambiar la cantidad sin motivo no llama al servicio', async () => {
    const { servicio, user } = armar()
    const ajuste = await screen.findByRole('form', { name: 'Ajustar stock' })
    await user.selectOptions(within(ajuste).getByLabelText('Producto'), 'p3')
    await user.type(within(ajuste).getByLabelText(/Cantidad nueva/), '5')
    await user.click(within(ajuste).getByRole('button', { name: 'Guardar ajuste' }))
    expect(await within(ajuste).findByRole('alert')).toHaveTextContent(MENSAJES_STOCK.motivo_invalido)
    expect(servicio.ajustar).not.toHaveBeenCalled()
  })

  it('ajusta la cantidad con motivo', async () => {
    const { servicio, user } = armar()
    const ajuste = await screen.findByRole('form', { name: 'Ajustar stock' })
    await user.selectOptions(within(ajuste).getByLabelText('Producto'), 'p2')
    await user.type(within(ajuste).getByLabelText(/Cantidad nueva/), '5')
    await user.type(within(ajuste).getByLabelText(/Motivo/), 'Conteo de góndola')
    await user.click(within(ajuste).getByRole('button', { name: 'Guardar ajuste' }))
    expect(servicio.ajustar).toHaveBeenCalledWith('p2', { cantidad: 5, motivo: 'Conteo de góndola' })
    expect(await within(ajuste).findByRole('status')).toHaveTextContent('Stock ajustado.')
  })

  it('ajusta sólo el mínimo, sin motivo', async () => {
    const { servicio, user } = armar()
    const ajuste = await screen.findByRole('form', { name: 'Ajustar stock' })
    await user.selectOptions(within(ajuste).getByLabelText('Producto'), 'p1')
    await user.type(within(ajuste).getByLabelText(/Mínimo/), '4')
    await user.click(within(ajuste).getByRole('button', { name: 'Guardar ajuste' }))
    expect(servicio.ajustar).toHaveBeenCalledWith('p1', { minimo: 4 })
    expect(await within(ajuste).findByRole('status')).toHaveTextContent('Stock ajustado.')
  })
})
