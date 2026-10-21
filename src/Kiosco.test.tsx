import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cuenta } from './auth/cuenta'
import { Kiosco } from './Kiosco'
import { CUENTA_CAJA, CUENTA_JEFE, serviciosFalsos } from './test/servicios'

function armar(cuenta: Cuenta, servicios = serviciosFalsos()) {
  const alCerrarSesion = vi.fn()
  const user = userEvent.setup()
  render(<Kiosco servicios={servicios} cuenta={cuenta} alCerrarSesion={alCerrarSesion} />)
  return { servicios, alCerrarSesion, user }
}

const secciones = () =>
  within(screen.getByRole('navigation', { name: 'Secciones' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('Kiosco', () => {
  it('registra la PC al entrar, muestra el prefijo y programa la caché', async () => {
    const { servicios } = armar(CUENTA_CAJA)
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.registrarDispositivo).toHaveBeenCalledWith('n1')
    expect(servicios.vaciarCacheAjena).toHaveBeenCalledWith('n1')
    expect(servicios.sincronizarCatalogo).toHaveBeenCalled()
    expect(servicios.turno).toHaveBeenCalledWith('pc-1')
  })

  it('la caja no ve las pantallas del jefe', async () => {
    armar(CUENTA_CAJA)
    await screen.findByText('Caja · PC A')
    expect(secciones()).toEqual(['Caja', 'Productos', 'Caja del día'])
  })

  it('el jefe ve todas las secciones y abre el historial', async () => {
    const { servicios, user } = armar(CUENTA_JEFE)
    await screen.findByText('Jefe · PC A')
    expect(secciones()).toEqual([
      'Caja', 'Productos', 'Caja del día', 'Historial', 'Módulo fiado', 'Anonimizar cliente', 'Calibrar escáner',
    ])
    await user.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('table', { name: 'Historial' })).toBeInTheDocument()
    expect(servicios.jefe.leerHistorial).toHaveBeenCalledWith(0)
  })

  it('el jefe apaga el fiado y el kiosco se queda con el estado nuevo', async () => {
    const { servicios, user } = armar(CUENTA_JEFE)
    await user.click(await screen.findByRole('button', { name: 'Módulo fiado' }))
    const interruptor = screen.getByRole('checkbox', { name: 'Fiado activo' })
    await waitFor(() => expect(interruptor).toBeChecked())
    await user.click(interruptor)
    expect(servicios.jefe.cambiarModuloFiado).toHaveBeenCalledWith(false)
    await waitFor(() => expect(interruptor).not.toBeChecked())
  })

  it('si no se puede registrar la PC, ofrece reintentar', async () => {
    const servicios = serviciosFalsos()
    servicios.registrarDispositivo.mockRejectedValueOnce(new Error('sin red'))
    const { user } = armar(CUENTA_CAJA, servicios)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar esta PC')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.registrarDispositivo).toHaveBeenCalledTimes(2)
  })

  it('cerrar turno pide confirmación, muestra el resumen y vuelve a pedir apertura', async () => {
    const { servicios, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Cerrar turno' }))
    expect(screen.getByText(/Si hay una venta sin cobrar, se pierde/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sí, cerrar turno' }))
    const turno = servicios.turno.mock.results[0].value
    expect(turno.cerrar).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Turno cerrado' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await waitFor(() => expect(turno.leer).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Abrir turno' })).toBeVisible()
  })

  it('al volver a la caja el foco vuelve al campo de escaneo (decisión 13)', async () => {
    const { user } = armar(CUENTA_JEFE)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    const campo = await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    await waitFor(() => expect(campo).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Productos' }))
    await user.click(screen.getByRole('button', { name: 'Caja' }))
    expect(campo).toHaveFocus()
    // Volver a tocar "Caja" estando en la caja tampoco le saca el foco.
    await user.click(screen.getByRole('button', { name: 'Caja' }))
    expect(campo).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(campo).toHaveFocus()
  })

  it('al volver a la caja con el alta o el cobro abiertos, el foco no salta al campo de escaneo', async () => {
    const { user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    const campo = await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    await waitFor(() => expect(campo).toHaveFocus())
    const volverACaja = async () => {
      await user.click(screen.getByRole('button', { name: 'Productos' }))
      await user.click(screen.getByRole('button', { name: 'Caja' }))
    }

    // Escaneo (sin pausas entre teclas) de un código que no está: abre el alta rápida.
    await userEvent.setup({ delay: null }).keyboard('7790077{Enter}')
    const nombre = await screen.findByLabelText('Nombre')
    await waitFor(() => expect(nombre).toHaveFocus())
    await volverACaja()
    expect(nombre).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Sin código (F2)' }))
    await user.click(await screen.findByRole('button', { name: /Bizcochos/ }))
    await user.click(screen.getByRole('button', { name: /^Cobrar/ }))
    const efectivo = await screen.findByLabelText('Efectivo')
    await waitFor(() => expect(efectivo).toHaveFocus())
    await volverACaja()
    expect(efectivo).toHaveFocus()
    expect(campo).not.toHaveFocus()
  })

  it('si no se pudo leer el módulo fiado, lo dice en vez de mostrarlo apagado y reintenta solo', async () => {
    const servicios = serviciosFalsos()
    servicios.fiadoActivo.mockRejectedValueOnce(new Error('sin red'))
    const { user } = armar(CUENTA_JEFE, servicios)
    await user.click(await screen.findByRole('button', { name: 'Módulo fiado' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el módulo fiado')
    expect(screen.queryByRole('checkbox', { name: 'Fiado activo' })).toBeNull()

    // La revisión siguiente de la caché (acá, volver a la pestaña) lo vuelve a leer.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Reflect.deleteProperty(document, 'visibilityState')
    expect(await screen.findByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
  })

  it('con la caja oculta se puede seleccionar texto con el mouse', async () => {
    const { user } = armar(CUENTA_JEFE)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    const enCaja = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(enCaja)
    expect(enCaja.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Calibrar escáner' }))
    const fuera = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(fuera)
    expect(fuera.defaultPrevented).toBe(false)
  })

  it('cerrar el turno desde otra sección deja sólo el resumen', async () => {
    const { user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Productos' }))
    expect(await screen.findByRole('heading', { name: 'Precios y productos' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    await user.click(screen.getByRole('button', { name: 'Sí, cerrar turno' }))
    expect(await screen.findByRole('heading', { name: 'Turno cerrado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Precios y productos' })).toBeNull()
  })

  it('"Cerrar sesión" avisa a la app', async () => {
    const { alCerrarSesion, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(alCerrarSesion).toHaveBeenCalledTimes(1)
  })
})
