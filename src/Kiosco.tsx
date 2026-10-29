import { useEffect, useMemo, useState } from 'react'
import type { Cuenta } from './auth/cuenta'
import { CajaDelDia } from './caja-del-dia/CajaDelDia'
import { PantallaCaja } from './caja/PantallaCaja'
import { programarSincronizacion } from './catalogo/programar'
import type { Dispositivo } from './dispositivo/dispositivo'
import { Calibracion } from './escaner/Calibracion'
import { PantallaFiado } from './fiado/PantallaFiado'
import { AnonimizarCliente } from './jefe/AnonimizarCliente'
import { Modulos } from './jefe/Modulos'
import { PantallaHistorial } from './jefe/PantallaHistorial'
import { codigoDeError } from './lib/errores'
import { parsearPesos } from './lib/plata'
import type { ClaveModulo, Modulo } from './modulos/modulos'
import { AvisoAbono } from './negocio/AvisoAbono'
import { aplicarConfig, type ConfigNegocio, type EstadoAbono } from './negocio/config'
import { PantallaPagos } from './pagos/PantallaPagos'
import { PantallaPrecios } from './precios/PantallaPrecios'
import { PantallaProductos } from './productos/PantallaProductos'
import { PantallaProveedores } from './proveedores/PantallaProveedores'
import type { Servicios } from './servicios'
import { PantallaStock } from './stock/PantallaStock'
import type { Rol } from './tipos'
import { PantallaMovimientos } from './turno/PantallaMovimientos'
import { ResumenCierre } from './turno/PantallaTurno'
import type { CierreTurno } from './turno/turno'

export type Seccion =
  | 'caja'
  | 'productos'
  | 'caja_del_dia'
  | 'movimientos'
  | 'stock'
  | 'proveedores'
  | 'fiado'
  | 'precios'
  | 'historial'
  | 'modulo'
  | 'anonimizar'
  | 'calibracion'

/** Tabla de permisos del spec (sección 10). Ocultar no es seguridad: la base chequea el rol igual. */
export const SECCIONES: readonly { id: Seccion; titulo: string; soloJefe: boolean; modulo?: ClaveModulo }[] = [
  { id: 'caja', titulo: 'Caja', soloJefe: false },
  { id: 'productos', titulo: 'Productos', soloJefe: false },
  { id: 'caja_del_dia', titulo: 'Caja del día', soloJefe: false },
  { id: 'movimientos', titulo: 'Movimientos de caja', soloJefe: false, modulo: 'movimientos_caja' },
  { id: 'stock', titulo: 'Stock', soloJefe: false, modulo: 'stock' },
  { id: 'proveedores', titulo: 'Proveedores', soloJefe: false, modulo: 'proveedores' },
  { id: 'fiado', titulo: 'Fiado', soloJefe: false },
  { id: 'precios', titulo: 'Precios', soloJefe: true, modulo: 'precios' },
  { id: 'historial', titulo: 'Historial', soloJefe: true },
  { id: 'modulo', titulo: 'Módulos', soloJefe: true },
  { id: 'anonimizar', titulo: 'Anonimizar cliente', soloJefe: true },
  { id: 'calibracion', titulo: 'Calibrar escáner', soloJefe: true },
]

