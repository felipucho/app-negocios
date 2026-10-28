import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { ServicioTurno } from '../caja/PantallaCaja'
import { FECHA_HORA } from '../lib/fecha'
import { formatearPesos, parsearPesos } from '../lib/plata'
import {
  MENSAJES_MOVIMIENTOS_CAJA,
  mensajeMovimientosCaja,
  type MovimientoDelTurno,
  type ServicioMovimientosCaja,
  type TipoMovimientoCaja,
} from './movimientosCaja'

const ETIQUETA_TIPO: Record<TipoMovimientoCaja, string> = {
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  gasto: 'Gasto',
  pago_proveedor: 'Pago a proveedor',
}

const MENSAJE_LECTURA = 'No se pudieron leer los movimientos. Revisá la conexión.'

type EstadoTurno =
  | { tipo: 'cargando' }
  | { tipo: 'sin_turno' }
  | { tipo: 'fallo' }
  | { tipo: 'abierto'; turnoId: string }

export interface PropsPantallaMovimientos {
  servicio: ServicioMovimientosCaja
  turno: Pick<ServicioTurno, 'leer'>
}

/** Efectivo inicial y movimientos de caja del turno de esta PC (módulo movimientos_caja, spec 2026-10-27). */
export function PantallaMovimientos({ servicio, turno }: PropsPantallaMovimientos) {
  const [estadoTurno, setEstadoTurno] = useState<EstadoTurno>({ tipo: 'cargando' })
  const [movimientos, setMovimientos] = useState<MovimientoDelTurno[] | null>(null)
  const [fallaLista, setFallaLista] = useState(false)

  const [montoInicial, setMontoInicial] = useState('')
  const [guardandoMonto, setGuardandoMonto] = useState(false)
  const [errorMonto, setErrorMonto] = useState<string | null>(null)
  const [mensajeMonto, setMensajeMonto] = useState<string | null>(null)
  const enCursoMonto = useRef(false)

  const [tipo, setTipo] = useState<TipoMovimientoCaja>('ingreso')
  const [importe, setImporte] = useState('')
  const [detalle, setDetalle] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [errorMovimiento, setErrorMovimiento] = useState<string | null>(null)
  const [mensajeMovimiento, setMensajeMovimiento] = useState<string | null>(null)
  const enCursoRegistro = useRef(false)
  // Un reintento (error de red, doble clic) repite el id; si cambia un dato, es otro movimiento.
  const intento = useRef<{ clave: string; id: string } | null>(null)

  const turnoId = estadoTurno.tipo === 'abierto' ? estadoTurno.turnoId : null

  const cargarLista = useCallback(
    async (id: string) => {
      try {
        setMovimientos(await servicio.listarDelTurno(id))
        setFallaLista(false)
      } catch {
        setFallaLista(true)
      }
    },
    [servicio],
  )

  useEffect(() => {
    // vigente: una lectura que llega después de desmontar la pantalla no pisa el estado.
    let vigente = true
    turno.leer().then(
      (abierto) => {
        if (!vigente) return
        if (abierto) {
          setEstadoTurno({ tipo: 'abierto', turnoId: abierto.turnoId })
          void cargarLista(abierto.turnoId)
        } else {
          setEstadoTurno({ tipo: 'sin_turno' })
        }
      },
      () => {
        if (vigente) setEstadoTurno({ tipo: 'fallo' })
      },
    )
    return () => {
      vigente = false
    }
  }, [turno, cargarLista])

  async function guardarMontoInicial(e: FormEvent) {
    e.preventDefault()
    if (enCursoMonto.current) return
    setErrorMonto(null)
    setMensajeMonto(null)
    if (montoInicial.trim() === '') {
      setErrorMonto('Escribí el efectivo con el que arrancaste. Si no hubo, escribí 0.')
      return
    }
    const monto = parsearPesos(montoInicial)
    if (monto === null) {
      setErrorMonto('Escribí el efectivo en pesos enteros, sin centavos ni signo menos.')
      return
    }
    enCursoMonto.current = true
    setGuardandoMonto(true)
    try {
      await servicio.fijarMontoInicial(monto)
      setMensajeMonto('Efectivo inicial cargado.')
      if (turnoId) await cargarLista(turnoId)
    } catch (err) {
      setErrorMonto(mensajeMovimientosCaja(err))
    } finally {
      enCursoMonto.current = false
      setGuardandoMonto(false)
    }
  }

  async function registrarMovimiento(e: FormEvent) {
    e.preventDefault()
    if (enCursoRegistro.current) return
    setErrorMovimiento(null)
    setMensajeMovimiento(null)
    const pesos = parsearPesos(importe)
    // Vacío da 0 en parsearPesos: cae en el mismo aviso que un cero.
    if (!pesos) {
      setErrorMovimiento(MENSAJES_MOVIMIENTOS_CAJA.importe_invalido)
      return
    }
    const detalleLimpio = detalle.trim()
    if (detalleLimpio.length > 120) {
      setErrorMovimiento(MENSAJES_MOVIMIENTOS_CAJA.texto_invalido)
      return
    }
    const clave = JSON.stringify([tipo, pesos, detalleLimpio])
    const previo = intento.current
    const actual = previo?.clave === clave ? previo : { clave, id: crypto.randomUUID() }
    intento.current = actual
    enCursoRegistro.current = true
    setRegistrando(true)
    try {
      await servicio.registrar(actual.id, tipo, pesos, detalleLimpio || undefined)
      intento.current = null
      setImporte('')
      setDetalle('')
      setMensajeMovimiento('Movimiento registrado.')
      if (turnoId) await cargarLista(turnoId)
    } catch (err) {
      setErrorMovimiento(mensajeMovimientosCaja(err))
    } finally {
      enCursoRegistro.current = false
      setRegistrando(false)
    }
  }

  if (estadoTurno.tipo === 'cargando') return <p>Cargando…</p>
  if (estadoTurno.tipo === 'sin_turno') {
    return <p className="aviso">No hay turno abierto en esta PC. Abrilo para registrar movimientos.</p>
  }
  if (estadoTurno.tipo === 'fallo') {
    return (
      <p role="alert" className="aviso aviso--error">
        {MENSAJE_LECTURA}
      </p>
    )
  }

  return (
    <>
      <h2>Efectivo inicial</h2>
      <form aria-label="Efectivo inicial" onSubmit={(e) => void guardarMontoInicial(e)}>
        <label>
          Monto
          <input value={montoInicial} inputMode="numeric" onChange={(e) => setMontoInicial(e.target.value)} />
        </label>
        {errorMonto && (
          <p role="alert" className="aviso aviso--error">
            {errorMonto}
          </p>
        )}
        {mensajeMonto && (
          <p role="status" className="aviso">
            {mensajeMonto}
          </p>
        )}
        {/* aria-disabled y no disabled: un botón con foco que pasa a disabled deja el foco en <body>. */}
        <button type="submit" aria-disabled={guardandoMonto}>
          Guardar efectivo inicial
        </button>
      </form>

      <h2>Registrar movimiento</h2>
      <form aria-label="Registrar movimiento" onSubmit={(e) => void registrarMovimiento(e)}>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimientoCaja)}>
            {Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          Importe
          <input value={importe} inputMode="numeric" onChange={(e) => setImporte(e.target.value)} />
        </label>
        <label>
          Detalle (opcional)
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        </label>
        {errorMovimiento && (
          <p role="alert" className="aviso aviso--error">
            {errorMovimiento}
          </p>
        )}
        {mensajeMovimiento && (
          <p role="status" className="aviso">
            {mensajeMovimiento}
          </p>
        )}
        <button type="submit" aria-disabled={registrando}>
          Registrar movimiento
        </button>
      </form>

      <h2>Movimientos del turno</h2>
      {fallaLista ? (
        <p role="alert" className="aviso aviso--error">
          {MENSAJE_LECTURA}
        </p>
      ) : movimientos === null ? (
        <p>Cargando…</p>
      ) : movimientos.length === 0 ? (
        <p>Todavía no hay movimientos en este turno.</p>
      ) : (
        <table aria-label="Movimientos del turno">
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Tipo</th>
              <th scope="col">Detalle</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{FECHA_HORA.format(new Date(m.fecha))}</td>
                <td>{ETIQUETA_TIPO[m.tipo]}</td>
                <td>{m.detalle || '-'}</td>
                <td>{formatearPesos(m.tipo === 'ingreso' ? m.importe : -m.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
