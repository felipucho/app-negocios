import type { KioscoResumen } from './operador'

/** Lo que muestra la lista o un contador de Inicio. Viaja en la dirección: #/kioscos?filtro=… */
export const FILTROS = ['todos', 'vendio_hoy', 'sin_actividad', 'nunca_vendio', 'recordatorio_hoy', 'alta_mes'] as const
export type Filtro = (typeof FILTROS)[number]

export const TEXTO_FILTRO: Record<Filtro, string> = {
  todos: 'Todos',
  vendio_hoy: 'Vendió hoy',
  sin_actividad: 'Sin actividad hace 7 días o más',
  nunca_vendio: 'Nunca vendió',
  recordatorio_hoy: 'Con recordatorio de hoy',
  alta_mes: 'Altas del mes',
}

export type Tipo = 'reales' | 'demo' | 'todos'
export type Orden = 'nombre' | 'nuevos' | 'antiguos' | 'actividad'

export interface FiltrosLista {
  texto: string
  filtro: Filtro
  tipo: Tipo
  orden: Orden
}

export const FILTROS_INICIALES: FiltrosLista = { texto: '', filtro: 'todos', tipo: 'reales', orden: 'nombre' }

const ZONA = 'America/Argentina/Buenos_Aires'
const DIA_MS = 86_400_000

export function aFiltro(valor: string | null): Filtro {
  return FILTROS.find((f) => f === valor) ?? 'todos'
}

export function cumpleFiltro(k: KioscoResumen, filtro: Filtro): boolean {
  switch (filtro) {
    case 'todos':
      return true
    case 'vendio_hoy':
      return k.ventasHoy > 0
    case 'sin_actividad':
      return k.ultimaVenta !== null && k.ventas7d === 0
    case 'nunca_vendio':
      return k.ultimaVenta === null
    case 'recordatorio_hoy':
      return k.recordatoriosHoy > 0
    case 'alta_mes':
      return k.altaEsteMes
  }
}

function comparadorDe(orden: Orden): (a: KioscoResumen, b: KioscoResumen) => number {
  switch (orden) {
    case 'nombre':
      return (a, b) => a.nombreVisible.localeCompare(b.nombreVisible, 'es')
    case 'nuevos':
      return (a, b) => b.creado.localeCompare(a.creado)
    case 'antiguos':
      return (a, b) => a.creado.localeCompare(b.creado)
    case 'actividad':
      return (a, b) => (b.ultimaVenta ?? '').localeCompare(a.ultimaVenta ?? '')
  }
}

/** La lista con tipo, filtro, texto y orden aplicados. Los demo no aparecen salvo que se pidan. */
export function filtrarKioscos(lista: KioscoResumen[], f: FiltrosLista): KioscoResumen[] {
  const texto = f.texto.trim().toLocaleLowerCase('es')
  return lista
    .filter((k) => f.tipo === 'todos' || k.esDemo === (f.tipo === 'demo'))
    .filter((k) => cumpleFiltro(k, f.filtro))
    .filter((k) => !texto || [k.nombre, k.nombreVisible, k.jefeEmail ?? '', k.cajaEmail ?? ''].some((c) => c.toLocaleLowerCase('es').includes(texto)))
    .sort(comparadorDe(f.orden))
}

/** Los contadores de Inicio, sin los kioscos demo. */
export function contadores(lista: KioscoResumen[]) {
  const reales = lista.filter((k) => !k.esDemo)
  return {
    altasMes: reales.filter((k) => cumpleFiltro(k, 'alta_mes')).length,
    sinActividad: reales.filter((k) => cumpleFiltro(k, 'sin_actividad')).length,
    nuncaVendio: reales.filter((k) => cumpleFiltro(k, 'nunca_vendio')).length,
    recordatoriosHoy: reales.filter((k) => cumpleFiltro(k, 'recordatorio_hoy')).length,
  }
}

/** Día calendario de Buenos Aires (AAAA-MM-DD) del momento dado: milisegundos o fecha ISO. */
export function diaDe(momento: string | number): string {
  return new Date(momento).toLocaleDateString('en-CA', { timeZone: ZONA })
}

export function hoyDeBuenosAires(): string {
  return diaDe(Date.now())
}

/** Días de a a b, con fechas AAAA-MM-DD. */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DIA_MS)
}

function partes(fecha: string): [number, number, number] {
  const [anio = 0, mes = 0, dia = 0] = fecha.split('-').map(Number)
  return [anio, mes, dia]
}

/** "3 meses", o "12 días" si todavía no cumplió un mes. */
export function antiguedad(desde: string, hoy: string): string {
  const [anioDesde, mesDesde, diaDesde] = partes(desde)
  const [anioHoy, mesHoy, diaHoy] = partes(hoy)
  const meses = (anioHoy - anioDesde) * 12 + (mesHoy - mesDesde) - (diaHoy < diaDesde ? 1 : 0)
  if (meses >= 1) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const dias = Math.max(0, diasEntre(desde, hoy))
  return `${dias} ${dias === 1 ? 'día' : 'días'}`
}

/** "hoy", "hace 9 días" o "nunca vendió", según la última venta. */
export function actividadTexto(ultimaVenta: string | null, hoy: string): string {
  if (ultimaVenta === null) return 'nunca vendió'
  const dias = diasEntre(diaDe(ultimaVenta), hoy)
  return dias <= 0 ? 'hoy' : `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/** Uso según los días con ventas de los últimos 30. Propuesta: 15 o más días es uso fuerte. */
export function usoTexto(diasConVentas: number): string {
  if (diasConVentas >= 15) return 'En uso'
  return diasConVentas >= 1 ? 'Poco uso' : 'Sin uso'
}

/** "16/07/2026", desde una fecha AAAA-MM-DD o desde un momento ISO. */
export function formatoFecha(valor: string): string {
  const [anio = '', mes = '', dia = ''] = (valor.length === 10 ? valor : diaDe(valor)).split('-')
  return `${dia}/${mes}/${anio}`
}
