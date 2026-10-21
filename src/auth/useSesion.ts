import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface SesionAuth {
  usuarioId: string
}

export type ResultadoLogin = 'ok' | 'credenciales' | 'sin_cuenta' | 'red'

/** Lo que la app necesita de Supabase Auth. La implementación real está en src/servicios.ts. */
export interface ServicioAuth {
  sesionActual(): Promise<SesionAuth | null>
  /** Avisa cada cambio de sesión (login, logout, refresco del token). Devuelve cómo dejar de escuchar. */
  alCambiar(cb: (sesion: SesionAuth | null) => void): () => void
  iniciar(email: string, password: string): Promise<ResultadoLogin>
  cerrar(): Promise<void>
}

export type EstadoSesion = { tipo: 'cargando' } | { tipo: 'cerrada' } | { tipo: 'abierta'; sesion: SesionAuth }

/**
 * Error de signInWithPassword -> resultado. 403 = el hook rechazó a un usuario sin cuenta (tarea 4, plan A).
 * Todo lo demás es "credenciales": no se distingue email inexistente de contraseña mala.
 */
export function resultadoLogin(error: unknown): ResultadoLogin {
  if (!error) return 'ok'
  if (isAuthRetryableFetchError(error)) return 'red'
  if (isAuthApiError(error) && error.status === 403) return 'sin_cuenta'
  // Rate limit o falla del servidor/hook: no son credenciales malas.
  if (isAuthApiError(error) && (error.status === 429 || error.status >= 500)) return 'red'
  return 'credenciales'
}

function siguiente(previo: EstadoSesion, sesion: SesionAuth | null): EstadoSesion {
  if (!sesion) return previo.tipo === 'cerrada' ? previo : { tipo: 'cerrada' }
  // Un refresco del token del mismo usuario no cambia nada: el kiosco no se remonta.
  if (previo.tipo === 'abierta' && previo.sesion.usuarioId === sesion.usuarioId) return previo
  return { tipo: 'abierta', sesion }
}

export function useSesion(auth: ServicioAuth, borrarCache: () => Promise<void>) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })
  // Tras "Cerrar sesión", ninguna sesión que reaparezca (refresco pendiente, otra pestaña) reabre el
  // kiosco: sólo un login hecho en esta pantalla (V35).
  const saliendo = useRef(false)

  useEffect(() => {
    let vigente = true
    // El callback sólo cambia estado: nada de await a Supabase dentro (V39).
    const dejar = auth.alCambiar((s) => {
      if (s && saliendo.current) return
      setEstado((p) => siguiente(p, s))
    })
    auth.sesionActual().then(
      (s) => {
        if (vigente && !saliendo.current) setEstado((p) => (p.tipo === 'cargando' ? siguiente(p, s) : p))
      },
      () => {
        if (vigente) setEstado((p) => (p.tipo === 'cargando' ? { tipo: 'cerrada' } : p))
      },
    )
    return () => {
      vigente = false
      dejar()
    }
  }, [auth])

  const iniciar = useCallback(
    async (email: string, password: string) => {
      saliendo.current = false
      let resultado: ResultadoLogin = 'red'
      try {
        resultado = await auth.iniciar(email, password)
        return resultado
      } finally {
        if (resultado !== 'ok') saliendo.current = true
      }
    },
    [auth],
  )

  const cerrarSesion = useCallback(async () => {
    saliendo.current = true
    // 1) Memoria: sin sesión, App desmonta el kiosco; la venta en armado y su id viven en PantallaCaja.
    setEstado({ tipo: 'cerrada' })
    // 2) Caché del catálogo (la PC puede ser compartida, spec sección 10).
    try {
      await borrarCache()
    } catch {
      // Sigue: la sesión se cierra igual.
    }
    // 3) Supabase, sólo esta sesión (scope local, ver src/servicios.ts).
    try {
      await auth.cerrar()
    } catch {
      // Sin red: servicios.ts ya borró la sesión guardada (V35).
    }
  }, [auth, borrarCache])

  return { estado, iniciar, cerrarSesion }
}
