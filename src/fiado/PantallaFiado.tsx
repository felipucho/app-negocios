import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { formatearPesos, parsearPesos } from '../lib/plata'
import { MENSAJES_FIADO, mensajeFiado, type MedioCobroFiado, type SaldoFiado, type ServicioFiado } from './fiado'

export interface PropsPantallaFiado {
  servicio: ServicioFiado
  esJefe: boolean
  /** null: todavía no se leyó el módulo; no se muestra nada. */
  fiadoActivo: boolean | null
}

type TipoFormulario = 'cobrar' | 'limite'

interface FormularioAbierto {
  tipo: TipoFormulario
  clienteId: string
}

/** Cobro sin confirmar de un cliente: su pagoId se reusa mientras medio e importe no cambien. */
interface PagoPendiente {
  clave: string
  pagoId: string
}

/** Pesos enteros mayores que cero, o null. Vacío no es cero: parsearPesos lo lee como 0. */
function importePositivo(texto: string): number | null {
  if (texto.trim() === '') return null
  const pesos = parsearPesos(texto)
  return pesos !== null && pesos > 0 ? pesos : null
}

/**
 * Cuentas de fiado para caja y jefe: saldos y cobros; el límite lo fija sólo el jefe.
 * Cobrar sigue permitido con el fiado apagado.
 */