/** Las secciones del rol. Las de un módulo aparecen sólo si el negocio lo tiene activo. */
export function seccionesPara(rol: Rol, activos: readonly ClaveModulo[]) {
  return SECCIONES.filter((s) => (rol === 'jefe' || !s.soloJefe) && (s.modulo === undefined || activos.includes(s.modulo)))
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
  const [modulos, setModulos] = useState<Modulo[] | null>(null)
  const [config, setConfig] = useState<ConfigNegocio | null>(null)
  const [estadoAbono, setEstadoAbono] = useState<EstadoAbono | null>(null)
  const [seccion, setSeccion] = useState<Seccion>('caja')
  const [vueltaCaja, setVueltaCaja] = useState(0)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [cierre, setCierre] = useState<CierreTurno | null>(null)
  const [avisoTurno, setAvisoTurno] = useState<string | null>(null)

  // Lo que muestra u oculta cada pantalla: la base hace cumplir los módulos, esto sólo los refleja.
  const activos = useMemo(() => (modulos ?? []).filter((m) => m.activo).map((m) => m.clave), [modulos])
  const activo = (clave: ClaveModulo) => activos.includes(clave)
  // null: todavía no se pudo leer. El medio fiado de la pantalla de cobro sigue el mismo valor.
  const fiado = modulos === null ? null : activo('fiado')

  function alCambiarModulo(clave: string, nuevo: boolean) {
    setModulos((ms) => ms && ms.map((m) => (m.clave === clave ? { ...m, activo: nuevo } : m)))
  }

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
    // Se relee al ritmo de la caché: así las otras PCs ven cuando el jefe prende o apaga un módulo.
    // Si falla, queda el último valor leído (un corte de red no esconde todo el turno).
    return programarSincronizacion(async () => setModulos(await servicios.leerModulos()))
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
            precios: servicios.precios(dispositivo.dispositivoId),
            fiado: servicios.fiado(dispositivo.dispositivoId),
            stock: servicios.stock(dispositivo.dispositivoId),
            movimientos: servicios.movimientos(dispositivo.dispositivoId),
            proveedores: servicios.proveedores(dispositivo.dispositivoId),
          }
        : null,
    [servicios, dispositivo],
  )

  async function cerrarTurno() {
    if (!porPc) return
    // Efectivo contado: opcional, y sólo con el módulo movimientos_caja. Escrito mal, no cierra.
    let contado: number | undefined
    if (activo('movimientos_caja') && efectivoContado.trim() !== '') {
      const importe = parsearPesos(efectivoContado)
      if (importe === null) {
        setAvisoTurno('El efectivo contado tiene que ser un importe en pesos enteros.')
        return
      }
      contado = importe
    }
    setConfirmarCierre(false)
    setAvisoTurno(null)
    try {
      setCierre(await porPc.turno.cerrar(contado))
      setEfectivoContado('')
      setSeccion('caja')
    } catch (e) {
      const sinTurno = codigoDeError(e) === 'sin_turno'
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
  // Si la relectura apaga el módulo de la sección abierta, no se dibuja nada y la caja sigue oculta: se vuelve a la caja.
  const abierta = seccionesPara(cuenta.rol, activos).some((s) => s.id === seccion) ? seccion : 'caja'
  // En el render y no en un effect: hay return temprano arriba.
  if (abierta !== seccion) setSeccion(abierta)

  return (
    <div className="kiosco">
      <header className="kiosco__barra">
        {config?.logoUrl && <img className="kiosco__logo" src={config.logoUrl} alt="" />}
        {config && <strong className="kiosco__nombre">{config.nombreVisible}</strong>}
        <span>
          {esJefe ? 'Jefe' : 'Caja'} · PC {dispositivo.prefijo}
        </span>
        <nav aria-label="Secciones">
          {seccionesPara(cuenta.rol, activos).map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={abierta === s.id}
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
          {activo('movimientos_caja') && (
            <label>
              Efectivo contado en la caja (opcional)
              <input
                inputMode="numeric"
                autoComplete="off"
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
              />
            </label>
          )}
          <button type="button" onClick={() => void cerrarTurno()}>
            Sí, cerrar turno
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmarCierre(false)
              setEfectivoContado('')
            }}
          >
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
      <div hidden={abierta !== 'caja' || cierre !== null}>
        <PantallaCaja
          key={vueltaCaja}
          catalogo={servicios.catalogo}
          turno={porPc.turno}
          leerRanking={servicios.leerRanking}
          productos={porPc.productos}
          activa={abierta === 'caja' && cierre === null && !confirmarCierre}
          varios={activo('varios')}
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

      {abierta === 'productos' && <PantallaProductos servicio={porPc.productos} />}
      {abierta === 'caja_del_dia' && <CajaDelDia rol={cuenta.rol} servicio={porPc.cajaDelDia} />}
      {abierta === 'movimientos' && activo('movimientos_caja') && (
        <PantallaMovimientos servicio={porPc.movimientos} turno={porPc.turno} />
      )}
      {abierta === 'stock' && activo('stock') && <PantallaStock servicio={porPc.stock} productos={porPc.productos} esJefe={esJefe} />}
      {abierta === 'proveedores' && activo('proveedores') && (
        <PantallaProveedores servicio={porPc.proveedores} retirosActivos={activo('movimientos_caja')} stockActivo={activo('stock')} />
      )}
      {abierta === 'fiado' && <PantallaFiado servicio={porPc.fiado} esJefe={esJefe} fiadoActivo={fiado} />}
      {esJefe && abierta === 'precios' && activo('precios') && (
        <PantallaPrecios
          servicio={porPc.precios}
          productos={porPc.productos}
          alCambiarPrecios={() => {
            servicios.sincronizarCatalogo().catch((e) => console.warn('sincronizar catálogo', e))
          }}
        />
      )}
      {esJefe && abierta === 'historial' && <PantallaHistorial servicio={servicios.jefe} />}
      {esJefe && abierta === 'modulo' && <Modulos servicio={servicios.jefe} alCambiar={alCambiarModulo} />}
      {esJefe && abierta === 'anonimizar' && <AnonimizarCliente clientes={servicios.clientes} servicio={servicios.jefe} />}
      {esJefe && abierta === 'calibracion' && <Calibracion />}
    </div>
  )
}
