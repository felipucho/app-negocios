import { describe, expect, it } from 'vitest'
import {
  calcularCobro,
  efectivoRestante,
  esPesoEntero,
  pagosAEnviar,
  type EntradaCobro,
  type ImportesPorMedio,
} from './cobro'

const importes = (parcial: Partial<ImportesPorMedio>): ImportesPorMedio => ({
  efectivo: 0,
  transferencia: 0,
  tarjeta: 0,
  fiado: 0,
  ...parcial,
})

const entrada = (parcial: Partial<EntradaCobro> & Pick<EntradaCobro, 'total' | 'importes'>): EntradaCobro => ({
  efectivoEntregado: null,
  clienteFiadoId: null,
  fiadoHabilitado: true,
  ...parcial,
})

describe('calcularCobro', () => {
  it('vuelto exacto sobre el efectivo, con pagos combinados', () => {
    const r = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 1000, tarjeta: 500 }), efectivoEntregado: 2000 }))
    expect(r).toEqual({ suma: 1500, falta: 0, vuelto: 1000, errores: [], valido: true })
  })

  it('sin entrega informada el vuelto es 0', () => {
    const r = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 1500 }) }))
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(true)
  })

  it('no da vuelto sobre transferencia ni tarjeta', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ transferencia: 600, tarjeta: 400 }) }))
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(true)
  })

  it('la entrega en efectivo no alcanza', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 1000 }), efectivoEntregado: 500 }))
    expect(r.errores).toEqual(['efectivo_insuficiente'])
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(false)
  })

  it('entrega en efectivo sin parte en efectivo', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ tarjeta: 1000 }), efectivoEntregado: 500 }))
    expect(r.errores).toEqual(['entrega_sin_efectivo'])
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(false)
  })

  it('pagos que no suman el total', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 600, tarjeta: 300 }) }))
    expect(r.errores).toEqual(['no_suma_total'])
    expect(r.falta).toBe(100)
    expect(r.valido).toBe(false)
  })

  it('fiado parcial exige cliente', () => {
    const sinCliente = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 500, fiado: 1000 }) }))
    expect(sinCliente.errores).toEqual(['fiado_sin_cliente'])
    const conCliente = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 500, fiado: 1000 }), clienteFiadoId: 'cli-1' }))
    expect(conCliente.valido).toBe(true)
  })

  it('fiado con el módulo apagado se rechaza', () => {
    const r = calcularCobro(entrada({
      total: 1000,
      importes: importes({ fiado: 1000 }),
      clienteFiadoId: 'cli-1',
      fiadoHabilitado: false,
    }))
    expect(r.errores).toEqual(['fiado_deshabilitado'])
    expect(r.valido).toBe(false)
  })

  it('rechaza importes con decimales', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 10.5 }) }))
    expect(r.errores).toEqual(['importe_invalido'])
    expect(r.valido).toBe(false)
  })

  it('rechaza una entrega en efectivo que no es un entero', () => {
    for (const efectivoEntregado of [Number.NaN, 1000.5]) {
      const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 1000 }), efectivoEntregado }))
      expect(r.errores).toEqual(['importe_invalido'])
      expect(r.valido).toBe(false)
    }
  })

  it('rechaza importes negativos', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 1100, tarjeta: -100 }) }))
    expect(r.errores).toEqual(['importe_invalido'])
    expect(r.valido).toBe(false)
  })

  it('una venta de total 0 no es válida', () => {
    const r = calcularCobro(entrada({ total: 0, importes: importes({}) }))
    expect(r.errores).toEqual(['venta_vacia'])
    expect(r.valido).toBe(false)
  })
})

describe('efectivoRestante', () => {
  it('el efectivo es lo que falta después de los otros medios', () => {
    expect(efectivoRestante(3000, { transferencia: 0, tarjeta: 1000, fiado: 500 })).toBe(1500)
  })

  it('nunca es negativo', () => {
    expect(efectivoRestante(1000, { transferencia: 2000, tarjeta: 0, fiado: 0 })).toBe(0)
  })
})

describe('pagosAEnviar', () => {
  it('manda sólo los medios con importe y el cliente sólo en el fiado', () => {
    expect(pagosAEnviar(importes({ efectivo: 500, fiado: 1000 }), 'cli-1')).toEqual([
      { medio: 'efectivo', importe: 500, cliente_id: null },
      { medio: 'fiado', importe: 1000, cliente_id: 'cli-1' },
    ])
  })
})

describe('esPesoEntero', () => {
  it('acepta sólo enteros no negativos', () => {
    expect(esPesoEntero(0)).toBe(true)
    expect(esPesoEntero(1500)).toBe(true)
    expect(esPesoEntero(1.5)).toBe(false)
    expect(esPesoEntero(-1)).toBe(false)
    expect(esPesoEntero(Number.NaN)).toBe(false)
  })
})