export function PantallaFiado({ servicio, esJefe, fiadoActivo }: PropsPantallaFiado) {
  const [saldos, setSaldos] = useState<SaldoFiado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<FormularioAbierto | null>(null)
  const [pendientes] = useState(() => new Map<string, PagoPendiente>())

  function cargar() {
    setError(null)
    servicio.leerSaldos().then(setSaldos, (e) => setError(mensajeFiado(e)))
  }

  useEffect(cargar, [servicio])

  function abrir(tipo: TipoFormulario, clienteId: string) {
    setHecho(null)
    setAbierto({ tipo, clienteId })
  }

  /** Sólo cierra si sigue abierto ese formulario: un cobro que llega tarde no cierra otro. */
  function cerrar(tipo: TipoFormulario, clienteId: string) {
    setAbierto((a) => (a?.tipo === tipo && a.clienteId === clienteId ? null : a))
  }

  return (
    <section>
      <h2>Cuentas de fiado</h2>
      {esJefe && fiadoActivo !== false && <p className="ayuda">Si el fiado nuevo supera el límite, la venta se rechaza.</p>}
      {fiadoActivo === false && (
        <p className="aviso">El fiado está apagado: no se dan fiados nuevos. Igual podés cobrar lo que se debe.</p>
      )}
      {hecho && (
        <p role="status" className="aviso">
          {hecho}
        </p>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {saldos === null && !error && <p>Cargando…</p>}
      {saldos && (
        <table aria-label="Clientes con saldo">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Debe</th>
              <th>Límite</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {saldos.length === 0 && (
              <tr>
                <td colSpan={4}>Ningún cliente debe nada.</td>
              </tr>
            )}
            {saldos.map((f) => (
              <Fragment key={f.cliente_id}>
                <tr>
                  <td>{f.nombre}</td>
                  <td>{formatearPesos(f.saldo)}</td>
                  <td>{f.limite_fiado === null ? 'Sin límite' : formatearPesos(f.limite_fiado)}</td>
                  <td>
                    <button type="button" onClick={() => abrir('cobrar', f.cliente_id)}>
                      Cobrar
                    </button>
                    {esJefe && fiadoActivo !== false && (
                      <button type="button" onClick={() => abrir('limite', f.cliente_id)}>
                        Límite
                      </button>
                    )}
                  </td>
                </tr>
                {abierto?.clienteId === f.cliente_id && (
                  <tr>
                    <td colSpan={4}>
                      {abierto.tipo === 'cobrar' ? (
                        <FormularioCobro
                          fila={f}
                          servicio={servicio}
                          pendientes={pendientes}
                          alCobrado={(saldoQueQueda) => {
                            setHecho(`Cobrado. Quedan ${formatearPesos(saldoQueQueda)}.`)
                            cerrar('cobrar', f.cliente_id)
                            cargar()
                          }}
                          alCancelar={() => cerrar('cobrar', f.cliente_id)}
                        />
                      ) : (
                        <FormularioLimite
                          fila={f}
                          servicio={servicio}
                          alGuardar={() => {
                            cerrar('limite', f.cliente_id)
                            cargar()
                          }}
                          alCancelar={() => cerrar('limite', f.cliente_id)}
                        />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

interface PropsFormularioCobro {
  fila: SaldoFiado
  servicio: Pick<ServicioFiado, 'cobrar'>
  /** Vive en la pantalla, no en el formulario: un Cancelar seguido de reabrir no genera otro pagoId. */
  pendientes: Map<string, PagoPendiente>
  alCobrado(saldoQueQueda: number): void
  alCancelar(): void
}

function FormularioCobro({ fila, servicio, pendientes, alCobrado, alCancelar }: PropsFormularioCobro) {
  const [medio, setMedio] = useState<MedioCobroFiado>('efectivo')
  const [texto, setTexto] = useState(String(fila.saldo))
  const [error, setError] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const enCurso = useRef(false)

  async function cobrar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const importe = importePositivo(texto)
    if (importe === null) {
      setError('El importe tiene que ser un número de pesos enteros, mayor que cero.')
      return
    }
    if (importe > fila.saldo) {
      setError(MENSAJES_FIADO.importe_mayor_a_saldo)
      return
    }
    // Mismo medio e importe, mismo cobro: si el primer intento sí se grabó, el reintento no lo cobra dos veces.
    const clave = `${medio}|${importe}`
    const previo = pendientes.get(fila.cliente_id)
    const pago = previo?.clave === clave ? previo : { clave, pagoId: crypto.randomUUID() }
    pendientes.set(fila.cliente_id, pago)
    enCurso.current = true
    setCobrando(true)
    setError(null)
    try {
      const cobro = await servicio.cobrar(pago.pagoId, fila.cliente_id, medio, importe)
      if (pendientes.get(fila.cliente_id) === pago) pendientes.delete(fila.cliente_id)
      alCobrado(cobro.saldo)
    } catch (err) {
      setError(mensajeFiado(err))
    } finally {
      enCurso.current = false
      setCobrando(false)
    }
  }

  return (
    <form aria-label={`Cobrar a ${fila.nombre}`} onSubmit={(e) => void cobrar(e)}>
      <label>
        Medio
        <select value={medio} onChange={(e) => setMedio(e.target.value as MedioCobroFiado)}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </select>
      </label>
      <label>
        Importe
        <input value={texto} inputMode="numeric" onChange={(e) => setTexto(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {/* aria-disabled y no disabled: un botón que pasa a disabled con foco deja el foco en <body>. */}
      <button type="submit" aria-disabled={cobrando}>
        Cobrar
      </button>
      <button
        type="button"
        aria-disabled={cobrando}
        onClick={() => {
          if (!enCurso.current) alCancelar()
        }}
      >
        Cancelar
      </button>
    </form>
  )
}

interface PropsFormularioLimite {
  fila: SaldoFiado
  servicio: Pick<ServicioFiado, 'fijarLimite'>
  alGuardar(): void
  alCancelar(): void
}

function FormularioLimite({ fila, servicio, alGuardar, alCancelar }: PropsFormularioLimite) {
  const [texto, setTexto] = useState(fila.limite_fiado === null ? '' : String(fila.limite_fiado))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const vacio = texto.trim() === ''
    const limite = vacio ? null : importePositivo(texto)
    if (!vacio && limite === null) {
      setError('El límite es un importe en pesos enteros, mayor que cero.')
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      await servicio.fijarLimite(fila.cliente_id, limite)
      alGuardar()
    } catch (err) {
      setError(mensajeFiado(err))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form aria-label={`Límite de ${fila.nombre}`} onSubmit={(e) => void guardar(e)}>
      <label>
        Límite
        <input value={texto} inputMode="numeric" onChange={(e) => setTexto(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" aria-disabled={guardando}>
        Guardar límite
      </button>
      <button
        type="button"
        aria-disabled={guardando}
        onClick={() => {
          if (!enCurso.current) alCancelar()
        }}
      >
        Cancelar
      </button>
    </form>
  )
}
