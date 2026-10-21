import { formatearPesos } from '../lib/plata'
import type { ProductoCache } from '../tipos'

export interface PropsPanelSinCodigo {
  /** Ya ordenados y filtrados (ordenarSinCodigo y filtrarPanel). */
  productos: readonly ProductoCache[]
  alTocar(producto: ProductoCache): void
  alCerrar(): void
}

/** Grilla de botones grandes. Ningún botón toma el foco: el campo de escaneo lo conserva siempre. */
export function PanelSinCodigo({ productos, alTocar, alCerrar }: PropsPanelSinCodigo) {
  return (
    <section className="panel-sin-codigo" aria-label="Productos sin código">
      <div role="group" aria-label="Grilla sin código" className="panel-sin-codigo__grilla">
        {productos.map((p) => (
          <button
            key={p.id}
            type="button"
            tabIndex={-1}
            className="panel-sin-codigo__boton"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => alTocar(p)}
          >
            <span>{p.nombre}</span>
            <span>{formatearPesos(p.precio)}</span>
          </button>
        ))}
      </div>
      {productos.length === 0 && <p>No hay productos sin código que coincidan.</p>}
      <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={alCerrar}>
        Cerrar (Esc)
      </button>
    </section>
  )
}
