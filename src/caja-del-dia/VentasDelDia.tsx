import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatearPesos } from '../lib/plata'
import { NOMBRE_MEDIO } from '../tipos'
import { formatearNumeroVenta } from '../venta/confirmar'
import { MENSAJES_CAJA_DEL_DIA, mensajeCajaDelDia, type ServicioCajaDelDia, type VentaDelDia } from './servicioCajaDelDia'

export interface PropsVentasDelDia {
  /** La caja recibe siempre hoy; el jefe, el día que eligió. */
  fecha: string
  servicio: Pick<ServicioCajaDelDia, 'leerVentas' | 'anular'>
  /** Sube cuando hay que recargar (Actualizar o una anulación). */
  vuelta: number
  alAnular(): void
}

/** Ventas del día y anulación con motivo (decisión 17). También sirve para revisar antes de recargar una venta tras F5. */
export function VentasDelDia({ fecha, servicio, vuelta, alAnular }: PropsVentasDelDia) {
  const [ventas, setVentas] = useState<VentaDelDia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<VentaDelDia | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorAnular, setErrorAnular] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)

  useEffect(() => {
    let vigente = true
    setVentas(null)
    setError(null)
    servicio.leerVentas(fecha).then(
      (v) => {
        if (vigente) setVentas(v)
      },
      (e: unknown) => {
        if (vigente) setError(mensajeCajaDelDia(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, fecha, vuelta])

  function empezar(v: VentaDelDia) {
    setAnulando(v)
    setMotivo('')
    setErrorAnular(null)
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!anulando || enCurso.current) return
    const m = motivo.trim()
    if (m.length < 3 || m.length > 200) {
      setErrorAnular(MENSAJES_CAJA_DEL_DIA.motivo_invalido)
      return
    }
    enCurso.current = true
    setEnviando(true)
    setErrorAnular(null)
    try {
      await servicio.anular(anulando.venta_id, m)
      setAnulando(null)
      setMotivo('')
      alAnular()
    } catch (err) {
      setErrorAnular(mensajeCajaDelDia(err, 'No se pudo anular. Revisá la conexión y probá de nuevo.'))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <section className="ventas-del-dia" aria-label="Ventas del día">
      <h3>Ventas</h3>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {ventas === null && !error && <p>Cargando…</p>}
      {ventas && ventas.length === 0 && <p>No hay ventas este día.</p>}
      {ventas && ventas.length > 0 && (
        <table aria-label="Ventas">
          <thead>
            <tr>
              <th>Número</th>
              <th>Hora</th>
              <th>Total</th>
              <th>Pagos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const numero = formatearNumeroVenta(v.prefijo, v.numero)
              return (
                <tr key={v.venta_id}>
                  <td>{numero}</td>
                  <td>{v.hora}</td>
                  <td>{formatearPesos(v.total)}</td>
                  <td>{v.medios.map((m) => `${NOMBRE_MEDIO[m.medio]} ${formatearPesos(m.importe)}`).join(' + ')}</td>
                  <td>
                    {v.anulada ? (
                      'Anulada'
                    ) : (
                      <button type="button" aria-label={`Anular ${numero}`} onClick={() => empezar(v)}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {anulando && (
        <form className="anular-venta" aria-label="Anular venta" onSubmit={(e) => void confirmar(e)}>
          <p>
            Anular la venta {formatearNumeroVenta(anulando.prefijo, anulando.numero)} de {formatearPesos(anulando.total)}.
            La venta no se borra: queda la anulación con el motivo.
          </p>
          <label>
            Motivo
            <textarea value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {errorAnular && (
            <p role="alert" className="aviso aviso--error">
              {errorAnular}
            </p>
          )}
          <button type="submit" disabled={enviando}>
            Confirmar anulación
          </button>
          <button type="button" onClick={() => setAnulando(null)}>
            Cancelar
          </button>
        </form>
      )}
    </section>
  )
}
