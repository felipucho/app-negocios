import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  mensajeOperador,
  type AltaKiosco as AltaHecha,
  type DatosAlta,
  type ServicioOperador,
} from './operador'
import { aHash } from './ruta'

const DATOS_VACIOS: DatosAlta = { nombre: '', nombreVisible: '', emailJefe: '', emailCaja: '' }

interface Props {
  servicio: ServicioOperador
  alAlta(): void
}

/** Alta de un kiosco con su cuenta de jefe y de caja. Las claves se muestran una sola vez. */
export function AltaKiosco({ servicio, alAlta }: Props) {
  const [datos, setDatos] = useState<DatosAlta>(DATOS_VACIOS)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [alta, setAlta] = useState<AltaHecha | null>(null)
  const enCurso = useRef(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError('')
    try {
      setAlta(await servicio.altaKiosco(datos))
      setDatos(DATOS_VACIOS)
      alAlta()
    } catch (err) {
      setError(mensajeOperador(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  function campo(clave: keyof DatosAlta) {
    return {
      value: datos[clave],
      onChange: (e: ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [clave]: e.target.value })),
    }
  }

  return (
    <section aria-labelledby="alta-titulo" className="operador__bloques">
      <h2 id="alta-titulo">Nuevo kiosco</h2>
      {alta && (
        <section role="status" aria-labelledby="claves-titulo" className="operador__claves">
          <h3 id="claves-titulo">Kiosco dado de alta</h3>
          <p>Estas claves se muestran una sola vez. Anotalas antes de seguir.</p>
          <ul>
            {alta.cuentas.map((c) => (
              <li key={c.rol}>
                <strong>{c.rol === 'jefe' ? 'Jefe' : 'Caja'}</strong> ({c.email}): <code>{c.password}</code>
              </li>
            ))}
          </ul>
          <a href={aHash({ tipo: 'kiosco', negocioId: alta.negocioId, pestania: 'resumen' })}>Abrir su ficha</a>
          <button type="button" onClick={() => setAlta(null)}>
            Listo, ya las anoté
          </button>
        </section>
      )}
      <form aria-label="Alta de kiosco" className="operador__form" onSubmit={enviar}>
        <label>
          Nombre del kiosco
          <input required maxLength={80} {...campo('nombre')} />
        </label>
        <label>
          Nombre visible (vacío = el mismo nombre)
          <input maxLength={60} {...campo('nombreVisible')} />
        </label>
        <label>
          Mail del jefe
          <input type="email" required {...campo('emailJefe')} />
        </label>
        <label>
          Mail de la caja
          <input type="email" required {...campo('emailCaja')} />
        </label>
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <button type="submit" aria-disabled={enviando}>
          {enviando ? 'Dando de alta…' : 'Dar de alta'}
        </button>
      </form>
    </section>
  )
}
