import { describe, expect, it } from 'vitest'
import type { KioscoResumen } from './operador'
import { actividadTexto, antiguedad, contadores, FILTROS_INICIALES, filtrarKioscos, formatoFecha } from './resumen'

function kiosco(extra: Partial<KioscoResumen>): KioscoResumen {
  return {
    negocioId: 'n-1',
    nombre: 'Kiosco',
    nombreVisible: 'Kiosco',
    jefeEmail: 'jefe@x.com',
    cajaEmail: 'caja@x.com',
    creado: '2026-07-16T12:00:00+00:00',
    clienteDesde: '2026-07-16',
    esDemo: false,
    etiquetas: [],
    pcs: 1,
    modulosActivos: 1,
    ventasHoy: 0,
    ventas7d: 0,
    ventas30d: 0,
    diasConVentas30d: 0,
    ultimaVenta: null,
    recordatoriosHoy: 0,
    altaEsteMes: false,
    ...extra,
  }
}

const LISTA = [
  kiosco({ negocioId: 'a', nombreVisible: 'Almacén Sur', ventasHoy: 3, ventas7d: 3, ultimaVenta: '2026-10-28T14:20:00+00:00' }),
  kiosco({ negocioId: 'b', nombreVisible: 'Bar Norte', ultimaVenta: '2026-10-10T10:00:00+00:00' }),
  kiosco({ negocioId: 'c', nombreVisible: 'Demo Lab', esDemo: true }),
  kiosco({ negocioId: 'd', nombreVisible: 'Nuevo', altaEsteMes: true, recordatoriosHoy: 1 }),
]

describe('filtrarKioscos', () => {
  it('oculta los demo salvo que se pidan', () => {
    expect(filtrarKioscos(LISTA, FILTROS_INICIALES).map((k) => k.negocioId)).not.toContain('c')
    expect(filtrarKioscos(LISTA, { ...FILTROS_INICIALES, tipo: 'demo' }).map((k) => k.negocioId)).toEqual(['c'])
  })

  it('busca por nombre o por mail', () => {
    expect(filtrarKioscos(LISTA, { ...FILTROS_INICIALES, texto: 'norte' }).map((k) => k.negocioId)).toEqual(['b'])
    expect(filtrarKioscos(LISTA, { ...FILTROS_INICIALES, texto: 'JEFE@X' })).toHaveLength(3)
  })

  it('pone los kioscos sin venta al final al ordenar por actividad', () => {
    const orden = filtrarKioscos(LISTA, { ...FILTROS_INICIALES, orden: 'actividad' }).map((k) => k.negocioId)
    expect(orden).toEqual(['a', 'b', 'd'])
  })

  it('aplica los filtros de actividad', () => {
    expect(filtrarKioscos(LISTA, { ...FILTROS_INICIALES, filtro: 'sin_actividad' }).map((k) => k.negocioId)).toEqual(['b'])
    expect(filtrarKioscos(LISTA, { ...FILTROS_INICIALES, filtro: 'nunca_vendio' }).map((k) => k.negocioId)).toEqual(['d'])
  })
})

describe('contadores', () => {
  it('cuenta sin los demo', () => {
    expect(contadores(LISTA)).toEqual({ altasMes: 1, sinActividad: 1, nuncaVendio: 1, recordatoriosHoy: 1 })
  })
})

describe('fechas', () => {
  it('antigüedad en meses calendario y en días antes del primer mes', () => {
    expect(antiguedad('2026-07-16', '2026-10-28')).toBe('3 meses')
    expect(antiguedad('2026-10-20', '2026-10-28')).toBe('8 días')
  })

  it('actividad sin ventas y formato de fecha', () => {
    expect(actividadTexto(null, '2026-10-28')).toBe('nunca vendió')
    expect(formatoFecha('2026-07-16')).toBe('16/07/2026')
  })
})
