# Panel de operador, fase 1: estructura y ficha del kiosco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para seguir este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`) para el seguimiento.

**Goal:** Panel de operador con secciones y direcciones propias, Inicio con contadores, lista con buscador y filtros, ficha del kiosco (resumen, datos, notas, recordatorios, historial) y historial del operador con filtros. Es la fase 1 del spec `docs/superpowers/specs/2026-10-28-panel-operador-avisos.md` (§11).

**Architecture:** La lógica de datos vive en funciones de Postgres `security definer` que llaman `exigir_operador()` (es_operador y, si la cuenta tiene MFA verificado, aal2). La app sólo llama RPC y arma pantallas. Las direcciones usan el hash de la URL, sin librería de rutas. Los filtros, orden, contadores y fechas son funciones puras con prueba.

**Tech Stack:** Postgres y Storage de Supabase, Edge Function `alta-kiosco` (Deno), React 19 y TypeScript, Vitest, pgTAP.

**Decisiones usadas (Felipe dijo "aplica"):** 1 (la cuenta es el kiosco), 2 (actividad sin montos ni clientes), 17 (funciones de operador con historial, motivo y MFA). Las demás decisiones siguen abiertas y no bloquean esta fase.

**Fuera de esta tanda** (cada una tiene su fase):
- Abono y planes: fases 2 y 5. La ficha muestra "Abono: sin registrar" hasta entonces.
- Restablecer clave y cerrar sesiones: fase 5, porque usan la clave de servicio. En fase 1 sólo rige la regla de mostrar una vez las claves del alta.
- Pantalla de desafío MFA: el servidor exige aal2 si la cuenta tiene factor, pero la app todavía no lo pide. No activar MFA en la cuenta de operador hasta que exista.
- Carga por partes con más de 50 kioscos; filtros por plan, abono, módulo y etiqueta; exportar historial; cuándo entró el operador; encabezado fijo de la ficha; limpieza de logos viejos del bucket.
- Bloque "Alertas para Felipe" y "Puesta en marcha" de la ficha: dependen del chequeo de salud (§8.9) y de fases posteriores.

---

## Mapa de archivos

**Crear**
- `supabase/migrations/20261028140000_panel_operador.sql`: tablas nuevas, `exigir_operador`, funciones, grants y bucket `logos`.
- `supabase/functions/alta-kiosco/index.ts`: ya existe; se modifica (ver tarea 2).
- `src/operador/ruta.ts`: lectura y escritura de direcciones, y `useRuta`.
- `src/operador/resumen.ts`: filtros, orden, contadores, antigüedad y fechas en hora de Buenos Aires.
- `src/operador/Inicio.tsx`, `ListaKioscos.tsx`, `FichaKiosco.tsx`, `DatosKiosco.tsx`, `HistorialOperador.tsx`, `AltaKiosco.tsx`.
- `src/operador/ruta.test.ts`, `src/operador/resumen.test.ts`.
- `supabase/tests/database/240_panel_operador.test.sql`.
- `docs/superpowers/plans/2026-10-28-fase-1-panel-operador.md`: este archivo.

**Modificar**
- `src/operador/operador.ts`: servicio nuevo (ver tarea 3).
- `src/operador/PantallaOperador.tsx`: pasa a ser la cáscara (navegación y carga de la lista).
- `src/estilos.css`: clases `.operador__*` nuevas.
- `src/test/servicios.ts`: el fake del servicio de operador.
- `supabase/tests/database/140_aislamiento.test.sql`, `150_permisos_funciones.test.sql`, `230_operador.test.sql`: nombres y firmas nuevos.
- `tests/soporte/seed-demo.mts`: marca el kiosco demo con `es_demo`.

---

## Tarea 1: migración de la base

**Files:** Create `supabase/migrations/20261028140000_panel_operador.sql`.

