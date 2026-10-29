import { useState } from 'react'
import type { KioscoResumen } from './operador'
import {
  actividadTexto,
  antiguedad,
  aFiltro,
  FILTROS,
  FILTROS_INICIALES,
  filtrarKioscos,
  hoyDeBuenosAires,
  TEXTO_FILTRO,
  type FiltrosLista,
  type Orden,
  type Tipo,
} from './resumen'
import { aHash } from './ruta'

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'nombre', texto: 'Nombre' },
  { valor: 'nuevos', texto: 'Más nuevos' },
  { valor: 'antiguos', texto: 'Más antiguos' },
  { valor: 'actividad', texto: 'Última actividad' },
]

interface Props {
  lista: KioscoResumen[]
  filtro: string | null
}

/** Lista con buscador, filtros y orden. Al tocar un kiosco se abre su ficha. */
export function ListaKioscos({ lista, filtro }: Props) {
  const [filtros, setFiltros] = useState<FiltrosLista>({ ...FILTROS_INICIALES, filtro: aFiltro(filtro) })
  const visibles = filtrarKioscos(lista, filtros)
  const hoy = hoyDeBuenosAires()

  function cambiar(cambio: Partial<FiltrosLista>) {
    setFiltros((f) => ({ ...f, ...cambio }))
  }

  return (
    <section aria-labelledby="lista-titulo" className="operador__bloques">
      <h2 id="lista-titulo">Kioscos</h2>
      <form className="operador__filtros" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          Buscar
          <input
            type="search"
            value={filtros.texto}
            placeholder="Nombre o mail"
            onChange={(e) => cambiar({ texto: e.target.value })}
          />
        </label>
        <label>
          Mostrar
          <select value={filtros.filtro} onChange={(e) => cambiar({ filtro: aFiltro(e.target.value) })}>
            {FILTROS.map((f) => (
              <option key={f} value={f}>
                {TEXTO_FILTRO[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={filtros.tipo} onChange={(e) => cambiar({ tipo: e.target.value as Tipo })}>
            <option value="reales">Reales</option>
            <option value="demo">Demo</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label>
          Orden
          <select value={filtros.orden} onChange={(e) => cambiar({ orden: e.target.value as Orden })}>
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
      </form>
      <p>
        {visibles.length} de {lista.length} kioscos
      </p>
      {visibles.length === 0 && <p>No hay kioscos con esos filtros.</p>}
      <ul className="operador__lista">
        {visibles.map((k) => (
          <li key={k.negocioId}>
            <a href={aHash({ tipo: 'kiosco', negocioId: k.negocioId, pestania: 'resumen' })}>
              <strong>{k.nombreVisible}</strong>
              <span>
                Cliente hace {antiguedad(k.clienteDesde, hoy)} · {actividadTexto(k.ultimaVenta, hoy)}
              </span>
              <span>
                Plan: {k.planNombre ?? 'Sin plan'}
                {k.extras > 0 && ` · +${k.extras} ${k.extras === 1 ? 'extra' : 'extras'}`}
              </span>
              <span className="operador__insignias">
                {k.esDemo && <span>Demo</span>}
                {k.recordatoriosHoy > 0 && <span>Recordatorio hoy</span>}
                {k.ultimaVenta !== null && k.ventas7d === 0 && <span>Sin actividad</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
