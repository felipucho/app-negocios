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
  planCodigo: string | null
  planNombre: string | null
  extras: number
  quitados: number
}

/** derecho: lo da el plan o un extra. uso: lo que el jefe prendió. activo: derecho, uso y dependencias prendidas. */
export interface ModuloDeKiosco {
  clave: string
  descripcion: string
  enPlan: boolean
  excepcion: 'agregado' | 'quitado' | null
  derecho: boolean
  uso: boolean
  activo: boolean
  faltan: string[]
}

export interface PlanOperador {
  id: string
  codigo: string
  nombre: string
  descripcion: string
  activo: boolean
  modulos: number
}

export interface PlanDeKiosco {
  codigo: string
  nombre: string
  extras: number
  quitados: number
}

export interface EfectoPlan {
  clave: string
  descripcion: string
  efecto: 'gana' | 'pierde' | 'igual'
  uso: boolean
}

/** Lo que gana o pierde un kiosco si su plan queda con otros módulos. 'pierde' con uso se apaga al guardar. */
export interface EfectoEdicionPlan extends EfectoPlan {
  negocioId: string
  kiosco: string
}

/** Un módulo del catálogo: si el plan lo incluye y qué módulos requiere. */
export interface ModuloDePlan {
  clave: string
  descripcion: string
  enPlan: boolean
  requiere: string[]
}

export interface DatosPlan {
  nombre: string
  descripcion: string
  modulos: string[]
}

/** Lo que carga el operador al dar de alta: las cuentas (clave vacía = se genera), los datos del cliente y el contacto del dueño. */
export interface DatosAlta {
  nombre: string
  nombreVisible: string
  emailJefe: string
  emailCaja: string
  claveJefe: string
  claveCaja: string
  colorPrimario: string
  clienteDesde: string
  esDemo: boolean
  etiquetas: string[]
  contactoNombre: string
  contactoTelefono: string
  contactoDireccion: string
}

/** Las claves generadas sólo viajan en esta respuesta: la pantalla las muestra una vez y no se guardan. Null = la eligió el operador. */
export interface AltaKiosco {
  negocioId: string
  cuentas: { rol: 'jefe' | 'caja'; email: string; password: string | null }[]
}

export interface DatosRestablecer {
  negocioId: string
  rol: 'jefe' | 'caja'
  motivo: string
  clave: string
}

/** La generada sólo viaja en esta respuesta. Null = la cargó el operador. sesionesCerradas false = la clave cambió pero no se cerraron las sesiones abiertas. */
export interface ClaveRestablecida {
  rol: 'jefe' | 'caja'
  email: string
  password: string | null
  sesionesCerradas: boolean
}

export type DatosCerrarSesiones = Omit<DatosRestablecer, 'clave'>

/** sesionesCerradas false = el pedido quedó en el historial, pero las sesiones siguen abiertas. */
export interface SesionesCerradas {
  rol: 'jefe' | 'caja'
  sesionesCerradas: boolean
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
  plan: PlanDeKiosco | null
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
  listarPlanes(): Promise<PlanOperador[]>
  previsualizarPlan(negocioId: string, planId: string): Promise<EfectoPlan[]>
  fijarPlan(negocioId: string, planId: string, motivo: string): Promise<void>
  modulosDePlan(planId: string): Promise<ModuloDePlan[]>
  previsualizarGuardarPlan(planId: string, modulos: string[]): Promise<EfectoEdicionPlan[]>
  guardarPlan(planId: string, datos: DatosPlan, motivo: string): Promise<void>
  fijarExcepcion(negocioId: string, clave: string, permite: boolean | null, motivo: string): Promise<void>
  altaKiosco(datos: DatosAlta): Promise<AltaKiosco>
  restablecerClave(datos: DatosRestablecer): Promise<ClaveRestablecida>
  cerrarSesiones(datos: DatosCerrarSesiones): Promise<SesionesCerradas>
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
  plan: PlanDeKiosco | null
}

