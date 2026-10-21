import type { SupabaseClient } from '@supabase/supabase-js'
import type { Producto } from '../tipos'

/** Máximo de filas por pedido de la API de Supabase (V13). */
export const PAGINA_CATALOGO = 1000

export interface VersionCatalogo {
  negocioId: string
  version: number
}

export interface FuenteCatalogo {
  leerVersion(): Promise<VersionCatalogo>
  leerProductos(): Promise<Producto[]>
}

export function crearFuenteSupabase(supabase: SupabaseClient): FuenteCatalogo {
  return {
    async leerVersion() {
      // RLS deja ver sólo el negocio del token: una fila.
      const { data, error } = await supabase.from('negocios').select('id, catalogo_version').single()
      if (error) throw error
      return { negocioId: data.id as string, version: Number(data.catalogo_version) }
    },
    async leerProductos() {
      const todos: Producto[] = []
      for (let desde = 0; ; desde += PAGINA_CATALOGO) {
        const { data, error } = await supabase
          .from('productos')
          .select('id, nombre, precio, codigo_barras, activo, creado_en_caja')
          .order('id')
          .range(desde, desde + PAGINA_CATALOGO - 1)
        if (error) throw error
        todos.push(...(data as Producto[]))
        if (data.length < PAGINA_CATALOGO) return todos
      }
    },
  }
}
