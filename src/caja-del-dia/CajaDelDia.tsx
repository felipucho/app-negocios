import { useEffect, useRef, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import type { Rol } from '../tipos'
import { formatearNumeroVenta } from '../venta/confirmar'
import { mensajeCajaDelDia, type CajaDia, type ServicioCajaDelDia } from './servicioCajaDelDia'
import { VentasDelDia } from './VentasDelDia'

export interface PropsCajaDelDia {
  rol: Rol
  servicio: ServicioCajaDelDia
}

/**
 * Caja del día (decisión 18): totales por medio, fiado aparte, anulaciones aparte.
 * La caja ve sólo hoy (el día lo da la base); el jefe elige la fecha. La base rechaza igual a la caja fuera de hoy.
 */
export function CajaDelDia({ rol, servicio }: PropsCajaDelDia) {
  const [fecha, setFecha] = useState<string | null>(null)
  const [caja, setCaja] = useState<CajaDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  // Si el jefe ya eligió una fecha, un hoy() que llega tarde no se la pisa.
  const fechaElegida = useRef(false)

  function leerHoy() {
    servicio.hoy().then(
      (hoy) => {
        if (!fechaElegida.current) setFecha(hoy)
      },
      (e: unknown) => {
        if (!fechaElegida.current) setError(mensajeCajaDelDia(e))
      },
    )
  }

  useEffect(leerHoy, [servicio])

  useEffect(() => {
    if (fecha === null) return
    let vigente = true
    setCaja(null)
    setError(null)
    servicio.leerCaja(fecha).then(
      (c) => {
        if (vigente) setCaja(c)
      },
      (e: unknown) => {
        if (vigente) setError(mensajeCajaDelDia(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, fecha, vuelta])

  function actualizar() {
    // Pasada la medianoche, la caja pasa sola al día nuevo.
    // Si la primera lectura de hoy() falló, también se reintenta para el jefe.
    if (rol === 'caja' || fecha === null) leerHoy()
    setVuelta((v) => v + 1)
  }

  return (
    <section className="caja-del-dia">
      <h2>Caja del día</h2>
      <div className="caja-del-dia__fecha">
        {rol === 'jefe' ? (
          <label>
            Fecha
            <input
              type="date"
              value={fecha ?? ''}
              onChange={(e) => {
                if (!e.target.value) return
                fechaElegida.current = true
                setFecha(e.target.value)
              }}
            />
          </label>
        ) : (
          <p>Hoy{fecha ? ` (${fecha})` : ''}</p>
        )}
        <button type="button" onClick={actualizar}>
          Actualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {caja && <ResumenCaja caja={caja} />}
      {fecha && <VentasDelDia fecha={fecha} servicio={servicio} vuelta={vuelta} alAnular={() => setVuelta((v) => v + 1)} />}
    </section>
  )
}

function ResumenCaja({ caja }: { caja: CajaDia }) {
  const filas: [string, number][] = [
    ['Efectivo', caja.efectivo],
    ['Transferencia', caja.transferencia],
    ['Tarjeta', caja.tarjeta],
    ['Total cobrado', caja.cobrado],
  ]
  const a = caja.anulaciones
  return (
    <>
      <table aria-label="Cobrado">
        <tbody>
          {filas.map(([nombre, importe]) => (
            <tr key={nombre}>
              <th scope="row">{nombre}</th>
              <td>{formatearPesos(importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="caja-del-dia__fiado" aria-label="Fiado">
        <h3>Fiado (no cobrado)</h3>
        <p>{formatearPesos(caja.fiado)}</p>
      </section>
      <section className="caja-del-dia__anulaciones" aria-label="Anulaciones">
        <h3>Anulaciones</h3>
        {a.cantidad === 0 ? (
          <p>Sin anulaciones.</p>
        ) : (
          <>
            <p>
              {a.cantidad} {a.cantidad === 1 ? 'anulación' : 'anulaciones'} por {formatearPesos(a.total)}. Ya están
              restadas de los totales de arriba.
            </p>
            <ul>
              {a.detalle.map((d) => (
                <li key={d.venta_id}>
                  {formatearNumeroVenta(d.prefijo, d.numero)} · {formatearPesos(d.total)} · {d.motivo}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
