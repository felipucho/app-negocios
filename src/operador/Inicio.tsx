import type { KioscoResumen } from './operador'
import { contadores, type Filtro } from './resumen'
import { aHash } from './ruta'

interface Props {
  lista: KioscoResumen[]
}

/** Contadores que se pueden calcular hoy. Tocar uno abre la lista ya filtrada. */
export function Inicio({ lista }: Props) {
  const c = contadores(lista)
  const tarjetas: { filtro: Filtro; numero: number; texto: string }[] = [
    { filtro: 'alta_mes', numero: c.altasMes, texto: 'Altas del mes' },
    { filtro: 'sin_actividad', numero: c.sinActividad, texto: 'Sin actividad hace 7 días o más' },
    { filtro: 'nunca_vendio', numero: c.nuncaVendio, texto: 'Nunca vendieron' },
    { filtro: 'recordatorio_hoy', numero: c.recordatoriosHoy, texto: 'Con recordatorio de hoy' },
  ]
  const reales = lista.filter((k) => !k.esDemo).length

  return (
    <section aria-labelledby="inicio-titulo" className="operador__bloques">
      <h2 id="inicio-titulo">Inicio</h2>
      <ul className="operador__contadores">
        {tarjetas.map((t) => (
          <li key={t.filtro}>
            <a className="operador__contador" href={aHash({ tipo: 'kioscos', filtro: t.filtro })}>
              <strong>{t.numero}</strong>
              {t.texto}
            </a>
          </li>
        ))}
      </ul>
      <p>{reales} kioscos reales. Los demo no cuentan en estos números.</p>
    </section>
  )
}
