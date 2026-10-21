import { formatearPesos } from '../lib/plata'
import type { ProductoCache } from '../tipos'

export const ID_SUGERENCIAS = 'sugerencias'
export const idSugerencia = (p: ProductoCache) => `sugerencia-${p.id}`

export interface PropsListaSugerencias {
  productos: readonly ProductoCache[]
  seleccion: number | null
  alElegir(producto: ProductoCache): void
}

/** Hasta 8 resultados con nombre, precio y código. Enter sólo elige lo seleccionado con flechas. */
export function ListaSugerencias({ productos, seleccion, alElegir }: PropsListaSugerencias) {
  return (
    <ul id={ID_SUGERENCIAS} role="listbox" aria-label="Sugerencias" className="sugerencias">
      {productos.map((p, i) => (
        <li
          key={p.id}
          id={idSugerencia(p)}
          role="option"
          aria-selected={i === seleccion}
          className={i === seleccion ? 'sugerencia sugerencia--elegida' : 'sugerencia'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => alElegir(p)}
        >
          <span>{p.nombre}</span>
          <span>{formatearPesos(p.precio)}</span>
          <span>{p.codigo_barras ?? 'sin código'}</span>
        </li>
      ))}
    </ul>
  )
}
