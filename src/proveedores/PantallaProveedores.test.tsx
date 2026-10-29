import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PantallaProveedores } from './PantallaProveedores'
import {
  hoyEnElKiosco,
  type DatosProveedor,
  type EstadoVisita,
  type PedidoProveedor,
  type Proveedor,
  type RetiroProveedor,
  type ServicioProveedores,
  type Visita,
} from './proveedores'

// Orden alfabético: el primero de la lista es Almacén Norte, y es el que se abre al entrar.
const PROVEEDORES: Proveedor[] = [
  { id: 'p1', nombre: 'Almacén Norte', contacto: null, notas: null },
  { id: 'p2', nombre: 'Coca-Cola', contacto: 'Juan 11-5555-0101', notas: null },
]

// Fechas fijas: una pasada (la pantalla la marca como ya pasó) y una del año 2019 ya cerrada.
const VISITAS: Visita[] = [
  { id: 'v1', proveedor_id: 'p1', fecha: '2020-01-02', estado: 'prevista', nota: 'Trae los pedidos' },
  { id: 'v2', proveedor_id: 'p1', fecha: '2019-12-20', estado: 'llego', nota: null },
  { id: 'v3', proveedor_id: 'p2', fecha: '2030-01-01', estado: 'prevista', nota: null },
]

const PEDIDOS: PedidoProveedor[] = [
  { id: 'd1', proveedor_id: 'p1', descripcion: 'Coca 2,25 L', cantidad: '2 cajas', hecho: false },
  { id: 'd2', proveedor_id: 'p1', descripcion: 'Coca 500 ml', cantidad: null, hecho: true },
]

interface Opciones {
  proveedores?: Proveedor[]
  retiros?: RetiroProveedor[]
  retirosActivos?: boolean
  stockActivo?: boolean
}

/** Servicio en memoria: responde bien y registra las llamadas. */
function servicioFalso({ proveedores = PROVEEDORES, retiros = [] }: Pick<Opciones, 'proveedores' | 'retiros'> = {}) {
  return {
    leerProveedores: vi.fn(async (): Promise<Proveedor[]> => proveedores),
    leerVisitas: vi.fn(async (): Promise<Visita[]> => VISITAS),
    leerPedidos: vi.fn(async (): Promise<PedidoProveedor[]> => PEDIDOS),
    leerRetiros: vi.fn(async (): Promise<RetiroProveedor[]> => retiros),
    guardarProveedor: vi.fn(async (id: string, datos: DatosProveedor): Promise<Proveedor> => ({ id, ...datos })),
    registrarVisita: vi.fn(async (_id: string, _proveedorId: string, _fecha: string, _nota: string | null) => undefined),
    marcarVisita: vi.fn(async (_visitaId: string, _estado: EstadoVisita) => undefined),
    quitarVisita: vi.fn(async (_visitaId: string) => undefined),
    agregarPedido: vi.fn(async (_id: string, _proveedorId: string, _descripcion: string, _cantidad: string | null) => undefined),
    marcarPedido: vi.fn(async (_pedidoId: string, _hecho: boolean) => undefined),
    quitarPedido: vi.fn(async (_pedidoId: string) => undefined),
    agregarFaltantes: vi.fn(async (_proveedorId: string) => ({ cantidad: 2 })),
    registrarRetiro: vi.fn(
      async (_movimientoId: string, _proveedorId: string, _importe: number, _detalle: string | null) => undefined,
    ),
  } satisfies ServicioProveedores
}

function armar({ retirosActivos = true, stockActivo = true, ...resto }: Opciones = {}) {
  const servicio = servicioFalso(resto)
  const user = userEvent.setup()
  render(<PantallaProveedores servicio={servicio} retirosActivos={retirosActivos} stockActivo={stockActivo} />)
  return { servicio, user }
}

/** Texto de cada celda, fila por fila, sin el encabezado. */
const filas = (tabla: HTMLElement) =>
  within(tabla)
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell').map((celda) => celda.textContent))

