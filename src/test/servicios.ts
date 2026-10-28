import { vi } from 'vitest'
import type { Cuenta } from '../auth/cuenta'
import type { ResultadoLogin, SesionAuth } from '../auth/useSesion'
import type { AnulacionHecha, CajaDia, VentaDelDia } from '../caja-del-dia/servicioCajaDelDia'
import type { FilaRanking } from '../caja/ranking'
import type { CursorHistorial, FilaHistorial } from '../jefe/jefe'
import type { ClaveModulo, Modulo } from '../modulos/modulos'
import type { ConfigNegocio, EstadoAbono } from '../negocio/config'
import type { AltaKiosco, EntradaHistorial, FichaKiosco, KioscoResumen, ModuloDeKiosco } from '../operador/operador'
import type { MedioCobroFiado, SaldoFiado, ServicioFiado } from '../fiado/fiado'
import type { GestionProducto, ServicioPrecios } from '../precios/precios'
import type { Faltante, ServicioStock, StockProducto } from '../stock/stock'
import type { MovimientoCaja, MovimientoDelTurno, ServicioMovimientosCaja } from '../turno/movimientosCaja'
import type { ClienteCaja } from '../pagos/clientes'
import type { Servicios } from '../servicios'
import type { Cliente } from '../tipos'
import type { CierreTurno, TurnoAbierto } from '../turno/turno'
import type { RespuestaRpc } from '../venta/confirmar'
import { catalogoDePrueba } from './caja'
import { servicioProductosFalso } from './productos'

export const CUENTA_CAJA: Cuenta = { usuarioId: 'u-caja', negocioId: 'n1', rol: 'caja' }
export const CUENTA_JEFE: Cuenta = { usuarioId: 'u-jefe', negocioId: 'n1', rol: 'jefe' }

const SIN_TOTALES = { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 }

const CAJA_VACIA: CajaDia = {
  fecha: '2026-10-19',
  ...SIN_TOTALES,
  cobrado: 0,
  anulaciones: { cantidad: 0, total: 0, detalle: [] },
}

/** Auth en memoria. iniciar entra como u-jefe si el email es jefe@kiosco.local; si no, como u-caja. */
export function authFalso(inicial: SesionAuth | null = null) {
  let oyente: ((s: SesionAuth | null) => void) | null = null
  return {
    sesionActual: vi.fn(async () => inicial),
    alCambiar: vi.fn((cb: (s: SesionAuth | null) => void) => {
      oyente = cb
      return () => {
        oyente = null
      }
    }),
    iniciar: vi.fn(async (email: string, _password: string): Promise<ResultadoLogin> => {
      oyente?.({ usuarioId: email === 'jefe@kiosco.local' ? 'u-jefe' : 'u-caja' })
      return 'ok'
    }),
    cerrar: vi.fn(async () => {
      oyente?.(null)
    }),
    /** Simula un evento de Supabase (por ejemplo TOKEN_REFRESHED). */
    emitir(s: SesionAuth | null) {
      oyente?.(s)
    },
  }
}

function turnoFalso() {
  const abierto: TurnoAbierto = { turnoId: 't1', apertura: '2026-10-19T12:00:00Z' }
  return {
    leer: vi.fn(async (): Promise<TurnoAbierto | null> => null),
    abrir: vi.fn(async () => ({ ...abierto, turnoCerrado: null })),
    cerrar: vi.fn(async (): Promise<CierreTurno> => ({
      turnoId: 't1',
      apertura: abierto.apertura,
      cierre: '2026-10-19T20:00:00Z',
      totales: { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0, cobrado: 0 },
    })),
    ultimoCerrado: vi.fn(async (): Promise<CierreTurno | null> => null),
  }
}

const TODOS_LOS_MODULOS: ClaveModulo[] = ['fiado', 'precios', 'movimientos_caja', 'stock', 'varios']

/** Catálogo de módulos con los activos que pasa el test. */
export function modulosDePrueba(activos: readonly ClaveModulo[]): Modulo[] {
  return TODOS_LOS_MODULOS.map((clave) => ({ clave, descripcion: clave, activo: activos.includes(clave) }))
}

