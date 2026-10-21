import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PAGINA_HISTORIAL, type FilaHistorial } from './jefe'
import { describirFila, PantallaHistorial } from './PantallaHistorial'

function fila(p: Partial<FilaHistorial> & Pick<FilaHistorial, 'id' | 'tipo'>): FilaHistorial {
  return {
    fecha: '2026-10-19T15:00:00Z',
    quien: 'caja',
    prefijo: 'A',
    entidad: 'productos',
    entidadId: 'p1',
    nombreProducto: 'Alfajor triple',
    valorAnterior: null,
    valorNuevo: null,
    motivo: null,
    ...p,
  }
}

describe('describirFila', () => {
  it('describe altas, precios, cambios de producto, anulaciones y turnos', () => {
    expect(describirFila(fila({ id: '1', tipo: 'alta_producto', valorNuevo: { nombre: 'Agua', precio: 1200, creado_en_caja: true } })))
      .toBe('Alfajor triple a $1.200 (creado en caja)')
    expect(describirFila(fila({ id: '2', tipo: 'cambio_precio', valorAnterior: { precio: 900 }, valorNuevo: { precio: 1000 } })))
      .toBe('Alfajor triple: $900 → $1.000')
    expect(describirFila(fila({ id: '3', tipo: 'cambio_producto', valorAnterior: { activo: true }, valorNuevo: { activo: false } })))
      .toBe('Alfajor triple: desactivado')
    expect(describirFila(fila({ id: '4', tipo: 'anulacion', entidad: 'ventas', nombreProducto: null, valorAnterior: { total: 900 }, motivo: 'Se cobró dos veces' })))
      .toBe('Venta de $900. Motivo: Se cobró dos veces')
    expect(describirFila(fila({ id: '5', tipo: 'cierre_turno', entidad: 'turnos', valorNuevo: { automatico: true } })))
      .toBe('Cerrado solo al abrir otro turno')
  })
})

describe('PantallaHistorial', () => {
  it('muestra quién hizo cada cambio, también los de fuera de la app', async () => {
    const leer = vi.fn(async (_desde: number) => [
      fila({ id: '1', tipo: 'cambio_precio', valorAnterior: { precio: 900 }, valorNuevo: { precio: 1000 } }),
      fila({ id: '2', tipo: 'cambio_precio', quien: 'fuera_de_la_app', prefijo: null, valorAnterior: { precio: 1000 }, valorNuevo: { precio: 1200 } }),
    ])
    render(<PantallaHistorial servicio={{ leerHistorial: leer }} />)
    const tabla = await screen.findByRole('table', { name: 'Historial' })
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas[0]).toHaveTextContent('Caja')
    expect(filas[0]).toHaveTextContent('PC A')
    expect(filas[1]).toHaveTextContent('Fuera de la app')
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull()
  })

  it('"Ver más" pide la página siguiente', async () => {
    const llena = Array.from({ length: PAGINA_HISTORIAL }, (_, i) => fila({ id: `h${i}`, tipo: 'apertura_turno', entidad: 'turnos' }))
    const leer = vi.fn(async (desde: number) => (desde === 0 ? llena : [fila({ id: 'ultima', tipo: 'apertura_turno', entidad: 'turnos' })]))
    const user = userEvent.setup()
    render(<PantallaHistorial servicio={{ leerHistorial: leer }} />)
    await user.click(await screen.findByRole('button', { name: 'Ver más' }))
    expect(leer).toHaveBeenLastCalledWith(PAGINA_HISTORIAL)
    // findAllByRole volvería apenas ve las filas de la primera página: hay que esperar la cuenta exacta.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(PAGINA_HISTORIAL + 2))
  })
})
