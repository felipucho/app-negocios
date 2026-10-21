import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { armarCaja, BIZCOCHOS, catalogoDePrueba, CHIPA, escanear, FACTURAS, tipear, type Usuario } from '../test/caja'
import type { ProductoCache } from '../tipos'
import type { FilaRanking } from './ranking'

const RANKING: FilaRanking[] = [
  { producto_id: 'p6', nombre: 'Facturas', cantidad_ventas: 5 },
  { producto_id: 'p4', nombre: 'Bizcochos', cantidad_ventas: 2 },
  { producto_id: 'p5', nombre: 'Chipá', cantidad_ventas: 2 },
]

async function campoListo(user: Usuario) {
  const campo = await screen.findByLabelText('Escanear o buscar')
  await user.click(campo)
  return campo
}

const grilla = () => screen.getByRole('group', { name: 'Grilla sin código' })
const sinGrilla = () => expect(screen.queryByRole('group', { name: 'Grilla sin código' })).toBeNull()
const nombresEnGrilla = () =>
  within(grilla())
    .getAllByRole('button')
    .map((b) => b.firstElementChild?.textContent)

describe('Panel "Sin código (F2)"', () => {
  it('F2 abre la grilla en el orden del ranking, sin desactivados ni productos con código', async () => {
    const { user, reloj } = armarCaja({ ranking: RANKING })
    await campoListo(user)
    await tipear(user, reloj, '{F2}')
    await waitFor(() => expect(nombresEnGrilla()).toEqual(['Facturas', 'Bizcochos', 'Chipá']))
  })

  it('cada toque suma una unidad, el panel queda abierto y el foco no sale del campo', async () => {
    const { user, reloj, pitar } = armarCaja({ ranking: RANKING })
    const campo = await campoListo(user)
    await tipear(user, reloj, '{F2}')
    const boton = await within(grilla()).findByRole('button', { name: /Bizcochos/ })
    expect(boton).toHaveAttribute('tabindex', '-1')
    await user.click(boton)
    await user.click(boton)
    const fila = screen.getByRole('row', { name: /Bizcochos/ })
    expect(within(fila).getByText('2')).toBeInTheDocument()
    expect(grilla()).toBeInTheDocument()
    expect(campo).toHaveFocus()
    expect(pitar).toHaveBeenCalledTimes(2)
  })

  it('escribir con el panel abierto filtra la grilla y no abre sugerencias', async () => {
    const { user, reloj } = armarCaja({ ranking: RANKING })
    await campoListo(user)
    await tipear(user, reloj, '{F2}')
    await waitFor(() => expect(nombresEnGrilla()).toHaveLength(3))
    await tipear(user, reloj, 'chi')
    await waitFor(() => expect(nombresEnGrilla()).toEqual(['Chipá']))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('un escaneo agrega el producto y cierra el panel', async () => {
    const { user, reloj } = armarCaja({ ranking: RANKING })
    const campo = await campoListo(user)
    await tipear(user, reloj, '{F2}')
    await waitFor(() => expect(nombresEnGrilla()).toHaveLength(3))
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    sinGrilla()
    expect(campo).toHaveFocus()
  })

  it('Esc y F2 cierran el panel', async () => {
    const { user, reloj } = armarCaja({ ranking: RANKING })
    await campoListo(user)
    await tipear(user, reloj, '{F2}')
    expect(grilla()).toBeInTheDocument()
    await tipear(user, reloj, '{Escape}')
    sinGrilla()
    await tipear(user, reloj, '{F2}')
    expect(grilla()).toBeInTheDocument()
    await tipear(user, reloj, '{F2}')
    sinGrilla()
  })

  it('el botón "Sin código (F2)" abre el panel sin sacar el foco del campo', async () => {
    const { user } = armarCaja({ ranking: RANKING })
    const campo = await campoListo(user)
    const boton = screen.getByRole('button', { name: 'Sin código (F2)' })
    expect(boton).toHaveAttribute('tabindex', '-1')
    await user.click(boton)
    expect(grilla()).toBeInTheDocument()
    expect(campo).toHaveFocus()
  })

  it('el ranking se pide una vez por turno y queda fijo', async () => {
    const { user, reloj, leerRanking } = armarCaja({ ranking: RANKING })
    await campoListo(user)
    await waitFor(() => expect(leerRanking).toHaveBeenCalledTimes(1))
    await tipear(user, reloj, '{F2}')
    await tipear(user, reloj, '{F2}')
    await tipear(user, reloj, '{F2}')
    await waitFor(() => expect(nombresEnGrilla()).toHaveLength(3))
    expect(leerRanking).toHaveBeenCalledTimes(1)
  })

  it('si el ranking falla, la grilla queda en orden alfabético', async () => {
    const { user, reloj } = armarCaja({ ranking: 'falla' })
    await campoListo(user)
    await tipear(user, reloj, '{F2}')
    await waitFor(() => expect(nombresEnGrilla()).toEqual(['Bizcochos', 'Chipá', 'Facturas']))
  })

  it('abrir el cobro cierra el panel y F2 no lo reabre', async () => {
    const { user, reloj } = armarCaja({ ranking: RANKING })
    await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await tipear(user, reloj, '{F2}')
    expect(grilla()).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    expect(screen.getByText('Cobro abierto')).toBeInTheDocument()
    sinGrilla()
    await tipear(user, reloj, '{F2}')
    sinGrilla()
  })

  it('sin turno no pide el ranking; al abrir el turno lo pide una vez', async () => {
    const { user, leerRanking } = armarCaja({ turnoAbierto: false, ranking: RANKING })
    const abrir = await screen.findByRole('button', { name: 'Abrir turno' })
    expect(leerRanking).not.toHaveBeenCalled()
    await user.click(abrir)
    await screen.findByLabelText('Escanear o buscar')
    await waitFor(() => expect(leerRanking).toHaveBeenCalledTimes(1))
  })

  it('una respuesta vieja de sinCodigo no pisa la del último F2', async () => {
    const pendientes: ((productos: ProductoCache[]) => void)[] = []
    const catalogo = {
      ...catalogoDePrueba(),
      sinCodigo: () => new Promise<ProductoCache[]>((resolver) => pendientes.push(resolver)),
    }
    const { user, reloj } = armarCaja({ catalogo })
    await campoListo(user)
    await tipear(user, reloj, '{F2}{F2}{F2}')
    expect(pendientes).toHaveLength(2)
    await act(async () => pendientes[1]([BIZCOCHOS, CHIPA, FACTURAS]))
    await act(async () => pendientes[0]([BIZCOCHOS]))
    expect(nombresEnGrilla()).toEqual(['Bizcochos', 'Chipá', 'Facturas'])
  })
})
