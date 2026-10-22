import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CatalogoCaja } from '../caja/catalogoCaja'
import { PantallaCaja, type SesionCobro } from '../caja/PantallaCaja'
import type { FilaRanking } from '../caja/ranking'
import type { ServicioProductos } from '../productos/productos'
import { buscarPorNombre } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'
import type { AperturaTurno, CierreTurno } from '../turno/turno'

function producto(id: string, nombre: string, precio: number, codigo_barras: string | null, activo = true): ProductoCache {
  return { id, nombre, precio, codigo_barras, activo, creado_en_caja: false, palabras: palabras(nombre) }
}

export const ALFAJOR = producto('p1', 'Alfajor triple', 900, '7790001')
export const AGUA = producto('p2', 'Agua mineral', 1200, 'ABC-55')
export const ALFAJOR_SIMPLE = producto('p3', 'Alfajor simple', 600, '7790003')
export const BIZCOCHOS = producto('p4', 'Bizcochos', 500, null)
export const CHIPA = producto('p5', 'Chipá', 800, null)
export const FACTURAS = producto('p6', 'Facturas', 300, null)
export const PAN_VIEJO = producto('p7', 'Pan de ayer', 200, null, false)
export const TURRON_VIEJO = producto('p8', 'Turrón viejo', 400, '7790008', false)

export const PRODUCTOS_DE_PRUEBA: readonly ProductoCache[] = [
  ALFAJOR, AGUA, ALFAJOR_SIMPLE, BIZCOCHOS, CHIPA, FACTURAS, PAN_VIEJO, TURRON_VIEJO,
]

export function catalogoDePrueba(productos: readonly ProductoCache[] = PRODUCTOS_DE_PRUEBA): CatalogoCaja {
  return {
    porCodigo: async (codigo) => productos.find((p) => p.codigo_barras === codigo),
    porNombre: async (consulta) => buscarPorNombre(productos, consulta),
    sinCodigo: async () => productos.filter((p) => p.activo && p.codigo_barras === null),
  }
}

/** Reloj controlado: tipeo a 200 ms entre teclas; escáner con pausa previa y 5 ms entre caracteres. */
export function relojDePrueba() {
  let t = 1_000
  let paso = 200
  return {
    ahora: () => (t += paso),
    tipeo() {
      paso = 200
    },
    escaner() {
      t += 1_000
      paso = 5
    },
  }
}

export type Reloj = ReturnType<typeof relojDePrueba>
export type Usuario = ReturnType<typeof userEvent.setup>

export function turnoDePrueba(abierto: boolean) {
  const turno = { turnoId: 't1', apertura: '2026-10-19T12:00:00Z' }
  return {
    leer: vi.fn(async () => (abierto ? turno : null)),
    abrir: vi.fn(async (): Promise<AperturaTurno> => ({ ...turno, turnoCerrado: null })),
    ultimoCerrado: vi.fn(async (): Promise<CierreTurno | null> => null),
  }
}

export async function escanear(user: Usuario, reloj: Reloj, codigo: string) {
  reloj.escaner()
  await user.keyboard(`${codigo}{Enter}`)
}

export async function tipear(user: Usuario, reloj: Reloj, texto: string) {
  reloj.tipeo()
  await user.keyboard(texto)
}

export interface OpcionesCaja {
  turnoAbierto?: boolean
  productos?: readonly ProductoCache[]
  catalogo?: CatalogoCaja
  turno?: ReturnType<typeof turnoDePrueba>
  /** Respuesta de ranking_sin_codigo; 'falla' simula un error de red. */
  ranking?: FilaRanking[] | 'falla'
  /** Alta rápida y reactivar (tarea 15). Sin esto, la caja sólo avisa, como en las tareas 12 y 13. */
  servicioProductos?: ServicioProductos
}

export function armarCaja(opciones: OpcionesCaja = {}) {
  const reloj = relojDePrueba()
  const pitar = vi.fn()
  const turno = opciones.turno ?? turnoDePrueba(opciones.turnoAbierto ?? true)
  const leerRanking = vi.fn(async (): Promise<FilaRanking[]> => {
    if (opciones.ranking === 'falla') throw new Error('sin red')
    return opciones.ranking ?? []
  })
  const sesiones: SesionCobro[] = []
  const user = userEvent.setup()
  render(
    <PantallaCaja
      catalogo={opciones.catalogo ?? catalogoDePrueba(opciones.productos)}
      turno={turno}
      leerRanking={leerRanking}
      productos={opciones.servicioProductos}
      ahora={reloj.ahora}
      pitar={pitar}
      cobro={(s) => {
        sesiones.push(s)
        return <p>Cobro abierto</p>
      }}
    />,
  )
  return { reloj, pitar, turno, leerRanking, sesiones, user }
}
