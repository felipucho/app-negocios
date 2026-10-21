import { describe, expect, it } from 'vitest'
import { aFilaHistorial, mensajeJefe, type FilaHistorialCruda } from './jefe'

const base: FilaHistorialCruda = {
  id: 'h1',
  tipo: 'cambio_precio',
  fecha: '2026-10-19T15:00:00Z',
  cuenta_id: 'u-jefe',
  dispositivo_id: 'pc-1',
  entidad: 'productos',
  entidad_id: 'p1',
  valor_anterior: { precio: 900 },
  valor_nuevo: { precio: 1000 },
  motivo: null,
}
const prefijos = new Map([['pc-1', 'A']])
const nombres = new Map([['p1', 'Alfajor triple']])

describe('aFilaHistorial', () => {
  it('la cuenta propia es el jefe; otra del kiosco es la caja; vacía es fuera de la app', () => {
    expect(aFilaHistorial(base, 'u-jefe', prefijos, nombres).quien).toBe('jefe')
    expect(aFilaHistorial({ ...base, cuenta_id: 'u-caja' }, 'u-jefe', prefijos, nombres).quien).toBe('caja')
    expect(aFilaHistorial({ ...base, cuenta_id: null, dispositivo_id: null }, 'u-jefe', prefijos, nombres)).toMatchObject({
      quien: 'fuera_de_la_app',
      prefijo: null,
    })
  })

  it('pone el prefijo de la PC y el nombre del producto sólo en filas de productos', () => {
    expect(aFilaHistorial(base, 'u-jefe', prefijos, nombres)).toMatchObject({ prefijo: 'A', nombreProducto: 'Alfajor triple' })
    expect(aFilaHistorial({ ...base, entidad: 'ventas', entidad_id: 'p1' }, 'u-jefe', prefijos, nombres).nombreProducto).toBeNull()
  })

  it('traduce los errores de la base', () => {
    expect(mensajeJefe({ message: 'solo_jefe' })).toBe('Sólo el jefe puede hacer esto.')
    expect(mensajeJefe(new Error('Failed to fetch'))).toContain('Revisá la conexión')
  })
})
