import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cuenta } from './auth/cuenta'
import { Kiosco } from './Kiosco'
import { CUENTA_CAJA, CUENTA_JEFE, modulosDePrueba, serviciosFalsos } from './test/servicios'

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
    expect(secciones()).toEqual(['Caja', 'Productos', 'Caja del día', 'Fiado'])
  })

  it('el jefe ve todas las secciones y abre el historial', async () => {
    const { servicios, user } = armar(CUENTA_JEFE)
    await screen.findByText('Jefe · PC A')
    expect(secciones()).toEqual([
      'Caja', 'Productos', 'Caja del día', 'Fiado', 'Historial', 'Módulo fiado', 'Anonimizar cliente', 'Calibrar escáner',
    ])
    await user.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('table', { name: 'Historial' })).toBeInTheDocument()
    expect(servicios.jefe.leerHistorial).toHaveBeenCalledWith(null)
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

  it('si el turno ya estaba cerrado (se perdió la respuesta del cierre), muestra el último cierre', async () => {
    const { servicios, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    const turno = servicios.turno.mock.results[0].value
    turno.cerrar.mockRejectedValueOnce({ message: 'sin_turno' })
    turno.ultimoCerrado.mockResolvedValue({
      turnoId: 't1',
      apertura: '2026-10-19T12:00:00Z',
      cierre: '2026-10-19T20:00:00Z',
      totales: { efectivo: 1500, transferencia: 0, tarjeta: 0, fiado: 0, cobrado: 1500 },
    })
    await user.click(screen.getByRole('button', { name: 'Productos' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    await user.click(screen.getByRole('button', { name: 'Sí, cerrar turno' }))
    expect(await screen.findByRole('heading', { name: 'No hay turno abierto en esta PC' })).toBeVisible()
    expect(await screen.findByRole('heading', { name: 'Último turno cerrado' })).toBeVisible()
    expect(screen.getAllByText('$1.500')).toHaveLength(2) // efectivo y total cobrado
    expect(screen.queryByRole('heading', { name: 'Precios y productos' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('si el cierre falla por la red, lo avisa y la venta sigue', async () => {
    const { servicios, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    const campo = await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    servicios.turno.mock.results[0].value.cerrar.mockRejectedValueOnce(new Error('sin red'))
    await user.click(screen.getByRole('button', { name: 'Cerrar turno' }))
    await user.click(screen.getByRole('button', { name: 'Sí, cerrar turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar el turno. Revisá la conexión.')
    expect(campo).toBeVisible()
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

  it('al volver a la caja con el cobro abierto, el foco que el navegador soltó al ocultarla vuelve al cobro', async () => {
    const { user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    await user.click(screen.getByRole('button', { name: 'Sin código (F2)' }))
    await user.click(await screen.findByRole('button', { name: /Bizcochos/ }))
    await user.click(screen.getByRole('button', { name: /^Cobrar/ }))
    const efectivo = await screen.findByLabelText('Efectivo')
    await user.click(screen.getByRole('button', { name: 'Productos' }))
    // Chromium saca el foco de lo que queda oculto (hidden); jsdom no, así que se simula.
    efectivo.blur()
    expect(document.body).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Caja' }))
    expect(efectivo).toHaveFocus()
  })

  it('tras precios_distintos el kiosco pone al día la caché del catálogo en el momento', async () => {
    const servicios = serviciosFalsos()
    vi.mocked(servicios.rpc).mockResolvedValue({
      data: {
        estado: 'precios_distintos',
        diferencias: [{ producto_id: 'x', nombre: 'Bizcochos', precio_visto: 500, precio_actual: 600 }],
      },
      error: null,
    })
    const { user } = armar(CUENTA_CAJA, servicios)
    await user.click(await screen.findByRole('button', { name: 'Abrir turno' }))
    await screen.findByRole('combobox', { name: 'Escanear o buscar' })
    await user.click(screen.getByRole('button', { name: 'Sin código (F2)' }))
    await user.click(await screen.findByRole('button', { name: /Bizcochos/ }))
    await user.click(screen.getByRole('button', { name: /^Cobrar/ }))
    const llamadasAntes = vi.mocked(servicios.sincronizarCatalogo).mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByRole('list', { name: 'Precios que cambiaron' })).toBeInTheDocument()
    expect(servicios.sincronizarCatalogo).toHaveBeenCalledTimes(llamadasAntes + 1)
  })

  it('si no se pudo leer el módulo fiado, lo dice en vez de mostrarlo apagado y reintenta solo', async () => {
    const servicios = serviciosFalsos()
    servicios.leerModulos.mockRejectedValueOnce(new Error('sin red'))
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

  it('relee el módulo fiado en cada revisión: ve el cambio de otra PC y, si falla, queda el último valor', async () => {
    const servicios = serviciosFalsos()
    const { user } = armar(CUENTA_JEFE, servicios)
    await user.click(await screen.findByRole('button', { name: 'Módulo fiado' }))
    expect(await screen.findByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
    const revisar = () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Reflect.deleteProperty(document, 'visibilityState')
    }

    servicios.leerModulos.mockResolvedValueOnce(modulosDePrueba([])) // el jefe lo apagó desde otra PC
    revisar()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).not.toBeChecked())

    servicios.leerModulos.mockRejectedValueOnce(new Error('sin red'))
    revisar()
    await waitFor(() => expect(servicios.leerModulos).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).not.toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('muestra las secciones de los módulos activos del negocio', async () => {
    armar(CUENTA_JEFE, serviciosFalsos({ modulos: ['stock', 'movimientos_caja', 'precios'] }))
    await waitFor(() =>
      expect(secciones()).toEqual([
        'Caja', 'Productos', 'Caja del día', 'Movimientos de caja', 'Stock', 'Fiado', 'Precios', 'Historial', 'Módulo fiado',
        'Anonimizar cliente', 'Calibrar escáner',
      ]),
    )
  })

  it('la caja ve Stock con su módulo activo, pero no Precios', async () => {
    armar(CUENTA_CAJA, serviciosFalsos({ modulos: ['precios', 'stock'] }))
    await waitFor(() => expect(secciones()).toContain('Stock'))
    expect(secciones()).toEqual(['Caja', 'Productos', 'Caja del día', 'Stock', 'Fiado'])
  })

  it('Proveedores aparece sólo con su módulo activo, y la caja lo ve', async () => {
    armar(CUENTA_CAJA, serviciosFalsos({ modulos: ['proveedores'] }))
    await waitFor(() => expect(secciones()).toContain('Proveedores'))
    expect(secciones()).toEqual(['Caja', 'Productos', 'Caja del día', 'Proveedores', 'Fiado'])
  })

  it('abre la pantalla de proveedores con la alta si todavía no hay ninguno', async () => {
    const { servicios, user } = armar(CUENTA_CAJA, serviciosFalsos({ modulos: ['proveedores'] }))
    await user.click(await screen.findByRole('button', { name: 'Proveedores' }))
    expect(servicios.proveedores).toHaveBeenCalledWith('pc-1')
    expect(await screen.findByRole('form', { name: 'Alta de proveedor' })).toBeInTheDocument()
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

  it('aplica la config visual del negocio después del login y la quita al salir', async () => {
    const servicios = serviciosFalsos({
      config: { nombreVisible: 'Kiosco Don Beto', logoUrl: null, colorPrimario: '#aa3300' },
    })
    const { unmount } = render(<Kiosco servicios={servicios} cuenta={CUENTA_CAJA} alCerrarSesion={vi.fn()} />)
    expect(await screen.findByText('Kiosco Don Beto')).toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('#aa3300')
    unmount()
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('')
  })

  it('abono suspendido: avisa y no bloquea la venta', async () => {
    const { user } = armar(CUENTA_CAJA, serviciosFalsos({ estadoAbono: 'suspendido' }))
    expect(await screen.findByText(/El abono de este kiosco está suspendido/)).toBeInTheDocument()
    const abrir = await screen.findByRole('button', { name: 'Abrir turno' })
    expect(abrir).toBeEnabled()
    await user.click(abrir)
    expect(await screen.findByLabelText('Escanear o buscar')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sin código (F2)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cerrar turno' })).toBeEnabled()
  })
})
