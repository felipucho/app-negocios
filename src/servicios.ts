import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCuenta, type Cuenta } from './auth/cuenta'
import { resultadoLogin, type ServicioAuth } from './auth/useSesion'
import { crearServicioCajaDelDia, type ServicioCajaDelDia } from './caja-del-dia/servicioCajaDelDia'
import { crearCatalogoCaja, type CatalogoCaja } from './caja/catalogoCaja'
import type { ServicioTurno } from './caja/PantallaCaja'
import { leerRankingSinCodigo, type FilaRanking } from './caja/ranking'
import { borrarCache, sincronizarCatalogo, vaciarCacheAjena, type CacheCatalogo } from './catalogo/cache'
import { crearFuenteSupabase } from './catalogo/fuente'
import { registrarDispositivo, type Dispositivo } from './dispositivo/dispositivo'
import { crearServicioFiado, type ServicioFiado } from './fiado/fiado'
import { crearServicioJefe, type ServicioJefe } from './jefe/jefe'
import { leerModulos, type Modulo } from './modulos/modulos'
import { leerConfigNegocio, leerEstadoAbonoNegocio, type ConfigNegocio, type EstadoAbono } from './negocio/config'
import { crearServicioOperador, type ServicioOperador } from './operador/operador'
import { crearServicioClientes, type ServicioClientes } from './pagos/clientes'
import { crearServicioPrecios, type ServicioPrecios } from './precios/precios'
import { crearServicioProductos, type ServicioProductos } from './productos/productos'
import { crearServicioStock, type ServicioStock } from './stock/stock'
import { abrirTurno, cerrarTurno, leerTurnoAbierto, leerUltimoTurnoCerrado, type CierreTurno } from './turno/turno'
import { crearServicioMovimientosCaja, type ServicioMovimientosCaja } from './turno/movimientosCaja'
import type { LlamarRpc } from './venta/confirmar'

/** Turno de una PC: lo que pide PantallaCaja más el cierre (tarea 8). */
export interface ServicioTurnoPc extends ServicioTurno {
  /** efectivoContado sólo con el módulo movimientos_caja: la base guarda el arqueo. */
  cerrar(efectivoContado?: number): Promise<CierreTurno>
}

/** Todo lo que la app usa de afuera. En las pruebas, src/test/servicios.ts. */
export interface Servicios {
  auth: ServicioAuth
  leerCuenta(usuarioId: string): Promise<Cuenta | null>
  registrarDispositivo(negocioId: string): Promise<Dispositivo>
  borrarCache(): Promise<void>
  vaciarCacheAjena(negocioId: string): Promise<void>
  sincronizarCatalogo(): Promise<unknown>
  catalogo: CatalogoCaja
  leerRanking(): Promise<FilaRanking[]>
  /** Catálogo de módulos del negocio con su estado (modulos + modulos_negocio). */
  leerModulos(): Promise<Modulo[]>
  clientes: ServicioClientes
  rpc: LlamarRpc
  turno(dispositivoId: string): ServicioTurnoPc
  productos(dispositivoId: string): ServicioProductos
  cajaDelDia(dispositivoId: string): ServicioCajaDelDia
  precios(dispositivoId: string): ServicioPrecios
  fiado(dispositivoId: string): ServicioFiado
  stock(dispositivoId: string): ServicioStock
  movimientos(dispositivoId: string): ServicioMovimientosCaja
  jefe: ServicioJefe
  /** Sólo la cuenta de operador (administra kioscos y módulos). Chequeado en la base. */
  operador: ServicioOperador
  leerConfig(): Promise<ConfigNegocio | null>
  leerEstadoAbono(): Promise<EstadoAbono | null>
}

function crearServicioAuth(supabase: SupabaseClient, claveSesion: string): ServicioAuth {
  return {
    async sesionActual() {
      const { data } = await supabase.auth.getSession()
      return data.session ? { usuarioId: data.session.user.id } : null
    },
    alCambiar(cb) {
      const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
        cb(sesion ? { usuarioId: sesion.user.id } : null)
      })
      return () => data.subscription.unsubscribe()
    },
    async iniciar(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return resultadoLogin(error)
    },
    async cerrar() {
      // local: 'global' cerraría también la cuenta caja en las otras PCs del kiosco.
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        // Con el token vencido y sin red, signOut no llega a borrar la sesión guardada (auth-js
        // _signOut sale antes de _removeSession): al volver la red reabriría el kiosco sin contraseña.
        localStorage.removeItem(claveSesion)
        throw error
      }
    },
  }
}

export function crearServicios(supabase: SupabaseClient, db: CacheCatalogo, claveSesion: string): Servicios {
  const fuente = crearFuenteSupabase(supabase)
  const sincronizar = () => sincronizarCatalogo(db, fuente)
  // Después de dar de alta o editar un producto: refrescar la caché ya, sin esperar los 3 minutos.
  const alCambiarCatalogo = () => {
    sincronizar().catch(() => undefined)
  }
  return {
    auth: crearServicioAuth(supabase, claveSesion),
    leerCuenta: (usuarioId) => leerCuenta(supabase, usuarioId),
    registrarDispositivo: (negocioId) => registrarDispositivo(supabase, negocioId),
    borrarCache: () => borrarCache(db),
    vaciarCacheAjena: (negocioId) => vaciarCacheAjena(db, negocioId),
    sincronizarCatalogo: sincronizar,
    catalogo: crearCatalogoCaja(db),
    leerRanking: () => leerRankingSinCodigo(supabase),
    leerModulos: () => leerModulos(supabase),
    clientes: crearServicioClientes(supabase),
    rpc: (funcion, args) => supabase.rpc(funcion, args),
    turno: (id) => ({
      leer: () => leerTurnoAbierto(supabase, id),
      abrir: () => abrirTurno(supabase, id),
      cerrar: (efectivoContado) => cerrarTurno(supabase, id, efectivoContado),
      ultimoCerrado: () => leerUltimoTurnoCerrado(supabase, id),
    }),
    productos: (id) => crearServicioProductos(supabase, id, alCambiarCatalogo),
    cajaDelDia: (id) => crearServicioCajaDelDia(supabase, id),
    precios: (id) => crearServicioPrecios(supabase, id),
    fiado: (id) => crearServicioFiado(supabase, id),
    stock: (id) => crearServicioStock(supabase, id),
    movimientos: (id) => crearServicioMovimientosCaja(supabase, id),
    jefe: crearServicioJefe(supabase),
    operador: crearServicioOperador(supabase),
    // Logos sólo del Supabase del proyecto: es el único origen de imágenes que deja la CSP (tarea 19).
    leerConfig: () => leerConfigNegocio(supabase, import.meta.env.VITE_SUPABASE_URL),
    leerEstadoAbono: () => leerEstadoAbonoNegocio(supabase),
  }
}