interface FilaPlanKiosco {
  negocio_id: string
  plan_codigo: string
  plan_nombre: string
  extras: number
  quitados: number
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

type FilaModulo = Omit<ModuloDeKiosco, 'enPlan'> & { en_plan: boolean }

type FilaEfectoEdicion = Omit<EfectoEdicionPlan, 'negocioId'> & { negocio_id: string }

const MENSAJES_OPERADOR: Record<string, string> = {
  no_operador: 'Esta cuenta no administra kioscos.',
  mfa_requerido: 'Esta cuenta tiene MFA y la sesión no lo confirmó. El panel todavía no pide el código.',
  nombre_invalido: 'El nombre tiene que tener entre 1 y 80 caracteres.',
  nombre_visible_invalido: 'El nombre visible tiene que tener entre 1 y 60 caracteres.',
  nombre_plan_invalido: 'El nombre del plan tiene que tener entre 1 y 60 caracteres.',
  descripcion_invalida: 'La descripción tiene que tener hasta 200 caracteres.',
  email_invalido: 'Revisá los mails: tienen que ser direcciones válidas.',
  emails_iguales: 'El mail del jefe y el de la caja tienen que ser distintos.',
  email_ocupado: 'Ese mail ya tiene una cuenta.',
  clave_invalida: 'Cada clave tiene que tener entre 8 y 72 caracteres, sin espacios al principio ni al final.',
  clave_debil: 'El servidor no acepta esa clave. Probá una más larga o más variada.',
  kiosco_desconocido: 'Ese kiosco ya no existe.',
  sin_derecho: 'Ese módulo no está en el plan del kiosco. Agregalo como extra o cambiá de plan.',
  dependencia_inactiva: 'Antes prendé: {detalle}.',
  dependencia_sin_derecho: 'Para dar este extra primero hay que dar: {detalle}.',
  modulo_requerido: 'Antes apagá: {detalle}, porque lo necesitan.',
  plan_desconocido: 'Ese plan ya no existe. Recargá la página y elegí otro.',
  id_repetido: 'Esa operación ya se registró con otros datos. Recargá la página y probá de nuevo.',
  pedido_invalido: 'El pedido no es válido. Recargá la página y probá de nuevo.',
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
  metodo_no_permitido: 'Esa operación no está permitida. Recargá la página y probá de nuevo.',
  restablecer_fallido: 'No se pudo restablecer la clave. Probá de nuevo.',
  cerrar_sesiones_fallido: 'No se pudieron cerrar las sesiones. Probá de nuevo.',
  rol_invalido: 'Elegí si la cuenta es la del jefe o la de la caja.',
  cuenta_desconocida: 'Ese kiosco no tiene una cuenta con ese rol.',
  red: 'No se pudo contactar al servidor. Revisá la conexión y probá de nuevo.',
}

/** Textos para cuando la base no trae las claves en detalle. */
const SIN_DETALLE: Record<string, string> = {
  dependencia_inactiva: 'Antes prendé los módulos de los que depende.',
  dependencia_sin_derecho: 'Para dar este extra primero hay que dar los módulos de los que depende.',
  modulo_requerido: 'Antes apagá los módulos que lo necesitan.',
}

export function mensajeOperador(e: unknown): string {
  const codigo = codigoDeError(e)
  const mensaje = MENSAJES_OPERADOR[codigo] ?? 'No se pudo completar. Probá de nuevo.'
  if (!mensaje.includes('{detalle}')) return mensaje
  const detalle = typeof e === 'object' && e !== null && 'detalle' in e && typeof e.detalle === 'string' ? e.detalle : ''
  return detalle ? mensaje.replace('{detalle}', detalle.replace(/,/g, ', ')) : (SIN_DETALLE[codigo] ?? mensaje)
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

/** La base manda el código en message y, en algunos errores, las claves afectadas en details. */
function errorDeRpc(error: { message: string; details: string | null }): Error {
  return Object.assign(new Error(error.message), { detalle: error.details })
}

export function crearServicioOperador(supabase: SupabaseClient): ServicioOperador {
  return {
    async esOperador() {
      const { data, error } = await supabase.rpc('es_operador')
      if (error) throw error
      return data === true
    },
    async resumenKioscos() {
      const [resumen, planes] = await Promise.all([supabase.rpc('resumen_kioscos'), supabase.rpc('operador_planes_kioscos')])
      if (resumen.error) throw resumen.error
      if (planes.error) throw planes.error
      const planPorNegocio = new Map((planes.data as FilaPlanKiosco[]).map((p) => [p.negocio_id, p]))
      return (resumen.data as FilaResumen[]).map((f) => ({
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
        planCodigo: planPorNegocio.get(f.negocio_id)?.plan_codigo ?? null,
        planNombre: planPorNegocio.get(f.negocio_id)?.plan_nombre ?? null,
        extras: planPorNegocio.get(f.negocio_id)?.extras ?? 0,
        quitados: planPorNegocio.get(f.negocio_id)?.quitados ?? 0,
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
        plan: f.plan,
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
      const { data, error } = await supabase.rpc('operador_modulos_kiosco', { p_negocio: negocioId })
      if (error) throw errorDeRpc(error)
      return (data as FilaModulo[]).map((f) => ({
        clave: f.clave,
        descripcion: f.descripcion,
        enPlan: f.en_plan,
        excepcion: f.excepcion,
        derecho: f.derecho,
        uso: f.uso,
        activo: f.activo,
        faltan: f.faltan,
      }))
    },
    async cambiarModulo(negocioId, clave, activo, motivo) {
      const { error } = await supabase.rpc('operador_fijar_uso', {
        p_negocio: negocioId,
        p_modulo: clave,
        p_activo: activo,
        p_motivo: motivo,
        p_op_id: crypto.randomUUID(),
      })
      if (error) throw errorDeRpc(error)
    },
    async listarPlanes() {
      const { data, error } = await supabase.rpc('operador_listar_planes')
      if (error) throw error
      return data as PlanOperador[]
    },
    async previsualizarPlan(negocioId, planId) {
      const { data, error } = await supabase.rpc('operador_previsualizar_plan', { p_negocio: negocioId, p_plan_id: planId })
      if (error) throw errorDeRpc(error)
      return data as EfectoPlan[]
    },
    async fijarPlan(negocioId, planId, motivo) {
      const { error } = await supabase.rpc('operador_fijar_plan', {
        p_negocio: negocioId,
        p_plan_id: planId,
        p_motivo: motivo,
        p_op_id: crypto.randomUUID(),
      })
      if (error) throw errorDeRpc(error)
    },
    async modulosDePlan(planId) {
      // Catálogo, plan y dependencias los puede leer cualquier cuenta (RLS using true): no hace falta una función.
      const [catalogo, plan, dependencias] = await Promise.all([
        supabase.from('modulos').select('clave, descripcion').order('clave'),
        supabase.from('plan_modulos').select('modulo').eq('plan_id', planId),
        supabase.from('modulo_dependencias').select('modulo, requiere').eq('tipo', 'requiere'),
      ])
      if (catalogo.error) throw catalogo.error
      if (plan.error) throw plan.error
      if (dependencias.error) throw dependencias.error
      const enPlan = new Set((plan.data as { modulo: string }[]).map((p) => p.modulo))
      const requisitos = dependencias.data as { modulo: string; requiere: string }[]
      return (catalogo.data as { clave: string; descripcion: string }[]).map((m) => ({
        clave: m.clave,
        descripcion: m.descripcion,
        enPlan: enPlan.has(m.clave),
        requiere: requisitos.filter((d) => d.modulo === m.clave).map((d) => d.requiere),
      }))
    },
    async previsualizarGuardarPlan(planId, modulos) {
      const { data, error } = await supabase.rpc('operador_previsualizar_guardar_plan', {
        p_plan_id: planId,
        p_modulos: modulos,
      })
      if (error) throw errorDeRpc(error)
      return (data as FilaEfectoEdicion[]).map((f) => ({
        negocioId: f.negocio_id,
        kiosco: f.kiosco,
        clave: f.clave,
        descripcion: f.descripcion,
        efecto: f.efecto,
        uso: f.uso,
      }))
    },
    async guardarPlan(planId, datos, motivo) {
      const { error } = await supabase.rpc('operador_guardar_plan', {
        p_plan_id: planId,
        p_nombre: datos.nombre,
        p_descripcion: datos.descripcion,
        p_modulos: datos.modulos,
        p_motivo: motivo,
        p_op_id: crypto.randomUUID(),
      })
      if (error) throw errorDeRpc(error)
    },
    async fijarExcepcion(negocioId, clave, permite, motivo) {
      const { error } = await supabase.rpc('operador_fijar_excepcion', {
        p_negocio: negocioId,
        p_modulo: clave,
        p_permite: permite,
        p_motivo: motivo,
        p_op_id: crypto.randomUUID(),
      })
      if (error) throw errorDeRpc(error)
    },
    async altaKiosco(datos) {
      const { data, error } = await supabase.functions.invoke<AltaKiosco>('alta-kiosco', { body: datos })
      if (error) throw new Error(await codigoDeRespuesta(error))
      return data as AltaKiosco
    },
    async restablecerClave(datos) {
      const { data, error } = await supabase.functions.invoke<ClaveRestablecida>('restablecer-clave', { body: datos })
      if (error) throw new Error(await codigoDeRespuesta(error))
      return data as ClaveRestablecida
    },
    async cerrarSesiones(datos) {
      const { data, error } = await supabase.functions.invoke<SesionesCerradas>('cerrar-sesiones', { body: datos })
      if (error) throw new Error(await codigoDeRespuesta(error))
      return data as SesionesCerradas
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
