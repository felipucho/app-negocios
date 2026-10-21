import { useRef, type KeyboardEvent } from 'react'
import { detectarEscaneo, type Pulsacion } from '../escaner/detector'
import type { Umbrales } from '../escaner/umbrales'
import { formatearPesos } from '../lib/plata'
import { NOMBRE_MEDIO, type LineaCarrito } from '../tipos'
import type { PagoAEnviar } from '../venta/cobro'
import { formatearNumeroVenta, type VentaConfirmada } from '../venta/confirmar'

const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})

export interface PropsComprobante {
  venta: VentaConfirmada
  lineas: readonly LineaCarrito[]
  pagos: readonly PagoAEnviar[]
  alNuevaVenta(): void
  umbrales: Umbrales
  ahora?: () => number
  /** Un escaneo con el comprobante a la vista se ignora y la caja avisa. */
  alEscaneo(): void
}

/** Sólo en pantalla, no se imprime (spec sección 6). El fiado se muestra sin el nombre del cliente. */
export function Comprobante({ venta, lineas, pagos, alNuevaVenta, umbrales, ahora, alEscaneo }: PropsComprobante) {
  const pulsaciones = useRef<Pulsacion[]>([])

  // El Enter final del escáner caería en "Nueva venta" (tiene el foco): si es un escaneo, no se activa.
  function alTecla(e: KeyboardEvent<HTMLButtonElement>) {
    const t = ahora ? ahora() : e.timeStamp
    if (e.key === 'Enter') {
      if (detectarEscaneo(pulsaciones.current, t, umbrales)) {
        e.preventDefault()
        alEscaneo()
      }
      pulsaciones.current = []
      return
    }
    if (e.key.length === 1) pulsaciones.current = [...pulsaciones.current, { tecla: e.key, t }].slice(-64)
  }

  return (
    <section className="comprobante" aria-label="Comprobante">
      <h2>Venta {formatearNumeroVenta(venta.prefijo, venta.numero)}</h2>
      <p>{FECHA_HORA.format(new Date(venta.fecha))}</p>
      {venta.yaExistia && <p className="aviso">Esta venta ya estaba grabada: no se duplicó.</p>}
      <table aria-label="Productos">
        <tbody>
          {lineas.map((l) => (
            <tr key={l.productoId}>
              <td>
                {l.cantidad} × {l.nombre}
              </td>
              <td>{formatearPesos(l.precio * l.cantidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table aria-label="Pagos">
        <tbody>
          {pagos.map((p) => (
            <tr key={p.medio}>
              <td>{NOMBRE_MEDIO[p.medio]}</td>
              <td>{formatearPesos(p.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Total {formatearPesos(venta.total)}</p>
      <p className="vuelto">
        Vuelto <strong>{formatearPesos(venta.vuelto)}</strong>
      </p>
      <button type="button" autoFocus onClick={alNuevaVenta} onKeyDown={alTecla}>
        Nueva venta
      </button>
    </section>
  )
}
