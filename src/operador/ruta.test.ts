import { describe, expect, it } from 'vitest'
import { aHash, leerRuta } from './ruta'

const ID = '6f1c0e8a-2b3d-4e5f-8a9b-0c1d2e3f4a5b'

describe('leerRuta', () => {
  it('reconoce cada sección', () => {
    expect(leerRuta('')).toEqual({ tipo: 'inicio' })
    expect(leerRuta('#/historial')).toEqual({ tipo: 'historial' })
    expect(leerRuta('#/nuevo')).toEqual({ tipo: 'nuevo' })
    expect(leerRuta('#/kioscos')).toEqual({ tipo: 'kioscos', filtro: null })
    expect(leerRuta('#/kioscos?filtro=sin_actividad')).toEqual({ tipo: 'kioscos', filtro: 'sin_actividad' })
  })

  it('lee el kiosco y su pestaña; sin pestaña, Resumen', () => {
    expect(leerRuta(`#/kioscos/${ID}/datos`)).toEqual({ tipo: 'kiosco', negocioId: ID, pestania: 'datos' })
    expect(leerRuta(`#/kioscos/${ID}`)).toEqual({ tipo: 'kiosco', negocioId: ID, pestania: 'resumen' })
  })

  it('un id que no es uuid cae en la lista, y lo que no se conoce en Inicio', () => {
    expect(leerRuta('#/kioscos/no-es-un-id/datos')).toEqual({ tipo: 'kioscos', filtro: null })
    expect(leerRuta('#/cualquier-cosa')).toEqual({ tipo: 'inicio' })
  })
})

describe('aHash', () => {
  it('vuelve a leer la misma dirección', () => {
    const ruta = { tipo: 'kiosco', negocioId: ID, pestania: 'historial' } as const
    expect(leerRuta(aHash(ruta))).toEqual(ruta)
  })
})
