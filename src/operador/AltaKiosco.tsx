import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  mensajeOperador,
  type AltaKiosco as AltaHecha,
  type DatosAlta,
  type ServicioOperador,
} from './operador'
import { aHash } from './ruta'
import { hoyDeBuenosAires } from './resumen'

type CampoTexto = Exclude<keyof DatosAlta, 'esDemo' | 'etiquetas'>
type Formulario = Omit<DatosAlta, 'etiquetas'>

const COLOR_INICIAL = '#1f4e79'

function formularioInicial(): Formulario {
  return {
    nombre: '',
    nombreVisible: '',
    emailJefe: '',
    emailCaja: '',
    claveJefe: '',
    claveCaja: '',
    colorPrimario: COLOR_INICIAL,
    clienteDesde: hoyDeBuenosAires(),
    esDemo: false,
    contactoNombre: '',
    contactoTelefono: '',
    contactoDireccion: '',
  }
}

/** "rubro, zona" → ["rubro", "zona"]. La base valida la cantidad y el largo. */
function aEtiquetas(texto: string): string[] {
  return texto
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
}

interface Props {
  servicio: ServicioOperador
  alAlta(): void
}

/** Alta de un kiosco con sus cuentas, sus datos comerciales y el contacto del dueño. Las claves generadas se muestran una sola vez. */
export function AltaKiosco({ servicio, alAlta }: Props) {
  const [datos, setDatos] = useState<Formulario>(formularioInicial)
  const [etiquetas, setEtiquetas] = useState('')
  const [mostrarClaves, setMostrarClaves] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [alta, setAlta] = useState<AltaHecha | null>(null)
  const enCurso = useRef(false)
  const hoy = hoyDeBuenosAires()

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError('')
    try {
      setAlta(await servicio.altaKiosco({ ...datos, etiquetas: aEtiquetas(etiquetas) }))
      setDatos(formularioInicial())
      setEtiquetas('')
      alAlta()
    } catch (err) {
      setError(mensajeOperador(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  function campoTexto(clave: CampoTexto) {
    return {
      value: datos[clave],
      onChange: (e: ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [clave]: e.target.value })),
    }
  }

  const tipoClave = mostrarClaves ? 'text' : 'password'

  return (
    <section aria-labelledby="alta-titulo" className="operador__bloques">
      <h2 id="alta-titulo">Nuevo kiosco</h2>
      {alta && (
        <section role="status" aria-labelledby="claves-titulo" className="operador__claves">
          <h3 id="claves-titulo">Kiosco dado de alta</h3>
          {alta.cuentas.some((c) => c.password) && (
            <p>Las claves generadas se muestran una sola vez. Anotalas antes de seguir.</p>
          )}
          <ul>
            {alta.cuentas.map((c) => (
              <li key={c.rol}>
                <strong>{c.rol === 'jefe' ? 'Jefe' : 'Caja'}</strong> ({c.email}):{' '}
                {c.password ? <code>{c.password}</code> : 'la clave que cargaste'}
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
          <input required maxLength={80} {...campoTexto('nombre')} />
        </label>
        <label>
          Nombre visible (vacío = el mismo nombre)
          <input maxLength={60} {...campoTexto('nombreVisible')} />
        </label>
        <label>
          Mail del jefe
          <input type="email" required {...campoTexto('emailJefe')} />
        </label>
        <label>
          Clave del jefe (vacía = se genera)
          <input type={tipoClave} autoComplete="new-password" maxLength={72} {...campoTexto('claveJefe')} />
        </label>
        <label>
          Mail de la caja
          <input type="email" required {...campoTexto('emailCaja')} />
        </label>
        <label>
          Clave de la caja (vacía = se genera)
          <input type={tipoClave} autoComplete="new-password" maxLength={72} {...campoTexto('claveCaja')} />
        </label>
        <label className="operador__casilla">
          <input type="checkbox" checked={mostrarClaves} onChange={(e) => setMostrarClaves(e.target.checked)} />
          Mostrar claves
        </label>
        <p>Las claves tienen entre 8 y 72 caracteres.</p>
        <label>
          Cliente desde
          <input type="date" required max={hoy} {...campoTexto('clienteDesde')} />
        </label>
        <label>
          Color
          <input
            type="color"
            value={datos.colorPrimario}
            onChange={(e) => setDatos((d) => ({ ...d, colorPrimario: e.target.value }))}
          />
        </label>
        <label>
          Etiquetas (rubro, zona), separadas por coma
          <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} />
        </label>
        <label className="operador__casilla">
          <input
            type="checkbox"
            checked={datos.esDemo}
            onChange={(e) => setDatos((d) => ({ ...d, esDemo: e.target.checked }))}
          />
          Kiosco demo o de prueba
        </label>
        <fieldset>
          <legend>Contacto del dueño (sólo lo ves vos)</legend>
          <label>
            Nombre
            <input maxLength={80} {...campoTexto('contactoNombre')} />
          </label>
          <label>
            Teléfono
            <input maxLength={40} {...campoTexto('contactoTelefono')} />
          </label>
          <label>
            Dirección
            <input maxLength={120} {...campoTexto('contactoDireccion')} />
          </label>
        </fieldset>
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
