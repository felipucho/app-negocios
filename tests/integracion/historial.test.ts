import { describe, expect, it } from 'vitest'
import { crearServicioJefe, PAGINA_HISTORIAL, type CursorHistorial } from '../../src/jefe/jefe'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

describe('leerHistorial (páginas por cursor)', () => {
  it('recorre todo el historial sin repetir ni saltear filas, aunque muchas tengan la misma fecha', async () => {
    const kiosco = await crearKioscoDePrueba('Historial de prueba')
    const admin = clienteAdmin()
    // Un alta masiva (por ejemplo desde Studio) deja muchas filas con la misma fecha: el id desempata.
    // Las fechas llevan microsegundos y offset, como las devuelve PostgREST.
    const fechas = [
      ...Array.from({ length: 250 }, () => '2026-10-19T15:00:00.123456+00:00'),
      ...Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, 20, 10, 0, i)).toISOString()),
    ]
    const insertado = await admin.from('historial').insert(
      fechas.map((fecha) => ({
        negocio_id: kiosco.negocioId,
        tipo: 'cambio_precio',
        fecha,
        entidad: 'productos',
        entidad_id: crypto.randomUUID(),
        valor_anterior: { precio: 900 },
        valor_nuevo: { precio: 1000 },
      })),
    )
    if (insertado.error) throw insertado.error

    const orden = await admin
      .from('historial')
      .select('id')
      .eq('negocio_id', kiosco.negocioId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
    if (orden.error) throw orden.error
    const esperado = (orden.data as { id: string }[]).map((f) => f.id)
    expect(esperado).toHaveLength(fechas.length)

    const jefe = crearServicioJefe(kiosco.jefe.cliente)
    const leidas: string[] = []
    let despuesDe: CursorHistorial | null = null
    for (let pagina = 0; pagina < 10; pagina++) {
      const filas = await jefe.leerHistorial(despuesDe)
      leidas.push(...filas.map((f) => f.id))
      if (filas.length < PAGINA_HISTORIAL) break
      const ultima = filas[filas.length - 1]
      despuesDe = { fecha: ultima.fecha, id: ultima.id }
    }
    expect(leidas).toEqual(esperado)
  })
})
