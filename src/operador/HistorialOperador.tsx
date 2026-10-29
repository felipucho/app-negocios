import { useEffect, useState } from 'react'
import {
  mensajeOperador,
  type EntradaHistorial,
  type KioscoResumen,
  type ServicioOperador,
} from './operador'

const ACCIONES: { valor: string; texto: string }[] = [
  { valor: 'alta_kiosco', texto: 'Alta del kiosco' },
  { valor: 'datos_kiosco', texto: 'Datos del kiosco' },
  { valor: 'modulo', texto: 'Módulo' },
  { valor: 'cambio_modulo', texto: 'Módulo' },
  { valor: 'cambio_plan', texto: 'Cambio de plan' },
  { valor: 'plan_definido', texto: 'Plan definido' },
  { valor: 'excepcion_modulo', texto: 'Extra o quita de módulo' },
  { valor: 'cambio_limite_fiado', texto: 'Límite de fiado' },
  { valor: 'restablecer_clave', texto: 'Restablecer clave' },
  { valor: 'cerrar_sesiones', texto: 'Cerrar sesiones' },
  { valor: 'nota_agregada', texto: 'Nota agregada' },
  { valor: 'nota_borrada', texto: 'Nota borrada' },
  { valor: 'recordatorio_agregado', texto: 'Recordatorio agregado' },
  { valor: 'recordatorio_hecho', texto: 'Recordatorio hecho' },
]

interface Filtros {
  negocioId: string
  accion: string
  desde: string
  hasta: string
}

interface Props {
  servicio: ServicioOperador
  kioscos: KioscoResumen[]
  negocioFijo?: string
  version: number
}

/** Lo que hizo el operador, con filtros por kiosco, acción y fechas. En una ficha, el kiosco viene fijo. */
export function HistorialOperador({ servicio, kioscos, negocioFijo, version }: Props) {
  const [filtros, setFiltros] = useState<Filtros>({ negocioId: negocioFijo ?? '', accion: '', desde: '', hasta: '' })
  const [entradas, setEntradas] = useState<EntradaHistorial[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    servicio
      .historial({
        negocioId: filtros.negocioId || undefined,
        accion: filtros.accion || undefined,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
      })
      .then(
        (lista) => {
          if (vigente) {
            setEntradas(lista)
            setError('')
          }
        },
        (e) => {
          if (vigente) setError(mensajeOperador(e))
        },
      )
    return () => {
      vigente = false
    }
  }, [servicio, filtros, version])

  function cambiar(cambio: Partial<Filtros>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  return (
    <section aria-labelledby="historial-titulo" className="operador__bloques">
      {!negocioFijo && <h2 id="historial-titulo">Historial</h2>}
      <form className="operador__filtros" aria-label="Filtros del historial" onSubmit={(e) => e.preventDefault()}>
        {!negocioFijo && (
          <label>
            Kiosco
            <select value={filtros.negocioId} onChange={(e) => cambiar({ negocioId: e.target.value })}>
              <option value="">Todos</option>
              {kioscos.map((k) => (
                <option key={k.negocioId} value={k.negocioId}>
                  {k.nombreVisible}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Acción
          <select value={filtros.accion} onChange={(e) => cambiar({ accion: e.target.value })}>
            <option value="">Todas</option>
            {ACCIONES.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
        </label>
        <label>
          Hasta
          <input type="date" value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
        </label>
      </form>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {!entradas && !error && <p className="cargando">Cargando…</p>}
      {entradas?.length === 0 && <p>No hay movimientos con esos filtros.</p>}
      <ol className="operador__lista">
        {entradas?.map((e) => (
          <li key={e.id}>
            <strong>
              {etiquetaAccion(e.accion)}
              {/* Los cambios de un plan no son de un kiosco: kiosco viene nulo. */}
              {e.kiosco && ` · ${e.kiosco}`}
            </strong>
            <span>
              {fechaHora(e.fecha)} · {e.operador}
            </span>
            {e.motivo && <span>Motivo: {e.motivo}</span>}
            {(e.valorAnterior || e.valorNuevo) && (
              <span>
                {resumenValores(e.valorAnterior)} → {resumenValores(e.valorNuevo)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function etiquetaAccion(accion: string): string {
  return ACCIONES.find((a) => a.valor === accion)?.texto ?? accion
}

function resumenValores(valores: Record<string, unknown> | null): string {
  if (!valores) return '—'
  return Object.entries(valores)
    .map(([clave, valor]) => `${clave}: ${valor === null ? '—' : String(valor)}`)
    .join(', ')
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}
