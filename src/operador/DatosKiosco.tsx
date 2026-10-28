import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
  mensajeOperador,
  type DatosKiosco,
  type FichaKiosco,
  type KioscoResumen,
  type ServicioOperador,
} from './operador'
import { formatoFecha, hoyDeBuenosAires } from './resumen'

type CampoTexto = 'nombreVisible' | 'clienteDesde' | 'contactoNombre' | 'contactoTelefono' | 'contactoDireccion'

interface Props {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  ficha: FichaKiosco
  alCambiar(): void
}

/** Datos que el operador puede cambiar, con las notas y los recordatorios debajo. */
export function DatosDelKiosco({ servicio, kiosco, ficha, alCambiar }: Props) {
  const [datos, setDatos] = useState<DatosKiosco>(ficha.datos)
  const [etiquetas, setEtiquetas] = useState(ficha.datos.etiquetas.join(', '))
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const motivoListo = motivo.trim().length >= 3
  const hoy = hoyDeBuenosAires()

  function campoTexto(clave: CampoTexto) {
    return {
      value: datos[clave] ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [clave]: e.target.value })),
    }
  }

  async function elegirLogo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setError('')
    try {
      const url = await servicio.subirLogo(kiosco.negocioId, archivo)
      setDatos((d) => ({ ...d, logoUrl: url }))
    } catch (err) {
      setError(mensajeOperador(err))
    }
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      await servicio.guardarDatos(
        kiosco.negocioId,
        {
          ...datos,
          etiquetas: etiquetas
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t !== ''),
          contactoNombre: vacioANull(datos.contactoNombre),
          contactoTelefono: vacioANull(datos.contactoTelefono),
          contactoDireccion: vacioANull(datos.contactoDireccion),
        },
        motivo.trim(),
      )
      setMotivo('')
      alCambiar()
    } catch (err) {
      setError(mensajeOperador(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="operador__bloques">
      <form aria-label="Datos del kiosco" className="operador__form" onSubmit={guardar}>
        <label>
          Nombre visible
          <input required maxLength={60} {...campoTexto('nombreVisible')} />
        </label>
        <div>
          <p>Logo</p>
          {datos.logoUrl && <img src={datos.logoUrl} alt="Logo actual del kiosco" className="operador__logo" />}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={elegirLogo} />
        </div>
        <label>
          Color
          <input
            type="color"
            value={datos.colorPrimario}
            onChange={(e) => setDatos((d) => ({ ...d, colorPrimario: e.target.value }))}
          />
        </label>
        <label>
          Cliente desde
          <input type="date" required max={hoy} {...campoTexto('clienteDesde')} />
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
        <label className="operador__motivo">
          Motivo del cambio
          <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        {!motivoListo && <p>Escribí el motivo (3 letras o más) para guardar.</p>}
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <button type="submit" disabled={enviando || !motivoListo}>
          {enviando ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>
      <NotasYRecordatorios servicio={servicio} kiosco={kiosco} ficha={ficha} alCambiar={alCambiar} />
    </div>
  )
}

function vacioANull(valor: string | null): string | null {
  const limpio = valor?.trim() ?? ''
  return limpio === '' ? null : limpio
}

interface NotasProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  ficha: FichaKiosco
  alCambiar(): void
}

function NotasYRecordatorios({ servicio, kiosco, ficha, alCambiar }: NotasProps) {
  const [nota, setNota] = useState('')
  const [recordatorio, setRecordatorio] = useState('')
  const [venceEl, setVenceEl] = useState(() => hoyDeBuenosAires())
  const [error, setError] = useState('')

  async function hacer(accion: () => Promise<void>, despues?: () => void) {
    setError('')
    try {
      await accion()
      despues?.()
      alCambiar()
    } catch (e) {
      setError(mensajeOperador(e))
    }
  }

  return (
    <section aria-labelledby="notas-titulo" className="operador__bloques">
      <h3 id="notas-titulo">Notas internas</h3>
      <p>Sólo las ves vos. Nunca llegan a la app del kiosco.</p>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <ul className="operador__lista">
        {ficha.notas.map((n) => (
          <li key={n.id}>
            <span>{n.texto}</span>
            <small>{formatoFecha(n.creada)}</small>
            <button type="button" onClick={() => void hacer(() => servicio.borrarNota(n.id))}>
              Borrar nota
            </button>
          </li>
        ))}
      </ul>
      <form
        aria-label="Nueva nota"
        className="operador__form"
        onSubmit={(e) => {
          e.preventDefault()
          void hacer(() => servicio.agregarNota(kiosco.negocioId, nota.trim()), () => setNota(''))
        }}
      >
        <label>
          Nueva nota
          <textarea maxLength={1000} value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
        <button type="submit" disabled={nota.trim() === ''}>
          Agregar nota
        </button>
      </form>

      <h3 id="recordatorios-titulo">Recordatorios</h3>
      <ul className="operador__lista">
        {ficha.recordatorios.map((r) => (
          <li key={r.id}>
            <span>{r.texto}</span>
            <small>{r.hechoEn ? 'Hecho' : `Para el ${formatoFecha(r.venceEl)}`}</small>
            {!r.hechoEn && (
              <button type="button" onClick={() => void hacer(() => servicio.completarRecordatorio(r.id))}>
                Marcar hecho
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        aria-label="Nuevo recordatorio"
        className="operador__form"
        onSubmit={(e) => {
          e.preventDefault()
          void hacer(
            () => servicio.agregarRecordatorio(kiosco.negocioId, recordatorio.trim(), venceEl),
            () => setRecordatorio(''),
          )
        }}
      >
        <label>
          Recordatorio
          <input maxLength={200} value={recordatorio} onChange={(e) => setRecordatorio(e.target.value)} />
        </label>
        <label>
          Para el día
          <input type="date" value={venceEl} onChange={(e) => setVenceEl(e.target.value)} />
        </label>
        <button type="submit" disabled={recordatorio.trim() === '' || venceEl === ''}>
          Agregar recordatorio
        </button>
      </form>
    </section>
  )
}
