import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

export interface KioscoResumen {
  negocioId: string
  nombre: string
  nombreVisible: string
  jefeEmail: string | null
  cajaEmail: string | null
  creado: string
  clienteDesde: string
  esDemo: boolean
  etiquetas: string[]
  pcs: number
  modulosActivos: number
  ventasHoy: number
  ventas7d: number
  ventas30d: number
  diasConVentas30d: number
  ultimaVenta: string | null
  recordatoriosHoy: number
  altaEsteMes: boolean
}

export interface ModuloDeKiosco {
  clave: string
  descripcion: string
  activo: boolean
}

export interface DatosAlta {
  nombre: string
  nombreVisible: string
  emailJefe: string
  emailCaja: string
}

/** Las claves sólo viajan en esta respuesta: la pantalla las muestra una vez y no se guardan. */
export interface AltaKiosco {
  negocioId: string
  cuentas: { rol: 'jefe' | 'caja'; email: string; password: string }[]
}

export interface DatosKiosco {
  nombreVisible: string
  logoUrl: string | null
  colorPrimario: string
  clienteDesde: string
  esDemo: boolean
  etiquetas: string[]
  contactoNombre: string | null
  contactoTelefono: string | null
  contactoDireccion: string | null
}

export interface FichaKiosco {
  datos: DatosKiosco
  pcs: { prefijo: string; creado: string; turnoAbierto: boolean }[]
  notas: { id: string; texto: string; creada: string }[]
  recordatorios: { id: string; texto: string; venceEl: string; hechoEn: string | null }[]
}

export interface EntradaHistorial {
  id: string
  fecha: string
  negocioId: string
  kiosco: string
  operador: string
  accion: string
  motivo: string | null
  valorAnterior: Record<string, unknown> | null
  valorNuevo: Record<string, unknown> | null
}

export interface FiltrosHistorial {
  negocioId?: string
  accion?: string
  desde?: string
  hasta?: string
}

/** Lo que hace la cuenta de operador. La base chequea exigir_operador() en cada llamada. */
export interface ServicioOperador {
  esOperador(): Promise<boolean>
  resumenKioscos(): Promise<KioscoResumen[]>
  ficha(negocioId: string): Promise<FichaKiosco>
  guardarDatos(negocioId: string, datos: DatosKiosco, motivo: string): Promise<void>
  subirLogo(negocioId: string, archivo: File): Promise<string>
  modulosDeKiosco(negocioId: string): Promise<ModuloDeKiosco[]>
  cambiarModulo(negocioId: string, clave: string, activo: boolean, motivo: string): Promise<void>
  altaKiosco(datos: DatosAlta): Promise<AltaKiosco>
  agregarNota(negocioId: string, texto: string): Promise<void>
  borrarNota(notaId: string): Promise<void>
  agregarRecordatorio(negocioId: string, texto: string, venceEl: string): Promise<void>
  completarRecordatorio(recordatorioId: string): Promise<void>
  historial(filtros: FiltrosHistorial): Promise<EntradaHistorial[]>
}

interface FilaResumen {
  negocio_id: string
  nombre: string
  nombre_visible: string
  jefe_email: string | null
  caja_email: string | null
  creado: string
  cliente_desde: string
  es_demo: boolean
  etiquetas: string[]
  pcs: number
  modulos_activos: number
  ventas_hoy: number
  ventas_7d: number
  ventas_30d: number
  dias_con_ventas_30d: number
  ultima_venta: string | null
  recordatorios_hoy: number
  alta_este_mes: boolean
}

interface FilaFicha {
  datos: {
    nombre_visible: string
    logo_url: string | null
    color_primario: string
    cliente_desde: string
    es_demo: boolean
    etiquetas: string[]
    contacto_nombre: string | null
    contacto_telefono: string | null
    contacto_direccion: string | null
  }
  pcs: { prefijo: string; creado: string; turno_abierto: boolean }[]
  notas: { id: string; texto: string; creada: string }[]
  recordatorios: { id: string; texto: string; vence_el: string; hecho_en: string | null }[]
}

