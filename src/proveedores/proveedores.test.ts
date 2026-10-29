import { describe, expect, it } from 'vitest'
import { fechaCorta, hoyEnElKiosco, intentoDe, mensajeProveedores, mensajeRetiro, yaNoExiste } from './proveedores'

describe('fechaCorta', () => {
  it('pasa AAAA-MM-DD a DD/MM/AAAA sin correr el día', () => {
    expect(fechaCorta('2026-10-30')).toBe('30/10/2026')
    expect(fechaCorta('2026-01-01')).toBe('01/01/2026')
  })
})

describe('hoyEnElKiosco', () => {
  it('da el día de Buenos Aires, aunque en UTC ya sea otro', () => {
    // 02:00 UTC del 28 es las 23:00 del 27 en Buenos Aires (UTC−3).
    expect(hoyEnElKiosco(new Date('2026-10-28T02:00:00Z'))).toBe('2026-10-27')
    expect(hoyEnElKiosco(new Date('2026-10-28T15:00:00Z'))).toBe('2026-10-28')
  })
})

describe('intentoDe', () => {
  it('el mismo contenido reusa el id; otro contenido da un id nuevo', () => {
    const primero = intentoDe(null, 'a')
    expect(intentoDe(primero, 'a')).toBe(primero)
    const otro = intentoDe(primero, 'b')
    expect(otro.clave).toBe('b')
    expect(otro.id).not.toBe(primero.id)
  })
})

describe('yaNoExiste', () => {
  it('un renglón que ya no está no es un error; otro código, sí', () => {
    expect(yaNoExiste(new Error('visita_desconocida'))).toBe(true)
    expect(yaNoExiste(new Error('pedido_desconocido'))).toBe(true)
    expect(yaNoExiste(new Error('nombre_repetido'))).toBe(false)
  })
})

describe('mensajes', () => {
  it('traduce el código de la base y cae en un texto genérico', () => {
    expect(mensajeProveedores(new Error('nombre_repetido'))).toBe('Ya hay un proveedor con ese nombre.')
    expect(mensajeProveedores(new Error('algo raro'))).toBe('No se pudo guardar. Revisá la conexión y probá de nuevo.')
  })

  it('los retiros tienen sus textos y, para el resto, los de proveedores', () => {
    expect(mensajeRetiro(new Error('sin_turno'))).toBe('Abrí el turno en esta PC para registrar el retiro.')
    expect(mensajeRetiro(new Error('nombre_repetido'))).toBe('Ya hay un proveedor con ese nombre.')
  })
})
