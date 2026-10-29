import { useRef, useState, type FormEvent } from 'react'
import { ConfirmarGrave } from './ConfirmarGrave'
import {
  mensajeOperador,
  type ClaveRestablecida,
  type DatosRestablecer,
  type ServicioOperador,
} from './operador'

type Rol = DatosRestablecer['rol']

interface Props {
  servicio: ServicioOperador
  negocioId: string
  nombreKiosco: string
}

/** Cambia la clave de la cuenta jefe o caja de un kiosco. La clave generada se muestra una sola vez. */
export function RestablecerClave({ servicio, negocioId, nombreKiosco }: Props) {
  const [rol, setRol] = useState<Rol>('jefe')
  const [motivo, setMotivo] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [clave, setClave] = useState('')
  const [mostrarClaves, setMostrarClaves] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [restablecida, setRestablecida] = useState<ClaveRestablecida | null>(null)
  const enCurso = useRef(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError('')
    try {
      setRestablecida(await servicio.restablecerClave({ negocioId, rol, motivo: motivo.trim(), clave }))
      setMotivo('')
      setConfirmacion('')
      setClave('')
    } catch (err) {
      setError(mensajeOperador(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  const tipoClave = mostrarClaves ? 'text' : 'password'

  return (
    <section aria-labelledby="restablecer-titulo" className="operador__bloques">
      <h3 id="restablecer-titulo">Restablecer clave</h3>
      {restablecida && (
        <section role="status" aria-labelledby="clave-nueva-titulo" className="operador__claves">
          <h4 id="clave-nueva-titulo">Clave restablecida</h4>
          <p>
            <strong>{restablecida.rol === 'jefe' ? 'Jefe' : 'Caja'}</strong> ({restablecida.email}):{' '}
            {restablecida.password ? <code>{restablecida.password}</code> : 'la clave que cargaste'}
          </p>
          {restablecida.password && <p>La clave generada se muestra una sola vez. Anotala antes de seguir.</p>}
          {!restablecida.sesionesCerradas && (
            <p className="aviso aviso--error">
              No se pudieron cerrar las sesiones abiertas. Restablecé la clave otra vez para intentarlo.
            </p>
          )}
          <button type="button" onClick={() => setRestablecida(null)}>
            Listo, ya la anoté
          </button>
        </section>
      )}
      <form aria-label="Restablecer clave" className="operador__form" onSubmit={enviar}>
        <label>
          Cuenta
          <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            <option value="jefe">Jefe</option>
            <option value="caja">Caja</option>
          </select>
        </label>
        <label>
          Motivo
          <input required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <label>
          Clave nueva (vacía = se genera)
          <input
            type={tipoClave}
            autoComplete="new-password"
            maxLength={72}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        </label>
        <label className="operador__casilla">
          <input type="checkbox" checked={mostrarClaves} onChange={(e) => setMostrarClaves(e.target.checked)} />
          Mostrar claves
        </label>
        <p>El cambio cierra las sesiones abiertas de esa cuenta. Las claves tienen entre 8 y 72 caracteres.</p>
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <ConfirmarGrave
          nombre={nombreKiosco}
          valor={confirmacion}
          alCambiar={setConfirmacion}
          accion={enviando ? 'Restableciendo…' : 'Restablecer clave'}
          enviando={enviando}
        />
      </form>
    </section>
  )
}
