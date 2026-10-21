import { MEDIOS, type Medio } from '../tipos'

export type ImportesPorMedio = Record<Medio, number>

/** Mismos códigos que devuelve confirmar_venta (tarea 10). */
export type ErrorCobro =
  | 'importe_invalido'
  | 'venta_vacia'
  | 'no_suma_total'
  | 'efectivo_insuficiente'
  | 'entrega_sin_efectivo'
  | 'fiado_deshabilitado'
  | 'fiado_sin_cliente'

export interface EntradaCobro {
  total: number
  /** Lo aplicado al total por cada medio. 0 = medio no usado. */
  importes: ImportesPorMedio
  /** Lo que el cliente entrega en efectivo. null = no se informó (se toma igual a la parte en efectivo). */
  efectivoEntregado: number | null
  clienteFiadoId: string | null
  /** Módulo fiado activo para el negocio. */
  fiadoHabilitado: boolean
}

export interface ResultadoCobro {
  suma: number
  /** total − suma: positivo falta, negativo sobra. */
  falta: number
  vuelto: number
  errores: ErrorCobro[]
  valido: boolean
}

export interface PagoAEnviar {
  medio: Medio
  importe: number
  cliente_id: string | null
}

export function esPesoEntero(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0
}

export function calcularCobro(e: EntradaCobro): ResultadoCobro {
  const valores = MEDIOS.map((m) => e.importes[m])
  const efectivo = e.importes.efectivo
  const entregado = e.efectivoEntregado ?? efectivo
  if (![e.total, entregado, ...valores].every(esPesoEntero)) {
    return { suma: 0, falta: 0, vuelto: 0, errores: ['importe_invalido'], valido: false }
  }

  const errores: ErrorCobro[] = []
  const suma = valores.reduce((a, b) => a + b, 0)
  if (e.total === 0) errores.push('venta_vacia')
  if (suma !== e.total) errores.push('no_suma_total')
  if (efectivo === 0 && entregado > 0) errores.push('entrega_sin_efectivo')
  else if (entregado < efectivo) errores.push('efectivo_insuficiente')
  if (e.importes.fiado > 0 && !e.fiadoHabilitado) errores.push('fiado_deshabilitado')
  else if (e.importes.fiado > 0 && !e.clienteFiadoId) errores.push('fiado_sin_cliente')

  const vuelto = efectivo > 0 && entregado > efectivo ? entregado - efectivo : 0
  return { suma, falta: e.total - suma, vuelto, errores, valido: errores.length === 0 }
}

/** El efectivo es el resto: total menos los otros medios, nunca negativo. */
export function efectivoRestante(total: number, otros: Omit<ImportesPorMedio, 'efectivo'>): number {
  return Math.max(0, total - otros.transferencia - otros.tarjeta - otros.fiado)
}

/** Lo que viaja a confirmar_venta: sólo medios con importe; cliente sólo en el fiado. */
export function pagosAEnviar(importes: ImportesPorMedio, clienteFiadoId: string | null): PagoAEnviar[] {
  return MEDIOS.filter((m) => importes[m] > 0).map((m) => ({
    medio: m,
    importe: importes[m],
    cliente_id: m === 'fiado' ? clienteFiadoId : null,
  }))
}
