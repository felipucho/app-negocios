import { useEffect, useState } from 'react'
import { SIN_CUENTA, type Cuenta } from './auth/cuenta'
import { Login } from './auth/Login'
import { useSesion } from './auth/useSesion'
import { Kiosco } from './Kiosco'
import type { Servicios } from './servicios'

/** Raíz: sin sesión, Login; con sesión, el kiosco de la cuenta. */
export function App({ servicios }: { servicios: Servicios }) {
  const { estado, iniciar, cerrarSesion } = useSesion(servicios.auth, servicios.borrarCache)

  if (estado.tipo === 'cargando') return <p className="cargando">Cargando…</p>
  if (estado.tipo === 'cerrada') return <Login iniciar={iniciar} />
  return (
    <SesionAbierta
      key={estado.sesion.usuarioId}
      servicios={servicios}
      usuarioId={estado.sesion.usuarioId}
      alCerrarSesion={() => void cerrarSesion()}
    />
  )
}

type EstadoCuenta = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'sin_cuenta' } | { tipo: 'lista'; cuenta: Cuenta }

interface PropsSesionAbierta {
  servicios: Servicios
  usuarioId: string
  alCerrarSesion(): void
}

function SesionAbierta({ servicios, usuarioId, alCerrarSesion }: PropsSesionAbierta) {
  const [estado, setEstado] = useState<EstadoCuenta>({ tipo: 'cargando' })

  function cargar() {
    setEstado({ tipo: 'cargando' })
    servicios.leerCuenta(usuarioId).then(
      (cuenta) => setEstado(cuenta ? { tipo: 'lista', cuenta } : { tipo: 'sin_cuenta' }),
      () => setEstado({ tipo: 'error' }),
    )
  }

  useEffect(cargar, [servicios, usuarioId])

  if (estado.tipo === 'cargando') return <p className="cargando">Cargando…</p>
  if (estado.tipo !== 'lista') {
    return (
      <main className="sin-kiosco">
        <p role="alert" className="aviso aviso--error">
          {estado.tipo === 'sin_cuenta' ? SIN_CUENTA : 'No se pudo leer la cuenta. Revisá la conexión.'}
        </p>
        {estado.tipo === 'error' && (
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        )}
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </main>
    )
  }
  return <Kiosco servicios={servicios} cuenta={estado.cuenta} alCerrarSesion={alCerrarSesion} />
}
