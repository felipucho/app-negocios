import { useEffect, useState } from 'react'
import {
  mensajeOperador,
  type EfectoEdicionPlan,
  type ModuloDePlan,
  type PlanOperador,
  type ServicioOperador,
} from './operador'

interface Props {
  servicio: ServicioOperador
  alGuardar(): void
}

/** Nombre, descripción y módulos de cada plan. Antes de guardar se ve qué cambia en los kioscos que lo tienen. */
export function EditorPlanes({ servicio, alGuardar }: Props) {
  const [planes, setPlanes] = useState<PlanOperador[] | null>(null)
  const [planId, setPlanId] = useState('')
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    servicio.listarPlanes().then(
      (lista) => {
        if (vigente) {
          setPlanes(lista)
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
  }, [servicio, version])

  const plan = planes?.find((p) => p.id === planId)

  return (
    <section aria-labelledby="planes-titulo" className="operador__bloques">
      <h2 id="planes-titulo">Planes</h2>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {planes === null && !error && <p className="cargando">Cargando…</p>}
      {planes && (
        <div className="operador__form">
          <label>
            Plan
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Elegí un plan</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {plan && (
        <FormularioPlan
          key={plan.id}
          servicio={servicio}
          plan={plan}
          alGuardar={() => {
            setVersion((n) => n + 1)
            alGuardar()
          }}
        />
      )}
    </section>
  )
}

interface FormularioProps {
  servicio: ServicioOperador
  plan: PlanOperador
  alGuardar(): void
}

function FormularioPlan({ servicio, plan, alGuardar }: FormularioProps) {
  const [modulos, setModulos] = useState<ModuloDePlan[] | null>(null)
  const [elegidos, setElegidos] = useState<string[]>([])
  const [nombre, setNombre] = useState(plan.nombre)
  const [descripcion, setDescripcion] = useState(plan.descripcion)
  const [motivo, setMotivo] = useState('')
  const [efectos, setEfectos] = useState<EfectoEdicionPlan[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const motivoListo = motivo.trim().length >= 3

  useEffect(() => {
    let vigente = true
    servicio.modulosDePlan(plan.id).then(
      (lista) => {
        if (vigente) {
          setModulos(lista)
          setElegidos(lista.filter((m) => m.enPlan).map((m) => m.clave))
        }
      },
      (e) => {
        if (vigente) setError(mensajeOperador(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, plan.id])

  if (!modulos) {
    return error ? (
      <p role="alert" className="aviso aviso--error">
        {error}
      </p>
    ) : (
      <p className="cargando">Cargando…</p>
    )
  }

  // La base rechaza igual un plan sin lo que requieren sus módulos; acá se avisa antes.
  const faltan = [...new Set(modulos.filter((m) => elegidos.includes(m.clave)).flatMap((m) => m.requiere))].filter(
    (r) => !elegidos.includes(r),
  )
  const agrega = modulos.filter((m) => !m.enPlan && elegidos.includes(m.clave)).map((m) => m.clave)
  const saca = modulos.filter((m) => m.enPlan && !elegidos.includes(m.clave)).map((m) => m.clave)

  function alternar(clave: string) {
    setElegidos((lista) => (lista.includes(clave) ? lista.filter((c) => c !== clave) : [...lista, clave]))
    setEfectos(null)
  }

  async function verCambio() {
    setGuardando(true)
    setError('')
    try {
      setEfectos(await servicio.previsualizarGuardarPlan(plan.id, elegidos))
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await servicio.guardarPlan(
        plan.id,
        { nombre: nombre.trim(), descripcion: descripcion.trim(), modulos: elegidos },
        motivo.trim(),
      )
      setModulos((lista) => lista && lista.map((m) => ({ ...m, enPlan: elegidos.includes(m.clave) })))
      setEfectos(null)
      setMotivo('')
      alGuardar()
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="operador__bloques">
      <div className="operador__form">
        <label>
          Nombre
          <input maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Descripción
          <input maxLength={200} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
      </div>
      <section aria-labelledby="plan-modulos-titulo">
        <h3 id="plan-modulos-titulo">Módulos del plan</h3>
        <ul className="operador__lista">
          {modulos.map((m) => (
            <li key={m.clave}>
              <label className="operador__casilla">
                <input type="checkbox" checked={elegidos.includes(m.clave)} onChange={() => alternar(m.clave)} />
                {m.clave}
              </label>
              <span>
                {m.descripcion}
                {m.requiere.length > 0 && ` Requiere: ${m.requiere.join(', ')}.`}
              </span>
            </li>
          ))}
        </ul>
        {faltan.length > 0 && <p>El plan también tiene que incluir: {faltan.join(', ')}.</p>}
      </section>
      <label className="operador__motivo">
        Motivo del cambio
        <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {!motivoListo && <p>Escribí el motivo (3 letras o más) para guardar.</p>}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="button" disabled={guardando || faltan.length > 0} onClick={() => void verCambio()}>
        Ver qué cambia
      </button>
      {efectos && (
        <>
          <p>
            Agrega al plan: {agrega.join(', ') || 'nada'} · Saca del plan: {saca.join(', ') || 'nada'}
          </p>
          {efectos.length === 0 ? (
            <p>Ningún kiosco gana ni pierde módulos.</p>
          ) : (
            <ul>
              {cambiosPorKiosco(efectos).map((c) => (
                <li key={c.negocioId}>{c.texto}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={guardando || !motivoListo || nombre.trim() === ''}
            onClick={() => void guardar()}
          >
            Guardar plan
          </button>
        </>
      )}
    </div>
  )
}

/** Una línea por kiosco. Lo que pierde y estaba prendido se apaga al guardar. */
function cambiosPorKiosco(efectos: EfectoEdicionPlan[]): { negocioId: string; texto: string }[] {
  return [...new Set(efectos.map((e) => e.negocioId))].map((negocioId) => {
    const propios = efectos.filter((e) => e.negocioId === negocioId)
    const gana = propios.filter((e) => e.efecto === 'gana').map((e) => e.clave)
    const pierde = propios.filter((e) => e.efecto === 'pierde').map((e) => (e.uso ? `${e.clave} (se apaga)` : e.clave))
    return {
      negocioId,
      texto: `${propios[0].kiosco}: gana ${gana.join(', ') || 'nada'} · pierde ${pierde.join(', ') || 'nada'}`,
    }
  })
}
