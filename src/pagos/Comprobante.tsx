import { FECHA_HORA } from '../lib/fecha'
import { formatearPesos } from '../lib/plata'
import { NOMBRE_MEDIO, type LineaCarrito } from '../tipos'
import type { PagoAEnviar } from '../venta/cobro'
import { formatearNumeroVenta, type VentaConfirmada } from '../venta/confirmar'

export interface PropsComprobante {
  venta: VentaConfirmada
  lineas: readonly LineaCarrito[]
  pagos: readonly PagoAEnviar[]
  alNuevaVenta(): void
  /** Venta anulada en el reintento: vuelve a la venta con el carrito intacto (el id ya salió nuevo). */
  alCobrarDeNuevo?(): void
}

/** Sólo en pantalla, no se imprime (spec sección 6). El fiado se muestra sin el nombre del cliente. */
export function Comprobante({ venta, lineas, pagos, alNuevaVenta, alCobrarDeNuevo }: PropsComprobante) {
  return (
    <section className="comprobante" aria-label="Comprobante">
      <h2>Venta {formatearNumeroVenta(venta.prefijo, venta.numero)}</h2>
      <p>{FECHA_HORA.format(new Date(venta.fecha))}</p>
      {venta.anulada ? (
        <p className="aviso" role="alert">
          Esta venta ya estaba grabada y después se anuló: no cuenta como cobrada. No hay vuelto para dar.
        </p>
      ) : (
        venta.yaExistia && <p className="aviso">Esta venta ya estaba grabada: no se duplicó.</p>
      )}
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
      {!venta.anulada && (
        <p className="vuelto">
          Vuelto <strong>{formatearPesos(venta.vuelto)}</strong>
        </p>
      )}
      <button type="button" autoFocus onClick={alNuevaVenta}>
        Nueva venta
      </button>
      {venta.anulada && alCobrarDeNuevo && (
        <button type="button" onClick={alCobrarDeNuevo}>
          Cobrarla de nuevo
        </button>
      )}
    </section>
  )
}
