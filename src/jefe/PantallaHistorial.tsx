import { useEffect, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import { PAGINA_HISTORIAL, type FilaHistorial, type QuienHistorial, type ServicioJefe, type TipoHistorial } from './jefe'

const TITULO: Record<TipoHistorial, string> = {
  alta_producto: 'Alta de producto',
  cambio_precio: 'Cambio de precio',
  cambio_producto: 'Cambio de producto',
  anulacion: 'Anulación',
  apertura_turno: 'Apertura de turno',
  cierre_turno: 'Cierre de turno',
}

const QUIEN: Record<QuienHistorial, string> = {
  caja: 'Caja',
  jefe: 'Jefe',
  fuera_de_la_app: 'Fuera de la app',
}

const pesos = (v: unknown) => (typeof v === 'number' ? formatearPesos(v) : '—')
const texto = (v: unknown) => (v === null || v === undefined ? 'sin código' : String(v))

function cambiosDeProducto(antes: Record<string, unknown>, despues: Record<string, unknown>): string {
  const partes: string[] = []
  if ('nombre' in despues) partes.push(`nombre "${String(antes.nombre)}" → "${String(despues.nombre)}"`)
  if ('activo' in despues) partes.push(despues.activo === true ? 'reactivado' : 'desactivado')
  if ('codigo_barras' in despues) partes.push(`código ${texto(antes.codigo_barras)} → ${texto(despues.codigo_barras)}`)
  return partes.join(', ')
}

/** Texto de una fila. El historial nunca trae datos de clientes. */
export function describirFila(f: FilaHistorial): string {
  const antes = f.valorAnterior ?? {}
  const despues = f.valorNuevo ?? {}
  const nombre = f.nombreProducto ?? (typeof despues.nombre === 'string' ? despues.nombre : 'Producto')
  switch (f.tipo) {
    case 'alta_producto':
      return `${nombre} a ${pesos(despues.precio)}${despues.creado_en_caja === true ? ' (creado en caja)' : ''}`
    case 'cambio_precio':
      return `${nombre}: ${pesos(antes.precio)} → ${pesos(despues.precio)}`
    case 'cambio_producto':
      return `${nombre}: ${cambiosDeProducto(antes, despues)}`
    case 'anulacion':
      return `Venta de ${pesos(antes.total)}. Motivo: ${f.motivo ?? ''}`
    case 'apertura_turno':
      return 'Turno abierto'
    case 'cierre_turno':
      return despues.automatico === true ? 'Cerrado solo al abrir otro turno' : 'Turno cerrado'
  }
}

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})

export interface PropsPantallaHistorial {
  servicio: Pick<ServicioJefe, 'leerHistorial'>
}

/** Historial de auditoría completo (sólo jefe; la base sólo se lo muestra al jefe). */
export function PantallaHistorial({ servicio }: PropsPantallaHistorial) {
  const [filas, setFilas] = useState<FilaHistorial[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar(desde: number) {
    setCargando(true)
    setError(null)
    try {
      const pagina = await servicio.leerHistorial(desde)
      // Una fila nueva entre páginas corre el offset y repite la última: se descarta por id.
      setFilas((actuales) =>
        desde === 0 ? pagina : [...actuales, ...pagina.filter((f) => !actuales.some((a) => a.id === f.id))],
      )
      setHayMas(pagina.length === PAGINA_HISTORIAL)
    } catch {
      setError('No se pudo leer el historial. Revisá la conexión.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar(0)
  }, [servicio])

  return (
    <section className="historial">
      <h2>Historial</h2>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <table aria-label="Historial">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Qué</th>
            <th>Detalle</th>
            <th>Quién</th>
            <th>PC</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{formatoFecha.format(new Date(f.fecha))}</td>
              <td>{TITULO[f.tipo]}</td>
              <td>{describirFila(f)}</td>
              <td>{QUIEN[f.quien]}</td>
              <td>{f.prefijo ? `PC ${f.prefijo}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cargando && <p>Cargando…</p>}
      {!cargando && hayMas && (
        <button type="button" onClick={() => void cargar(filas.length)}>
          Ver más
        </button>
      )}
    </section>
  )
}
