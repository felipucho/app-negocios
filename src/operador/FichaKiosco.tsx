import { useEffect, useState } from 'react'
import { DatosDelKiosco } from './DatosKiosco'
import { HistorialOperador } from './HistorialOperador'
import {
  mensajeOperador,
  type FichaKiosco,
  type KioscoResumen,
  type ModuloDeKiosco,
  type ServicioOperador,
} from './operador'
import { actividadTexto, antiguedad, formatoFecha, hoyDeBuenosAires, usoTexto } from './resumen'
import { aHash, type Pestania } from './ruta'

const PESTANIAS: { valor: Pestania; texto: string }[] = [
  { valor: 'resumen', texto: 'Resumen' },
  { valor: 'datos', texto: 'Datos' },
  { valor: 'historial', texto: 'Historial' },
]

interface Props {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  kioscos: KioscoResumen[]
  pestania: Pestania
  version: number
  recargar(): void
}

/** Ficha de un kiosco: resumen, datos (con notas y recordatorios) e historial. */
export function FichaDelKiosco({ servicio, kiosco, kioscos, pestania, version, recargar }: Props) {
  const [ficha, setFicha] = useState<FichaKiosco | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    servicio.ficha(kiosco.negocioId).then(
      (f) => {
        if (vigente) {
          setFicha(f)
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
  }, [servicio, kiosco.negocioId, version])

  const hoy = hoyDeBuenosAires()

  return (
    <section aria-labelledby="ficha-titulo" className="operador__bloques operador__ficha">
      <p>
        <a href={aHash({ tipo: 'kioscos', filtro: null })}>← Kioscos</a>
      </p>
      <h2 id="ficha-titulo">{kiosco.nombreVisible}</h2>
      <nav aria-label="Pestañas de la ficha" className="operador__nav">
        {PESTANIAS.map((p) => (
          <a
            key={p.valor}
            href={aHash({ tipo: 'kiosco', negocioId: kiosco.negocioId, pestania: p.valor })}
            aria-current={p.valor === pestania ? 'page' : undefined}
          >
            {p.texto}
          </a>
        ))}
      </nav>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {pestania === 'resumen' && (
        <Resumen servicio={servicio} kiosco={kiosco} ficha={ficha} hoy={hoy} alCambiar={recargar} />
      )}
      {pestania === 'datos' &&
        (ficha ? (
          <DatosDelKiosco servicio={servicio} kiosco={kiosco} ficha={ficha} alCambiar={recargar} />
        ) : (
          <p className="cargando">Cargando…</p>
        ))}
      {pestania === 'historial' && (
        <HistorialOperador servicio={servicio} kioscos={kioscos} negocioFijo={kiosco.negocioId} version={version} />
      )}
    </section>
  )
}

interface ResumenProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  ficha: FichaKiosco | null
  hoy: string
  alCambiar(): void
}

function Resumen({ servicio, kiosco, ficha, hoy, alCambiar }: ResumenProps) {
  return (
    <div className="operador__bloques">
      <section aria-labelledby="cliente-titulo">
        <h3 id="cliente-titulo">Cliente</h3>
        <p>
          Cliente hace {antiguedad(kiosco.clienteDesde, hoy)} (desde el {formatoFecha(kiosco.clienteDesde)}).
        </p>
        <p>Uso: {usoTexto(kiosco.diasConVentas30d)}</p>
        <p>Abono: sin registrar (se carga en la fase 5).</p>
      </section>
      <ModulosDelKiosco servicio={servicio} kiosco={kiosco} alCambiar={alCambiar} />
      <section aria-labelledby="cuentas-titulo">
        <h3 id="cuentas-titulo">Cuentas</h3>
        <ul>
          <li>Jefe: {kiosco.jefeEmail ?? '—'}</li>
          <li>Caja: {kiosco.cajaEmail ?? '—'}</li>
        </ul>
      </section>
      <section aria-labelledby="pcs-titulo">
        <h3 id="pcs-titulo">PCs ({kiosco.pcs})</h3>
        {ficha ? (
          <ul>
            {ficha.pcs.map((p) => (
              <li key={p.prefijo}>
                {p.prefijo} · alta el {formatoFecha(p.creado)} ·{' '}
                {p.turnoAbierto ? 'turno abierto' : 'sin turno abierto'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="cargando">Cargando…</p>
        )}
      </section>
      <section aria-labelledby="actividad-titulo">
        <h3 id="actividad-titulo">Actividad</h3>
        <ul>
          <li>Última venta: {actividadTexto(kiosco.ultimaVenta, hoy)}</li>
          <li>
            Ventas: hoy {kiosco.ventasHoy} · últimos 7 días {kiosco.ventas7d} · últimos 30 días {kiosco.ventas30d}
          </li>
          <li>Días con ventas en los últimos 30: {kiosco.diasConVentas30d}</li>
        </ul>
      </section>
    </div>
  )
}

interface ModulosProps {
  servicio: ServicioOperador
  kiosco: KioscoResumen
  alCambiar(): void
}

/** Prender o apagar módulos. Cada cambio pide motivo y queda en el historial. */
function ModulosDelKiosco({ servicio, kiosco, alCambiar }: ModulosProps) {
  const [modulos, setModulos] = useState<ModuloDeKiosco[] | null>(null)
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const motivoListo = motivo.trim().length >= 3

  useEffect(() => {
    let vigente = true
    servicio.modulosDeKiosco(kiosco.negocioId).then(
      (lista) => {
        if (vigente) setModulos(lista)
      },
      (e) => {
        if (vigente) setError(mensajeOperador(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, kiosco.negocioId])

  async function alternar(modulo: ModuloDeKiosco) {
    setGuardando(true)
    setError('')
    try {
      await servicio.cambiarModulo(kiosco.negocioId, modulo.clave, !modulo.activo, motivo.trim())
      setModulos((lista) => lista?.map((m) => (m.clave === modulo.clave ? { ...m, activo: !m.activo } : m)) ?? null)
      alCambiar()
    } catch (e) {
      setError(mensajeOperador(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section aria-labelledby="modulos-titulo">
      <h3 id="modulos-titulo">Módulos</h3>
      <label className="operador__motivo">
        Motivo del cambio
        <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {!motivoListo && <p>Escribí el motivo (3 letras o más) para cambiar un módulo.</p>}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {!modulos && !error && <p className="cargando">Cargando…</p>}
      <ul className="operador__lista">
        {modulos?.map((m) => (
          <li key={m.clave}>
            <label>
              <input
                type="checkbox"
                checked={m.activo}
                disabled={guardando || !motivoListo}
                onChange={() => void alternar(m)}
              />
              {m.descripcion}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
