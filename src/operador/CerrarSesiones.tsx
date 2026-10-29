import { useRef, useState, type FormEvent } from 'react'
import { ConfirmarGrave } from './ConfirmarGrave'
import { mensajeOperador, type DatosCerrarSesiones, type ServicioOperador } from './operador'

type Rol = DatosCerrarSesiones['rol']

interface Props {
  servicio: ServicioOperador
  negocioId: string
  nombreKiosco: string
}

/** Cierra las sesiones abiertas de la cuenta jefe o caja de un kiosco: tiene que volver a entrar con su clave. */
export function CerrarSesiones({ servicio, negocioId, nombreKiosco }: Props) {
  const [rol, setRol] = useState<Rol>('jefe')
  const [motivo, setMotivo] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [cerrada, setCerrada] = useState<Rol | null>(null)
  const enCurso = useRef(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError('')
    setCerrada(null)
    try {
      const resultado = await servicio.cerrarSesiones({ negocioId, rol, motivo: motivo.trim() })
      if (!resultado.sesionesCerradas) throw new Error('cerrar_sesiones_fallido')
      setCerrada(resultado.rol)
      setMotivo('')
      setConfirmacion('')
    } catch (err) {
      setError(mensajeOperador(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <section aria-labelledby="cerrar-sesiones-titulo" className="operador__bloques">
      <h3 id="cerrar-sesiones-titulo">Cerrar sesiones</h3>
      <form aria-label="Cerrar sesiones" className="operador__form" onSubmit={enviar}>
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
        <p>
          La cuenta queda sin sesiones abiertas y tiene que volver a entrar con su clave, que no cambia. Donde ya
          estaba abierta puede seguir andando hasta una hora.
        </p>
        {cerrada && (
          <p role="status">Listo: se cerraron las sesiones {cerrada === 'jefe' ? 'del jefe' : 'de la caja'}.</p>
        )}
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <ConfirmarGrave
          nombre={nombreKiosco}
          valor={confirmacion}
          alCambiar={setConfirmacion}
          accion={enviando ? 'Cerrando…' : 'Cerrar sesiones'}
          enviando={enviando}
        />
      </form>
    </section>
  )
}
