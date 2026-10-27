import { act, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { aCache } from '../catalogo/cache'
import { ErrorProducto, MENSAJES_ERROR_PRODUCTO } from '../productos/productos'
import { armarCaja, escanear, PRODUCTOS_DE_PRUEBA, TURRON_VIEJO, type Usuario } from '../test/caja'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import type { Producto } from '../tipos'
import { AVISO_ESCANEO_EN_COBRO } from './PantallaCaja'

async function campoListo(user: Usuario) {
  const campo = await screen.findByLabelText('Escanear o buscar')
  await user.click(campo)
  return campo
}

describe('PantallaCaja: alta rápida y reactivar', () => {
  it('un código inexistente abre el alta rápida; al guardar, el producto va a la venta', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    expect(await screen.findByText('Código 7790099 no encontrado. Buscalo por nombre.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(servicio.alta).toHaveBeenCalledWith('7790099', 'Turrón nuevo', 450)
    expect(await screen.findByRole('row', { name: /Turrón nuevo/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('un producto desactivado escaneado ofrece "Reactivar"; al reactivar va a la venta', async () => {
    const servicio = servicioProductosFalso([TURRON_VIEJO])
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790008')
    expect(await screen.findByText('Turrón viejo está desactivado.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reactivar Turrón viejo' }))
    expect(servicio.editar).toHaveBeenCalledWith('p8', { activo: true })
    expect(await screen.findByRole('row', { name: /Turrón viejo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivar Turrón viejo' })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('cancelar el alta vuelve al campo sin agregar nada', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    expect(campo).toHaveFocus()
    expect(servicio.alta).not.toHaveBeenCalled()
  })

  it('un alta que termina con el cobro abierto no cambia el total del cobro', async () => {
    const servicio = servicioProductosFalso()
    let terminarAlta: (p: Producto) => void = () => undefined
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>((r) => (terminarAlta = r)))
    const { user, reloj, sesiones } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    await escanear(user, reloj, '7790099')
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    await user.click(screen.getByRole('button', { name: /^Cobrar/ }))
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    await act(async () =>
      terminarAlta(productoDePrueba({ id: 'nuevo', nombre: 'Turrón nuevo', precio: 450, codigo_barras: '7790099' })),
    )
    expect(sesiones.at(-1)?.total).toBe(900)
    expect(sesiones.at(-1)?.lineas).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(AVISO_ESCANEO_EN_COBRO)
  })

  it('una lectura doble del mismo código con el alta abierta no la cierra ni escribe en Nombre', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790099')
    const nombre = await screen.findByLabelText('Nombre')
    expect(nombre).toHaveFocus()
    // Sin pausa del reloj: la segunda lectura llega a 5 ms por tecla, dentro de dobleLecturaMs.
    await user.keyboard('7790099{Enter}')
    expect(screen.getByRole('form', { name: 'Alta rápida de producto' })).toBeInTheDocument()
    expect(nombre).toHaveValue('')
    expect(nombre).toHaveFocus()
    expect(servicio.alta).not.toHaveBeenCalled()
  })

  it('con el alta abierta, escanear otro producto cierra el alta y lo agrega a la venta', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    expect(await screen.findByLabelText('Nombre')).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(servicio.alta).not.toHaveBeenCalled()
    expect(campo).toHaveFocus()
  })

  it('si el código ya estaba cargado, el alta se cierra y el reescaneo lo agrega con el catálogo nuevo', async () => {
    const productos = [...PRODUCTOS_DE_PRUEBA]
    const servicio = servicioProductosFalso()
    // Otra caja lo cargó: la base rechaza el alta y el catálogo se actualiza.
    servicio.alta.mockImplementation(async () => {
      productos.push(
        aCache(productoDePrueba({ id: 'p99', nombre: 'Turrón de otra caja', precio: 450, codigo_barras: '7790099' })),
      )
      throw new ErrorProducto('codigo_existente', 'p99')
    })
    const { user, reloj } = armarCaja({ servicioProductos: servicio, productos })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(await screen.findByText(MENSAJES_ERROR_PRODUCTO.codigo_existente)).toBeInTheDocument()
    await escanear(user, reloj, '7790099')
    expect(await screen.findByRole('row', { name: /Turrón de otra caja/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(servicio.alta).toHaveBeenCalledTimes(1)
    expect(campo).toHaveFocus()
  })

  it('con foco en "Guardar y agregar", escanear otro producto lo agrega a la venta sin guardar el alta', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790099')
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Guardar y agregar' })).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(servicio.alta).not.toHaveBeenCalled()
  })

  it('mientras "Guardar y agregar" espera a la base, escanear otro producto lo agrega a la venta', async () => {
    const servicio = servicioProductosFalso()
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>(() => undefined))
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790099')
    reloj.tipeo()
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(servicio.alta).toHaveBeenCalledTimes(1)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
  })

  it('un alta que falla después de cerrarse por otro escaneo avisa que su código no se agregó', async () => {
    const servicio = servicioProductosFalso()
    let fallarAlta: (e: unknown) => void = () => undefined
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>((_, rechazar) => (fallarAlta = rechazar)))
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790099')
    reloj.tipeo()
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    await act(async () => fallarAlta(new ErrorProducto('desconocido')))
    expect(screen.getByRole('status')).toHaveTextContent(
      `No se pudo guardar 7790099: no se agregó a la venta. ${MENSAJES_ERROR_PRODUCTO.desconocido}`,
    )
    expect(screen.queryByRole('row', { name: /Turrón nuevo/ })).toBeNull()
  })

  it('mientras "Reactivar" espera a la base, escanear otro producto lo agrega a la venta', async () => {
    const servicio = servicioProductosFalso([TURRON_VIEJO])
    let terminar: (p: Producto) => void = () => undefined
    servicio.editar.mockImplementationOnce(() => new Promise<Producto>((r) => (terminar = r)))
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790008')
    await user.click(await screen.findByRole('button', { name: 'Reactivar Turrón viejo' }))
    expect(campo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    await act(async () => terminar(productoDePrueba({ ...TURRON_VIEJO, activo: true })))
    expect(screen.getByRole('row', { name: /Turrón viejo/ })).toBeInTheDocument()
  })

  it('un alta que termina con otra alta abierta agrega su producto y deja abierta la nueva', async () => {
    const servicio = servicioProductosFalso()
    let terminarAlta: (p: Producto) => void = () => undefined
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>((r) => (terminarAlta = r)))
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    await campoListo(user)
    await escanear(user, reloj, '7790099')
    reloj.tipeo()
    await user.type(await screen.findByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450{Enter}')
    expect(servicio.alta).toHaveBeenCalledTimes(1)
    await escanear(user, reloj, '7790077')
    expect(await screen.findByText('7790077')).toBeInTheDocument()
    await act(async () =>
      terminarAlta(productoDePrueba({ id: 'nuevo', nombre: 'Turrón nuevo', precio: 450, codigo_barras: '7790099' })),
    )
    expect(screen.getByRole('row', { name: /Turrón nuevo/ })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Alta rápida de producto' })).toHaveTextContent('7790077')
    expect(screen.getByRole('status')).toHaveTextContent('Código 7790077 no encontrado')
    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Nombre')).toHaveFocus()
  })

  it('una reactivación que termina con otro desactivado escaneado deja su "Reactivar"', async () => {
    const otro = { ...TURRON_VIEJO, id: 'p10', nombre: 'Maní viejo', codigo_barras: '7790010' }
    const servicio = servicioProductosFalso([TURRON_VIEJO, otro])
    let terminar: (p: Producto) => void = () => undefined
    servicio.editar.mockImplementationOnce(() => new Promise<Producto>((r) => (terminar = r)))
    const { user, reloj } = armarCaja({ servicioProductos: servicio, productos: [...PRODUCTOS_DE_PRUEBA, otro] })
    await campoListo(user)
    await escanear(user, reloj, '7790008')
    await user.click(await screen.findByRole('button', { name: 'Reactivar Turrón viejo' }))
    await escanear(user, reloj, '7790010')
    expect(await screen.findByRole('button', { name: 'Reactivar Maní viejo' })).toBeInTheDocument()
    await act(async () => terminar(productoDePrueba({ ...TURRON_VIEJO, activo: true })))
    expect(screen.getByRole('row', { name: /Turrón viejo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivar Maní viejo' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Maní viejo está desactivado.')
  })
})