- [ ] Crear `mfa_pendiente()` y `exigir_operador()`. `exigir_operador` reemplaza el `es_operador()` directo en cada función de operador.
- [ ] Crear tablas `ficha_kiosco` (datos comerciales y de contacto, sólo operador), `notas_operador`, `recordatorios_operador` e `historial_operador`. Esta última sólo se agrega: triggers `impedir_cambios` de update, delete y truncate.
- [ ] RLS activo y `revoke all ... from anon, authenticated` en las cuatro tablas. Sin políticas: sólo se llega por funciones.
- [ ] Crear `datos_del_kiosco(uuid)`, interna (sin grant), que arma los datos de la ficha. Va sin contacto cuando se escribe en el historial.
- [ ] Reemplazar `listar_kioscos` por `resumen_kioscos()`: una fila por kiosco con cuentas, actividad (ventas de hoy, 7 y 30 días, días con ventas, última venta; sin anuladas), recordatorios de hoy y alta del mes. Las fechas son de Buenos Aires.
- [ ] Crear `ficha_kiosco(uuid)`: datos, PCs con turno abierto, notas y recordatorios. Chequea operador antes de leer nada.
- [ ] `crear_kiosco(text)` sin cambios de firma; ahora llama `exigir_operador()`. `vincular_cuenta` y `modulos_de_kiosco`: mismo cambio.
- [ ] `cerrar_alta_kiosco(uuid, text)`: crea la configuración visible y el historial `alta_kiosco`. Se llama al final del alta, así un fallo antes no deja filas que impidan borrar el kiosco en el rollback.
- [ ] `cambiar_modulo_kiosco(uuid, text, boolean, text)`: reemplaza la firma de 3 argumentos. Pide motivo y deja historial con el valor anterior y el nuevo.
- [ ] `guardar_datos_kiosco(...)`: valida cada campo (motivo, nombre visible, color, logo, fecha, etiquetas, contacto), guarda `config_negocio` y `ficha_kiosco`, y deja historial sin datos de contacto. El logo sólo acepta URLs del bucket `logos` en la carpeta de ese kiosco, con extensión png, jpg, jpeg o webp.
- [ ] `agregar_nota`, `borrar_nota` (el historial guarda la fecha, no el texto), `agregar_recordatorio`, `completar_recordatorio`, `listar_historial_operador(filtros)`.
- [ ] Grants: sólo `authenticated` ejecuta las funciones de operador y `mfa_pendiente`. `exigir_operador` y `datos_del_kiosco` quedan internas.
- [ ] Bucket `logos` público, 300 KB, png/jpeg/webp. Política de insert: sólo operador, sin MFA pendiente, carpeta con formato de uuid.

**Check (sin correr nada):** cada función `security definer` que `authenticated` puede ejecutar tiene que estar en la lista de `150_permisos_funciones`. Ninguna función interna se otorga.

## Tarea 2: alta de kiosco

**Files:** Modify `supabase/functions/alta-kiosco/index.ts`.

- [ ] Leer `nombreVisible` del cuerpo (opcional).
- [ ] Después de vincular las dos cuentas, llamar `cerrar_alta_kiosco` dentro del `try`, así cualquier error dispara el rollback que ya existe.

## Tarea 3: servicio del operador

**Files:** Modify `src/operador/operador.ts`.

- [ ] Reemplazar `listarKioscos` por `resumenKioscos` (mapeo a camelCase, igual que antes).
- [ ] Agregar `ficha`, `guardarDatos`, `subirLogo` (valida tipo y tamaño antes de subir), `agregarNota`, `borrarNota`, `agregarRecordatorio`, `completarRecordatorio`, `historial`.
- [ ] `cambiarModulo` y `altaKiosco` reciben motivo y nombre visible.
- [ ] Sumar códigos de error nuevos a `MENSAJES_OPERADOR`, con texto en español.

## Tarea 4: lógica pura con prueba

**Files:** Create `src/operador/ruta.ts`, `resumen.ts`, `ruta.test.ts`, `resumen.test.ts`.

- [ ] `leerRuta` y `aHash`: `#/inicio`, `#/kioscos`, `#/kioscos?filtro=…`, `#/kioscos/<uuid>/<pestaña>`, `#/historial`, `#/nuevo`. Un id que no es uuid cae en la lista. Lo que no se reconoce cae en Inicio.
- [ ] `filtrarKioscos`, `cumpleFiltro`, `contadores` (ignoran los demo), `antiguedad` ("3 meses"), `actividadTexto` ("hoy", "hace 9 días", "nunca vendió"), `formatoFecha`, `diaDe`, `hoyDeBuenosAires`.
- [ ] Pruebas: demo oculto por defecto; búsqueda por nombre y mail; última actividad con los nulos al final; contadores sin demo; antigüedad de 16/07 a 28/10 = 3 meses; nunca vendió; rutas válidas e inválidas.

