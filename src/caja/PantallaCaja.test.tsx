import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { armarCaja, catalogoDePrueba, escanear, tipear, turnoDePrueba, type Usuario } from '../test/caja'

async function campoListo(user: Usuario) {
  const campo = await screen.findByLabelText('Escanear o buscar')
  await user.click(campo)
  return campo
}

const fila = (nombre: string) => screen.getByRole('row', { name: new RegExp(nombre) })

const AVISO_CERRADO_SOLO = 'Se cerró solo el turno anterior de esta PC'

describe('PantallaCaja', () => {
  it('un escaneo agrega el producto, lo resalta, pita y limpia el campo', async () => {
    const { user, reloj, pitar } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toHaveClass('linea--nueva')
    expect(pitar).toHaveBeenCalledTimes(1)
    expect(campo).toHaveValue('')
    expect(campo).toHaveFocus()
  })

  it('un código con letras escaneado agrega; tipeado a mano va a la búsqueda por nombre', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await tipear(user, reloj, 'ABC-55{Enter}')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    expect(campo).toHaveValue('ABC-55')
    await user.clear(campo)
    await escanear(user, reloj, 'ABC-55')
    expect(await screen.findByRole('row', { name: /Agua mineral/ })).toBeInTheDocument()
  })

  it('Enter con la lista abierta no agrega nada; flechas y Enter eligen', async () => {
    const { user, reloj } = armarCaja()
    await campoListo(user)
    await tipear(user, reloj, 'alf')
    const lista = await screen.findByRole('listbox', { name: 'Sugerencias' })
    expect(within(lista).getAllByRole('option')).toHaveLength(2)
    await tipear(user, reloj, '{Enter}')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    await tipear(user, reloj, '{ArrowDown}{Enter}')
    expect(await screen.findByRole('row', { name: /Alfajor simple/ })).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('un escaneo con la lista abierta gana: cierra la lista y agrega el código', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await tipear(user, reloj, 'alf')
    await screen.findByRole('listbox', { name: 'Sugerencias' })
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Alfajor simple/ })).toBeNull()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(campo).toHaveValue('')
  })

  it('con el cobro abierto un escaneo se ignora y avisa', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    expect(screen.getByText('Cobro abierto')).toBeInTheDocument()
    await user.click(campo)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('status')).toHaveTextContent('el escaneo no se agregó')
    expect(within(fila('Alfajor triple')).getByText('1')).toBeInTheDocument()
  })

  it('+ y − cambian la cantidad; con − en 1 la línea se quita y el foco vuelve al campo', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Alfajor triple' }))
    expect(within(fila('Alfajor triple')).getByText('2')).toBeInTheDocument()
    expect(campo).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Restar uno a Alfajor triple' }))
    await user.click(screen.getByRole('button', { name: 'Restar uno a Alfajor triple' }))
    expect(screen.queryByRole('row', { name: /Alfajor triple/ })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('un código inexistente avisa y no agrega', async () => {
    const { user, reloj } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '0000000')
    expect(await screen.findByRole('status')).toHaveTextContent('Código 0000000 no encontrado')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
  })

  it('explica qué hacer tras F5: la venta sin confirmar se pierde y hay que revisar las ventas de hoy', async () => {
    armarCaja()
    await screen.findByLabelText('Escanear o buscar')
    expect(screen.getByText(/F5/)).toHaveTextContent('revisá las ventas de hoy')
  })

  it('un clic en texto no le saca el foco al campo: el escaneo siguiente entra', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await user.click(screen.getByText(/F5/))
    expect(campo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
  })

  it('Tab no le saca el foco al campo: el escaneo siguiente entra', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await user.tab()
    expect(campo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
  })

  it('un producto desactivado escaneado avisa y no agrega', async () => {
    const { user, reloj, pitar } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '7790008')
    expect(await screen.findByRole('status')).toHaveTextContent('Turrón viejo está desactivado')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    expect(pitar).not.toHaveBeenCalled()
  })

  it('un clic en una sugerencia la agrega y deja el foco en el campo', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await tipear(user, reloj, 'alf')
    await user.click(await screen.findByRole('option', { name: /Alfajor simple/ }))
    expect(await screen.findByRole('row', { name: /Alfajor simple/ })).toBeInTheDocument()
    expect(campo).toHaveFocus()
  })

  it('una lectura doble del mismo código (menos de 150 ms) agrega una sola unidad', async () => {
    const { user, reloj, pitar } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    // Sin pausa previa: el reloj sigue a 5 ms por tecla, el segundo Enter llega ~40 ms después.
    await user.keyboard('7790001{Enter}')
    await waitFor(() => expect(pitar).toHaveBeenCalledTimes(1))
    expect(within(fila('Alfajor triple')).getByText('1')).toBeInTheDocument()
  })

  it('si falla la búsqueda por código avisa y no agrega', async () => {
    const catalogo = { ...catalogoDePrueba(), porCodigo: vi.fn(async () => Promise.reject(new Error('idb'))) }
    const { user, reloj } = armarCaja({ catalogo })
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo buscar el código')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
  })

  it('si no se puede leer el turno avisa y Reintentar vuelve a leerlo', async () => {
    const turno = turnoDePrueba(true)
    turno.leer.mockRejectedValueOnce(new Error('red'))
    const { user } = armarCaja({ turno })
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el turno')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Escanear o buscar')).toBeInTheDocument()
    expect(turno.leer).toHaveBeenCalledTimes(2)
  })

  it('sin turno abierto no vende: pide abrir el turno', async () => {
    const { user, turno } = armarCaja({ turnoAbierto: false })
    expect(await screen.findByRole('heading', { name: 'No hay turno abierto en esta PC' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Escanear o buscar')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByLabelText('Escanear o buscar')).toHaveFocus()
    expect(turno.abrir).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: AVISO_CERRADO_SOLO })).toBeNull()
  })

  it('si abrir cerró solo el turno anterior lo avisa con sus totales, sin sacarle el foco al campo; Entendido lo oculta', async () => {
    const turno = turnoDePrueba(false)
    turno.abrir.mockResolvedValueOnce({
      turnoId: 't2',
      apertura: '2026-10-19T20:00:00Z',
      turnoCerrado: {
        turnoId: 't1',
        apertura: '2026-10-19T11:00:00Z',
        cierre: '2026-10-19T20:00:00Z',
        totales: { efectivo: 900, transferencia: 0, tarjeta: 500, fiado: 0, cobrado: 1400 },
      },
    })
    const { user, reloj } = armarCaja({ turno })
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    const campo = await screen.findByLabelText('Escanear o buscar')
    const aviso = screen.getByRole('heading', { name: AVISO_CERRADO_SOLO }).closest('section')!
    expect(within(within(aviso).getByRole('row', { name: /^Efectivo/ })).getByText('$900')).toBeInTheDocument()
    expect(within(within(aviso).getByRole('row', { name: /^Total cobrado/ })).getByText('$1.400')).toBeInTheDocument()
    expect(campo).toHaveFocus()
    await user.click(within(aviso).getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('heading', { name: AVISO_CERRADO_SOLO })).toBeNull()
    expect(campo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
  })

  it('con teclado sólo, Esc en el campo cierra el aviso del turno cerrado solo y el foco sigue en el campo', async () => {
    const turno = turnoDePrueba(false)
    turno.abrir.mockResolvedValueOnce({
      turnoId: 't2',
      apertura: '2026-10-19T20:00:00Z',
      turnoCerrado: {
        turnoId: 't1',
        apertura: '2026-10-19T11:00:00Z',
        cierre: '2026-10-19T20:00:00Z',
        totales: { efectivo: 900, transferencia: 0, tarjeta: 500, fiado: 0, cobrado: 1400 },
      },
    })
    const { user } = armarCaja({ turno })
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    const campo = await screen.findByLabelText('Escanear o buscar')
    expect(screen.getByRole('heading', { name: AVISO_CERRADO_SOLO })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('heading', { name: AVISO_CERRADO_SOLO })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('el id de la venta se mantiene si el carrito no cambió y sale nuevo ante cualquier cambio del carrito', async () => {
    const { user, reloj, sesiones } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    // error_red: la base pudo grabar la venta con este id.
    const primero = sesiones.at(-1)!.ids.idPara('1 alfajor, efectivo justo')
    act(() => sesiones.at(-1)!.volver())
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    expect(sesiones.at(-1)!.ids.idPara('1 alfajor, efectivo justo')).toBe(primero)

    // La cajera ve en "ventas de hoy" que se grabó, vacía el carrito y el cliente siguiente lleva lo mismo.
    act(() => sesiones.at(-1)!.volver())
    await user.click(screen.getByRole('button', { name: 'Restar uno a Alfajor triple' }))
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    expect(sesiones.at(-1)!.ids.idPara('1 alfajor, efectivo justo')).not.toBe(primero)
  })

  it('"Cobrar" con la venta vacía no hace nada y no le saca el foco al campo', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    const cobrar = screen.getByRole('button', { name: 'Cobrar $0' })
    expect(cobrar).toHaveAttribute('aria-disabled', 'true')
    await user.click(cobrar)
    expect(screen.queryByText('Cobro abierto')).toBeNull()
    expect(campo).toHaveFocus()
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
  })

  it('con el cobro abierto + y − están bloqueados y no cambian la cantidad', async () => {
    const { user, reloj } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    const sumar = screen.getByRole('button', { name: 'Sumar uno a Alfajor triple' })
    expect(sumar).toHaveAttribute('aria-disabled', 'true')
    await user.click(sumar)
    expect(within(fila('Alfajor triple')).getByText('1')).toBeInTheDocument()
  })
})
