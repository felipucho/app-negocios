import { useRef, useState, type FormEvent } from 'react'
import { SIN_CUENTA } from './cuenta'
import type { ResultadoLogin } from './useSesion'

export const MENSAJES_LOGIN: Record<Exclude<ResultadoLogin, 'ok'>, string> = {
  credenciales: 'Email o contraseña incorrectos.',
  sin_cuenta: SIN_CUENTA,
  red: 'No se pudo conectar. Revisá internet y probá de nuevo.',
}

export interface PropsLogin {
  iniciar(email: string, password: string): Promise<ResultadoLogin>
}

/** Pantalla de entrada genérica (decisión 23): sin marca de ningún kiosco. */
export function Login({ iniciar }: PropsLogin) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const enCurso = useRef(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEntrando(true)
    setError(null)
    let resultado: ResultadoLogin
    try {
      resultado = await iniciar(email.trim(), password)
    } catch {
      resultado = 'red'
    }
    // Con 'ok', App cambia a la sesión abierta y este componente se desmonta.
    if (resultado !== 'ok') {
      setError(MENSAJES_LOGIN[resultado])
      setPassword('')
      enCurso.current = false
      setEntrando(false)
    }
  }

  return (
    <main className="login">
      <h1>Caja</h1>
      <form aria-label="Iniciar sesión" onSubmit={(e) => void entrar(e)}>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <button type="submit" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
