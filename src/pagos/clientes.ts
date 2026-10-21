import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cliente } from '../tipos'

/** Lo que la caja lee de un cliente: el teléfono de terceros no le hace falta y no se lo trae. */
export type ClienteCaja = Pick<Cliente, 'id' | 'nombre'>

/** Clientes del fiado. Datos personales de terceros (Ley 25.326): sólo nombre o alias y teléfono. */
export interface ServicioClientes {
  listar(): Promise<ClienteCaja[]>
  /** alta_cliente (tarea 9): sólo con el módulo fiado activo. Errores: nombre_invalido, telefono_invalido, fiado_deshabilitado. */
  alta(nombre: string, telefono: string | null): Promise<Cliente>
}

/** El módulo lo decide la base (modulo_activo, tarea 9). La pantalla sólo lo usa para mostrar u ocultar. */
export async function fiadoActivo(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('modulo_activo', { p_clave: 'fiado' })
  if (error) throw error
  return data === true
}

export function crearServicioClientes(supabase: SupabaseClient): ServicioClientes {
  return {
    async listar() {
      // RLS deja ver sólo los clientes del negocio del token. Los suprimidos no reciben fiado nuevo.
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre')
        .eq('suprimido', false)
        .order('nombre')
      if (error) throw error
      return data as ClienteCaja[]
    },
    async alta(nombre, telefono) {
      const { data, error } = await supabase.rpc('alta_cliente', { p_nombre: nombre, p_telefono: telefono })
      if (error) throw error
      return data as Cliente
    },
  }
}