interface FilaHistorial {
  id: string
  fecha: string
  negocio_id: string
  kiosco: string
  operador: string
  accion: string
  motivo: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
}

interface FilaModulo {
  modulo: string
  descripcion: string
  activo: boolean
}

const MENSAJES_OPERADOR: Record<string, string> = {
  no_operador: 'Esta cuenta no administra kioscos.',
  mfa_requerido: 'Esta cuenta tiene MFA y la sesión no lo confirmó. El panel todavía no pide el código.',
  nombre_invalido: 'El nombre tiene que tener entre 1 y 80 caracteres.',
  nombre_visible_invalido: 'El nombre visible tiene que tener entre 1 y 60 caracteres.',
  email_invalido: 'Revisá los mails: tienen que ser direcciones válidas.',
  emails_iguales: 'El mail del jefe y el de la caja tienen que ser distintos.',
  email_ocupado: 'Ese mail ya tiene una cuenta.',
  kiosco_desconocido: 'Ese kiosco ya no existe.',
  modulo_desconocido: 'Ese módulo no existe.',
  motivo_invalido: 'El motivo tiene que tener entre 3 y 200 caracteres.',
  color_invalido: 'El color tiene que ser #RRGGBB.',
  logo_invalido: 'El logo tiene que ser PNG, JPG o WebP, de hasta 300 KB.',
  fecha_invalida: 'Revisá la fecha.',
  etiquetas_invalidas: 'Hasta 10 etiquetas, de 1 a 30 caracteres cada una.',
  contacto_invalido: 'Un dato de contacto es demasiado largo.',
  texto_invalido: 'El texto está vacío o es demasiado largo.',
  nota_desconocida: 'Esa nota ya no existe.',
  recordatorio_desconocido: 'Ese recordatorio ya no existe.',
  red: 'No se pudo contactar al servidor. Revisá la conexión y probá de nuevo.',
}

export function mensajeOperador(e: unknown): string {
  return MENSAJES_OPERADOR[codigoDeError(e)] ?? 'No se pudo completar. Probá de nuevo.'
}

/** Código del cuerpo de la función ({ error }); 'red' si no llegó ninguna respuesta. */
async function codigoDeRespuesta(e: unknown): Promise<string> {
  const respuesta = (e as { context?: unknown }).context
  if (!(respuesta instanceof Response)) return 'red'
  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null
  return cuerpo?.error ?? 'alta_fallida'
}

const TIPOS_LOGO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const TAMANIO_MAXIMO_LOGO = 300 * 1024

