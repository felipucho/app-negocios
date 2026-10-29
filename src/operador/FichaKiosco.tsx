import { useEffect, useState } from 'react'
import { CerrarSesiones } from './CerrarSesiones'
import { DatosDelKiosco } from './DatosKiosco'
import { HistorialOperador } from './HistorialOperador'
import { RestablecerClave } from './RestablecerClave'
import {
  mensajeOperador,
  type EfectoPlan,
  type FichaKiosco,
  type KioscoResumen,
  type ModuloDeKiosco,
  type PlanDeKiosco,
  type PlanOperador,
  type ServicioOperador,
} from './operador'
import { actividadTexto, antiguedad, formatoFecha, hoyDeBuenosAires, usoTexto } from './resumen'
import { aHash, type Pestania } from './ruta'

const PESTANIAS: { valor: Pestania; texto: string }[] = [
  { valor: 'resumen', texto: 'Resumen' },
  { valor: 'datos', texto: 'Datos' },
  { valor: 'historial', texto: 'Historial' },
]

interface Props {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  kioscos: KioscoResumen[]
  pestania: Pestania
  version: number
  recargar(): void
}

/** Ficha de un kiosco: resumen, datos (con notas y recordatorios) e historial. */
export function FichaDelKiosco({ servicio, kiosco, kioscos, pestania, version, recargar }: Props) {
  const [ficha, setFicha] = useState<FichaKiosco | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    servicio.ficha(kiosco.negocioId).then(
      (f) => {
        if (vigente) {
          setFicha(f)
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
  }, [servicio, kiosco.negocioId, version])

  const hoy = hoyDeBuenosAires()

  return (
    <section aria-labelledby="ficha-titulo" className="operador__bloques operador__ficha">
      <p>
        <a href={aHash({ tipo: 'kioscos', filtro: null })}>← Kioscos</a>
      </p>
      <h2 id="ficha-titulo">{kiosco.nombreVisible}</h2>
      <nav aria-label="Pestañas de la ficha" className="operador__nav">
        {PESTANIAS.map((p) => (
          <a
            key={p.valor}
            href={aHash({ tipo: 'kiosco', negocioId: kiosco.negocioId, pestania: p.valor })}
            aria-current={p.valor === pestania ? 'page' : undefined}
          >
            {p.texto}
          </a>
        ))}
      </nav>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {pestania === 'resumen' && (
        <Resumen
          key={kiosco.negocioId}
          servicio={servicio}
          kiosco={kiosco}
          ficha={ficha}
          hoy={hoy}
          version={version}
          alCambiar={recargar}
        />
      )}
      {pestania === 'datos' &&
        (ficha ? (
          <DatosDelKiosco servicio={servicio} kiosco={kiosco} ficha={ficha} alCambiar={recargar} />
        ) : (
          <p className="cargando">Cargando…</p>
        ))}
      {pestania === 'historial' && (
        <HistorialOperador servicio={servicio} kioscos={kioscos} negocioFijo={kiosco.negocioId} version={version} />
      )}
    </section>
  )
}

interface ResumenProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  ficha: FichaKiosco | null
  hoy: string
  version: number
  alCambiar(): void
}

