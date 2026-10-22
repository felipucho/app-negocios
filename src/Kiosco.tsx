import { useEffect, useMemo, useState } from 'react'
import type { Cuenta } from './auth/cuenta'
import { CajaDelDia } from './caja-del-dia/CajaDelDia'
import { PantallaCaja } from './caja/PantallaCaja'
import { programarSincronizacion } from './catalogo/programar'
import type { Dispositivo } from './dispositivo/dispositivo'
import { Calibracion } from './escaner/Calibracion'
import { AnonimizarCliente } from './jefe/AnonimizarCliente'
import { ModuloFiado } from './jefe/ModuloFiado'
import { PantallaHistorial } from './jefe/PantallaHistorial'
import { AvisoAbono } from './negocio/AvisoAbono'
import { aplicarConfig, type ConfigNegocio, type EstadoAbono } from './negocio/config'
import { PantallaPagos } from './pagos/PantallaPagos'
import { PantallaProductos } from './productos/PantallaProductos'
import type { Servicios } from './servicios'
import type { Rol } from './tipos'
import { ResumenCierre } from './turno/PantallaTurno'
import type { CierreTurno } from './turno/turno'

export type Seccion = 'caja' | 'productos' | 'caja_del_dia' | 'historial' | 'modulo' | 'anonimizar' | 'calibracion'

/** Tabla de permisos del spec (sección 10). Ocultar no es seguridad: la base chequea el rol igual. */
export const SECCIONES: readonly { id: Seccion; titulo: string; soloJefe: boolean }[] = [
  { id: 'caja', titulo: 'Caja', soloJefe: false },
  { id: 'productos', titulo: 'Productos', soloJefe: false },
  { id: 'caja_del_dia', titulo: 'Caja del día', soloJefe: false },
  { id: 'historial', titulo: 'Historial', soloJefe: true },
  { id: 'modulo', titulo: 'Módulo fiado', soloJefe: true },
  { id: 'anonimizar', titulo: 'Anonimizar cliente', soloJefe: true },
  { id: 'calibracion', titulo: 'Calibrar escáner', soloJefe: true },
]

export function seccionesPara(rol: Rol) {
  return SECCIONES.filter((s) => rol === 'jefe' || !s.soloJefe)
}

export interface PropsKiosco {
  servicios: Servicios
  cuenta: Cuenta
  alCerrarSesion(): void
}

