import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aConfig, aplicarConfig, leerConfigNegocio, leerEstadoAbonoNegocio, logoPermitido } from './config'

const SUPABASE = 'https://abcd.supabase.co'

function supabaseFalso(respuesta: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => respuesta)
  const select = vi.fn((_columnas: string) => ({ maybeSingle }))
  const from = vi.fn((_tabla: string) => ({ select }))
  return { cliente: { from } as unknown as SupabaseClient, from, select }
}

afterEach(() => {
  document.documentElement.style.removeProperty('--color-primario')
  document.title = ''
})

describe('config visual del negocio', () => {
  it('conserva un logo guardado en el Supabase del proyecto', () => {
    const logo = `${SUPABASE}/storage/v1/object/public/logos/kiosco.png`
    expect(logoPermitido(logo, SUPABASE)).toBe(logo)
  })

  it('descarta un logo de otro origen, sin https o mal escrito (la CSP no lo dejaría cargar)', () => {
    expect(logoPermitido('https://otro.ejemplo/logo.png', SUPABASE)).toBeNull()
    expect(logoPermitido('http://abcd.supabase.co/logo.png', SUPABASE)).toBeNull()
    expect(logoPermitido('no es una url', SUPABASE)).toBeNull()
    expect(logoPermitido(null, SUPABASE)).toBeNull()
  })

  it('aplica el color primario y el nombre visible; la vuelta atrás deja la pantalla genérica', () => {
    document.title = 'Caja'
    const config = aConfig({ nombre_visible: 'Kiosco Don Beto', logo_url: null, color_primario: '#aa3300' }, SUPABASE)
    const volver = aplicarConfig(config)
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('#aa3300')
    expect(document.title).toBe('Kiosco Don Beto')
    volver()
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('')
    expect(document.title).toBe('Caja')
  })

  it('un color mal escrito no se aplica', () => {
    const config = aConfig({ nombre_visible: 'Kiosco', logo_url: null, color_primario: 'red; background: url(x)' }, SUPABASE)
    expect(config.colorPrimario).toBeNull()
    aplicarConfig(config)
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('')
  })

  it('lee config_negocio (RLS: su propio negocio) y devuelve null si no hay fila', async () => {
    const { cliente, from, select } = supabaseFalso({
      data: { nombre_visible: 'Kiosco A', logo_url: null, color_primario: '#1f4e79' },
      error: null,
    })
    expect(await leerConfigNegocio(cliente, SUPABASE)).toEqual({
      nombreVisible: 'Kiosco A',
      logoUrl: null,
      colorPrimario: '#1f4e79',
    })
    expect(from).toHaveBeenCalledWith('config_negocio')
    expect(select).toHaveBeenCalledWith('nombre_visible, logo_url, color_primario')
    expect(await leerConfigNegocio(supabaseFalso({ data: null, error: null }).cliente, SUPABASE)).toBeNull()
  })

  it('lee el estado del abono desde negocios', async () => {
    const { cliente, from, select } = supabaseFalso({ data: { estado_abono: 'gracia' }, error: null })
    expect(await leerEstadoAbonoNegocio(cliente)).toBe('gracia')
    expect(from).toHaveBeenCalledWith('negocios')
    expect(select).toHaveBeenCalledWith('estado_abono')
  })
})
