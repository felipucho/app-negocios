import { formatearPesos } from '../lib/plata'
import { idLinea, type LineaCarrito } from '../tipos'

export interface PropsLineasVenta {
  lineas: readonly LineaCarrito[]
  /** Línea recién agregada (idLinea): se resalta. */
  resaltado: string | null
  /** Con el cobro abierto no se cambian cantidades. aria-disabled y no disabled: ver el botón Cobrar en PantallaCaja. */
  bloqueada: boolean
  alCambiar(lineaId: string, delta: 1 | -1): void
}

export function LineasVenta({ lineas, resaltado, bloqueada, alCambiar }: PropsLineasVenta) {
  if (lineas.length === 0) return <p className="venta-vacia">Escaneá o buscá un producto para empezar.</p>
  return (
    <table className="lineas" aria-label="Venta">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Precio</th>
          <th>Cantidad</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l) => {
          const id = idLinea(l)
          return (
            <tr key={id} className={id === resaltado ? 'linea linea--nueva' : 'linea'}>
              <td>{l.nombre}</td>
              <td>{formatearPesos(l.precio)}</td>
              <td>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Restar uno a ${l.nombre}`}
                  aria-disabled={bloqueada}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !bloqueada && alCambiar(id, -1)}
                >
                  −
                </button>
                <span className="cantidad">{l.cantidad}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Sumar uno a ${l.nombre}`}
                  aria-disabled={bloqueada}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !bloqueada && alCambiar(id, 1)}
                >
                  +
                </button>
              </td>
              <td>{formatearPesos(l.precio * l.cantidad)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
