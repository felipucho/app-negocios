import { useEffect, useState } from 'react'
import { AltaKiosco } from './AltaKiosco'
import { FichaDelKiosco } from './FichaKiosco'
import { HistorialOperador } from './HistorialOperador'
import { Inicio } from './Inicio'
import { ListaKioscos } from './ListaKioscos'
import { mensajeOperador, type KioscoResumen, type ServicioOperador } from './operador'
import { aHash, useRuta, type Ruta } from './ruta'

interface Props {
  servicio: ServicioOperador
  alCerrarSesion(): void
}

const SECCIONES: { hash: string; texto: string; activa(ruta: Ruta): boolean }[] = [
  { hash: aHash({ tipo: 'inicio' }), texto: 'Inicio', activa: (r) => r.tipo === 'inicio' },
  {
    hash: aHash({ tipo: 'kioscos', filtro: null }),
    texto: 'Kioscos',
    activa: (r) => r.tipo === 'kioscos' || r.tipo === 'kiosco',
  },
  { hash: aHash({ tipo: 'historial' }), texto: 'Historial', activa: (r) => r.tipo === 'historial' },
  { hash: aHash({ tipo: 'nuevo' }), texto: 'Nuevo kiosco', activa: (r) => r.tipo === 'nuevo' },
]

/** Panel del operador. Cada sección tiene su dirección; nada queda elegido por defecto. */
export function PantallaOperador({ servicio, alCerrarSesion }: Props) {
  const ruta = useRuta()
  const [kioscos, setKioscos] = useState<KioscoResumen[] | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const recargar = () => setVersion((n) => n + 1)

  useEffect(() => {
    let vigente = true
    servicio.resumenKioscos().then(
      (lista) => {
        if (vigente) {
          setKioscos(lista)
          setError('')
        }
      },
      (e) => {
        if (vigente) setError(mensajeOperador(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, version])

  const sinListaTodavia = kioscos === null && !error && ruta.tipo !== 'nuevo' && ruta.tipo !== 'historial'

  return (
    <main className="operador">
      <header className="operador__cabecera">
        <h1>Administración</h1>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </header>
      <nav aria-label="Secciones" className="operador__nav">
        {SECCIONES.map((s) => (
          <a key={s.hash} href={s.hash} aria-current={s.activa(ruta) ? 'page' : undefined}>
            {s.texto}
          </a>
        ))}
      </nav>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {sinListaTodavia && <p className="cargando">Cargando…</p>}
      {ruta.tipo === 'nuevo' && <AltaKiosco servicio={servicio} alAlta={recargar} />}
      {ruta.tipo === 'historial' && (
        <HistorialOperador servicio={servicio} kioscos={kioscos ?? []} version={version} />
      )}
      {kioscos && <Seccion ruta={ruta} kioscos={kioscos} servicio={servicio} version={version} recargar={recargar} />}
    </main>
  )
}

interface SeccionProps {
  ruta: Ruta
  kioscos: KioscoResumen[]
  servicio: ServicioOperador
  version: number
  recargar(): void
}

function Seccion({ ruta, kioscos, servicio, version, recargar }: SeccionProps) {
  if (ruta.tipo === 'inicio') return <Inicio lista={kioscos} />
  if (ruta.tipo === 'kioscos') return <ListaKioscos key={ruta.filtro ?? ''} lista={kioscos} filtro={ruta.filtro} />
  if (ruta.tipo === 'kiosco') {
    const kiosco = kioscos.find((k) => k.negocioId === ruta.negocioId)
    if (!kiosco) {
      return (
        <p role="alert" className="aviso aviso--error">
          Ese kiosco no está en la lista. <a href={aHash({ tipo: 'kioscos', filtro: null })}>Volver a Kioscos</a>
        </p>
      )
    }
    return (
      <FichaDelKiosco
        key={kiosco.negocioId}
        servicio={servicio}
        kiosco={kiosco}
        kioscos={kioscos}
        pestania={ruta.pestania}
        version={version}
        recargar={recargar}
      />
    )
  }
  return null
}