/** Un kiosco logueado: registra la PC, programa la caché, aplica la config y arma las pantallas según el rol. */
export function Kiosco({ servicios, cuenta, alCerrarSesion }: PropsKiosco) {
  const [dispositivo, setDispositivo] = useState<Dispositivo | null>(null)
  const [errorPc, setErrorPc] = useState(false)
  // null: todavía no se pudo leer de la base.
  const [fiado, setFiado] = useState<boolean | null>(null)
  const [config, setConfig] = useState<ConfigNegocio | null>(null)
  const [estadoAbono, setEstadoAbono] = useState<EstadoAbono | null>(null)
  const [seccion, setSeccion] = useState<Seccion>('caja')
  const [vueltaCaja, setVueltaCaja] = useState(0)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [cierre, setCierre] = useState<CierreTurno | null>(null)
  const [avisoTurno, setAvisoTurno] = useState<string | null>(null)

  function registrar() {
    setErrorPc(false)
    // Primer login de la PC: alta automática con prefijo nuevo (decisión 34). Después devuelve el mismo.
    // La caja no se monta hasta vaciar el catálogo de otro negocio que haya quedado en esta PC.
    Promise.all([servicios.registrarDispositivo(cuenta.negocioId), servicios.vaciarCacheAjena(cuenta.negocioId)]).then(
      ([d]) => setDispositivo(d),
      () => setErrorPc(true),
    )
  }

  useEffect(registrar, [servicios, cuenta.negocioId])
  useEffect(() => programarSincronizacion(servicios.sincronizarCatalogo), [servicios])
  useEffect(() => {
    // El módulo lo hace cumplir la base; esto sólo muestra u oculta el medio fiado.
    // Se relee al ritmo de la caché: así las otras PCs ven cuando el jefe lo prende o apaga.
    // Si falla, queda el último valor leído (un corte de red no lo esconde todo el turno).
    return programarSincronizacion(async () => setFiado(await servicios.fiadoActivo()))
  }, [servicios])
  useEffect(() => {
    // Sin config (o sin red), queda la pantalla genérica: no es un error para el cajero.
    servicios.leerConfig().then(setConfig, () => setConfig(null))
    // Sólo aviso: si no se puede leer, no se muestra nada y la caja sigue igual.
    servicios.leerEstadoAbono().then(setEstadoAbono, () => setEstadoAbono(null))
  }, [servicios])
  // Al salir del kiosco (cerrar sesión), la vuelta atrás deja la pantalla de entrada genérica (decisión 23).
  useEffect(() => (config ? aplicarConfig(config) : undefined), [config])

  const porPc = useMemo(
    () =>
      dispositivo
        ? {
            turno: servicios.turno(dispositivo.dispositivoId),
            productos: servicios.productos(dispositivo.dispositivoId),
            cajaDelDia: servicios.cajaDelDia(dispositivo.dispositivoId),
          }
        : null,
    [servicios, dispositivo],
  )

  async function cerrarTurno() {
    if (!porPc) return
    setConfirmarCierre(false)
    setAvisoTurno(null)
    try {
      setCierre(await porPc.turno.cerrar())
      setSeccion('caja')
    } catch (e) {
      const sinTurno = typeof e === 'object' && e !== null && 'message' in e && e.message === 'sin_turno'
      if (sinTurno) {
        // Ya estaba cerrado (quizás se perdió la respuesta del cierre): la caja nueva lee la base y
        // muestra "No hay turno abierto" con los totales del último cierre.
        setSeccion('caja')
        setVueltaCaja((v) => v + 1)
      } else {
        setAvisoTurno('No se pudo cerrar el turno. Revisá la conexión.')
      }
    }
  }

  if (errorPc) {
    return (
      <section className="kiosco">
        <p role="alert" className="aviso aviso--error">
          No se pudo registrar esta PC. Revisá la conexión.
        </p>
        <button type="button" onClick={registrar}>
          Reintentar
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </section>
    )
  }
  if (!dispositivo || !porPc) return <p className="cargando">Preparando la caja…</p>

  const dispositivoId = dispositivo.dispositivoId
  const esJefe = cuenta.rol === 'jefe'

  return (
    <div className="kiosco">
      <header className="kiosco__barra">
        {config?.logoUrl && <img className="kiosco__logo" src={config.logoUrl} alt="" />}
        {config && <strong className="kiosco__nombre">{config.nombreVisible}</strong>}
        <span>
          {esJefe ? 'Jefe' : 'Caja'} · PC {dispositivo.prefijo}
        </span>
        <nav aria-label="Secciones">
          {seccionesPara(cuenta.rol).map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={seccion === s.id}
              // Como los botones de la caja: el clic no le saca el foco al campo de escaneo (decisión 13).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setSeccion(s.id)}
            >
              {s.titulo}
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => setConfirmarCierre(true)}>
          Cerrar turno
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
        <AvisoAbono estado={estadoAbono} />
      </header>

      {confirmarCierre && (
        <div className="kiosco__confirmar" role="group" aria-label="Cerrar turno">
          <p>¿Cerrar el turno de esta PC? Si hay una venta sin cobrar, se pierde.</p>
          <button type="button" onClick={() => void cerrarTurno()}>
            Sí, cerrar turno
          </button>
          <button type="button" onClick={() => setConfirmarCierre(false)}>
            No
          </button>
        </div>
      )}
      {avisoTurno && (
        <p role="alert" className="aviso aviso--error">
          {avisoTurno}
        </p>
      )}
      {cierre && (
        <ResumenCierre
          cierre={cierre}
          alSeguir={() => {
            setCierre(null)
            setSeccion('caja')
            // Caja nueva: lee el turno de la base, no hay ninguno abierto y pide abrirlo.
            setVueltaCaja((v) => v + 1)
          }}
        />
      )}

      {/* Siempre montada: cambiar de sección no pierde la venta en armado. */}
      <div hidden={seccion !== 'caja' || cierre !== null}>
        <PantallaCaja
          key={vueltaCaja}
          catalogo={servicios.catalogo}
          turno={porPc.turno}
          leerRanking={servicios.leerRanking}
          productos={porPc.productos}
          activa={seccion === 'caja' && cierre === null && !confirmarCierre}
          cobro={(sesion) => (
            <PantallaPagos
              sesion={sesion}
              dispositivoId={dispositivoId}
              fiadoHabilitado={fiado === true}
              clientes={servicios.clientes}
              rpc={servicios.rpc}
              alCambiarPrecios={() => {
                servicios.sincronizarCatalogo().catch((e) => console.warn('sincronizar catálogo', e))
              }}
            />
          )}
        />
      </div>

      {seccion === 'productos' && <PantallaProductos servicio={porPc.productos} />}
      {seccion === 'caja_del_dia' && <CajaDelDia rol={cuenta.rol} servicio={porPc.cajaDelDia} />}
      {esJefe && seccion === 'historial' && <PantallaHistorial servicio={servicios.jefe} />}
      {esJefe && seccion === 'modulo' && <ModuloFiado activo={fiado} servicio={servicios.jefe} alCambiar={setFiado} />}
      {esJefe && seccion === 'anonimizar' && <AnonimizarCliente clientes={servicios.clientes} servicio={servicios.jefe} />}
      {esJefe && seccion === 'calibracion' && <Calibracion />}
    </div>
  )
}