/** Servicios de la app en memoria. Sin opciones: hay una cuenta caja y no hay sesión abierta. */
export function serviciosFalsos(
  opciones: {
    sesion?: SesionAuth | null
    cuenta?: Cuenta | null
    config?: ConfigNegocio | null
    estadoAbono?: EstadoAbono | null
    /** Módulos activos del negocio. Por defecto, sólo el fiado. */
    modulos?: ClaveModulo[]
  } = {},
) {
  const productos = servicioProductosFalso()
  const servicios = {
    auth: authFalso(opciones.sesion ?? null),
    leerCuenta: vi.fn(async (usuarioId: string): Promise<Cuenta | null> =>
      opciones.cuenta !== undefined ? opciones.cuenta : usuarioId === 'u-jefe' ? CUENTA_JEFE : CUENTA_CAJA,
    ),
    registrarDispositivo: vi.fn(async (_negocioId: string) => ({ dispositivoId: 'pc-1', prefijo: 'A' })),
    borrarCache: vi.fn(async () => undefined),
    vaciarCacheAjena: vi.fn(async (_negocioId: string) => undefined),
    sincronizarCatalogo: vi.fn(async () => undefined),
    catalogo: catalogoDePrueba(),
    leerRanking: vi.fn(async (): Promise<FilaRanking[]> => []),
    leerModulos: vi.fn(async (): Promise<Modulo[]> => modulosDePrueba(opciones.modulos ?? ['fiado'])),
    clientes: {
      listar: vi.fn(async (): Promise<ClienteCaja[]> => []),
      listarConTelefono: vi.fn(async (): Promise<Cliente[]> => []),
      alta: vi.fn(async (nombre: string, telefono: string | null): Promise<Cliente> => ({ id: 'c1', nombre, telefono })),
    },
    rpc: vi.fn(async (_funcion: 'confirmar_venta', _args: Record<string, unknown>): Promise<RespuestaRpc> => ({ data: null, error: null })),
    turno: vi.fn((_dispositivoId: string) => turnoFalso()),
    productos: vi.fn((_dispositivoId: string) => productos),
    cajaDelDia: vi.fn((_dispositivoId: string) => ({
      hoy: vi.fn(async () => '2026-10-19'),
      leerCaja: vi.fn(async (_fecha: string) => CAJA_VACIA),
      leerVentas: vi.fn(async (_fecha: string): Promise<VentaDelDia[]> => []),
      anular: vi.fn(async (ventaId: string, motivo: string): Promise<AnulacionHecha> => ({
        anulacion_id: 'an1',
        venta_id: ventaId,
        fecha: '2026-10-19T16:00:00Z',
        motivo,
        ya_existia: false,
      })),
    })),
    jefe: {
      cambiarModuloFiado: vi.fn(async (activo: boolean) => activo),
      anonimizarCliente: vi.fn(async (id: string): Promise<Cliente> => ({ id, nombre: 'Cliente suprimido', telefono: null })),
      leerHistorial: vi.fn(async (_despuesDe: CursorHistorial | null): Promise<FilaHistorial[]> => []),
    },
    precios: vi.fn(
      (_dispositivoId: string): ServicioPrecios => ({
        leerGestion: vi.fn(async (): Promise<GestionProducto[]> => []),
        editarGestion: vi.fn(
          async (productoId: string, datos: Omit<GestionProducto, 'producto_id'>): Promise<GestionProducto> => ({
            producto_id: productoId,
            ...datos,
          }),
        ),
        aumentarPrecios: vi.fn(async () => ({ cantidad: 0, ya_existia: false })),
      }),
    ),
    fiado: vi.fn(
      (_dispositivoId: string): ServicioFiado => ({
        leerSaldos: vi.fn(async (): Promise<SaldoFiado[]> => []),
        cobrar: vi.fn(async (pagoId: string, _clienteId: string, _medio: MedioCobroFiado, importe: number) => ({
          pago_id: pagoId,
          fecha: '2026-10-19T16:00:00Z',
          saldo: importe,
          ya_existia: false,
        })),
        fijarLimite: vi.fn(async (_clienteId: string, limite: number | null) => limite),
      }),
    ),
    stock: vi.fn(
      (_dispositivoId: string): ServicioStock => ({
        leerStock: vi.fn(async (): Promise<StockProducto[]> => []),
        leerFaltantes: vi.fn(async (): Promise<Faltante[]> => []),
        ingresar: vi.fn(async () => ({ ya_existia: false })),
        ajustar: vi.fn(async (productoId: string): Promise<StockProducto> => ({ producto_id: productoId, cantidad: 0, minimo: 0 })),
      }),
    ),
    movimientos: vi.fn(
      (_dispositivoId: string): ServicioMovimientosCaja => ({
        fijarMontoInicial: vi.fn(async () => undefined),
        registrar: vi.fn(
          async (): Promise<MovimientoCaja> => ({
            id: 'm1',
            turno_id: 't1',
            dispositivo_id: 'pc-1',
            cuenta_id: 'u-caja',
            fecha: '2026-10-19T16:00:00Z',
            tipo: 'ingreso',
            importe: 1,
            detalle: null,
            ya_existia: false,
          }),
        ),
        listarDelTurno: vi.fn(async (): Promise<MovimientoDelTurno[]> => []),
      }),
    ),
    operador: {
      esOperador: vi.fn(async (): Promise<boolean> => false),
      resumenKioscos: vi.fn(async (): Promise<KioscoResumen[]> => []),
      ficha: vi.fn(
        async (): Promise<FichaKiosco> => ({
          datos: {
            nombreVisible: 'Kiosco',
            logoUrl: null,
            colorPrimario: '#1f4e79',
            clienteDesde: '2026-01-01',
            esDemo: false,
            etiquetas: [],
            contactoNombre: null,
            contactoTelefono: null,
            contactoDireccion: null,
          },
          pcs: [],
          notas: [],
          recordatorios: [],
        }),
      ),
      guardarDatos: vi.fn(async () => undefined),
      subirLogo: vi.fn(async (): Promise<string> => 'https://ejemplo.test/storage/v1/object/public/logos/logo.png'),
      modulosDeKiosco: vi.fn(async (): Promise<ModuloDeKiosco[]> => []),
      cambiarModulo: vi.fn(async () => undefined),
      altaKiosco: vi.fn(async (): Promise<AltaKiosco> => ({ negocioId: 'n-nuevo', cuentas: [] })),
      agregarNota: vi.fn(async () => undefined),
      borrarNota: vi.fn(async () => undefined),
      agregarRecordatorio: vi.fn(async () => undefined),
      completarRecordatorio: vi.fn(async () => undefined),
      historial: vi.fn(async (): Promise<EntradaHistorial[]> => []),
    },
    leerConfig: vi.fn(async (): Promise<ConfigNegocio | null> => opciones.config ?? null),
    leerEstadoAbono: vi.fn(async (): Promise<EstadoAbono | null> =>
      opciones.estadoAbono !== undefined ? opciones.estadoAbono : 'activo',
    ),
  } satisfies Servicios
  return servicios
}