## Tarea 5: pantallas

**Files:** Create `Inicio.tsx`, `ListaKioscos.tsx`, `FichaKiosco.tsx`, `DatosKiosco.tsx`, `HistorialOperador.tsx`, `AltaKiosco.tsx`. Modify `PantallaOperador.tsx`, `src/estilos.css`.

- [ ] `PantallaOperador`: nav con las cuatro secciones (`aria-current` en la activa), carga la lista de kioscos una vez y la vuelve a cargar con `version` cuando una acción lo pide. Nada queda elegido por defecto.
- [ ] Inicio: cuatro contadores que son enlaces a la lista filtrada.
- [ ] Lista: buscador, "Mostrar" (filtro), "Tipo" (reales, demo, todos), "Orden". Cada fila es un enlace a la ficha.
- [ ] Ficha: encabezado con "← Kioscos" y pestañas Resumen, Datos e Historial. Resumen: antigüedad, uso, abono (sin registrar), módulos con motivo, cuentas, PCs, actividad. Datos: formulario con motivo obligatorio, logo, notas y recordatorios.
- [ ] Historial: filtros por kiosco (si no es fijo), acción, desde y hasta.
- [ ] Alta: como antes, con nombre visible y enlace a la ficha al terminar. Las claves se muestran una vez.

## Tarea 6: fake y pruebas de base

**Files:** Modify `src/test/servicios.ts`, `supabase/tests/database/140_aislamiento.test.sql`, `150_permisos_funciones.test.sql`, `230_operador.test.sql`, `tests/soporte/seed-demo.mts`. Create `240_panel_operador.test.sql`.

- [ ] Fake del servicio con los métodos nuevos (vi.fn).
- [ ] 140 y 150: nombres de funciones nuevos. 230: `listar_kioscos` pasa a `resumen_kioscos`, `cambiar_modulo_kiosco` recibe motivo, y la lista de funciones que llaman el chequeo de operador cambia a `exigir_operador`.
- [ ] 240: no edita el historial del operador; la caja no lee la ficha; un logo de otro kiosco se rechaza; el alta deja historial.
- [ ] `seed-demo.mts`: inserta `ficha_kiosco` con `es_demo: true`.
- [ ] No correr vitest, pgTAP, tsc ni E2E hasta que Felipe lo pida.

## Tarea 7: revisión de seguridad (§12)

- [ ] RLS y grants de las tablas nuevas; ninguna escribe ni lee sin función.
- [ ] Funciones `security definer` con `search_path = ''` y chequeo de operador antes de leer o escribir.
- [ ] Logo: sólo bucket `logos`, carpeta del kiosco, tipo y tamaño en el servidor.
- [ ] Historial: sin texto de notas ni datos de contacto; sólo agrega.
- [ ] Ningún dato de la ficha llega a la app del kiosco (no se lee `ficha_kiosco` desde `config_negocio`).
- [ ] MFA: la función exige aal2 cuando hay factor; la app todavía no lo pide (ver fuera de esta tanda).

## Tarea 8: verificación (la hace Felipe cuando lo ordene)

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `supabase test db` (incluye 240)

---

## Notas de auto-revisión

- Cobertura del spec, fase 1: direcciones (tarea 5), Inicio (tarea 5), lista con buscador, filtros, orden y demo (tarea 4 y 5), ficha con resumen, datos, notas, recordatorios e historial (tarea 5), alta con configuración visible (tarea 1 y 2), logo a storage (tarea 1 y 3), historial del operador con filtros (tarea 1 y 5), funciones con motivo y MFA (tarea 1). Claves de restablecer: fuera, fase 5.
- Nombres: `resumenKioscos` (TS) corresponde a `resumen_kioscos` (SQL); `cambiarModulo(..., motivo)` a `cambiar_modulo_kiosco(..., p_motivo)`.
