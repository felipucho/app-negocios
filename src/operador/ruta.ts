import { useMemo, useSyncExternalStore } from 'react'

export type Pestania = 'resumen' | 'datos' | 'historial'

export type Ruta =
  | { tipo: 'inicio' }
  | { tipo: 'kioscos'; filtro: string | null }
  | { tipo: 'kiosco'; negocioId: string; pestania: Pestania }
  | { tipo: 'planes' }
  | { tipo: 'historial' }
  | { tipo: 'nuevo' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PESTANIAS = ['resumen', 'datos', 'historial'] as const

/** Lee la dirección del panel (#/kioscos/<id>/datos). Lo que no se reconoce cae en Inicio. */
export function leerRuta(hash: string): Ruta {
  const [camino = '', consulta = ''] = hash.replace(/^#\/?/, '').split('?')
  const [seccion, negocioId, pestania] = camino.split('/')
  if (seccion === 'kioscos' && negocioId && UUID.test(negocioId)) {
    const pestaniaValida = PESTANIAS.find((p) => p === pestania) ?? 'resumen'
    return { tipo: 'kiosco', negocioId, pestania: pestaniaValida }
  }
  if (seccion === 'kioscos') return { tipo: 'kioscos', filtro: new URLSearchParams(consulta).get('filtro') }
  if (seccion === 'planes') return { tipo: 'planes' }
  if (seccion === 'historial') return { tipo: 'historial' }
  if (seccion === 'nuevo') return { tipo: 'nuevo' }
  return { tipo: 'inicio' }
}

export function aHash(ruta: Ruta): string {
  switch (ruta.tipo) {
    case 'inicio':
      return '#/inicio'
    case 'kioscos':
      return ruta.filtro ? `#/kioscos?filtro=${ruta.filtro}` : '#/kioscos'
    case 'kiosco':
      return `#/kioscos/${ruta.negocioId}/${ruta.pestania}`
    case 'planes':
      return '#/planes'
    case 'historial':
      return '#/historial'
    case 'nuevo':
      return '#/nuevo'
  }
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener('hashchange', avisar)
  return () => window.removeEventListener('hashchange', avisar)
}

/** La dirección actual: cambia con los enlaces y con el botón atrás del navegador. */
export function useRuta(): Ruta {
  const hash = useSyncExternalStore(suscribir, () => window.location.hash)
  return useMemo(() => leerRuta(hash), [hash])
}