function Resumen({ servicio, kiosco, ficha, hoy, version, alCambiar }: ResumenProps) {
  const [motivo, setMotivo] = useState('')
  const motivoLimpio = motivo.trim()
  const motivoListo = motivoLimpio.length >= 3

  return (
    <div className="operador__bloques">
      <section aria-labelledby="cliente-titulo">
        <h3 id="cliente-titulo">Cliente</h3>
        <p>
          Cliente hace {antiguedad(kiosco.clienteDesde, hoy)} (desde el {formatoFecha(kiosco.clienteDesde)}).
        </p>
        <p>Uso: {usoTexto(kiosco.diasConVentas30d)}</p>
        <p>Abono: sin registrar (se carga en la fase 5).</p>
      </section>
      <label className="operador__motivo">
        Motivo del cambio
        <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {!motivoListo && <p>Escribí el motivo (3 letras o más) para cambiar el plan o los módulos.</p>}
      <PlanDelKiosco
        servicio={servicio}
        kiosco={kiosco}
        ficha={ficha}
        motivo={motivoLimpio}
        motivoListo={motivoListo}
        alCambiar={alCambiar}
      />
      <ModulosDelKiosco
        servicio={servicio}
        kiosco={kiosco}
        version={version}
        motivo={motivoLimpio}
        motivoListo={motivoListo}
        alCambiar={alCambiar}
      />
      <section aria-labelledby="cuentas-titulo">
        <h3 id="cuentas-titulo">Cuentas</h3>
        <ul>
          <li>Jefe: {kiosco.jefeEmail ?? '—'}</li>
          <li>Caja: {kiosco.cajaEmail ?? '—'}</li>
        </ul>
      </section>
      <RestablecerClave servicio={servicio} negocioId={kiosco.negocioId} nombreKiosco={kiosco.nombreVisible} />
      <CerrarSesiones servicio={servicio} negocioId={kiosco.negocioId} nombreKiosco={kiosco.nombreVisible} />
      <section aria-labelledby="pcs-titulo">
        <h3 id="pcs-titulo">PCs ({kiosco.pcs})</h3>
        {ficha ? (
          <ul>
            {ficha.pcs.map((p) => (
              <li key={p.prefijo}>
                {p.prefijo} · alta el {formatoFecha(p.creado)} ·{' '}
                {p.turnoAbierto ? 'turno abierto' : 'sin turno abierto'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cargando">Cargando…</p>
        )}
      </section>
      <section aria-labelledby="actividad-titulo">
        <h3 id="actividad-titulo">Actividad</h3>
        <ul>
          <li>Última venta: {actividadTexto(kiosco.ultimaVenta, hoy)}</li>
          <li>
            Ventas: hoy {kiosco.ventasHoy} · últimos 7 días {kiosco.ventas7d} · últimos 30 días {kiosco.ventas30d}
          </li>
          <li>Días con ventas en los últimos 30: {kiosco.diasConVentas30d}</li>
        </ul>
      </section>
    </div>
  )
}

interface PlanProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  ficha: FichaKiosco | null
  motivo: string
  motivoListo: boolean
  alCambiar(): void
}

/** Cambiar el plan. Antes de confirmar se ve qué módulos gana y cuáles pierde. */
function PlanDelKiosco({ servicio, kiosco, ficha, motivo, motivoListo, alCambiar }: PlanProps) {
  const [planes, setPlanes] = useState<PlanOperador[] | null>(null)
  const [elegido, setElegido] = useState('')
  const [efectos, setEfectos] = useState<EfectoPlan[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    servicio.listarPlanes().then(
      (lista) => {
        if (vigente) setPlanes(lista.filter((p) => p.activo))
      },
      (e) => {
        if (vigente) setError(mensajeOperador(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio])

  const actual = planes?.find((p) => p.codigo === ficha?.plan?.codigo)
  const seleccion = elegido || (actual?.id ?? '')
  const cambia = seleccion !== '' && seleccion !== actual?.id

  async function verCambio() {
    setGuardando(true)
    setError('')
    try {
      setEfectos(await servicio.previsualizarPlan(kiosco.negocioId, seleccion))
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarPlan() {
    setGuardando(true)
    setError('')
    try {
      await servicio.fijarPlan(kiosco.negocioId, seleccion, motivo)
      setEfectos(null)
      alCambiar()
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section aria-labelledby="plan-titulo">
      <h3 id="plan-titulo">Plan</h3>
      <p>{ficha ? textoPlan(ficha.plan) : 'Cargando…'}</p>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {planes === null && !error && <p className="cargando">Cargando…</p>}
      {planes && (
        <div className="operador__form">
          <label>
            Elegir plan
            <select
              value={seleccion}
              onChange={(e) => {
                setElegido(e.target.value)
                setEfectos(null)
              }}
            >
              <option value="">Elegí un plan</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          {cambia && (
            <>
              <button type="button" disabled={guardando} onClick={() => void verCambio()}>
                Ver qué cambia
              </button>
              {efectos && (
                <>
                  <p>Gana: {listaEfecto(efectos, 'gana')}</p>
                  <p>Pierde: {listaEfecto(efectos, 'pierde')}</p>
                </>
              )}
              <button type="button" disabled={guardando || !motivoListo} onClick={() => void cambiarPlan()}>
                Cambiar plan
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

interface ModulosProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  version: number
  motivo: string
  motivoListo: boolean
  alCambiar(): void
}

/** Plan, extras y uso de cada módulo. Cada cambio pide motivo y queda en el historial. */
function ModulosDelKiosco({ servicio, kiosco, version, motivo, motivoListo, alCambiar }: ModulosProps) {
  const [modulos, setModulos] = useState<ModuloDeKiosco[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const bloqueado = guardando || !motivoListo

  useEffect(() => {
    let vigente = true
    servicio.modulosDeKiosco(kiosco.negocioId).then(
      (lista) => {
        if (vigente) {
          setModulos(lista)
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
  }, [servicio, kiosco.negocioId, version])

  async function ejecutar(accion: () => Promise<void>) {
    setGuardando(true)
    setError('')
    try {
      await accion()
      alCambiar()
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  function fijarExcepcion(clave: string, permite: boolean | null) {
    return ejecutar(() => servicio.fijarExcepcion(kiosco.negocioId, clave, permite, motivo))
  }

  return (
    <section aria-labelledby="modulos-titulo">
      <h3 id="modulos-titulo">Módulos</h3>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {!modulos && !error && <p className="cargando">Cargando…</p>}
      <ul className="operador__lista">
        {modulos?.map((m) => (
          <li key={m.clave}>
            <strong>{m.descripcion}</strong>
            <span>{estadoModulo(m)}</span>
            <label className="operador__casilla">
              <input
                type="checkbox"
                checked={m.uso}
                disabled={bloqueado || !m.derecho}
                onChange={() => void ejecutar(() => servicio.cambiarModulo(kiosco.negocioId, m.clave, !m.uso, motivo))}
              />
              Prendido
            </label>
            {!m.derecho && <span>No está en el plan</span>}
            {m.faltan.length > 0 && <span>Antes prendé: {m.faltan.join(', ')}</span>}
            {m.excepcion !== null ? (
              <button type="button" disabled={bloqueado} onClick={() => void fijarExcepcion(m.clave, null)}>
                Volver al plan
              </button>
            ) : (
              <button type="button" disabled={bloqueado} onClick={() => void fijarExcepcion(m.clave, !m.derecho)}>
                {m.derecho ? 'Quitar del plan' : 'Agregar como extra'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function textoPlan(plan: PlanDeKiosco | null): string {
  if (!plan) return 'Sin plan'
  const extras = plan.extras > 0 ? ` · ${plan.extras} ${plan.extras === 1 ? 'extra' : 'extras'}` : ''
  const quitados = plan.quitados > 0 ? ` · ${plan.quitados} ${plan.quitados === 1 ? 'quitado' : 'quitados'}` : ''
  return `Plan: ${plan.nombre}${extras}${quitados}`
}

function listaEfecto(efectos: EfectoPlan[], efecto: 'gana' | 'pierde'): string {
  const nombres = efectos
    .filter((e) => e.efecto === efecto)
    .map((e) => (efecto === 'pierde' && e.uso ? `${e.descripcion} (se apaga)` : e.descripcion))
  return nombres.join(', ') || 'ninguno'
}

function estadoModulo(m: ModuloDeKiosco): string {
  if (m.excepcion === 'agregado') return 'Extra agregado'
  if (m.excepcion === 'quitado') return 'Quitado del plan'
  return m.enPlan ? 'Incluido en el plan' : 'No incluido en el plan'
}