export function crearServicioOperador(supabase: SupabaseClient): ServicioOperador {
  return {
    async esOperador() {
      const { data, error } = await supabase.rpc('es_operador')
      if (error) throw error
      return data === true
    },
    async resumenKioscos() {
      const { data, error } = await supabase.rpc('resumen_kioscos')
      if (error) throw error
      return (data as FilaResumen[]).map((f) => ({
        negocioId: f.negocio_id,
        nombre: f.nombre,
        nombreVisible: f.nombre_visible,
        jefeEmail: f.jefe_email,
        cajaEmail: f.caja_email,
        creado: f.creado,
        clienteDesde: f.cliente_desde,
        esDemo: f.es_demo,
        etiquetas: f.etiquetas,
        pcs: f.pcs,
        modulosActivos: f.modulos_activos,
        ventasHoy: f.ventas_hoy,
        ventas7d: f.ventas_7d,
        ventas30d: f.ventas_30d,
        diasConVentas30d: f.dias_con_ventas_30d,
        ultimaVenta: f.ultima_venta,
        recordatoriosHoy: f.recordatorios_hoy,
        altaEsteMes: f.alta_este_mes,
      }))
    },
    async ficha(negocioId) {
      const { data, error } = await supabase.rpc('ficha_kiosco', { p_negocio: negocioId })
      if (error) throw error
      const f = data as FilaFicha
      return {
        datos: {
          nombreVisible: f.datos.nombre_visible,
          logoUrl: f.datos.logo_url,
          colorPrimario: f.datos.color_primario,
          clienteDesde: f.datos.cliente_desde,
          esDemo: f.datos.es_demo,
          etiquetas: f.datos.etiquetas,
          contactoNombre: f.datos.contacto_nombre,
          contactoTelefono: f.datos.contacto_telefono,
          contactoDireccion: f.datos.contacto_direccion,
        },
        pcs: f.pcs.map((p) => ({ prefijo: p.prefijo, creado: p.creado, turnoAbierto: p.turno_abierto })),
        notas: f.notas,
        recordatorios: f.recordatorios.map((r) => ({
          id: r.id,
          texto: r.texto,
          venceEl: r.vence_el,
          hechoEn: r.hecho_en,
        })),
      }
    },
    async guardarDatos(negocioId, datos, motivo) {
      const { error } = await supabase.rpc('guardar_datos_kiosco', {
        p_negocio: negocioId,
        p_nombre_visible: datos.nombreVisible,
        p_color_primario: datos.colorPrimario,
        p_logo_url: datos.logoUrl,
        p_cliente_desde: datos.clienteDesde,
        p_etiquetas: datos.etiquetas,
        p_es_demo: datos.esDemo,
        p_contacto_nombre: datos.contactoNombre,
        p_contacto_telefono: datos.contactoTelefono,
        p_contacto_direccion: datos.contactoDireccion,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    async subirLogo(negocioId, archivo) {
      const extension = TIPOS_LOGO[archivo.type]
      if (!extension || archivo.size > TAMANIO_MAXIMO_LOGO) throw new Error('logo_invalido')
      const ruta = `${negocioId}/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('logos').upload(ruta, archivo, { contentType: archivo.type })
      if (error) throw error
      return supabase.storage.from('logos').getPublicUrl(ruta).data.publicUrl
    },
    async modulosDeKiosco(negocioId) {
      const { data, error } = await supabase.rpc('modulos_de_kiosco', { p_negocio: negocioId })
      if (error) throw error
      return (data as FilaModulo[]).map((f) => ({ clave: f.modulo, descripcion: f.descripcion, activo: f.activo }))
    },
    async cambiarModulo(negocioId, clave, activo, motivo) {
      const { error } = await supabase.rpc('cambiar_modulo_kiosco', {
        p_negocio: negocioId,
        p_modulo: clave,
        p_activo: activo,
        p_motivo: motivo,
      })
      if (error) throw error
    },
    async altaKiosco(datos) {
      const { data, error } = await supabase.functions.invoke<AltaKiosco>('alta-kiosco', { body: datos })
      if (error) throw new Error(await codigoDeRespuesta(error))
      return data as AltaKiosco
    },
    async agregarNota(negocioId, texto) {
      const { error } = await supabase.rpc('agregar_nota', { p_negocio: negocioId, p_texto: texto })
      if (error) throw error
    },
    async borrarNota(notaId) {
      const { error } = await supabase.rpc('borrar_nota', { p_nota: notaId })
      if (error) throw error
    },
    async agregarRecordatorio(negocioId, texto, venceEl) {
      const { error } = await supabase.rpc('agregar_recordatorio', {
        p_negocio: negocioId,
        p_texto: texto,
        p_vence_el: venceEl,
      })
      if (error) throw error
    },
    async completarRecordatorio(recordatorioId) {
      const { error } = await supabase.rpc('completar_recordatorio', { p_recordatorio: recordatorioId })
      if (error) throw error
    },
    async historial(filtros) {
      const { data, error } = await supabase.rpc('listar_historial_operador', {
        p_negocio: filtros.negocioId ?? null,
        p_accion: filtros.accion ?? null,
        p_desde: filtros.desde ?? null,
        p_hasta: filtros.hasta ?? null,
      })
      if (error) throw error
      return (data as FilaHistorial[]).map((h) => ({
        id: h.id,
        fecha: h.fecha,
        negocioId: h.negocio_id,
        kiosco: h.kiosco,
        operador: h.operador,
        accion: h.accion,
        motivo: h.motivo,
        valorAnterior: h.valor_anterior,
        valorNuevo: h.valor_nuevo,
      }))
    },
  }
}