describe('PantallaProveedores', () => {
  it('abre el primer proveedor de la lista con sus visitas y su pedido', async () => {
    armar()
    const previstas = await screen.findByRole('table', { name: 'Visitas previstas' })
    expect(screen.getByRole('button', { name: 'Almacén Norte' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(previstas).getByText('02/01/2020 (ya pasó)')).toBeTruthy()
    expect(within(previstas).getByText('Trae los pedidos')).toBeTruthy()
    expect(filas(screen.getByRole('table', { name: 'Visitas anteriores' })).map((f) => f.slice(0, 2))).toEqual([
      ['20/12/2019', 'Llegó'],
    ])
    // Los pendientes van antes que los pedidos ya hechos.
    const lista = screen.getByRole('list', { name: 'Qué pedirle' })
    expect(within(lista).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([false, true])
  })

  it('sin proveedores abre el alta', async () => {
    armar({ proveedores: [] })
    expect(await screen.findByRole('form', { name: 'Alta de proveedor' })).toBeTruthy()
  })

  it('da de alta un proveedor con nombre y sin contacto', async () => {
    const { servicio, user } = armar({ proveedores: [] })
    await user.type(await screen.findByRole('textbox', { name: 'Nombre' }), 'Distribuidora Sur')
    await user.click(screen.getByRole('button', { name: 'Dar de alta' }))
    expect(servicio.guardarProveedor).toHaveBeenCalledWith(expect.any(String), {
      nombre: 'Distribuidora Sur',
      contacto: null,
      notas: null,
    })
  })

  it('anota una visita para hoy, con la nota', async () => {
    const { servicio, user } = armar()
    await screen.findByRole('table', { name: 'Visitas previstas' })
    const hoy = hoyEnElKiosco()
    expect((screen.getByLabelText('Día que viene') as HTMLInputElement).value).toBe(hoy)
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Trae facturas')
    await user.click(screen.getByRole('button', { name: 'Anotar visita' }))
    expect(servicio.registrarVisita).toHaveBeenCalledWith(expect.any(String), 'p1', hoy, 'Trae facturas')
  })

  it('marca una visita prevista como llegó', async () => {
    const { servicio, user } = armar()
    const previstas = await screen.findByRole('table', { name: 'Visitas previstas' })
    await user.click(within(previstas).getByRole('button', { name: /^Llegó/ }))
    expect(servicio.marcarVisita).toHaveBeenCalledWith('v1', 'llego')
  })

  it('suma un renglón al pedido', async () => {
    const { servicio, user } = armar()
    await user.type(await screen.findByRole('textbox', { name: 'Qué pedirle' }), 'Galletitas')
    await user.click(screen.getByRole('button', { name: 'Agregar al pedido' }))
    expect(servicio.agregarPedido).toHaveBeenCalledWith(expect.any(String), 'p1', 'Galletitas', null)
  })

  it('suma los faltantes del proveedor y lo avisa', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Sumar faltantes de este proveedor' }))
    expect(servicio.agregarFaltantes).toHaveBeenCalledWith('p1')
    expect(await screen.findByText('Se sumaron 2 productos al pedido.')).toBeTruthy()
  })

  it('sin el módulo stock no ofrece sumar faltantes', async () => {
    armar({ stockActivo: false })
    await screen.findByRole('table', { name: 'Visitas previstas' })
    expect(screen.queryByRole('button', { name: 'Sumar faltantes de este proveedor' })).toBeNull()
  })

  it('registra un retiro para el proveedor', async () => {
    const { servicio, user } = armar()
    await user.type(await screen.findByRole('textbox', { name: 'Importe' }), '500')
    await user.click(screen.getByRole('button', { name: 'Registrar retiro' }))
    expect(servicio.registrarRetiro).toHaveBeenCalledWith(expect.any(String), 'p1', 500, null)
    expect(await screen.findByText('Retiro registrado. Ya cuenta en el arqueo del turno.')).toBeTruthy()
  })

  it('un importe con formato raro pide escribirlo en pesos enteros', async () => {
    const { servicio, user } = armar()
    await user.type(await screen.findByRole('textbox', { name: 'Importe' }), '$1500')
    await user.click(screen.getByRole('button', { name: 'Registrar retiro' }))
    expect(await screen.findByText('El importe tiene que ser un importe en pesos enteros.')).toBeTruthy()
    expect(servicio.registrarRetiro).not.toHaveBeenCalled()
  })

  it('un importe de cero no registra nada', async () => {
    const { servicio, user } = armar()
    await user.type(await screen.findByRole('textbox', { name: 'Importe' }), '0')
    await user.click(screen.getByRole('button', { name: 'Registrar retiro' }))
    expect(await screen.findByText('El importe tiene que ser mayor que cero.')).toBeTruthy()
    expect(servicio.registrarRetiro).not.toHaveBeenCalled()
  })

  it('suma los retiros del proveedor', async () => {
    armar({ retiros: [{ id: 'r1', fecha: '2026-10-28T14:00:00Z', importe: 1500, detalle: 'Pago de la semana' }] })
    expect(await screen.findByText('Total retirado: $1.500')).toBeTruthy()
    expect(screen.getByText('Pago de la semana')).toBeTruthy()
  })

  it('sin el módulo movimientos de caja no ofrece retiros', async () => {
    armar({ retirosActivos: false })
    await screen.findByRole('table', { name: 'Visitas previstas' })
    expect(screen.getByText(/activá el módulo de movimientos de caja/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar retiro' })).toBeNull()
  })
})
