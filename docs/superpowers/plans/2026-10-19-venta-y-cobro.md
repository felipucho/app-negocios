# Venta y cobro: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** construir el MVP de "Venta y cobro" descripto en el spec `docs/superpowers/specs/2026-10-19-venta-y-cobro-design.md`: dos cuentas por kiosco (caja y jefe), turnos por PC, venta con escaneo y búsqueda, cobro con pagos combinados y vuelto, módulo fiado, confirmación idempotente, anulación, caja del día, pantalla de precios y productos e historial de auditoría.

**Architecture:** SPA estática Vite + React + TypeScript servida por Cloudflare Workers con static assets (fallback SPA y `_headers` con CSP). Supabase aporta Auth (email y contraseña, `negocio_id` en el token por un Custom Access Token Hook que lee `cuentas`), Postgres con RLS en todas las tablas y funciones de la base que hacen todas las escrituras sensibles y leen el rol desde `cuentas` con `auth.uid()`. Dexie (IndexedDB) es sólo caché del catálogo; no hay modo offline: sin internet la caja se para.

**Tech Stack:** Vite, React, TypeScript, Vitest + Testing Library, supabase-js, Supabase CLI (Postgres local en Docker), pgTAP con `supabase test db`, Dexie, Playwright, wrangler (Cloudflare Workers), Sentry (sólo errores).

Esta parte es la **parte 1 de 5**: base del repo, scaffold, Supabase local, esquema con RLS, token hook y cálculo de cobro (tareas 0 a 5). Las partes 2 a 5 siguen con la venta, la caja, la administración, el login y el despliegue (tareas 6 a 19), y usan los nombres del mapa de archivos de abajo. Reparto: P2 = tareas 6 a 10; P3 = tareas 11 a 14; P4 = tareas 15 a 17; P5 = tareas 18 y 19.

---

## Cómo leer este plan

- Son cinco partes que se ejecutan en orden: tareas 0 a 19. Cada parte cierra con sus nombres nuevos y sus verificaciones (V).
- Antes de programar se carga la skill `ponytail` (regla de Felipe). La tarea 0 y cada commit necesitan OK en el chat.
- Las decisiones que siguen son las que el spec no cubre. Cada una dice la alternativa.
- Al final de la parte 5 están la cobertura del spec, lo que queda para la v2, la autorrevisión y el orden de ejecución.

## Decisiones que requieren tu OK

Son las decisiones que el spec no cubre y que tomaron los agentes, más los huecos. Cada una trae la recomendación en negrita. Las cinco primeras bloquean: hay que resolverlas antes de la tarea que indica. El detalle de cada parte está en su sección "Decisiones de la parte N".

**Estado (2026-10-20): todas decididas con la recomendación.**

- Ranking sin código: `security definer`. Pendiente: cambiar el spec en sus secciones 6, 10, 11 y 13.
- Sesión de Auth: `localStorage` (default). Pendiente: el spec tiene que nombrarla en su sección de seguridad.
- Alta de productos sin código desde la app: sí.
- Ejecución: `superpowers:subagent-driven-development`.
- Tarea 0: repo anidado en la carpeta del proyecto.
- Plan B de CSP: se decide en la tarea 19, sólo si V1 falla.
- F5: línea de ayuda en la caja (tarea 12).
- Anulación: sin cambios. Historial: fiado y anonimización no entran.
- Resto de producto y operación: aceptado como está.
- Caja abierta en otra pestaña: no se implementa.
- Cierre remoto (V10): verificar antes del primer kiosco (V52).
- Supabase: local (Docker) para las tareas 2 a 14, con los tests de base y de integración. Paso a online después de la tarea 14; después siguen los tests online. El acceso (invitación o `supabase link` hecho por Felipe) se define en ese hito.

Siguen abiertos, pero son verificaciones y no decisiones: costos de Supabase Pro y Sentry, rendimiento del ranking, dominio `.com.ar` y consulta con abogado.

### Bloquean antes de ejecutar

1. **Ranking de productos sin código (tarea 11).** Recomendado: `security definer` que devuelve sólo producto, nombre y conteo de ventas del negocio del token. El spec dice `security invoker`, pero con invoker la caja sólo ve las ventas de hoy y el ranking de 30 días no le sirve. Alternativa: invoker, con ranking sólo de hoy; en ese caso cambian las secciones 6, 10, 11 y 13 del spec.
2. **Sesión de Auth en `localStorage` (tarea 17).** supabase-js la guarda ahí por defecto. Recomendado: dejar el default (la caja no vuelve a pedir contraseña en cada recarga) y apoyarse en la CSP sin `unsafe-inline`. Alternativa: `sessionStorage` (la sesión se pierde al cerrar el navegador). En cualquier caso, el spec tiene que nombrar la sesión de Auth en su sección de seguridad: hoy sólo habla del id de la PC en `localStorage`.
3. **Plan B para la CSP (tarea 19, V1 y D10).** Si el fallback de Cloudflare no aplica `_headers` a las rutas inexistentes, no se publica a kioscos. Plan B: meta CSP en `index.html` o un Worker que agregue los headers. Hay que confirmar V1 antes de la tarea 19.
4. **Repo git (tarea 0).** `C:\Users\felipe` ya es un repo git sin commits. Un `git init` dentro de la carpeta del proyecto crea un repo anidado. Recomendado: repo anidado en la carpeta del proyecto, para que el historial quede aislado.
5. **Alta de productos sin código desde la app (tareas 13 y 15).** Ya está incluida: el spec pide código opcional y que la caja dé de alta productos. Recomendado: dejarla. Si no, el panel F2 sólo muestra lo que cargues desde Supabase Studio.

### Decisiones de producto y operación

- **Procedimiento tras F5 (decisión 31 del spec, hueco parcial).** La venta en armado se pierde y el cajero revisa las ventas de hoy antes de volver a cargar. Ninguna pantalla lo explica. Recomendado: una línea de ayuda en la caja (tarea 12).
- **Anulación.** El motivo va de 3 a 200 caracteres. Se guarda la PC desde la que se anula. La caja del día puede mostrar un medio en negativo si hoy se anula una venta de otro día. Recomendado: dejarlo así, para que el día cuadre.
- **Historial.** No registra la venta confirmada (ya es inmutable), ni el cambio del módulo fiado, ni la anonimización. Recomendado: no, porque el spec no lo pide.
- **Productos.** Un alta con el código de un producto desactivado sólo avisa en la pantalla de productos; en la caja ofrece "Reactivar y agregar". El precio es un entero hasta 2.147.483.647; con centavos se rechaza. Recomendado: dejarlo.
- **Panel F2 y ranking.** Grilla de 20 botones (4 × 5); el resto se busca por nombre. El ranking incluye productos sin ventas, con 0. Recomendado: dejarlo.
- **Escáner.** Umbrales iniciales: 50 ms entre caracteres, mínimo 4 caracteres y 150 ms de lectura doble. Son supuestos a medir con la calibración del jefe. La calibración no guarda nada en el navegador: el valor se copia a mano en `umbrales.ts`.
- **Cobro.** Si un escaneo cae sobre un importe, se restaura el importe y se avisa; Enter en un importe nunca confirma. El cobro arranca con el total en efectivo.
- **Dispositivos.** Prefijos A a Z, después AA a ZZ y AAA a ZZZ; la PC 27 es AA. Si el registro de la PC falla, no se vende hasta reintentar. Recomendado: dejarlo.
- **Versión mínima.** `version_app` la leen `anon` y `authenticated`, porque el chequeo corre antes del login. Si la app queda vieja, avisa y recarga; una venta en armado se pierde, como con F5. Recomendado: dejarlo.
- **Config visual.** Un solo color (`color_primario`) y el logo sólo si está alojado en el Supabase del proyecto, por la CSP. El spec dice "colores": es un desvío menor.
- **Aviso de abono.** Lo ven caja y jefe, con el texto "Comunicate con Felipe para regularizarlo". Nunca bloquea. Recomendado: dejarlo.
- **Contraseñas.** Se generan de 24 caracteres al azar; mínimo 12 en Supabase Auth. Recomendado: dejarlo.
- **Sentry.** `sendDefaultPii` en false, sólo errores; emails y teléfonos tapados en los mensajes.
- **Comprobante.** No muestra el nombre del cliente del fiado, sólo el importe. Recomendado: dejarlo.
- **Caja.** Pide el día a la base (`hoy()`), no al reloj de la PC. "Cerrar turno" pide confirmación.
- **Anonimización.** Funciona aunque el fiado esté apagado, porque es un pedido de la persona.
- **Cerrar sesión.** Borra sólo la sesión de esa PC (`scope: 'local'`), para no cerrar la caja de las otras PCs del kiosco.

### Huecos del spec sin tarea

- Costos de Supabase Pro y de Sentry: sin verificar. Verificar antes del primer kiosco.
- Rendimiento del ranking: sin medir. Medir con datos de prueba antes de cargar un kiosco real.
- "Caja abierta en otra pestaña": no se implementa. Dos pestañas no repiten número, por el bloqueo de la PC.
- Cierre remoto de sesiones (V10): no se implementa. Pendiente antes del primer kiosco.
- Dominio `.com.ar` y su costo: sin verificar.
- Consulta con abogado sobre Ley 25.326 (anonimización): no es técnica; hacerla antes del primer kiosco.

### Verificaciones abiertas

Las verificaciones V1 a V52 están en la sección de verificaciones de cada parte, con el comando para confirmarlas. Bloquea V1 (headers en el fallback). Las demás se confirman al ejecutar la tarea donde aparecen.

## Índice de tareas

| Tarea | Título | Parte |
|---|---|---|
| 0 | Repo propio y .gitignore (REQUIERE OK DE FELIPE) | 1 |
| 1 | Scaffold Vite + React + TypeScript + Vitest | 1 |
| 2 | Supabase local | 1 |
| 3 | Esquema y RLS en todas las tablas | 1 |
| 4 | Custom Access Token Hook con negocio_id leído de cuentas | 1 |
| 5 | Cálculo de cobro en TypeScript puro | 1 |
| 6 | Normalización y búsqueda por nombre | 2 |
| 7 | Caché Dexie del catálogo con catalogo_version | 2 |
| 8 | Dispositivos y turnos | 2 |
| 9 | Módulo fiado y alta de clientes | 2 |
| 10 | confirmar_venta, carrito e id de venta | 2 |
| 11 | Anulación, ranking sin código y caja del día (SQL con pgTAP) | 3 |
| 12 | Pantalla de caja y escáner (React, Vitest, Testing Library) | 3 |
| 13 | Panel "Sin código (F2)" (React, Testing Library) | 3 |
| 14 | Pagos, comprobante y prueba de venta completa | 3 |
| 15 | Productos y precios (SQL con pgTAP; React con Testing Library) | 4 |
| 16 | Jefe y caja del día (SQL con pgTAP; React con Testing Library) | 4 |
| 17 | Login por rol y arranque de la app (React, Vitest con mocks) | 4 |
| 18 | Personalización, versión mínima y aviso de abono (SQL con pgTAP; TypeScript con Vitest) | 5 |
| 19 | Despliegue, E2E y cierre (Vitest; Playwright; configuración de Cloudflare) | 5 |

# Parte 1: Fundación (tareas 0 a 5)

## Antes de empezar

- **Antes de programar:** cargar la skill `ponytail` (regla de Felipe en su CLAUDE.md) antes de escribir cualquier código. Una vez por sesión.
- **Commits:** sólo con OK de Felipe. Cada paso "Commit" de este plan espera ese OK en el chat; si no lo hay, se saltea y se sigue con la tarea siguiente. Los mensajes terminan con esta línea exacta:
  ```
  Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
  ```
- **Shell:** todos los comandos son para Git Bash, desde la raíz del proyecto. La ruta tiene un espacio, así que va siempre entre comillas:
  ```bash
  cd "/c/Users/felipe/Desktop/app negocios"
  ```
- **Requisitos de la PC:**
  - Node 20 o más nuevo (`node -v`). Vite 7 pide 20.19+ o 22.12+: si `npm install` avisa `EBADENGINE`, actualizar Node.
  - Docker Desktop instalado y corriendo (Supabase local lo necesita).
  - Git.
- **Diseño visual:** queda fuera de este plan. El plan deja una interfaz funcional con CSS mínimo; el pulido visual es otra tarea (skills `frontend-design` / `impeccable`).
- **Supuestos del spec (sección 13) que el plan toma como ciertos.** Si Felipe cambia alguno, revisar las tareas indicadas:
  - Precios en pesos enteros con IVA incluido (tareas 3 y 5).
  - Sin control de stock, sin descuentos ni promociones, sin productos pesables (tarea 3: no hay columnas para eso).
  - El catálogo de un kiosco entra en la caché sin problemas (tarea 7, caché).
  - El alta rápida de un producto nuevo guarda también el código escaneado (tarea 15, alta rápida).
  - SUPUESTO NUEVO: la caja sólo vende con un turno abierto. La venta guarda `turno_id` obligatorio (tarea 3) y `confirmar_venta` rechaza sin turno (tarea 10).
  - SUPUESTO NUEVO: un turno que no se cierra queda abierto hasta la próxima apertura (tarea 3: `cierre` vacío mientras está abierto).
  - SUPUESTO NUEVO: si una PC abre un turno mientras tiene otro abierto, el anterior se cierra solo con la hora de la nueva apertura. La tarea 3 impide dos turnos abiertos por PC; `abrir_turno` (tarea 8) cierra el anterior.
  - SUPUESTO NUEVO: la caja ve ventas y caja del día de hoy; el jefe ve el historial completo (tarea 3: policies de `ventas`, `lineas_venta`, `pagos_venta` y `anulaciones`).
  - Nota: el pedido mencionaba tres SUPUESTO NUEVO; el spec vigente tiene cuatro (los de arriba). El plan toma los cuatro.
- **Sin contingencia de Wi-Fi (decisiones 30 y 31):** no hay cola, ni cuaderno, ni pantalla "Sin confirmar". El `id` de venta vive sólo en memoria; nada de ventas en `sessionStorage` ni `localStorage`. En `localStorage` sólo van el id del dispositivo y la sesión de Auth que guarda supabase-js (ver la decisión 2 en "Decisiones que requieren tu OK").
- **Pendientes anotados que NO se implementan:**
  - Prefijo de dispositivo después de Z (spec sección 14). La tarea 3 acepta prefijos `A` a `Z`; el dispositivo 27 de un mismo kiosco falla con error de check hasta que Felipe defina el esquema.
  - Umbrales del escáner (velocidad de escaneo y lectura doble de 150 ms): quedan como parámetros con valor inicial y una pantalla de calibración (tarea 12); se miden con el escáner real.

### Verificado contra la documentación oficial (2026-10-19)

| Tema | Qué se verificó | Fuente |
|---|---|---|
| Custom Access Token Hook | Firma `public.custom_access_token_hook(event jsonb) returns jsonb`; se devuelve el evento con `claims` modificado; `grant execute ... to supabase_auth_admin`, `grant usage on schema public to supabase_auth_admin`, `revoke execute ... from authenticated, anon, public`; la doc desaconseja `security definer` en el hook; si el hook lee tablas con RLS, hace falta una policy para `supabase_auth_admin`. | https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook y https://supabase.com/docs/guides/auth/auth-hooks |
| Config local del hook | `[auth.hook.custom_access_token]` con `enabled = true` y `uri = "pg-functions://..."`; `auth.enable_signup` (false: bloquea el registro público), `auth.email.enable_signup` (debe quedar en true: en false apaga el login por email, verificado en local con `email_provider_disabled`), `auth.jwt_expiry` (3600 por defecto). | https://supabase.com/docs/guides/local-development/cli/config |
| security definer + search_path vacío | `security definer` exige fijar `search_path`; con `set search_path = ''` todo va calificado con esquema; las funciones nuevas dan EXECUTE a PUBLIC por defecto; hay que revocar a `public` y a cada rol con grant directo, como `anon`. | https://supabase.com/docs/guides/database/functions y https://www.postgresql.org/docs/current/sql-createfunction.html |
| pgTAP con `supabase test db` | Lee `supabase/tests`; archivos `.sql` o `.pg`; cada archivo hace `begin; create extension if not exists pgtap with schema extensions; select plan(n); ... select * from finish(); rollback;`; requiere `supabase start`; salida con `All tests successful.` y `Result: PASS`. | https://supabase.com/docs/guides/local-development/testing/overview y https://supabase.com/docs/reference/cli/supabase-test-db |
| Dexie | `*keyPath` es índice multiEntry; `db.version(n).stores({...})`; un cambio de esquema es una versión nueva, nunca se edita una versión publicada que tenga upgrader; import `{ Dexie, type EntityTable }` y clase que extiende `Dexie` con `tabla!: EntityTable<T, 'id'>`. | https://dexie.org/docs/Version/Version.stores() , https://dexie.org/docs/Tutorial/Design , https://dexie.org/docs/Typescript |
| Cloudflare Workers static assets | `wrangler.jsonc` con `name`, `compatibility_date`, `assets.directory` y `assets.not_found_handling: "single-page-application"` (sirve `/index.html` con 200 cuando no hay archivo). `_headers` va dentro del directorio de assets; máximo 100 reglas y 2.000 caracteres por línea. | https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ y https://developers.cloudflare.com/workers/static-assets/headers/ |
| Playwright | `defineConfig` con `webServer: { command, url, reuseExistingServer }` y `use.baseURL`; `globalSetup`; "Tests have access to the `process.env` properties set in the global setup." | https://playwright.dev/docs/test-webserver y https://playwright.dev/docs/test-global-setup-teardown |

### Verificar antes de ejecutar (no confirmado en la documentación)

| # | Qué | Dónde se usa | Cómo verificar |
|---|---|---|---|
| V1 | Si las reglas de `_headers` (CSP) se aplican también a la respuesta de fallback SPA (`/index.html` servido para una ruta inexistente) y si `wrangler dev` las aplica en local. | Tarea 19 (despliegue) | `curl -sI` a una ruta inexistente y buscar `content-security-policy`. https://developers.cloudflare.com/workers/static-assets/headers/ |
| V2 | Nombres exactos que imprime `supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`). La doc confirma `ANON_KEY` y `SERVICE_ROLE_KEY`, no `API_URL`. | Tareas 2 y 4 | El paso cuenta las líneas generadas. https://supabase.com/docs/reference/cli/supabase-status |
| V3 | Formato de la URI del hook: el plan usa `pg-functions://postgres/public/custom_access_token_hook` (base/esquema/función). La doc de config muestra un ejemplo con otro esquema y guiones. | Tarea 4 | La prueba de integración del token falla si la URI está mal. https://supabase.com/docs/guides/auth/auth-hooks |
| V4 | Que `enable_signup = false` no bloquee `auth.admin.createUser` (las pruebas crean usuarios así), y cómo se apaga el registro público en el proyecto hospedado (spec sección 15). | Tareas 2 y 4; tarea 19 | La prueba de integración de la tarea 4 lo prueba en local. https://supabase.com/docs/guides/auth/general-configuration |
| V5 | Forma del error de red en supabase-js/postgrest-js al confirmar: el plan asume `error.code` vacío cuando falla el `fetch`, para mostrar "aviso y reintento con el mismo id". | Tarea 10 (`src/venta/confirmar.ts`) | Cortar la red en el navegador con la app corriendo y confirmar una venta. https://github.com/supabase/postgrest-js |
| V6 | Que se pueda insertar en `auth.users` sólo con `id` y `email` dentro de una prueba pgTAP local. | Tareas 3 y 4 | `010_rls.test.sql` y `020_token_hook.test.sql` fallan en el `insert into auth.users` si no. https://supabase.com/docs/guides/local-development/testing/overview |
| V7 | Que `pg_proc.proconfig` guarde `set search_path = ''` como el texto `search_path=""`. | Tarea 10 (pruebas de funciones) | Las pruebas pgTAP que lo chequean fallan si no. https://www.postgresql.org/docs/current/catalog-pg-proc.html |
| V8 | Que `globalSetup` acepte una ruta en texto (`'./tests/e2e/preparar.ts'`) con `"type": "module"`. La doc muestra `require.resolve(...)`. | Tarea 19 (E2E) | `npx playwright test` falla al cargar la config si no. https://playwright.dev/docs/test-global-setup-teardown |
| V9 | Que `supabase init` no pida nada interactivo en Git Bash. | Tarea 2 | Si pregunta por VS Code o Deno, contestar `N`. https://supabase.com/docs/reference/cli/supabase-init |
| V10 | Cierre remoto de sesiones en Supabase Auth (spec sección 15). No se implementa. | Tarea 19 (checklist antes del primer kiosco) | https://supabase.com/docs/guides/auth/sessions |
| V11 | Que `auth.uid()` (calificado con esquema) devuelva el usuario del token dentro de funciones con `set search_path = ''`, tanto `security invoker` (`public.rol_actual()` usada en policies) como `security definer` (las funciones de escritura leen el rol desde `cuentas`). | Tarea 3 (`rol_actual`); tareas 8 a 16 (todas las funciones con rol) | `010_rls.test.sql` prueba que la caja ve sólo ventas de hoy y el jefe todas (eso sólo pasa si `rol_actual()` lee bien `cuentas`). En las tareas 8 a 16, una prueba pgTAP de cada función con rol. https://supabase.com/docs/guides/database/postgres/row-level-security |
| V12 | Que un trigger `after update` en `productos` registre en `historial` también los cambios hechos desde Supabase Studio (editor de tablas y editor SQL corren como `postgres`; `auth.uid()` vale `null`, así que `cuenta_id` queda vacío). | Tarea 15 (`historial_productos`) | En local: `npx supabase status` muestra la URL de Studio; cambiar un precio a mano y consultar `select * from public.historial order by fecha desc limit 1`. Repetir una vez en el proyecto hospedado antes del primer kiosco. https://supabase.com/docs/guides/database/postgres/triggers |
| V13 | Que la API de Supabase devuelva como máximo 1000 filas por pedido (`[api] max_rows = 1000` en local; "Max rows" en el proyecto hospedado) y que `.range(desde, hasta)` con orden estable pagine más allá de 1000. | Tarea 2 (ver `max_rows`); tarea 7 (`src/catalogo/fuente.ts`) | Prueba de integración de la tarea 7 con 1.500 productos: debe traer los 1.500. https://supabase.com/docs/reference/javascript/range y https://supabase.com/docs/guides/api/api-settings |
| V14 | Que el hook, que corre como `supabase_auth_admin` y no es `security definer`, pueda leer `cuentas` con RLS activo gracias a `grant select` más una policy `to supabase_auth_admin`. | Tarea 4 | `020_token_hook.test.sql` chequea el grant y la policy; `tests/integracion/token.test.ts` prueba el login real (si no puede leer `cuentas`, el token sale sin `negocio_id` o el login falla para caja y jefe). https://supabase.com/docs/guides/auth/auth-hooks |
| V15 | Que el Custom Access Token Hook pueda rechazar el login devolviendo `{"error": {"http_code": 403, "message": ...}}` (así "un usuario sin cuenta no entra"). | Tarea 4 | `tests/integracion/token.test.ts`: el login de un usuario sin cuenta debe fallar. Si no falla, aplicar el plan B del paso 10 de la tarea 4. https://supabase.com/docs/guides/auth/auth-hooks |

---

## Mapa de archivos

El plan tiene cinco partes. P1 son las tareas 0 a 5 (esta parte). P2 son las tareas 6 a 10 (catálogo, dispositivos y turnos, clientes y módulo fiado, confirmar venta). P3 son las tareas 11 a 14 (anulación, caja del día, pantalla de caja y escáner, panel F2, pagos). P4 son las tareas 15 a 17 (productos y precios, jefe y caja del día, login por rol). P5 son las tareas 18 y 19 (personalización, aviso de abono, despliegue y E2E). Entre paréntesis, la tarea que crea o modifica cada archivo.

Cada archivo tiene una sola responsabilidad. Rutas relativas a la raíz del proyecto (`C:\Users\felipe\Desktop\app negocios`).

**Raíz y configuración**
- `.gitignore` — qué no va al repo (tarea 0).
- `package.json`, `package-lock.json` — dependencias y scripts (tarea 1; las tareas siguientes agregan dependencias cuando las necesitan).
- `tsconfig.json` — TypeScript estricto para `src`, `tests`, `config` y configs de la raíz (tarea 1).
- `index.html` — punto de entrada de la SPA (tarea 1).
- `vite.config.ts` — build de Vite (tarea 1; la tarea 18 agrega la versión de la app y la tarea 19 la generación de `_headers`).
- `vitest.config.ts` — pruebas unitarias en jsdom (tarea 1).
- `vitest.integracion.config.ts` — pruebas de integración contra Supabase local (tarea 4).
- `.env.example` — variables que necesita la app, sin valores secretos (tarea 2).
- `.env.local`, `.env.integracion.local` — valores locales; nunca van al repo (tareas 2 y 4).
- `config/headers.ts` — genera `_headers` con la CSP para Cloudflare (tarea 19).
- `config/headers.test.ts` — prueba de la CSP generada (tarea 19).
- `wrangler.jsonc` — Cloudflare Workers con static assets y fallback SPA (tarea 19).
- `playwright.config.ts` — E2E (tarea 19).

**Base de datos: `supabase/`**
- `supabase/config.toml` — config local: registro público apagado, hook del token (tareas 2 y 4).
- `supabase/migrations/20261019120000_esquema_base.sql` — tipos, las 14 tablas, índices, helpers `negocio_actual`, `rol_actual`, `dia_operativo`, `hoy`, trigger `impedir_cambios` (tarea 3).
- `supabase/migrations/20261019120100_rls_base.sql` — RLS en todas las tablas, permisos y policies de lectura por negocio y por rol (tarea 3).
- `supabase/migrations/20261019120200_token_hook.sql` — Custom Access Token Hook que lee `cuentas` (tarea 4).
- `supabase/migrations/20261019120300_catalogo_version.sql` — trigger que sube `catalogo_version` ante cambios en `productos` y `negocios` (tarea 7).
- `supabase/migrations/20261019120500_registrar_dispositivo.sql` — `registrar_dispositivo`: alta automática con prefijo siguiente (tarea 8).
- `supabase/migrations/20261019120600_turnos.sql` — `abrir_turno` (cierra solo el turno anterior de la PC) y `cerrar_turno` con total por medio de pago (tarea 8).
- `supabase/migrations/20261019120800_modulos.sql` — `modulo_activo(clave)` (tarea 9).
- `supabase/migrations/20261019120900_clientes.sql` — `alta_cliente`, sólo con fiado activo (tarea 9).
- `supabase/migrations/20261019121000_confirmar_venta.sql` — `confirmar_venta` idempotente (tarea 10).
- `supabase/migrations/20261019121100_anular_venta.sql` — `anular_venta` con reglas por rol y día (tarea 11).
- `supabase/migrations/20261019121200_ranking_sin_codigo.sql` — `ranking_sin_codigo`, `security invoker` (tarea 11).
- `supabase/migrations/20261019121300_caja_del_dia.sql` — `caja_del_dia` y `ventas_del_dia` (tarea 11).
- `supabase/migrations/20261019121500_productos.sql` — `alta_producto_caja` y `editar_producto` (tarea 15).
- `supabase/migrations/20261019121600_historial_productos.sql` — trigger de auditoría en `productos` (alta, precio, nombre, activo), también para cambios desde Studio (tarea 15).
- `supabase/migrations/20261019121700_jefe.sql` — `cambiar_modulo_fiado` (sólo jefe, sólo el módulo fiado) y `anonimizar_cliente` (sólo jefe) (tarea 16).
- `supabase/migrations/20261019121800_version_minima.sql` — `version_minima()` para forzar recarga de apps viejas (tarea 18).
- `supabase/tests/database/000_pgtap.test.sql` — pgTAP disponible (tarea 2).
- `supabase/tests/database/010_rls.test.sql` — tablas, RLS en todas, lectura por negocio y rol, escrituras prohibidas (tarea 3).
- `supabase/tests/database/020_token_hook.test.sql` — hook y sus permisos (tarea 4).
- `supabase/tests/database/030_catalogo_version.test.sql` (tarea 7), `040_registrar_dispositivo.test.sql` y `050_turnos.test.sql` (tarea 8), `060_modulos.test.sql` y `070_clientes.test.sql` (tarea 9), `080_confirmar_venta.test.sql` (tarea 10), `090_anular_venta.test.sql`, `100_ranking_sin_codigo.test.sql` y `110_caja_del_dia.test.sql` (tarea 11), `120_historial_productos.test.sql` y `130_productos.test.sql` (tarea 15), `135_jefe.test.sql` (tarea 16).
- `supabase/tests/database/140_aislamiento.test.sql` — aislamiento entre negocios sobre todas las funciones `security definer` (tarea 10; obligatoria; genérica, así que cubre también las funciones de las tareas 11 a 16).
- `supabase/tests/database/150_permisos_funciones.test.sql` — `search_path` vacío y sin EXECUTE para `anon` ni `public` en todas las funciones; EXECUTE de `authenticated` sólo en una lista explícita (tarea 10; genérica como la 140).

**Frontend: `src/`**
- `src/main.tsx` — monta React (tarea 1).
- `src/App.tsx` — raíz: sesión y ruteo simple (provisorio en tarea 1; la tarea 17 lo reemplaza).
- `src/vite-env.d.ts` — tipos de las variables `VITE_*` (tarea 1).
- `src/estilos.css` — CSS mínimo funcional (tarea 1; las tareas 6 a 19 agregan clases).
- `src/tipos.ts` — tipos de dominio compartidos (tarea 5).
- `src/lib/plata.ts` — formatear y leer pesos enteros (tarea 5).
- `src/lib/supabase.ts` — cliente de Supabase de la app (tarea 7).
- `src/lib/sentry.ts` — Sentry sólo para errores, sin datos personales en eventos ni breadcrumbs (tarea 19).
- `src/venta/cobro.ts` — cálculo de cobro y vuelto, puro (tarea 5).
- `src/venta/carrito.ts` — estado de la venta en armado, puro (tarea 10).
- `src/venta/idVenta.ts` — id de la venta en memoria: nuevo ante cualquier cambio de carrito o pagos (tarea 10).
- `src/venta/confirmar.ts` — llamada a `confirmar_venta` y lectura de sus errores (tarea 10).
- `src/catalogo/normalizar.ts` — texto sin tildes ni mayúsculas (tarea 6).
- `src/catalogo/buscar.ts` — búsqueda por nombre: desde 2 letras, inicio de palabra, máximo 8 (tarea 6).
- `src/catalogo/fuente.ts` — lectura paginada del catálogo desde Supabase, de a 1000 filas (tarea 7).
- `src/catalogo/cache.ts` — caché Dexie del catálogo separada por `negocio_id`; expone `borrarCache()` (tarea 7).
- `src/catalogo/programar.ts` — cuándo revisar `catalogo_version`: al arrancar, al volver a la pestaña y cada 3 minutos (tarea 7).
- `src/dispositivo/dispositivo.ts` — id de la PC en `localStorage` y alta automática (tarea 8).
- `src/turno/turno.ts` — abrir y cerrar turno contra la base (tarea 8).
- `src/turno/PantallaTurno.tsx` — pedir apertura y mostrar el cierre con total por medio (tarea 8).
- `src/escaner/umbrales.ts` — valores iniciales de los umbrales del escáner (tarea 12).
- `src/escaner/detector.ts` — distingue escaneo (rápido y con Enter) de tipeo (tarea 12).
- `src/escaner/dobleLectura.ts` — ignora la misma lectura en menos del umbral (tarea 12).
- `src/escaner/Calibracion.tsx` — pantalla para medir los umbrales con el escáner real (tarea 12).
- `src/ui/pitido.ts` — pitido al agregar (tarea 12).
- `src/caja/CampoEscaneo.tsx`, `src/caja/ListaSugerencias.tsx`, `src/caja/LineasVenta.tsx`, `src/caja/PantallaCaja.tsx` — pantalla de caja (tarea 12).
- `src/caja/PanelSinCodigo.tsx` — panel "Sin código (F2)" (tarea 13).
- `src/pagos/PantallaPagos.tsx` — medios de pago, vuelto, confirmar con aviso y reintento (tarea 14).
- `src/pagos/SelectorCliente.tsx` — elegir o dar de alta un cliente de fiado (tarea 14).
- `src/pagos/Comprobante.tsx` — comprobante en pantalla (tarea 14).
- `src/productos/AltaRapidaProducto.tsx` — alta ante código inexistente, "creado en caja" (tarea 15).
- `src/productos/PantallaProductos.tsx` — editar precio, nombre y activo (tarea 15).
- `src/caja-del-dia/CajaDelDia.tsx` — totales del día por medio de pago (tarea 16).
- `src/caja-del-dia/VentasDelDia.tsx` — lista de ventas y anulación con motivo (tarea 16).
- `src/jefe/ModuloFiado.tsx` — activar o desactivar el módulo fiado (tarea 16).
- `src/jefe/AnonimizarCliente.tsx` — anonimizar un cliente a pedido (tarea 16).
- `src/jefe/PantallaHistorial.tsx` — historial de auditoría (tarea 16).
- `src/auth/Login.tsx`, `src/auth/useSesion.ts` — login con email y contraseña; al cerrar sesión llama a `borrarCache()` (tarea 17).
- `src/auth/cuenta.ts` — lee el rol propio desde `cuentas` (tarea 17).
- `src/Kiosco.tsx` — arma las pantallas de un kiosco logueado según el rol (tarea 17).
- `src/servicios.ts` — implementaciones reales de los servicios (Supabase + Dexie) (tarea 17).
- `src/negocio/config.ts` — config visual y módulos del negocio (tarea 18).
- `src/negocio/AvisoAbono.tsx` — aviso del estado del abono, nunca bloquea (tarea 18).
- `src/app/version.ts` — compara la versión de la app con `version_minima()` y fuerza recarga (tarea 18).
- `src/test/setup.ts`, `src/test/entorno.test.ts` — setup y prueba del entorno (tarea 1).

**Pruebas fuera de `src/`**
- `tests/soporte/admin.ts` — crea kioscos de prueba con caja y jefe usando la service role local (tarea 4).
- `tests/integracion/token.test.ts` — token con `negocio_id`, rol desde `cuentas`, usuario sin cuenta no entra (tarea 4).
- `tests/integracion/catalogo.test.ts` — carga paginada con más de 1000 productos (tarea 7).
- `tests/integracion/venta.test.ts` — confirmar, reintento, doble clic, dos pestañas (tarea 14).
- `tests/e2e/preparar.ts`, `tests/e2e/venta.spec.ts` — Playwright (tarea 19).

---

## Tareas de la parte 1

### Tarea 0: Repo propio y .gitignore (REQUIERE OK DE FELIPE)

**Por qué:** hoy la carpeta del proyecto no es un repo propio: la raíz git es `C:/Users/felipe` (el home entero). Hay que crear el repo dentro de la carpeta del proyecto. Desde el repo del home, la carpeta va a aparecer como repo anidado sin seguimiento; no se toca el repo del home.

> **REQUIERE OK DE FELIPE.** No ejecutar ningún paso de esta tarea sin su OK explícito en el chat.

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Confirmar el estado actual**

Run:
```bash
cd "/c/Users/felipe/Desktop/app negocios"
git rev-parse --show-toplevel
```
Expected: `C:/Users/felipe` (la carpeta todavía no es repo propio). Si ya imprime `C:/Users/felipe/Desktop/app negocios`, el repo existe: saltear el Step 2.

- [ ] **Step 2: Crear el repo**

Run:
```bash
git init -b main
```
Expected: `Initialized empty Git repository in C:/Users/felipe/Desktop/app negocios/.git/`

- [ ] **Step 3: Escribir `.gitignore`**

`.gitignore`:
```gitignore
# Dependencias y builds
node_modules/
dist/

# Sesiones de brainstorming
.superpowers/

# Archivos de entorno (nunca al repo); el ejemplo sí va
.env
.env.*
!.env.example

# Artefactos de herramientas
.wrangler/
playwright-report/
test-results/
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 4: Verificar que el repo nuevo es el de la carpeta**

Run:
```bash
git rev-parse --show-toplevel
git status --short
```
Expected: primera línea `C:/Users/felipe/Desktop/app negocios`; `git status --short` lista `?? .gitignore` y `?? docs/`, y NO lista `.superpowers/` ni ningún `.env`.

- [ ] **Step 5: Commit (sólo con OK de Felipe)**

```bash
git add .gitignore docs
git commit -m "chore: repo propio con gitignore" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```
Expected: `[main (root-commit) xxxxxxx] chore: repo propio con gitignore`.

---

### Tarea 1: Scaffold Vite + React + TypeScript + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`
- Create: `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/estilos.css`
- Create: `src/test/setup.ts`
- Test: `src/test/entorno.test.ts`

Sin lógica de negocio. Se arma a mano (no con `npm create vite`) porque la carpeta no está vacía y el asistente de Vite hace preguntas.

- [ ] **Step 1: Escribir `package.json`**

`package.json`:
```json
{
  "name": "venta-y-cobro",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:integracion": "vitest run --config vitest.integracion.config.ts",
    "test:db": "supabase test db"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run:
```bash
npm install react react-dom @supabase/supabase-js dexie
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom fake-indexeddb
```
Expected: cada comando termina con `added N packages` y sin `ERR!`. `package.json` queda con `dependencies` y `devDependencies` completas y aparece `package-lock.json`.

- [ ] **Step 3: Escribir `tsconfig.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "config", "*.ts"]
}
```

- [ ] **Step 4: Escribir la prueba del entorno**

`src/test/entorno.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('entorno de pruebas', () => {
  it('tiene DOM y los matchers de jest-dom', () => {
    document.body.innerHTML = '<p>hola</p>'
    expect(document.querySelector('p')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Correrla y ver que falla**

Run: `npx vitest run src/test/entorno.test.ts`
Expected: FAIL. Sin config, Vitest corre en Node: `document is not defined` (o `Invalid Chai property: toBeInTheDocument`).

- [ ] **Step 6: Escribir la config de Vitest y el setup**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'config/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 7: Correr la prueba y ver que pasa**

Run: `npx vitest run src/test/entorno.test.ts`
Expected: `Test Files  1 passed (1)` y `Tests  1 passed (1)`.

- [ ] **Step 8: Escribir el resto del scaffold**

`index.html`:
```html
<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Caja</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`src/App.tsx` (provisorio; la tarea 17 lo reemplaza entero):
```tsx
export function App() {
  return <h1>Venta y cobro</h1>
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './estilos.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/estilos.css` (base mínima; las tareas 6 a 19 agregan las clases de cada pantalla):
```css
:root {
  --color-primario: #1f4e79;
  --color-texto: #1a1a1a;
  --color-fondo: #f7f7f5;
  --color-borde: #c9c9c4;
  --color-aviso: #fff4c2;
  --color-error: #fde2e1;
  --color-resaltado: #d9f2d9;
  font-family: system-ui, 'Segoe UI', sans-serif;
  font-size: 18px;
  color: var(--color-texto);
  background: var(--color-fondo);
}

* { box-sizing: border-box; }
body { margin: 0; }
button { font: inherit; padding: 0.5rem 0.9rem; border: 1px solid var(--color-borde); border-radius: 6px; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
input, select, textarea { font: inherit; padding: 0.5rem; border: 1px solid var(--color-borde); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--color-borde); text-align: left; }
.aviso { padding: 0.6rem 0.9rem; background: var(--color-aviso); border-radius: 6px; }
.aviso--error { background: var(--color-error); }
```

- [ ] **Step 9: Verificar tipos, pruebas y build**

Run:
```bash
npx tsc --noEmit
npm test
npm run build
```
Expected: `tsc` sin salida; `npm test` con `Tests  1 passed (1)`; el build termina con `✓ built in` y crea `dist/index.html`.

- [ ] **Step 10: Commit (sólo con OK de Felipe)**

```bash
git add package.json package-lock.json tsconfig.json index.html vite.config.ts vitest.config.ts src
git commit -m "chore: scaffold vite react ts vitest" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 2: Supabase local

**Files:**
- Create (CLI): `supabase/config.toml`
- Modify: `supabase/config.toml` (registro público apagado)
- Create: `supabase/migrations/` (carpeta vacía; la llena la tarea 3)
- Create: `.env.example`, `.env.local` (no va al repo)
- Test: `supabase/tests/database/000_pgtap.test.sql`

- [ ] **Step 1: Instalar la CLI como dependencia de desarrollo**

Run:
```bash
npm install -D supabase
npx supabase --version
```
Expected: `added N packages`; la segunda línea imprime una versión (por ejemplo `2.x.y`).

- [ ] **Step 2: Inicializar**

Run: `npx supabase init`
Expected: `Finished supabase init.` y aparece `supabase/config.toml`. Si pregunta por configuración de VS Code o Deno, contestar `N` (V9).

- [ ] **Step 3: Apagar el registro público en local**

En `supabase/config.toml`, dentro de la sección `[auth]`, cambiar la línea `enable_signup = true` por:
```toml
enable_signup = false
```
NO tocar `[auth.email]`: su `enable_signup` queda en `true`. Si se pone en `false`, GoTrue apaga el login con email entero (`email_provider_disabled`) y la tarea 4 no puede iniciar sesión (verificado en local). Las cuentas las crea Felipe (decisión 2); nadie se registra solo.

Run:
```bash
grep -n "enable_signup\|enable_anonymous_sign_ins" supabase/config.toml
```
Expected: `[auth]` con `enable_signup = false` y `enable_anonymous_sign_ins = false`; `[auth.email]` con `enable_signup = true`. Aparecen también `[auth.sms] enable_signup = false` (ya venía así) y una línea de comentario sobre `enable_anonymous_sign_ins`; no cuentan.

- [ ] **Step 4: Anotar el límite de filas de la API (V13)**

Run:
```bash
grep -n "max_rows" supabase/config.toml
```
Expected: `max_rows = 1000` dentro de `[api]`. No se cambia: la carga del catálogo (tarea 7) pagina de a 1000 filas para funcionar igual en local y en el proyecto hospedado.

- [ ] **Step 5: Crear las carpetas y la prueba mínima de pgTAP**

Run:
```bash
mkdir -p supabase/migrations supabase/tests/database
```

`supabase/tests/database/000_pgtap.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select has_schema('public', 'existe el esquema public');

select * from finish();
rollback;
```

- [ ] **Step 6: Levantar Supabase local**

Run: `npx supabase start`
Expected: tarda unos minutos la primera vez (baja imágenes de Docker); termina mostrando `API URL: http://127.0.0.1:54321` y las claves anon y service_role. Si falla con un error de Docker, abrir Docker Desktop y repetir.

- [ ] **Step 7: Correr la prueba**

Run: `npx supabase test db`
Expected: `All tests successful.` y `Result: PASS`.

- [ ] **Step 8: Variables de entorno**

`.env.example` (va al repo):
```dotenv
# Generar .env.local con:
#   npx supabase status -o env | sed -n 's/^API_URL=/VITE_SUPABASE_URL=/p; s/^ANON_KEY=/VITE_SUPABASE_ANON_KEY=/p' > .env.local
# En producción, .env.production.local con la URL y la anon key del proyecto hospedado.
# La service role key NUNCA va en variables VITE_ (terminaría en el navegador).
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
```

Run:
```bash
npx supabase status -o env | sed -n 's/^API_URL=/VITE_SUPABASE_URL=/p; s/^ANON_KEY=/VITE_SUPABASE_ANON_KEY=/p' > .env.local
grep -c "=" .env.local
git status --short .env.local
```
Expected: `2` y ninguna línea de `git status` (el `.gitignore` lo excluye). Si el conteo da otro número, los nombres de `supabase status -o env` son otros (V2): correr `npx supabase status -o env`, ver los nombres reales (pueden venir entre comillas) y ajustar el `sed`.

- [ ] **Step 9: Commit (sólo con OK de Felipe)**

```bash
git add package.json package-lock.json supabase .env.example
git commit -m "chore: supabase local con pgtap" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 3: Esquema y RLS en todas las tablas

**Files:**
- Create: `supabase/migrations/20261019120000_esquema_base.sql`
- Create: `supabase/migrations/20261019120100_rls_base.sql`
- Test: `supabase/tests/database/010_rls.test.sql`

Reglas que fija esta tarea (spec secciones 4 y 10):
- UUID en todas las entidades; `negocio_id` en todas las tablas del negocio; importes `integer` (pesos enteros).
- Claves foráneas compuestas `(x_id, negocio_id)`: una fila nunca apunta a datos de otro negocio, aunque una función tenga un error.
- Nadie escribe directo desde la app: `authenticated` sólo tiene `select`; las escrituras las hacen las funciones de las tareas 8 a 16. `anon` no tiene nada.
- Ventas, líneas, pagos, anulaciones e historial no se editan ni se borran: un trigger lo impide incluso para `postgres` (Studio). Es protección contra errores, no contra Felipe: él puede quitar el trigger a propósito.
- Un turno abierto por PC (decisión 38): índice único parcial.
- Lectura por rol: la caja ve ventas, líneas, pagos y anulaciones de hoy (día operativo en America/Argentina/Buenos_Aires); el jefe ve todo. El historial sólo lo ve el jefe. El rol se lee de `cuentas` con `auth.uid()`, no del token (V11).
- `modulos` trae su fila: `fiado`, activo por defecto.

- [ ] **Step 1: Escribir la prueba**

`supabase/tests/database/010_rls.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- 1 a 3: estructura
select tables_are(
  'public',
  array['negocios', 'cuentas', 'config_negocio', 'modulos', 'modulos_negocio', 'dispositivos',
        'productos', 'clientes', 'turnos', 'ventas', 'lineas_venta', 'pagos_venta',
        'anulaciones', 'historial'],
  'el esquema public tiene exactamente las tablas del modelo'
);

select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'todas las tablas de public tienen RLS activo'
);

select results_eq(
  $$ select clave, activo_por_defecto from public.modulos $$,
  $$ values ('fiado'::text, true) $$,
  'el único módulo es fiado, activo por defecto'
);

-- Datos de prueba, como postgres (saltea RLS)
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'caja-b@prueba.local');

insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');

insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');

insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');

insert into public.productos (id, negocio_id, nombre, precio, codigo_barras) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, 'ABC-7790001'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochitos', 700, null);

insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');

insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 900, repeat('a', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 900, repeat('b', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 700, repeat('c', 64));

insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 1, 900),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 1, 900);

insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo) values
  ('a0000000-0000-0000-0000-000000000000', 'cambio_precio', 'c0000000-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-000000000001', 'productos', 'a2000000-0000-0000-0000-000000000001',
   '{"precio": 800}', '{"precio": 900}');

-- 4 a 8: reglas que valen también para postgres
select throws_ok(
  $$ insert into public.turnos (negocio_id, dispositivo_id, cuenta_id)
     values ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a') $$,
  '23505', null,
  'una PC no tiene dos turnos abiertos'
);

select throws_ok(
  $$ insert into public.productos (negocio_id, nombre, precio, codigo_barras, activo)
     values ('a0000000-0000-0000-0000-000000000000', 'Otro', 100, 'ABC-7790001', false) $$,
  '23505', null,
  'el código de barras es único por negocio, incluidos los inactivos'
);

select throws_ok(
  $$ insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
     values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, 100, repeat('d', 64)) $$,
  '23503', null,
  'una venta no apunta a una PC de otro negocio'
);

select throws_ok(
  $$ delete from public.historial $$,
  'P0001', null,
  'el historial no se borra, ni siquiera como postgres'
);

select throws_ok(
  $$ update public.ventas set total = 1 $$,
  'P0001', null,
  'las ventas no se editan, ni siquiera como postgres'
);

-- 9 a 23: cuenta caja del kiosco A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre from public.productos $$,
  $$ values ('Alfajor'::text) $$,
  'caja A sólo ve sus productos'
);

select results_eq(
  $$ select nombre from public.negocios $$,
  $$ values ('Kiosco A'::text) $$,
  'caja A sólo ve su negocio'
);

select results_eq(
  $$ select rol::text from public.cuentas $$,
  $$ values ('caja'::text) $$,
  'caja A sólo ve su propia cuenta'
);

select results_eq(
  $$ select numero from public.ventas $$,
  $$ values (1) $$,
  'la caja ve sólo las ventas de hoy'
);

select results_eq(
  $$ select venta_id from public.lineas_venta $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid) $$,
  'la caja ve sólo las líneas de ventas de hoy'
);

select is_empty(
  $$ select id from public.historial $$,
  'la caja no ve el historial de auditoría'
);

select throws_ok(
  $$ insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
     values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 9, 100, repeat('e', 64)) $$,
  '42501', 'permission denied for table ventas',
  'nadie escribe directo en ventas'
);

select throws_ok(
  $$ delete from public.ventas $$,
  '42501', 'permission denied for table ventas',
  'nada de ventas se borra desde la app'
);

select throws_ok(
  $$ update public.productos set precio = 1 $$,
  '42501', 'permission denied for table productos',
  'la app no edita productos directo (sólo por funciones)'
);

select throws_ok(
  $$ insert into public.historial (negocio_id, tipo, entidad, entidad_id)
     values ('a0000000-0000-0000-0000-000000000000', 'cambio_precio', 'productos', gen_random_uuid()) $$,
  '42501', 'permission denied for table historial',
  'la app no escribe en el historial'
);

select throws_ok(
  $$ update public.negocios set estado_abono = 'activo' $$,
  '42501', 'permission denied for table negocios',
  'la app no escribe en negocios'
);

select throws_ok(
  $$ update public.cuentas set rol = 'jefe' $$,
  '42501', 'permission denied for table cuentas',
  'la caja no se convierte en jefe'
);

select throws_ok(
  $$ update public.config_negocio set nombre_visible = 'x' $$,
  '42501', 'permission denied for table config_negocio',
  'la app no escribe en config_negocio'
);

select throws_ok(
  $$ update public.modulos set activo_por_defecto = false $$,
  '42501', 'permission denied for table modulos',
  'la app no escribe en modulos'
);

select throws_ok(
  $$ insert into public.modulos_negocio (negocio_id, modulo, activo)
     values ('a0000000-0000-0000-0000-000000000000', 'fiado', false) $$,
  '42501', 'permission denied for table modulos_negocio',
  'la app no escribe directo en modulos_negocio'
);

-- 24 y 25: cuenta jefe del kiosco A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select numero from public.ventas order by numero $$,
  $$ values (1), (2) $$,
  'el jefe ve el historial completo de ventas'
);

select results_eq(
  $$ select tipo::text from public.historial $$,
  $$ values ('cambio_precio'::text) $$,
  'el jefe ve el historial de auditoría'
);

-- 26: cuenta caja del kiosco B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre from public.productos $$,
  $$ values ('Bizcochitos'::text) $$,
  'caja B no ve productos de A'
);

-- 27: anon
reset role;
set local role anon;

select throws_ok(
  $$ select * from public.productos $$,
  '42501', 'permission denied for table productos',
  'anon no lee nada'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx supabase test db`
Expected: FAIL en `010_rls.test.sql` (las tablas no existen: `relation "public.cuentas" does not exist` o similar). `000_pgtap.test.sql` sigue pasando.

- [ ] **Step 3: Escribir el esquema**

`supabase/migrations/20261019120000_esquema_base.sql`:
```sql
-- Esquema base de Venta y cobro.
-- Reglas: UUID en todas las entidades; negocio_id en todas las tablas del negocio; importes en pesos
-- enteros (integer); fechas de la base (now()); día operativo en America/Argentina/Buenos_Aires.
-- Las claves foráneas compuestas (x_id, negocio_id) impiden que una fila apunte a datos de otro negocio.

create type public.estado_abono as enum ('activo', 'gracia', 'suspendido');
create type public.rol_cuenta as enum ('caja', 'jefe');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'fiado');
create type public.tipo_historial as enum (
  'alta_producto', 'cambio_precio', 'cambio_producto', 'anulacion', 'apertura_turno', 'cierre_turno'
);

-- Estado del abono y catalogo_version: sólo aviso (decisión 19); catalogo_version la sube un trigger (tarea 7).
create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  estado_abono public.estado_abono not null default 'activo',
  catalogo_version bigint not null default 0 check (catalogo_version >= 0),
  creado timestamptz not null default now()
);

-- Dos cuentas por kiosco: caja (compartida del mostrador) y jefe (del dueño). Las crea Felipe.
-- Borrar el usuario de Auth falla si la cuenta ya operó (ventas, turnos, historial): es a propósito.
create table public.cuentas (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id),
  rol public.rol_cuenta not null,
  creado timestamptz not null default now(),
  unique (negocio_id, rol),
  unique (usuario_id, negocio_id)
);

create table public.config_negocio (
  negocio_id uuid primary key references public.negocios (id),
  nombre_visible text not null check (char_length(btrim(nombre_visible)) between 1 and 60),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  color_primario text not null default '#1f4e79' check (color_primario ~ '^#[0-9a-fA-F]{6}$')
);

-- Catálogo de módulos con su valor por defecto. En el MVP, sólo fiado (decisión 28).
create table public.modulos (
  clave text primary key check (clave ~ '^[a-z_]{1,30}$'),
  activo_por_defecto boolean not null
);
insert into public.modulos (clave, activo_por_defecto) values ('fiado', true);

-- Sin fila para un módulo = vale modulos.activo_por_defecto.
create table public.modulos_negocio (
  negocio_id uuid not null references public.negocios (id),
  modulo text not null references public.modulos (clave),
  activo boolean not null,
  primary key (negocio_id, modulo)
);

-- El id lo genera el navegador y vive en localStorage. El prefijo lo asigna registrar_dispositivo (tarea 8).
-- Pendiente del spec (sección 14): qué prefijo sigue después de Z. Hoy el check corta en Z.
create table public.dispositivos (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  prefijo text not null check (prefijo ~ '^[A-Z]$'),
  ultimo_numero integer not null default 0 check (ultimo_numero >= 0),
  creado_por uuid not null,
  creado timestamptz not null default now(),
  unique (negocio_id, prefijo),
  unique (id, negocio_id),
  foreign key (creado_por, negocio_id) references public.cuentas (usuario_id, negocio_id)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  precio integer not null check (precio > 0),
  -- Con letras o sin ellas (decisión 33): ASCII imprimible, sin espacios.
  codigo_barras text check (codigo_barras ~ '^[!-~]{1,48}$'),
  activo boolean not null default true,
  creado_en_caja boolean not null default false,
  creado timestamptz not null default now(),
  unique (id, negocio_id)
);
create index productos_negocio_idx on public.productos (negocio_id);
-- Único por negocio, incluidos los inactivos: un inactivo escaneado se ofrece reactivar.
create unique index productos_codigo_unico on public.productos (negocio_id, codigo_barras)
  where codigo_barras is not null;

-- Datos personales de terceros (Ley 25.326): sólo nombre o alias y teléfono opcional.
-- Anonimizado = nombre 'Cliente suprimido', teléfono vacío; la fila y sus ventas quedan.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  telefono text check (telefono is null or telefono ~ '^[0-9 +()-]{6,20}$'),
  suprimido boolean not null default false,
  creado timestamptz not null default now(),
  unique (id, negocio_id),
  check (not suprimido or (nombre = 'Cliente suprimido' and telefono is null))
);
create index clientes_negocio_idx on public.clientes (negocio_id);

-- Turno por PC (decisión 38), sin monto inicial. Abierto mientras cierre es null.
create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  apertura timestamptz not null default now(),
  cierre timestamptz,
  cierre_cuenta_id uuid,
  unique (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (cierre_cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  check (cierre is null or cierre >= apertura),
  check ((cierre is null) = (cierre_cuenta_id is null))
);
create index turnos_negocio_apertura_idx on public.turnos (negocio_id, apertura);
create unique index turnos_un_abierto_por_dispositivo on public.turnos (dispositivo_id)
  where cierre is null;

-- El id lo genera el navegador antes de confirmar y viaja igual en cada reintento del mismo contenido.
-- hash_contenido: sha256 en hex del contenido, lo calcula confirmar_venta (tarea 10).
create table public.ventas (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  turno_id uuid not null,
  numero integer not null check (numero > 0),
  fecha timestamptz not null default now(),
  total integer not null check (total > 0),
  hash_contenido text not null check (hash_contenido ~ '^[0-9a-f]{64}$'),
  unique (negocio_id, dispositivo_id, numero),
  unique (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (turno_id, negocio_id) references public.turnos (id, negocio_id)
);
create index ventas_negocio_fecha_idx on public.ventas (negocio_id, fecha);
create index ventas_turno_idx on public.ventas (turno_id);

-- Precio congelado al confirmar (decisión 12).
create table public.lineas_venta (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null,
  producto_id uuid not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario integer not null check (precio_unitario > 0),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (producto_id, negocio_id) references public.productos (id, negocio_id)
);
create index lineas_venta_venta_idx on public.lineas_venta (venta_id);
create index lineas_venta_producto_idx on public.lineas_venta (producto_id);

-- importe = lo aplicado al total, no lo entregado. Suma de pagos = total. El vuelto no se guarda.
create table public.pagos_venta (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null,
  medio public.medio_pago not null,
  importe integer not null check (importe > 0),
  cliente_id uuid,
  check ((medio = 'fiado') = (cliente_id is not null)),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (cliente_id, negocio_id) references public.clientes (id, negocio_id)
);
create index pagos_venta_venta_idx on public.pagos_venta (venta_id);

-- La anulación es un movimiento nuevo: la venta no se toca. Una sola por venta.
-- La caja del día la resta el día de anulaciones.fecha (decisión 17).
create table public.anulaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null unique,
  cuenta_id uuid not null,
  dispositivo_id uuid not null,
  fecha timestamptz not null default now(),
  motivo text not null check (char_length(btrim(motivo)) between 3 and 200),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id)
);
create index anulaciones_negocio_fecha_idx on public.anulaciones (negocio_id, fecha);

-- Historial de auditoría: sólo se agrega. cuenta_id y dispositivo_id vacíos = cambio hecho fuera
-- de la app (Supabase Studio). Nunca guarda datos de clientes (la anonimización no deja rastro del nombre).
create table public.historial (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  tipo public.tipo_historial not null,
  cuenta_id uuid,
  dispositivo_id uuid,
  fecha timestamptz not null default now(),
  entidad text not null check (entidad in ('productos', 'ventas', 'turnos')),
  entidad_id uuid not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  check (tipo <> 'anulacion' or motivo is not null),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id)
);
create index historial_negocio_fecha_idx on public.historial (negocio_id, fecha);

-- negocio_id del token (lo pone el Custom Access Token Hook). Null si no hay.
create or replace function public.negocio_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'negocio_id', '')::uuid
$$;

-- Rol de la cuenta que llama, leído de cuentas (no del token): un cambio aplica sin esperar
-- a que venza el token. Null si la cuenta no es de ese negocio.
create or replace function public.rol_actual()
returns public.rol_cuenta
language sql
stable
set search_path = ''
as $$
  select c.rol
  from public.cuentas c
  where c.usuario_id = auth.uid()
    and c.negocio_id = public.negocio_actual()
$$;

-- Día operativo del kiosco.
create or replace function public.dia_operativo(momento timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (momento at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select public.dia_operativo(now())
$$;

-- Nada de ventas se borra ni se edita; el historial tampoco (spec sección 4).
create or replace function public.impedir_cambios()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%: no se edita ni se borra', tg_table_name;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'lineas_venta', 'pagos_venta', 'anulaciones', 'historial'] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.impedir_cambios()',
      t || '_solo_agrega', t);
    execute format(
      'create trigger %I before truncate on public.%I for each statement execute function public.impedir_cambios()',
      t || '_sin_truncate', t);
  end loop;
end
$$;
```

- [ ] **Step 4: Escribir RLS y permisos**

`supabase/migrations/20261019120100_rls_base.sql`:
```sql
-- RLS en todas las tablas. La app (authenticated) sólo lee; escribe por funciones de la base (tareas 8 a 16).
-- anon no tiene acceso a nada.

alter table public.negocios enable row level security;
alter table public.cuentas enable row level security;
alter table public.config_negocio enable row level security;
alter table public.modulos enable row level security;
alter table public.modulos_negocio enable row level security;
alter table public.dispositivos enable row level security;
alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.turnos enable row level security;
alter table public.ventas enable row level security;
alter table public.lineas_venta enable row level security;
alter table public.pagos_venta enable row level security;
alter table public.anulaciones enable row level security;
alter table public.historial enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;

revoke execute on function public.negocio_actual(), public.rol_actual(),
  public.dia_operativo(timestamptz), public.hoy() from public, anon;
grant execute on function public.negocio_actual(), public.rol_actual(),
  public.dia_operativo(timestamptz), public.hoy() to authenticated;

-- Tablas de configuración y catálogo: todo el negocio.
create policy negocios_select on public.negocios
  for select to authenticated using (id = (select public.negocio_actual()));

create policy cuentas_select on public.cuentas
  for select to authenticated using (usuario_id = (select auth.uid()));

create policy config_negocio_select on public.config_negocio
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy modulos_select on public.modulos
  for select to authenticated using (true);

create policy modulos_negocio_select on public.modulos_negocio
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy dispositivos_select on public.dispositivos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy productos_select on public.productos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy clientes_select on public.clientes
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy turnos_select on public.turnos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

-- Ventas: la caja ve las de hoy; el jefe, todas (SUPUESTO NUEVO del spec).
create policy ventas_select on public.ventas
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Líneas y pagos: visibles si su venta es visible (la RLS de ventas aplica dentro del exists).
create policy lineas_venta_select on public.lineas_venta
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and exists (select 1 from public.ventas v where v.id = lineas_venta.venta_id)
  );

create policy pagos_venta_select on public.pagos_venta
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and exists (select 1 from public.ventas v where v.id = pagos_venta.venta_id)
  );

-- Anulaciones: la caja ve las hechas hoy; el jefe, todas.
create policy anulaciones_select on public.anulaciones
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Historial de auditoría: sólo el jefe.
create policy historial_select on public.historial
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and (select public.rol_actual()) = 'jefe'
  );
```

Nota para la tarea 11: como la caja no ve ventas de otros días, `caja_del_dia` no puede ser `security invoker` (una venta vieja anulada hoy por el jefe resta hoy y la caja no vería sus pagos). Va `security definer`, con `negocio_id` del token y la regla de día por rol dentro de la función.

- [ ] **Step 5: Aplicar las migraciones**

Run: `npx supabase db reset`
Expected: lista `Applying migration 20261019120000_esquema_base.sql...` y `Applying migration 20261019120100_rls_base.sql...`, y termina con `Finished supabase db reset`. Un aviso de que no existe `supabase/seed.sql` es normal.

- [ ] **Step 6: Correr las pruebas**

Run: `npx supabase test db`
Expected: `All tests successful.` y `Result: PASS` (2 archivos, 28 pruebas). Si falla en el `insert into auth.users`, ver V6. Si fallan "la caja ve sólo las ventas de hoy" o "el jefe ve el historial completo de ventas", `rol_actual()` no está leyendo `cuentas` (V11): revisar que el claim `sub` llegue a `auth.uid()` con `select auth.uid();` después del `set_config`.

- [ ] **Step 7: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(db): esquema con cuentas, turnos, historial y rls" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 4: Custom Access Token Hook con negocio_id leído de cuentas

**Files:**
- Create: `supabase/migrations/20261019120200_token_hook.sql`
- Modify: `supabase/config.toml` (sección `[auth.hook.custom_access_token]`)
- Create: `vitest.integracion.config.ts`, `tests/soporte/admin.ts`, `.env.integracion.local` (no va al repo)
- Test: `supabase/tests/database/020_token_hook.test.sql`, `tests/integracion/token.test.ts`

Decisiones de esta tarea:
- El hook lee `cuentas` y pone sólo `negocio_id` en el token. No usa `user_metadata` (el usuario la puede editar). El rol NO va en el token: las funciones y las policies lo leen de `cuentas` con `auth.uid()`. Los módulos tampoco van en el token (spec 5b).
- El hook no es `security definer` (la doc lo desaconseja); lee `cuentas` con un grant y una policy para `supabase_auth_admin` (V14).
- Un usuario sin fila en `cuentas` no entra: el hook devuelve error 403 y el login falla (V15). Como el hook corre también al refrescar el token, una cuenta borrada de `cuentas` deja de entrar al vencer su token (1 hora).

- [ ] **Step 1: Escribir la prueba pgTAP**

`supabase/tests/database/020_token_hook.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'hook-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'hook-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'hook-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000000a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated')
  )) -> 'claims' ->> 'negocio_id',
  'a0000000-0000-0000-0000-000000000000',
  'caja: el hook pone el negocio_id de su cuenta'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000001a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000001a', 'role', 'authenticated')
  )) -> 'claims' ->> 'negocio_id',
  'a0000000-0000-0000-0000-000000000000',
  'jefe: el hook pone el negocio_id de su cuenta'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000000a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated')
  )) -> 'claims' ->> 'sub',
  'c0000000-0000-0000-0000-00000000000a',
  'el hook conserva los claims que ya venían'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-0000000000ff',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated',
                                 'negocio_id', 'b0000000-0000-0000-0000-000000000000')
  )) -> 'error' ->> 'http_code',
  '403',
  'sin cuenta: el hook rechaza el login, aunque llegue un negocio_id en los claims'
);

select ok(
  not (public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-0000000000ff',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')
  )) ? 'claims'),
  'sin cuenta: el hook no devuelve claims'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'supabase_auth_admin puede ejecutar el hook'
);

select ok(
  not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'authenticated no puede ejecutar el hook'
);

select ok(
  not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'anon no puede ejecutar el hook'
);

select ok(
  has_table_privilege('supabase_auth_admin', 'public.cuentas', 'select'),
  'supabase_auth_admin puede leer cuentas (V14)'
);

select policy_roles_are(
  'public', 'cuentas', 'cuentas_auth_admin', array['supabase_auth_admin'],
  'la policy que deja leer cuentas al hook es sólo para supabase_auth_admin (V14)'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx supabase test db`
Expected: FAIL en `020_token_hook.test.sql` con `function public.custom_access_token_hook(jsonb) does not exist`. `000` y `010` siguen pasando.

- [ ] **Step 3: Escribir el hook**

`supabase/migrations/20261019120200_token_hook.sql`:
```sql
-- Custom Access Token Hook: pone negocio_id en el token leyendo cuentas.
-- Sin security definer (recomendación de Supabase): lee cuentas por grant + policy para supabase_auth_admin.
-- Sin cuenta, rechaza el login con 403.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_negocio uuid;
begin
  select c.negocio_id into v_negocio
  from public.cuentas c
  where c.usuario_id = (event ->> 'user_id')::uuid;

  if v_negocio is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Esta cuenta no está vinculada a ningún kiosco.'
    ));
  end if;

  v_claims := jsonb_set(v_claims, '{negocio_id}', to_jsonb(v_negocio::text));
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.cuentas to supabase_auth_admin;
create policy cuentas_auth_admin on public.cuentas
  as permissive for select to supabase_auth_admin using (true);
```

- [ ] **Step 4: Aplicar y correr la prueba pgTAP**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Finished supabase db reset`; después `All tests successful.` y `Result: PASS` (3 archivos, 38 pruebas). Si `020_token_hook` falla en el `insert into auth.users`, ver V6.

- [ ] **Step 5: Activar el hook en la config local**

En `supabase/config.toml`, si existen las líneas comentadas `# [auth.hook.custom_access_token]`, `# enabled = true` y `# uri = ...`, descomentarlas y dejarlas así; si no existen, agregar al final del archivo:
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

Run:
```bash
grep -n -A2 "^\[auth.hook.custom_access_token\]" supabase/config.toml
npx supabase stop
npx supabase start
```
Expected: el `grep` muestra la sección con `enabled = true` y la `uri`; Supabase arranca de nuevo mostrando `API URL: http://127.0.0.1:54321`. Los cambios de `[auth]` necesitan reiniciar; `db reset` no alcanza.

- [ ] **Step 6: Archivo de entorno para integración**

Run:
```bash
npx supabase status -o env | sed -n 's/^API_URL=/SUPABASE_URL=/p; s/^ANON_KEY=/SUPABASE_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/p' > .env.integracion.local
grep -c "=" .env.integracion.local
git status --short .env.integracion.local
```
Expected: `3` y ninguna línea de `git status`. Si el conteo da otro número, ver V2. Este archivo tiene la service role local: nunca va al repo (lo cubre `.env.*`) ni a la app (no tiene prefijo `VITE_`).

- [ ] **Step 7: Config de Vitest para integración**

`vitest.integracion.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig({
  test: {
    include: ['tests/integracion/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('integracion', process.cwd(), ''),
    testTimeout: 20000,
    fileParallelism: false,
  },
})
```

- [ ] **Step 8: Ayuda para crear kioscos de prueba con caja y jefe**

`tests/soporte/admin.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type RolDePrueba = 'caja' | 'jefe'

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: generar .env.integracion.local (tarea 4, step 6)`)
  return valor
}

const sinSesionPersistente = { auth: { persistSession: false, autoRefreshToken: false } }

export function clienteAdmin(): SupabaseClient {
  return createClient(variable('SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), sinSesionPersistente)
}

export function clienteAnonimo(): SupabaseClient {
  return createClient(variable('SUPABASE_URL'), variable('SUPABASE_ANON_KEY'), sinSesionPersistente)
}

export async function iniciarSesion(email: string, password: string): Promise<SupabaseClient> {
  const cliente = clienteAnonimo()
  const { error } = await cliente.auth.signInWithPassword({ email, password })
  if (error) throw error
  return cliente
}

export interface UsuarioDePrueba {
  usuarioId: string
  email: string
  password: string
}

export interface CuentaDePrueba extends UsuarioDePrueba {
  cliente: SupabaseClient
}

export interface KioscoDePrueba {
  negocioId: string
  caja: CuentaDePrueba
  jefe: CuentaDePrueba
}

/** Usuario de Auth sin fila en cuentas (no debería poder entrar). */
export async function crearUsuarioSinCuenta(): Promise<UsuarioDePrueba> {
  const email = `prueba-${crypto.randomUUID()}@prueba.local`
  const password = `prueba-${crypto.randomUUID()}`
  const { data, error } = await clienteAdmin().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return { usuarioId: data.user.id, email, password }
}

async function crearCuenta(negocioId: string, rol: RolDePrueba): Promise<CuentaDePrueba> {
  const usuario = await crearUsuarioSinCuenta()
  const { error } = await clienteAdmin()
    .from('cuentas')
    .insert({ usuario_id: usuario.usuarioId, negocio_id: negocioId, rol })
  if (error) throw error
  const cliente = await iniciarSesion(usuario.email, usuario.password)
  return { ...usuario, cliente }
}

/** Kiosco nuevo con sus dos cuentas (caja y jefe), cada una ya logueada. */
export async function crearKioscoDePrueba(nombre: string): Promise<KioscoDePrueba> {
  const negocio = await clienteAdmin().from('negocios').insert({ nombre }).select('id').single()
  if (negocio.error) throw negocio.error
  const negocioId = negocio.data.id as string
  const caja = await crearCuenta(negocioId, 'caja')
  const jefe = await crearCuenta(negocioId, 'jefe')
  return { negocioId, caja, jefe }
}
```

- [ ] **Step 9: Escribir la prueba de integración**

`tests/integracion/token.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { clienteAnonimo, crearKioscoDePrueba, crearUsuarioSinCuenta } from '../soporte/admin'

async function negocioDelToken(cliente: SupabaseClient): Promise<unknown> {
  const { data } = await cliente.auth.getSession()
  if (!data.session) throw new Error('El cliente no tiene sesión')
  const contenido = JSON.parse(
    Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>
  return contenido.negocio_id
}

describe('Custom Access Token Hook', () => {
  it('caja y jefe del mismo kiosco reciben su negocio_id en el token', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco token')
    expect(await negocioDelToken(kiosco.caja.cliente)).toBe(kiosco.negocioId)
    expect(await negocioDelToken(kiosco.jefe.cliente)).toBe(kiosco.negocioId)
  })

  it('cada cuenta lee su propio rol desde cuentas', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco roles')
    const caja = await kiosco.caja.cliente.from('cuentas').select('rol')
    const jefe = await kiosco.jefe.cliente.from('cuentas').select('rol')
    expect(caja.error).toBeNull()
    expect(caja.data).toEqual([{ rol: 'caja' }])
    expect(jefe.error).toBeNull()
    expect(jefe.data).toEqual([{ rol: 'jefe' }])
  })

  it('un usuario sin cuenta no entra', async () => {
    const usuario = await crearUsuarioSinCuenta()
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({
      email: usuario.email,
      password: usuario.password,
    })
    expect(error).not.toBeNull()
    expect(data.session).toBeNull()
  })

  it('una cuenta no ve otro kiosco', async () => {
    const a = await crearKioscoDePrueba('Kiosco A')
    await crearKioscoDePrueba('Kiosco B')
    const { data, error } = await a.jefe.cliente.from('negocios').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: a.negocioId }])
  })

  it('el registro público está apagado', async () => {
    const { error } = await clienteAnonimo().auth.signUp({
      email: `intruso-${crypto.randomUUID()}@prueba.local`,
      password: `prueba-${crypto.randomUUID()}`,
    })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 10: Correrla**

Run: `npm run test:integracion`
Expected: `Test Files  1 passed (1)` y `Tests  5 passed (5)`.

Si falla:
- La primera prueba (sin `negocio_id`, o `crearKioscoDePrueba` tira error al iniciar sesión): revisar la URI del hook (V3) y que el hook pueda leer `cuentas` (V14).
- `createUser` falla con el registro apagado: ver V4.
- "un usuario sin cuenta no entra" falla porque el login funciona (V15: el hook no puede rechazar con `error`). Plan B: en `20261019120200_token_hook.sql`, reemplazar el bloque `if v_negocio is null then ... end if;` por
  ```sql
  if v_negocio is null then
    return jsonb_set(event, '{claims}', v_claims - 'negocio_id');
  end if;
  ```
  En `020_token_hook.test.sql`, cambiar las pruebas 4 y 5 por estas dos (el plan sigue en 10):
  ```sql
  select ok(
    not (public.custom_access_token_hook(jsonb_build_object(
      'user_id', 'c0000000-0000-0000-0000-0000000000ff',
      'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated',
                                   'negocio_id', 'b0000000-0000-0000-0000-000000000000')
    )) -> 'claims' ? 'negocio_id'),
    'sin cuenta: el token sale sin negocio_id, aunque llegue uno en los claims'
  );

  select is(
    public.custom_access_token_hook(jsonb_build_object(
      'user_id', 'c0000000-0000-0000-0000-0000000000ff',
      'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')
    )) -> 'claims' ->> 'sub',
    'c0000000-0000-0000-0000-0000000000ff',
    'sin cuenta: el token conserva sus claims, pero no ve nada por RLS'
  );
  ```
  Y en `tests/integracion/token.test.ts`, reemplazar el cuerpo de "un usuario sin cuenta no entra" por:
  ```ts
    const usuario = await crearUsuarioSinCuenta()
    const cliente = clienteAnonimo()
    const { error } = await cliente.auth.signInWithPassword({ email: usuario.email, password: usuario.password })
    expect(error).toBeNull()
    expect(await negocioDelToken(cliente)).toBeUndefined()
    const negocios = await cliente.from('negocios').select('id')
    expect(negocios.data).toEqual([])
  ```
  Con el plan B, la tarea 17 tiene que mostrar "Esta cuenta no está vinculada a ningún kiosco" cuando el token no trae `negocio_id`. Correr de nuevo `npx supabase db reset`, `npx supabase test db` y `npm run test:integracion`.

- [ ] **Step 11: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests supabase/config.toml vitest.integracion.config.ts tests
git commit -m "feat(auth): negocio_id en el token leyendo cuentas" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 5: Cálculo de cobro en TypeScript puro

**Files:**
- Create: `src/tipos.ts`, `src/lib/plata.ts`, `src/venta/cobro.ts`
- Test: `src/lib/plata.test.ts`, `src/venta/cobro.test.ts`

Reglas (spec secciones 2 y 6). **Contrato con la tarea 10:** `confirmar_venta` aplica las mismas reglas y usa los mismos códigos de error (`ErrorCobro`) en sus mensajes, para que la pantalla traduzca una sola tabla:

| Código | Regla |
|---|---|
| `importe_invalido` | Todo importe (total, cada medio, efectivo entregado) es un entero de pesos, sin decimales ni negativos. |
| `venta_vacia` | El total es mayor que cero. |
| `no_suma_total` | La suma de los importes aplicados es igual al total. |
| `efectivo_insuficiente` | Lo entregado en efectivo es igual o mayor que la parte del total que se paga en efectivo. |
| `entrega_sin_efectivo` | No se informa efectivo entregado si la parte en efectivo es 0 (si no, aparecería un vuelto sin sentido). |
| `fiado_deshabilitado` | Sólo hay parte fiada si el módulo fiado está activo. |
| `fiado_sin_cliente` | La parte fiada exige un cliente. |

- Vuelto = efectivo entregado − parte del total en efectivo. Sin billetes sugeridos ni redondeo (decisión 10). Si no se informa la entrega, se toma igual a la parte en efectivo (vuelto 0).
- Pagos combinables: cualquier combinación de efectivo, transferencia, tarjeta y fiado, incluido fiado parcial (decisión 8). A la base sólo viajan los medios con importe mayor que cero.

- [ ] **Step 1: Escribir los tipos compartidos**

`src/tipos.ts`:
```ts
export type Medio = 'efectivo' | 'transferencia' | 'tarjeta' | 'fiado'

export const MEDIOS: readonly Medio[] = ['efectivo', 'transferencia', 'tarjeta', 'fiado']

export const NOMBRE_MEDIO: Record<Medio, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
}

export type Rol = 'caja' | 'jefe'

export type EstadoAbono = 'activo' | 'gracia' | 'suspendido'

/** Producto del catálogo, como viene de public.productos. Precio en pesos enteros. */
export interface Producto {
  id: string
  nombre: string
  precio: number
  codigo_barras: string | null
  activo: boolean
  creado_en_caja: boolean
}

/** Producto guardado en la caché, con las palabras normalizadas del nombre (índice multiEntry). */
export interface ProductoCache extends Producto {
  palabras: string[]
}

/** Fila de ranking_sin_codigo(). */
export interface ItemRanking {
  producto_id: string
  nombre: string
  precio: number
  cantidad_ventas: number
}

export interface LineaCarrito {
  productoId: string
  nombre: string
  precio: number
  cantidad: number
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string | null
}

export interface Modulos {
  fiado: boolean
}
```

- [ ] **Step 2: Escribir las pruebas de plata**

`src/lib/plata.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatearPesos, parsearPesos } from './plata'

describe('formatearPesos', () => {
  it('usa punto de miles y nunca decimales', () => {
    expect(formatearPesos(0)).toBe('$0')
    expect(formatearPesos(900)).toBe('$900')
    expect(formatearPesos(1500)).toBe('$1.500')
    expect(formatearPesos(1234567)).toBe('$1.234.567')
  })
})

describe('parsearPesos', () => {
  it('lee enteros con o sin punto de miles', () => {
    expect(parsearPesos('1500')).toBe(1500)
    expect(parsearPesos('1.500')).toBe(1500)
    expect(parsearPesos(' 2.000.000 ')).toBe(2000000)
  })

  it('vacío es cero', () => {
    expect(parsearPesos('')).toBe(0)
  })

  it('rechaza centavos, negativos y texto', () => {
    expect(parsearPesos('10,5')).toBeNull()
    expect(parsearPesos('1.5')).toBeNull()
    expect(parsearPesos('-3')).toBeNull()
    expect(parsearPesos('abc')).toBeNull()
  })
})
```

- [ ] **Step 3: Escribir las pruebas de cobro**

`src/venta/cobro.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  calcularCobro,
  efectivoRestante,
  esPesoEntero,
  pagosAEnviar,
  type EntradaCobro,
  type ImportesPorMedio,
} from './cobro'

const importes = (parcial: Partial<ImportesPorMedio>): ImportesPorMedio => ({
  efectivo: 0,
  transferencia: 0,
  tarjeta: 0,
  fiado: 0,
  ...parcial,
})

const entrada = (parcial: Partial<EntradaCobro> & Pick<EntradaCobro, 'total' | 'importes'>): EntradaCobro => ({
  efectivoEntregado: null,
  clienteFiadoId: null,
  fiadoHabilitado: true,
  ...parcial,
})

describe('calcularCobro', () => {
  it('vuelto exacto sobre el efectivo, con pagos combinados', () => {
    const r = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 1000, tarjeta: 500 }), efectivoEntregado: 2000 }))
    expect(r).toEqual({ suma: 1500, falta: 0, vuelto: 1000, errores: [], valido: true })
  })

  it('sin entrega informada el vuelto es 0', () => {
    const r = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 1500 }) }))
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(true)
  })

  it('no da vuelto sobre transferencia ni tarjeta', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ transferencia: 600, tarjeta: 400 }) }))
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(true)
  })

  it('la entrega en efectivo no alcanza', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 1000 }), efectivoEntregado: 500 }))
    expect(r.errores).toEqual(['efectivo_insuficiente'])
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(false)
  })

  it('entrega en efectivo sin parte en efectivo', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ tarjeta: 1000 }), efectivoEntregado: 500 }))
    expect(r.errores).toEqual(['entrega_sin_efectivo'])
    expect(r.vuelto).toBe(0)
    expect(r.valido).toBe(false)
  })

  it('pagos que no suman el total', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 600, tarjeta: 300 }) }))
    expect(r.errores).toEqual(['no_suma_total'])
    expect(r.falta).toBe(100)
    expect(r.valido).toBe(false)
  })

  it('fiado parcial exige cliente', () => {
    const sinCliente = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 500, fiado: 1000 }) }))
    expect(sinCliente.errores).toEqual(['fiado_sin_cliente'])
    const conCliente = calcularCobro(entrada({ total: 1500, importes: importes({ efectivo: 500, fiado: 1000 }), clienteFiadoId: 'cli-1' }))
    expect(conCliente.valido).toBe(true)
  })

  it('fiado con el módulo apagado se rechaza', () => {
    const r = calcularCobro(entrada({
      total: 1000,
      importes: importes({ fiado: 1000 }),
      clienteFiadoId: 'cli-1',
      fiadoHabilitado: false,
    }))
    expect(r.errores).toEqual(['fiado_deshabilitado'])
    expect(r.valido).toBe(false)
  })

  it('rechaza importes con decimales', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 10.5 }) }))
    expect(r.errores).toEqual(['importe_invalido'])
    expect(r.valido).toBe(false)
  })

  it('rechaza importes negativos', () => {
    const r = calcularCobro(entrada({ total: 1000, importes: importes({ efectivo: 1100, tarjeta: -100 }) }))
    expect(r.errores).toEqual(['importe_invalido'])
    expect(r.valido).toBe(false)
  })

  it('una venta de total 0 no es válida', () => {
    const r = calcularCobro(entrada({ total: 0, importes: importes({}) }))
    expect(r.errores).toEqual(['venta_vacia'])
    expect(r.valido).toBe(false)
  })
})

describe('efectivoRestante', () => {
  it('el efectivo es lo que falta después de los otros medios', () => {
    expect(efectivoRestante(3000, { transferencia: 0, tarjeta: 1000, fiado: 500 })).toBe(1500)
  })

  it('nunca es negativo', () => {
    expect(efectivoRestante(1000, { transferencia: 2000, tarjeta: 0, fiado: 0 })).toBe(0)
  })
})

describe('pagosAEnviar', () => {
  it('manda sólo los medios con importe y el cliente sólo en el fiado', () => {
    expect(pagosAEnviar(importes({ efectivo: 500, fiado: 1000 }), 'cli-1')).toEqual([
      { medio: 'efectivo', importe: 500, cliente_id: null },
      { medio: 'fiado', importe: 1000, cliente_id: 'cli-1' },
    ])
  })
})

describe('esPesoEntero', () => {
  it('acepta sólo enteros no negativos', () => {
    expect(esPesoEntero(0)).toBe(true)
    expect(esPesoEntero(1500)).toBe(true)
    expect(esPesoEntero(1.5)).toBe(false)
    expect(esPesoEntero(-1)).toBe(false)
    expect(esPesoEntero(Number.NaN)).toBe(false)
  })
})
```

- [ ] **Step 4: Correrlas y ver que fallan**

Run: `npx vitest run src/lib/plata.test.ts src/venta/cobro.test.ts`
Expected: FAIL: `Failed to resolve import "./plata"` y `Failed to resolve import "./cobro"`.

- [ ] **Step 5: Implementar plata**

`src/lib/plata.ts`:
```ts
/** $1.500: punto de miles, sin decimales. */
export function formatearPesos(pesos: number): string {
  const signo = pesos < 0 ? '-' : ''
  const miles = String(Math.abs(pesos)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}$${miles}`
}

/** Lee pesos enteros escritos por el cajero. Vacío = 0. Centavos, negativos o texto = null. */
export function parsearPesos(texto: string): number | null {
  const limpio = texto.trim()
  if (limpio === '') return 0
  if (/^\d{1,9}$/.test(limpio)) return Number(limpio)
  if (/^\d{1,3}(\.\d{3}){1,2}$/.test(limpio)) return Number(limpio.replace(/\./g, ''))
  return null
}
```

- [ ] **Step 6: Implementar cobro**

`src/venta/cobro.ts`:
```ts
import { MEDIOS, type Medio } from '../tipos'

export type ImportesPorMedio = Record<Medio, number>

/** Mismos códigos que devuelve confirmar_venta (tarea 10). */
export type ErrorCobro =
  | 'importe_invalido'
  | 'venta_vacia'
  | 'no_suma_total'
  | 'efectivo_insuficiente'
  | 'entrega_sin_efectivo'
  | 'fiado_deshabilitado'
  | 'fiado_sin_cliente'

export interface EntradaCobro {
  total: number
  /** Lo aplicado al total por cada medio. 0 = medio no usado. */
  importes: ImportesPorMedio
  /** Lo que el cliente entrega en efectivo. null = no se informó (se toma igual a la parte en efectivo). */
  efectivoEntregado: number | null
  clienteFiadoId: string | null
  /** Módulo fiado activo para el negocio. */
  fiadoHabilitado: boolean
}

export interface ResultadoCobro {
  suma: number
  /** total − suma: positivo falta, negativo sobra. */
  falta: number
  vuelto: number
  errores: ErrorCobro[]
  valido: boolean
}

export interface PagoAEnviar {
  medio: Medio
  importe: number
  cliente_id: string | null
}

export function esPesoEntero(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0
}

export function calcularCobro(e: EntradaCobro): ResultadoCobro {
  const valores = MEDIOS.map((m) => e.importes[m])
  const efectivo = e.importes.efectivo
  const entregado = e.efectivoEntregado ?? efectivo
  if (![e.total, entregado, ...valores].every(esPesoEntero)) {
    return { suma: 0, falta: 0, vuelto: 0, errores: ['importe_invalido'], valido: false }
  }

  const errores: ErrorCobro[] = []
  const suma = valores.reduce((a, b) => a + b, 0)
  if (e.total === 0) errores.push('venta_vacia')
  if (suma !== e.total) errores.push('no_suma_total')
  if (efectivo === 0 && entregado > 0) errores.push('entrega_sin_efectivo')
  else if (entregado < efectivo) errores.push('efectivo_insuficiente')
  if (e.importes.fiado > 0 && !e.fiadoHabilitado) errores.push('fiado_deshabilitado')
  else if (e.importes.fiado > 0 && !e.clienteFiadoId) errores.push('fiado_sin_cliente')

  const vuelto = efectivo > 0 && entregado > efectivo ? entregado - efectivo : 0
  return { suma, falta: e.total - suma, vuelto, errores, valido: errores.length === 0 }
}

/** El efectivo es el resto: total menos los otros medios, nunca negativo. */
export function efectivoRestante(total: number, otros: Omit<ImportesPorMedio, 'efectivo'>): number {
  return Math.max(0, total - otros.transferencia - otros.tarjeta - otros.fiado)
}

/** Lo que viaja a confirmar_venta: sólo medios con importe; cliente sólo en el fiado. */
export function pagosAEnviar(importes: ImportesPorMedio, clienteFiadoId: string | null): PagoAEnviar[] {
  return MEDIOS.filter((m) => importes[m] > 0).map((m) => ({
    medio: m,
    importe: importes[m],
    cliente_id: m === 'fiado' ? clienteFiadoId : null,
  }))
}
```

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run src/lib/plata.test.ts src/venta/cobro.test.ts`
Expected: `Test Files  2 passed (2)` y `Tests  19 passed (19)`.

- [ ] **Step 8: Verificar tipos y la suite completa**

Run:
```bash
npx tsc --noEmit
npm test
```
Expected: `tsc` sin salida; `npm test` con `Test Files  3 passed (3)` y `Tests  20 passed (20)`.

- [ ] **Step 9: Commit (sólo con OK de Felipe)**

```bash
git add src/tipos.ts src/lib src/venta
git commit -m "feat(cobro): vuelto y pagos combinados en enteros" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Cobertura de la parte 1

| Punto del spec | Dónde queda en esta parte |
|---|---|
| Repo propio, `.gitignore` con `node_modules`, `dist`, `.superpowers/` y entorno | Tarea 0 |
| Stack Vite + React + TypeScript, Vitest | Tarea 1 |
| Supabase local, registro público apagado en local, `max_rows` 1000 anotado | Tarea 2 |
| Modelo de datos (sección 4): 14 tablas, UUID, enteros, `negocio_id`, índices por negocio y por fecha de ventas | Tarea 3 |
| RLS en todas las tablas; sin escritura directa desde la app; ventas e historial no se editan ni borran | Tarea 3 |
| Lectura por rol: caja sólo hoy, jefe todo; historial sólo jefe (sección 10) | Tarea 3 |
| Un turno abierto por PC; código único por negocio incluidos inactivos; "creado en caja"; prefijo `A` a `Z` (después de Z, lo define la tarea 8) | Tarea 3 |
| Módulo fiado activo por defecto (`modulos`) y regla "sin fila vale el defecto" (la aplica `modulo_activo`, tarea 9) | Tarea 3 |
| `negocio_id` en el token leyendo `cuentas`; el rol se lee de `cuentas`; usuario sin cuenta no entra | Tarea 4 |
| Vuelto exacto, pagos combinados, fiado parcial, enteros, mismas reglas que la base | Tarea 5 |

Pasa a la parte 2 (tareas 6 a 10): caché Dexie con carga paginada (V13), trigger de `catalogo_version`, dispositivos y turnos con cierre automático, módulo fiado (`modulo_activo`), alta de clientes y confirmación idempotente (`confirmar_venta`). Pasa a la parte 3 (tareas 11 a 14): anulación por rol y día, ranking sin código, caja del día, pantalla de caja con escáner y umbrales calibrables, panel F2 y pagos con comprobante. Pasa a la parte 4 (tareas 15 a 17): productos y precios con historial de auditoría (V12), jefe (módulo fiado y anonimización) y login por rol (V11, `rol_actual`). Pasa a la parte 5 (tareas 18 y 19): personalización, aviso de abono, `version_minima()` con recarga forzada, Cloudflare Workers con `_headers` y CSP (V1), Sentry sin datos personales, revocación de funciones viejas a las 48 horas, y los pasos recomendados (2FA en Supabase y Cloudflare; restaurar un backup en un proyecto de prueba antes del primer kiosco).

# Parte 2: Catálogo, dispositivos, turnos, clientes y confirmación (tareas 6 a 10)

**Goal:** búsqueda por nombre, caché Dexie del catálogo con `catalogo_version`, alta automática de dispositivos, turnos por PC, módulo fiado con alta de clientes y la función `confirmar_venta` idempotente, con pruebas genéricas de aislamiento y permisos que cubren también las funciones de las partes siguientes.

**Architecture:** igual que la parte 1. Todas las escrituras van por funciones `security definer` con `set search_path = ''`, `negocio_id` del token (`public.negocio_actual()`) y rol desde `cuentas` (`public.rol_actual()`). La interfaz llama a la base con funciones finas en TypeScript que reciben el cliente de Supabase; los componentes reciben servicios por props para probarlos sin red.

**Tech Stack:** el de la parte 1 (Vite, React, TypeScript, Vitest + Testing Library, supabase-js, Supabase CLI, pgTAP, Dexie, fake-indexeddb).

Esta parte sigue a la parte 1 (tareas 0 a 5) y usa sus nombres, su sección "Antes de empezar" y su tabla V1 a V15. Las tareas 11 a 19 las escriben las partes 3 a 5. Comandos en Git Bash desde `"/c/Users/felipe/Desktop/app negocios"`. Antes de programar, cargar la skill `ponytail` (regla de Felipe).

Convenciones de esta parte:
- Errores de las funciones: `raise exception '<codigo>' using errcode = 'P0001'`. PostgREST responde HTTP 400 con `message` = código, `code` = `P0001` y `details` = el `detail` (verificado en https://docs.postgrest.org/en/stable/references/errors.html).
- Permisos de cada función: `revoke all ... from public, anon, authenticated;` y, si la app la usa, `grant execute ... to authenticated;`. La tarea 10 lo prueba en forma genérica (`150_permisos_funciones.test.sql`).
- El historial guarda sólo lo que lista el spec (decisión 27 y tabla `historial`): cambios de precio y de producto, anulaciones, aperturas y cierres de turno. La venta confirmada y el alta de clientes no van al historial.
- La base local se comparte con las pruebas de integración, que dejan kioscos creados. Toda consulta de una prueba pgTAP hecha como `postgres` (sin RLS) filtra por el negocio o el id de la prueba.

---

### Tarea 6: Normalización y búsqueda por nombre

**Files:**
- Create: `src/catalogo/normalizar.ts`, `src/catalogo/buscar.ts`
- Test: `src/catalogo/normalizar.test.ts`, `src/catalogo/buscar.test.ts`

Reglas (spec sección 6): minúsculas, sin tildes, espacios colapsados; coincide con palabras que empiezan con lo escrito, nunca con el medio de una palabra; desde 2 letras; máximo 8; sólo activos; orden determinista: nombre normalizado y, si empata, `id`. El buscador general no usa el ranking.

- [ ] **Step 1: Escribir las pruebas**

`src/catalogo/normalizar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizar, palabras } from './normalizar'

describe('normalizar', () => {
  it('saca tildes y mayúsculas y colapsa espacios', () => {
    expect(normalizar('  Café   CON Leche ')).toBe('cafe con leche')
    expect(normalizar('Ñandú Águila')).toBe('nandu aguila')
  })

  it('texto vacío queda vacío', () => {
    expect(normalizar('')).toBe('')
    expect(normalizar('   ')).toBe('')
  })
})

describe('palabras', () => {
  it('parte en palabras alfanuméricas', () => {
    expect(palabras('Coca-Cola 1,5 L')).toEqual(['coca', 'cola', '1', '5', 'l'])
    expect(palabras('   ')).toEqual([])
  })
})
```

`src/catalogo/buscar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { ProductoCache } from '../tipos'
import { buscarPorNombre, MAX_RESULTADOS } from './buscar'
import { palabras } from './normalizar'

const p = (id: string, nombre: string, activo = true): ProductoCache => ({
  id,
  nombre,
  precio: 100,
  codigo_barras: null,
  activo,
  creado_en_caja: false,
  palabras: palabras(nombre),
})

const catalogo = [
  p('1', 'Coca Cola 500'),
  p('2', 'Café La Virginia'),
  p('3', 'Alfajor Cofler'),
  p('4', 'Chocolate Águila'),
  p('5', 'Coca Light', false),
]

const nombres = (consulta: string, lista = catalogo) => buscarPorNombre(lista, consulta).map((x) => x.nombre)

describe('buscarPorNombre', () => {
  it('no distingue tildes ni mayúsculas', () => {
    expect(nombres('CAFE')).toEqual(['Café La Virginia'])
    expect(nombres('águi')).toEqual(['Chocolate Águila'])
  })

  it('coincide con el inicio de cualquier palabra, en orden alfabético', () => {
    expect(nombres('co')).toEqual(['Alfajor Cofler', 'Coca Cola 500'])
    expect(nombres('cola 5')).toEqual(['Coca Cola 500'])
  })

  it('no coincide con el medio de una palabra', () => {
    expect(nombres('ola')).toEqual([])
  })

  it('espacios extra no cambian el resultado', () => {
    expect(nombres('   coca    cola  ')).toEqual(nombres('coca cola'))
  })

  it('menos de 2 letras o texto vacío devuelve vacío', () => {
    expect(nombres('c')).toEqual([])
    expect(nombres('')).toEqual([])
    expect(nombres('   ')).toEqual([])
  })

  it('no muestra productos desactivados', () => {
    expect(nombres('light')).toEqual([])
  })

  it('corta en 8 y siempre en el mismo orden', () => {
    const muchas = Array.from({ length: 10 }, (_, i) => p(String(i), `Galletita ${String(i).padStart(2, '0')}`)).reverse()
    expect(MAX_RESULTADOS).toBe(8)
    expect(nombres('gal', muchas)).toEqual(Array.from({ length: 8 }, (_, i) => `Galletita 0${i}`))
  })

  it('a igual nombre desempata por id', () => {
    expect(buscarPorNombre([p('b', 'Pan'), p('a', 'Pan')], 'pan').map((x) => x.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `npx vitest run src/catalogo`
Expected: FAIL: `Failed to resolve import "./normalizar"` y `"./buscar"`.

- [ ] **Step 3: Implementar**

`src/catalogo/normalizar.ts`:
```ts
/** Minúsculas, sin tildes (la ñ queda como n), espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras alfanuméricas normalizadas: es lo que guarda el índice multiEntry de la caché. */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0)
}
```

`src/catalogo/buscar.ts`:
```ts
import type { ProductoCache } from '../tipos'
import { normalizar, palabras } from './normalizar'

export const MAX_RESULTADOS = 8
export const MIN_LETRAS = 2

type Buscable = Pick<ProductoCache, 'id' | 'nombre' | 'palabras' | 'activo'>

/** Términos normalizados, o null si hay menos de 2 letras para buscar. */
export function terminosDeBusqueda(consulta: string): string[] | null {
  const terminos = palabras(consulta)
  return terminos.join('').length >= MIN_LETRAS ? terminos : null
}

function coincide(palabrasProducto: readonly string[], terminos: readonly string[]): boolean {
  return terminos.every((t) => palabrasProducto.some((p) => p.startsWith(t)))
}

/** Orden determinista: nombre normalizado y, si empata, id. */
export function compararPorNombre(a: Pick<Buscable, 'id' | 'nombre'>, b: Pick<Buscable, 'id' | 'nombre'>): number {
  const na = normalizar(a.nombre)
  const nb = normalizar(b.nombre)
  if (na !== nb) return na < nb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function buscarPorNombre<T extends Buscable>(productos: readonly T[], consulta: string): T[] {
  const terminos = terminosDeBusqueda(consulta)
  if (!terminos) return []
  return productos
    .filter((p) => p.activo && coincide(p.palabras, terminos))
    .sort(compararPorNombre)
    .slice(0, MAX_RESULTADOS)
}
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run src/catalogo`
Expected: `Test Files  2 passed (2)` y `Tests  11 passed (11)`.

- [ ] **Step 5: Commit (sólo con OK de Felipe)**

```bash
git add src/catalogo
git commit -m "feat(catalogo): búsqueda por inicio de palabra, sin tildes, máximo 8" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 7: Caché Dexie del catálogo con catalogo_version

**Files:**
- Create: `supabase/migrations/20261019120300_catalogo_version.sql`
- Create: `src/lib/supabase.ts`, `src/catalogo/fuente.ts`, `src/catalogo/cache.ts`, `src/catalogo/programar.ts`
- Test: `supabase/tests/database/030_catalogo_version.test.sql`, `src/catalogo/cache.test.ts`, `src/catalogo/programar.test.ts`, `tests/integracion/catalogo.test.ts`

Reglas: la caché sólo sirve para cargar rápido (decisión 5). Guarda también los inactivos, porque un código inactivo escaneado se ofrece reactivar (spec sección 4); la búsqueda por nombre los oculta. Se separa por `negocio_id` y se borra al cerrar sesión (spec sección 10). `catalogo_version` la sube un trigger sobre `productos` y `negocios` (spec sección 3); la app la compara al arrancar, al volver a la pestaña y cada 3 minutos, y recarga sólo si cambió. La API corta en 1000 filas (V13): la lectura pagina con `.range(desde, hasta)`, inclusivo en los dos extremos (verificado en https://supabase.com/docs/reference/javascript/range). `*palabras` es índice multiEntry y `distinct()` saca duplicados de índices de varios valores (verificado en https://dexie.org/docs/Version/Version.stores() y https://dexie.org/docs/Collection/Collection.distinct()).

- [ ] **Step 1: Escribir la prueba pgTAP del trigger**

`supabase/tests/database/030_catalogo_version.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');

create temporary view version_a as
  select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000';

select is((select * from version_a), 0::bigint, 'un negocio nuevo arranca en 0');

insert into public.productos (id, negocio_id, nombre, precio)
values ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Chicle', 200);
select is((select * from version_a), 1::bigint, 'un alta sube la versión');

update public.productos set precio = 250 where id = 'a2000000-0000-0000-0000-000000000001';
select is((select * from version_a), 2::bigint, 'un cambio de precio sube la versión');

update public.productos set activo = false where id = 'a2000000-0000-0000-0000-000000000001';
select is((select * from version_a), 3::bigint, 'desactivar sube la versión');

update public.negocios set nombre = 'Kiosco A nuevo' where id = 'a0000000-0000-0000-0000-000000000000';
select is((select * from version_a), 4::bigint, 'un cambio en negocios sube la versión');

update public.negocios set nombre = nombre where id = 'a0000000-0000-0000-0000-000000000000';
select is((select * from version_a), 4::bigint, 'un update sin cambios no sube la versión');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx supabase test db`
Expected: FAIL en `030_catalogo_version.test.sql`: `have: 0` `want: 1` en la prueba 2.

- [ ] **Step 3: Escribir el trigger**

`supabase/migrations/20261019120300_catalogo_version.sql`:
```sql
-- Cada cambio de catálogo sube negocios.catalogo_version (spec sección 3), también desde Studio.
-- Sin security definer: productos sólo se escribe desde funciones definer (dueño postgres) o desde Studio.
create or replace function public.subir_catalogo_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.negocios set catalogo_version = catalogo_version + 1
  where id = coalesce(new.negocio_id, old.negocio_id);
  return null;
end;
$$;

create trigger productos_catalogo_version
  after insert or update or delete on public.productos
  for each row execute function public.subir_catalogo_version();

-- En negocios: sube si cambió algo que no sea la versión (si ya la subió el trigger de productos, no suma otra).
create or replace function public.subir_version_por_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.catalogo_version = old.catalogo_version
     and (to_jsonb(new) - 'catalogo_version') is distinct from (to_jsonb(old) - 'catalogo_version') then
    new.catalogo_version := old.catalogo_version + 1;
  end if;
  return new;
end;
$$;

create trigger negocios_catalogo_version
  before update on public.negocios
  for each row execute function public.subir_version_por_negocio();

revoke all on function public.subir_catalogo_version(), public.subir_version_por_negocio()
  from public, anon, authenticated;
```

- [ ] **Step 4: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Finished supabase db reset`; después `All tests successful.` y `Result: PASS`.

- [ ] **Step 5: Escribir las pruebas de la caché y de la programación**

`src/catalogo/cache.test.ts`:
```ts
// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Producto } from '../tipos'
import { borrarCache, buscarEnCache, buscarPorCodigoEnCache, CacheCatalogo, sincronizarCatalogo } from './cache'
import type { FuenteCatalogo } from './fuente'

const coca: Producto = { id: 'p1', nombre: 'Coca Cola 500', precio: 1500, codigo_barras: 'ABC-7790', activo: true, creado_en_caja: false }
const pan: Producto = { id: 'p2', nombre: 'Pan casero', precio: 800, codigo_barras: null, activo: true, creado_en_caja: false }
const viejo: Producto = { id: 'p3', nombre: 'Coca vieja', precio: 100, codigo_barras: '111', activo: false, creado_en_caja: false }

function fuenteFalsa(negocioId: string, version: number, productos: Producto[]) {
  const estado = { negocioId, version, productos }
  const fuente: FuenteCatalogo = {
    leerVersion: vi.fn(async () => ({ negocioId: estado.negocioId, version: estado.version })),
    leerProductos: vi.fn(async () => estado.productos),
  }
  return { estado, fuente }
}

const nuevaCache = () => new CacheCatalogo(`prueba-${crypto.randomUUID()}`)

describe('sincronizarCatalogo', () => {
  it('la primera vez carga el catálogo', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 4, [coca, pan])
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 4 })
    expect((await buscarEnCache(db, 'coca')).map((p) => p.id)).toEqual(['p1'])
  })

  it('con la misma versión no vuelve a bajar productos', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 4, [coca])
    await sincronizarCatalogo(db, fuente)
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: false, version: 4 })
    expect(fuente.leerProductos).toHaveBeenCalledTimes(1)
  })

  it('si catalogo_version cambió, recarga la caché entera', async () => {
    const db = nuevaCache()
    const { estado, fuente } = fuenteFalsa('n1', 4, [coca, pan])
    await sincronizarCatalogo(db, fuente)
    estado.version = 5
    estado.productos = [{ ...coca, precio: 1700 }]
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 5 })
    expect((await buscarPorCodigoEnCache(db, 'ABC-7790'))?.precio).toBe(1700)
    expect(await buscarEnCache(db, 'pan')).toEqual([])
  })

  it('si cambió el negocio, no mezcla catálogos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 4, [coca]).fuente)
    await sincronizarCatalogo(db, fuenteFalsa('n2', 4, [pan]).fuente)
    expect(await buscarEnCache(db, 'coca')).toEqual([])
    expect((await buscarEnCache(db, 'pan')).map((p) => p.id)).toEqual(['p2'])
  })
})

describe('búsquedas en caché', () => {
  it('busca por inicio de palabra con el índice multiEntry y oculta inactivos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 1, [coca, pan, viejo]).fuente)
    expect((await buscarEnCache(db, 'cola 5')).map((p) => p.id)).toEqual(['p1'])
    expect((await buscarEnCache(db, 'coca')).map((p) => p.id)).toEqual(['p1'])
    expect(await buscarEnCache(db, 'c')).toEqual([])
  })

  it('busca por código exacto, con letras, incluidos los inactivos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 1, [coca, viejo]).fuente)
    expect((await buscarPorCodigoEnCache(db, 'ABC-7790'))?.nombre).toBe('Coca Cola 500')
    expect((await buscarPorCodigoEnCache(db, '111'))?.activo).toBe(false)
    expect(await buscarPorCodigoEnCache(db, 'abc-7790')).toBeUndefined()
  })

  it('borrarCache deja todo vacío y obliga a recargar', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    await sincronizarCatalogo(db, fuente)
    await borrarCache(db)
    expect(await buscarEnCache(db, 'coca')).toEqual([])
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 1 })
  })
})
```

`src/catalogo/programar.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_CATALOGO_MS, programarSincronizacion } from './programar'

describe('programarSincronizacion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('revisa al arrancar, cada 3 minutos y al volver a la pestaña', () => {
    const sincronizar = vi.fn(async () => undefined)
    const cancelar = programarSincronizacion(sincronizar)
    expect(INTERVALO_CATALOGO_MS).toBe(180_000)
    expect(sincronizar).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(INTERVALO_CATALOGO_MS)
    expect(sincronizar).toHaveBeenCalledTimes(2)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sincronizar).toHaveBeenCalledTimes(3)
    cancelar()
    vi.advanceTimersByTime(INTERVALO_CATALOGO_MS * 2)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sincronizar).toHaveBeenCalledTimes(3)
  })

  it('un error de red no corta las revisiones siguientes', async () => {
    const sincronizar = vi.fn(async () => {
      throw new Error('sin red')
    })
    programarSincronizacion(sincronizar)
    await vi.advanceTimersByTimeAsync(INTERVALO_CATALOGO_MS)
    expect(sincronizar).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 6: Correrlas y ver que fallan**

Run: `npx vitest run src/catalogo/cache.test.ts src/catalogo/programar.test.ts`
Expected: FAIL: `Failed to resolve import "./cache"` y `"./programar"`.

- [ ] **Step 7: Implementar el cliente, la fuente, la caché y la programación**

`src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (ver .env.example)')

/** Cliente único de la app. Sólo la anon key: la service role nunca llega al navegador. */
export const supabase = createClient(url, anonKey)
```

`src/catalogo/fuente.ts`:
```ts
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
```

`src/catalogo/cache.ts`:
```ts
import { Dexie, type EntityTable } from 'dexie'
import type { Producto, ProductoCache } from '../tipos'
import { buscarPorNombre, terminosDeBusqueda } from './buscar'
import type { FuenteCatalogo } from './fuente'
import { palabras } from './normalizar'

interface Meta {
  clave: 'negocio_id' | 'catalogo_version'
  valor: string | number
}

/** Caché del catálogo de un negocio. Sólo para cargar rápido: nunca es fuente de verdad (decisión 5). */
export class CacheCatalogo extends Dexie {
  productos!: EntityTable<ProductoCache, 'id'>
  meta!: EntityTable<Meta, 'clave'>

  constructor(nombre = 'catalogo') {
    super(nombre)
    // Un cambio de esquema es version(2) con su upgrader; nunca editar esta versión publicada.
    this.version(1).stores({
      productos: 'id, codigo_barras, *palabras',
      meta: 'clave',
    })
  }
}

let cacheApp: CacheCatalogo | null = null

/** Instancia de la app (perezosa: no abre IndexedDB hasta usarla). */
export function cacheDeLaApp(): CacheCatalogo {
  cacheApp ??= new CacheCatalogo()
  return cacheApp
}

const aCache = (p: Producto): ProductoCache => ({ ...p, palabras: palabras(p.nombre) })

export async function sincronizarCatalogo(
  db: CacheCatalogo,
  fuente: FuenteCatalogo,
): Promise<{ actualizado: boolean; version: number }> {
  // La versión se lee antes que los productos: si cambia en el medio, la revisión siguiente recarga.
  const { negocioId, version } = await fuente.leerVersion()
  const [negocio, guardada] = await Promise.all([db.meta.get('negocio_id'), db.meta.get('catalogo_version')])
  if (negocio?.valor === negocioId && guardada?.valor === version) return { actualizado: false, version }

  const productos = await fuente.leerProductos()
  await db.transaction('rw', db.productos, db.meta, async () => {
    await db.productos.clear()
    await db.productos.bulkPut(productos.map(aCache))
    await db.meta.bulkPut([
      { clave: 'negocio_id', valor: negocioId },
      { clave: 'catalogo_version', valor: version },
    ])
  })
  return { actualizado: true, version }
}

export async function buscarEnCache(db: CacheCatalogo, consulta: string): Promise<ProductoCache[]> {
  const terminos = terminosDeBusqueda(consulta)
  if (!terminos) return []
  const candidatos = await db.productos.where('palabras').startsWith(terminos[0]).distinct().toArray()
  return buscarPorNombre(candidatos, consulta)
}

/** Código exacto (con letras o sin ellas), activo o no: un inactivo se ofrece reactivar. */
export async function buscarPorCodigoEnCache(db: CacheCatalogo, codigo: string): Promise<ProductoCache | undefined> {
  return db.productos.where('codigo_barras').equals(codigo).first()
}

/** Al cerrar sesión (la PC puede ser compartida, spec sección 10). La usa la tarea 17. */
export async function borrarCache(db: CacheCatalogo = cacheDeLaApp()): Promise<void> {
  await db.transaction('rw', db.productos, db.meta, async () => {
    await db.productos.clear()
    await db.meta.clear()
  })
}
```

`src/catalogo/programar.ts`:
```ts
export const INTERVALO_CATALOGO_MS = 180_000

/** Revisa catalogo_version al arrancar, cada 3 minutos y al volver a la pestaña. Devuelve cómo cancelar. */
export function programarSincronizacion(sincronizar: () => Promise<unknown>): () => void {
  const correr = () => {
    sincronizar().catch(() => undefined) // sin red: la próxima revisión reintenta
  }
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible') correr()
  }
  correr()
  const intervalo = setInterval(correr, INTERVALO_CATALOGO_MS)
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  return () => {
    clearInterval(intervalo)
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }
}
```

- [ ] **Step 8: Correr las pruebas unitarias**

Run:
```bash
npx vitest run src/catalogo
npx tsc --noEmit
```
Expected: `Test Files  4 passed (4)` y `Tests  20 passed (20)`; `tsc` sin salida. Si `cache.test.ts` falla al abrir la base (`indexedDB is not defined` o `structuredClone is not defined`), ver V17.

- [ ] **Step 9: Escribir la prueba de integración con más de 1000 productos**

`tests/integracion/catalogo.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { crearFuenteSupabase, PAGINA_CATALOGO } from '../../src/catalogo/fuente'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

describe('lectura paginada del catálogo', () => {
  it('trae los 1500 productos de su kiosco y ninguno de otro', async () => {
    const a = await crearKioscoDePrueba('Kiosco catálogo A')
    const b = await crearKioscoDePrueba('Kiosco catálogo B')
    const filas = Array.from({ length: 1500 }, (_, i) => ({
      negocio_id: a.negocioId,
      nombre: `Producto ${String(i + 1).padStart(4, '0')}`,
      precio: 100 + i,
    }))
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await clienteAdmin().from('productos').insert(filas.slice(i, i + 500))
      if (error) throw error
    }
    const otro = await clienteAdmin().from('productos').insert({ negocio_id: b.negocioId, nombre: 'De B', precio: 1 })
    if (otro.error) throw otro.error

    const productos = await crearFuenteSupabase(a.caja.cliente).leerProductos()
    expect(productos.length).toBeGreaterThan(PAGINA_CATALOGO)
    expect(productos).toHaveLength(1500)
    expect(new Set(productos.map((p) => p.id)).size).toBe(1500)
    expect(productos.some((p) => p.nombre === 'De B')).toBe(false)
  })

  it('catalogo_version sube con cada cambio y la caja la lee', async () => {
    const k = await crearKioscoDePrueba('Kiosco versión')
    const fuente = crearFuenteSupabase(k.caja.cliente)
    expect(await fuente.leerVersion()).toEqual({ negocioId: k.negocioId, version: 0 })
    const alta = await clienteAdmin().from('productos').insert({ negocio_id: k.negocioId, nombre: 'Chicle', precio: 200 })
    if (alta.error) throw alta.error
    expect((await fuente.leerVersion()).version).toBe(1)
  })
})
```

- [ ] **Step 10: Correrla**

Run: `npm run test:integracion`
Expected: `Test Files  2 passed (2)` y `Tests  7 passed (7)` (5 de `token.test.ts` y 2 de esta). Si trae 1000 en vez de 1500, la paginación no avanza (V13).

- [ ] **Step 11: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests src/lib/supabase.ts src/catalogo tests/integracion/catalogo.test.ts
git commit -m "feat(catalogo): caché dexie con catalogo_version y carga paginada" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 8: Dispositivos y turnos

**Files:**
- Create: `supabase/migrations/20261019120500_registrar_dispositivo.sql`, `supabase/migrations/20261019120600_turnos.sql`
- Create: `src/dispositivo/dispositivo.ts`, `src/turno/turno.ts`, `src/turno/PantallaTurno.tsx`
- Test: `supabase/tests/database/040_registrar_dispositivo.test.sql`, `supabase/tests/database/050_turnos.test.sql`, `src/dispositivo/dispositivo.test.ts`, `src/turno/PantallaTurno.test.tsx`

Reglas: la PC se da de alta sola en su primer login y la base le asigna el prefijo siguiente, sin tope (decisión 34). **Prefijo después de Z** (pendiente del spec, sección 14), decidido acá: A…Z, AA…AZ, BA…ZZ, AAA…ZZZ, como las columnas de una planilla. La PC 27 recibe `AA`; el límite es 18.278 PCs por kiosco. Un turno por PC (decisión 38); abrir con otro abierto cierra el anterior con la hora de la nueva apertura (SUPUESTO NUEVO). Apertura sin monto; cierre con total por medio de pago (decisión 26). Apertura y cierre, también el automático, van al historial (decisión 27).

- [ ] **Step 1: Escribir la prueba de registrar_dispositivo**

`supabase/tests/database/040_registrar_dispositivo.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- 1 a 5: prefijos como columnas de planilla
select is(public.prefijo_dispositivo(1), 'A', 'la PC 1 es A');
select is(public.prefijo_dispositivo(26), 'Z', 'la PC 26 es Z');
select is(public.prefijo_dispositivo(27), 'AA', 'la PC 27 es AA');
select is(public.prefijo_dispositivo(53), 'BA', 'la PC 53 es BA');
select is(public.prefijo_dispositivo(703), 'AAA', 'la PC 703 es AAA');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'disp-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'disp-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'disp-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') ->> 'prefijo', 'A',
  'la primera PC del kiosco recibe A');
select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') ->> 'nuevo', 'false',
  'la misma PC (otra pestaña) no se registra dos veces');
select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000002') ->> 'prefijo', 'B',
  'la segunda PC recibe B');

-- PCs 3 a 26 cargadas directo, para llegar a la 27
reset role;
insert into public.dispositivos (id, negocio_id, prefijo, creado_por)
select gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', public.prefijo_dispositivo(i),
       'c0000000-0000-0000-0000-00000000000a'
from generate_series(3, 26) i;
set local role authenticated;

select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000027') ->> 'prefijo', 'AA',
  'la PC 27 no falla: recibe AA');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_ajeno', 'otro kiosco no se apropia de una PC ajena');
select is(public.registrar_dispositivo('b1000000-0000-0000-0000-000000000001') ->> 'prefijo', 'A',
  'los prefijos se numeran por kiosco');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000099') $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se registran PCs');

reset role;
select is((select creado_por from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000002'),
  'c0000000-0000-0000-0000-00000000000a'::uuid, 'el alta guarda la cuenta que la hizo');

select * from finish();
rollback;
```

- [ ] **Step 2: Escribir la prueba de turnos**

`supabase/tests/database/050_turnos.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'turno-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'turno-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'turno-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to');

-- 1 a 3: la caja abre
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.abrir_turno('a1000000-0000-0000-0000-000000000001') ->> 'turno_id', null,
  'la caja abre turno sin monto inicial');
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, cierre is null from public.turnos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid, true) $$,
  'la apertura registra cuenta y dispositivo');
select results_eq(
  $$ select tipo::text, cuenta_id, dispositivo_id from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' $$,
  $$ values ('apertura_turno'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'la apertura queda en el historial');

-- 4 a 7: el jefe abre en la misma PC; el turno de la caja se cierra solo
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.abrir_turno('a1000000-0000-0000-0000-000000000001') ->> 'turno_cerrado_id',
  (select id::text from public.turnos where cuenta_id = 'c0000000-0000-0000-0000-00000000000a'),
  'abrir con otro abierto cierra el anterior');
reset role;
select is((select count(*)::int from public.turnos
           where dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and cierre is null),
  1, 'queda un solo turno abierto en la PC');
select ok(
  (select a.cierre = b.apertura from public.turnos a, public.turnos b
   where a.cuenta_id = 'c0000000-0000-0000-0000-00000000000a' and b.cuenta_id = 'c0000000-0000-0000-0000-00000000001a'),
  'el anterior se cierra con la hora de la nueva apertura');
select results_eq(
  $$ select valor_nuevo ->> 'automatico' from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cierre_turno' $$,
  $$ values ('true'::text) $$,
  'el cierre automático queda en el historial');

-- Ventas del turno del jefe: efectivo 900 + tarjeta 500; transferencia 700 + fiado 300; efectivo 200 anulada.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
select v.id, 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-00000000001a', t.id, v.numero, v.total, repeat(v.letra, 64)
from public.turnos t,
     (values ('a4000000-0000-0000-0000-000000000001'::uuid, 1, 1400, 'a'),
             ('a4000000-0000-0000-0000-000000000002'::uuid, 2, 1000, 'b'),
             ('a4000000-0000-0000-0000-000000000003'::uuid, 3, 200, 'c')) v(id, numero, total, letra)
where t.dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and t.cierre is null;
insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'efectivo', 900, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'tarjeta', 500, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'transferencia', 700, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'fiado', 300, 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'efectivo', 200, null);
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-00000000001a', 'a1000000-0000-0000-0000-000000000001', 'Se cobró mal');

-- 8 a 10: cierre con total por medio de pago
set local role authenticated;
select is(public.cerrar_turno('a1000000-0000-0000-0000-000000000001') -> 'totales',
  '{"efectivo": 900, "transferencia": 700, "tarjeta": 500, "fiado": 300, "cobrado": 2100}'::jsonb,
  'total por medio del turno; la anulación resta; el fiado no suma a lo cobrado');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'sin_turno', 'sin turno abierto no hay nada que cerrar');
reset role;
select results_eq(
  $$ select valor_nuevo ->> 'automatico' from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cierre_turno'
     order by valor_nuevo ->> 'automatico' $$,
  $$ values ('false'::text), ('true'::text) $$,
  'el cierre manual también queda en el historial');

-- 11 y 12: sin cuenta y PC desconocida
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se abre turno');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000099') $$,
  'P0001', 'dispositivo_desconocido', 'una PC no registrada no abre turno');

select * from finish();
rollback;
```

Nota: dentro de una transacción `now()` no cambia, así que la prueba 6 confirma que el cierre automático usa la hora de la misma llamada. La concurrencia real (dos pestañas abriendo a la vez) la serializa el `for update` sobre la fila de la PC.

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `040` con `function public.prefijo_dispositivo(integer) does not exist` y en `050` con `function public.abrir_turno(unknown) does not exist`.

- [ ] **Step 4: Escribir registrar_dispositivo**

`supabase/migrations/20261019120500_registrar_dispositivo.sql`:
```sql
-- Prefijo después de Z (spec sección 14), decidido en la parte 2: A..Z, AA..ZZ, AAA..ZZZ.
alter table public.dispositivos drop constraint dispositivos_prefijo_check;
alter table public.dispositivos add constraint dispositivos_prefijo_check check (prefijo ~ '^[A-Z]{1,3}$');

-- Orden 1 = A, 26 = Z, 27 = AA, 703 = AAA (numeración biyectiva en base 26).
create or replace function public.prefijo_dispositivo(p_orden integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_resto integer := p_orden;
  v_prefijo text := '';
begin
  if p_orden is null or p_orden < 1 or p_orden > 18278 then
    raise exception 'prefijo_fuera_de_rango' using errcode = 'P0001';
  end if;
  while v_resto > 0 loop
    v_prefijo := chr(65 + (v_resto - 1) % 26) || v_prefijo;
    v_resto := (v_resto - 1) / 26;
  end loop;
  return v_prefijo;
end;
$$;

-- Alta automática de la PC (decisión 34). El id lo genera el navegador (localStorage).
create or replace function public.registrar_dispositivo(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_dispositivo public.dispositivos%rowtype;
  v_cantidad integer;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_dispositivo_id is null then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- Serializa altas simultáneas del mismo kiosco: dos PCs nunca reciben el mismo prefijo.
  perform 1 from public.negocios n where n.id = v_negocio for update;

  select * into v_dispositivo from public.dispositivos d where d.id = p_dispositivo_id;
  if found then
    if v_dispositivo.negocio_id <> v_negocio then
      raise exception 'dispositivo_ajeno' using errcode = 'P0001';
    end if;
    return jsonb_build_object('dispositivo_id', v_dispositivo.id, 'prefijo', v_dispositivo.prefijo, 'nuevo', false);
  end if;

  select count(*) into v_cantidad from public.dispositivos d where d.negocio_id = v_negocio;

  insert into public.dispositivos (id, negocio_id, prefijo, creado_por)
  values (p_dispositivo_id, v_negocio, public.prefijo_dispositivo(v_cantidad + 1), auth.uid())
  returning * into v_dispositivo;

  return jsonb_build_object('dispositivo_id', v_dispositivo.id, 'prefijo', v_dispositivo.prefijo, 'nuevo', true);
end;
$$;

revoke all on function public.prefijo_dispositivo(integer) from public, anon, authenticated;
revoke all on function public.registrar_dispositivo(uuid) from public, anon, authenticated;
grant execute on function public.registrar_dispositivo(uuid) to authenticated;
```

- [ ] **Step 5: Escribir abrir_turno y cerrar_turno**

`supabase/migrations/20261019120600_turnos.sql`:
```sql
-- Turno por PC (decisión 38), sin monto inicial (decisión 26). Caja y jefe abren y cierran.
create or replace function public.abrir_turno(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_anterior public.turnos%rowtype;
  v_nuevo public.turnos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- Bloquear la PC: dos pestañas que abren a la vez no chocan con el índice de un turno abierto.
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- SUPUESTO NUEVO: el turno abierto de esta PC se cierra solo con la hora de esta apertura.
  update public.turnos t set cierre = now(), cierre_cuenta_id = auth.uid()
  where t.dispositivo_id = p_dispositivo_id and t.cierre is null
  returning * into v_anterior;
  if v_anterior.id is not null then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
    values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_anterior.id,
            jsonb_build_object('automatico', true));
  end if;

  insert into public.turnos (negocio_id, dispositivo_id, cuenta_id)
  values (v_negocio, p_dispositivo_id, auth.uid())
  returning * into v_nuevo;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id)
  values (v_negocio, 'apertura_turno', auth.uid(), p_dispositivo_id, 'turnos', v_nuevo.id);

  return jsonb_build_object('turno_id', v_nuevo.id, 'apertura', v_nuevo.apertura, 'turno_cerrado_id', v_anterior.id);
end;
$$;

-- Cierre simple: marca el fin y devuelve el total por medio de pago del turno. Sin arqueo.
-- Las anulaciones hechas desde esta PC durante el turno restan (misma regla que la caja del día:
-- la anulación resta cuando se hace, no cuando se vendió).
create or replace function public.cerrar_turno(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_turno public.turnos%rowtype;
  v_totales jsonb;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  update public.turnos t set cierre = now(), cierre_cuenta_id = auth.uid()
  where t.dispositivo_id = p_dispositivo_id and t.cierre is null
  returning * into v_turno;
  if v_turno.id is null then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  with movimientos as (
    select pv.medio, pv.importe
    from public.ventas v
    join public.pagos_venta pv on pv.venta_id = v.id
    where v.turno_id = v_turno.id
    union all
    select pv.medio, -pv.importe
    from public.anulaciones a
    join public.pagos_venta pv on pv.venta_id = a.venta_id
    where a.dispositivo_id = v_turno.dispositivo_id
      and a.fecha >= v_turno.apertura and a.fecha <= v_turno.cierre
  )
  select jsonb_build_object(
    'efectivo', coalesce(sum(importe) filter (where medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(importe) filter (where medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(importe) filter (where medio = 'tarjeta'), 0),
    'fiado', coalesce(sum(importe) filter (where medio = 'fiado'), 0),
    'cobrado', coalesce(sum(importe) filter (where medio <> 'fiado'), 0)
  )
  into v_totales
  from movimientos;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
  values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_turno.id,
          jsonb_build_object('automatico', false));

  return jsonb_build_object('turno_id', v_turno.id, 'apertura', v_turno.apertura, 'cierre', v_turno.cierre,
                            'totales', v_totales);
end;
$$;

revoke all on function public.abrir_turno(uuid), public.cerrar_turno(uuid) from public, anon, authenticated;
grant execute on function public.abrir_turno(uuid), public.cerrar_turno(uuid) to authenticated;
```

- [ ] **Step 6: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `All tests successful.` y `Result: PASS`. Si la migración falla con `constraint "dispositivos_prefijo_check" of relation "dispositivos" does not exist`, ver V16.

- [ ] **Step 7: Escribir las pruebas del id de la PC y de la pantalla de turno**

`src/dispositivo/dispositivo.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerDispositivoId } from './dispositivo'

describe('obtenerDispositivoId', () => {
  beforeEach(() => localStorage.clear())

  it('genera el id una vez y después lo reusa (las pestañas lo comparten)', () => {
    const nuevoId = vi.fn(() => 'pc-1')
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(nuevoId).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dispositivo-id:negocio-1')).toBe('pc-1')
  })

  it('cada kiosco tiene su propio id en el mismo navegador', () => {
    let n = 0
    const nuevoId = () => `pc-${++n}`
    expect(obtenerDispositivoId('negocio-1', localStorage, nuevoId)).toBe('pc-1')
    expect(obtenerDispositivoId('negocio-2', localStorage, nuevoId)).toBe('pc-2')
    expect(localStorage.length).toBe(2)
  })
})
```

`src/turno/PantallaTurno.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PedirApertura, ResumenCierre } from './PantallaTurno'

describe('PedirApertura', () => {
  it('no pide monto inicial', () => {
    render(<PedirApertura alAbrir={vi.fn(async () => undefined)} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('doble clic abre una sola vez', async () => {
    const alAbrir = vi.fn(() => new Promise<void>(() => undefined))
    render(<PedirApertura alAbrir={alAbrir} />)
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(alAbrir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Abriendo…' })).toBeDisabled()
  })

  it('si falla avisa y deja reintentar', async () => {
    const alAbrir = vi.fn(async () => {
      throw new Error('sin red')
    })
    render(<PedirApertura alAbrir={alAbrir} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir el turno')
    expect(screen.getByRole('button', { name: 'Abrir turno' })).toBeEnabled()
  })
})

describe('ResumenCierre', () => {
  it('muestra el total por medio de pago y el fiado aparte', () => {
    render(
      <ResumenCierre
        cierre={{
          turnoId: 't1',
          apertura: '2026-10-19T11:00:00Z',
          cierre: '2026-10-19T20:00:00Z',
          totales: { efectivo: 900, transferencia: 700, tarjeta: 500, fiado: 300, cobrado: 2100 },
        }}
        alSeguir={vi.fn()}
      />,
    )
    expect(within(screen.getByRole('row', { name: /^Efectivo/ })).getByText('$900')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Transferencia/ })).getByText('$700')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Tarjeta/ })).getByText('$500')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Total cobrado/ })).getByText('$2.100')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /^Fiado/ })).getByText('$300')).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Correrlas y ver que fallan**

Run: `npx vitest run src/dispositivo src/turno`
Expected: FAIL: `Failed to resolve import "./dispositivo"` y `"./PantallaTurno"`.

- [ ] **Step 9: Implementar**

`src/dispositivo/dispositivo.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Dispositivo {
  dispositivoId: string
  prefijo: string
}

/** Id de esta PC para este kiosco. Lo comparten todas las pestañas del navegador. */
export function obtenerDispositivoId(
  negocioId: string,
  storage: Storage = localStorage,
  nuevoId: () => string = () => crypto.randomUUID(),
): string {
  const clave = `dispositivo-id:${negocioId}`
  const guardado = storage.getItem(clave)
  if (guardado) return guardado
  const id = nuevoId()
  storage.setItem(clave, id)
  return id
}

/** Alta automática en el primer login (decisión 34); después devuelve el prefijo ya asignado. */
export async function registrarDispositivo(supabase: SupabaseClient, negocioId: string): Promise<Dispositivo> {
  const { data, error } = await supabase.rpc('registrar_dispositivo', {
    p_dispositivo_id: obtenerDispositivoId(negocioId),
  })
  if (error) throw error
  const r = data as { dispositivo_id: string; prefijo: string }
  return { dispositivoId: r.dispositivo_id, prefijo: r.prefijo }
}
```

`src/turno/turno.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TotalesTurno {
  efectivo: number
  transferencia: number
  tarjeta: number
  fiado: number
  /** Efectivo + transferencia + tarjeta. El fiado no es plata cobrada. */
  cobrado: number
}

export interface TurnoAbierto {
  turnoId: string
  apertura: string
}

export interface CierreTurno {
  turnoId: string
  apertura: string
  cierre: string
  totales: TotalesTurno
}

export async function leerTurnoAbierto(supabase: SupabaseClient, dispositivoId: string): Promise<TurnoAbierto | null> {
  const { data, error } = await supabase
    .from('turnos')
    .select('id, apertura')
    .eq('dispositivo_id', dispositivoId)
    .is('cierre', null)
    .maybeSingle()
  if (error) throw error
  return data ? { turnoId: data.id as string, apertura: data.apertura as string } : null
}

export async function abrirTurno(supabase: SupabaseClient, dispositivoId: string): Promise<TurnoAbierto> {
  const { data, error } = await supabase.rpc('abrir_turno', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  const r = data as { turno_id: string; apertura: string }
  return { turnoId: r.turno_id, apertura: r.apertura }
}

export async function cerrarTurno(supabase: SupabaseClient, dispositivoId: string): Promise<CierreTurno> {
  const { data, error } = await supabase.rpc('cerrar_turno', { p_dispositivo_id: dispositivoId })
  if (error) throw error
  const r = data as { turno_id: string; apertura: string; cierre: string; totales: TotalesTurno }
  return { turnoId: r.turno_id, apertura: r.apertura, cierre: r.cierre, totales: r.totales }
}
```

`src/turno/PantallaTurno.tsx`:
```tsx
import { useRef, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import type { CierreTurno } from './turno'

/** Sin turno abierto la caja no vende (SUPUESTO NUEVO): esta pantalla lo pide. Sin monto inicial. */
export function PedirApertura({ alAbrir }: { alAbrir: () => Promise<void> }) {
  const enCurso = useRef(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function abrir() {
    if (enCurso.current) return
    enCurso.current = true
    setAbriendo(true)
    setError(null)
    try {
      await alAbrir()
    } catch {
      setError('No se pudo abrir el turno. Revisá la conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setAbriendo(false)
    }
  }

  return (
    <section className="turno">
      <h2>No hay turno abierto en esta PC</h2>
      <p>Para vender, abrí el turno. No hace falta contar el efectivo.</p>
      <button type="button" onClick={() => void abrir()} disabled={abriendo}>
        {abriendo ? 'Abriendo…' : 'Abrir turno'}
      </button>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </section>
  )
}

/** Cierre simple (decisión 26): total por medio de pago del turno, sin arqueo. */
export function ResumenCierre({ cierre, alSeguir }: { cierre: CierreTurno; alSeguir: () => void }) {
  const t = cierre.totales
  const filas: [string, number][] = [
    ['Efectivo', t.efectivo],
    ['Transferencia', t.transferencia],
    ['Tarjeta', t.tarjeta],
    ['Total cobrado', t.cobrado],
    ['Fiado (no cobrado)', t.fiado],
  ]
  return (
    <section className="turno">
      <h2>Turno cerrado</h2>
      <table>
        <tbody>
          {filas.map(([nombre, importe]) => (
            <tr key={nombre}>
              <th scope="row">{nombre}</th>
              <td>{formatearPesos(importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={alSeguir}>
        Listo
      </button>
    </section>
  )
}
```

- [ ] **Step 10: Correr las pruebas y los tipos**

Run:
```bash
npx vitest run src/dispositivo src/turno
npx tsc --noEmit
```
Expected: `Test Files  2 passed (2)` y `Tests  6 passed (6)`; `tsc` sin salida.

- [ ] **Step 11: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests src/dispositivo src/turno
git commit -m "feat(turnos): alta automática de PCs y turno por PC con cierre por medio" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 9: Módulo fiado y alta de clientes

**Files:**
- Create: `supabase/migrations/20261019120800_modulos.sql`, `supabase/migrations/20261019120900_clientes.sql`
- Test: `supabase/tests/database/060_modulos.test.sql`, `supabase/tests/database/070_clientes.test.sql`

Reglas: sin fila en `modulos_negocio` vale `modulos.activo_por_defecto`; fiado activo por defecto (decisiones 16 y 28). La base chequea el módulo; ocultarlo en pantalla no es seguridad (spec 5b). Alta de cliente sólo con fiado activo, por caja o jefe, con nombre o alias y teléfono opcional (Ley 25.326: sólo lo mínimo). `cambiar_modulo_fiado` y `anonimizar_cliente` van en la tarea 16. `modulo_activo` es `security invoker`: la app la llama para saber si mostrar el fiado y RLS le deja leer sólo su negocio; dentro de las funciones definer corre como su dueño, filtrada por `negocio_actual()`.

- [ ] **Step 1: Escribir la prueba de modulo_activo**

`supabase/tests/database/060_modulos.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B'),
  ('d0000000-0000-0000-0000-000000000000', 'Kiosco C');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select ok(public.modulo_activo('fiado'), 'sin fila en modulos_negocio vale el defecto: fiado activo');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('b0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select ok(public.modulo_activo('fiado'), 'la fila de otro negocio no afecta');

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select ok(not public.modulo_activo('fiado'), 'la fila del negocio manda');

reset role;
update public.modulos set activo_por_defecto = false where clave = 'fiado';
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', true);
set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"d0000000-0000-0000-0000-000000000000"}', true);
select ok(not public.modulo_activo('fiado'), 'sin fila sigue al defecto, aunque cambie');

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select ok(public.modulo_activo('fiado'), 'una fila activa gana a un defecto apagado');
select ok(not public.modulo_activo('no_existe'), 'un módulo desconocido vale apagado');

reset role;
select ok(not has_function_privilege('anon', 'public.modulo_activo(text)', 'execute'), 'anon no lo ejecuta');
select ok((select not prosecdef from pg_proc where oid = 'public.modulo_activo(text)'::regprocedure),
  'security invoker: con RLS del que llama');

select * from finish();
rollback;
```

- [ ] **Step 2: Escribir la prueba de alta_cliente**

`supabase/tests/database/070_clientes.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'cli-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'cli-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'cli-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.alta_cliente('  Juan del 5to  ', '11 5555-1234') ->> 'nombre', 'Juan del 5to',
  'la caja da de alta un cliente; el nombre se recorta');
select is(public.alta_cliente('Marta', '') ->> 'telefono', null, 'teléfono vacío queda vacío');
select throws_ok($$ select public.alta_cliente('   ', null) $$, 'P0001', 'nombre_invalido', 'el nombre es obligatorio');
select throws_ok($$ select public.alta_cliente('Pedro', 'llamame') $$, 'P0001', 'telefono_invalido',
  'el teléfono sólo lleva números y signos de teléfono');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.alta_cliente('Rosa', null) ->> 'id', null, 'el jefe también da de alta');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Intruso', null) $$, 'P0001', 'sin_cuenta', 'sin cuenta no da de alta');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Luis', null) $$, 'P0001', 'fiado_deshabilitado',
  'con fiado apagado la base rechaza el alta');

reset role;
select is((select count(*)::int from public.clientes where negocio_id = 'a0000000-0000-0000-0000-000000000000'), 3,
  'quedaron tres clientes, en el negocio del token');

select * from finish();
rollback;
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `060` con `function public.modulo_activo(unknown) does not exist` y en `070` con `function public.alta_cliente(unknown, unknown) does not exist`.

- [ ] **Step 4: Escribir las migraciones**

`supabase/migrations/20261019120800_modulos.sql`:
```sql
-- Módulo activo para el negocio del token. Sin fila en modulos_negocio vale el defecto de modulos.
-- Módulo desconocido = apagado. security invoker: llamada por la app, RLS le deja ver sólo su negocio.
create or replace function public.modulo_activo(p_clave text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select mn.activo from public.modulos_negocio mn
     where mn.negocio_id = public.negocio_actual() and mn.modulo = p_clave),
    (select m.activo_por_defecto from public.modulos m where m.clave = p_clave),
    false
  )
$$;

revoke all on function public.modulo_activo(text) from public, anon, authenticated;
grant execute on function public.modulo_activo(text) to authenticated;
```

`supabase/migrations/20261019120900_clientes.sql`:
```sql
-- Alta rápida de cliente de fiado (decisión 16): sólo con el módulo activo; caja y jefe.
-- Datos personales de terceros (Ley 25.326): nombre o alias y teléfono opcional, nada más.
create or replace function public.alta_cliente(p_nombre text, p_telefono text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_cliente public.clientes%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('fiado') then
    raise exception 'fiado_deshabilitado' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) not between 1 and 60 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if v_telefono is not null and v_telefono !~ '^[0-9 +()-]{6,20}$' then
    raise exception 'telefono_invalido' using errcode = 'P0001';
  end if;

  insert into public.clientes (negocio_id, nombre, telefono)
  values (v_negocio, v_nombre, v_telefono)
  returning * into v_cliente;

  return jsonb_build_object('id', v_cliente.id, 'nombre', v_cliente.nombre, 'telefono', v_cliente.telefono);
end;
$$;

revoke all on function public.alta_cliente(text, text) from public, anon, authenticated;
grant execute on function public.alta_cliente(text, text) to authenticated;
```

- [ ] **Step 5: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `All tests successful.` y `Result: PASS`.

- [ ] **Step 6: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(fiado): módulo con valor por defecto y alta de clientes" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 10: confirmar_venta, carrito e id de venta

**Files:**
- Create: `supabase/migrations/20261019121000_confirmar_venta.sql`
- Create: `src/venta/carrito.ts`, `src/venta/idVenta.ts`, `src/venta/confirmar.ts`
- Test: `supabase/tests/database/080_confirmar_venta.test.sql`, `supabase/tests/database/140_aislamiento.test.sql`, `supabase/tests/database/150_permisos_funciones.test.sql`, `src/venta/carrito.test.ts`, `src/venta/idVenta.test.ts`, `src/venta/confirmar.test.ts`

Orden fijo dentro de `confirmar_venta` (spec secciones 4, 6 y 9):
1. Negocio del token; rol desde `cuentas` con `auth.uid()`. Sin cuenta: `sin_cuenta`.
2. Bloquear la fila de la PC (`for update`) y verificar que es del negocio: `dispositivo_desconocido`.
3. `id` y hash. La base calcula `sha256` sobre el texto `jsonb` del contenido recibido (jsonb ordena las claves). Si la venta existe con el mismo hash, la devuelve sin grabar; con otro hash, o de otro negocio, `venta_id_reusado`.
4. Turno abierto en la PC: `sin_turno`.
5. Productos activos del negocio (`producto_no_disponible`); si un precio visto difiere del actual, no graba nada y devuelve `{"estado": "precios_distintos", "diferencias": [...]}`.
6. Fiado: módulo activo (`fiado_deshabilitado`) y cliente del negocio no suprimido (`fiado_sin_cliente`).
7. Total recalculado desde las líneas (`total_distinto`), pagos igual al total (`no_suma_total`), efectivo entregado suficiente (`efectivo_insuficiente`, `entrega_sin_efectivo`), cantidades e importes enteros mayores que cero (`venta_vacia`, `linea_invalida`, `pago_invalido`, `importe_invalido`).
8. Recién ahí numera (siguiente número de la PC, sin huecos) e inserta venta, líneas con precio congelado y pagos. No escribe en el historial (el spec no lo pide).

Hash: se usa `sha256(bytea)` de `pg_catalog` (verificado en https://www.postgresql.org/docs/current/functions-binarystring.html). Con `search_path = ''` `pg_catalog` se busca igual, así que no hace falta `extensions.digest` de pgcrypto ni depender del esquema donde Supabase la instala. Los pasos 5 y 6 comparan como texto (`p.id::text = e ->> 'producto_id'`) para no castear antes de validar la forma en el paso 7.

`idVenta`: el id se ata al contenido exacto. Si el contenido cambia, el id cambia; si es el mismo del último intento, el reintento usa el mismo id; después de confirmar, `reiniciar()`. Vive sólo en memoria (decisión 31).

- [ ] **Step 1: Escribir la prueba de confirmar_venta**

`supabase/tests/database/080_confirmar_venta.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'venta-caja@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'venta-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, true),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Gaseosa', 1500, true),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'Discontinuado', 500, false);
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

-- 1 a 5: venta normal e idempotencia
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'numero',
  '1', 'la primera venta de la PC es la 1');
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'ya_existia',
  'true', 'mismo id y mismo contenido devuelve la venta grabada');
select is((select count(*)::int from public.ventas), 1, 'el reintento no grabó otra venta');
select results_eq(
  $$ select cantidad, precio_unitario from public.lineas_venta where venta_id = 'a4000000-0000-0000-0000-000000000001' $$,
  $$ values (2, 900) $$, 'la línea congela el precio');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":3,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":2700}]', 2700, null) $$,
  'P0001', 'venta_id_reusado', 'mismo id con otro contenido: error, no devuelve la venta anterior');

-- 6 y 7: pagos combinados, sin huecos
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":1,"precio_visto":1500}]',
    '[{"medio":"efectivo","importe":500},{"medio":"tarjeta","importe":1000}]', 1500, null) ->> 'numero',
  '2', 'después del reintento y del rechazo el número sigue sin huecos');
select results_eq(
  $$ select medio::text, importe from public.pagos_venta where venta_id = 'a4000000-0000-0000-0000-000000000002' order by medio $$,
  $$ values ('efectivo'::text, 500), ('tarjeta'::text, 1000) $$, 'se guardan los pagos combinados');

-- 8 a 10: precio distinto no graba y devuelve las diferencias
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":800}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) ->> 'estado',
  'precios_distintos', 'precio distinto en la base: avisa');
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":800}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) -> 'diferencias',
  '[{"producto_id":"a2000000-0000-0000-0000-000000000001","nombre":"Alfajor","precio_visto":800,"precio_actual":900}]'::jsonb,
  'devuelve producto, precio visto y precio actual');
select is((select count(*)::int from public.ventas), 2, 'precio distinto: no grabó nada');

-- 11 a 19: reglas de turno, productos e importes
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'sin_turno', 'sin turno abierto en la PC no se vende');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000003","cantidad":1,"precio_visto":500}]',
    '[{"medio":"efectivo","importe":500}]', 500, null) $$,
  'P0001', 'producto_no_disponible', 'un producto desactivado no se vende');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) $$,
  'P0001', 'total_distinto', 'el total enviado que no coincide con el recalculado se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":800}]', 900, null) $$,
  'P0001', 'no_suma_total', 'los pagos tienen que sumar el total');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, 500) $$,
  'P0001', 'efectivo_insuficiente', 'lo entregado no alcanza para la parte en efectivo');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"tarjeta","importe":900}]', 900, 1000) $$,
  'P0001', 'entrega_sin_efectivo', 'efectivo entregado sin parte en efectivo');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900},{"medio":"tarjeta","importe":0}]', 900, null) $$,
  'P0001', 'importe_invalido', 'un importe en cero se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1.5,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1350}]', 1350, null) $$,
  'P0001', 'linea_invalida', 'una cantidad con decimales se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[]', '[{"medio":"efectivo","importe":100}]', 100, null) $$,
  'P0001', 'venta_vacia', 'una venta sin líneas se rechaza');

-- 20 a 22: fiado
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":400},{"medio":"fiado","importe":500,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]',
    900, 1000) ->> 'vuelto',
  '600', 'fiado parcial con cliente; el vuelto sale sólo del efectivo');
select is((select numero from public.ventas where id = 'a4000000-0000-0000-0000-000000000005'), 3,
  'llamadas seguidas numeran 1, 2, 3 sin huecos ni repetidos');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"fiado","importe":900}]', 900, null) $$,
  'P0001', 'fiado_sin_cliente', 'el fiado exige un cliente');

-- 23: reintento después de un cambio de precio
reset role;
update public.productos set precio = 1000 where id = 'a2000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'ya_existia',
  'true', 'reintento después de un cambio de precio: devuelve la venta grabada, no falla por precio');

-- 24: fiado apagado
reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":1000}]',
    '[{"medio":"fiado","importe":1000,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]', 1000, null) $$,
  'P0001', 'fiado_deshabilitado', 'con fiado apagado la base rechaza el pago fiado');

-- 25: authenticated sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":1,"precio_visto":1500}]',
    '[{"medio":"efectivo","importe":1500}]', 1500, null) $$,
  'P0001', 'sin_cuenta', 'un usuario autenticado sin cuenta no confirma');

-- 26 a 29: numeración y permisos
reset role;
select is((select ultimo_numero from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 3,
  'los rechazos no consumen número');
select ok(not has_function_privilege('anon', 'public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer)', 'execute'),
  'anon no tiene permiso de ejecución');
select ok(has_function_privilege('authenticated', 'public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer)', 'execute'),
  'authenticated sí');
set local role anon;
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001',
    '[]', '[]', 1, null) $$,
  '42501', null, 'anon no puede ejecutar la función de venta');

select * from finish();
rollback;
```

- [ ] **Step 2: Escribir la prueba obligatoria de aislamiento (genérica más casos)**

`supabase/tests/database/140_aislamiento.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- 1 y 2: genéricas sobre TODAS las funciones security definer de public (también las de las tareas 11 a 17).
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and exists (select 1 from unnest(coalesce(p.proargnames, '{}'::text[])) a where a ilike '%negocio%') $$,
  'ninguna función security definer recibe el negocio por parámetro');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prosrc !~ '(negocio_actual|rol_actual)\(\)' $$,
  'toda función security definer toma el negocio del token (negocio_actual o rol_actual)');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'ais-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'ais-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'ais-jefe-b@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001b', 'b0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor A', 900),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochitos B', 700);
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Cliente de A');
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);

-- 3: A vende
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) ->> 'numero', '1', 'A vende');

-- 4 a 18: opera la caja de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select is((select count(*)::int from public.ventas), 0, 'B no ve ventas de A');
select is((select count(*)::int from public.lineas_venta), 0, 'B no ve líneas de A');
select is((select count(*)::int from public.pagos_venta), 0, 'B no ve pagos de A');
select is((select count(*)::int from public.clientes), 0, 'B no ve clientes de A');
select is((select count(*)::int from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 0, 'B no ve PCs de A');
select is((select count(*)::int from public.turnos where dispositivo_id = 'a1000000-0000-0000-0000-000000000001'), 0, 'B no ve turnos de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"efectivo","importe":700}]', 700, null) $$,
  'P0001', 'dispositivo_desconocido', 'B no confirma con la PC de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'producto_no_disponible', 'B no vende productos de A');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"efectivo","importe":700}]', 700, null) $$,
  'P0001', 'venta_id_reusado', 'un id de venta de A no devuelve datos de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"fiado","importe":700,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]', 700, null) $$,
  'P0001', 'fiado_sin_cliente', 'B no fía a un cliente de A');
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_ajeno', 'B no registra como propia la PC de A');
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'B no abre turno en la PC de A');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'B no cierra el turno de A');
select ok(public.modulo_activo('fiado'), 'el fiado apagado en A no apaga el de B');
select isnt(public.alta_cliente('Cliente de B', null) ->> 'id', null, 'B da de alta su propio cliente');

-- 19 y 20: el jefe de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select is((select count(*)::int from public.ventas), 0, 'el jefe de B, que ve todos los días, tampoco ve ventas de A');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'sin_cuenta', 'una cuenta de B con negocio_id de A en el token no opera en A');

-- 21 a 23: nada de A cambió
reset role;
select is((select ultimo_numero from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 1,
  'los intentos de B no tocaron la numeración de A');
select is((select negocio_id from public.clientes where nombre = 'Cliente de B' and negocio_id in
           ('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000')),
  'b0000000-0000-0000-0000-000000000000'::uuid, 'el cliente de B quedó en B sin pasar negocio por parámetro');
select is((select count(*)::int from public.turnos
           where dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and cierre is null), 1,
  'el turno de A sigue abierto');

select * from finish();
rollback;
```

- [ ] **Step 3: Escribir la prueba genérica de permisos**

`supabase/tests/database/150_permisos_funciones.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Genéricas sobre TODAS las funciones security definer de public: cubren las de las tareas 11 a 17 sin tocarlas.
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'] $$,
  'toda función security definer tiene search_path vacío (V7)');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon no ejecuta ninguna función security definer');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') $$,
  'PUBLIC no ejecuta ninguna función security definer');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef group by p.proname having count(*) > 1 $$,
  'ninguna función security definer está sobrecargada (la lista de abajo va por nombre)');

-- Lista explícita: cada tarea que agrega una función security definer para la app suma su nombre acá.
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  array['abrir_turno', 'alta_cliente', 'cerrar_turno', 'confirmar_venta', 'registrar_dispositivo'],
  'authenticated ejecuta sólo las funciones security definer de la lista');

select ok(not has_function_privilege('anon', 'public.modulo_activo(text)', 'execute'), 'anon no ejecuta modulo_activo');
select ok(not has_function_privilege('authenticated', 'public.prefijo_dispositivo(integer)', 'execute'),
  'prefijo_dispositivo es interna');

select * from finish();
rollback;
```

- [ ] **Step 4: Correrlas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `080`, `140` y `150` con `function public.confirmar_venta(unknown, unknown, unknown, unknown, integer, integer) does not exist` (`150` falla en la prueba 5: falta `confirmar_venta` en el conjunto).

- [ ] **Step 5: Escribir confirmar_venta**

`supabase/migrations/20261019121000_confirmar_venta.sql`:
```sql
-- Única puerta de escritura de ventas (spec secciones 4, 6 y 10). security definer: saltea RLS,
-- por eso negocio_id sale del token y la prueba de aislamiento (140) es obligatoria.
-- Orden fijo: 1 cuenta, 2 bloquear PC, 3 id y hash, 4 turno, 5 precios, 6 fiado, 7 importes, 8 numerar e insertar.
-- Los códigos de cobro son los mismos que ErrorCobro (src/venta/cobro.ts, tarea 5).
create or replace function public.confirmar_venta(
  p_venta_id uuid,
  p_dispositivo_id uuid,
  p_lineas jsonb,
  p_pagos jsonb,
  p_total integer,
  p_efectivo_entregado integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_prefijo text;
  v_hash text;
  v_existente public.ventas%rowtype;
  v_turno uuid;
  v_faltantes jsonb;
  v_diferencias jsonb;
  v_total bigint;
  v_suma bigint;
  v_efectivo bigint;
  v_entregado bigint;
  v_numero integer;
  v_fecha timestamptz;
begin
  -- 1. Negocio del token y cuenta en ese negocio (rol leído de cuentas con auth.uid()).
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- 2. Bloquear la PC: serializa la numeración (doble clic, dos pestañas). Sólo PCs del negocio.
  select d.prefijo into v_prefijo
  from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- 3. id y hash del contenido recibido. jsonb ordena las claves: el texto es estable.
  if p_venta_id is null
     or jsonb_typeof(p_lineas) is distinct from 'array'
     or jsonb_typeof(p_pagos) is distinct from 'array' then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'dispositivo_id', p_dispositivo_id,
      'lineas', p_lineas,
      'pagos', p_pagos,
      'total', p_total,
      'efectivo_entregado', p_efectivo_entregado
    )::text, 'UTF8')), 'hex');

  select * into v_existente from public.ventas v where v.id = p_venta_id;
  if found then
    -- Otro contenido, u otro negocio: error. Nunca se devuelve en silencio otra venta.
    if v_existente.negocio_id <> v_negocio or v_existente.hash_contenido <> v_hash then
      raise exception 'venta_id_reusado' using errcode = 'P0001';
    end if;
    select coalesce(sum(pv.importe), 0) into v_efectivo
    from public.pagos_venta pv where pv.venta_id = v_existente.id and pv.medio = 'efectivo';
    return jsonb_build_object(
      'estado', 'confirmada',
      'venta_id', v_existente.id,
      'prefijo', (select d.prefijo from public.dispositivos d where d.id = v_existente.dispositivo_id),
      'numero', v_existente.numero,
      'total', v_existente.total,
      'fecha', v_existente.fecha,
      'vuelto', greatest(coalesce(p_efectivo_entregado, v_efectivo) - v_efectivo, 0),
      'ya_existia', true
    );
  end if;

  -- 4. Turno abierto en esta PC (un turno por PC, decisión 38).
  select t.id into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  -- 5. Productos activos del negocio y precios: la base tiene la última palabra (decisión 22).
  select coalesce(jsonb_agg(e -> 'producto_id'), '[]'::jsonb) into v_faltantes
  from jsonb_array_elements(p_lineas) e
  where not exists (
    select 1 from public.productos p
    where p.negocio_id = v_negocio and p.activo and p.id::text = e ->> 'producto_id'
  );
  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'producto_no_disponible' using errcode = 'P0001', detail = v_faltantes::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', p.id, 'nombre', p.nombre,
           'precio_visto', e -> 'precio_visto', 'precio_actual', p.precio)), '[]'::jsonb)
  into v_diferencias
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id::text = e ->> 'producto_id'
  where p.precio::text is distinct from e ->> 'precio_visto';
  if jsonb_array_length(v_diferencias) > 0 then
    -- No graba nada: la pantalla muestra qué cambió y confirma de nuevo con un id nuevo.
    return jsonb_build_object('estado', 'precios_distintos', 'diferencias', v_diferencias);
  end if;

  -- 6. Fiado: módulo activo y cliente del mismo negocio, no suprimido.
  if exists (select 1 from jsonb_array_elements(p_pagos) e where e ->> 'medio' = 'fiado') then
    if not public.modulo_activo('fiado') then
      raise exception 'fiado_deshabilitado' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_pagos) e
      where e ->> 'medio' = 'fiado'
        and not exists (
          select 1 from public.clientes c
          where c.negocio_id = v_negocio and not c.suprimido and c.id::text = e ->> 'cliente_id'
        )
    ) then
      raise exception 'fiado_sin_cliente' using errcode = 'P0001';
    end if;
  end if;

  -- 7. Forma e importes: enteros mayores que cero; total recalculado; pagos = total; efectivo suficiente.
  if jsonb_array_length(p_lineas) = 0 then
    raise exception 'venta_vacia' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) e
    where jsonb_typeof(e -> 'cantidad') is distinct from 'number'
       or e ->> 'cantidad' !~ '^[1-9][0-9]{0,4}$'
  ) then
    raise exception 'linea_invalida' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagos) e
    where coalesce(e ->> 'medio', '') not in ('efectivo', 'transferencia', 'tarjeta', 'fiado')
  ) or (select count(*) from jsonb_array_elements(p_pagos))
       <> (select count(distinct e ->> 'medio') from jsonb_array_elements(p_pagos) e) then
    raise exception 'pago_invalido' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagos) e
    where jsonb_typeof(e -> 'importe') is distinct from 'number'
       or e ->> 'importe' !~ '^[1-9][0-9]{0,8}$'
  ) or p_total is null or p_total <= 0 or p_efectivo_entregado < 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;

  select sum((e ->> 'cantidad')::bigint * p.precio) into v_total
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id = (e ->> 'producto_id')::uuid;
  if v_total <> p_total then
    raise exception 'total_distinto' using errcode = 'P0001',
      detail = jsonb_build_object('total_enviado', p_total, 'total_calculado', v_total)::text;
  end if;

  select coalesce(sum((e ->> 'importe')::bigint), 0),
         coalesce(sum((e ->> 'importe')::bigint) filter (where e ->> 'medio' = 'efectivo'), 0)
  into v_suma, v_efectivo
  from jsonb_array_elements(p_pagos) e;
  if v_suma <> v_total then
    raise exception 'no_suma_total' using errcode = 'P0001';
  end if;

  v_entregado := coalesce(p_efectivo_entregado, v_efectivo);
  if v_efectivo = 0 and v_entregado > 0 then
    raise exception 'entrega_sin_efectivo' using errcode = 'P0001';
  end if;
  if v_entregado < v_efectivo then
    raise exception 'efectivo_insuficiente' using errcode = 'P0001';
  end if;

  -- 8. Recién ahora numerar e insertar. Todo es una transacción: si algo falla, el número no se consume.
  update public.dispositivos d set ultimo_numero = d.ultimo_numero + 1
  where d.id = p_dispositivo_id
  returning d.ultimo_numero into v_numero;

  insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
  values (p_venta_id, v_negocio, p_dispositivo_id, auth.uid(), v_turno, v_numero, v_total::integer, v_hash)
  returning fecha into v_fecha;

  insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario)
  select v_negocio, p_venta_id, p.id, (e ->> 'cantidad')::integer, p.precio
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id = (e ->> 'producto_id')::uuid;

  insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id)
  select v_negocio, p_venta_id, (e ->> 'medio')::public.medio_pago, (e ->> 'importe')::integer,
         case when e ->> 'medio' = 'fiado' then (e ->> 'cliente_id')::uuid end
  from jsonb_array_elements(p_pagos) e;

  return jsonb_build_object(
    'estado', 'confirmada',
    'venta_id', p_venta_id,
    'prefijo', v_prefijo,
    'numero', v_numero,
    'total', v_total,
    'fecha', v_fecha,
    'vuelto', v_entregado - v_efectivo,
    'ya_existia', false
  );
end;
$$;

revoke all on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) to authenticated;
```

- [ ] **Step 6: Aplicar y correr las pruebas pgTAP**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `All tests successful.` y `Result: PASS`. Si falla sólo la prueba 1 de `150`, ver V7. Si la prueba 5 de `150` lista funciones que no son de este plan, ver V19.

- [ ] **Step 7: Escribir las pruebas del carrito, del id y de la llamada**

`src/venta/carrito.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { carritoReducer, carritoVacio, totalCarrito } from './carrito'

const coca = { id: 'p1', nombre: 'Coca Cola 500', precio: 1500 }
const pan = { id: 'p2', nombre: 'Pan casero', precio: 800 }
const con = (...productos: (typeof coca)[]) =>
  productos.reduce((c, producto) => carritoReducer(c, { tipo: 'agregar', producto }), carritoVacio)

describe('carritoReducer', () => {
  it('agregar un producto que ya está suma 1 a su línea', () => {
    expect(con(coca, coca).lineas).toEqual([{ productoId: 'p1', nombre: 'Coca Cola 500', precio: 1500, cantidad: 2 }])
  })

  it('+ suma y − en 1 quita la línea', () => {
    let c = carritoReducer(con(coca), { tipo: 'cambiarCantidad', productoId: 'p1', delta: 1 })
    expect(c.lineas[0].cantidad).toBe(2)
    c = carritoReducer(c, { tipo: 'cambiarCantidad', productoId: 'p1', delta: -1 })
    c = carritoReducer(c, { tipo: 'cambiarCantidad', productoId: 'p1', delta: -1 })
    expect(c.lineas).toEqual([])
  })

  it('actualizarPrecios cambia sólo los indicados', () => {
    const c = carritoReducer(con(coca, pan), { tipo: 'actualizarPrecios', precios: { p1: 1700 } })
    expect(c.lineas.map((l) => l.precio)).toEqual([1700, 800])
  })

  it('quitar y vaciar', () => {
    expect(carritoReducer(con(coca, pan), { tipo: 'quitar', productoIds: ['p1'] }).lineas.map((l) => l.productoId)).toEqual(['p2'])
    expect(carritoReducer(con(coca, pan), { tipo: 'vaciar' })).toEqual(carritoVacio)
  })

  it('el total es la suma de precio por cantidad, en enteros', () => {
    expect(totalCarrito(con(coca, pan, pan))).toBe(3100)
  })
})
```

`src/venta/idVenta.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearIdVenta } from './idVenta'

describe('crearIdVenta', () => {
  afterEach(() => vi.restoreAllMocks())

  const generador = () => {
    let n = 0
    return crearIdVenta(() => `id-${++n}`)
  }

  it('el reintento con el mismo contenido usa el mismo id', () => {
    const ids = generador()
    expect(ids.idPara('carrito A')).toBe('id-1')
    expect(ids.idPara('carrito A')).toBe('id-1')
  })

  it('un cambio de carrito o de pagos genera un id nuevo', () => {
    const ids = generador()
    ids.idPara('carrito A')
    expect(ids.idPara('carrito A + 1 alfajor')).toBe('id-2')
  })

  it('después de confirmar, una venta igual lleva otro id', () => {
    const ids = generador()
    ids.idPara('carrito A')
    ids.reiniciar()
    expect(ids.idPara('carrito A')).toBe('id-2')
  })

  it('nunca guarda nada en el navegador', () => {
    const guardar = vi.spyOn(Storage.prototype, 'setItem')
    const ids = crearIdVenta()
    ids.idPara('carrito A')
    expect(guardar).not.toHaveBeenCalled()
  })
})
```

`src/venta/confirmar.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { argumentosConfirmar, claveContenido, confirmarVenta, formatearNumeroVenta, type LlamarRpc, type PedidoVenta } from './confirmar'

const pedido: PedidoVenta = {
  dispositivoId: 'pc-1',
  lineas: [{ productoId: 'p1', nombre: 'Alfajor', precio: 900, cantidad: 2 }],
  pagos: [{ medio: 'efectivo', importe: 1800, cliente_id: null }],
  total: 1800,
  efectivoEntregado: 2000,
}

const responde = (r: Awaited<ReturnType<LlamarRpc>>): LlamarRpc => vi.fn(async () => r)

describe('argumentosConfirmar y claveContenido', () => {
  it('manda el precio visto por línea y los importes enteros', () => {
    expect(argumentosConfirmar('v1', pedido)).toEqual({
      p_venta_id: 'v1',
      p_dispositivo_id: 'pc-1',
      p_lineas: [{ producto_id: 'p1', cantidad: 2, precio_visto: 900 }],
      p_pagos: [{ medio: 'efectivo', importe: 1800, cliente_id: null }],
      p_total: 1800,
      p_efectivo_entregado: 2000,
    })
  })

  it('la clave cambia si cambia el contenido', () => {
    expect(claveContenido(pedido)).toBe(claveContenido({ ...pedido }))
    expect(claveContenido(pedido)).not.toBe(claveContenido({ ...pedido, efectivoEntregado: 5000 }))
  })
})

describe('confirmarVenta', () => {
  it('devuelve la venta confirmada', async () => {
    const rpc = responde({
      data: { estado: 'confirmada', venta_id: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 200, ya_existia: false },
      error: null,
    })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({
      tipo: 'confirmada',
      venta: { ventaId: 'v1', prefijo: 'A', numero: 123, total: 1800, fecha: '2026-10-19T12:00:00Z', vuelto: 200, yaExistia: false },
    })
    expect(rpc).toHaveBeenCalledWith('confirmar_venta', argumentosConfirmar('v1', pedido))
  })

  it('devuelve las diferencias de precio', async () => {
    const rpc = responde({
      data: { estado: 'precios_distintos', diferencias: [{ producto_id: 'p1', nombre: 'Alfajor', precio_visto: 900, precio_actual: 1000 }] },
      error: null,
    })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({
      tipo: 'precios_distintos',
      diferencias: [{ productoId: 'p1', nombre: 'Alfajor', precioVisto: 900, precioActual: 1000 }],
    })
  })

  it('traduce el código de rechazo de la base', async () => {
    const rpc = responde({ data: null, error: { message: 'sin_turno', code: 'P0001', details: null } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'rechazada', codigo: 'sin_turno', detalle: null })
  })

  it('sin código de error es falla de red (V5): se reintenta con el mismo id', async () => {
    const rpc = responde({ data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: '' } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'error_red' })
    const rota: LlamarRpc = vi.fn(async () => {
      throw new Error('sin red')
    })
    expect(await confirmarVenta(rota, 'v1', pedido)).toEqual({ tipo: 'error_red' })
  })

  it('un mensaje que no es un código conocido queda como desconocido', async () => {
    const rpc = responde({ data: null, error: { message: 'otra cosa', code: '42883', details: null } })
    expect(await confirmarVenta(rpc, 'v1', pedido)).toEqual({ tipo: 'desconocido', mensaje: 'otra cosa' })
  })
})

describe('formatearNumeroVenta', () => {
  it('prefijo de la PC y seis dígitos', () => {
    expect(formatearNumeroVenta('A', 123)).toBe('A-000123')
    expect(formatearNumeroVenta('AB', 7)).toBe('AB-000007')
  })
})
```

- [ ] **Step 8: Correrlas y ver que fallan**

Run: `npx vitest run src/venta/carrito.test.ts src/venta/idVenta.test.ts src/venta/confirmar.test.ts`
Expected: FAIL: `Failed to resolve import "./carrito"`, `"./idVenta"` y `"./confirmar"`.

- [ ] **Step 9: Implementar**

`src/venta/carrito.ts`:
```ts
import type { LineaCarrito, Producto } from '../tipos'

/** Venta en armado. Puro: el id de la venta vive aparte (idVenta.ts). */
export interface Carrito {
  lineas: LineaCarrito[]
}

export type AccionCarrito =
  | { tipo: 'agregar'; producto: Pick<Producto, 'id' | 'nombre' | 'precio'> }
  | { tipo: 'cambiarCantidad'; productoId: string; delta: 1 | -1 }
  | { tipo: 'quitar'; productoIds: string[] }
  | { tipo: 'actualizarPrecios'; precios: Record<string, number> }
  | { tipo: 'vaciar' }

export const carritoVacio: Carrito = { lineas: [] }

export function carritoReducer(c: Carrito, a: AccionCarrito): Carrito {
  switch (a.tipo) {
    case 'agregar': {
      const existe = c.lineas.some((l) => l.productoId === a.producto.id)
      return {
        lineas: existe
          ? c.lineas.map((l) => (l.productoId === a.producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
          : [...c.lineas, { productoId: a.producto.id, nombre: a.producto.nombre, precio: a.producto.precio, cantidad: 1 }],
      }
    }
    case 'cambiarCantidad':
      return {
        lineas: c.lineas
          .map((l) => (l.productoId === a.productoId ? { ...l, cantidad: l.cantidad + a.delta } : l))
          .filter((l) => l.cantidad > 0),
      }
    case 'quitar':
      return { lineas: c.lineas.filter((l) => !a.productoIds.includes(l.productoId)) }
    case 'actualizarPrecios':
      return {
        lineas: c.lineas.map((l) => (l.productoId in a.precios ? { ...l, precio: a.precios[l.productoId] } : l)),
      }
    case 'vaciar':
      return carritoVacio
  }
}

export function totalCarrito(c: Carrito): number {
  return c.lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0)
}
```

`src/venta/idVenta.ts`:
```ts
/**
 * Id de la venta, sólo en memoria de la pestaña (decisión 31: nada en sessionStorage ni localStorage).
 * Se ata al contenido exacto (claveContenido de confirmar.ts): otro contenido, otro id; el mismo
 * contenido del último intento, el mismo id (reintento sin duplicar). Tras confirmar, reiniciar().
 */
export interface GeneradorIdVenta {
  idPara(clave: string): string
  reiniciar(): void
}

export function crearIdVenta(nuevoId: () => string = () => crypto.randomUUID()): GeneradorIdVenta {
  let actual: { clave: string; id: string } | null = null
  return {
    idPara(clave) {
      if (actual === null || actual.clave !== clave) actual = { clave, id: nuevoId() }
      return actual.id
    },
    reiniciar() {
      actual = null
    },
  }
}
```

`src/venta/confirmar.ts`:
```ts
import type { LineaCarrito } from '../tipos'
import type { ErrorCobro, PagoAEnviar } from './cobro'

/** Códigos que devuelve confirmar_venta: los de cobro (tarea 5) más los propios de la base. */
export type ErrorConfirmar =
  | ErrorCobro
  | 'sin_cuenta'
  | 'dispositivo_desconocido'
  | 'pedido_invalido'
  | 'venta_id_reusado'
  | 'sin_turno'
  | 'producto_no_disponible'
  | 'linea_invalida'
  | 'pago_invalido'
  | 'total_distinto'

const CODIGOS: readonly ErrorConfirmar[] = [
  'importe_invalido', 'venta_vacia', 'no_suma_total', 'efectivo_insuficiente', 'entrega_sin_efectivo',
  'fiado_deshabilitado', 'fiado_sin_cliente', 'sin_cuenta', 'dispositivo_desconocido', 'pedido_invalido',
  'venta_id_reusado', 'sin_turno', 'producto_no_disponible', 'linea_invalida', 'pago_invalido', 'total_distinto',
]

export interface PedidoVenta {
  dispositivoId: string
  lineas: LineaCarrito[]
  pagos: PagoAEnviar[]
  total: number
  efectivoEntregado: number | null
}

export interface VentaConfirmada {
  ventaId: string
  prefijo: string
  numero: number
  total: number
  fecha: string
  vuelto: number
  yaExistia: boolean
}

export interface DiferenciaPrecio {
  productoId: string
  nombre: string
  precioVisto: number
  precioActual: number
}

export type ResultadoConfirmar =
  | { tipo: 'confirmada'; venta: VentaConfirmada }
  | { tipo: 'precios_distintos'; diferencias: DiferenciaPrecio[] }
  | { tipo: 'rechazada'; codigo: ErrorConfirmar; detalle: string | null }
  | { tipo: 'error_red' }
  | { tipo: 'desconocido'; mensaje: string }

export interface RespuestaRpc {
  data: unknown
  error: { message: string; code?: string; details?: string | null } | null
}

/** Se arma con el cliente real: (funcion, args) => supabase.rpc(funcion, args). */
export type LlamarRpc = (funcion: 'confirmar_venta', args: Record<string, unknown>) => PromiseLike<RespuestaRpc>

type Respuesta =
  | { estado: 'confirmada'; venta_id: string; prefijo: string; numero: number; total: number; fecha: string; vuelto: number; ya_existia: boolean }
  | { estado: 'precios_distintos'; diferencias: { producto_id: string; nombre: string; precio_visto: number; precio_actual: number }[] }

export function argumentosConfirmar(ventaId: string, p: PedidoVenta): Record<string, unknown> {
  return {
    p_venta_id: ventaId,
    p_dispositivo_id: p.dispositivoId,
    p_lineas: p.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad, precio_visto: l.precio })),
    p_pagos: p.pagos,
    p_total: p.total,
    p_efectivo_entregado: p.efectivoEntregado,
  }
}

/** Mismo texto ⇔ mismo contenido que la base convierte en hash_contenido. Lo usa idVenta. */
export function claveContenido(p: PedidoVenta): string {
  return JSON.stringify(argumentosConfirmar('', p))
}

export async function confirmarVenta(rpc: LlamarRpc, ventaId: string, pedido: PedidoVenta): Promise<ResultadoConfirmar> {
  let r: RespuestaRpc
  try {
    r = await rpc('confirmar_venta', argumentosConfirmar(ventaId, pedido))
  } catch {
    return { tipo: 'error_red' }
  }
  const error = r.error
  if (error) {
    if (!error.code) return { tipo: 'error_red' } // V5: el fetch falló, la venta pudo o no grabarse
    const codigo = CODIGOS.find((c) => c === error.message)
    return codigo
      ? { tipo: 'rechazada', codigo, detalle: error.details ?? null }
      : { tipo: 'desconocido', mensaje: error.message }
  }
  const d = r.data as Respuesta
  if (d.estado === 'precios_distintos') {
    return {
      tipo: 'precios_distintos',
      diferencias: d.diferencias.map((x) => ({
        productoId: x.producto_id,
        nombre: x.nombre,
        precioVisto: x.precio_visto,
        precioActual: x.precio_actual,
      })),
    }
  }
  return {
    tipo: 'confirmada',
    venta: {
      ventaId: d.venta_id,
      prefijo: d.prefijo,
      numero: d.numero,
      total: d.total,
      fecha: d.fecha,
      vuelto: d.vuelto,
      yaExistia: d.ya_existia,
    },
  }
}

/** Número del comprobante en pantalla: prefijo de la PC y seis dígitos (A-000123). */
export function formatearNumeroVenta(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(6, '0')}`
}
```

- [ ] **Step 10: Correr las pruebas, los tipos y la suite completa**

Run:
```bash
npx vitest run src/venta
npx tsc --noEmit
npm test
```
Expected: `src/venta`: `Test Files  4 passed (4)` y `Tests  32 passed (32)` (15 de `cobro.test.ts`, 5 de carrito, 4 de idVenta, 8 de confirmar); `tsc` sin salida; `npm test` sin fallas.

- [ ] **Step 11: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests src/venta
git commit -m "feat(venta): confirmar_venta idempotente con pruebas de aislamiento y permisos" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Nombres nuevos que define la parte 2

### Decisiones tomadas en esta parte

| Tema | Decisión | Dónde |
|---|---|---|
| Prefijo después de Z (spec sección 14) | A…Z, AA…ZZ, AAA…ZZZ (base 26 biyectiva, como columnas de planilla). PC 27 = `AA`, PC 703 = `AAA`, tope 18.278 por kiosco. El check de `dispositivos.prefijo` pasa de `^[A-Z]$` a `^[A-Z]{1,3}$`. | Tarea 8 |
| Totales del cierre de turno | Pagos de las ventas del turno menos los pagos de las ventas anuladas desde esa PC entre la apertura y el cierre (misma regla que la caja del día: resta cuando se anula). | Tarea 8 |
| Venta e historial | `confirmar_venta` no escribe en `historial` (el spec no lo lista). El alta de clientes tampoco. | Tarea 10 |
| Hash | `sha256` de `pg_catalog` sobre `jsonb_build_object(dispositivo_id, lineas, pagos, total, efectivo_entregado)::text`, en hex. No usa pgcrypto. | Tarea 10 |
| id de la venta | Atado al contenido (`claveContenido`): otro contenido da otro id; el mismo contenido del último intento reusa el id. Cumple "un cambio genera un id nuevo" y además, si el cajero vuelve exactamente al contenido ya intentado, el reintento devuelve la venta grabada en vez de duplicarla. | Tarea 10 |
| Fiado a un cliente suprimido | Se rechaza (`fiado_sin_cliente`): un cliente anonimizado a pedido no recibe ventas nuevas. Regla nueva; Felipe puede quitarla. | Tarea 10 |
| Caché | Una sola base Dexie `catalogo` por navegador, con `meta.negocio_id`: si cambia el negocio, recarga todo. Guarda también inactivos (para ofrecer reactivar un código escaneado). | Tarea 7 |

### Migraciones y funciones de la base

| Archivo | Nombres | Firma y devolución |
|---|---|---|
| `supabase/migrations/20261019120300_catalogo_version.sql` | `subir_catalogo_version()`, `subir_version_por_negocio()`, triggers `productos_catalogo_version` y `negocios_catalogo_version` | Funciones de trigger, sin EXECUTE para nadie. |
| `supabase/migrations/20261019120500_registrar_dispositivo.sql` | `prefijo_dispositivo(p_orden integer) returns text` (interna); `registrar_dispositivo(p_dispositivo_id uuid) returns jsonb` | `{dispositivo_id, prefijo, nuevo}` |
| `supabase/migrations/20261019120600_turnos.sql` | `abrir_turno(p_dispositivo_id uuid) returns jsonb`; `cerrar_turno(p_dispositivo_id uuid) returns jsonb` | `{turno_id, apertura, turno_cerrado_id}`; `{turno_id, apertura, cierre, totales: {efectivo, transferencia, tarjeta, fiado, cobrado}}`. En `historial`, `cierre_turno` lleva `valor_nuevo = {"automatico": true|false}`. |
| `supabase/migrations/20261019120800_modulos.sql` | `modulo_activo(p_clave text) returns boolean` | `security invoker`, `stable`. |
| `supabase/migrations/20261019120900_clientes.sql` | `alta_cliente(p_nombre text, p_telefono text default null) returns jsonb` | `{id, nombre, telefono}` |
| `supabase/migrations/20261019121000_confirmar_venta.sql` | `confirmar_venta(p_venta_id uuid, p_dispositivo_id uuid, p_lineas jsonb, p_pagos jsonb, p_total integer, p_efectivo_entregado integer) returns jsonb` | `p_lineas`: `[{producto_id, cantidad, precio_visto}]`; `p_pagos`: `[{medio, importe, cliente_id}]`. Devuelve `{estado: "confirmada", venta_id, prefijo, numero, total, fecha, vuelto, ya_existia}` o `{estado: "precios_distintos", diferencias: [{producto_id, nombre, precio_visto, precio_actual}]}`. |

Los números `20261019120400` y `20261019120700` quedan libres (historial de productos y productos pasaron a `121600` y `121500`).

Códigos de error (`message` de PostgREST, `code` = `P0001`):

| Código | Lo lanza |
|---|---|
| `sin_cuenta` | todas las funciones definer de esta parte |
| `dispositivo_desconocido` | `registrar_dispositivo` (id nulo), `abrir_turno`, `cerrar_turno`, `confirmar_venta` |
| `dispositivo_ajeno` | `registrar_dispositivo` |
| `prefijo_fuera_de_rango` | `prefijo_dispositivo` |
| `sin_turno` | `cerrar_turno`, `confirmar_venta` |
| `nombre_invalido`, `telefono_invalido` | `alta_cliente` |
| `fiado_deshabilitado` | `alta_cliente`, `confirmar_venta` |
| `pedido_invalido`, `venta_id_reusado`, `producto_no_disponible` (detail: ids), `linea_invalida`, `pago_invalido`, `total_distinto` (detail: enviado y calculado) | `confirmar_venta` |
| `importe_invalido`, `venta_vacia`, `no_suma_total`, `efectivo_insuficiente`, `entrega_sin_efectivo`, `fiado_sin_cliente` | `confirmar_venta` (mismos que `ErrorCobro`, tarea 5) |

### Archivos y nombres de TypeScript

| Archivo | Exporta |
|---|---|
| `src/lib/supabase.ts` | `supabase` |
| `src/catalogo/normalizar.ts` | `normalizar`, `palabras` |
| `src/catalogo/buscar.ts` | `MAX_RESULTADOS` (8), `MIN_LETRAS` (2), `terminosDeBusqueda`, `compararPorNombre`, `buscarPorNombre` |
| `src/catalogo/fuente.ts` | `PAGINA_CATALOGO` (1000), `VersionCatalogo`, `FuenteCatalogo`, `crearFuenteSupabase` |
| `src/catalogo/cache.ts` | `CacheCatalogo`, `cacheDeLaApp`, `sincronizarCatalogo`, `buscarEnCache`, `buscarPorCodigoEnCache`, `borrarCache(db = cacheDeLaApp())` |
| `src/catalogo/programar.ts` | `INTERVALO_CATALOGO_MS` (180.000), `programarSincronizacion` |
| `src/dispositivo/dispositivo.ts` | `Dispositivo`, `obtenerDispositivoId`, `registrarDispositivo` |
| `src/turno/turno.ts` | `TotalesTurno`, `TurnoAbierto`, `CierreTurno`, `leerTurnoAbierto`, `abrirTurno`, `cerrarTurno` |
| `src/turno/PantallaTurno.tsx` | `PedirApertura({ alAbrir })`, `ResumenCierre({ cierre, alSeguir })` (el archivo no exporta un componente `PantallaTurno`) |
| `src/venta/carrito.ts` | `Carrito`, `AccionCarrito` (`agregar`, `cambiarCantidad`, `quitar`, `actualizarPrecios`, `vaciar`), `carritoVacio`, `carritoReducer`, `totalCarrito` |
| `src/venta/idVenta.ts` | `GeneradorIdVenta`, `crearIdVenta` (`idPara(clave)`, `reiniciar()`) |
| `src/venta/confirmar.ts` | `ErrorConfirmar`, `PedidoVenta`, `VentaConfirmada`, `DiferenciaPrecio`, `ResultadoConfirmar` (`confirmada`, `precios_distintos`, `rechazada`, `error_red`, `desconocido`), `RespuestaRpc`, `LlamarRpc`, `argumentosConfirmar`, `claveContenido`, `confirmarVenta`, `formatearNumeroVenta` (`A-000123`) |

Claves del navegador:
- Dexie: base `catalogo`, `version(1)`: `productos: 'id, codigo_barras, *palabras'`, `meta: 'clave'`; filas de `meta` con clave `negocio_id` y `catalogo_version`.
- `localStorage`: `dispositivo-id:<negocio_id>` y la sesión de Auth que guarda supabase-js. Nada de ventas.

### Pruebas nuevas

- pgTAP: `supabase/tests/database/030_catalogo_version.test.sql`, `040_registrar_dispositivo.test.sql`, `050_turnos.test.sql`, `060_modulos.test.sql`, `070_clientes.test.sql`, `080_confirmar_venta.test.sql`, `140_aislamiento.test.sql`, `150_permisos_funciones.test.sql`.
- Vitest: `src/catalogo/normalizar.test.ts`, `src/catalogo/buscar.test.ts`, `src/catalogo/cache.test.ts`, `src/catalogo/programar.test.ts`, `src/dispositivo/dispositivo.test.ts`, `src/turno/PantallaTurno.test.tsx`, `src/venta/carrito.test.ts`, `src/venta/idVenta.test.ts`, `src/venta/confirmar.test.ts`.
- Integración: `tests/integracion/catalogo.test.ts`.

### Para las partes siguientes

- **Lista de `150_permisos_funciones.test.sql` (prueba 5):** cada tarea que agregue una función `security definer` que la app llama suma su nombre al array. Las pruebas 1 a 4 de `150` y 1 y 2 de `140` ya la cubren sin cambios (search_path vacío, sin anon ni PUBLIC, sin parámetro de negocio, toma el negocio del token).
- **`anular_venta` (tarea 11):** `anulaciones.dispositivo_id` es obligatorio (tarea 3), así que la función necesita `p_dispositivo_id uuid` además de venta y motivo.
- **`ranking_sin_codigo` (tarea 11), conflicto a resolver con Felipe:** con `security invoker`, la policy `ventas_select` de la tarea 3 deja a la caja ver sólo ventas de hoy; el ranking pedido por la caja contaría sólo hoy, no 30 días. Opciones: que lo pida el jefe, o hacerla `security definer` filtrada por `negocio_actual()` (contradice el texto del spec sección 10).
- **Uso de `idVenta` (tarea 14):** al confirmar, `ids.idPara(claveContenido(pedido))`; tras `confirmada`, `ids.reiniciar()`; tras `precios_distintos`, `actualizarPrecios` cambia el contenido y el id sale nuevo solo (spec sección 9, caso 5). `LlamarRpc` se arma con `(f, a) => supabase.rpc(f, a)`.
- **Concurrencia real** (dos pestañas y doble clic a la vez): la prueba va en `tests/integracion/venta.test.ts` (tarea 14). Puede crear PC y turno con `registrar_dispositivo` y `abrir_turno`.
- `ventas_del_dia` del mapa viejo no se define acá: la caja lee ventas de hoy por RLS.
- La clase CSS `.turno` se usa en `PantallaTurno.tsx` y no está en `src/estilos.css`; es sólo estética.

## Verificaciones de la parte 2

Verificado contra la documentación oficial (2026-10-19): `sha256(bytea)` en `pg_catalog` (https://www.postgresql.org/docs/current/functions-binarystring.html); `.range()` de supabase-js inclusivo en los dos extremos (https://supabase.com/docs/reference/javascript/range); `distinct()` de Dexie para índices de varios valores (https://dexie.org/docs/Collection/Collection.distinct()); forma del error de PostgREST ante `raise` (https://docs.postgrest.org/en/stable/references/errors.html); paquete `fake-indexeddb` con `import 'fake-indexeddb/auto'` antes de Dexie (https://github.com/dumbmatter/fakeIndexedDB).

| # | Qué | Dónde se usa | Cómo verificar |
|---|---|---|---|
| V16 | Que el check de columna de la tarea 3 se llame `dispositivos_prefijo_check` (nombre automático `<tabla>_<columna>_check`). | Tarea 8, `20261019120500_registrar_dispositivo.sql` | `npx supabase db reset` falla en el `drop constraint` si no. Ver el nombre real con `select conname from pg_constraint where conrelid = 'public.dispositivos'::regclass;` y ajustar. |
| V17 | Que `fake-indexeddb/auto` funcione en Vitest con `// @vitest-environment node` (la doc sólo muestra Jest). | Tarea 7, `src/catalogo/cache.test.ts` | Si falla, sacar la línea del entorno (queda jsdom) o agregar `'fake-indexeddb/auto'` a `setupFiles` de `vitest.config.ts`. |
| V18 | Que el texto de `jsonb` sea el mismo entre el primer intento y el reintento de la misma venta (mismo servidor). Un cambio de versión mayor de Postgres entre los dos podría cambiar el formato. | Tarea 10, hash | Pruebas 2 y 23 de `080_confirmar_venta.test.sql`. Antes de un upgrade de Postgres, no dejar ventas en reintento. |
| V19 | Que el esquema `public` de Supabase (local y hospedado) no traiga funciones `security definer` propias de Supabase o de extensiones. | Tarea 10, `140` prueba 2 y `150` pruebas 4 y 5 | Si `150` lista nombres ajenos, revisarlos con `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef;` y, si son de Supabase, excluirlos por nombre en las consultas. |
| V20 | Que `perform 1 from ... for update` dentro de plpgsql bloquee la fila igual que `select ... for update` (serializa altas de PCs y aperturas de turno). | Tarea 8 | Prueba de concurrencia de `tests/integracion/venta.test.ts` (tarea 14): dos `registrar_dispositivo` a la vez con ids distintos reciben prefijos distintos. https://www.postgresql.org/docs/current/plpgsql-statements.html |

# Parte 3: Anulación, caja del día, pantalla de caja, F2 y pagos (tareas 11 a 14)

**Goal:** anulación, ranking de productos sin código y caja del día en la base; pantalla de caja con escáner, panel "Sin código (F2)", pagos combinados, confirmación con reintento y comprobante en pantalla.

**Architecture:** tres funciones nuevas de la base (`anular_venta`, `ranking_sin_codigo`, `caja_del_dia` y `ventas_del_dia`), todas `security definer` con `search_path` vacío, negocio del token y rol leído de `cuentas`. En el navegador, funciones puras para el escáner (detector, lectura doble, calibración) y componentes React que reciben sus servicios por props, así las pruebas no tocan Supabase ni Dexie. La caja arma la venta; el cobro se enchufa por una render prop (`cobro`) que la tarea 17 llena con `PantallaPagos`.

**Tech Stack:** Postgres + pgTAP (`supabase test db`), React, TypeScript, Vitest + Testing Library + user-event, Web Audio, supabase-js.

Esta parte es la **parte 3 de 5** (tareas 11 a 14). Usa los nombres de las partes 1 y 2 sin cambiarlos: helpers `public.negocio_actual()`, `public.rol_actual()`, `public.dia_operativo(timestamptz)`, `public.hoy()`; `src/venta/cobro.ts`, `src/venta/carrito.ts`, `src/venta/idVenta.ts`, `src/venta/confirmar.ts`, `src/catalogo/*`, `src/turno/*`, `tests/soporte/admin.ts`. Lo nuevo está en "Nombres nuevos que define la parte 3", al final.

Recordatorios de la parte 1 que valen acá:
- Cargar la skill `ponytail` antes de programar (una vez por sesión).
- Comandos para Git Bash desde `cd "/c/Users/felipe/Desktop/app negocios"`.
- Commits sólo con OK de Felipe; si no hay OK, se saltea el paso y se sigue.
- Supabase local corriendo (`npx supabase start`) para las pruebas pgTAP y de integración.

---

### Tarea 11: Anulación, ranking sin código y caja del día (SQL con pgTAP)

**Files:**
- Create: `supabase/migrations/20261019121100_anular_venta.sql`
- Create: `supabase/migrations/20261019121200_ranking_sin_codigo.sql`
- Create: `supabase/migrations/20261019121300_caja_del_dia.sql`
- Modify: `supabase/tests/database/150_permisos_funciones.test.sql` (prueba 5: lista de funciones de `authenticated`)
- Test: `supabase/tests/database/090_anular_venta.test.sql`, `supabase/tests/database/100_ranking_sin_codigo.test.sql`, `supabase/tests/database/110_caja_del_dia.test.sql`

Reglas (spec secciones 4, 7, 10 y 11):
- `anular_venta(p_venta_id uuid, p_dispositivo_id uuid, p_motivo text)`. Lleva dispositivo porque la fila de `anulaciones` del spec lo tiene y `anulaciones.dispositivo_id` es obligatorio (tarea 3). Guarda el dispositivo donde se anula, que puede no ser el de la venta.
- Orden dentro de `anular_venta`: 1) cuenta del negocio del token (`sin_cuenta`); 2) PC del negocio (`dispositivo_desconocido`); 3) venta del negocio, bloqueada con `for update` (`venta_desconocida`); 4) regla de día por rol: la caja sólo anula ventas cuyo día operativo es hoy (`fuera_de_dia`), el jefe cualquier día; 5) si ya hay anulación, la devuelve sin duplicar (`ya_existia: true`); 6) motivo recortado de 3 a 200 caracteres, como el check de la tarea 3 (`motivo_invalido`); 7) inserta la anulación y la fila de `historial` con tipo `anulacion`, entidad `ventas` y el motivo. Nunca borra ni edita la venta.
- La regla de día va antes de la idempotencia: una caja que intenta anular una venta de ayer recibe `fuera_de_dia` aunque el jefe ya la haya anulado. Así la caja no consulta nada de otros días.
- `caja_del_dia(p_fecha date)` y `ventas_del_dia(p_fecha date)`: caja sólo `p_fecha = hoy()` (si no, `fuera_de_dia`); jefe cualquier día; `p_fecha` nula, `fecha_invalida`. La anulación resta el día de `anulaciones.fecha`, no el de la venta. Los totales por medio son netos: ventas del día menos pagos de las ventas anuladas ese día. `importe` de `pagos_venta` ya es lo aplicado al total, así que el efectivo ya está neto de vuelto.
- `ventas_del_dia` devuelve número, prefijo, hora (HH24:MI en America/Argentina/Buenos_Aires), total, medios (`[{medio, importe}]`) y si está anulada. Sin datos de cliente: el fiado sólo muestra el monto.
- Todas: `security definer`, `set search_path = ''`, sin parámetro de negocio, `revoke` a `public`, `anon` y `authenticated`, `grant execute` a `authenticated`. Las pruebas genéricas `140_aislamiento` y `150_permisos_funciones` de la tarea 10 las cubren solas (sólo hay que sumar los nombres a la lista de `150`).

> **Nota: decisión que va para OK de Felipe (ranking_sin_codigo).** El spec (secciones 6, 10 y 13) pide `security invoker`. Con invoker, la policy `ventas_select` de la tarea 3 deja a la caja ver sólo las ventas de hoy, y el ranking que se pide al abrir el turno (lo abre la caja casi siempre) contaría sólo hoy, no 30 días: no sirve. Por eso acá va `security definer`, con estos límites: usa el `negocio_id` del token (nunca un parámetro), exige cuenta del negocio, y devuelve SOLO `producto_id`, `nombre` y `cantidad_ventas` (cantidad agregada); no devuelve ventas, montos, fechas ni clientes. La alternativa es dejarla `security invoker` y aceptar que, para la caja, el ranking sea sólo de hoy (o que sólo el jefe pueda pedirlo). Si Felipe aprueba definer, hay que cambiar en el spec: sección 6 ("El cálculo lo hace una función de sólo lectura con security invoker") por "con security definer, que devuelve sólo producto, nombre y cantidad de ventas del negocio del token"; sección 10, "Ranking de productos sin código", igual; sección 11, la prueba "El ranking con `security invoker` respeta RLS" por "El ranking no devuelve datos de otro negocio y sólo devuelve producto, nombre y cantidad"; y el supuesto correspondiente de la sección 13.

Más decisiones de esta tarea (también al final, en "Decisiones que requieren OK de Felipe"):
- El ranking incluye los productos sin código que no se vendieron en 30 días, con `cantidad_ventas = 0`, ordenados alfabéticamente después de los vendidos. Así la grilla F2 muestra todos los productos sin código y "lo que deja de venderse baja solo".
- No devuelve precio: el panel toma el precio de la caché (es el vigente). El tipo `ItemRanking` de `src/tipos.ts` (tarea 5) trae `precio`; la tarea 13 usa `FilaRanking = Omit<ItemRanking, 'precio'>`.
- Los totales de `caja_del_dia` pueden dar negativo en un medio si hoy se anula una venta de otro día que no se compensa con lo vendido hoy. Es la consecuencia directa de "la anulación resta el día en que se anula".

Códigos de error nuevos (`message` de PostgREST, `code` = `P0001`):

| Código | Lo lanza |
|---|---|
| `sin_cuenta` | las cuatro funciones |
| `dispositivo_desconocido` | `anular_venta` |
| `venta_desconocida` | `anular_venta` (venta inexistente o de otro negocio) |
| `fuera_de_dia` | `anular_venta`, `caja_del_dia`, `ventas_del_dia` (caja fuera de hoy) |
| `motivo_invalido` | `anular_venta` |
| `fecha_invalida` | `caja_del_dia`, `ventas_del_dia` |

- [ ] **Step 1: Escribir la prueba de anular_venta**

`supabase/tests/database/090_anular_venta.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'anu-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'anu-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'anu-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'anu-jefe-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'anu-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001b', 'b0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
-- v1 y v3 son de hoy; v2 es de ayer. bv1 es de B.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 900, repeat('a', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 900, repeat('b', 64)),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, now(), 900, repeat('c', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 700, repeat('d', 64));

-- 1 a 9: caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '  Se cobró dos veces  ') ->> 'ya_existia',
  'false', 'la caja anula una venta de hoy');
select is((select motivo from public.anulaciones where venta_id = 'a4000000-0000-0000-0000-000000000001'),
  'Se cobró dos veces', 'el motivo se guarda recortado');
select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    'Otro motivo') ->> 'ya_existia',
  'true', 'anular dos veces no falla: devuelve la anulación que ya existe');
select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    'Tercer intento') ->> 'anulacion_id',
  (select id::text from public.anulaciones where venta_id = 'a4000000-0000-0000-0000-000000000001'),
  'y es la misma anulación, no otra');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'Error de carga') $$,
  'P0001', 'fuera_de_dia', 'la caja no anula una venta de ayer');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'motivo_invalido', 'el motivo vacío se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', null) $$,
  'P0001', 'motivo_invalido', 'sin motivo no se anula');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000009',
    'a1000000-0000-0000-0000-000000000001', 'No existe') $$,
  'P0001', 'venta_desconocida', 'una venta inexistente se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'PC ajena') $$,
  'P0001', 'dispositivo_desconocido', 'no se anula desde una PC de otro negocio');

-- 10: jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.anular_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    'Devolución del cliente') ->> 'ya_existia',
  'false', 'el jefe anula una venta de ayer');

-- 11 a 13: caja de B (aislamiento, obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001', 'Curioso') $$,
  'P0001', 'venta_desconocida', 'B no recibe la anulación existente de una venta de A');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'Intruso') $$,
  'P0001', 'venta_desconocida', 'B no anula una venta de A');
select is((select count(*)::int from public.anulaciones), 0, 'B no ve anulaciones de A');

-- 14 y 15: jefe de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'Intruso jefe') $$,
  'P0001', 'venta_desconocida', 'el jefe de B, que anula cualquier día, tampoco anula ventas de A');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', 'Token trucado') $$,
  'P0001', 'sin_cuenta', 'una cuenta de B con negocio_id de A en el token no anula en A');

-- 16: authenticated sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', 'Sin cuenta') $$,
  'P0001', 'sin_cuenta', 'un usuario sin cuenta no anula');

-- 17 a 22: lo que quedó grabado, visto como postgres
reset role;
select results_eq(
  $$ select venta_id, cuenta_id, dispositivo_id from public.anulaciones order by venta_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid),
            ('a4000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-00000000001a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'una sola anulación por venta, con cuenta y dispositivo');
select results_eq(
  $$ select entidad_id, motivo, cuenta_id from public.historial where tipo = 'anulacion' order by entidad_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid, 'Se cobró dos veces'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid),
            ('a4000000-0000-0000-0000-000000000002'::uuid, 'Devolución del cliente'::text, 'c0000000-0000-0000-0000-00000000001a'::uuid) $$,
  'cada anulación queda en el historial con su motivo, sin duplicados por los reintentos');
select is((select count(*)::int from public.ventas where negocio_id = 'a0000000-0000-0000-0000-000000000000'), 3,
  'la anulación no borra ventas');
select is((select total from public.ventas where id = 'a4000000-0000-0000-0000-000000000002'), 900,
  'ni las modifica');
select ok(not has_function_privilege('anon', 'public.anular_venta(uuid, uuid, text)', 'execute'),
  'anon no ejecuta anular_venta');
select ok(has_function_privilege('authenticated', 'public.anular_venta(uuid, uuid, text)', 'execute'),
  'authenticated sí');

select * from finish();
rollback;
```

- [ ] **Step 2: Escribir la prueba de ranking_sin_codigo**

`supabase/tests/database/100_ranking_sin_codigo.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'rank-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'rank-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'rank-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'rank-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
insert into public.productos (id, negocio_id, nombre, precio, codigo_barras, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Bizcochos', 500, null, true),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Alfajor de maicena', 700, null, true),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'Chicle', 200, null, true),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'Pan', 300, null, false),
  ('a2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'Gaseosa', 1500, '7790005', true),
  ('a2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'Medialuna', 400, null, true),
  ('a2000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000000', 'Turron', 600, null, true),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochos B', 500, null, true);

-- s1 hoy; s2 ayer; s3 hace 10 días; s4 hace 29 días; s5 hace 31 días (no cuenta); s6 hoy, anulada; s7 de B.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 3200, repeat('1', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 5700, repeat('2', 64)),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, now() - interval '10 days', 1800, repeat('3', 64)),
  ('a4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 4, now() - interval '29 days', 500, repeat('4', 64)),
  ('a4000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 5, now() - interval '31 days', 1100, repeat('5', 64)),
  ('a4000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 6, now(), 800, repeat('6', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 500, repeat('7', 64));

insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario) values
  -- s1: 5 bizcochos (5 unidades, 1 venta) y 1 alfajor
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 5, 500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  -- s2: alfajor, chicle, gaseosa (con código) y pan (desactivado)
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 1, 200),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000005', 3, 1500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000004', 1, 300),
  -- s3: el alfajor en dos líneas de la misma venta (cuenta una vez) y 2 chicles
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 2, 200),
  -- s4: hace 29 días, cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 1, 500),
  -- s5: hace 31 días, no cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000001', 1, 500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000007', 1, 600),
  -- s6: anulada, no cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000007', 1, 600),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000003', 1, 200),
  -- s7: B
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 1, 500);

insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-000000000001', 'Prueba de ranking');

-- 1 a 7: caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Alfajor de maicena'::text, 3), ('Bizcochos'::text, 2), ('Chicle'::text, 2),
            ('Medialuna'::text, 0), ('Turron'::text, 0) $$,
  'más ventas primero; empates en orden alfabético; los no vendidos al final con 0');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Bizcochos'), 2,
  'cuenta ventas, no unidades: 6 unidades en 2 ventas (la de hace 31 días no cuenta)');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Alfajor de maicena'), 3,
  'el producto en dos líneas de una misma venta cuenta una sola venta');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Turron'), 0,
  'no cuentan la venta anulada ni la de hace 31 días');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Chicle'), 2,
  'la venta anulada no suma');
select is_empty(
  $$ select nombre from public.ranking_sin_codigo() where nombre in ('Pan', 'Gaseosa') $$,
  'excluye productos desactivados y productos con código de barras');
select is((select count(*)::int from public.ventas), 2,
  'por RLS la caja ve sólo las 2 ventas de hoy: por eso el ranking de 30 días es security definer');

-- 8: jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Alfajor de maicena'::text, 3), ('Bizcochos'::text, 2), ('Chicle'::text, 2),
            ('Medialuna'::text, 0), ('Turron'::text, 0) $$,
  'el jefe ve el mismo ranking');

-- 9: caja de B (aislamiento)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Bizcochos B'::text, 1) $$,
  'B ve sólo su ranking: ni productos ni ventas de A');

-- 10: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select * from public.ranking_sin_codigo() $$, 'P0001', 'sin_cuenta', 'sin cuenta no hay ranking');

-- 11 a 13: forma y permisos
reset role;
select is((select proargnames from pg_proc where oid = 'public.ranking_sin_codigo()'::regprocedure),
  array['producto_id', 'nombre', 'cantidad_ventas'],
  'no recibe parámetros y devuelve sólo producto, nombre y cantidad de ventas');
select ok((select prosecdef from pg_proc where oid = 'public.ranking_sin_codigo()'::regprocedure),
  'security definer (decisión que va para OK de Felipe)');
select ok(not has_function_privilege('anon', 'public.ranking_sin_codigo()', 'execute'), 'anon no lo ejecuta');

select * from finish();
rollback;
```

- [ ] **Step 3: Escribir la prueba de caja_del_dia y ventas_del_dia**

`supabase/tests/database/110_caja_del_dia.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'cdd-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'cdd-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'cdd-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'cdd-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
-- Dos turnos en A: uno ya cerrado y uno abierto. La caja del día suma los dos.
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id, apertura, cierre, cierre_cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', now() - interval '3 hours', now() - interval '2 hours', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to');

-- Hoy: h1 (efectivo 600 + tarjeta 400), h2 (transferencia 2000, turno cerrado), h3 (fiado 1000), h4 (efectivo 1000, se anula hoy).
-- Ayer: y1 (efectivo 500, el jefe la anula hoy), y2 (tarjeta 500). B: hb (efectivo 7000).
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 1, now(), 1000, repeat('1', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now(), 2000, repeat('2', 64)),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 3, now(), 1000, repeat('3', 64)),
  ('a4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 4, now(), 1000, repeat('4', 64)),
  ('a4000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 5, now() - interval '1 day', 500, repeat('5', 64)),
  ('a4000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 6, now() - interval '1 day', 500, repeat('6', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 7000, repeat('7', 64));

insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'efectivo', 600, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'tarjeta', 400, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'transferencia', 2000, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'fiado', 1000, 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000004', 'efectivo', 1000, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000005', 'efectivo', 500, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'tarjeta', 500, null),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'efectivo', 7000, null);

-- 1: la caja anula h4 (de hoy)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.anular_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    'Cliente se arrepintió') ->> 'ya_existia', 'false', 'la caja anula una venta de hoy');

-- 2 a 8: el jefe anula y1 (de ayer) hoy y mira hoy y ayer
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.anular_venta('a4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
    'Devolución') ->> 'ya_existia', 'false', 'el jefe anula hoy una venta de ayer');
select is(public.caja_del_dia(public.hoy()) - 'anulaciones' - 'fecha',
  '{"efectivo": 100, "transferencia": 2000, "tarjeta": 400, "cobrado": 2500, "fiado": 1000}'::jsonb,
  'hoy: total por medio con las dos anulaciones de hoy restadas, también la de la venta de ayer');
select is(public.caja_del_dia(public.hoy()) -> 'anulaciones' - 'detalle',
  '{"cantidad": 2, "efectivo": 1500, "transferencia": 0, "tarjeta": 0, "fiado": 0, "total": 1500}'::jsonb,
  'las anulaciones de hoy aparecen aparte');
select is(jsonb_array_length(public.caja_del_dia(public.hoy()) -> 'anulaciones' -> 'detalle'), 2,
  'con el detalle para revisarlas');
select is(public.caja_del_dia(public.hoy() - 1) - 'anulaciones' - 'fecha',
  '{"efectivo": 500, "transferencia": 0, "tarjeta": 500, "cobrado": 1000, "fiado": 0}'::jsonb,
  'ayer: la anulación hecha hoy no resta en el día de la venta');
select is(public.caja_del_dia(public.hoy() - 1) -> 'anulaciones' ->> 'cantidad', '0',
  'ayer no tuvo anulaciones');
select results_eq(
  $$ select numero, anulada from public.ventas_del_dia(public.hoy() - 1) order by numero $$,
  $$ values (5, true), (6, false) $$,
  'el jefe ve las ventas de ayer, con la anulada marcada');

-- 9 a 16: caja de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.caja_del_dia(public.hoy() - 1) $$, 'P0001', 'fuera_de_dia',
  'la caja no ve la caja de ayer');
select throws_ok($$ select * from public.ventas_del_dia(public.hoy() - 1) $$, 'P0001', 'fuera_de_dia',
  'la caja no ve las ventas de ayer');
select is(public.caja_del_dia(public.hoy()) ->> 'cobrado', '2500',
  'la caja ve la caja de hoy, que suma todos los turnos del día');
select results_eq(
  $$ select numero, total, anulada from public.ventas_del_dia(public.hoy()) order by numero $$,
  $$ values (1, 1000, false), (2, 2000, false), (3, 1000, false), (4, 1000, true) $$,
  'la caja ve las ventas de hoy, con la anulada marcada');
select is((select medios from public.ventas_del_dia(public.hoy()) where numero = 1),
  '[{"medio": "efectivo", "importe": 600}, {"medio": "tarjeta", "importe": 400}]'::jsonb,
  'cada venta muestra sus medios');
select is((select medios from public.ventas_del_dia(public.hoy()) where numero = 3),
  '[{"medio": "fiado", "importe": 1000}]'::jsonb,
  'el fiado sólo muestra el monto, sin datos del cliente');
select ok((select bool_and(hora ~ '^[0-9]{2}:[0-9]{2}$') from public.ventas_del_dia(public.hoy())),
  'cada venta trae su hora');
select throws_ok($$ select public.caja_del_dia(null) $$, 'P0001', 'fecha_invalida', 'sin fecha no hay caja');

-- 17 a 19: caja de B (aislamiento)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select is(public.caja_del_dia(public.hoy()) - 'anulaciones' - 'fecha',
  '{"efectivo": 7000, "transferencia": 0, "tarjeta": 0, "cobrado": 7000, "fiado": 0}'::jsonb,
  'B ve sólo su caja');
select results_eq($$ select numero from public.ventas_del_dia(public.hoy()) $$, $$ values (1) $$,
  'B ve sólo sus ventas');
select is(public.caja_del_dia(public.hoy()) -> 'anulaciones' ->> 'cantidad', '0', 'B no ve anulaciones de A');

-- 20 y 21: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.caja_del_dia(public.hoy()) $$, 'P0001', 'sin_cuenta', 'sin cuenta no hay caja del día');
select throws_ok($$ select * from public.ventas_del_dia(public.hoy()) $$, 'P0001', 'sin_cuenta', 'sin cuenta no hay ventas del día');

-- 22 a 25: forma y permisos
reset role;
select ok(not has_function_privilege('anon', 'public.caja_del_dia(date)', 'execute'), 'anon no ejecuta caja_del_dia');
select ok(not has_function_privilege('anon', 'public.ventas_del_dia(date)', 'execute'), 'anon no ejecuta ventas_del_dia');
select ok((select bool_and(prosecdef) from pg_proc
           where oid in ('public.caja_del_dia(date)'::regprocedure, 'public.ventas_del_dia(date)'::regprocedure)),
  'las dos son security definer: la caja del día resta ventas de otros días que la caja no ve por RLS');
select is((select proargnames from pg_proc where oid = 'public.ventas_del_dia(date)'::regprocedure),
  array['p_fecha', 'venta_id', 'prefijo', 'numero', 'hora', 'total', 'medios', 'anulada'],
  'ventas_del_dia no devuelve columnas de cliente');

select * from finish();
rollback;
```

- [ ] **Step 4: Sumar las funciones nuevas a la lista de permisos**

En `supabase/tests/database/150_permisos_funciones.test.sql` (tarea 10), en la prueba 5, reemplazar la línea:
```sql
  array['abrir_turno', 'alta_cliente', 'cerrar_turno', 'confirmar_venta', 'registrar_dispositivo'],
```
por:
```sql
  array['abrir_turno', 'alta_cliente', 'anular_venta', 'caja_del_dia', 'cerrar_turno', 'confirmar_venta',
        'ranking_sin_codigo', 'registrar_dispositivo', 'ventas_del_dia'],
```
El `plan(7)` de ese archivo no cambia.

- [ ] **Step 5: Correr las pruebas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `090` con `function public.anular_venta(unknown, unknown, unknown) does not exist`, en `100` con `function public.ranking_sin_codigo() does not exist`, en `110` con `function public.anular_venta(unknown, unknown, unknown) does not exist` y en `150` en la prueba 5 (faltan cuatro nombres en el conjunto). El resto sigue pasando.

- [ ] **Step 6: Escribir anular_venta**

`supabase/migrations/20261019121100_anular_venta.sql`:
```sql
-- Anulación de venta completa (spec sección 7). Es un movimiento nuevo: la venta no se toca ni se borra.
-- Caja: sólo ventas cuyo día operativo es hoy. Jefe: cualquier día. La base chequea rol y día.
-- Una sola anulación por venta: anular dos veces devuelve la que ya existe. Queda en historial con su motivo.
-- security definer: saltea RLS, por eso todo se filtra por el negocio del token (prueba 090 y 140).
create or replace function public.anular_venta(p_venta_id uuid, p_dispositivo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_venta public.ventas%rowtype;
  v_anulacion public.anulaciones%rowtype;
begin
  -- 1. Cuenta del negocio del token.
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- 2. La PC desde donde se anula es del negocio.
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- 3. La venta es del negocio. El bloqueo serializa dos anulaciones a la vez de la misma venta.
  --    Un bloqueo de fila no dispara el trigger que impide editar ventas (V24).
  select * into v_venta
  from public.ventas v
  where v.id = p_venta_id and v.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'venta_desconocida' using errcode = 'P0001';
  end if;

  -- 4. Regla de día por rol, antes de mirar si ya está anulada: la caja no consulta otros días.
  if v_rol = 'caja' and public.dia_operativo(v_venta.fecha) <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  -- 5. Idempotente: si ya está anulada, devuelve esa anulación.
  select * into v_anulacion from public.anulaciones a where a.venta_id = v_venta.id;
  if found then
    return jsonb_build_object(
      'anulacion_id', v_anulacion.id,
      'venta_id', v_anulacion.venta_id,
      'fecha', v_anulacion.fecha,
      'motivo', v_anulacion.motivo,
      'ya_existia', true
    );
  end if;

  -- 6. Motivo obligatorio (mismo rango que el check de anulaciones.motivo, tarea 3).
  if char_length(v_motivo) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;

  -- 7. Movimiento nuevo y su registro en el historial.
  insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, motivo)
  values (v_negocio, v_venta.id, auth.uid(), p_dispositivo_id, v_motivo)
  returning * into v_anulacion;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id,
                                valor_anterior, valor_nuevo, motivo)
  values (v_negocio, 'anulacion', auth.uid(), p_dispositivo_id, 'ventas', v_venta.id,
          jsonb_build_object('total', v_venta.total, 'fecha_venta', v_venta.fecha),
          jsonb_build_object('anulacion_id', v_anulacion.id),
          v_motivo);

  return jsonb_build_object(
    'anulacion_id', v_anulacion.id,
    'venta_id', v_anulacion.venta_id,
    'fecha', v_anulacion.fecha,
    'motivo', v_anulacion.motivo,
    'ya_existia', false
  );
end;
$$;

revoke all on function public.anular_venta(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_venta(uuid, uuid, text) to authenticated;
```

- [ ] **Step 7: Escribir ranking_sin_codigo**

`supabase/migrations/20261019121200_ranking_sin_codigo.sql`:
```sql
-- Ranking de productos sin código para el panel F2 (spec sección 6).
-- Cuenta ventas no anuladas de los últimos 30 días en las que aparece cada producto (ventas, no unidades).
-- Excluye desactivados y productos con código. Los no vendidos aparecen con 0. Empates: alfabético.
-- DECISIÓN PARA OK DE FELIPE: security definer (el spec dice invoker). Con invoker, la RLS deja a la caja
-- ver sólo las ventas de hoy y el ranking de 30 días no serviría. Límites: negocio del token, nunca un
-- parámetro; sólo devuelve producto_id, nombre y la cantidad agregada; nada de ventas, montos ni clientes.
create or replace function public.ranking_sin_codigo()
returns table (producto_id uuid, nombre text, cantidad_ventas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_negocio uuid := public.negocio_actual();
begin
  if public.rol_actual() is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  return query
  with vendidas as (
    select l.producto_id as pid, count(distinct v.id) as n
    from public.ventas v
    join public.lineas_venta l on l.venta_id = v.id and l.negocio_id = v_negocio
    where v.negocio_id = v_negocio
      and v.fecha >= now() - interval '30 days'
      and not exists (select 1 from public.anulaciones a where a.venta_id = v.id)
    group by l.producto_id
  )
  select p.id, p.nombre, coalesce(x.n, 0)::integer
  from public.productos p
  left join vendidas x on x.pid = p.id
  where p.negocio_id = v_negocio and p.activo and p.codigo_barras is null
  order by coalesce(x.n, 0) desc, lower(p.nombre), p.id;
end;
$$;

revoke all on function public.ranking_sin_codigo() from public, anon, authenticated;
grant execute on function public.ranking_sin_codigo() to authenticated;
```

- [ ] **Step 8: Escribir caja_del_dia y ventas_del_dia**

`supabase/migrations/20261019121300_caja_del_dia.sql`:
```sql
-- Caja del día (spec sección 7): total cobrado por medio, fiado aparte, anulaciones aparte.
-- La anulación resta el día en que se anula (anulaciones.fecha), aunque la venta sea de otro día.
-- Caja: sólo hoy. Jefe: cualquier día. Día operativo en America/Argentina/Buenos_Aires.
-- security definer: la caja no ve por RLS las ventas viejas que se anulan hoy (nota de la tarea 3).
create or replace function public.caja_del_dia(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_desde timestamptz;
  v_hasta timestamptz;
  v_totales jsonb;
  v_anulaciones jsonb;
  v_detalle jsonb;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if v_rol = 'caja' and p_fecha <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  -- Medianoche local del día pedido y del siguiente (V26). Rango para usar los índices por fecha.
  v_desde := p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_hasta := (p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  -- Totales netos: pagos de las ventas del día menos pagos de las ventas anuladas ese día.
  with movimientos as (
    select pv.medio, pv.importe
    from public.ventas v
    join public.pagos_venta pv on pv.venta_id = v.id and pv.negocio_id = v_negocio
    where v.negocio_id = v_negocio and v.fecha >= v_desde and v.fecha < v_hasta
    union all
    select pv.medio, -pv.importe
    from public.anulaciones a
    join public.pagos_venta pv on pv.venta_id = a.venta_id and pv.negocio_id = v_negocio
    where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta
  )
  select jsonb_build_object(
    'efectivo', coalesce(sum(m.importe) filter (where m.medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(m.importe) filter (where m.medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(m.importe) filter (where m.medio = 'tarjeta'), 0),
    'cobrado', coalesce(sum(m.importe) filter (where m.medio <> 'fiado'), 0),
    'fiado', coalesce(sum(m.importe) filter (where m.medio = 'fiado'), 0)
  )
  into v_totales
  from movimientos m;

  -- Anulaciones del día, aparte, para revisarlas.
  select jsonb_build_object(
    'cantidad', count(distinct a.id),
    'efectivo', coalesce(sum(pv.importe) filter (where pv.medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(pv.importe) filter (where pv.medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(pv.importe) filter (where pv.medio = 'tarjeta'), 0),
    'fiado', coalesce(sum(pv.importe) filter (where pv.medio = 'fiado'), 0),
    'total', coalesce(sum(pv.importe), 0)
  )
  into v_anulaciones
  from public.anulaciones a
  join public.pagos_venta pv on pv.venta_id = a.venta_id and pv.negocio_id = v_negocio
  where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta;

  select coalesce(jsonb_agg(jsonb_build_object(
           'venta_id', v.id,
           'prefijo', d.prefijo,
           'numero', v.numero,
           'fecha_venta', v.fecha,
           'fecha', a.fecha,
           'total', v.total,
           'motivo', a.motivo
         ) order by a.fecha, v.numero), '[]'::jsonb)
  into v_detalle
  from public.anulaciones a
  join public.ventas v on v.id = a.venta_id and v.negocio_id = v_negocio
  join public.dispositivos d on d.id = v.dispositivo_id
  where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta;

  return v_totales || jsonb_build_object(
    'fecha', p_fecha,
    'anulaciones', v_anulaciones || jsonb_build_object('detalle', v_detalle)
  );
end;
$$;

-- Lista de ventas del día: número, hora, total, medios y si está anulada. Sin datos de cliente.
create or replace function public.ventas_del_dia(p_fecha date)
returns table (venta_id uuid, prefijo text, numero integer, hora text, total integer, medios jsonb, anulada boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if v_rol = 'caja' and p_fecha <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  v_desde := p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_hasta := (p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  select v.id,
         d.prefijo,
         v.numero,
         to_char(v.fecha at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
         v.total,
         (select coalesce(jsonb_agg(jsonb_build_object('medio', pv.medio, 'importe', pv.importe) order by pv.medio), '[]'::jsonb)
          from public.pagos_venta pv
          where pv.venta_id = v.id and pv.negocio_id = v_negocio),
         exists (select 1 from public.anulaciones a where a.venta_id = v.id)
  from public.ventas v
  join public.dispositivos d on d.id = v.dispositivo_id
  where v.negocio_id = v_negocio and v.fecha >= v_desde and v.fecha < v_hasta
  order by v.fecha desc, d.prefijo, v.numero desc;
end;
$$;

revoke all on function public.caja_del_dia(date), public.ventas_del_dia(date) from public, anon, authenticated;
grant execute on function public.caja_del_dia(date), public.ventas_del_dia(date) to authenticated;
```

- [ ] **Step 9: Aplicar y correr todas las pruebas de la base**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Finished supabase db reset`; después `All tests successful.` y `Result: PASS`. Si falla `090` en "la caja anula una venta de hoy" con un error del trigger `ventas_solo_agrega`, ver V24. Si `100` o `110` fallan con `column reference ... is ambiguous`, ver V25. Si `110` da los totales de hoy en cero, ver V26.

- [ ] **Step 10: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat(db): anulación por rol y día, ranking sin código y caja del día" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 12: Pantalla de caja y escáner (React, Vitest, Testing Library)

**Files:**
- Create: `src/escaner/umbrales.ts`, `src/escaner/detector.ts`, `src/escaner/dobleLectura.ts`, `src/escaner/calibrar.ts`, `src/escaner/Calibracion.tsx`
- Create: `src/ui/pitido.ts`
- Create: `src/caja/catalogoCaja.ts`, `src/caja/CampoEscaneo.tsx`, `src/caja/ListaSugerencias.tsx`, `src/caja/LineasVenta.tsx`, `src/caja/PantallaCaja.tsx`
- Create: `src/test/caja.tsx` (ayudas de prueba compartidas con la tarea 13; no es un archivo de prueba)
- Modify: `src/estilos.css` (agregar al final)
- Test: `src/escaner/detector.test.ts`, `src/escaner/dobleLectura.test.ts`, `src/escaner/calibrar.test.ts`, `src/ui/pitido.test.ts`, `src/caja/catalogoCaja.test.ts`, `src/caja/PantallaCaja.test.tsx`

Reglas (spec sección 6 y sección 9, casos 4 y 10):
- Campo único "Escanear o buscar", siempre con foco. Los botones de la caja tienen `tabIndex={-1}` y `onMouseDown` con `preventDefault` para no robar el foco; además, después de cada acción la pantalla llama a `focus()` del campo.
- Escaneo = racha de caracteres rápidos que termina en Enter (`detectarEscaneo`). Busca el código exacto, tenga letras o no. Si existe y está activo, lo agrega; si no existe, avisa "no encontrado" y no agrega (el alta rápida es la tarea 15); si está desactivado, avisa (reactivar es la tarea 15). El campo se limpia siempre.
- Lo tipeado a mano va a la búsqueda por nombre (`buscarEnCache`, tarea 7): lista de hasta 8. Flechas mueven la selección; Enter elige sólo lo seleccionado con flechas; Enter sin selección no hace nada. Un clic en una sugerencia la agrega.
- Escaneo con la lista abierta: gana el código. La racha rápida se separa de lo tipeado antes (`desde`), la lista se cierra y se agrega el producto.
- Escaneo con el cobro abierto: se ignora y avisa (`AVISO_ESCANEO_EN_COBRO`). Las cantidades tampoco se tocan con el cobro abierto.
- Lectura doble: el mismo código en menos de `dobleLecturaMs` (150) se ignora; se compara contra la lectura anterior, aunque esa también se haya ignorado.
- `+` y `−` por línea; con `−` en 1 la línea se quita (`carritoReducer`, tarea 10). La línea recién agregada se resalta y suena un pitido.
- Sin turno abierto la caja no vende: muestra `PedirApertura` (tarea 8) y, al abrir, la caja aparece con el carrito como estaba.
- El carrito y el id de venta son los de la tarea 10 (`carritoReducer`, `crearIdVenta`). El generador de id vive en la caja, no en el cobro: si el cajero cierra y reabre el cobro con el mismo contenido, el reintento usa el mismo id.
- El cobro se enchufa por la prop `cobro(sesion)`. La tarea 17 la llena con `PantallaPagos` (tarea 14).
- Umbrales iniciales (SUPUESTO, se miden con el escáner real en `Calibracion`): racha de caracteres separados por 50 ms o menos, al menos 4 caracteres, lectura doble 150 ms. La calibración no guarda nada en el navegador (en `localStorage` sólo van el id de la PC y la sesión de Auth): muestra el valor sugerido para copiarlo a mano en `umbrales.ts`.

- [ ] **Step 1: Escribir las pruebas puras del escáner**

`src/escaner/detector.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectarEscaneo, type Pulsacion } from './detector'
import { UMBRALES } from './umbrales'

/** Pulsaciones de `texto` desde `inicio`, separadas por `paso` ms. */
function teclas(texto: string, inicio: number, paso: number): Pulsacion[] {
  return [...texto].map((tecla, i) => ({ tecla, t: inicio + i * paso }))
}

/** Momento del Enter: `espera` ms después de la última pulsación. */
const enter = (p: Pulsacion[], espera: number) => p[p.length - 1].t + espera

const lento = teclas('alfajor', 0, 200)
const rapido = teclas('7790001', 0, 5)
const conLetras = teclas('ABC-123', 0, 5)
const mezcla = [...teclas('co', 0, 200), ...teclas('7790001', 1200, 5)]
const corto = teclas('779', 0, 5)
const enElLimite = teclas('7790001', 0, 50)
const pasado = teclas('7790001', 0, 51)

describe('detectarEscaneo', () => {
  it.each([
    { caso: 'tipeo lento', pulsaciones: lento, tEnter: enter(lento, 200), esperado: null },
    { caso: 'escaneo rápido con Enter', pulsaciones: rapido, tEnter: enter(rapido, 5), esperado: { codigo: '7790001', desde: 0 } },
    { caso: 'escaneo con letras', pulsaciones: conLetras, tEnter: enter(conLetras, 5), esperado: { codigo: 'ABC-123', desde: 0 } },
    { caso: 'tipeo y después escaneo: gana el código', pulsaciones: mezcla, tEnter: enter(mezcla, 5), esperado: { codigo: '7790001', desde: 2 } },
    { caso: 'racha rápida más corta que el mínimo', pulsaciones: corto, tEnter: enter(corto, 5), esperado: null },
    { caso: 'caracteres rápidos pero Enter tardío', pulsaciones: rapido, tEnter: enter(rapido, 300), esperado: null },
    { caso: 'Enter solo', pulsaciones: [], tEnter: 100, esperado: null },
    { caso: '50 ms entre caracteres todavía es escaneo', pulsaciones: enElLimite, tEnter: enter(enElLimite, 50), esperado: { codigo: '7790001', desde: 0 } },
    { caso: '51 ms entre caracteres ya es tipeo', pulsaciones: pasado, tEnter: enter(pasado, 51), esperado: null },
  ])('$caso', ({ pulsaciones, tEnter, esperado }) => {
    expect(detectarEscaneo(pulsaciones, tEnter, UMBRALES)).toEqual(esperado)
  })
})
```

`src/escaner/dobleLectura.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { crearFiltroDobleLectura, esDobleLectura } from './dobleLectura'

describe('esDobleLectura', () => {
  it.each([
    { caso: 'mismo código a 149 ms: se ignora', t: 149, codigo: '7790001', esperado: true },
    { caso: 'mismo código a 150 ms: vale', t: 150, codigo: '7790001', esperado: false },
    { caso: 'mismo código a 151 ms: vale', t: 151, codigo: '7790001', esperado: false },
    { caso: 'otro código a 10 ms: vale', t: 10, codigo: '7790002', esperado: false },
  ])('$caso', ({ t, codigo, esperado }) => {
    expect(esDobleLectura({ codigo: '7790001', t: 0 }, { codigo, t })).toBe(esperado)
  })

  it('sin lectura anterior nunca es doble', () => {
    expect(esDobleLectura(null, { codigo: '7790001', t: 0 })).toBe(false)
  })
})

describe('crearFiltroDobleLectura', () => {
  it('acepta la primera lectura y descarta la repetida a 149 ms', () => {
    const filtro = crearFiltroDobleLectura()
    expect(filtro.aceptar({ codigo: '7790001', t: 1000 })).toBe(true)
    expect(filtro.aceptar({ codigo: '7790001', t: 1149 })).toBe(false)
  })

  it('a 151 ms acepta las dos lecturas', () => {
    const filtro = crearFiltroDobleLectura()
    expect(filtro.aceptar({ codigo: '7790001', t: 1000 })).toBe(true)
    expect(filtro.aceptar({ codigo: '7790001', t: 1151 })).toBe(true)
  })
})
```

`src/escaner/calibrar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { intervalos, umbralSugerido } from './calibrar'

describe('calibración del escáner', () => {
  it('intervalos entre pulsaciones consecutivas', () => {
    expect(intervalos([0, 5, 12, 20])).toEqual([5, 7, 8])
  })

  it('sugiere el máximo medido más la mitad, redondeado hacia arriba', () => {
    expect(umbralSugerido([5, 7, 8])).toEqual({ minimo: 5, maximo: 8, sugerido: 12 })
    expect(umbralSugerido([10.2, 33])).toEqual({ minimo: 10.2, maximo: 33, sugerido: 50 })
  })

  it('sin mediciones no sugiere nada', () => {
    expect(umbralSugerido([])).toBeNull()
  })
})
```

`src/ui/pitido.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pitido', () => {
  it('sin Web Audio no rompe la venta', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { pitido } = await import('./pitido')
    expect(() => pitido()).not.toThrow()
  })

  it('suena un tono corto', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const oscilador = { type: '', frequency: { value: 0 }, connect: vi.fn((n: unknown) => n), start, stop }
    const volumen = { gain: { value: 0 }, connect: vi.fn((n: unknown) => n) }
    class AudioContextFalso {
      state = 'running'
      currentTime = 2
      destination = {}
      createOscillator = () => oscilador
      createGain = () => volumen
      resume = vi.fn(async () => undefined)
    }
    vi.stubGlobal('AudioContext', AudioContextFalso)
    const { pitido } = await import('./pitido')
    pitido()
    expect(oscilador.frequency.value).toBe(1000)
    expect(start).toHaveBeenCalledWith(2)
    expect(stop.mock.calls[0][0]).toBeCloseTo(2.08)
  })
})
```

- [ ] **Step 2: Correrlas y ver que fallan**

Run: `npx vitest run src/escaner src/ui`
Expected: FAIL: `Failed to resolve import "./detector"`, `"./dobleLectura"`, `"./calibrar"` y `"./pitido"`.

- [ ] **Step 3: Implementar umbrales, detector, lectura doble, calibración y pitido**

`src/escaner/umbrales.ts`:
```ts
/**
 * Umbrales del escáner (spec sección 9, caso 4). SUPUESTO: valores iniciales hasta medirlos con el
 * escáner real en la pantalla de calibración (Calibracion.tsx). Para cambiarlos, editar este archivo:
 * no se guardan en el navegador.
 */
export interface Umbrales {
  /** Máximo entre dos caracteres seguidos (y entre el último y el Enter) para que cuente como escaneo. */
  intervaloEscaneoMs: number
  /** Mínimo de caracteres de un código escaneado. */
  minimoCaracteres: number
  /** La misma lectura antes de este tiempo se ignora (lectura doble). */
  dobleLecturaMs: number
}

export const UMBRALES: Readonly<Umbrales> = {
  intervaloEscaneoMs: 50,
  minimoCaracteres: 4,
  dobleLecturaMs: 150,
}
```

`src/escaner/detector.ts`:
```ts
import type { Umbrales } from './umbrales'

export interface Pulsacion {
  tecla: string
  t: number
}

export interface Escaneo {
  codigo: string
  /** Índice de la primera pulsación del escaneo: lo anterior fue tipeado a mano. */
  desde: number
}

/**
 * Escaneo contra tipeo (spec sección 6). Desde el Enter hacia atrás, junta la racha de pulsaciones
 * separadas por no más de intervaloEscaneoMs. Si la racha tiene al menos minimoCaracteres, es un
 * escaneo y el código es la racha, tenga letras o no. Si no, es tipeo y devuelve null.
 */
export function detectarEscaneo(
  pulsaciones: readonly Pulsacion[],
  tEnter: number,
  u: Pick<Umbrales, 'intervaloEscaneoMs' | 'minimoCaracteres'>,
): Escaneo | null {
  let desde = pulsaciones.length
  let siguiente = tEnter
  while (desde > 0 && siguiente - pulsaciones[desde - 1].t <= u.intervaloEscaneoMs) {
    desde -= 1
    siguiente = pulsaciones[desde].t
  }
  if (pulsaciones.length - desde < u.minimoCaracteres) return null
  return {
    codigo: pulsaciones
      .slice(desde)
      .map((p) => p.tecla)
      .join(''),
    desde,
  }
}
```

`src/escaner/dobleLectura.ts`:
```ts
import { UMBRALES } from './umbrales'

export interface Lectura {
  codigo: string
  t: number
}

export interface FiltroDobleLectura {
  /** true = lectura válida; false = lectura doble, se ignora. */
  aceptar(lectura: Lectura): boolean
}

/** El mismo código antes de umbralMs es lectura doble (spec sección 9, caso 4). */
export function esDobleLectura(anterior: Lectura | null, actual: Lectura, umbralMs: number = UMBRALES.dobleLecturaMs): boolean {
  return anterior !== null && anterior.codigo === actual.codigo && actual.t - anterior.t < umbralMs
}

/**
 * Aplica a la lectura del escáner, no a la venta: para más unidades se usa el +.
 * Compara contra la lectura anterior, aunque esa también se haya ignorado.
 */
export function crearFiltroDobleLectura(umbralMs: number = UMBRALES.dobleLecturaMs): FiltroDobleLectura {
  let anterior: Lectura | null = null
  return {
    aceptar(lectura) {
      const doble = esDobleLectura(anterior, lectura, umbralMs)
      anterior = lectura
      return !doble
    },
  }
}
```

`src/escaner/calibrar.ts`:
```ts
/** Intervalos entre pulsaciones consecutivas de una lectura (ms). */
export function intervalos(tiempos: readonly number[]): number[] {
  return tiempos.slice(1).map((t, i) => t - tiempos[i])
}

export interface ResumenCalibracion {
  minimo: number
  maximo: number
  /** Valor para intervaloEscaneoMs en umbrales.ts. */
  sugerido: number
}

/** Máximo medido con el escáner real más la mitad de margen, redondeado hacia arriba. null sin datos. */
export function umbralSugerido(intervalosMs: readonly number[]): ResumenCalibracion | null {
  if (intervalosMs.length === 0) return null
  const minimo = Math.min(...intervalosMs)
  const maximo = Math.max(...intervalosMs)
  return { minimo, maximo, sugerido: Math.ceil(maximo * 1.5) }
}
```

`src/ui/pitido.ts`:
```ts
let contexto: AudioContext | null = null

/**
 * Tono corto al agregar un producto (spec sección 6). El AudioContext se crea en la primera llamada,
 * que llega por una tecla o un clic (activación del usuario, V23). Sin Web Audio la venta sigue igual:
 * el resaltado de la línea también avisa.
 */
export function pitido(frecuenciaHz = 1000, duracionS = 0.08): void {
  try {
    contexto ??= new AudioContext()
    if (contexto.state === 'suspended') contexto.resume().catch(() => undefined)
    const oscilador = contexto.createOscillator()
    const volumen = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.value = frecuenciaHz
    volumen.gain.value = 0.15
    oscilador.connect(volumen).connect(contexto.destination)
    const inicio = contexto.currentTime
    oscilador.start(inicio)
    oscilador.stop(inicio + duracionS)
  } catch {
    // Sin audio: no hay pitido.
  }
}
```

- [ ] **Step 4: Correr las pruebas puras**

Run: `npx vitest run src/escaner src/ui`
Expected: `Test Files  4 passed (4)` y `Tests  21 passed (21)` (9 de detector, 7 de lectura doble, 3 de calibración, 2 de pitido).

- [ ] **Step 5: Escribir la pantalla de calibración**

`src/escaner/Calibracion.tsx`:
```tsx
import { useRef, useState, type KeyboardEvent } from 'react'
import { intervalos, umbralSugerido } from './calibrar'
import { UMBRALES } from './umbrales'

export const LECTURAS_CALIBRACION = 10

/**
 * El cajero pasa 10 códigos con el escáner real y ve el intervalo mínimo y máximo entre caracteres.
 * No guarda nada en el navegador: el valor sugerido se copia a mano en src/escaner/umbrales.ts.
 */
export function Calibracion({ ahora = () => performance.now() }: { ahora?: () => number }) {
  const tiempos = useRef<number[]>([])
  const [valor, setValor] = useState('')
  const [medidos, setMedidos] = useState<number[]>([])
  const [lecturas, setLecturas] = useState(0)
  const completa = lecturas >= LECTURAS_CALIBRACION
  const resumen = completa ? umbralSugerido(medidos) : null

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    if (completa) return
    if (e.key === 'Enter') {
      e.preventDefault()
      // El Enter cuenta: el detector también exige que llegue rápido después del último carácter.
      const lectura = intervalos([...tiempos.current, ahora()])
      tiempos.current = []
      setValor('')
      if (lectura.length === 0) return
      setMedidos((m) => [...m, ...lectura])
      setLecturas((n) => n + 1)
      return
    }
    if (e.key.length === 1) tiempos.current.push(ahora())
  }

  function reiniciar() {
    tiempos.current = []
    setMedidos([])
    setLecturas(0)
    setValor('')
  }

  return (
    <section className="calibracion">
      <h2>Calibrar el escáner</h2>
      <p>
        Pasá {LECTURAS_CALIBRACION} códigos con el escáner, uno por vez, con el cursor en el campo. No tipees a mano.
      </p>
      <label>
        Lectura{' '}
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={alTecla}
          autoFocus
          autoComplete="off"
          disabled={completa}
        />
      </label>
      <p>
        Lecturas: {lecturas} de {LECTURAS_CALIBRACION}
      </p>
      {resumen && (
        <div>
          <p>Intervalo mínimo entre caracteres: {resumen.minimo.toFixed(1)} ms</p>
          <p>Intervalo máximo entre caracteres: {resumen.maximo.toFixed(1)} ms</p>
          <p>
            Valor sugerido: <strong>{resumen.sugerido} ms</strong> (hoy: {UMBRALES.intervaloEscaneoMs} ms)
          </p>
          <p>Para usarlo, copiar esta línea en src/escaner/umbrales.ts:</p>
          <pre>intervaloEscaneoMs: {resumen.sugerido},</pre>
          <p>Esta pantalla no guarda nada en el navegador.</p>
        </div>
      )}
      <button type="button" onClick={reiniciar}>
        Volver a medir
      </button>
    </section>
  )
}
```

- [ ] **Step 6: Escribir la prueba del catálogo de la caja**

`src/caja/catalogoCaja.test.ts`:
```ts
// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CacheCatalogo } from '../catalogo/cache'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'
import { crearCatalogoCaja } from './catalogoCaja'

const producto = (id: string, nombre: string, codigo_barras: string | null, activo = true): ProductoCache => ({
  id,
  nombre,
  precio: 100,
  codigo_barras,
  activo,
  creado_en_caja: false,
  palabras: palabras(nombre),
})

async function armar() {
  const db = new CacheCatalogo(`prueba-${crypto.randomUUID()}`)
  await db.productos.bulkPut([
    producto('p1', 'Alfajor triple', '7790001'),
    producto('p2', 'Bizcochos', null),
    producto('p3', 'Pan de ayer', null, false),
    producto('p4', 'Turrón', 'ABC-9', false),
  ])
  return crearCatalogoCaja(db)
}

describe('crearCatalogoCaja', () => {
  it('por código encuentra el exacto, también si está desactivado', async () => {
    const catalogo = await armar()
    expect((await catalogo.porCodigo('7790001'))?.id).toBe('p1')
    expect((await catalogo.porCodigo('ABC-9'))?.activo).toBe(false)
    expect(await catalogo.porCodigo('0000')).toBeUndefined()
  })

  it('por nombre usa la búsqueda de la caché', async () => {
    const catalogo = await armar()
    expect((await catalogo.porNombre('alf')).map((p) => p.id)).toEqual(['p1'])
  })

  it('sin código devuelve sólo los activos sin código de barras', async () => {
    const catalogo = await armar()
    expect((await catalogo.sinCodigo()).map((p) => p.id)).toEqual(['p2'])
  })
})
```

- [ ] **Step 7: Escribir las ayudas de prueba de la caja**

`src/test/caja.tsx`:
```tsx
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CatalogoCaja } from '../caja/catalogoCaja'
import { PantallaCaja, type SesionCobro } from '../caja/PantallaCaja'
import { buscarPorNombre } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'

function producto(id: string, nombre: string, precio: number, codigo_barras: string | null, activo = true): ProductoCache {
  return { id, nombre, precio, codigo_barras, activo, creado_en_caja: false, palabras: palabras(nombre) }
}

export const ALFAJOR = producto('p1', 'Alfajor triple', 900, '7790001')
export const AGUA = producto('p2', 'Agua mineral', 1200, 'ABC-55')
export const ALFAJOR_SIMPLE = producto('p3', 'Alfajor simple', 600, '7790003')
export const BIZCOCHOS = producto('p4', 'Bizcochos', 500, null)
export const CHIPA = producto('p5', 'Chipá', 800, null)
export const FACTURAS = producto('p6', 'Facturas', 300, null)
export const PAN_VIEJO = producto('p7', 'Pan de ayer', 200, null, false)
export const TURRON_VIEJO = producto('p8', 'Turrón viejo', 400, '7790008', false)

export const PRODUCTOS_DE_PRUEBA: readonly ProductoCache[] = [
  ALFAJOR, AGUA, ALFAJOR_SIMPLE, BIZCOCHOS, CHIPA, FACTURAS, PAN_VIEJO, TURRON_VIEJO,
]

export function catalogoDePrueba(productos: readonly ProductoCache[] = PRODUCTOS_DE_PRUEBA): CatalogoCaja {
  return {
    porCodigo: async (codigo) => productos.find((p) => p.codigo_barras === codigo),
    porNombre: async (consulta) => buscarPorNombre(productos, consulta),
    sinCodigo: async () => productos.filter((p) => p.activo && p.codigo_barras === null),
  }
}

/** Reloj controlado: tipeo a 200 ms entre teclas; escáner con pausa previa y 5 ms entre caracteres. */
export function relojDePrueba() {
  let t = 1_000
  let paso = 200
  return {
    ahora: () => (t += paso),
    tipeo() {
      paso = 200
    },
    escaner() {
      t += 1_000
      paso = 5
    },
  }
}

export type Reloj = ReturnType<typeof relojDePrueba>
export type Usuario = ReturnType<typeof userEvent.setup>

export function turnoDePrueba(abierto: boolean) {
  const turno = { turnoId: 't1', apertura: '2026-10-19T12:00:00Z' }
  return {
    leer: vi.fn(async () => (abierto ? turno : null)),
    abrir: vi.fn(async () => turno),
  }
}

export async function escanear(user: Usuario, reloj: Reloj, codigo: string) {
  reloj.escaner()
  await user.keyboard(`${codigo}{Enter}`)
}

export async function tipear(user: Usuario, reloj: Reloj, texto: string) {
  reloj.tipeo()
  await user.keyboard(texto)
}

export function armarCaja(opciones: { turnoAbierto?: boolean; productos?: readonly ProductoCache[] } = {}) {
  const reloj = relojDePrueba()
  const pitar = vi.fn()
  const turno = turnoDePrueba(opciones.turnoAbierto ?? true)
  const sesiones: SesionCobro[] = []
  const user = userEvent.setup()
  render(
    <PantallaCaja
      catalogo={catalogoDePrueba(opciones.productos)}
      turno={turno}
      ahora={reloj.ahora}
      pitar={pitar}
      cobro={(s) => {
        sesiones.push(s)
        return <p>Cobro abierto</p>
      }}
    />,
  )
  return { reloj, pitar, turno, sesiones, user }
}
```

- [ ] **Step 8: Escribir la prueba de la pantalla de caja**

`src/caja/PantallaCaja.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { armarCaja, escanear, tipear, type Usuario } from '../test/caja'

async function campoListo(user: Usuario) {
  const campo = await screen.findByLabelText('Escanear o buscar')
  await user.click(campo)
  return campo
}

const fila = (nombre: string) => screen.getByRole('row', { name: new RegExp(nombre) })

describe('PantallaCaja', () => {
  it('un escaneo agrega el producto, lo resalta, pita y limpia el campo', async () => {
    const { user, reloj, pitar } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toHaveClass('linea--nueva')
    expect(pitar).toHaveBeenCalledTimes(1)
    expect(campo).toHaveValue('')
    expect(campo).toHaveFocus()
  })

  it('un código con letras escaneado agrega; tipeado a mano va a la búsqueda por nombre', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await tipear(user, reloj, 'ABC-55{Enter}')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    expect(campo).toHaveValue('ABC-55')
    await user.clear(campo)
    await escanear(user, reloj, 'ABC-55')
    expect(await screen.findByRole('row', { name: /Agua mineral/ })).toBeInTheDocument()
  })

  it('Enter con la lista abierta no agrega nada; flechas y Enter eligen', async () => {
    const { user, reloj } = armarCaja()
    await campoListo(user)
    await tipear(user, reloj, 'alf')
    const lista = await screen.findByRole('listbox', { name: 'Sugerencias' })
    expect(within(lista).getAllByRole('option')).toHaveLength(2)
    await tipear(user, reloj, '{Enter}')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    await tipear(user, reloj, '{ArrowDown}{Enter}')
    expect(await screen.findByRole('row', { name: /Alfajor simple/ })).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('un escaneo con la lista abierta gana: cierra la lista y agrega el código', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await tipear(user, reloj, 'alf')
    await screen.findByRole('listbox', { name: 'Sugerencias' })
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('row', { name: /Alfajor triple/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Alfajor simple/ })).toBeNull()
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(campo).toHaveValue('')
  })

  it('con el cobro abierto un escaneo se ignora y avisa', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Cobrar $900' }))
    expect(screen.getByText('Cobro abierto')).toBeInTheDocument()
    await user.click(campo)
    await escanear(user, reloj, '7790001')
    expect(await screen.findByRole('status')).toHaveTextContent('el escaneo no se agregó')
    expect(within(fila('Alfajor triple')).getByText('1')).toBeInTheDocument()
  })

  it('+ y − cambian la cantidad; con − en 1 la línea se quita y el foco vuelve al campo', async () => {
    const { user, reloj } = armarCaja()
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790001')
    await screen.findByRole('row', { name: /Alfajor triple/ })
    await user.click(screen.getByRole('button', { name: 'Sumar uno a Alfajor triple' }))
    expect(within(fila('Alfajor triple')).getByText('2')).toBeInTheDocument()
    expect(campo).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Restar uno a Alfajor triple' }))
    await user.click(screen.getByRole('button', { name: 'Restar uno a Alfajor triple' }))
    expect(screen.queryByRole('row', { name: /Alfajor triple/ })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('un código inexistente avisa y no agrega', async () => {
    const { user, reloj } = armarCaja()
    await campoListo(user)
    await escanear(user, reloj, '0000000')
    expect(await screen.findByRole('status')).toHaveTextContent('Código 0000000 no encontrado')
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
  })

  it('sin turno abierto no vende: pide abrir el turno', async () => {
    const { user, turno } = armarCaja({ turnoAbierto: false })
    expect(await screen.findByRole('heading', { name: 'No hay turno abierto en esta PC' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Escanear o buscar')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Abrir turno' }))
    expect(await screen.findByLabelText('Escanear o buscar')).toBeInTheDocument()
    expect(turno.abrir).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 9: Correrlas y ver que fallan**

Run: `npx vitest run src/caja`
Expected: FAIL: `Failed to resolve import "./catalogoCaja"` y `Failed to resolve import "../caja/PantallaCaja"`.

- [ ] **Step 10: Implementar el catálogo de la caja y los componentes chicos**

`src/caja/catalogoCaja.ts`:
```ts
import { buscarEnCache, buscarPorCodigoEnCache, type CacheCatalogo } from '../catalogo/cache'
import type { ProductoCache } from '../tipos'

/** Lo que la caja lee del catálogo. En la app sale de la caché Dexie; en las pruebas, de una lista. */
export interface CatalogoCaja {
  /** Código exacto, activo o no (un inactivo se ofrece reactivar en la tarea 15). */
  porCodigo(codigo: string): Promise<ProductoCache | undefined>
  /** Búsqueda por nombre: desde 2 letras, inicio de palabra, máximo 8 (tarea 6). */
  porNombre(consulta: string): Promise<ProductoCache[]>
  /** Activos sin código de barras, para el panel F2 (tarea 13). */
  sinCodigo(): Promise<ProductoCache[]>
}

export function crearCatalogoCaja(db: CacheCatalogo): CatalogoCaja {
  return {
    porCodigo: (codigo) => buscarPorCodigoEnCache(db, codigo),
    porNombre: (consulta) => buscarEnCache(db, consulta),
    sinCodigo: () => db.productos.filter((p) => p.activo && p.codigo_barras === null).toArray(),
  }
}
```

`src/caja/CampoEscaneo.tsx`:
```tsx
import { useRef, type KeyboardEvent, type RefObject } from 'react'
import { detectarEscaneo, type Pulsacion } from '../escaner/detector'
import type { Umbrales } from '../escaner/umbrales'

const MAX_PULSACIONES = 64

export interface PropsCampoEscaneo {
  campoRef: RefObject<HTMLInputElement | null>
  valor: string
  umbrales: Umbrales
  ahora: () => number
  alCambiar(valor: string): void
  /** Racha rápida terminada en Enter: el código y el momento del Enter. */
  alEscanear(codigo: string, t: number): void
  /** Enter que no fue escaneo. */
  alEnter(): void
  alFlecha(paso: 1 | -1): void
  /** Escape y F2 (panel sin código, tarea 13). */
  alTeclaEspecial?(tecla: 'Escape' | 'F2'): void
}

/** Campo único "Escanear o buscar". Mide el tiempo de cada tecla para separar escaneo de tipeo. */
export function CampoEscaneo(p: PropsCampoEscaneo) {
  const pulsaciones = useRef<Pulsacion[]>([])

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    const tecla = e.key
    if (tecla === 'Enter') {
      e.preventDefault()
      const t = p.ahora()
      const escaneo = detectarEscaneo(pulsaciones.current, t, p.umbrales)
      pulsaciones.current = []
      if (escaneo) p.alEscanear(escaneo.codigo, t)
      else p.alEnter()
      return
    }
    if (tecla === 'ArrowDown' || tecla === 'ArrowUp') {
      e.preventDefault()
      p.alFlecha(tecla === 'ArrowDown' ? 1 : -1)
      return
    }
    if (tecla === 'Escape' || tecla === 'F2') {
      e.preventDefault()
      p.alTeclaEspecial?.(tecla)
      return
    }
    if (tecla.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      pulsaciones.current = [...pulsaciones.current, { tecla, t: p.ahora() }].slice(-MAX_PULSACIONES)
    }
  }

  return (
    <label className="campo-escaneo">
      <span>Escanear o buscar</span>
      <input
        ref={p.campoRef}
        value={p.valor}
        onChange={(e) => p.alCambiar(e.target.value)}
        onKeyDown={alTecla}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
      />
    </label>
  )
}
```

`src/caja/ListaSugerencias.tsx`:
```tsx
import { formatearPesos } from '../lib/plata'
import type { ProductoCache } from '../tipos'

export interface PropsListaSugerencias {
  productos: readonly ProductoCache[]
  seleccion: number | null
  alElegir(producto: ProductoCache): void
}

/** Hasta 8 resultados con nombre, precio y código. Enter sólo elige lo seleccionado con flechas. */
export function ListaSugerencias({ productos, seleccion, alElegir }: PropsListaSugerencias) {
  return (
    <ul role="listbox" aria-label="Sugerencias" className="sugerencias">
      {productos.map((p, i) => (
        <li
          key={p.id}
          role="option"
          aria-selected={i === seleccion}
          className={i === seleccion ? 'sugerencia sugerencia--elegida' : 'sugerencia'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => alElegir(p)}
        >
          <span>{p.nombre}</span>
          <span>{formatearPesos(p.precio)}</span>
          <span>{p.codigo_barras ?? 'sin código'}</span>
        </li>
      ))}
    </ul>
  )
}
```

`src/caja/LineasVenta.tsx`:
```tsx
import { formatearPesos } from '../lib/plata'
import type { LineaCarrito } from '../tipos'

export interface PropsLineasVenta {
  lineas: readonly LineaCarrito[]
  /** Producto recién agregado: su línea se resalta. */
  resaltado: string | null
  /** Con el cobro abierto no se cambian cantidades. */
  bloqueada: boolean
  alCambiar(productoId: string, delta: 1 | -1): void
}

export function LineasVenta({ lineas, resaltado, bloqueada, alCambiar }: PropsLineasVenta) {
  if (lineas.length === 0) return <p className="venta-vacia">Escaneá o buscá un producto para empezar.</p>
  return (
    <table className="lineas" aria-label="Venta">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Precio</th>
          <th>Cantidad</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l) => (
          <tr key={l.productoId} className={l.productoId === resaltado ? 'linea linea--nueva' : 'linea'}>
            <td>{l.nombre}</td>
            <td>{formatearPesos(l.precio)}</td>
            <td>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Restar uno a ${l.nombre}`}
                disabled={bloqueada}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => alCambiar(l.productoId, -1)}
              >
                −
              </button>
              <span className="cantidad">{l.cantidad}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Sumar uno a ${l.nombre}`}
                disabled={bloqueada}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => alCambiar(l.productoId, 1)}
              >
                +
              </button>
            </td>
            <td>{formatearPesos(l.precio * l.cantidad)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 11: Implementar la pantalla de caja**

`src/caja/PantallaCaja.tsx`:
```tsx
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { crearFiltroDobleLectura } from '../escaner/dobleLectura'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos } from '../lib/plata'
import type { LineaCarrito, ProductoCache } from '../tipos'
import { PedirApertura } from '../turno/PantallaTurno'
import type { TurnoAbierto } from '../turno/turno'
import { pitido } from '../ui/pitido'
import { carritoReducer, carritoVacio, totalCarrito } from '../venta/carrito'
import { crearIdVenta, type GeneradorIdVenta } from '../venta/idVenta'
import { CampoEscaneo } from './CampoEscaneo'
import type { CatalogoCaja } from './catalogoCaja'
import { LineasVenta } from './LineasVenta'
import { ListaSugerencias } from './ListaSugerencias'

export const AVISO_ESCANEO_EN_COBRO =
  'El cobro está abierto: el escaneo no se agregó. Volvé a la venta para agregar productos.'

/** Turno de esta PC. La tarea 17 lo arma con leerTurnoAbierto y abrirTurno (tarea 8). */
export interface ServicioTurno {
  leer(): Promise<TurnoAbierto | null>
  abrir(): Promise<TurnoAbierto>
}

/** Lo que la pantalla de cobro (tarea 14) recibe de la caja. */
export interface SesionCobro {
  lineas: LineaCarrito[]
  total: number
  /** Vive en la caja, no en el cobro: cerrar y reabrir el cobro no cambia el id de un mismo contenido. */
  ids: GeneradorIdVenta
  /** Cierra el cobro sin tocar el carrito. */
  volver(): void
  /** Después del comprobante: vacía el carrito y vuelve al campo. */
  nuevaVenta(): void
  /** Tras un rechazo por precio: el carrito toma los precios actuales (y el id sale nuevo solo). */
  actualizarPrecios(precios: Record<string, number>): void
  /** La base dijo sin_turno: la caja pide abrir turno, con el carrito intacto. */
  perderTurno(): void
  avisar(texto: string): void
}

export interface PropsPantallaCaja {
  catalogo: CatalogoCaja
  turno: ServicioTurno
  cobro(sesion: SesionCobro): ReactNode
  umbrales?: Umbrales
  ahora?: () => number
  pitar?: () => void
}

type EstadoTurno =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sin_turno' }
  | { tipo: 'abierto'; turno: TurnoAbierto }

export function PantallaCaja({
  catalogo,
  turno,
  cobro,
  umbrales = UMBRALES,
  ahora = () => performance.now(),
  pitar = pitido,
}: PropsPantallaCaja) {
  const campo = useRef<HTMLInputElement>(null)
  const [estadoTurno, setEstadoTurno] = useState<EstadoTurno>({ tipo: 'cargando' })
  const [carrito, despachar] = useReducer(carritoReducer, carritoVacio)
  const [ids] = useState(() => crearIdVenta())
  const [filtroLecturas] = useState(() => crearFiltroDobleLectura(umbrales.dobleLecturaMs))
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoCache[]>([])
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const cobroAbiertoRef = useRef(false)
  const consulta = useRef('')
  const total = totalCarrito(carrito)

  function cargarTurno() {
    setEstadoTurno({ tipo: 'cargando' })
    turno.leer().then(
      (t) => setEstadoTurno(t ? { tipo: 'abierto', turno: t } : { tipo: 'sin_turno' }),
      () => setEstadoTurno({ tipo: 'error' }),
    )
  }

  // Una sola vez al montar: el turno se lee de la base, nunca del navegador.
  useEffect(cargarTurno, [])

  const enfocar = () => campo.current?.focus()

  function ponerCobro(abierto: boolean) {
    cobroAbiertoRef.current = abierto
    setCobroAbierto(abierto)
  }

  function limpiarBusqueda() {
    consulta.current = ''
    setTexto('')
    setSugerencias([])
    setSeleccion(null)
  }

  function agregar(producto: ProductoCache) {
    despachar({ tipo: 'agregar', producto })
    setResaltado(producto.id)
    setAviso(null)
    pitar()
  }

  async function cambiarTexto(valor: string) {
    setTexto(valor)
    setSeleccion(null)
    consulta.current = valor
    if (cobroAbiertoRef.current) return
    try {
      const encontrados = await catalogo.porNombre(valor)
      // Descarta respuestas viejas: el texto pudo cambiar (o limpiarse por un escaneo) mientras tanto.
      if (consulta.current === valor) setSugerencias(encontrados)
    } catch {
      if (consulta.current === valor) setSugerencias([])
    }
  }

  async function escanear(codigo: string, t: number) {
    limpiarBusqueda()
    enfocar()
    if (!filtroLecturas.aceptar({ codigo, t })) return
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    let producto: ProductoCache | undefined
    try {
      producto = await catalogo.porCodigo(codigo)
    } catch {
      setAviso('No se pudo buscar el código. Probá de nuevo.')
      return
    }
    // El cobro pudo abrirse mientras se buscaba: el total ya se mostró.
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    if (!producto) {
      setAviso(`Código ${codigo} no encontrado. Buscalo por nombre.`)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      return
    }
    agregar(producto)
  }

  function elegir(producto: ProductoCache) {
    agregar(producto)
    limpiarBusqueda()
    enfocar()
  }

  /** Enter nunca agrega una sugerencia sola: sólo la elegida con flechas. */
  function enter() {
    if (seleccion === null) return
    const producto = sugerencias[seleccion]
    if (producto) elegir(producto)
  }

  function mover(paso: 1 | -1) {
    if (sugerencias.length === 0) return
    setSeleccion((s) =>
      s === null ? (paso === 1 ? 0 : sugerencias.length - 1) : (s + paso + sugerencias.length) % sugerencias.length,
    )
  }

  function cambiarCantidad(productoId: string, delta: 1 | -1) {
    if (cobroAbiertoRef.current) return
    despachar({ tipo: 'cambiarCantidad', productoId, delta })
    enfocar()
  }

  function abrirCobro() {
    if (carrito.lineas.length === 0) return
    limpiarBusqueda()
    ponerCobro(true)
  }

  const sesion: SesionCobro = {
    lineas: carrito.lineas,
    total,
    ids,
    volver: () => {
      ponerCobro(false)
      enfocar()
    },
    nuevaVenta: () => {
      despachar({ tipo: 'vaciar' })
      setResaltado(null)
      setAviso(null)
      ponerCobro(false)
      enfocar()
    },
    actualizarPrecios: (precios) => despachar({ tipo: 'actualizarPrecios', precios }),
    perderTurno: () => {
      ponerCobro(false)
      setEstadoTurno({ tipo: 'sin_turno' })
    },
    avisar: setAviso,
  }

  if (estadoTurno.tipo === 'cargando') return <p className="caja-cargando">Cargando…</p>
  if (estadoTurno.tipo === 'error') {
    return (
      <section className="caja">
        <p role="alert" className="aviso aviso--error">
          No se pudo leer el turno. Revisá la conexión.
        </p>
        <button type="button" onClick={cargarTurno}>
          Reintentar
        </button>
      </section>
    )
  }
  if (estadoTurno.tipo === 'sin_turno') {
    return (
      <PedirApertura
        alAbrir={async () => {
          setEstadoTurno({ tipo: 'abierto', turno: await turno.abrir() })
        }}
      />
    )
  }

  return (
    <section className="caja">
      {aviso && (
        <p role="status" className="aviso">
          {aviso}
        </p>
      )}
      <CampoEscaneo
        campoRef={campo}
        valor={texto}
        umbrales={umbrales}
        ahora={ahora}
        alCambiar={(v) => void cambiarTexto(v)}
        alEscanear={(codigo, t) => void escanear(codigo, t)}
        alEnter={enter}
        alFlecha={mover}
      />
      {!cobroAbierto && sugerencias.length > 0 && (
        <ListaSugerencias productos={sugerencias} seleccion={seleccion} alElegir={elegir} />
      )}
      <LineasVenta lineas={carrito.lineas} resaltado={resaltado} bloqueada={cobroAbierto} alCambiar={cambiarCantidad} />
      {!cobroAbierto && (
        <button
          type="button"
          className="boton-cobrar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={abrirCobro}
          disabled={carrito.lineas.length === 0}
        >
          Cobrar {formatearPesos(total)}
        </button>
      )}
      {cobroAbierto && cobro(sesion)}
    </section>
  )
}
```

- [ ] **Step 12: Agregar los estilos de la caja**

Al final de `src/estilos.css`:
```css
/* Caja (tarea 12) */
.caja { display: grid; gap: 0.75rem; padding: 1rem; max-width: 60rem; margin: 0 auto; }
.campo-escaneo { display: grid; gap: 0.25rem; font-weight: 600; }
.campo-escaneo input { font-size: 1.4rem; width: 100%; }
.sugerencias { list-style: none; margin: 0; padding: 0; border: 1px solid var(--color-borde); border-radius: 6px; background: #fff; }
.sugerencia { display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; padding: 0.5rem 0.75rem; cursor: pointer; }
.sugerencia--elegida { background: var(--color-resaltado); }
.linea--nueva { background: var(--color-resaltado); }
.cantidad { display: inline-block; min-width: 2.5rem; text-align: center; }
.boton-cobrar { font-size: 1.3rem; padding: 0.8rem; background: var(--color-primario); color: #fff; }
.calibracion { display: grid; gap: 0.75rem; padding: 1rem; max-width: 40rem; }
```

- [ ] **Step 13: Correr las pruebas, los tipos y la suite completa**

Run:
```bash
npx vitest run src/escaner src/ui src/caja
npx tsc --noEmit
npm test
```
Expected: `Test Files  6 passed (6)` y `Tests  32 passed (32)` (21 puras, 3 de `catalogoCaja`, 8 de `PantallaCaja`); `tsc` sin salida; `npm test` sin fallas. Si "+ y − ..." falla sólo en `toHaveFocus`, ver V21. Si `catalogoCaja.test.ts` falla al abrir IndexedDB, ver V17 (parte 2).

- [ ] **Step 14: Commit (sólo con OK de Felipe)**

```bash
git add src/escaner src/ui src/caja src/test/caja.tsx src/estilos.css
git commit -m "feat(caja): escáner con detector y lectura doble, búsqueda y carrito" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 13: Panel "Sin código (F2)" (React, Testing Library)

**Files:**
- Create: `src/caja/ranking.ts`, `src/caja/PanelSinCodigo.tsx`
- Modify: `src/caja/PantallaCaja.tsx` (se reemplaza entero: prop `leerRanking`, panel, F2 y Esc)
- Modify: `src/test/caja.tsx` (se reemplaza entero: `armarCaja` pasa `leerRanking`)
- Modify: `src/estilos.css` (agregar al final)
- Test: `src/caja/ranking.test.ts`, `src/caja/PanelSinCodigo.test.tsx`

Reglas (spec sección 6, "Productos sin código de barras"):
- Botón "Sin código (F2)" que abre una grilla de 4 × 5 con botones grandes (nombre y precio). Si hay más de 20 productos sin código, se ven los 20 primeros del orden; el resto se encuentra escribiendo (filtro).
- Orden: el de `ranking_sin_codigo` (tarea 11), pedido una vez cuando la caja tiene el turno abierto y fijo en memoria durante el turno. Si el turno ya estaba abierto al cargar la pantalla (por ejemplo después de F5), se pide al montar. Si el pedido falla, la grilla queda en orden alfabético.
- Los productos y precios salen de la caché (`CatalogoCaja.sinCodigo`, tarea 12), que es la vigente; el ranking sólo aporta la cantidad de ventas. Lo desactivado no aparece. Un producto sin código creado después de abrir el turno aparece con 0 ventas, en orden alfabético.
- Cada toque suma 1 unidad, suena el pitido y el panel queda abierto. El foco nunca sale del campo: los botones tienen `tabIndex={-1}` y `onMouseDown` con `preventDefault`.
- Con el panel abierto, escribir en el campo filtra la grilla (inicio de palabra, sin tildes, desde una letra) y no abre la lista de sugerencias. Un escaneo agrega el producto y cierra el panel. Esc o F2 cierran el panel.
- Con el cobro abierto el panel se cierra y no se abre.

- [ ] **Step 1: Escribir la prueba del orden y del filtro**

`src/caja/ranking.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { palabras } from '../catalogo/normalizar'
import { ALFAJOR, BIZCOCHOS, CHIPA, FACTURAS, PAN_VIEJO } from '../test/caja'
import type { ProductoCache } from '../tipos'
import { filtrarPanel, LUGARES_PANEL, ordenarSinCodigo, type FilaRanking } from './ranking'

const fila = (p: ProductoCache, cantidad_ventas: number): FilaRanking => ({ producto_id: p.id, nombre: p.nombre, cantidad_ventas })

describe('ordenarSinCodigo', () => {
  it('ordena por cantidad de ventas y desempata en orden alfabético', () => {
    const ranking = [fila(FACTURAS, 5), fila(CHIPA, 2), fila(BIZCOCHOS, 2)]
    expect(ordenarSinCodigo(ranking, [CHIPA, BIZCOCHOS, FACTURAS]).map((p) => p.nombre)).toEqual([
      'Facturas', 'Bizcochos', 'Chipá',
    ])
  })

  it('saca desactivados y productos con código aunque estén en el ranking', () => {
    const ranking = [fila(PAN_VIEJO, 9), fila(ALFAJOR, 9), fila(BIZCOCHOS, 1)]
    expect(ordenarSinCodigo(ranking, [PAN_VIEJO, ALFAJOR, BIZCOCHOS]).map((p) => p.nombre)).toEqual(['Bizcochos'])
  })

  it('lo que no está en el ranking cuenta 0 y va en orden alfabético', () => {
    expect(ordenarSinCodigo([], [FACTURAS, CHIPA, BIZCOCHOS]).map((p) => p.nombre)).toEqual([
      'Bizcochos', 'Chipá', 'Facturas',
    ])
    expect(ordenarSinCodigo([fila(FACTURAS, 1)], [CHIPA, BIZCOCHOS, FACTURAS]).map((p) => p.nombre)).toEqual([
      'Facturas', 'Bizcochos', 'Chipá',
    ])
  })
})

describe('filtrarPanel', () => {
  it('filtra por inicio de palabra, sin tildes ni mayúsculas, desde una letra', () => {
    const lista = [BIZCOCHOS, CHIPA, FACTURAS]
    expect(filtrarPanel(lista, 'chi').map((p) => p.nombre)).toEqual(['Chipá'])
    expect(filtrarPanel(lista, 'CHIPA').map((p) => p.nombre)).toEqual(['Chipá'])
    expect(filtrarPanel(lista, 'f').map((p) => p.nombre)).toEqual(['Facturas'])
  })

  it('sin texto muestra todo, hasta los 20 lugares de la grilla', () => {
    const muchos: ProductoCache[] = Array.from({ length: 25 }, (_, i) => ({
      ...BIZCOCHOS,
      id: `m${i}`,
      nombre: `Producto ${i}`,
      palabras: palabras(`Producto ${i}`),
    }))
    expect(filtrarPanel(muchos, '')).toHaveLength(LUGARES_PANEL)
    expect(LUGARES_PANEL).toBe(20)
  })
})
```

- [ ] **Step 2: Escribir la prueba del panel**

`src/caja/PanelSinCodigo.test.tsx`:
```tsx
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { armarCaja, escanear, tipear, type Usuario } from '../test/caja'
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
})
```

- [ ] **Step 3: Reemplazar las ayudas de prueba para pasar el ranking**

`src/test/caja.tsx` (reemplaza el archivo de la tarea 12 entero; cambia sólo `armarCaja`, que ahora recibe `ranking` y pasa `leerRanking`):
```tsx
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CatalogoCaja } from '../caja/catalogoCaja'
import { PantallaCaja, type SesionCobro } from '../caja/PantallaCaja'
import type { FilaRanking } from '../caja/ranking'
import { buscarPorNombre } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'

function producto(id: string, nombre: string, precio: number, codigo_barras: string | null, activo = true): ProductoCache {
  return { id, nombre, precio, codigo_barras, activo, creado_en_caja: false, palabras: palabras(nombre) }
}

export const ALFAJOR = producto('p1', 'Alfajor triple', 900, '7790001')
export const AGUA = producto('p2', 'Agua mineral', 1200, 'ABC-55')
export const ALFAJOR_SIMPLE = producto('p3', 'Alfajor simple', 600, '7790003')
export const BIZCOCHOS = producto('p4', 'Bizcochos', 500, null)
export const CHIPA = producto('p5', 'Chipá', 800, null)
export const FACTURAS = producto('p6', 'Facturas', 300, null)
export const PAN_VIEJO = producto('p7', 'Pan de ayer', 200, null, false)
export const TURRON_VIEJO = producto('p8', 'Turrón viejo', 400, '7790008', false)

export const PRODUCTOS_DE_PRUEBA: readonly ProductoCache[] = [
  ALFAJOR, AGUA, ALFAJOR_SIMPLE, BIZCOCHOS, CHIPA, FACTURAS, PAN_VIEJO, TURRON_VIEJO,
]

export function catalogoDePrueba(productos: readonly ProductoCache[] = PRODUCTOS_DE_PRUEBA): CatalogoCaja {
  return {
    porCodigo: async (codigo) => productos.find((p) => p.codigo_barras === codigo),
    porNombre: async (consulta) => buscarPorNombre(productos, consulta),
    sinCodigo: async () => productos.filter((p) => p.activo && p.codigo_barras === null),
  }
}

/** Reloj controlado: tipeo a 200 ms entre teclas; escáner con pausa previa y 5 ms entre caracteres. */
export function relojDePrueba() {
  let t = 1_000
  let paso = 200
  return {
    ahora: () => (t += paso),
    tipeo() {
      paso = 200
    },
    escaner() {
      t += 1_000
      paso = 5
    },
  }
}

export type Reloj = ReturnType<typeof relojDePrueba>
export type Usuario = ReturnType<typeof userEvent.setup>

export function turnoDePrueba(abierto: boolean) {
  const turno = { turnoId: 't1', apertura: '2026-10-19T12:00:00Z' }
  return {
    leer: vi.fn(async () => (abierto ? turno : null)),
    abrir: vi.fn(async () => turno),
  }
}

export async function escanear(user: Usuario, reloj: Reloj, codigo: string) {
  reloj.escaner()
  await user.keyboard(`${codigo}{Enter}`)
}

export async function tipear(user: Usuario, reloj: Reloj, texto: string) {
  reloj.tipeo()
  await user.keyboard(texto)
}

export interface OpcionesCaja {
  turnoAbierto?: boolean
  productos?: readonly ProductoCache[]
  /** Respuesta de ranking_sin_codigo; 'falla' simula un error de red. */
  ranking?: FilaRanking[] | 'falla'
}

export function armarCaja(opciones: OpcionesCaja = {}) {
  const reloj = relojDePrueba()
  const pitar = vi.fn()
  const turno = turnoDePrueba(opciones.turnoAbierto ?? true)
  const leerRanking = vi.fn(async (): Promise<FilaRanking[]> => {
    if (opciones.ranking === 'falla') throw new Error('sin red')
    return opciones.ranking ?? []
  })
  const sesiones: SesionCobro[] = []
  const user = userEvent.setup()
  render(
    <PantallaCaja
      catalogo={catalogoDePrueba(opciones.productos)}
      turno={turno}
      leerRanking={leerRanking}
      ahora={reloj.ahora}
      pitar={pitar}
      cobro={(s) => {
        sesiones.push(s)
        return <p>Cobro abierto</p>
      }}
    />,
  )
  return { reloj, pitar, turno, leerRanking, sesiones, user }
}
```

- [ ] **Step 4: Correrlas y ver que fallan**

Run: `npx vitest run src/caja`
Expected: FAIL en `ranking.test.ts` con `Failed to resolve import "./ranking"` y en `PanelSinCodigo.test.tsx` porque la grilla no aparece (`Unable to find role="group"`). `catalogoCaja.test.ts` y `PantallaCaja.test.tsx` siguen pasando: los imports de `ranking` en `src/test/caja.tsx` y en la prueba del panel son sólo de tipos y Vitest los borra; la prop `leerRanking`, que la pantalla todavía no declara, es un error de `tsc`, no de ejecución.

- [ ] **Step 5: Implementar el orden y el filtro**

`src/caja/ranking.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { compararPorNombre } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import type { ItemRanking, ProductoCache } from '../tipos'

/** Fila de ranking_sin_codigo() (tarea 11). Sin precio: el panel usa el de la caché, que es el vigente. */
export type FilaRanking = Omit<ItemRanking, 'precio'>

/** Grilla de 4 × 5 (spec sección 6). */
export const LUGARES_PANEL = 20

/** La tarea 17 lo pasa a PantallaCaja como leerRanking. */
export async function leerRankingSinCodigo(supabase: SupabaseClient): Promise<FilaRanking[]> {
  const { data, error } = await supabase.rpc('ranking_sin_codigo')
  if (error) throw error
  return (data ?? []) as FilaRanking[]
}

/**
 * Productos del panel: activos sin código de la caché, por cantidad de ventas del ranking del turno.
 * Lo que no está en el ranking cuenta 0. Empates: orden alfabético normalizado (el mismo del buscador).
 */
export function ordenarSinCodigo(ranking: readonly FilaRanking[], productos: readonly ProductoCache[]): ProductoCache[] {
  const ventas = new Map(ranking.map((f) => [f.producto_id, f.cantidad_ventas]))
  return productos
    .filter((p) => p.activo && p.codigo_barras === null)
    .sort((a, b) => (ventas.get(b.id) ?? 0) - (ventas.get(a.id) ?? 0) || compararPorNombre(a, b))
}

/** Lo escrito con el panel abierto filtra por inicio de palabra, desde una letra. Máximo 20 lugares. */
export function filtrarPanel(productos: readonly ProductoCache[], texto: string): ProductoCache[] {
  const terminos = palabras(texto)
  const lista =
    terminos.length === 0
      ? productos
      : productos.filter((p) => terminos.every((t) => p.palabras.some((w) => w.startsWith(t))))
  return lista.slice(0, LUGARES_PANEL)
}
```

- [ ] **Step 6: Implementar el panel**

`src/caja/PanelSinCodigo.tsx`:
```tsx
import { formatearPesos } from '../lib/plata'
import type { ProductoCache } from '../tipos'

export interface PropsPanelSinCodigo {
  /** Ya ordenados y filtrados (ordenarSinCodigo y filtrarPanel). */
  productos: readonly ProductoCache[]
  alTocar(producto: ProductoCache): void
  alCerrar(): void
}

/** Grilla de botones grandes. Ningún botón toma el foco: el campo de escaneo lo conserva siempre. */
export function PanelSinCodigo({ productos, alTocar, alCerrar }: PropsPanelSinCodigo) {
  return (
    <section className="panel-sin-codigo" aria-label="Productos sin código">
      <div role="group" aria-label="Grilla sin código" className="panel-sin-codigo__grilla">
        {productos.map((p) => (
          <button
            key={p.id}
            type="button"
            tabIndex={-1}
            className="panel-sin-codigo__boton"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => alTocar(p)}
          >
            <span>{p.nombre}</span>
            <span>{formatearPesos(p.precio)}</span>
          </button>
        ))}
      </div>
      {productos.length === 0 && <p>No hay productos sin código que coincidan.</p>}
      <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={alCerrar}>
        Cerrar (Esc)
      </button>
    </section>
  )
}
```

- [ ] **Step 7: Reemplazar la pantalla de caja con el panel**

`src/caja/PantallaCaja.tsx` (reemplaza el archivo de la tarea 12 entero; lo nuevo es la prop `leerRanking`, el estado del panel, `teclaEspecial` y el botón "Sin código (F2)"):
```tsx
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { crearFiltroDobleLectura } from '../escaner/dobleLectura'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos } from '../lib/plata'
import type { LineaCarrito, ProductoCache } from '../tipos'
import { PedirApertura } from '../turno/PantallaTurno'
import type { TurnoAbierto } from '../turno/turno'
import { pitido } from '../ui/pitido'
import { carritoReducer, carritoVacio, totalCarrito } from '../venta/carrito'
import { crearIdVenta, type GeneradorIdVenta } from '../venta/idVenta'
import { CampoEscaneo } from './CampoEscaneo'
import type { CatalogoCaja } from './catalogoCaja'
import { LineasVenta } from './LineasVenta'
import { ListaSugerencias } from './ListaSugerencias'
import { PanelSinCodigo } from './PanelSinCodigo'
import { filtrarPanel, ordenarSinCodigo, type FilaRanking } from './ranking'

export const AVISO_ESCANEO_EN_COBRO =
  'El cobro está abierto: el escaneo no se agregó. Volvé a la venta para agregar productos.'

/** Turno de esta PC. La tarea 17 lo arma con leerTurnoAbierto y abrirTurno (tarea 8). */
export interface ServicioTurno {
  leer(): Promise<TurnoAbierto | null>
  abrir(): Promise<TurnoAbierto>
}

/** Lo que la pantalla de cobro (tarea 14) recibe de la caja. */
export interface SesionCobro {
  lineas: LineaCarrito[]
  total: number
  /** Vive en la caja, no en el cobro: cerrar y reabrir el cobro no cambia el id de un mismo contenido. */
  ids: GeneradorIdVenta
  /** Cierra el cobro sin tocar el carrito. */
  volver(): void
  /** Después del comprobante: vacía el carrito y vuelve al campo. */
  nuevaVenta(): void
  /** Tras un rechazo por precio: el carrito toma los precios actuales (y el id sale nuevo solo). */
  actualizarPrecios(precios: Record<string, number>): void
  /** La base dijo sin_turno: la caja pide abrir turno, con el carrito intacto. */
  perderTurno(): void
  avisar(texto: string): void
}

export interface PropsPantallaCaja {
  catalogo: CatalogoCaja
  turno: ServicioTurno
  /** ranking_sin_codigo (tarea 11). La tarea 17 pasa () => leerRankingSinCodigo(supabase). */
  leerRanking(): Promise<FilaRanking[]>
  cobro(sesion: SesionCobro): ReactNode
  umbrales?: Umbrales
  ahora?: () => number
  pitar?: () => void
}

type EstadoTurno =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sin_turno' }
  | { tipo: 'abierto'; turno: TurnoAbierto }

export function PantallaCaja({
  catalogo,
  turno,
  leerRanking,
  cobro,
  umbrales = UMBRALES,
  ahora = () => performance.now(),
  pitar = pitido,
}: PropsPantallaCaja) {
  const campo = useRef<HTMLInputElement>(null)
  const [estadoTurno, setEstadoTurno] = useState<EstadoTurno>({ tipo: 'cargando' })
  const [carrito, despachar] = useReducer(carritoReducer, carritoVacio)
  const [ids] = useState(() => crearIdVenta())
  const [filtroLecturas] = useState(() => crearFiltroDobleLectura(umbrales.dobleLecturaMs))
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoCache[]>([])
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [sinCodigo, setSinCodigo] = useState<ProductoCache[]>([])
  const cobroAbiertoRef = useRef(false)
  const consulta = useRef('')
  const total = totalCarrito(carrito)
  const turnoId = estadoTurno.tipo === 'abierto' ? estadoTurno.turno.turnoId : null

  function cargarTurno() {
    setEstadoTurno({ tipo: 'cargando' })
    turno.leer().then(
      (t) => setEstadoTurno(t ? { tipo: 'abierto', turno: t } : { tipo: 'sin_turno' }),
      () => setEstadoTurno({ tipo: 'error' }),
    )
  }

  // Una sola vez al montar: el turno se lee de la base, nunca del navegador.
  useEffect(cargarTurno, [])

  // El ranking se pide cuando hay turno abierto y queda fijo en memoria durante el turno.
  useEffect(() => {
    if (turnoId === null) return
    let vigente = true
    leerRanking().then(
      (filas) => {
        if (vigente) setRanking(filas)
      },
      () => {
        // Sin ranking, la grilla queda en orden alfabético.
        if (vigente) setRanking([])
      },
    )
    return () => {
      vigente = false
    }
  }, [turnoId])

  const enfocar = () => campo.current?.focus()

  function ponerCobro(abierto: boolean) {
    cobroAbiertoRef.current = abierto
    setCobroAbierto(abierto)
  }

  function limpiarBusqueda() {
    consulta.current = ''
    setTexto('')
    setSugerencias([])
    setSeleccion(null)
  }

  function agregar(producto: ProductoCache) {
    despachar({ tipo: 'agregar', producto })
    setResaltado(producto.id)
    setAviso(null)
    pitar()
  }

  function abrirPanel() {
    if (cobroAbiertoRef.current) return
    limpiarBusqueda()
    setPanelAbierto(true)
    catalogo.sinCodigo().then(setSinCodigo, () => setSinCodigo([]))
    enfocar()
  }

  function cerrarPanel() {
    setPanelAbierto(false)
    limpiarBusqueda()
    enfocar()
  }

  function teclaEspecial(tecla: 'Escape' | 'F2') {
    if (tecla === 'F2') {
      if (panelAbierto) cerrarPanel()
      else abrirPanel()
    } else if (panelAbierto) {
      cerrarPanel()
    }
  }

  async function cambiarTexto(valor: string) {
    setTexto(valor)
    setSeleccion(null)
    consulta.current = valor
    // Con el panel abierto, el texto filtra la grilla y no busca sugerencias.
    if (cobroAbiertoRef.current || panelAbierto) {
      setSugerencias([])
      return
    }
    try {
      const encontrados = await catalogo.porNombre(valor)
      // Descarta respuestas viejas: el texto pudo cambiar (o limpiarse por un escaneo) mientras tanto.
      if (consulta.current === valor) setSugerencias(encontrados)
    } catch {
      if (consulta.current === valor) setSugerencias([])
    }
  }

  async function escanear(codigo: string, t: number) {
    limpiarBusqueda()
    setPanelAbierto(false)
    enfocar()
    if (!filtroLecturas.aceptar({ codigo, t })) return
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    let producto: ProductoCache | undefined
    try {
      producto = await catalogo.porCodigo(codigo)
    } catch {
      setAviso('No se pudo buscar el código. Probá de nuevo.')
      return
    }
    // El cobro pudo abrirse mientras se buscaba: el total ya se mostró.
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    if (!producto) {
      setAviso(`Código ${codigo} no encontrado. Buscalo por nombre.`)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      return
    }
    agregar(producto)
  }

  function elegir(producto: ProductoCache) {
    agregar(producto)
    limpiarBusqueda()
    enfocar()
  }

  /** Toque en la grilla: suma 1 y el panel queda abierto. */
  function tocar(producto: ProductoCache) {
    agregar(producto)
    enfocar()
  }

  /** Enter nunca agrega una sugerencia sola: sólo la elegida con flechas. */
  function enter() {
    if (panelAbierto || seleccion === null) return
    const producto = sugerencias[seleccion]
    if (producto) elegir(producto)
  }

  function mover(paso: 1 | -1) {
    if (panelAbierto || sugerencias.length === 0) return
    setSeleccion((s) =>
      s === null ? (paso === 1 ? 0 : sugerencias.length - 1) : (s + paso + sugerencias.length) % sugerencias.length,
    )
  }

  function cambiarCantidad(productoId: string, delta: 1 | -1) {
    if (cobroAbiertoRef.current) return
    despachar({ tipo: 'cambiarCantidad', productoId, delta })
    enfocar()
  }

  function abrirCobro() {
    if (carrito.lineas.length === 0) return
    limpiarBusqueda()
    setPanelAbierto(false)
    ponerCobro(true)
  }

  const sesion: SesionCobro = {
    lineas: carrito.lineas,
    total,
    ids,
    volver: () => {
      ponerCobro(false)
      enfocar()
    },
    nuevaVenta: () => {
      despachar({ tipo: 'vaciar' })
      setResaltado(null)
      setAviso(null)
      ponerCobro(false)
      enfocar()
    },
    actualizarPrecios: (precios) => despachar({ tipo: 'actualizarPrecios', precios }),
    perderTurno: () => {
      ponerCobro(false)
      setEstadoTurno({ tipo: 'sin_turno' })
    },
    avisar: setAviso,
  }

  const enPanel = panelAbierto ? filtrarPanel(ordenarSinCodigo(ranking, sinCodigo), texto) : []

  if (estadoTurno.tipo === 'cargando') return <p className="caja-cargando">Cargando…</p>
  if (estadoTurno.tipo === 'error') {
    return (
      <section className="caja">
        <p role="alert" className="aviso aviso--error">
          No se pudo leer el turno. Revisá la conexión.
        </p>
        <button type="button" onClick={cargarTurno}>
          Reintentar
        </button>
      </section>
    )
  }
  if (estadoTurno.tipo === 'sin_turno') {
    return (
      <PedirApertura
        alAbrir={async () => {
          setEstadoTurno({ tipo: 'abierto', turno: await turno.abrir() })
        }}
      />
    )
  }

  return (
    <section className="caja">
      {aviso && (
        <p role="status" className="aviso">
          {aviso}
        </p>
      )}
      <CampoEscaneo
        campoRef={campo}
        valor={texto}
        umbrales={umbrales}
        ahora={ahora}
        alCambiar={(v) => void cambiarTexto(v)}
        alEscanear={(codigo, t) => void escanear(codigo, t)}
        alEnter={enter}
        alFlecha={mover}
        alTeclaEspecial={teclaEspecial}
      />
      {!cobroAbierto && (
        <button
          type="button"
          className="boton-sin-codigo"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => teclaEspecial('F2')}
        >
          Sin código (F2)
        </button>
      )}
      {panelAbierto && <PanelSinCodigo productos={enPanel} alTocar={tocar} alCerrar={cerrarPanel} />}
      {!cobroAbierto && !panelAbierto && sugerencias.length > 0 && (
        <ListaSugerencias productos={sugerencias} seleccion={seleccion} alElegir={elegir} />
      )}
      <LineasVenta lineas={carrito.lineas} resaltado={resaltado} bloqueada={cobroAbierto} alCambiar={cambiarCantidad} />
      {!cobroAbierto && (
        <button
          type="button"
          className="boton-cobrar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={abrirCobro}
          disabled={carrito.lineas.length === 0}
        >
          Cobrar {formatearPesos(total)}
        </button>
      )}
      {cobroAbierto && cobro(sesion)}
    </section>
  )
}
```

- [ ] **Step 8: Agregar los estilos del panel**

Al final de `src/estilos.css`:
```css
/* Panel sin código (tarea 13) */
.panel-sin-codigo { display: grid; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--color-borde); border-radius: 6px; background: #fff; }
.panel-sin-codigo__grilla { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: minmax(4.5rem, auto); gap: 0.5rem; }
.panel-sin-codigo__boton { display: grid; align-content: center; gap: 0.25rem; font-size: 1.1rem; }
```

- [ ] **Step 9: Correr las pruebas, los tipos y la suite completa**

Run:
```bash
npx vitest run src/caja
npx tsc --noEmit
npm test
```
Expected: `Test Files  4 passed (4)` y `Tests  24 passed (24)` (3 de `catalogoCaja`, 8 de `PantallaCaja`, 8 del panel, 5 de `ranking`); `tsc` sin salida; `npm test` sin fallas. Si `user.keyboard('{F2}')` no llega como `F2`, ver V29.

- [ ] **Step 10: Commit (sólo con OK de Felipe)**

```bash
git add src/caja src/test/caja.tsx src/estilos.css
git commit -m "feat(caja): panel sin código F2 con ranking fijo por turno" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 14: Pagos, comprobante y prueba de venta completa

**Files:**
- Create: `src/pagos/clientes.ts`, `src/pagos/SelectorCliente.tsx`, `src/pagos/Comprobante.tsx`, `src/pagos/PantallaPagos.tsx`
- Modify: `src/estilos.css` (agregar al final)
- Test: `src/pagos/PantallaPagos.test.tsx`, `tests/integracion/venta.test.ts`

Reglas (spec secciones 6 y 9):
- Medios: efectivo, transferencia, tarjeta (sólo se registra el importe) y fiado. Fiado aparece sólo si `fiadoHabilitado` (la tarea 17 lo lee con `fiadoActivo`, que llama a `modulo_activo('fiado')` de la tarea 9). La base lo rechaza igual si está apagado.
- Pagos combinables. Al abrir, el efectivo propone el total. Al enfocar un medio vacío, propone el saldo restante (`falta` de `calcularCobro`). Si el total cambia (precios actualizados), los importes se vuelven a proponer.
- "Entrega en efectivo" aparece si hay parte en efectivo; vacía = pago exacto. Vuelto, faltantes y errores salen de `calcularCobro` (tarea 5). Los importes se leen con `parsearPesos`: pesos enteros.
- Fiado exige elegir un cliente de la lista (`SelectorCliente`); el alta rápida (`alta_cliente`, tarea 9) está en el mismo selector, que sólo existe con el módulo activo.
- Confirmar: arma el `PedidoVenta`, saca el id con `sesion.ids.idPara(claveContenido(pedido))` al iniciar la confirmación (sólo en memoria) y llama a `confirmarVenta` (tarea 10). Botón deshabilitado y guarda con `useRef` durante la llamada (doble clic).
- Resultado: `confirmada` → `ids.reiniciar()` y comprobante; `precios_distintos` → muestra las diferencias y actualiza el carrito (el id sale nuevo solo porque cambia el contenido); `rechazada` → aviso (con `sin_turno` la caja pide abrir turno; con `venta_id_reusado` se reinicia el id); `error_red` → aviso y el carrito queda igual: tocar Confirmar de nuevo reintenta con el mismo id. No hay pantalla "Sin confirmar".
- Comprobante sólo en pantalla: número con prefijo (`formatearNumeroVenta`, `A-000123`), fecha y hora de Buenos Aires, líneas, pagos (el fiado sin nombre del cliente), total y vuelto. Queda visible hasta tocar "Nueva venta", que vacía el carrito.
- Un escaneo que cae en un importe (el foco está en el cobro) se ignora: el importe vuelve a lo que tenía antes de la racha y la caja avisa. Enter en un importe nunca confirma.

- [ ] **Step 1: Escribir la prueba de la pantalla de pagos**

`src/pagos/PantallaPagos.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AVISO_ESCANEO_EN_COBRO, type SesionCobro } from '../caja/PantallaCaja'
import { escanear, relojDePrueba, tipear } from '../test/caja'
import type { Cliente, LineaCarrito } from '../tipos'
import type { RespuestaRpc } from '../venta/confirmar'
import { crearIdVenta } from '../venta/idVenta'
import type { ServicioClientes } from './clientes'
import { PantallaPagos } from './PantallaPagos'

const LINEAS: LineaCarrito[] = [{ productoId: 'p1', nombre: 'Alfajor triple', precio: 900, cantidad: 2 }]
const JUAN: Cliente = { id: 'cli-1', nombre: 'Juan del 5to', telefono: null }

function sesionDePrueba(): SesionCobro {
  let n = 0
  return {
    lineas: LINEAS,
    total: 1800,
    ids: crearIdVenta(() => `id-${++n}`),
    volver: vi.fn(),
    nuevaVenta: vi.fn(),
    actualizarPrecios: vi.fn(),
    perderTurno: vi.fn(),
    avisar: vi.fn(),
  }
}

function clientesDePrueba(): ServicioClientes {
  return {
    listar: vi.fn(async () => [JUAN]),
    alta: vi.fn(async (nombre: string, telefono: string | null) => ({ id: 'cli-2', nombre, telefono })),
  }
}

const confirmada = (numero: number): RespuestaRpc => ({
  data: { estado: 'confirmada', venta_id: 'v', prefijo: 'A', numero, total: 1800, fecha: '2026-10-19T15:30:00Z', vuelto: 200, ya_existia: false },
  error: null,
})
const errorDeRed: RespuestaRpc = { data: null, error: { message: 'TypeError: Failed to fetch', code: '', details: '' } }

/** RPC falso que responde en orden; la última respuesta se repite. */
function rpcCon(...respuestas: RespuestaRpc[]) {
  const cola = [...respuestas]
  return vi.fn(async (_funcion: string, _args: Record<string, unknown>): Promise<RespuestaRpc> =>
    cola.length > 1 ? (cola.shift() as RespuestaRpc) : cola[0],
  )
}

function armar(opciones: { rpc?: ReturnType<typeof rpcCon>; fiado?: boolean } = {}) {
  const sesion = sesionDePrueba()
  const clientes = clientesDePrueba()
  const rpc = opciones.rpc ?? rpcCon(confirmada(123))
  const reloj = relojDePrueba()
  const user = userEvent.setup()
  render(
    <PantallaPagos
      sesion={sesion}
      dispositivoId="pc-1"
      fiadoHabilitado={opciones.fiado ?? true}
      clientes={clientes}
      rpc={rpc}
      ahora={reloj.ahora}
    />,
  )
  return { sesion, clientes, rpc, reloj, user }
}

const botonConfirmar = () => screen.getByRole('button', { name: 'Confirmar' })

describe('PantallaPagos', () => {
  it('propone el total en efectivo y calcula el vuelto exacto', async () => {
    const { user, reloj } = armar()
    expect(screen.getByLabelText('Efectivo')).toHaveValue('1800')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '2000')
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto: $200')
    expect(botonConfirmar()).toBeEnabled()
  })

  it('pagos combinados: un medio vacío propone el saldo restante', async () => {
    const { user, reloj } = armar()
    const efectivo = screen.getByLabelText('Efectivo')
    const tarjeta = screen.getByLabelText('Tarjeta')
    await user.clear(efectivo)
    await user.click(tarjeta)
    expect(tarjeta).toHaveValue('1800')
    await user.clear(tarjeta)
    await tipear(user, reloj, '1000')
    expect(screen.getByText('Faltan $800.')).toBeInTheDocument()
    await user.click(efectivo)
    expect(efectivo).toHaveValue('800')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '1000')
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto: $200')
    expect(botonConfirmar()).toBeEnabled()
  })

  it('sin el módulo fiado no aparece el medio fiado', () => {
    armar({ fiado: false })
    expect(screen.queryByLabelText('Fiado')).toBeNull()
    expect(screen.getByLabelText('Tarjeta')).toBeInTheDocument()
  })

  it('el fiado exige elegir un cliente; el alta rápida lo deja elegido', async () => {
    const { user, reloj, clientes } = armar()
    await user.clear(screen.getByLabelText('Efectivo'))
    await user.click(screen.getByLabelText('Fiado'))
    expect(screen.getByLabelText('Fiado')).toHaveValue('1800')
    expect(botonConfirmar()).toBeDisabled()
    await user.click(await screen.findByRole('button', { name: 'Juan del 5to' }))
    expect(screen.getByText('Juan del 5to')).toBeInTheDocument()
    expect(botonConfirmar()).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }))
    await user.click(screen.getByLabelText('Nombre o alias'))
    await tipear(user, reloj, 'Marta')
    await user.click(screen.getByRole('button', { name: 'Agregar cliente' }))
    expect(clientes.alta).toHaveBeenCalledWith('Marta', null)
    expect(await screen.findByText('Marta')).toBeInTheDocument()
    expect(botonConfirmar()).toBeEnabled()
  })

  it('doble clic: una sola llamada y el botón deshabilitado durante la confirmación', async () => {
    let soltar: (r: RespuestaRpc) => void = () => undefined
    const rpc = vi.fn(
      (_funcion: string, _args: Record<string, unknown>) =>
        new Promise<RespuestaRpc>((resolver) => {
          soltar = resolver
        }),
    )
    const sesion = sesionDePrueba()
    const user = userEvent.setup()
    render(<PantallaPagos sesion={sesion} dispositivoId="pc-1" fiadoHabilitado clientes={clientesDePrueba()} rpc={rpc} />)
    await user.dblClick(botonConfirmar())
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirmando…' })).toBeDisabled()
    await act(async () => soltar(confirmada(123)))
    expect(await screen.findByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
  })

  it('error de red: aviso, el carrito queda igual y el reintento usa el mismo id', async () => {
    const { user, rpc, sesion } = armar({ rpc: rpcCon(errorDeRed, confirmada(7)) })
    await user.click(botonConfirmar())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar')
    expect(sesion.actualizarPrecios).not.toHaveBeenCalled()
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
    await user.click(botonConfirmar())
    expect(await screen.findByRole('heading', { name: 'Venta A-000007' })).toBeInTheDocument()
    expect(rpc.mock.calls[1][1].p_venta_id).toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('si cambia el contenido después de un error, el id es nuevo', async () => {
    const { user, rpc, reloj } = armar({ rpc: rpcCon(errorDeRed, confirmada(8)) })
    await user.click(botonConfirmar())
    await screen.findByRole('alert')
    await user.click(screen.getByLabelText('Entrega en efectivo'))
    await tipear(user, reloj, '2000')
    await user.click(botonConfirmar())
    await screen.findByRole('heading', { name: 'Venta A-000008' })
    expect(rpc.mock.calls[1][1].p_venta_id).not.toBe(rpc.mock.calls[0][1].p_venta_id)
  })

  it('el comprobante muestra número con prefijo y vuelto hasta tocar Nueva venta', async () => {
    const { user, sesion } = armar()
    await user.click(botonConfirmar())
    expect(await screen.findByRole('heading', { name: 'Venta A-000123' })).toBeInTheDocument()
    expect(screen.getByText(/Vuelto/)).toHaveTextContent('Vuelto $200')
    expect(sesion.nuevaVenta).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Nueva venta' }))
    expect(sesion.nuevaVenta).toHaveBeenCalledTimes(1)
  })

  it('precio cambiado: muestra las diferencias y actualiza el carrito', async () => {
    const preciosDistintos: RespuestaRpc = {
      data: {
        estado: 'precios_distintos',
        diferencias: [{ producto_id: 'p1', nombre: 'Alfajor triple', precio_visto: 900, precio_actual: 1000 }],
      },
      error: null,
    }
    const { user, sesion } = armar({ rpc: rpcCon(preciosDistintos) })
    await user.click(botonConfirmar())
    expect(await screen.findByRole('list', { name: 'Precios que cambiaron' })).toHaveTextContent(
      'Alfajor triple: $900 → $1.000',
    )
    expect(sesion.actualizarPrecios).toHaveBeenCalledWith({ p1: 1000 })
  })

  it('un escaneo que cae en un importe se ignora y avisa', async () => {
    const { user, reloj, sesion } = armar()
    const entrega = screen.getByLabelText('Entrega en efectivo')
    await user.click(entrega)
    await tipear(user, reloj, '2000')
    await escanear(user, reloj, '7790001')
    expect(entrega).toHaveValue('2000')
    expect(sesion.avisar).toHaveBeenCalledWith(AVISO_ESCANEO_EN_COBRO)
  })
})
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx vitest run src/pagos`
Expected: FAIL: `Failed to resolve import "./clientes"` y `Failed to resolve import "./PantallaPagos"`.

- [ ] **Step 3: Implementar el servicio de clientes**

`src/pagos/clientes.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cliente } from '../tipos'

/** Clientes del fiado. Datos personales de terceros (Ley 25.326): sólo nombre o alias y teléfono. */
export interface ServicioClientes {
  listar(): Promise<Cliente[]>
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
        .select('id, nombre, telefono')
        .eq('suprimido', false)
        .order('nombre')
      if (error) throw error
      return data as Cliente[]
    },
    async alta(nombre, telefono) {
      const { data, error } = await supabase.rpc('alta_cliente', { p_nombre: nombre, p_telefono: telefono })
      if (error) throw error
      return data as Cliente
    },
  }
}
```

- [ ] **Step 4: Implementar el selector de cliente**

`src/pagos/SelectorCliente.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { normalizar } from '../catalogo/normalizar'
import type { Cliente } from '../tipos'
import type { ServicioClientes } from './clientes'

const MAX_CLIENTES = 8

const ERRORES_ALTA: Record<string, string> = {
  nombre_invalido: 'Escribí un nombre o alias (hasta 60 letras).',
  telefono_invalido: 'El teléfono sólo lleva números, espacios y + ( ) -.',
  fiado_deshabilitado: 'El fiado no está activo en este kiosco.',
}

export interface PropsSelectorCliente {
  servicio: ServicioClientes
  elegido: Cliente | null
  alElegir(cliente: Cliente | null): void
}

/** Sólo existe con el módulo fiado activo (lo decide PantallaPagos). Muestra sólo el nombre. */
export function SelectorCliente({ servicio, elegido, alElegir }: PropsSelectorCliente) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [alta, setAlta] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Una vez al montar: si el padre recrea el servicio en cada render, no se vuelve a pedir la lista.
  useEffect(() => {
    let vigente = true
    servicio.listar().then(
      (lista) => {
        if (vigente) setClientes(lista)
      },
      () => {
        if (vigente) setError('No se pudo leer la lista de clientes.')
      },
    )
    return () => {
      vigente = false
    }
  }, [])

  async function darDeAlta() {
    setGuardando(true)
    setError(null)
    try {
      const nuevo = await servicio.alta(nombre.trim(), telefono.trim() === '' ? null : telefono.trim())
      setClientes((lista) => [...(lista ?? []), nuevo])
      setAlta(false)
      setNombre('')
      setTelefono('')
      alElegir(nuevo)
    } catch (e) {
      const codigo = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
      setError(ERRORES_ALTA[codigo] ?? 'No se pudo dar de alta el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  if (elegido) {
    return (
      <div className="selector-cliente">
        <p>
          Fiado a: <strong>{elegido.nombre}</strong>
        </p>
        <button type="button" onClick={() => alElegir(null)}>
          Cambiar cliente
        </button>
      </div>
    )
  }

  const buscado = normalizar(filtro)
  const visibles = (clientes ?? []).filter((c) => normalizar(c.nombre).includes(buscado)).slice(0, MAX_CLIENTES)

  return (
    <fieldset className="selector-cliente">
      <legend>Cliente del fiado</legend>
      <label>
        Buscar cliente <input value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
      </label>
      {clientes === null && !error && <p>Cargando clientes…</p>}
      <ul aria-label="Clientes">
        {visibles.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => alElegir(c)}>
              {c.nombre}
            </button>
          </li>
        ))}
      </ul>
      {alta ? (
        <div className="alta-cliente">
          <label>
            Nombre o alias <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </label>
          <label>
            Teléfono (opcional){' '}
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="off" />
          </label>
          <button type="button" onClick={() => void darDeAlta()} disabled={guardando}>
            Agregar cliente
          </button>
          <button type="button" onClick={() => setAlta(false)} disabled={guardando}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAlta(true)}>
          Nuevo cliente
        </button>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
```

- [ ] **Step 5: Implementar el comprobante**

`src/pagos/Comprobante.tsx`:
```tsx
import { formatearPesos } from '../lib/plata'
import { NOMBRE_MEDIO, type LineaCarrito } from '../tipos'
import type { PagoAEnviar } from '../venta/cobro'
import { formatearNumeroVenta, type VentaConfirmada } from '../venta/confirmar'

const FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})

export interface PropsComprobante {
  venta: VentaConfirmada
  lineas: readonly LineaCarrito[]
  pagos: readonly PagoAEnviar[]
  alNuevaVenta(): void
}

/** Sólo en pantalla, no se imprime (spec sección 6). El fiado se muestra sin el nombre del cliente. */
export function Comprobante({ venta, lineas, pagos, alNuevaVenta }: PropsComprobante) {
  return (
    <section className="comprobante" aria-label="Comprobante">
      <h2>Venta {formatearNumeroVenta(venta.prefijo, venta.numero)}</h2>
      <p>{FECHA_HORA.format(new Date(venta.fecha))}</p>
      {venta.yaExistia && <p className="aviso">Esta venta ya estaba grabada: no se duplicó.</p>}
      <table aria-label="Productos">
        <tbody>
          {lineas.map((l) => (
            <tr key={l.productoId}>
              <td>
                {l.cantidad} × {l.nombre}
              </td>
              <td>{formatearPesos(l.precio * l.cantidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table aria-label="Pagos">
        <tbody>
          {pagos.map((p) => (
            <tr key={p.medio}>
              <td>{NOMBRE_MEDIO[p.medio]}</td>
              <td>{formatearPesos(p.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Total {formatearPesos(venta.total)}</p>
      <p className="vuelto">
        Vuelto <strong>{formatearPesos(venta.vuelto)}</strong>
      </p>
      <button type="button" autoFocus onClick={alNuevaVenta}>
        Nueva venta
      </button>
    </section>
  )
}
```

- [ ] **Step 6: Implementar la pantalla de pagos**

`src/pagos/PantallaPagos.tsx`:
```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AVISO_ESCANEO_EN_COBRO, type SesionCobro } from '../caja/PantallaCaja'
import { detectarEscaneo, type Pulsacion } from '../escaner/detector'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos, parsearPesos } from '../lib/plata'
import { MEDIOS, NOMBRE_MEDIO, type Cliente, type LineaCarrito, type Medio } from '../tipos'
import { calcularCobro, pagosAEnviar, type ErrorCobro, type ImportesPorMedio, type PagoAEnviar } from '../venta/cobro'
import {
  claveContenido,
  confirmarVenta,
  type DiferenciaPrecio,
  type ErrorConfirmar,
  type LlamarRpc,
  type PedidoVenta,
  type VentaConfirmada,
} from '../venta/confirmar'
import type { ServicioClientes } from './clientes'
import { Comprobante } from './Comprobante'
import { SelectorCliente } from './SelectorCliente'

const TEXTO_COBRO: Record<ErrorCobro, string> = {
  importe_invalido: 'Hay un importe mal escrito: sólo pesos enteros, sin centavos.',
  venta_vacia: 'La venta no tiene productos.',
  no_suma_total: 'Los pagos no suman el total.',
  efectivo_insuficiente: 'Lo entregado no alcanza para la parte en efectivo.',
  entrega_sin_efectivo: 'Hay entrega en efectivo pero ninguna parte se paga en efectivo.',
  fiado_deshabilitado: 'El fiado no está activo en este kiosco.',
  fiado_sin_cliente: 'Elegí el cliente del fiado.',
}

const TEXTO_RECHAZO: Record<ErrorConfirmar, string> = {
  ...TEXTO_COBRO,
  sin_cuenta: 'Esta cuenta no pertenece al kiosco. Volvé a iniciar sesión.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Volvé a iniciar sesión.',
  pedido_invalido: 'La venta llegó incompleta. Probá de nuevo.',
  venta_id_reusado: 'La venta cambió después de un intento. Tocá Confirmar de nuevo.',
  sin_turno: 'No hay turno abierto en esta PC.',
  producto_no_disponible: 'Un producto ya no está disponible. Volvé a la venta y quitalo.',
  linea_invalida: 'Hay una cantidad inválida en la venta.',
  pago_invalido: 'Hay un medio de pago repetido o inválido.',
  total_distinto: 'El total no coincide con el de la base. Volvé a la venta y confirmá de nuevo.',
}

const SIN_IMPORTES: Record<Medio, string> = { efectivo: '', transferencia: '', tarjeta: '', fiado: '' }

interface PropsCampoImporte {
  etiqueta: string
  valor: string
  autoFocus?: boolean
  umbrales: Umbrales
  ahora: () => number
  alCambiar(valor: string): void
  alEnfocar(): void
  alEscaneo(): void
}

/**
 * Importe en pesos enteros. Si llega un escaneo (el foco está en el cobro), el importe vuelve a lo
 * que tenía antes de la racha y se avisa. Enter nunca confirma desde un importe.
 */
function CampoImporte({ etiqueta, valor, autoFocus, umbrales, ahora, alCambiar, alEnfocar, alEscaneo }: PropsCampoImporte) {
  const pulsaciones = useRef<(Pulsacion & { valorAntes: string })[]>([])

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const escaneo = detectarEscaneo(pulsaciones.current, ahora(), umbrales)
      if (escaneo) {
        alCambiar(pulsaciones.current[escaneo.desde].valorAntes)
        alEscaneo()
      }
      pulsaciones.current = []
      return
    }
    if (e.key.length === 1) {
      pulsaciones.current = [
        ...pulsaciones.current,
        { tecla: e.key, t: ahora(), valorAntes: e.currentTarget.value },
      ].slice(-64)
    }
  }

  return (
    <label className="importe">
      <span>{etiqueta}</span>
      <input
        value={valor}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={alEnfocar}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={alTecla}
      />
    </label>
  )
}

export interface PropsPantallaPagos {
  sesion: SesionCobro
  dispositivoId: string
  /** modulo_activo('fiado'), leído por la tarea 17 con fiadoActivo. */
  fiadoHabilitado: boolean
  clientes: ServicioClientes
  /** (funcion, args) => supabase.rpc(funcion, args) */
  rpc: LlamarRpc
  umbrales?: Umbrales
  ahora?: () => number
}

interface DatosComprobante {
  venta: VentaConfirmada
  lineas: LineaCarrito[]
  pagos: PagoAEnviar[]
}

export function PantallaPagos({
  sesion,
  dispositivoId,
  fiadoHabilitado,
  clientes,
  rpc,
  umbrales = UMBRALES,
  ahora = () => performance.now(),
}: PropsPantallaPagos) {
  const [textos, setTextos] = useState<Record<Medio, string>>(() => ({ ...SIN_IMPORTES, efectivo: String(sesion.total) }))
  const [entrega, setEntrega] = useState('')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const enCurso = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [diferencias, setDiferencias] = useState<DiferenciaPrecio[]>([])
  const [comprobante, setComprobante] = useState<DatosComprobante | null>(null)
  const totalVisto = useRef(sesion.total)

  // Si el total cambia (precios actualizados tras un rechazo), los importes se vuelven a proponer.
  useEffect(() => {
    if (totalVisto.current === sesion.total) return
    totalVisto.current = sesion.total
    setTextos({ ...SIN_IMPORTES, efectivo: String(sesion.total) })
    setEntrega('')
  }, [sesion.total])

  const medios = MEDIOS.filter((m) => m !== 'fiado' || fiadoHabilitado)
  const leer = (texto: string) => parsearPesos(texto) ?? Number.NaN
  const importes: ImportesPorMedio = {
    efectivo: leer(textos.efectivo),
    transferencia: leer(textos.transferencia),
    tarjeta: leer(textos.tarjeta),
    fiado: fiadoHabilitado ? leer(textos.fiado) : 0,
  }
  const hayEfectivo = importes.efectivo > 0
  const entregado = hayEfectivo && entrega.trim() !== '' ? leer(entrega) : null
  const cobro = calcularCobro({
    total: sesion.total,
    importes,
    efectivoEntregado: entregado,
    clienteFiadoId: cliente?.id ?? null,
    fiadoHabilitado,
  })
  const problemas = cobro.errores.map((e) =>
    e === 'no_suma_total'
      ? cobro.falta > 0
        ? `Faltan ${formatearPesos(cobro.falta)}.`
        : `Sobran ${formatearPesos(-cobro.falta)}.`
      : TEXTO_COBRO[e],
  )

  /** Un medio vacío, al enfocarlo, propone el saldo restante. */
  function proponer(medio: Medio) {
    if (textos[medio].trim() === '' && cobro.falta > 0) {
      setTextos((t) => ({ ...t, [medio]: String(cobro.falta) }))
    }
  }

  const avisarEscaneo = () => sesion.avisar(AVISO_ESCANEO_EN_COBRO)

  async function confirmar() {
    if (enCurso.current || !cobro.valido) return
    enCurso.current = true
    setConfirmando(true)
    setError(null)
    setDiferencias([])
    const pedido: PedidoVenta = {
      dispositivoId,
      lineas: sesion.lineas,
      pagos: pagosAEnviar(importes, cliente?.id ?? null),
      total: sesion.total,
      efectivoEntregado: entregado,
    }
    // El id se ata al contenido: mismo contenido, mismo id (reintento); otro contenido, id nuevo.
    const ventaId = sesion.ids.idPara(claveContenido(pedido))
    const r = await confirmarVenta(rpc, ventaId, pedido)
    enCurso.current = false
    setConfirmando(false)

    switch (r.tipo) {
      case 'confirmada':
        sesion.ids.reiniciar()
        setComprobante({ venta: r.venta, lineas: pedido.lineas, pagos: pedido.pagos })
        return
      case 'precios_distintos':
        setDiferencias(r.diferencias)
        sesion.actualizarPrecios(Object.fromEntries(r.diferencias.map((d) => [d.productoId, d.precioActual])))
        setError('Cambiaron precios en el catálogo. Revisá el total nuevo y confirmá de nuevo.')
        return
      case 'rechazada':
        if (r.codigo === 'sin_turno') {
          sesion.perderTurno()
          return
        }
        if (r.codigo === 'venta_id_reusado') sesion.ids.reiniciar()
        setError(TEXTO_RECHAZO[r.codigo])
        return
      case 'error_red':
        setError(
          'No se pudo confirmar. Revisá la conexión y tocá Confirmar de nuevo: si la venta ya se había grabado, no se duplica.',
        )
        return
      case 'desconocido':
        setError(`Error inesperado al confirmar (${r.mensaje}). Probá de nuevo.`)
    }
  }

  if (comprobante) {
    return (
      <Comprobante
        venta={comprobante.venta}
        lineas={comprobante.lineas}
        pagos={comprobante.pagos}
        alNuevaVenta={sesion.nuevaVenta}
      />
    )
  }

  return (
    <section className="pagos" aria-label="Cobro">
      <h2>Total {formatearPesos(sesion.total)}</h2>
      {medios.map((m, i) => (
        <CampoImporte
          key={m}
          etiqueta={NOMBRE_MEDIO[m]}
          valor={textos[m]}
          autoFocus={i === 0}
          umbrales={umbrales}
          ahora={ahora}
          alCambiar={(v) => setTextos((t) => ({ ...t, [m]: v }))}
          alEnfocar={() => proponer(m)}
          alEscaneo={avisarEscaneo}
        />
      ))}
      {hayEfectivo && (
        <CampoImporte
          etiqueta="Entrega en efectivo"
          valor={entrega}
          umbrales={umbrales}
          ahora={ahora}
          alCambiar={setEntrega}
          alEnfocar={() => undefined}
          alEscaneo={avisarEscaneo}
        />
      )}
      <p className="vuelto">
        Vuelto: <strong>{formatearPesos(cobro.vuelto)}</strong>
      </p>
      {fiadoHabilitado && importes.fiado > 0 && (
        <SelectorCliente servicio={clientes} elegido={cliente} alElegir={setCliente} />
      )}
      {problemas.length > 0 && (
        <ul className="problemas" aria-label="Falta para confirmar">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {diferencias.length > 0 && (
        <ul aria-label="Precios que cambiaron">
          {diferencias.map((d) => (
            <li key={d.productoId}>
              {d.nombre}: {formatearPesos(d.precioVisto)} → {formatearPesos(d.precioActual)}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="button" onClick={() => void confirmar()} disabled={confirmando || !cobro.valido}>
        {confirmando ? 'Confirmando…' : 'Confirmar'}
      </button>
      <button type="button" onClick={sesion.volver} disabled={confirmando}>
        Volver a la venta
      </button>
    </section>
  )
}
```

- [ ] **Step 7: Agregar los estilos del cobro**

Al final de `src/estilos.css`:
```css
/* Pagos y comprobante (tarea 14) */
.pagos, .comprobante { display: grid; gap: 0.6rem; padding: 1rem; border: 1px solid var(--color-borde); border-radius: 6px; background: #fff; }
.importe { display: grid; grid-template-columns: 12rem 1fr; align-items: center; gap: 0.5rem; }
.vuelto { font-size: 1.4rem; }
.problemas { margin: 0; color: #8a1c1c; }
.selector-cliente ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
```

- [ ] **Step 8: Correr las pruebas de pagos y los tipos**

Run:
```bash
npx vitest run src/pagos
npx tsc --noEmit
```
Expected: `Test Files  1 passed (1)` y `Tests  10 passed (10)`; `tsc` sin salida. Si la prueba de doble clic ve dos llamadas, revisar que la guarda `enCurso` se ponga antes del primer `await`.

- [ ] **Step 9: Escribir la prueba de venta completa contra Supabase local**

No usa `src/lib/supabase.ts` (tarea 7) a propósito: ese cliente es único, con una sola sesión, y lee variables `VITE_*` que `.env.integracion.local` no tiene. La prueba usa las mismas funciones de la app (`abrirTurno`, `confirmarVenta`, `claveContenido`, `crearIdVenta`, `pagosAEnviar`, `crearServicioClientes`, `fiadoActivo`) con el mismo adaptador `(funcion, args) => cliente.rpc(funcion, args)` que arma la tarea 17, sobre los clientes logueados de `tests/soporte/admin.ts`.

`tests/integracion/venta.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { crearServicioClientes, fiadoActivo } from '../../src/pagos/clientes'
import { abrirTurno } from '../../src/turno/turno'
import { pagosAEnviar, type ImportesPorMedio } from '../../src/venta/cobro'
import {
  claveContenido,
  confirmarVenta,
  type LlamarRpc,
  type PedidoVenta,
  type ResultadoConfirmar,
  type VentaConfirmada,
} from '../../src/venta/confirmar'
import { crearIdVenta } from '../../src/venta/idVenta'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

interface ProductoDePrueba {
  id: string
  nombre: string
  precio: number
}

/** El mismo adaptador que arma la app (parte 2, "Para las partes siguientes"). */
const rpcDe =
  (cliente: SupabaseClient): LlamarRpc =>
  (funcion, args) =>
    cliente.rpc(funcion, args)

const SIN_PAGOS: ImportesPorMedio = { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 }

async function prepararKiosco(nombre: string, conTurno = true) {
  const kiosco = await crearKioscoDePrueba(nombre)
  const productos = await clienteAdmin()
    .from('productos')
    .insert([
      { negocio_id: kiosco.negocioId, nombre: 'Alfajor', precio: 900 },
      { negocio_id: kiosco.negocioId, nombre: 'Gaseosa', precio: 1500 },
    ])
    .select('id, nombre, precio')
  if (productos.error) throw productos.error
  const alfajor = (productos.data as ProductoDePrueba[]).find((p) => p.nombre === 'Alfajor')
  if (!alfajor) throw new Error('No se creó el alfajor de prueba')
  const dispositivoId = crypto.randomUUID()
  const alta = await kiosco.caja.cliente.rpc('registrar_dispositivo', { p_dispositivo_id: dispositivoId })
  if (alta.error) throw alta.error
  if (conTurno) await abrirTurno(kiosco.caja.cliente, dispositivoId)
  return { kiosco, dispositivoId, alfajor, rpc: rpcDe(kiosco.caja.cliente) }
}

function pedidoDe(
  dispositivoId: string,
  producto: ProductoDePrueba,
  cantidad = 1,
  importes?: ImportesPorMedio,
  clienteId: string | null = null,
): PedidoVenta {
  const total = producto.precio * cantidad
  return {
    dispositivoId,
    lineas: [{ productoId: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad }],
    pagos: pagosAEnviar(importes ?? { ...SIN_PAGOS, efectivo: total }, clienteId),
    total,
    efectivoEntregado: null,
  }
}

function venta(r: ResultadoConfirmar): VentaConfirmada {
  if (r.tipo !== 'confirmada') throw new Error(`Se esperaba una venta confirmada y llegó ${JSON.stringify(r)}`)
  return r.venta
}

async function contarVentas(negocioId: string): Promise<number> {
  const { count, error } = await clienteAdmin()
    .from('ventas')
    .select('id', { count: 'exact', head: true })
    .eq('negocio_id', negocioId)
  if (error) throw error
  return count ?? 0
}

describe('venta completa contra Supabase local', () => {
  it('confirma una venta y la numera desde 1 con el prefijo de la PC', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco venta')
    const v = venta(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor, 2)))
    expect(v).toMatchObject({ prefijo: 'A', numero: 1, total: 1800, yaExistia: false })
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('el reintento con el mismo id devuelve la misma venta, sin duplicar', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco reintento')
    const pedido = pedidoDe(dispositivoId, alfajor)
    const ids = crearIdVenta()
    const primera = venta(await confirmarVenta(rpc, ids.idPara(claveContenido(pedido)), pedido))
    const reintento = venta(await confirmarVenta(rpc, ids.idPara(claveContenido(pedido)), pedido))
    expect(reintento).toMatchObject({ ventaId: primera.ventaId, numero: primera.numero, yaExistia: true })
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('doble clic: el mismo id dos veces a la vez deja una sola venta', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco doble clic')
    const pedido = pedidoDe(dispositivoId, alfajor)
    const id = crypto.randomUUID()
    const [a, b] = await Promise.all([confirmarVenta(rpc, id, pedido), confirmarVenta(rpc, id, pedido)])
    expect(venta(a).numero).toBe(venta(b).numero)
    expect(await contarVentas(kiosco.negocioId)).toBe(1)
  })

  it('dos pestañas: ids distintos a la vez no repiten números ni dejan huecos', async () => {
    const { dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco pestañas')
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))),
    )
    expect(resultados.map((r) => venta(r).numero).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5])
  })

  it('sin turno abierto la base rechaza la venta', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco sin turno', false)
    expect(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))).toMatchObject({
      tipo: 'rechazada',
      codigo: 'sin_turno',
    })
    expect(await contarVentas(kiosco.negocioId)).toBe(0)
  })

  it('precio cambiado: no graba nada y devuelve las diferencias', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco precio')
    const cambio = await clienteAdmin().from('productos').update({ precio: 1000 }).eq('id', alfajor.id)
    if (cambio.error) throw cambio.error
    expect(await confirmarVenta(rpc, crypto.randomUUID(), pedidoDe(dispositivoId, alfajor))).toEqual({
      tipo: 'precios_distintos',
      diferencias: [{ productoId: alfajor.id, nombre: 'Alfajor', precioVisto: 900, precioActual: 1000 }],
    })
    expect(await contarVentas(kiosco.negocioId)).toBe(0)
  })

  it('fiado parcial con un cliente dado de alta desde la caja', async () => {
    const { kiosco, dispositivoId, alfajor, rpc } = await prepararKiosco('Kiosco fiado')
    expect(await fiadoActivo(kiosco.caja.cliente)).toBe(true)
    const servicio = crearServicioClientes(kiosco.caja.cliente)
    const cliente = await servicio.alta('Juan del 5to', null)
    const pedido = pedidoDe(dispositivoId, alfajor, 1, { ...SIN_PAGOS, efectivo: 400, fiado: 500 }, cliente.id)
    expect(venta(await confirmarVenta(rpc, crypto.randomUUID(), pedido)).total).toBe(900)
    expect(await servicio.listar()).toEqual([cliente])
  })

  it('dos PCs que se registran a la vez reciben prefijos distintos (V20)', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco dos PCs')
    const [a, b] = await Promise.all(
      [1, 2].map(() => kiosco.caja.cliente.rpc('registrar_dispositivo', { p_dispositivo_id: crypto.randomUUID() })),
    )
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect([a.data.prefijo, b.data.prefijo].sort()).toEqual(['A', 'B'])
  })

  it('una cuenta de otro kiosco no confirma con una PC ajena', async () => {
    const a = await prepararKiosco('Kiosco A aislado')
    const b = await crearKioscoDePrueba('Kiosco B aislado')
    expect(
      await confirmarVenta(rpcDe(b.caja.cliente), crypto.randomUUID(), pedidoDe(a.dispositivoId, a.alfajor)),
    ).toMatchObject({ tipo: 'rechazada', codigo: 'dispositivo_desconocido' })
    expect(await contarVentas(a.kiosco.negocioId)).toBe(0)
  })
})
```

- [ ] **Step 10: Correr la prueba de integración**

Run:
```bash
npx supabase db reset
npx vitest run --config vitest.integracion.config.ts tests/integracion/venta.test.ts
```
Expected: `Test Files  1 passed (1)` y `Tests  9 passed (9)`. Si "sin turno abierto" llega como `error_red` en vez de `rechazada`, ver V5 (parte 1). Si "dos PCs" repite prefijo, ver V20 (parte 2). Si "dos pestañas" falla con `duplicate key value violates unique constraint`, el bloqueo de la PC en `confirmar_venta` no está serializando: revisar el `for update` del paso 2 de la tarea 10.

- [ ] **Step 11: Correr todo**

Run:
```bash
npx tsc --noEmit
npm test
npm run test:integracion
npx supabase test db
```
Expected: `tsc` sin salida; `npm test` sin fallas; `npm run test:integracion` con `Test Files  3 passed (3)` (token, catálogo y venta) y sin fallas; `supabase test db` con `All tests successful.` y `Result: PASS`.

- [ ] **Step 12: Commit (sólo con OK de Felipe)**

```bash
git add src/pagos src/estilos.css tests/integracion/venta.test.ts
git commit -m "feat(pagos): cobro combinado, fiado con cliente, confirmación con reintento y comprobante" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Nombres nuevos que define la parte 3

### Migraciones y funciones de la base

Ninguna tabla ni columna nueva. Todas las funciones: `security definer`, `set search_path = ''`, negocio del token, rol desde `cuentas`, `revoke` a `public`, `anon` y `authenticated`, `grant execute` a `authenticated`.

| Archivo | Nombre y firma | Devuelve |
|---|---|---|
| `supabase/migrations/20261019121100_anular_venta.sql` | `anular_venta(p_venta_id uuid, p_dispositivo_id uuid, p_motivo text) returns jsonb` | `{anulacion_id, venta_id, fecha, motivo, ya_existia}`. Escribe en `anulaciones` y en `historial` (`tipo = 'anulacion'`, `entidad = 'ventas'`, `entidad_id` = venta, `valor_anterior = {total, fecha_venta}`, `valor_nuevo = {anulacion_id}`, `motivo`). |
| `supabase/migrations/20261019121200_ranking_sin_codigo.sql` | `ranking_sin_codigo() returns table (producto_id uuid, nombre text, cantidad_ventas integer)` | Activos sin código del negocio, también con 0 ventas; orden: ventas desc, `lower(nombre)`, id. `stable`. |
| `supabase/migrations/20261019121300_caja_del_dia.sql` | `caja_del_dia(p_fecha date) returns jsonb` | `{fecha, efectivo, transferencia, tarjeta, cobrado, fiado, anulaciones: {cantidad, efectivo, transferencia, tarjeta, fiado, total, detalle: [{venta_id, prefijo, numero, fecha_venta, fecha, total, motivo}]}}`. `stable`. |
| `supabase/migrations/20261019121300_caja_del_dia.sql` | `ventas_del_dia(p_fecha date) returns table (venta_id uuid, prefijo text, numero integer, hora text, total integer, medios jsonb, anulada boolean)` | `medios = [{medio, importe}]` en el orden del enum; orden de filas: fecha desc. `stable`. |

Códigos de error nuevos (`message`, `code` = `P0001`): `venta_desconocida`, `fuera_de_dia`, `motivo_invalido`, `fecha_invalida`. Reusa `sin_cuenta` y `dispositivo_desconocido`.

Cambio en una prueba existente: `supabase/tests/database/150_permisos_funciones.test.sql`, prueba 5, suma `anular_venta`, `caja_del_dia`, `ranking_sin_codigo` y `ventas_del_dia`.

### Archivos y nombres de TypeScript

| Archivo | Exporta |
|---|---|
| `src/escaner/umbrales.ts` | `Umbrales` (`intervaloEscaneoMs`, `minimoCaracteres`, `dobleLecturaMs`), `UMBRALES` (50, 4, 150) |
| `src/escaner/detector.ts` | `Pulsacion`, `Escaneo` (`codigo`, `desde`), `detectarEscaneo(pulsaciones, tEnter, umbrales)` |
| `src/escaner/dobleLectura.ts` | `Lectura`, `FiltroDobleLectura`, `esDobleLectura`, `crearFiltroDobleLectura` |
| `src/escaner/calibrar.ts` | `intervalos`, `ResumenCalibracion`, `umbralSugerido` |
| `src/escaner/Calibracion.tsx` | `Calibracion({ ahora? })`, `LECTURAS_CALIBRACION` (10) |
| `src/ui/pitido.ts` | `pitido(frecuenciaHz = 1000, duracionS = 0.08)` |
| `src/caja/catalogoCaja.ts` | `CatalogoCaja` (`porCodigo`, `porNombre`, `sinCodigo`), `crearCatalogoCaja(db)` |
| `src/caja/CampoEscaneo.tsx` | `PropsCampoEscaneo`, `CampoEscaneo` |
| `src/caja/ListaSugerencias.tsx` | `PropsListaSugerencias`, `ListaSugerencias` |
| `src/caja/LineasVenta.tsx` | `PropsLineasVenta`, `LineasVenta` |
| `src/caja/PantallaCaja.tsx` | `AVISO_ESCANEO_EN_COBRO`, `ServicioTurno` (`leer`, `abrir`), `SesionCobro` (`lineas`, `total`, `ids`, `volver`, `nuevaVenta`, `actualizarPrecios`, `perderTurno`, `avisar`), `PropsPantallaCaja` (`catalogo`, `turno`, `leerRanking`, `cobro`, `umbrales?`, `ahora?`, `pitar?`), `PantallaCaja` |
| `src/caja/ranking.ts` | `FilaRanking` (= `Omit<ItemRanking, 'precio'>`), `LUGARES_PANEL` (20), `leerRankingSinCodigo(supabase)`, `ordenarSinCodigo`, `filtrarPanel` |
| `src/caja/PanelSinCodigo.tsx` | `PropsPanelSinCodigo`, `PanelSinCodigo` |
| `src/pagos/clientes.ts` | `ServicioClientes` (`listar`, `alta`), `fiadoActivo(supabase)`, `crearServicioClientes(supabase)` |
| `src/pagos/SelectorCliente.tsx` | `PropsSelectorCliente`, `SelectorCliente` |
| `src/pagos/Comprobante.tsx` | `PropsComprobante`, `Comprobante` |
| `src/pagos/PantallaPagos.tsx` | `PropsPantallaPagos` (`sesion`, `dispositivoId`, `fiadoHabilitado`, `clientes`, `rpc`, `umbrales?`, `ahora?`), `PantallaPagos` |
| `src/test/caja.tsx` | Ayudas de prueba: productos (`ALFAJOR`, `AGUA`, `ALFAJOR_SIMPLE`, `BIZCOCHOS`, `CHIPA`, `FACTURAS`, `PAN_VIEJO`, `TURRON_VIEJO`, `PRODUCTOS_DE_PRUEBA`), `catalogoDePrueba`, `relojDePrueba`, `Reloj`, `Usuario`, `turnoDePrueba`, `escanear`, `tipear`, `OpcionesCaja`, `armarCaja` |

Clases CSS nuevas en `src/estilos.css`: `.caja`, `.campo-escaneo`, `.sugerencias`, `.sugerencia`, `.sugerencia--elegida`, `.linea--nueva`, `.cantidad`, `.boton-cobrar`, `.calibracion`, `.panel-sin-codigo`, `.panel-sin-codigo__grilla`, `.panel-sin-codigo__boton`, `.pagos`, `.comprobante`, `.importe`, `.vuelto`, `.problemas`, `.selector-cliente`. Se usan sin estilo propio: `.caja-cargando`, `.venta-vacia`, `.lineas`, `.linea`, `.boton-sin-codigo`, `.alta-cliente`.

Claves del navegador: ninguna nueva. La calibración no guarda nada; el id de venta sigue sólo en memoria (vive en `PantallaCaja`, no en `PantallaPagos`).

### Pruebas nuevas

- pgTAP: `supabase/tests/database/090_anular_venta.test.sql` (22), `100_ranking_sin_codigo.test.sql` (13), `110_caja_del_dia.test.sql` (25).
- Vitest: `src/escaner/detector.test.ts` (9), `src/escaner/dobleLectura.test.ts` (7), `src/escaner/calibrar.test.ts` (3), `src/ui/pitido.test.ts` (2), `src/caja/catalogoCaja.test.ts` (3), `src/caja/PantallaCaja.test.tsx` (8), `src/caja/ranking.test.ts` (5), `src/caja/PanelSinCodigo.test.tsx` (8), `src/pagos/PantallaPagos.test.tsx` (10).
- Integración: `tests/integracion/venta.test.ts` (9).

### Para las partes siguientes

- **Tarea 15 (alta rápida y reactivar):** hoy `PantallaCaja` sólo avisa `Código X no encontrado. Buscalo por nombre.` y `X está desactivado.`. La tarea 15 tiene que agregar una prop (por ejemplo `alCodigoDesconocido(codigo)` y `alProductoInactivo(producto)`) en las dos ramas de `escanear` y abrir `AltaRapidaProducto`; después de un alta, agregar el producto con la misma función `agregar`.
- **Tarea 16 (caja del día):** `CajaDelDia.tsx` llama a `caja_del_dia(p_fecha)` y `VentasDelDia.tsx` a `ventas_del_dia(p_fecha)` y a `anular_venta(p_venta_id, p_dispositivo_id, p_motivo)`. Para la caja, `p_fecha` = hoy en Buenos Aires; si manda otro día, recibe `fuera_de_dia`. La UI no debe calcular totales: los devuelve la base.
- **Tarea 17 (armado):** `PantallaCaja` con `catalogo={crearCatalogoCaja(cacheDeLaApp())}`, `turno={{ leer: () => leerTurnoAbierto(supabase, id), abrir: () => abrirTurno(supabase, id) }}`, `leerRanking={() => leerRankingSinCodigo(supabase)}` y `cobro={(s) => <PantallaPagos sesion={s} dispositivoId={id} fiadoHabilitado={fiado} clientes={clientes} rpc={rpc} />}`. Crear `clientes = crearServicioClientes(supabase)` y `rpc = (f, a) => supabase.rpc(f, a)` una sola vez (por ejemplo con `useMemo` o fuera del componente), y leer `fiado` con `fiadoActivo(supabase)` después del login. Dejar un acceso a `Calibracion` (por ejemplo desde la pantalla del jefe).
- **Tareas 15 y 16:** si agregan funciones `security definer` para la app, sumar sus nombres a la prueba 5 de `150_permisos_funciones.test.sql`, que después de esta parte tiene nueve nombres.

## Verificaciones de la parte 3

Verificado contra la documentación oficial (2026-10-19):
- `AudioNode.connect()` devuelve el nodo destino y se puede encadenar (`osc.connect(gain).connect(ctx.destination)`): https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/connect
- `keydown` (salvo Esc y atajos reservados) es un evento de activación del usuario, y Web Audio (`AudioContext`) requiere activación persistente ("sticky"): https://developer.mozilla.org/en-US/docs/Web/Security/User_activation
- user-event: opción `delay` (por defecto 0, espera con `setTimeout` entre teclas): https://testing-library.com/docs/user-event/options

| # | Qué | Dónde se usa | Cómo verificar |
|---|---|---|---|
| V21 | Que user-event no mueva el foco cuando el `mousedown` del botón tiene `preventDefault` (botones con `tabIndex={-1}`). La doc de opciones no lo dice. | Tareas 12 y 13: pruebas que piden `toHaveFocus()` después de un clic | La pantalla además llama a `campo.focus()` después de cada acción, así que la prueba pasa igual; confirmar el comportamiento real en el navegador del kiosco (clic en "+" y seguir escaneando sin tocar el campo). https://testing-library.com/docs/user-event/pointer |
| V22 | Que el escáner real mande cada carácter como `keydown` con `e.key` de un solo carácter (incluidos `-` y letras) y termine en `Enter` (no `Tab` ni dos Enter). | Tarea 12, `CampoEscaneo` y `detectarEscaneo` | Pantalla `Calibracion` con el escáner real: si no cuenta lecturas, el escáner manda otro sufijo; configurarlo para Enter según su manual. |
| V23 | Que el `pitido` suene desde el primer producto en Chrome/Edge del kiosco: el `AudioContext` se crea dentro del `keydown` del escáner; si nace `suspended`, se llama a `resume()`. La doc no confirma el comportamiento exacto de `resume()`. | Tarea 12, `src/ui/pitido.ts` | A mano en la PC del kiosco: recargar, escanear el primer producto y escuchar. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume |
| V24 | Que `select ... for update` sobre `ventas` dentro de `anular_venta` no dispare el trigger `ventas_solo_agrega` (es `before update or delete`; un bloqueo de fila no es un `update`). | Tarea 11, `anular_venta` | `090_anular_venta.test.sql`, prueba 1: si falla con `ventas: no se edita ni se borra`, cambiar el bloqueo por `perform pg_advisory_xact_lock(hashtext(p_venta_id::text))`. https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE |
| V25 | Que `#variable_conflict use_column` vaya al comienzo del cuerpo (antes de `declare`) y evite la ambigüedad entre las columnas de `returns table` y las de las consultas. | Tarea 11, `ranking_sin_codigo` y `ventas_del_dia` | `npx supabase db reset` y `100`/`110`: si aparece `column reference "..." is ambiguous`, revisar que todas las columnas estén calificadas con su alias. https://www.postgresql.org/docs/current/plpgsql-implementation.html |
| V26 | Que `p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires'` dé la medianoche local de ese día como `timestamptz`. | Tarea 11, `caja_del_dia` y `ventas_del_dia` | `110_caja_del_dia.test.sql`: si los totales de hoy salen en cero o con ventas de ayer, comparar con `select public.dia_operativo(now()), (public.hoy())::timestamp at time zone 'America/Argentina/Buenos_Aires';`. https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT |
| V27 | Que `supabase.rpc('ranking_sin_codigo')` sin argumentos, sobre una función `returns table`, devuelva un arreglo de objetos `{producto_id, nombre, cantidad_ventas}`, y que `supabase.rpc('ventas_del_dia', { p_fecha })` acepte la fecha como texto `YYYY-MM-DD`. No lo cubre ninguna prueba de esta parte. | Tarea 13 (`leerRankingSinCodigo`); tarea 16 | Con la app corriendo (tarea 17), abrir el panel F2 y ver el orden; o agregar una prueba en `tests/integracion/venta.test.ts`. https://supabase.com/docs/reference/javascript/rpc |
| V28 | Que Testing Library calcule el nombre accesible de una `<tr>` desde su contenido (`getByRole('row', { name: /Alfajor/ })`) y que `getByText(/Vuelto/)` encuentre sólo el `<p>` con ese texto propio. | Tareas 12, 13 y 14 (pruebas de componentes) | Si fallan esas consultas, cambiar por `screen.getByText('Alfajor triple').closest('tr')` y por un `data-testid="vuelto"`. https://testing-library.com/docs/queries/byrole y https://testing-library.com/docs/queries/bytext |
| V29 | Que `user.keyboard('{F2}')` y `'{Escape}'` lleguen con `e.key` igual a `F2` y `Escape` (mapa de teclado por defecto de user-event). | Tarea 13, `PanelSinCodigo.test.tsx` | Si la grilla no abre en la prueba, probar `fireEvent.keyDown(campo, { key: 'F2' })`. https://testing-library.com/docs/user-event/keyboard |

## Decisiones de la parte 3

- `ranking_sin_codigo` es `security definer` (el spec dice invoker): devuelve sólo producto, nombre y cantidad de ventas del negocio del token; alternativa: invoker, con un ranking sólo de hoy para la caja; si se aprueba, cambiar las secciones 6, 10, 11 y 13 del spec como dice la nota de la tarea 11.
- El ranking incluye los productos sin código no vendidos (con 0) para que la grilla los muestre todos; el precio sale de la caché, no del ranking (`FilaRanking` sin `precio`, aunque `ItemRanking` de la parte 1 lo traiga).
- La grilla F2 muestra como máximo 20 productos (4 × 5); los demás se encuentran escribiendo en el campo.
- Si el ranking no se puede leer, la grilla queda en orden alfabético y no se reintenta durante el turno.
- El ranking se pide también al cargar la caja con un turno ya abierto (por ejemplo después de F5), no sólo en el momento de abrir el turno.
- El motivo de anulación va de 3 a 200 caracteres (mismo check de la tarea 3); menos de 3 es `motivo_invalido`.
- La regla de día por rol se chequea antes de devolver una anulación existente: la caja recibe `fuera_de_dia` con una venta de ayer aunque ya esté anulada.
- La anulación guarda el dispositivo desde el que se anula, que puede no ser el de la venta.
- La caja del día puede mostrar un medio en negativo si hoy se anula una venta de otro día; el fiado también se resta al anular.
- El detalle de anulaciones de `caja_del_dia` incluye el motivo escrito por el cajero.
- `ventas_del_dia` se define aunque la parte 2 decía que no hacía falta (lo pidió este reparto); la hora va como `HH24:MI` de Buenos Aires.
- Umbrales iniciales del escáner: 50 ms entre caracteres, mínimo 4 caracteres y 150 ms de lectura doble (supuesto hasta calibrar).
- La lectura doble se compara contra la lectura anterior aunque esa también se haya ignorado.
- Un producto desactivado escaneado sólo avisa hasta que la tarea 15 agregue reactivar.
- Un escaneo que cae en un importe del cobro restaura ese importe y avisa; Enter en un importe nunca confirma.
- El cobro arranca con el total en efectivo; un medio vacío, al enfocarlo, propone el saldo restante; si cambia el total por precios, los importes se vuelven a proponer.
- El comprobante no muestra el nombre del cliente del fiado, sólo el importe.
- Un escaneo con el comprobante a la vista se ignora (el cobro sigue abierto hasta "Nueva venta").
- La prueba de integración no usa `src/lib/supabase.ts` (cliente único con una sola sesión y variables `VITE_*`): usa las mismas funciones de la app con los clientes de `tests/soporte/admin.ts`.

# Parte 4: Productos, jefe, caja del día y login por rol (tareas 15 a 17)

**Goal:** pantalla de precios y productos con alta rápida y reactivar desde la caja, historial de auditoría de productos (también desde Studio), funciones del jefe (módulo fiado y anonimización), caja del día con anulación, y el login por rol que arma la app entera.

**Architecture:** igual que las partes 1 a 3. Las escrituras van por funciones `security definer` con `set search_path = ''`, negocio del token y rol leído de `cuentas`; el historial de productos lo escribe un trigger, así también queda lo que se cambie desde Supabase Studio. La interfaz recibe servicios por props (en las pruebas, falsos con `vi.fn`); `src/servicios.ts` arma los reales con Supabase y Dexie, y `src/main.tsx` se los pasa a `App`.

**Tech Stack:** Vite, React, TypeScript, Vitest + Testing Library + user-event, supabase-js, Supabase CLI con pgTAP (`supabase test db`), Dexie.

Reparto: P1 = tareas 0 a 5; P2 = tareas 6 a 10; P3 = tareas 11 a 14; **P4 = tareas 15 a 17 (este archivo)**; P5 = tareas 18 y 19.

Valen todas las reglas de "Antes de empezar" de la parte 1: cargar la skill `ponytail` antes de programar; commits sólo con OK de Felipe; comandos en Git Bash desde `cd "/c/Users/felipe/Desktop/app negocios"`; Docker corriendo para `npx supabase test db`.

---

### Tarea 15: Productos y precios (SQL con pgTAP; React con Testing Library)

**Files:**
- Create: `supabase/migrations/20261019121500_productos.sql`
- Create: `supabase/migrations/20261019121600_historial_productos.sql`
- Modify: `supabase/tests/database/010_rls.test.sql` (prueba 25: el jefe ve también el alta del producto)
- Modify: `supabase/tests/database/150_permisos_funciones.test.sql` (prueba 5: suma `alta_producto_caja` y `editar_producto`)
- Create: `src/productos/productos.ts`, `src/productos/AltaRapidaProducto.tsx`, `src/productos/PantallaProductos.tsx`, `src/test/productos.ts`
- Modify: `src/caja/PantallaCaja.tsx` (prop `productos`: alta rápida ante código inexistente y "Reactivar" ante un producto desactivado), `src/test/caja.tsx` (`armarCaja` acepta `servicioProductos`)
- Test: `supabase/tests/database/120_historial_productos.test.sql`, `supabase/tests/database/130_productos.test.sql`, `src/productos/productos.test.ts`, `src/productos/AltaRapidaProducto.test.tsx`, `src/productos/PantallaProductos.test.tsx`, `src/caja/AltaEnCaja.test.tsx`

Reglas (spec secciones 4, 6, 10 y 11; decisiones 21, 24, 25, 27 y 35):
- Caja y jefe dan de alta y editan (tabla de permisos de la sección 10). La base chequea la cuenta: sin fila en `cuentas` para el negocio del token, `sin_cuenta`.
- `alta_producto_caja(p_dispositivo_id uuid, p_codigo_barras text, p_nombre text, p_precio numeric)`: el código es opcional (spec sección 4: "código de barras (opcional)"). `null` o vacío = producto sin código, que entra a la grilla F2 con 0 ventas (`ranking_sin_codigo` de la tarea 11 incluye los no vendidos). Desde la caja, el alta rápida guarda el código escaneado; desde la pantalla de productos, el código se puede dejar vacío. Nombre recortado de 1 a 80 caracteres; precio entero mayor que cero; marca `creado_en_caja = true` (columna de la tarea 3). Código único por negocio, incluidos los inactivos, sólo cuando hay código: lo garantiza el índice único parcial `productos_codigo_unico` de la tarea 3 (`where codigo_barras is not null`), así que dos productos sin código con el mismo nombre no chocan. La función chequea el código antes para dar un error propio y, si dos altas chocan a la vez, traduce el `unique_violation` del índice.
- Código existente: si el producto está activo, `codigo_existente`; si está desactivado, `codigo_existente_inactivo`. En los dos el `detail` del error lleva el id del producto, y para el inactivo la pantalla ofrece **reactivarlo en vez de crear otro** (spec sección 4: "si se escanea uno inactivo, se ofrece reactivarlo").
- `editar_producto(p_producto_id uuid, p_dispositivo_id uuid, p_nombre text default null, p_precio numeric default null, p_activo boolean default null)`: `null` = no cambia. Edita nombre, precio y activo; **el código de barras no se cambia desde la app** (no hay parámetro). Si nada cambia, no hace `update` (no sube `catalogo_version` ni deja historial). Reactivar = `editar_producto` con `p_activo = true`.
- `p_precio` es `numeric` a propósito: así un precio con centavos llega a la función y se rechaza con `precio_invalido`, en vez de fallar con un error de tipos que la pantalla no sabría leer.
- Las dos funciones reciben la PC (`p_dispositivo_id`) porque el historial guarda dispositivo (decisión 27); verifican que sea del negocio del token (`dispositivo_desconocido`), como `abrir_turno`.
- Historial por trigger (`productos_historial`, `after insert or update`): alta (`alta_producto`, con todos los valores), precio (`cambio_precio`, valor anterior y nuevo), nombre, activo y código (`cambio_producto`, sólo los campos que cambiaron). Un cambio de precio y nombre a la vez deja dos filas. La función de la app pasa la PC al trigger con `set_config('app.dispositivo_id', ..., true)` y la limpia al terminar. `cuenta_id` = `auth.uid()` sólo si es una cuenta de ese negocio; desde Studio `auth.uid()` es `null` y `cuenta_id` y `dispositivo_id` quedan vacíos (decisión sobre V12 de la parte 1: el trigger registra igual; el vacío significa "fuera de la app").
- El trigger no es `security definer`: corre como quien hace el cambio, que siempre es el dueño de las funciones (`postgres`) o Studio. La app no tiene permiso de escritura en `productos` ni en `historial` (tarea 3).

Códigos de error nuevos (`message` de PostgREST, `code` = `P0001`):

| Código | Lo lanza |
|---|---|
| `codigo_invalido` | `alta_producto_caja` (código con espacios, fuera de ASCII imprimible o de más de 48 caracteres; vacío no es error: es sin código) |
| `nombre_invalido` | `alta_producto_caja`, `editar_producto` (mismo código que `alta_cliente`) |
| `precio_invalido` | `alta_producto_caja`, `editar_producto` |
| `codigo_existente` (detail: id) | `alta_producto_caja` |
| `codigo_existente_inactivo` (detail: id) | `alta_producto_caja` |
| `producto_desconocido` | `editar_producto` (inexistente o de otro negocio) |

Reusa `sin_cuenta` y `dispositivo_desconocido`.

- [ ] **Step 1: Escribir la prueba de las funciones de productos**

`supabase/tests/database/130_productos.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'prod-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'prod-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'prod-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'prod-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.productos (id, negocio_id, nombre, precio, codigo_barras, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, '7790001', true),
  ('a2000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'Turrón viejo', 400, '7790008', false),
  ('a2000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000000', 'Pan de ayer', 200, '7790010', false);

-- Devuelve "message:detail" del error que lanza p_sql (el detail lleva el id del producto existente).
create function pg_temp.error_de(p_sql text) returns text language plpgsql as $f$
declare
  v_mensaje text;
  v_detalle text;
begin
  execute p_sql;
  return 'sin error';
exception when others then
  get stacked diagnostics v_mensaje = message_text, v_detalle = pg_exception_detail;
  return v_mensaje || ':' || coalesce(v_detalle, '');
end;
$f$;

-- 1 a 21: la caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790002', 'Agua mineral', 1200) ->> 'creado_en_caja',
  'true', 'la caja da de alta y el producto vuelve marcado como creado en caja');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790003', '  Chicle  ', 200) ->> 'nombre',
  'Chicle', 'el nombre se recorta');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', null, 'Pan casero', 800) ->> 'codigo_barras',
  null, 'la caja da de alta un producto sin código');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '  ', 'Pan casero', 850) ->> 'creado_en_caja',
  'true', 'otro sin código con el mismo nombre no falla: la unicidad es sólo del código (vacío = sin código)');
select results_eq(
  $$ select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Pan casero' $$,
  $$ values (0), (0) $$,
  'los productos sin código entran a la grilla F2 con 0 ventas');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790001', 'Otro alfajor', 950) $$,
  'P0001', 'codigo_existente', 'un código que ya está activo no se da de alta otra vez');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790008', 'Turrón nuevo', 450) $$,
  'P0001', 'codigo_existente_inactivo', 'el código de un producto desactivado da error propio: se ofrece reactivar');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 12.5) $$,
  'P0001', 'precio_invalido', 'un precio con centavos se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 0) $$,
  'P0001', 'precio_invalido', 'precio cero se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', -100) $$,
  'P0001', 'precio_invalido', 'precio negativo se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', '   ', 100) $$,
  'P0001', 'nombre_invalido', 'el nombre es obligatorio');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', 'con espacio', 'Caramelo', 100) $$,
  'P0001', 'codigo_invalido', 'un código con espacios no es un código escaneado');
select throws_ok($$ select public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 100) $$,
  'P0001', 'dispositivo_desconocido', 'la caja de A no usa una PC de B');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1000) ->> 'precio',
  '1000', 'la caja edita el precio');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 9.99) $$,
  'P0001', 'precio_invalido', 'editar con centavos se rechaza');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 0) $$,
  'P0001', 'precio_invalido', 'editar a precio cero se rechaza');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_nombre => '  ') $$,
  'P0001', 'nombre_invalido', 'editar a nombre vacío se rechaza');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_activo => false) ->> 'activo',
  'false', 'la caja desactiva un producto');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000009',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_activo => true) ->> 'activo',
  'true', 'la caja reactiva un producto desactivado');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_nombre => 'Alfajor triple') ->> 'codigo_barras',
  '7790001', 'cambiar el nombre no toca el código de barras');
select throws_ok($$ select public.editar_producto(p_producto_id => gen_random_uuid(),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 100) $$,
  'P0001', 'producto_desconocido', 'un producto inexistente se rechaza');

-- 22 y 23: el jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', null, 'Caramelos sueltos', 50) ->> 'id',
  null, 'el jefe también da de alta, también sin código');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1100) ->> 'precio',
  '1100', 'el jefe también edita');

-- 24: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790005', 'Intruso', 100) $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se dan de alta productos');

-- 25 a 27: la caja de B (aislamiento entre negocios, obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'b1000000-0000-0000-0000-000000000001', p_precio => 1) $$,
  'P0001', 'producto_desconocido', 'B no edita productos de A');
select is(public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor de B', 800) ->> 'codigo_barras',
  '7790001', 'B carga el mismo código que A: es único por kiosco y B no se entera de que existe en A');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790099', 'Otro', 100) $$,
  'P0001', 'dispositivo_desconocido', 'B no usa la PC de A');

-- 28 a 34: como postgres
reset role;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(pg_temp.error_de($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790010', 'Pan nuevo', 300) $$),
  'codigo_existente_inactivo:a2000000-0000-0000-0000-000000000010',
  'el error trae el id del producto desactivado para reactivarlo');
select results_eq(
  $$ select nombre, precio, codigo_barras, activo, creado_en_caja from public.productos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and codigo_barras = '7790002' $$,
  $$ values ('Agua mineral'::text, 1200, '7790002'::text, true, true) $$,
  'el alta rápida quedó guardada con el código escaneado y "creado en caja"');
select results_eq(
  $$ select precio, codigo_barras, creado_en_caja from public.productos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and nombre = 'Pan casero' order by precio $$,
  $$ values (800, null::text, true), (850, null::text, true) $$,
  'los dos "Pan casero" quedaron sin código y marcados creado en caja');
select results_eq(
  $$ select nombre, precio, activo from public.productos where id = 'a2000000-0000-0000-0000-000000000001' $$,
  $$ values ('Alfajor triple'::text, 1100, false) $$,
  'los intentos de B no cambiaron el producto de A');
select results_eq(
  $$ select negocio_id from public.productos where codigo_barras = '7790001' order by negocio_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000000'::uuid), ('b0000000-0000-0000-0000-000000000000'::uuid) $$,
  'el mismo código existe una vez por kiosco');

create temporary table version_antes as
  select catalogo_version as v from public.negocios where id = 'a0000000-0000-0000-0000-000000000000';
do $$ begin
  perform public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1100);
end $$;
select is((select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000'),
  (select v from version_antes), 'editar sin cambios no sube catalogo_version');
do $$ begin
  perform public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1150);
end $$;
select is((select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000'),
  (select v + 1 from version_antes), 'un cambio de precio sube catalogo_version');

select * from finish();
rollback;
```

- [ ] **Step 2: Escribir la prueba del historial de productos**

`supabase/tests/database/120_historial_productos.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'hp-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'hp-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'hp-caja-b@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000001a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');

-- 1 y 2: alta desde la caja de A, PC A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
do $$ begin
  perform public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor', 900);
end $$;
reset role;
select results_eq(
  $$ select h.tipo::text, h.cuenta_id, h.dispositivo_id, h.valor_anterior, h.valor_nuevo
     from public.historial h join public.productos p on p.id = h.entidad_id
     where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.codigo_barras = '7790001' $$,
  $$ values ('alta_producto'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid,
             null::jsonb,
             '{"nombre": "Alfajor", "precio": 900, "codigo_barras": "7790001", "activo": true, "creado_en_caja": true}'::jsonb) $$,
  'el alta queda en el historial con cuenta, PC y valores');
select is(current_setting('app.dispositivo_id', true), '', 'la función no deja la PC puesta en la sesión');

-- 3 y 4: la caja cambia el precio
set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1000);
end $$;
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_precio' $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid,
             '{"precio": 900}'::jsonb, '{"precio": 1000}'::jsonb) $$,
  'el cambio de precio guarda valor anterior y nuevo, cuenta y PC');
select is_empty(
  $$ select 1 from public.historial where tipo = 'cambio_producto' $$,
  'un cambio sólo de precio no registra cambio de producto');

-- 5 a 7: el jefe, desde la PC B, cambia nombre y desactiva
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000002', p_nombre => 'Alfajor triple', p_activo => false);
end $$;
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_producto' $$,
  $$ values ('c0000000-0000-0000-0000-00000000001a'::uuid, 'a1000000-0000-0000-0000-000000000002'::uuid,
             '{"nombre": "Alfajor", "activo": true}'::jsonb, '{"nombre": "Alfajor triple", "activo": false}'::jsonb) $$,
  'nombre y activo quedan en una fila de cambio de producto, con valores anteriores y nuevos');
select is((select count(*)::int from public.historial where tipo = 'cambio_precio'), 1,
  'cambiar nombre y activo no registra cambio de precio');

set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000002', p_nombre => 'Alfajor triple');
end $$;
reset role;
select is(
  (select count(*)::int from public.historial h join public.productos p on p.id = h.entidad_id
   where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.codigo_barras = '7790001'),
  3, 'editar sin cambios no deja historial');

-- 8 a 11: cambios desde Supabase Studio (postgres, sin usuario de la app)
select set_config('request.jwt.claims', '', true);
update public.productos set precio = 1200
where negocio_id = 'a0000000-0000-0000-0000-000000000000' and codigo_barras = '7790001';
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where tipo = 'cambio_precio' and valor_nuevo = '{"precio": 1200}'::jsonb $$,
  $$ values (null::uuid, null::uuid, '{"precio": 1000}'::jsonb, '{"precio": 1200}'::jsonb) $$,
  'un cambio de precio desde Studio queda en el historial con cuenta y PC vacías');

insert into public.productos (negocio_id, nombre, precio) values ('a0000000-0000-0000-0000-000000000000', 'Chicle', 200);
select results_eq(
  $$ select h.tipo::text, h.cuenta_id, h.valor_nuevo ->> 'creado_en_caja'
     from public.historial h join public.productos p on p.id = h.entidad_id where p.nombre = 'Chicle' $$,
  $$ values ('alta_producto'::text, null::uuid, 'false'::text) $$,
  'un alta desde Studio también queda, sin cuenta y sin marca de caja');

update public.productos set codigo_barras = '7790011' where nombre = 'Chicle';
select results_eq(
  $$ select h.valor_anterior, h.valor_nuevo
     from public.historial h join public.productos p on p.id = h.entidad_id
     where p.nombre = 'Chicle' and h.tipo = 'cambio_producto' $$,
  $$ values ('{"codigo_barras": null}'::jsonb, '{"codigo_barras": "7790011"}'::jsonb) $$,
  'un cambio de código desde Studio queda como cambio de producto');

select set_config('app.dispositivo_id', 'b1000000-0000-0000-0000-000000000001', true);
update public.productos set precio = 250 where nombre = 'Chicle';
select set_config('app.dispositivo_id', '', true);
select results_eq(
  $$ select dispositivo_id from public.historial where tipo = 'cambio_precio' and valor_nuevo = '{"precio": 250}'::jsonb $$,
  $$ values (null::uuid) $$,
  'una PC de otro kiosco nunca queda en el historial de A');

-- 12 y 13: aislamiento entre negocios (obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin
  perform public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor de B', 800);
end $$;
reset role;
select results_eq(
  $$ select negocio_id, cuenta_id, dispositivo_id from public.historial
     where tipo = 'alta_producto' and valor_nuevo ->> 'nombre' = 'Alfajor de B' $$,
  $$ values ('b0000000-0000-0000-0000-000000000000'::uuid, 'c0000000-0000-0000-0000-00000000000b'::uuid,
             'b1000000-0000-0000-0000-000000000001'::uuid) $$,
  'el alta de B queda en el historial de B');
select is_empty(
  $$ select 1 from public.historial h join public.productos p on p.id = h.entidad_id
     where h.entidad = 'productos' and h.negocio_id <> p.negocio_id $$,
  'ninguna fila del historial cruza negocios');

select * from finish();
rollback;
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `120_historial_productos.test.sql` y `130_productos.test.sql` con `function public.alta_producto_caja(unknown, unknown, unknown, integer) does not exist`. Las demás siguen pasando.

- [ ] **Step 4: Escribir las funciones de productos**

`supabase/migrations/20261019121500_productos.sql`:
```sql
-- Alta de productos (con código o sin código) y edición de precio, nombre y activo (decisiones 21, 24, 25 y 35).
-- Caja y jefe pueden las dos. El historial lo escribe el trigger productos_historial (121600);
-- estas funciones le pasan la PC con app.dispositivo_id y la limpian al terminar.
-- p_precio es numeric para rechazar centavos con un error propio (precio_invalido).

create or replace function public.alta_producto_caja(
  p_dispositivo_id uuid,
  p_codigo_barras text,
  p_nombre text,
  p_precio numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  -- null o vacío = producto sin código (va a la grilla F2).
  v_codigo text := nullif(btrim(coalesce(p_codigo_barras, '')), '');
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_existente public.productos%rowtype;
  v_producto public.productos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  -- Mismo check que productos.codigo_barras (tarea 3): ASCII imprimible, sin espacios.
  if v_codigo is not null and v_codigo !~ '^[!-~]{1,48}$' then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) not between 1 and 80 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio <> trunc(p_precio) or p_precio > 2147483647 then
    raise exception 'precio_invalido' using errcode = 'P0001';
  end if;

  -- Único por negocio, incluidos los inactivos, sólo cuando hay código (índice parcial productos_codigo_unico).
  -- Un inactivo se reactiva. Sin código no hay nada que chequear: dos "Pan casero" sin código conviven.
  if v_codigo is not null then
    select * into v_existente from public.productos p
    where p.negocio_id = v_negocio and p.codigo_barras = v_codigo;
  end if;
  if v_existente.id is not null then
    if v_existente.activo then
      raise exception 'codigo_existente' using errcode = 'P0001', detail = v_existente.id::text;
    end if;
    raise exception 'codigo_existente_inactivo' using errcode = 'P0001', detail = v_existente.id::text;
  end if;

  perform set_config('app.dispositivo_id', p_dispositivo_id::text, true);
  begin
    insert into public.productos (negocio_id, nombre, precio, codigo_barras, creado_en_caja)
    values (v_negocio, v_nombre, p_precio::integer, v_codigo, true)
    returning * into v_producto;
  exception when unique_violation then
    -- Dos altas del mismo código a la vez: la segunda choca con el índice.
    raise exception 'codigo_existente' using errcode = 'P0001';
  end;
  perform set_config('app.dispositivo_id', '', true);

  return to_jsonb(v_producto) - 'negocio_id' - 'creado';
end;
$$;

-- null = no cambia. El código de barras no se edita desde la app.
create or replace function public.editar_producto(
  p_producto_id uuid,
  p_dispositivo_id uuid,
  p_nombre text default null,
  p_precio numeric default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_actual public.productos%rowtype;
  v_nombre text;
  v_precio integer;
  v_activo boolean;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  select * into v_actual from public.productos p
  where p.id = p_producto_id and p.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'producto_desconocido' using errcode = 'P0001';
  end if;

  v_nombre := coalesce(btrim(p_nombre), v_actual.nombre);
  if char_length(v_nombre) not between 1 and 80 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if p_precio is not null and (p_precio <= 0 or p_precio <> trunc(p_precio) or p_precio > 2147483647) then
    raise exception 'precio_invalido' using errcode = 'P0001';
  end if;
  v_precio := coalesce(p_precio::integer, v_actual.precio);
  v_activo := coalesce(p_activo, v_actual.activo);

  -- Sin cambios no hay update: no sube catalogo_version ni deja historial.
  if (v_nombre, v_precio, v_activo) is distinct from (v_actual.nombre, v_actual.precio, v_actual.activo) then
    perform set_config('app.dispositivo_id', p_dispositivo_id::text, true);
    update public.productos p set nombre = v_nombre, precio = v_precio, activo = v_activo
    where p.id = v_actual.id
    returning * into v_actual;
    perform set_config('app.dispositivo_id', '', true);
  end if;

  return to_jsonb(v_actual) - 'negocio_id' - 'creado';
end;
$$;

revoke all on function public.alta_producto_caja(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.alta_producto_caja(uuid, text, text, numeric) to authenticated;
revoke all on function public.editar_producto(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.editar_producto(uuid, uuid, text, numeric, boolean) to authenticated;
```

- [ ] **Step 5: Escribir el trigger del historial**

`supabase/migrations/20261019121600_historial_productos.sql`:
```sql
-- Historial de productos (decisión 27, spec sección 4): alta, precio, nombre, activo y código.
-- Corre en cada insert o update de productos, venga de las funciones de la app o de Supabase Studio.
-- cuenta_id: auth.uid() sólo si es una cuenta de ese negocio. dispositivo_id: el que pasa la función
-- de la app en app.dispositivo_id, sólo si es una PC de ese negocio. Desde Studio quedan vacíos (V12).
-- Sin security definer: el que escribe es siempre el dueño de las funciones o Studio (postgres).
create or replace function public.registrar_historial_producto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cuenta uuid;
  v_dispositivo uuid;
  v_anterior jsonb := '{}'::jsonb;
  v_nuevo jsonb := '{}'::jsonb;
begin
  select c.usuario_id into v_cuenta from public.cuentas c
  where c.usuario_id = auth.uid() and c.negocio_id = new.negocio_id;

  select d.id into v_dispositivo from public.dispositivos d
  where d.id = nullif(current_setting('app.dispositivo_id', true), '')::uuid and d.negocio_id = new.negocio_id;

  if tg_op = 'INSERT' then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
    values (new.negocio_id, 'alta_producto', v_cuenta, v_dispositivo, 'productos', new.id,
            jsonb_build_object('nombre', new.nombre, 'precio', new.precio, 'codigo_barras', new.codigo_barras,
                               'activo', new.activo, 'creado_en_caja', new.creado_en_caja));
    return null;
  end if;

  if new.precio is distinct from old.precio then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo)
    values (new.negocio_id, 'cambio_precio', v_cuenta, v_dispositivo, 'productos', new.id,
            jsonb_build_object('precio', old.precio), jsonb_build_object('precio', new.precio));
  end if;

  if new.nombre is distinct from old.nombre then
    v_anterior := v_anterior || jsonb_build_object('nombre', old.nombre);
    v_nuevo := v_nuevo || jsonb_build_object('nombre', new.nombre);
  end if;
  if new.activo is distinct from old.activo then
    v_anterior := v_anterior || jsonb_build_object('activo', old.activo);
    v_nuevo := v_nuevo || jsonb_build_object('activo', new.activo);
  end if;
  if new.codigo_barras is distinct from old.codigo_barras then
    v_anterior := v_anterior || jsonb_build_object('codigo_barras', old.codigo_barras);
    v_nuevo := v_nuevo || jsonb_build_object('codigo_barras', new.codigo_barras);
  end if;

  if v_nuevo <> '{}'::jsonb then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo)
    values (new.negocio_id, 'cambio_producto', v_cuenta, v_dispositivo, 'productos', new.id, v_anterior, v_nuevo);
  end if;

  return null;
end;
$$;

create trigger productos_historial
  after insert or update on public.productos
  for each row execute function public.registrar_historial_producto();

revoke all on function public.registrar_historial_producto() from public, anon, authenticated;
```

- [ ] **Step 6: Ajustar las pruebas existentes que cambian con el trigger y las funciones nuevas**

En `supabase/tests/database/010_rls.test.sql` (tarea 3), los productos de prueba ahora dejan su fila `alta_producto` en el historial. Reemplazar la prueba 25:
```sql
select results_eq(
  $$ select tipo::text from public.historial $$,
  $$ values ('cambio_precio'::text) $$,
  'el jefe ve el historial de auditoría'
);
```
por:
```sql
select results_eq(
  $$ select tipo::text from public.historial order by tipo $$,
  $$ values ('alta_producto'::text), ('cambio_precio'::text) $$,
  'el jefe ve el historial de auditoría de su kiosco (el alta de Bizcochitos es de B y no aparece)'
);
```
El plan sigue en 27.

En `supabase/tests/database/150_permisos_funciones.test.sql`, reemplazar la prueba 5 entera por (once nombres: los nueve de las partes 2 y 3 más los dos de esta tarea):
```sql
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  array['abrir_turno', 'alta_cliente', 'alta_producto_caja', 'anular_venta', 'caja_del_dia', 'cerrar_turno',
        'confirmar_venta', 'editar_producto', 'ranking_sin_codigo', 'registrar_dispositivo', 'ventas_del_dia'],
  'authenticated ejecuta sólo las funciones security definer de la lista');
```

- [ ] **Step 7: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Finished supabase db reset`; después `All tests successful.` y `Result: PASS`. Si `130` falla en la prueba 28 con `sin error` o sin el id, el `detail` no viaja como se espera: revisar V30. Si `120` falla en la prueba 8 con un `cuenta_id` lleno, `auth.uid()` no quedó en `null` al vaciar `request.jwt.claims` (V12 de la parte 1). Si `150` lista `registrar_historial_producto`, el trigger quedó como `security definer` por error.

- [ ] **Step 8: Escribir el servicio de productos y su prueba**

`src/productos/productos.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { crearServicioProductos, ErrorProducto, MENSAJES_ERROR_PRODUCTO, mensajeErrorProducto } from './productos'

type Respuesta = { data: unknown; error: { message: string; details?: string | null } | null }

function supabaseFalso(respuesta: Respuesta) {
  const rpc = vi.fn(async (_funcion: string, _args: Record<string, unknown>) => respuesta)
  return { cliente: { rpc } as unknown as SupabaseClient, rpc }
}

const AGUA = { id: 'p2', nombre: 'Agua', precio: 1200, codigo_barras: '7790002', activo: true, creado_en_caja: true }

describe('crearServicioProductos', () => {
  it('alta llama a alta_producto_caja con la PC, el código, el nombre y el precio, y avisa el cambio', async () => {
    const { cliente, rpc } = supabaseFalso({ data: AGUA, error: null })
    const alCambiar = vi.fn()
    const producto = await crearServicioProductos(cliente, 'pc-1', alCambiar).alta('7790002', 'Agua', 1200)
    expect(rpc).toHaveBeenCalledWith('alta_producto_caja', {
      p_dispositivo_id: 'pc-1',
      p_codigo_barras: '7790002',
      p_nombre: 'Agua',
      p_precio: 1200,
    })
    expect(producto).toEqual(AGUA)
    expect(alCambiar).toHaveBeenCalledTimes(1)
  })

  it('alta sin código manda p_codigo_barras null', async () => {
    const { cliente, rpc } = supabaseFalso({ data: { ...AGUA, codigo_barras: null }, error: null })
    const producto = await crearServicioProductos(cliente, 'pc-1').alta(null, 'Agua', 1200)
    expect(rpc).toHaveBeenCalledWith('alta_producto_caja', {
      p_dispositivo_id: 'pc-1',
      p_codigo_barras: null,
      p_nombre: 'Agua',
      p_precio: 1200,
    })
    expect(producto.codigo_barras).toBeNull()
  })

  it('codigo_existente_inactivo trae el id del producto para reactivarlo', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'codigo_existente_inactivo', details: 'p9' } })
    await expect(crearServicioProductos(cliente, 'pc-1').alta('7790008', 'Turrón', 400)).rejects.toMatchObject({
      codigo: 'codigo_existente_inactivo',
      productoId: 'p9',
    })
  })

  it('editar manda null en lo que no cambia', async () => {
    const { cliente, rpc } = supabaseFalso({ data: { ...AGUA, activo: false }, error: null })
    await crearServicioProductos(cliente, 'pc-1').editar('p2', { activo: false })
    expect(rpc).toHaveBeenCalledWith('editar_producto', {
      p_producto_id: 'p2',
      p_dispositivo_id: 'pc-1',
      p_nombre: null,
      p_precio: null,
      p_activo: false,
    })
  })

  it('un error que no es de la base queda como desconocido y no avisa cambios', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    const alCambiar = vi.fn()
    const promesa = crearServicioProductos(cliente, 'pc-1', alCambiar).editar('p2', { precio: 1300 })
    await expect(promesa).rejects.toBeInstanceOf(ErrorProducto)
    expect(mensajeErrorProducto(await promesa.catch((e: unknown) => e))).toBe(MENSAJES_ERROR_PRODUCTO.desconocido)
    expect(alCambiar).not.toHaveBeenCalled()
  })
})
```

`src/productos/productos.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { crearFuenteSupabase } from '../catalogo/fuente'
import { palabras } from '../catalogo/normalizar'
import type { Producto, ProductoCache } from '../tipos'

/** Errores de alta_producto_caja y editar_producto (tarea 15). 'desconocido' = red u otro. */
export type CodigoErrorProducto =
  | 'sin_cuenta'
  | 'dispositivo_desconocido'
  | 'codigo_invalido'
  | 'nombre_invalido'
  | 'precio_invalido'
  | 'codigo_existente'
  | 'codigo_existente_inactivo'
  | 'producto_desconocido'
  | 'desconocido'

export const MENSAJES_ERROR_PRODUCTO: Record<CodigoErrorProducto, string> = {
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
  codigo_invalido: 'El código escaneado no es válido.',
  nombre_invalido: 'Escribí un nombre (hasta 80 letras).',
  precio_invalido: 'Escribí el precio en pesos enteros, mayor que cero.',
  codigo_existente: 'Ese código ya está cargado. Se está actualizando el catálogo: volvé a escanearlo.',
  codigo_existente_inactivo: 'Ese código es de un producto desactivado. Podés reactivarlo.',
  producto_desconocido: 'Ese producto no existe en este kiosco.',
  desconocido: 'No se pudo guardar. Revisá la conexión y probá de nuevo.',
}

const CODIGOS = Object.keys(MENSAJES_ERROR_PRODUCTO) as CodigoErrorProducto[]

export class ErrorProducto extends Error {
  readonly codigo: CodigoErrorProducto
  /** Id del producto existente (codigo_existente y codigo_existente_inactivo). */
  readonly productoId: string | null

  constructor(codigo: CodigoErrorProducto, productoId: string | null = null) {
    super(codigo)
    this.name = 'ErrorProducto'
    this.codigo = codigo
    this.productoId = productoId
  }
}

export function mensajeErrorProducto(e: unknown): string {
  return MENSAJES_ERROR_PRODUCTO[e instanceof ErrorProducto ? e.codigo : 'desconocido']
}

/** Sólo lo que cambia; lo que falta no se toca. El código de barras no se edita desde la app. */
export interface CambiosProducto {
  nombre?: string
  precio?: number
  activo?: boolean
}

export interface ServicioProductos {
  /** Todos los productos del kiosco, activos o no (lectura paginada de la tarea 7). */
  listar(): Promise<Producto[]>
  /** Alta desde la app (caja o jefe): queda "creado en caja". codigo null = producto sin código (grilla F2). */
  alta(codigo: string | null, nombre: string, precio: number): Promise<Producto>
  /** Reactivar = editar(id, { activo: true }). */
  editar(productoId: string, cambios: CambiosProducto): Promise<Producto>
}

export const aProductoCache = (p: Producto): ProductoCache => ({ ...p, palabras: palabras(p.nombre) })

function aProducto(dato: unknown): Producto {
  const r = dato as Producto
  return {
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    codigo_barras: r.codigo_barras,
    activo: r.activo,
    creado_en_caja: r.creado_en_caja,
  }
}

function errorDeRpc(error: { message: string; details?: string | null }): ErrorProducto {
  const codigo = CODIGOS.find((c) => c === error.message) ?? 'desconocido'
  return new ErrorProducto(codigo, error.details || null)
}

/**
 * alCambiar se llama después de cada escritura (y ante codigo_existente, que indica caché vieja):
 * la tarea 17 lo usa para sincronizar la caché sin esperar los 3 minutos.
 */
export function crearServicioProductos(
  supabase: SupabaseClient,
  dispositivoId: string,
  alCambiar: () => void = () => undefined,
): ServicioProductos {
  const fuente = crearFuenteSupabase(supabase)
  return {
    listar: () => fuente.leerProductos(),
    async alta(codigo, nombre, precio) {
      const { data, error } = await supabase.rpc('alta_producto_caja', {
        p_dispositivo_id: dispositivoId,
        p_codigo_barras: codigo,
        p_nombre: nombre,
        p_precio: precio,
      })
      if (error) {
        const e = errorDeRpc(error)
        if (e.codigo === 'codigo_existente') alCambiar()
        throw e
      }
      alCambiar()
      return aProducto(data)
    },
    async editar(productoId, cambios) {
      const { data, error } = await supabase.rpc('editar_producto', {
        p_producto_id: productoId,
        p_dispositivo_id: dispositivoId,
        p_nombre: cambios.nombre ?? null,
        p_precio: cambios.precio ?? null,
        p_activo: cambios.activo ?? null,
      })
      if (error) throw errorDeRpc(error)
      alCambiar()
      return aProducto(data)
    },
  }
}
```

`src/test/productos.ts` (ayuda de pruebas compartida por las pruebas de esta tarea):
```ts
import { vi } from 'vitest'
import { ErrorProducto, type CambiosProducto, type ServicioProductos } from '../productos/productos'
import type { Producto } from '../tipos'

export function productoDePrueba(p: Pick<Producto, 'id' | 'nombre' | 'precio'> & Partial<Producto>): Producto {
  return { codigo_barras: null, activo: true, creado_en_caja: false, ...p }
}

/** Servicio de productos en memoria. alta crea "nuevo-<código o nombre>"; editar aplica los cambios. */
export function servicioProductosFalso(iniciales: readonly Producto[] = []) {
  const productos: Producto[] = iniciales.map((p) => ({ ...p }))
  const servicio = {
    listar: vi.fn(async () => productos.map((p) => ({ ...p }))),
    alta: vi.fn(async (codigo: string | null, nombre: string, precio: number): Promise<Producto> =>
      productoDePrueba({ id: `nuevo-${codigo ?? nombre}`, nombre, precio, codigo_barras: codigo, creado_en_caja: true }),
    ),
    editar: vi.fn(async (productoId: string, cambios: CambiosProducto): Promise<Producto> => {
      const i = productos.findIndex((p) => p.id === productoId)
      if (i < 0) throw new ErrorProducto('producto_desconocido')
      productos[i] = { ...productos[i], ...cambios }
      return { ...productos[i] }
    }),
  } satisfies ServicioProductos
  return servicio
}
```

- [ ] **Step 9: Escribir las pruebas de la interfaz**

`src/productos/AltaRapidaProducto.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import { AltaRapidaProducto } from './AltaRapidaProducto'
import { ErrorProducto, type Producto } from './productos'

function armar(servicio = servicioProductosFalso()) {
  const alListo = vi.fn()
  const alCancelar = vi.fn()
  const user = userEvent.setup()
  render(<AltaRapidaProducto codigo="7790099" servicio={servicio} alListo={alListo} alCancelar={alCancelar} />)
  return { servicio, alListo, alCancelar, user }
}

async function completar(user: ReturnType<typeof userEvent.setup>, nombre: string, precio: string) {
  if (nombre) await user.type(screen.getByLabelText('Nombre'), nombre)
  if (precio) await user.type(screen.getByLabelText('Precio'), precio)
  await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
}

describe('AltaRapidaProducto', () => {
  it('guarda nombre y precio con el código escaneado y entrega el producto creado en caja', async () => {
    const { servicio, alListo, user } = armar()
    expect(screen.getByText('7790099')).toBeInTheDocument()
    await completar(user, '  Turrón nuevo ', '1.450')
    expect(servicio.alta).toHaveBeenCalledWith('7790099', 'Turrón nuevo', 1450)
    expect(alListo).toHaveBeenCalledWith(expect.objectContaining({ codigo_barras: '7790099', creado_en_caja: true }))
  })

  it.each(['0', '10,5', 'abc'])('precio "%s": avisa y no llama a la base', async (precio) => {
    const { servicio, alListo, user } = armar()
    await completar(user, 'Turrón', precio)
    expect(await screen.findByRole('alert')).toHaveTextContent('pesos enteros, mayor que cero')
    expect(servicio.alta).not.toHaveBeenCalled()
    expect(alListo).not.toHaveBeenCalled()
  })

  it('sin nombre avisa y no llama a la base', async () => {
    const { servicio, user } = armar()
    await completar(user, '', '450')
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribí un nombre')
    expect(servicio.alta).not.toHaveBeenCalled()
  })

  it('si el código es de un producto desactivado, ofrece reactivarlo en vez de crear otro', async () => {
    const servicio = servicioProductosFalso([
      productoDePrueba({ id: 'p9', nombre: 'Turrón viejo', precio: 400, codigo_barras: '7790099', activo: false }),
    ])
    servicio.alta.mockRejectedValueOnce(new ErrorProducto('codigo_existente_inactivo', 'p9'))
    const { alListo, user } = armar(servicio)
    await completar(user, 'Turrón nuevo', '450')
    expect(await screen.findByRole('alert')).toHaveTextContent('producto desactivado')
    expect(screen.queryByRole('button', { name: 'Guardar y agregar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Reactivar y agregar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p9', { activo: true })
    expect(servicio.alta).toHaveBeenCalledTimes(1)
    expect(alListo).toHaveBeenCalledWith(expect.objectContaining({ id: 'p9', activo: true }))
  })

  it('mientras guarda, otro clic no vuelve a llamar', async () => {
    const servicio = servicioProductosFalso()
    servicio.alta.mockImplementationOnce(() => new Promise<Producto>(() => undefined))
    const { user } = armar(servicio)
    await completar(user, 'Turrón', '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(servicio.alta).toHaveBeenCalledTimes(1)
  })

  it('Cancelar no guarda nada', async () => {
    const { servicio, alCancelar, user } = armar()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(alCancelar).toHaveBeenCalledTimes(1)
    expect(servicio.alta).not.toHaveBeenCalled()
  })
})
```

En la prueba "mientras guarda", el segundo clic cae sobre un botón deshabilitado (user-event no dispara `click` en botones `disabled`), y además el `ref` `enCurso` corta un segundo envío.

`src/productos/PantallaProductos.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { productoDePrueba, servicioProductosFalso } from '../test/productos'
import { PantallaProductos } from './PantallaProductos'

const PRODUCTOS = [
  productoDePrueba({ id: 'p1', nombre: 'Alfajor triple', precio: 900, codigo_barras: '7790001' }),
  productoDePrueba({ id: 'p2', nombre: 'Agua mineral', precio: 1200, codigo_barras: 'ABC-55', creado_en_caja: true }),
  productoDePrueba({ id: 'p3', nombre: 'Chipá', precio: 800 }),
  productoDePrueba({ id: 'p4', nombre: 'Turrón viejo', precio: 400, codigo_barras: '7790008', activo: false }),
]

function armar() {
  const servicio = servicioProductosFalso(PRODUCTOS)
  const user = userEvent.setup()
  render(<PantallaProductos servicio={servicio} />)
  return { servicio, user }
}

const filasDeDatos = () => within(screen.getByRole('table', { name: 'Productos' })).getAllByRole('row').slice(1)

describe('PantallaProductos', () => {
  it('lista todo, marca "creado en caja" y desactivados, y busca por nombre sin tildes', async () => {
    const { user } = armar()
    expect(await screen.findByRole('row', { name: /Agua mineral.*creado en caja/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Turrón viejo.*Desactivado/ })).toBeInTheDocument()
    expect(filasDeDatos()).toHaveLength(4)
    await user.type(screen.getByLabelText('Buscar producto'), 'chipa')
    expect(filasDeDatos()).toHaveLength(1)
    expect(filasDeDatos()[0]).toHaveTextContent('Chipá')
  })

  it('edita el precio y muestra el nuevo', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Alfajor triple' }))
    const precio = screen.getByLabelText('Precio')
    await user.clear(precio)
    await user.type(precio, '1.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p1', { precio: 1000 })
    expect(await screen.findByRole('row', { name: /Alfajor triple.*\$1\.000/ })).toBeInTheDocument()
  })

  it('reactiva un producto desactivado con la casilla Activo', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Turrón viejo' }))
    await user.click(screen.getByRole('checkbox', { name: 'Activo' }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(servicio.editar).toHaveBeenCalledWith('p4', { activo: true })
    expect(await screen.findByRole('row', { name: /Turrón viejo.*Activo/ })).toBeInTheDocument()
  })

  it('da de alta un producto sin código (va a la grilla F2) y uno con código', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Agregar producto' }))
    let alta = screen.getByRole('form', { name: 'Nuevo producto' })
    await user.type(within(alta).getByLabelText('Nombre'), 'Pan casero')
    await user.type(within(alta).getByLabelText('Precio'), '800')
    await user.click(within(alta).getByRole('button', { name: 'Guardar producto' }))
    expect(servicio.alta).toHaveBeenCalledWith(null, 'Pan casero', 800)
    expect(await screen.findByRole('row', { name: /Pan casero.*creado en caja.*Sin código/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agregar producto' }))
    alta = screen.getByRole('form', { name: 'Nuevo producto' })
    await user.type(within(alta).getByLabelText('Nombre'), 'Turrón')
    await user.type(within(alta).getByLabelText('Precio'), '450')
    await user.type(within(alta).getByLabelText('Código de barras (opcional)'), ' 7790099 ')
    await user.click(within(alta).getByRole('button', { name: 'Guardar producto' }))
    expect(servicio.alta).toHaveBeenLastCalledWith('7790099', 'Turrón', 450)
  })

  it('el código de barras se muestra pero no se edita', async () => {
    const { user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Agua mineral' }))
    const editor = screen.getByRole('form', { name: 'Editar Agua mineral' })
    expect(within(editor).getByText(/ABC-55/)).toBeInTheDocument()
    expect(within(editor).getAllByRole('textbox')).toHaveLength(2)
    expect(within(editor).queryByLabelText(/Código/)).toBeNull()
  })

  it('un precio con centavos no llama a la base', async () => {
    const { servicio, user } = armar()
    await user.click(await screen.findByRole('button', { name: 'Editar Chipá' }))
    const precio = screen.getByLabelText('Precio')
    await user.clear(precio)
    await user.type(precio, '10,5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('pesos enteros, mayor que cero')
    expect(servicio.editar).not.toHaveBeenCalled()
  })
})
```

`src/caja/AltaEnCaja.test.tsx` (alta rápida y reactivar desde la caja; usa las ayudas de la tarea 13):
```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { armarCaja, escanear, TURRON_VIEJO, type Usuario } from '../test/caja'
import { servicioProductosFalso } from '../test/productos'

async function campoListo(user: Usuario) {
  const campo = await screen.findByLabelText('Escanear o buscar')
  await user.click(campo)
  return campo
}

describe('PantallaCaja: alta rápida y reactivar', () => {
  it('un código inexistente abre el alta rápida; al guardar, el producto va a la venta', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    expect(await screen.findByText('Código 7790099 no encontrado. Buscalo por nombre.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nombre'), 'Turrón nuevo')
    await user.type(screen.getByLabelText('Precio'), '450')
    await user.click(screen.getByRole('button', { name: 'Guardar y agregar' }))
    expect(servicio.alta).toHaveBeenCalledWith('7790099', 'Turrón nuevo', 450)
    expect(await screen.findByRole('row', { name: /Turrón nuevo/ })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('un producto desactivado escaneado ofrece "Reactivar"; al reactivar va a la venta', async () => {
    const servicio = servicioProductosFalso([TURRON_VIEJO])
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790008')
    expect(await screen.findByText('Turrón viejo está desactivado.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reactivar Turrón viejo' }))
    expect(servicio.editar).toHaveBeenCalledWith('p8', { activo: true })
    expect(await screen.findByRole('row', { name: /Turrón viejo/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivar Turrón viejo' })).toBeNull()
    expect(campo).toHaveFocus()
  })

  it('cancelar el alta vuelve al campo sin agregar nada', async () => {
    const servicio = servicioProductosFalso()
    const { user, reloj } = armarCaja({ servicioProductos: servicio })
    const campo = await campoListo(user)
    await escanear(user, reloj, '7790099')
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Alta rápida de producto' })).toBeNull()
    expect(screen.queryByRole('table', { name: 'Venta' })).toBeNull()
    expect(campo).toHaveFocus()
    expect(servicio.alta).not.toHaveBeenCalled()
  })
})
```

En `src/test/caja.tsx` (tarea 13), `armarCaja` pasa el servicio de productos. Agregar la línea de import después de `import type { FilaRanking } from '../caja/ranking'`:
```tsx
import type { ServicioProductos } from '../productos/productos'
```
Reemplazar `OpcionesCaja` y `armarCaja` enteros por:
```tsx
export interface OpcionesCaja {
  turnoAbierto?: boolean
  productos?: readonly ProductoCache[]
  /** Respuesta de ranking_sin_codigo; 'falla' simula un error de red. */
  ranking?: FilaRanking[] | 'falla'
  /** Alta rápida y reactivar (tarea 15). Sin esto, la caja sólo avisa, como en las tareas 12 y 13. */
  servicioProductos?: ServicioProductos
}

export function armarCaja(opciones: OpcionesCaja = {}) {
  const reloj = relojDePrueba()
  const pitar = vi.fn()
  const turno = turnoDePrueba(opciones.turnoAbierto ?? true)
  const leerRanking = vi.fn(async (): Promise<FilaRanking[]> => {
    if (opciones.ranking === 'falla') throw new Error('sin red')
    return opciones.ranking ?? []
  })
  const sesiones: SesionCobro[] = []
  const user = userEvent.setup()
  render(
    <PantallaCaja
      catalogo={catalogoDePrueba(opciones.productos)}
      turno={turno}
      leerRanking={leerRanking}
      productos={opciones.servicioProductos}
      ahora={reloj.ahora}
      pitar={pitar}
      cobro={(s) => {
        sesiones.push(s)
        return <p>Cobro abierto</p>
      }}
    />,
  )
  return { reloj, pitar, turno, leerRanking, sesiones, user }
}
```

- [ ] **Step 10: Correrlas y ver que fallan**

Run: `npx vitest run src/productos src/caja/AltaEnCaja.test.tsx`
Expected: FAIL. `AltaRapidaProducto.test.tsx` y `PantallaProductos.test.tsx` fallan con `Failed to resolve import "./AltaRapidaProducto"` y `"./PantallaProductos"`. En `AltaEnCaja.test.tsx` fallan las pruebas 1 y 3 con `Unable to find a label with the text of: Nombre` (el aviso "no encontrado" ya existe desde la tarea 12) y la 2 con `Unable to find role="button" and name "Reactivar Turrón viejo"`. `productos.test.ts` pasa (el servicio ya está escrito en el step 8).

- [ ] **Step 11: Implementar el alta rápida**

`src/productos/AltaRapidaProducto.tsx`:
```tsx
import { useRef, useState, type FormEvent } from 'react'
import { parsearPesos } from '../lib/plata'
import type { Producto } from '../tipos'
import { ErrorProducto, MENSAJES_ERROR_PRODUCTO, mensajeErrorProducto, type ServicioProductos } from './productos'

export interface PropsAltaRapidaProducto {
  /** Código escaneado que no está en el catálogo: se guarda tal cual. */
  codigo: string
  servicio: Pick<ServicioProductos, 'alta' | 'editar'>
  /** Producto creado o reactivado: la caja lo agrega a la venta. */
  alListo(producto: Producto): void
  alCancelar(): void
}

/** Alta ante código inexistente (spec sección 6): nombre y precio, sin aprobación del jefe. */
export function AltaRapidaProducto({ codigo, servicio, alListo, alCancelar }: PropsAltaRapidaProducto) {
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inactivoId, setInactivoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function correr(accion: () => Promise<Producto>) {
    if (enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alListo(await accion())
    } catch (e) {
      if (e instanceof ErrorProducto && e.codigo === 'codigo_existente_inactivo' && e.productoId) {
        setInactivoId(e.productoId)
      }
      setError(mensajeErrorProducto(e))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  function guardar(e: FormEvent) {
    e.preventDefault()
    const n = nombre.trim()
    const p = parsearPesos(precio)
    if (n.length === 0) {
      setError(MENSAJES_ERROR_PRODUCTO.nombre_invalido)
      return
    }
    if (p === null || p <= 0) {
      setError(MENSAJES_ERROR_PRODUCTO.precio_invalido)
      return
    }
    void correr(() => servicio.alta(codigo, n, p))
  }

  return (
    <form className="alta-rapida" aria-label="Alta rápida de producto" onSubmit={guardar}>
      <p>
        Código <strong>{codigo}</strong>: cargalo para seguir vendiendo.
      </p>
      <label>
        Nombre
        <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label>
        Precio
        <input value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {inactivoId ? (
        <button
          type="button"
          disabled={guardando}
          onClick={() => void correr(() => servicio.editar(inactivoId, { activo: true }))}
        >
          Reactivar y agregar
        </button>
      ) : (
        <button type="submit" disabled={guardando}>
          Guardar y agregar
        </button>
      )}
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
```

- [ ] **Step 12: Implementar la pantalla de precios y productos**

`src/productos/PantallaProductos.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { compararPorNombre, terminosDeBusqueda } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import { formatearPesos, parsearPesos } from '../lib/plata'
import type { Producto } from '../tipos'
import { MENSAJES_ERROR_PRODUCTO, mensajeErrorProducto, type CambiosProducto, type ServicioProductos } from './productos'

/** Filas visibles a la vez; el resto se encuentra buscando. */
export const MAX_FILAS = 50

/**
 * Misma búsqueda que la caja (inicio de palabra, sin tildes, desde 2 letras; tarea 6), pero muestra
 * también los desactivados (para reactivarlos) y sin el tope de 8. Con menos de 2 letras, todo.
 */
export function filtrarProductos(productos: readonly Producto[], consulta: string): Producto[] {
  const ordenados = [...productos].sort(compararPorNombre)
  const terminos = terminosDeBusqueda(consulta)
  if (!terminos) return ordenados
  return ordenados.filter((p) => {
    const delProducto = palabras(p.nombre)
    return terminos.every((t) => delProducto.some((w) => w.startsWith(t)))
  })
}

export interface PropsPantallaProductos {
  servicio: ServicioProductos
}

/**
 * Precios y productos (decisión 35): caja y jefe dan de alta (con código o sin código) y editan precio,
 * nombre y activo. Lo que se da de alta desde la app queda "creado en caja".
 */
export function PantallaProductos({ servicio }: PropsPantallaProductos) {
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consulta, setConsulta] = useState('')
  const [editando, setEditando] = useState<Producto | null>(null)
  const [agregando, setAgregando] = useState(false)

  function cargar() {
    setError(null)
    servicio.listar().then(setProductos, () => setError('No se pudo leer la lista de productos. Revisá la conexión.'))
  }

  useEffect(cargar, [servicio])

  const filtrados = useMemo(() => (productos ? filtrarProductos(productos, consulta) : []), [productos, consulta])

  function guardado(p: Producto) {
    setProductos((lista) => lista?.map((x) => (x.id === p.id ? p : x)) ?? null)
    setEditando(null)
  }

  function agregado(p: Producto) {
    setProductos((lista) => (lista ? [...lista, p] : [p]))
    setAgregando(false)
  }

  return (
    <section className="productos">
      <h2>Precios y productos</h2>
      <label>
        Buscar producto
        <input type="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
      </label>
      {agregando ? (
        <AltaProducto servicio={servicio} alGuardar={agregado} alCancelar={() => setAgregando(false)} />
      ) : (
        <button type="button" onClick={() => setAgregando(true)}>
          Agregar producto
        </button>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}{' '}
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        </p>
      )}
      {productos === null && !error && <p>Cargando…</p>}
      {editando && (
        <EditorProducto
          key={editando.id}
          producto={editando}
          servicio={servicio}
          alGuardar={guardado}
          alCancelar={() => setEditando(null)}
        />
      )}
      {productos && (
        <>
          <table aria-label="Productos">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Código</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, MAX_FILAS).map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nombre}
                    {p.creado_en_caja && <span className="marca"> (creado en caja)</span>}
                  </td>
                  <td>{formatearPesos(p.precio)}</td>
                  <td>{p.codigo_barras ?? 'Sin código'}</td>
                  <td>{p.activo ? 'Activo' : 'Desactivado'}</td>
                  <td>
                    <button type="button" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > MAX_FILAS && (
            <p>
              Mostrando {MAX_FILAS} de {filtrados.length}. Buscá por nombre para encontrar el resto.
            </p>
          )}
        </>
      )}
    </section>
  )
}

interface PropsEditorProducto {
  producto: Producto
  servicio: Pick<ServicioProductos, 'editar'>
  alGuardar(producto: Producto): void
  alCancelar(): void
}

function EditorProducto({ producto, servicio, alGuardar, alCancelar }: PropsEditorProducto) {
  const [nombre, setNombre] = useState(producto.nombre)
  const [precio, setPrecio] = useState(String(producto.precio))
  const [activo, setActivo] = useState(producto.activo)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const n = nombre.trim()
    const p = parsearPesos(precio)
    if (n.length === 0) {
      setError(MENSAJES_ERROR_PRODUCTO.nombre_invalido)
      return
    }
    if (p === null || p <= 0) {
      setError(MENSAJES_ERROR_PRODUCTO.precio_invalido)
      return
    }
    const cambios: CambiosProducto = {}
    if (n !== producto.nombre) cambios.nombre = n
    if (p !== producto.precio) cambios.precio = p
    if (activo !== producto.activo) cambios.activo = activo
    if (Object.keys(cambios).length === 0) {
      alCancelar()
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alGuardar(await servicio.editar(producto.id, cambios))
    } catch (err) {
      setError(mensajeErrorProducto(err))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form className="editor-producto" aria-label={`Editar ${producto.nombre}`} onSubmit={(e) => void guardar(e)}>
      <p>Código de barras: {producto.codigo_barras ?? 'sin código'} (no se cambia desde la app).</p>
      <label>
        Nombre
        <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label>
        Precio
        <input value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" disabled={guardando}>
        Guardar
      </button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}

interface PropsAltaProducto {
  servicio: Pick<ServicioProductos, 'alta'>
  alGuardar(producto: Producto): void
  alCancelar(): void
}

/** Alta desde la pantalla de productos. Código vacío = producto sin código: va a la grilla F2 con 0 ventas. */
function AltaProducto({ servicio, alGuardar, alCancelar }: PropsAltaProducto) {
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const n = nombre.trim()
    const p = parsearPesos(precio)
    if (n.length === 0) {
      setError(MENSAJES_ERROR_PRODUCTO.nombre_invalido)
      return
    }
    if (p === null || p <= 0) {
      setError(MENSAJES_ERROR_PRODUCTO.precio_invalido)
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alGuardar(await servicio.alta(codigo.trim() || null, n, p))
    } catch (err) {
      // codigo_existente_inactivo: el producto está en la lista como "Desactivado" y se reactiva desde ahí.
      setError(mensajeErrorProducto(err))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form className="alta-producto" aria-label="Nuevo producto" onSubmit={(e) => void guardar(e)}>
      <label>
        Nombre
        <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label>
        Precio
        <input value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        Código de barras (opcional)
        <input value={codigo} maxLength={48} onChange={(e) => setCodigo(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" disabled={guardando}>
        Guardar producto
      </button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
```

- [ ] **Step 13: Sumar alta rápida y reactivar a la pantalla de caja**

En `src/caja/PantallaCaja.tsx` (versión de la tarea 13), cinco cambios:

1. Imports: después de `import { formatearPesos } from '../lib/plata'` agregar:
```tsx
import { AltaRapidaProducto } from '../productos/AltaRapidaProducto'
import { aProductoCache, type ServicioProductos } from '../productos/productos'
```

2. En `PropsPantallaCaja`, después de `pitar?: () => void` agregar:
```tsx
  /** Alta rápida ante código inexistente y "Reactivar" ante un desactivado (tarea 15). Sin esto, sólo avisa. */
  productos?: ServicioProductos
```
Y en la lista de parámetros de `PantallaCaja`, después de `pitar = pitido,` agregar `productos,`.

3. Estado: después de `const [sinCodigo, setSinCodigo] = useState<ProductoCache[]>([])` agregar:
```tsx
  const [altaCodigo, setAltaCodigo] = useState<string | null>(null)
  const [inactivo, setInactivo] = useState<ProductoCache | null>(null)
  const [reactivando, setReactivando] = useState(false)
```

4. En `escanear`, reemplazar la línea
```tsx
    if (!filtroLecturas.aceptar({ codigo, t })) return
```
por (el cierre va después del filtro: una lectura doble no cierra el alta que abrió la primera):
```tsx
    if (!filtroLecturas.aceptar({ codigo, t })) return
    setAltaCodigo(null)
    setInactivo(null)
```
y reemplazar el final de `escanear`
```tsx
    if (!producto) {
      setAviso(`Código ${codigo} no encontrado. Buscalo por nombre.`)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      return
    }
    agregar(producto)
  }
```
por:
```tsx
    if (!producto) {
      setAviso(`Código ${codigo} no encontrado. Buscalo por nombre.`)
      if (productos) setAltaCodigo(codigo)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      if (productos) setInactivo(producto)
      return
    }
    agregar(producto)
  }

  /** Producto creado o reactivado por el alta rápida: entra a la venta como cualquier escaneo. */
  function altaLista(producto: Producto) {
    setAltaCodigo(null)
    agregar(aProductoCache(producto))
    enfocar()
  }

  async function reactivar(producto: ProductoCache) {
    if (!productos || reactivando) return
    setReactivando(true)
    try {
      const reactivado = await productos.editar(producto.id, { activo: true })
      setInactivo(null)
      agregar(aProductoCache(reactivado))
    } catch {
      setAviso(`No se pudo reactivar ${producto.nombre}. Probá de nuevo.`)
    } finally {
      setReactivando(false)
      enfocar()
    }
  }
```
y cambiar el import de tipos `import type { LineaCarrito, ProductoCache } from '../tipos'` por `import type { LineaCarrito, Producto, ProductoCache } from '../tipos'`.

5. Render: después del bloque
```tsx
      {aviso && (
        <p role="status" className="aviso">
          {aviso}
        </p>
      )}
```
agregar:
```tsx
      {inactivo && productos && (
        <p className="reactivar">
          <button type="button" disabled={reactivando} onClick={() => void reactivar(inactivo)}>
            Reactivar {inactivo.nombre}
          </button>
        </p>
      )}
      {altaCodigo !== null && productos && (
        <AltaRapidaProducto
          codigo={altaCodigo}
          servicio={productos}
          alListo={altaLista}
          alCancelar={() => {
            setAltaCodigo(null)
            enfocar()
          }}
        />
      )}
```

Con la prop sin pasar (pruebas de las tareas 12 y 13), la pantalla se comporta igual que antes: sólo avisa.

- [ ] **Step 14: Correr las pruebas y los tipos**

Run:
```bash
npx vitest run src/productos src/caja
npx tsc --noEmit
npm test
```
Expected: `Test Files  8 passed (8)` y `Tests  46 passed (46)` (5 de `productos`, 8 de `AltaRapidaProducto`, 6 de `PantallaProductos`, 3 de `AltaEnCaja` y las 24 de `src/caja` de la tarea 13); `tsc` sin salida; `npm test` sin fallas. Si las consultas `getByRole('row', { name: ... })` fallan, ver V28 (parte 3). Si `getByRole('form', ...)` no encuentra el formulario, ver V31.

- [ ] **Step 15: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests src/productos src/caja src/test
git commit -m "feat(productos): alta rápida, reactivar, edición de precios e historial" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 16: Jefe y caja del día (SQL con pgTAP; React con Testing Library)

**Files:**
- Create: `supabase/migrations/20261019121700_jefe.sql`
- Modify: `supabase/tests/database/150_permisos_funciones.test.sql` (prueba 5: suma `anonimizar_cliente` y `cambiar_modulo_fiado`)
- Create: `src/jefe/jefe.ts`, `src/jefe/ModuloFiado.tsx`, `src/jefe/AnonimizarCliente.tsx`, `src/jefe/PantallaHistorial.tsx`
- Create: `src/caja-del-dia/cajaDelDia.ts`, `src/caja-del-dia/CajaDelDia.tsx`, `src/caja-del-dia/VentasDelDia.tsx`
- Test: `supabase/tests/database/135_jefe.test.sql`, `src/jefe/jefe.test.ts`, `src/jefe/ModuloFiado.test.tsx`, `src/jefe/AnonimizarCliente.test.tsx`, `src/jefe/PantallaHistorial.test.tsx`, `src/caja-del-dia/CajaDelDia.test.tsx`

Reglas (spec secciones 4, 5, 7, 10 y 11; decisiones 16, 17, 18, 29, 39 y 40):
- `cambiar_modulo_fiado(p_activo boolean)`: sólo el jefe; sólo la clave `'fiado'` (fija en la función, no es parámetro); escribe `modulos_negocio` del negocio del token con `insert ... on conflict do update`. La caja recibe `solo_jefe`.
- `anonimizar_cliente(p_cliente_id uuid)`: sólo el jefe; nombre `'Cliente suprimido'`, teléfono vacío y `suprimido = true` (el check de la tarea 3 exige las tres cosas juntas). La fila y sus ventas y pagos quedan intactos. Anonimizar dos veces no falla. Funciona aunque el fiado esté apagado: es un pedido de la persona (Ley 25.326), no una operación del módulo.
- Historial: **ninguna de las dos va al historial.** El spec lista los tipos (sección 4: cambio de precio, cambio de producto, anulación, apertura y cierre de turno; decisión 27) y no incluye módulo ni anonimización; además, guardar el nombre anterior del cliente en el historial anularía la anonimización (tarea 3: el historial nunca guarda datos de clientes).
- Las dos: `security definer`, `set search_path = ''`, sin parámetro de negocio, `revoke` a `public`, `anon` y `authenticated`, `grant execute` a `authenticated`. Las pruebas genéricas `140` y `150` las cubren (sólo hay que sumar los nombres a la lista de `150`).
- Caja del día: la interfaz no calcula totales; los devuelve `caja_del_dia` (tarea 11). La caja ve sólo hoy: el día lo pide a la base con `hoy()` (tarea 3, ya con `grant execute` a `authenticated`), no al reloj de la PC; el jefe elige la fecha. La base igual rechaza a la caja fuera de hoy (`fuera_de_dia`). El fiado y las anulaciones se muestran aparte del cobrado.
- Ventas del día: `ventas_del_dia` (tarea 11) y anulación con motivo de 3 a 200 caracteres con `anular_venta` (tarea 11), desde la PC actual. Después de anular se recargan la lista y los totales.
- Historial completo, sólo jefe: lectura de `historial` (RLS: sólo el jefe la ve, tarea 3), de a 100 filas, más nuevas primero. Quién hizo el cambio: el kiosco tiene dos cuentas (único `negocio_id`, `rol`), y el jefe sólo puede leer su propia fila de `cuentas`; por eso una `cuenta_id` igual a la propia es "Jefe", otra es "Caja" y vacía es "Fuera de la app" (Studio).

Códigos de error nuevos (`message`, `code` = `P0001`): `solo_jefe` (las dos), `pedido_invalido` (`cambiar_modulo_fiado` con `null`; mismo código que `confirmar_venta`), `cliente_desconocido` (`anonimizar_cliente`, inexistente o de otro negocio). Reusa `sin_cuenta`.

- [ ] **Step 1: Escribir la prueba de las funciones del jefe**

`supabase/tests/database/135_jefe.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'jefe-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'jefe-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'jefe-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'jefe-jefe-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'jefe-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001b', 'b0000000-0000-0000-0000-000000000000', 'jefe');
-- La venta 1 se carga directo: la PC queda con ultimo_numero = 1 para que confirmar_venta numere 2.
insert into public.dispositivos (id, negocio_id, prefijo, ultimo_numero, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 1, 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000',
   'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900);
insert into public.clientes (id, negocio_id, nombre, telefono) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to', '11 5555-1234'),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Marta', null),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Cliente de B', null);
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, 900, repeat('a', 64));
insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 1, 900);
insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'efectivo', 400, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'fiado', 500, 'a5000000-0000-0000-0000-000000000001');

-- 1 y 2: la caja de A no puede
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.cambiar_modulo_fiado(false) $$, 'P0001', 'solo_jefe',
  'la caja no apaga el módulo fiado');
select throws_ok($$ select public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') $$, 'P0001', 'solo_jefe',
  'la caja no anonimiza clientes');

-- 3 y 4: el jefe de A apaga el fiado
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.cambiar_modulo_fiado(false) ->> 'activo', 'false', 'el jefe apaga el fiado');
select ok(not public.modulo_activo('fiado'), 'el fiado quedó apagado para A');

-- 5 a 7: con el fiado apagado, la base rechaza (cruce con las tareas 9 y 10)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Luis', null) $$, 'P0001', 'fiado_deshabilitado',
  'con el fiado apagado, la base rechaza el alta de clientes');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"fiado","importe":900,"cliente_id":"a5000000-0000-0000-0000-000000000002"}]', 900, null) $$,
  'P0001', 'fiado_deshabilitado', 'con el fiado apagado, la base rechaza un pago fiado');
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, 1000) ->> 'numero',
  '2', 'sin fiado se sigue vendiendo en efectivo');

-- 8 a 10: el jefe de B (aislamiento entre negocios, obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select ok(public.modulo_activo('fiado'), 'apagar el fiado de A no apaga el de B');
select throws_ok($$ select public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') $$, 'P0001', 'cliente_desconocido',
  'el jefe de B no anonimiza un cliente de A');
select is(public.cambiar_modulo_fiado(false) ->> 'activo', 'false', 'el jefe de B apaga el fiado de B');

-- 11 a 16: el jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.cambiar_modulo_fiado(true) ->> 'activo', 'true', 'el jefe vuelve a prender el fiado');
select ok(public.modulo_activo('fiado'), 'el cambio aplica sin esperar a que venza el token');
select throws_ok($$ select public.cambiar_modulo_fiado(null) $$, 'P0001', 'pedido_invalido', 'activo nulo se rechaza');
select is(public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') ->> 'nombre', 'Cliente suprimido',
  'el jefe anonimiza un cliente');
select is(public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') ->> 'nombre', 'Cliente suprimido',
  'anonimizar dos veces no falla');
select throws_ok($$ select public.anonimizar_cliente(gen_random_uuid()) $$, 'P0001', 'cliente_desconocido',
  'un cliente inexistente se rechaza');

-- 17: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.cambiar_modulo_fiado(true) $$, 'P0001', 'sin_cuenta', 'sin cuenta no cambia el módulo');

-- 18 a 22: como postgres, qué quedó
reset role;
select results_eq(
  $$ select nombre, telefono, suprimido from public.clientes where id = 'a5000000-0000-0000-0000-000000000001' $$,
  $$ values ('Cliente suprimido'::text, null::text, true) $$,
  'nombre "Cliente suprimido", teléfono vacío y marca de suprimido');
select results_eq(
  $$ select medio::text, importe, cliente_id from public.pagos_venta
     where venta_id = 'a4000000-0000-0000-0000-000000000001' order by medio $$,
  $$ values ('efectivo'::text, 400, null::uuid), ('fiado'::text, 500, 'a5000000-0000-0000-0000-000000000001'::uuid) $$,
  'los pagos de la venta, incluido el fiado del cliente, siguen intactos');
select is((select total from public.ventas where id = 'a4000000-0000-0000-0000-000000000001'), 900,
  'la venta del cliente anonimizado sigue intacta');
select results_eq(
  $$ select nombre from public.clientes
     where id in ('a5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000001') order by nombre $$,
  $$ values ('Cliente de B'::text), ('Marta'::text) $$,
  'los otros clientes, de A y de B, no cambiaron');
select results_eq(
  $$ select negocio_id, activo from public.modulos_negocio where modulo = 'fiado' order by negocio_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000000'::uuid, true), ('b0000000-0000-0000-0000-000000000000'::uuid, false) $$,
  'una fila por kiosco: cada jefe cambia sólo el suyo');

select * from finish();
rollback;
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npx supabase test db`
Expected: FAIL en `135_jefe.test.sql` con `function public.cambiar_modulo_fiado(boolean) does not exist`.

- [ ] **Step 3: Escribir las funciones del jefe**

`supabase/migrations/20261019121700_jefe.sql`:
```sql
-- Funciones del jefe (decisiones 39 y 40). La base chequea el rol: ocultar la pantalla no es seguridad.
-- Ninguna escribe en historial: el spec no lo pide (sección 4, decisión 27) y guardar el nombre
-- anterior del cliente anularía la anonimización.

create or replace function public.cambiar_modulo_fiado(p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if p_activo is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  -- Sólo la clave 'fiado', fija: el resto de modulos_negocio lo cambia Felipe desde Studio.
  insert into public.modulos_negocio (negocio_id, modulo, activo)
  values (v_negocio, 'fiado', p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;

  return jsonb_build_object('modulo', 'fiado', 'activo', p_activo);
end;
$$;

-- Ley 25.326, a pedido de la persona: nombre 'Cliente suprimido', teléfono vacío. La fila y sus ventas quedan.
create or replace function public.anonimizar_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_cliente public.clientes%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;

  update public.clientes c
  set nombre = 'Cliente suprimido', telefono = null, suprimido = true
  where c.id = p_cliente_id and c.negocio_id = v_negocio
  returning * into v_cliente;
  if not found then
    raise exception 'cliente_desconocido' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_cliente.id, 'nombre', v_cliente.nombre, 'telefono', v_cliente.telefono);
end;
$$;

revoke all on function public.cambiar_modulo_fiado(boolean) from public, anon, authenticated;
grant execute on function public.cambiar_modulo_fiado(boolean) to authenticated;
revoke all on function public.anonimizar_cliente(uuid) from public, anon, authenticated;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;
```

- [ ] **Step 4: Sumar las funciones a la lista de permisos**

En `supabase/tests/database/150_permisos_funciones.test.sql`, reemplazar la prueba 5 (la versión de la tarea 15) por (trece nombres):
```sql
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  array['abrir_turno', 'alta_cliente', 'alta_producto_caja', 'anonimizar_cliente', 'anular_venta', 'caja_del_dia',
        'cambiar_modulo_fiado', 'cerrar_turno', 'confirmar_venta', 'editar_producto', 'ranking_sin_codigo',
        'registrar_dispositivo', 'ventas_del_dia'],
  'authenticated ejecuta sólo las funciones security definer de la lista');
```

- [ ] **Step 5: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Finished supabase db reset`; después `All tests successful.` y `Result: PASS`. Si la prueba 7 de `135` falla con `venta_id_reusado` o un número distinto de 2, revisar que la PC de prueba tenga `ultimo_numero = 1`.

- [ ] **Step 6: Escribir los servicios del jefe y de la caja del día**

`src/jefe/jefe.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cliente } from '../tipos'

export type TipoHistorial =
  | 'alta_producto'
  | 'cambio_precio'
  | 'cambio_producto'
  | 'anulacion'
  | 'apertura_turno'
  | 'cierre_turno'

export type EntidadHistorial = 'productos' | 'ventas' | 'turnos'

/** Quién hizo el cambio: el kiosco tiene una cuenta por rol; vacío = Supabase Studio. */
export type QuienHistorial = 'caja' | 'jefe' | 'fuera_de_la_app'

/** Fila de public.historial como la devuelve la API. */
export interface FilaHistorialCruda {
  id: string
  tipo: TipoHistorial
  fecha: string
  cuenta_id: string | null
  dispositivo_id: string | null
  entidad: EntidadHistorial
  entidad_id: string
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  motivo: string | null
}

export interface FilaHistorial {
  id: string
  tipo: TipoHistorial
  fecha: string
  quien: QuienHistorial
  /** Prefijo de la PC, o null si el cambio fue fuera de la app. */
  prefijo: string | null
  entidad: EntidadHistorial
  entidadId: string
  /** Nombre actual del producto (sólo en filas de productos). */
  nombreProducto: string | null
  valorAnterior: Record<string, unknown> | null
  valorNuevo: Record<string, unknown> | null
  motivo: string | null
}

export const PAGINA_HISTORIAL = 100

export interface ServicioJefe {
  /** cambiar_modulo_fiado (tarea 16). Devuelve el estado que quedó. */
  cambiarModuloFiado(activo: boolean): Promise<boolean>
  /** anonimizar_cliente (tarea 16). Irreversible. */
  anonimizarCliente(clienteId: string): Promise<Cliente>
  /** De a PAGINA_HISTORIAL filas, más nuevas primero. */
  leerHistorial(desde: number): Promise<FilaHistorial[]>
}

export const MENSAJES_JEFE: Record<string, string> = {
  solo_jefe: 'Sólo el jefe puede hacer esto.',
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  cliente_desconocido: 'Ese cliente no existe en este kiosco.',
  pedido_invalido: 'El pedido no es válido.',
}

export function mensajeJefe(e: unknown): string {
  const codigo = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  return MENSAJES_JEFE[codigo] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function aFilaHistorial(
  f: FilaHistorialCruda,
  propioId: string,
  prefijos: ReadonlyMap<string, string>,
  nombres: ReadonlyMap<string, string>,
): FilaHistorial {
  return {
    id: f.id,
    tipo: f.tipo,
    fecha: f.fecha,
    quien: f.cuenta_id === null ? 'fuera_de_la_app' : f.cuenta_id === propioId ? 'jefe' : 'caja',
    prefijo: f.dispositivo_id === null ? null : (prefijos.get(f.dispositivo_id) ?? null),
    entidad: f.entidad,
    entidadId: f.entidad_id,
    nombreProducto: f.entidad === 'productos' ? (nombres.get(f.entidad_id) ?? null) : null,
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    motivo: f.motivo,
  }
}

export function crearServicioJefe(supabase: SupabaseClient): ServicioJefe {
  return {
    async cambiarModuloFiado(activo) {
      const { data, error } = await supabase.rpc('cambiar_modulo_fiado', { p_activo: activo })
      if (error) throw error
      return (data as { activo: boolean }).activo
    },
    async anonimizarCliente(clienteId) {
      const { data, error } = await supabase.rpc('anonimizar_cliente', { p_cliente_id: clienteId })
      if (error) throw error
      return data as Cliente
    },
    async leerHistorial(desde) {
      // RLS: el historial lo ve sólo el jefe; de cuentas, sólo la propia fila.
      const [propia, pcs, pagina] = await Promise.all([
        supabase.from('cuentas').select('usuario_id').single(),
        supabase.from('dispositivos').select('id, prefijo'),
        supabase
          .from('historial')
          .select('id, tipo, fecha, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(desde, desde + PAGINA_HISTORIAL - 1),
      ])
      if (propia.error) throw propia.error
      if (pcs.error) throw pcs.error
      if (pagina.error) throw pagina.error
      const filas = pagina.data as FilaHistorialCruda[]
      const ids = [...new Set(filas.filter((f) => f.entidad === 'productos').map((f) => f.entidad_id))]
      const nombres = new Map<string, string>()
      if (ids.length > 0) {
        const productos = await supabase.from('productos').select('id, nombre').in('id', ids)
        if (productos.error) throw productos.error
        for (const p of productos.data as { id: string; nombre: string }[]) nombres.set(p.id, p.nombre)
      }
      const prefijos = new Map((pcs.data as { id: string; prefijo: string }[]).map((d) => [d.id, d.prefijo]))
      const propioId = (propia.data as { usuario_id: string }).usuario_id
      return filas.map((f) => aFilaHistorial(f, propioId, prefijos, nombres))
    },
  }
}
```

`src/caja-del-dia/cajaDelDia.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Medio } from '../tipos'

export interface TotalesMedios {
  efectivo: number
  transferencia: number
  tarjeta: number
  fiado: number
}

export interface AnulacionDelDia {
  venta_id: string
  prefijo: string
  numero: number
  fecha_venta: string
  fecha: string
  total: number
  motivo: string
}

/** caja_del_dia(p_fecha) (tarea 11). Los totales por medio ya vienen netos de las anulaciones del día. */
export interface CajaDia extends TotalesMedios {
  fecha: string
  /** Efectivo + transferencia + tarjeta. El fiado no es plata cobrada. */
  cobrado: number
  anulaciones: TotalesMedios & { cantidad: number; total: number; detalle: AnulacionDelDia[] }
}

/** Fila de ventas_del_dia(p_fecha) (tarea 11). Sin datos de clientes. */
export interface VentaDelDia {
  venta_id: string
  prefijo: string
  numero: number
  hora: string
  total: number
  medios: { medio: Medio; importe: number }[]
  anulada: boolean
}

/** anular_venta (tarea 11). */
export interface AnulacionHecha {
  anulacion_id: string
  venta_id: string
  fecha: string
  motivo: string
  ya_existia: boolean
}

export interface ServicioCajaDelDia {
  /** Día operativo según la base (public.hoy()), no según el reloj de la PC. YYYY-MM-DD. */
  hoy(): Promise<string>
  leerCaja(fecha: string): Promise<CajaDia>
  leerVentas(fecha: string): Promise<VentaDelDia[]>
  anular(ventaId: string, motivo: string): Promise<AnulacionHecha>
}

export const MENSAJES_CAJA_DEL_DIA: Record<string, string> = {
  fuera_de_dia: 'La caja sólo ve y anula ventas de hoy.',
  motivo_invalido: 'Escribí el motivo (de 3 a 200 letras).',
  venta_desconocida: 'Esa venta no existe en este kiosco.',
  fecha_invalida: 'Elegí una fecha.',
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
}

export function mensajeCajaDelDia(e: unknown): string {
  const codigo = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  return MENSAJES_CAJA_DEL_DIA[codigo] ?? 'No se pudo leer. Revisá la conexión y probá de nuevo.'
}

export function crearServicioCajaDelDia(supabase: SupabaseClient, dispositivoId: string): ServicioCajaDelDia {
  return {
    async hoy() {
      const { data, error } = await supabase.rpc('hoy')
      if (error) throw error
      return String(data)
    },
    async leerCaja(fecha) {
      const { data, error } = await supabase.rpc('caja_del_dia', { p_fecha: fecha })
      if (error) throw error
      return data as CajaDia
    },
    async leerVentas(fecha) {
      const { data, error } = await supabase.rpc('ventas_del_dia', { p_fecha: fecha })
      if (error) throw error
      return (data ?? []) as VentaDelDia[]
    },
    async anular(ventaId, motivo) {
      const { data, error } = await supabase.rpc('anular_venta', {
        p_venta_id: ventaId,
        p_dispositivo_id: dispositivoId,
        p_motivo: motivo,
      })
      if (error) throw error
      return data as AnulacionHecha
    },
  }
}
```

- [ ] **Step 7: Escribir las pruebas de las pantallas**

`src/jefe/jefe.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { aFilaHistorial, mensajeJefe, type FilaHistorialCruda } from './jefe'

const base: FilaHistorialCruda = {
  id: 'h1',
  tipo: 'cambio_precio',
  fecha: '2026-10-19T15:00:00Z',
  cuenta_id: 'u-jefe',
  dispositivo_id: 'pc-1',
  entidad: 'productos',
  entidad_id: 'p1',
  valor_anterior: { precio: 900 },
  valor_nuevo: { precio: 1000 },
  motivo: null,
}
const prefijos = new Map([['pc-1', 'A']])
const nombres = new Map([['p1', 'Alfajor triple']])

describe('aFilaHistorial', () => {
  it('la cuenta propia es el jefe; otra del kiosco es la caja; vacía es fuera de la app', () => {
    expect(aFilaHistorial(base, 'u-jefe', prefijos, nombres).quien).toBe('jefe')
    expect(aFilaHistorial({ ...base, cuenta_id: 'u-caja' }, 'u-jefe', prefijos, nombres).quien).toBe('caja')
    expect(aFilaHistorial({ ...base, cuenta_id: null, dispositivo_id: null }, 'u-jefe', prefijos, nombres)).toMatchObject({
      quien: 'fuera_de_la_app',
      prefijo: null,
    })
  })

  it('pone el prefijo de la PC y el nombre del producto sólo en filas de productos', () => {
    expect(aFilaHistorial(base, 'u-jefe', prefijos, nombres)).toMatchObject({ prefijo: 'A', nombreProducto: 'Alfajor triple' })
    expect(aFilaHistorial({ ...base, entidad: 'ventas', entidad_id: 'p1' }, 'u-jefe', prefijos, nombres).nombreProducto).toBeNull()
  })

  it('traduce los errores de la base', () => {
    expect(mensajeJefe({ message: 'solo_jefe' })).toBe('Sólo el jefe puede hacer esto.')
    expect(mensajeJefe(new Error('Failed to fetch'))).toContain('Revisá la conexión')
  })
})
```

`src/jefe/ModuloFiado.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModuloFiado } from './ModuloFiado'

function armar(activo: boolean, cambiar = vi.fn(async (a: boolean) => a)) {
  const alCambiar = vi.fn()
  const user = userEvent.setup()
  render(<ModuloFiado activo={activo} servicio={{ cambiarModuloFiado: cambiar }} alCambiar={alCambiar} />)
  return { cambiar, alCambiar, user }
}

describe('ModuloFiado', () => {
  it('muestra el estado y explica qué pasa con el fiado apagado', () => {
    armar(true)
    expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
    expect(screen.getByText(/la base rechaza los pagos fiados y las altas de clientes/)).toBeInTheDocument()
  })

  it('el interruptor apaga el módulo en la base y avisa el nuevo estado', async () => {
    const { cambiar, alCambiar, user } = armar(true)
    await user.click(screen.getByRole('checkbox', { name: 'Fiado activo' }))
    expect(cambiar).toHaveBeenCalledWith(false)
    expect(alCambiar).toHaveBeenCalledWith(false)
  })

  it('si la base rechaza, el estado no cambia y se avisa', async () => {
    const cambiar = vi.fn(async (_a: boolean): Promise<boolean> => {
      throw { message: 'solo_jefe' }
    })
    const { alCambiar, user } = armar(true, cambiar)
    await user.click(screen.getByRole('checkbox', { name: 'Fiado activo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sólo el jefe puede hacer esto.')
    expect(alCambiar).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Fiado activo' })).toBeChecked()
  })
})
```

`src/jefe/AnonimizarCliente.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cliente } from '../tipos'
import { AnonimizarCliente } from './AnonimizarCliente'

const CLIENTES: Cliente[] = [
  { id: 'c1', nombre: 'Juan del 5to', telefono: '11 5555-1234' },
  { id: 'c2', nombre: 'Marta', telefono: null },
]

function armar(anonimizar = vi.fn(async (id: string): Promise<Cliente> => ({ id, nombre: 'Cliente suprimido', telefono: null }))) {
  const user = userEvent.setup()
  render(<AnonimizarCliente clientes={{ listar: async () => CLIENTES }} servicio={{ anonimizarCliente: anonimizar }} />)
  return { anonimizar, user }
}

describe('AnonimizarCliente', () => {
  it('pide confirmación explícita y después anonimiza', async () => {
    const { anonimizar, user } = armar()
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c1')
    const boton = screen.getByRole('button', { name: 'Anonimizar' })
    expect(boton).toBeDisabled()
    expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Entiendo que no se puede deshacer' }))
    await user.click(boton)
    expect(anonimizar).toHaveBeenCalledWith('c1')
    expect(await screen.findByRole('status')).toHaveTextContent('Juan del 5to quedó como "Cliente suprimido"')
    expect(screen.queryByRole('option', { name: /Juan del 5to/ })).toBeNull()
  })

  it('Cancelar no anonimiza', async () => {
    const { anonimizar, user } = armar()
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c2')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('button', { name: 'Anonimizar' })).toBeNull()
    expect(anonimizar).not.toHaveBeenCalled()
  })

  it('un rechazo de la base se muestra', async () => {
    const anonimizar = vi.fn(async (_id: string): Promise<Cliente> => {
      throw { message: 'solo_jefe' }
    })
    const { user } = armar(anonimizar)
    await user.selectOptions(await screen.findByLabelText('Cliente'), 'c1')
    await user.click(screen.getByRole('checkbox', { name: 'Entiendo que no se puede deshacer' }))
    await user.click(screen.getByRole('button', { name: 'Anonimizar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sólo el jefe puede hacer esto.')
  })
})
```

`src/jefe/PantallaHistorial.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PAGINA_HISTORIAL, type FilaHistorial } from './jefe'
import { describirFila, PantallaHistorial } from './PantallaHistorial'

function fila(p: Partial<FilaHistorial> & Pick<FilaHistorial, 'id' | 'tipo'>): FilaHistorial {
  return {
    fecha: '2026-10-19T15:00:00Z',
    quien: 'caja',
    prefijo: 'A',
    entidad: 'productos',
    entidadId: 'p1',
    nombreProducto: 'Alfajor triple',
    valorAnterior: null,
    valorNuevo: null,
    motivo: null,
    ...p,
  }
}

describe('describirFila', () => {
  it('describe altas, precios, cambios de producto, anulaciones y turnos', () => {
    expect(describirFila(fila({ id: '1', tipo: 'alta_producto', valorNuevo: { nombre: 'Agua', precio: 1200, creado_en_caja: true } })))
      .toBe('Alfajor triple a $1.200 (creado en caja)')
    expect(describirFila(fila({ id: '2', tipo: 'cambio_precio', valorAnterior: { precio: 900 }, valorNuevo: { precio: 1000 } })))
      .toBe('Alfajor triple: $900 → $1.000')
    expect(describirFila(fila({ id: '3', tipo: 'cambio_producto', valorAnterior: { activo: true }, valorNuevo: { activo: false } })))
      .toBe('Alfajor triple: desactivado')
    expect(describirFila(fila({ id: '4', tipo: 'anulacion', entidad: 'ventas', nombreProducto: null, valorAnterior: { total: 900 }, motivo: 'Se cobró dos veces' })))
      .toBe('Venta de $900. Motivo: Se cobró dos veces')
    expect(describirFila(fila({ id: '5', tipo: 'cierre_turno', entidad: 'turnos', valorNuevo: { automatico: true } })))
      .toBe('Cerrado solo al abrir otro turno')
  })
})

describe('PantallaHistorial', () => {
  it('muestra quién hizo cada cambio, también los de fuera de la app', async () => {
    const leer = vi.fn(async (_desde: number) => [
      fila({ id: '1', tipo: 'cambio_precio', valorAnterior: { precio: 900 }, valorNuevo: { precio: 1000 } }),
      fila({ id: '2', tipo: 'cambio_precio', quien: 'fuera_de_la_app', prefijo: null, valorAnterior: { precio: 1000 }, valorNuevo: { precio: 1200 } }),
    ])
    render(<PantallaHistorial servicio={{ leerHistorial: leer }} />)
    const tabla = await screen.findByRole('table', { name: 'Historial' })
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas[0]).toHaveTextContent('Caja')
    expect(filas[0]).toHaveTextContent('PC A')
    expect(filas[1]).toHaveTextContent('Fuera de la app')
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull()
  })

  it('"Ver más" pide la página siguiente', async () => {
    const llena = Array.from({ length: PAGINA_HISTORIAL }, (_, i) => fila({ id: `h${i}`, tipo: 'apertura_turno', entidad: 'turnos' }))
    const leer = vi.fn(async (desde: number) => (desde === 0 ? llena : [fila({ id: 'ultima', tipo: 'apertura_turno', entidad: 'turnos' })]))
    const user = userEvent.setup()
    render(<PantallaHistorial servicio={{ leerHistorial: leer }} />)
    await user.click(await screen.findByRole('button', { name: 'Ver más' }))
    expect(leer).toHaveBeenLastCalledWith(PAGINA_HISTORIAL)
    // findAllByRole volvería apenas ve las filas de la primera página: hay que esperar la cuenta exacta.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(PAGINA_HISTORIAL + 2))
  })
})
```

`src/caja-del-dia/CajaDelDia.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Rol } from '../tipos'
import { CajaDelDia } from './CajaDelDia'
import type { AnulacionHecha, CajaDia, VentaDelDia } from './cajaDelDia'

const CAJA: CajaDia = {
  fecha: '2026-10-19',
  efectivo: 5000,
  transferencia: 1500,
  tarjeta: 2000,
  cobrado: 8500,
  fiado: 700,
  anulaciones: {
    cantidad: 1,
    efectivo: 900,
    transferencia: 0,
    tarjeta: 0,
    fiado: 0,
    total: 900,
    detalle: [
      { venta_id: 'v9', prefijo: 'A', numero: 9, fecha_venta: '2026-10-18T15:00:00Z', fecha: '2026-10-19T13:00:00Z', total: 900, motivo: 'Se cobró dos veces' },
    ],
  },
}

const VENTAS: VentaDelDia[] = [
  { venta_id: 'v1', prefijo: 'A', numero: 12, hora: '10:15', total: 1500, medios: [{ medio: 'efectivo', importe: 800 }, { medio: 'fiado', importe: 700 }], anulada: false },
  { venta_id: 'v2', prefijo: 'A', numero: 11, hora: '09:40', total: 900, medios: [{ medio: 'tarjeta', importe: 900 }], anulada: true },
]

function servicioFalso() {
  return {
    hoy: vi.fn(async () => '2026-10-19'),
    leerCaja: vi.fn(async (_fecha: string): Promise<CajaDia> => CAJA),
    leerVentas: vi.fn(async (_fecha: string): Promise<VentaDelDia[]> => VENTAS),
    anular: vi.fn(async (ventaId: string, motivo: string): Promise<AnulacionHecha> => ({
      anulacion_id: 'an1',
      venta_id: ventaId,
      fecha: '2026-10-19T16:00:00Z',
      motivo,
      ya_existia: false,
    })),
  }
}

function armar(rol: Rol, servicio = servicioFalso()) {
  const user = userEvent.setup()
  render(<CajaDelDia rol={rol} servicio={servicio} />)
  return { servicio, user }
}

describe('CajaDelDia', () => {
  it('la caja ve sólo hoy: sin selector de fecha, con el día que dice la base', async () => {
    const { servicio } = armar('caja')
    await screen.findByRole('table', { name: 'Cobrado' })
    expect(screen.queryByLabelText('Fecha')).toBeNull()
    expect(servicio.leerCaja).toHaveBeenCalledWith('2026-10-19')
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenCalledWith('2026-10-19'))
  })

  it('muestra el fiado y las anulaciones aparte del total cobrado', async () => {
    armar('caja')
    const cobrado = await screen.findByRole('table', { name: 'Cobrado' })
    expect(within(cobrado).getByRole('row', { name: /Total cobrado/ })).toHaveTextContent('$8.500')
    expect(within(cobrado).queryByText(/Fiado/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Fiado' })).toHaveTextContent('$700')
    const anulaciones = screen.getByRole('region', { name: 'Anulaciones' })
    expect(anulaciones).toHaveTextContent('A-000009')
    expect(anulaciones).toHaveTextContent('Se cobró dos veces')
  })

  it('el jefe elige la fecha', async () => {
    const { servicio } = armar('jefe')
    const fecha = await screen.findByLabelText('Fecha')
    await waitFor(() => expect(fecha).toHaveValue('2026-10-19'))
    fireEvent.change(fecha, { target: { value: '2026-10-10' } })
    await waitFor(() => expect(servicio.leerCaja).toHaveBeenLastCalledWith('2026-10-10'))
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenLastCalledWith('2026-10-10'))
  })

  it('anular pide motivo; con motivo anula y recarga los totales', async () => {
    const { servicio, user } = armar('caja')
    await user.click(await screen.findByRole('button', { name: 'Anular A-000012' }))
    await user.type(screen.getByLabelText('Motivo'), 'no')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('de 3 a 200 letras')
    expect(servicio.anular).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Motivo'))
    await user.type(screen.getByLabelText('Motivo'), 'El cliente se arrepintió')
    await user.click(screen.getByRole('button', { name: 'Confirmar anulación' }))
    expect(servicio.anular).toHaveBeenCalledWith('v1', 'El cliente se arrepintió')
    await waitFor(() => expect(servicio.leerCaja).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(servicio.leerVentas).toHaveBeenCalledTimes(2))
  })

  it('una venta anulada se marca y no ofrece anular', async () => {
    armar('jefe')
    const fila = await screen.findByRole('row', { name: /A-000011/ })
    expect(fila).toHaveTextContent('Anulada')
    expect(screen.queryByRole('button', { name: 'Anular A-000011' })).toBeNull()
  })

  it('si la base dice fuera_de_dia, se muestra el aviso', async () => {
    const servicio = servicioFalso()
    servicio.leerCaja.mockRejectedValueOnce({ message: 'fuera_de_dia' })
    armar('caja', servicio)
    const avisos = await screen.findAllByRole('alert')
    expect(avisos[0]).toHaveTextContent('La caja sólo ve y anula ventas de hoy.')
  })
})
```

- [ ] **Step 8: Correrlas y ver que fallan**

Run: `npx vitest run src/jefe src/caja-del-dia`
Expected: FAIL: `Failed to resolve import "./ModuloFiado"`, `"./AnonimizarCliente"`, `"./PantallaHistorial"` y `"./CajaDelDia"`. `jefe.test.ts` pasa (el servicio ya está escrito).

- [ ] **Step 9: Implementar las pantallas del jefe**

`src/jefe/ModuloFiado.tsx`:
```tsx
import { useState } from 'react'
import { mensajeJefe, type ServicioJefe } from './jefe'

export interface PropsModuloFiado {
  /** Estado actual (modulo_activo, leído por la tarea 17). */
  activo: boolean
  servicio: Pick<ServicioJefe, 'cambiarModuloFiado'>
  /** El kiosco actualiza su estado: la pantalla de cobro muestra u oculta el fiado. */
  alCambiar(activo: boolean): void
}

/** Decisión 39: el jefe activa o desactiva el fiado desde la app. La base es la que lo hace cumplir. */
export function ModuloFiado({ activo, servicio, alCambiar }: PropsModuloFiado) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiar(nuevo: boolean) {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      alCambiar(await servicio.cambiarModuloFiado(nuevo))
    } catch (e) {
      setError(mensajeJefe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="modulo-fiado">
      <h2>Módulo fiado</h2>
      <label>
        <input type="checkbox" checked={activo} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} />
        Fiado activo
      </label>
      <p>Con el fiado activo, la caja puede cobrar una parte de la venta como fiado y dar de alta clientes.</p>
      <p>
        Con el fiado apagado, la caja no muestra el medio Fiado, y la base rechaza los pagos fiados y las altas de clientes
        aunque alguien los intente por otro lado. Los clientes y las ventas fiadas que ya existen no se borran.
      </p>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </section>
  )
}
```

`src/jefe/AnonimizarCliente.tsx`:
```tsx
import { useEffect, useState } from 'react'
import type { ServicioClientes } from '../pagos/clientes'
import type { Cliente } from '../tipos'
import { mensajeJefe, type ServicioJefe } from './jefe'

export interface PropsAnonimizarCliente {
  /** Clientes no suprimidos del kiosco (tarea 14). */
  clientes: Pick<ServicioClientes, 'listar'>
  servicio: Pick<ServicioJefe, 'anonimizarCliente'>
}

/** Decisión 40 y Ley 25.326: a pedido de la persona. Irreversible: pide confirmación explícita. */
export function AnonimizarCliente({ clientes, servicio }: PropsAnonimizarCliente) {
  const [lista, setLista] = useState<Cliente[] | null>(null)
  const [elegidoId, setElegidoId] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  useEffect(() => {
    clientes.listar().then(setLista, () => setError('No se pudo leer la lista de clientes. Revisá la conexión.'))
  }, [clientes])

  const elegido = lista?.find((c) => c.id === elegidoId) ?? null

  function elegir(id: string) {
    setElegidoId(id)
    setConfirmado(false)
    setHecho(null)
    setError(null)
  }

  async function anonimizar() {
    if (!elegido || !confirmado || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await servicio.anonimizarCliente(elegido.id)
      setLista((l) => l?.filter((c) => c.id !== elegido.id) ?? null)
      setHecho(`${elegido.nombre} quedó como "Cliente suprimido". Sus ventas siguen guardadas.`)
      setElegidoId('')
      setConfirmado(false)
    } catch (e) {
      setError(mensajeJefe(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="anonimizar-cliente">
      <h2>Anonimizar un cliente</h2>
      <p>
        Se hace sólo a pedido de la persona. El nombre pasa a "Cliente suprimido" y el teléfono se borra. Las ventas y
        los pagos fiados se mantienen. No se puede deshacer.
      </p>
      {hecho && (
        <p role="status" className="aviso">
          {hecho}
        </p>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {lista && (
        <label>
          Cliente
          <select value={elegidoId} onChange={(e) => elegir(e.target.value)}>
            <option value="">Elegí un cliente</option>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.telefono ? ` (${c.telefono})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {elegido && (
        <div className="anonimizar-cliente__confirmacion">
          <p>
            Vas a anonimizar a <strong>{elegido.nombre}</strong>.
          </p>
          <label>
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
            Entiendo que no se puede deshacer
          </label>
          <button type="button" disabled={!confirmado || enviando} onClick={() => void anonimizar()}>
            Anonimizar
          </button>
          <button type="button" onClick={() => elegir('')}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  )
}
```

`src/jefe/PantallaHistorial.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import { PAGINA_HISTORIAL, type FilaHistorial, type QuienHistorial, type ServicioJefe, type TipoHistorial } from './jefe'

const TITULO: Record<TipoHistorial, string> = {
  alta_producto: 'Alta de producto',
  cambio_precio: 'Cambio de precio',
  cambio_producto: 'Cambio de producto',
  anulacion: 'Anulación',
  apertura_turno: 'Apertura de turno',
  cierre_turno: 'Cierre de turno',
}

const QUIEN: Record<QuienHistorial, string> = {
  caja: 'Caja',
  jefe: 'Jefe',
  fuera_de_la_app: 'Fuera de la app',
}

const pesos = (v: unknown) => (typeof v === 'number' ? formatearPesos(v) : '—')
const texto = (v: unknown) => (v === null || v === undefined ? 'sin código' : String(v))

function cambiosDeProducto(antes: Record<string, unknown>, despues: Record<string, unknown>): string {
  const partes: string[] = []
  if ('nombre' in despues) partes.push(`nombre "${String(antes.nombre)}" → "${String(despues.nombre)}"`)
  if ('activo' in despues) partes.push(despues.activo === true ? 'reactivado' : 'desactivado')
  if ('codigo_barras' in despues) partes.push(`código ${texto(antes.codigo_barras)} → ${texto(despues.codigo_barras)}`)
  return partes.join(', ')
}

/** Texto de una fila. El historial nunca trae datos de clientes. */
export function describirFila(f: FilaHistorial): string {
  const antes = f.valorAnterior ?? {}
  const despues = f.valorNuevo ?? {}
  const nombre = f.nombreProducto ?? (typeof despues.nombre === 'string' ? despues.nombre : 'Producto')
  switch (f.tipo) {
    case 'alta_producto':
      return `${nombre} a ${pesos(despues.precio)}${despues.creado_en_caja === true ? ' (creado en caja)' : ''}`
    case 'cambio_precio':
      return `${nombre}: ${pesos(antes.precio)} → ${pesos(despues.precio)}`
    case 'cambio_producto':
      return `${nombre}: ${cambiosDeProducto(antes, despues)}`
    case 'anulacion':
      return `Venta de ${pesos(antes.total)}. Motivo: ${f.motivo ?? ''}`
    case 'apertura_turno':
      return 'Turno abierto'
    case 'cierre_turno':
      return despues.automatico === true ? 'Cerrado solo al abrir otro turno' : 'Turno cerrado'
  }
}

const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})

export interface PropsPantallaHistorial {
  servicio: Pick<ServicioJefe, 'leerHistorial'>
}

/** Historial de auditoría completo (sólo jefe; la base sólo se lo muestra al jefe). */
export function PantallaHistorial({ servicio }: PropsPantallaHistorial) {
  const [filas, setFilas] = useState<FilaHistorial[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar(desde: number) {
    setCargando(true)
    setError(null)
    try {
      const pagina = await servicio.leerHistorial(desde)
      setFilas((actuales) => (desde === 0 ? pagina : [...actuales, ...pagina]))
      setHayMas(pagina.length === PAGINA_HISTORIAL)
    } catch {
      setError('No se pudo leer el historial. Revisá la conexión.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar(0)
  }, [servicio])

  return (
    <section className="historial">
      <h2>Historial</h2>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <table aria-label="Historial">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Qué</th>
            <th>Detalle</th>
            <th>Quién</th>
            <th>PC</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{formatoFecha.format(new Date(f.fecha))}</td>
              <td>{TITULO[f.tipo]}</td>
              <td>{describirFila(f)}</td>
              <td>{QUIEN[f.quien]}</td>
              <td>{f.prefijo ? `PC ${f.prefijo}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cargando && <p>Cargando…</p>}
      {!cargando && hayMas && (
        <button type="button" onClick={() => void cargar(filas.length)}>
          Ver más
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 10: Implementar la caja del día y las ventas del día**

`src/caja-del-dia/VentasDelDia.tsx`:
```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatearPesos } from '../lib/plata'
import { NOMBRE_MEDIO } from '../tipos'
import { formatearNumeroVenta } from '../venta/confirmar'
import { MENSAJES_CAJA_DEL_DIA, mensajeCajaDelDia, type ServicioCajaDelDia, type VentaDelDia } from './cajaDelDia'

export interface PropsVentasDelDia {
  /** La caja recibe siempre hoy; el jefe, el día que eligió. */
  fecha: string
  servicio: Pick<ServicioCajaDelDia, 'leerVentas' | 'anular'>
  /** Sube cuando hay que recargar (Actualizar o una anulación). */
  vuelta: number
  alAnular(): void
}

/** Ventas del día y anulación con motivo (decisión 17). También sirve para revisar antes de recargar una venta tras F5. */
export function VentasDelDia({ fecha, servicio, vuelta, alAnular }: PropsVentasDelDia) {
  const [ventas, setVentas] = useState<VentaDelDia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<VentaDelDia | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorAnular, setErrorAnular] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)

  useEffect(() => {
    let vigente = true
    setVentas(null)
    setError(null)
    servicio.leerVentas(fecha).then(
      (v) => {
        if (vigente) setVentas(v)
      },
      (e: unknown) => {
        if (vigente) setError(mensajeCajaDelDia(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, fecha, vuelta])

  function empezar(v: VentaDelDia) {
    setAnulando(v)
    setMotivo('')
    setErrorAnular(null)
  }

  async function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!anulando || enCurso.current) return
    const m = motivo.trim()
    if (m.length < 3 || m.length > 200) {
      setErrorAnular(MENSAJES_CAJA_DEL_DIA.motivo_invalido)
      return
    }
    enCurso.current = true
    setEnviando(true)
    setErrorAnular(null)
    try {
      await servicio.anular(anulando.venta_id, m)
      setAnulando(null)
      setMotivo('')
      alAnular()
    } catch (err) {
      setErrorAnular(mensajeCajaDelDia(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <section className="ventas-del-dia" aria-label="Ventas del día">
      <h3>Ventas</h3>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {ventas === null && !error && <p>Cargando…</p>}
      {ventas && ventas.length === 0 && <p>No hay ventas este día.</p>}
      {ventas && ventas.length > 0 && (
        <table aria-label="Ventas">
          <thead>
            <tr>
              <th>Número</th>
              <th>Hora</th>
              <th>Total</th>
              <th>Pagos</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => {
              const numero = formatearNumeroVenta(v.prefijo, v.numero)
              return (
                <tr key={v.venta_id}>
                  <td>{numero}</td>
                  <td>{v.hora}</td>
                  <td>{formatearPesos(v.total)}</td>
                  <td>{v.medios.map((m) => `${NOMBRE_MEDIO[m.medio]} ${formatearPesos(m.importe)}`).join(' + ')}</td>
                  <td>
                    {v.anulada ? (
                      'Anulada'
                    ) : (
                      <button type="button" aria-label={`Anular ${numero}`} onClick={() => empezar(v)}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {anulando && (
        <form className="anular-venta" aria-label="Anular venta" onSubmit={(e) => void confirmar(e)}>
          <p>
            Anular la venta {formatearNumeroVenta(anulando.prefijo, anulando.numero)} de {formatearPesos(anulando.total)}.
            La venta no se borra: queda la anulación con el motivo.
          </p>
          <label>
            Motivo
            <textarea value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {errorAnular && (
            <p role="alert" className="aviso aviso--error">
              {errorAnular}
            </p>
          )}
          <button type="submit" disabled={enviando}>
            Confirmar anulación
          </button>
          <button type="button" onClick={() => setAnulando(null)}>
            Cancelar
          </button>
        </form>
      )}
    </section>
  )
}
```

`src/caja-del-dia/CajaDelDia.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import type { Rol } from '../tipos'
import { formatearNumeroVenta } from '../venta/confirmar'
import { mensajeCajaDelDia, type CajaDia, type ServicioCajaDelDia } from './cajaDelDia'
import { VentasDelDia } from './VentasDelDia'

export interface PropsCajaDelDia {
  rol: Rol
  servicio: ServicioCajaDelDia
}

/**
 * Caja del día (decisión 18): totales por medio, fiado aparte, anulaciones aparte.
 * La caja ve sólo hoy (el día lo da la base); el jefe elige la fecha. La base rechaza igual a la caja fuera de hoy.
 */
export function CajaDelDia({ rol, servicio }: PropsCajaDelDia) {
  const [fecha, setFecha] = useState<string | null>(null)
  const [caja, setCaja] = useState<CajaDia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)

  function leerHoy() {
    servicio.hoy().then(setFecha, (e: unknown) => setError(mensajeCajaDelDia(e)))
  }

  useEffect(leerHoy, [servicio])

  useEffect(() => {
    if (fecha === null) return
    let vigente = true
    setCaja(null)
    setError(null)
    servicio.leerCaja(fecha).then(
      (c) => {
        if (vigente) setCaja(c)
      },
      (e: unknown) => {
        if (vigente) setError(mensajeCajaDelDia(e))
      },
    )
    return () => {
      vigente = false
    }
  }, [servicio, fecha, vuelta])

  function actualizar() {
    // Pasada la medianoche, la caja pasa sola al día nuevo.
    if (rol === 'caja') leerHoy()
    setVuelta((v) => v + 1)
  }

  return (
    <section className="caja-del-dia">
      <h2>Caja del día</h2>
      <div className="caja-del-dia__fecha">
        {rol === 'jefe' ? (
          <label>
            Fecha
            <input
              type="date"
              value={fecha ?? ''}
              onChange={(e) => {
                if (e.target.value) setFecha(e.target.value)
              }}
            />
          </label>
        ) : (
          <p>Hoy{fecha ? ` (${fecha})` : ''}</p>
        )}
        <button type="button" onClick={actualizar}>
          Actualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {caja && <ResumenCaja caja={caja} />}
      {fecha && <VentasDelDia fecha={fecha} servicio={servicio} vuelta={vuelta} alAnular={() => setVuelta((v) => v + 1)} />}
    </section>
  )
}

function ResumenCaja({ caja }: { caja: CajaDia }) {
  const filas: [string, number][] = [
    ['Efectivo', caja.efectivo],
    ['Transferencia', caja.transferencia],
    ['Tarjeta', caja.tarjeta],
    ['Total cobrado', caja.cobrado],
  ]
  const a = caja.anulaciones
  return (
    <>
      <table aria-label="Cobrado">
        <tbody>
          {filas.map(([nombre, importe]) => (
            <tr key={nombre}>
              <th scope="row">{nombre}</th>
              <td>{formatearPesos(importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="caja-del-dia__fiado" aria-label="Fiado">
        <h3>Fiado (no cobrado)</h3>
        <p>{formatearPesos(caja.fiado)}</p>
      </section>
      <section className="caja-del-dia__anulaciones" aria-label="Anulaciones">
        <h3>Anulaciones</h3>
        {a.cantidad === 0 ? (
          <p>Sin anulaciones.</p>
        ) : (
          <>
            <p>
              {a.cantidad} {a.cantidad === 1 ? 'anulación' : 'anulaciones'} por {formatearPesos(a.total)}. Ya están
              restadas de los totales de arriba.
            </p>
            <ul>
              {a.detalle.map((d) => (
                <li key={d.venta_id}>
                  {formatearNumeroVenta(d.prefijo, d.numero)} · {formatearPesos(d.total)} · {d.motivo}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 11: Correr las pruebas y los tipos**

Run:
```bash
npx vitest run src/jefe src/caja-del-dia
npx tsc --noEmit
npm test
```
Expected: `Test Files  5 passed (5)` y `Tests  18 passed (18)` (3 de `jefe`, 3 de `ModuloFiado`, 3 de `AnonimizarCliente`, 3 de `PantallaHistorial` y 6 de `CajaDelDia`); `tsc` sin salida; `npm test` sin fallas. Si `getByRole('region', { name: ... })` o `getByRole('form', { name: ... })` no encuentran las secciones, ver V31. Si el `fireEvent.change` sobre el `input type="date"` no cambia el valor en jsdom, ver V32. Si `hoy()` llega con otro formato, ver V33.

- [ ] **Step 12: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations supabase/tests src/jefe src/caja-del-dia
git commit -m "feat(jefe): módulo fiado, anonimización, historial y caja del día" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 17: Login por rol y arranque de la app (React, Vitest con mocks)

**Files:**
- Create: `src/auth/cuenta.ts`, `src/auth/useSesion.ts`, `src/auth/Login.tsx`, `src/Kiosco.tsx`, `src/servicios.ts`, `src/test/servicios.ts`
- Modify: `src/App.tsx` (reemplaza entero el provisorio de la tarea 1), `src/main.tsx` (arma los servicios reales y se los pasa a `App`)
- Test: `src/auth/cuenta.test.ts`, `src/auth/useSesion.test.ts`, `src/auth/Login.test.tsx`, `src/Kiosco.test.tsx`, `src/App.test.tsx`

Reglas (spec secciones 6, 10 y 11; decisiones 2, 7, 23, 31, 34):
- Login con email y contraseña (`supabase.auth.signInWithPassword`). Mensaje genérico ante credenciales malas: "Email o contraseña incorrectos." sea cual sea la causa, así no se revela si el email existe (la doc de Supabase ya devuelve el mismo error en los dos casos). Ante un error de red, otro mensaje ("No se pudo conectar…"), que tampoco revela nada.
- Usuario sin cuenta. Con el plan A de la tarea 4, el hook rechaza el login con `http_code` 403; verificado en la doc de auth hooks que el código y el mensaje del hook llegan a la app como error HTTP. La pantalla muestra "Esta cuenta no está vinculada a ningún kiosco." Sólo se ve después de una contraseña correcta, así que no sirve para averiguar emails. Con el plan B (el login entra sin `negocio_id`), `leerCuenta` no encuentra fila en `cuentas` y se muestra el mismo mensaje. Las dos ramas quedan cubiertas.
- El rol y el negocio se leen de `cuentas` con `auth.uid()` (RLS `cuentas_select`, tarea 3), no del token.
- Pantallas por rol con la tabla de permisos de la sección 10. Caja y jefe: Caja, Productos, Caja del día. Sólo jefe: Historial, Módulo fiado, Anonimizar cliente y Calibrar escáner (acceso que pidió la parte 3). Ocultar no es seguridad: la base chequea el rol en cada función.
- Primer login en el navegador: `registrarDispositivo(supabase, negocioId)` (tarea 8) usa el id de `src/dispositivo/dispositivo.ts` y devuelve el prefijo. El prefijo queda en memoria del kiosco y se muestra ("PC A"). Lo único en `localStorage` sigue siendo el id de la PC.
- Cerrar sesión, en este orden: 1) estado "sin sesión": `App` desmonta el kiosco y con él la venta en armado y su id, que viven sólo en el estado de `PantallaCaja` (tareas 10 y 12; no hay estado de venta a nivel módulo); 2) `borrarCache()` (tarea 7); 3) `supabase.auth.signOut({ scope: 'local' })`. Se usa `local` porque el valor por defecto (`global`) cerraría también la cuenta caja en las otras PCs del kiosco (verificado en la doc de `signOut`). Si borrar la caché falla, la sesión se cierra igual.
- La caja sigue montada (oculta) al cambiar de sección: ir a Productos a corregir un precio no pierde la venta en armado.
- "Cerrar turno" (tarea 8, `cerrar_turno`) pide confirmación, porque una venta sin cobrar se pierde; muestra el resumen por medio (`ResumenCierre`) y vuelve a la caja, que pide abrir turno.
- `src/servicios.ts` une los módulos de las tareas 6 a 16 con el cliente real; `src/main.tsx` lo arma con `supabase` (tarea 7) y `cacheDeLaApp()`. Las pruebas usan servicios falsos y no importan `src/lib/supabase.ts`, que exige variables `VITE_*`.
- La prueba de integración del token ya existe (tarea 4, `tests/integracion/token.test.ts`): no se duplica.

- [ ] **Step 1: Escribir las pruebas de cuenta y sesión**

`src/auth/cuenta.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { leerCuenta } from './cuenta'

function supabaseFalso(respuesta: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn(async () => respuesta)
  const eq = vi.fn((_columna: string, _valor: string) => ({ maybeSingle }))
  const select = vi.fn((_columnas: string) => ({ eq }))
  const from = vi.fn((_tabla: string) => ({ select }))
  return { cliente: { from } as unknown as SupabaseClient, from, eq }
}

describe('leerCuenta', () => {
  it('lee rol y negocio propios desde cuentas', async () => {
    const { cliente, from, eq } = supabaseFalso({ data: { usuario_id: 'u1', negocio_id: 'n1', rol: 'jefe' }, error: null })
    expect(await leerCuenta(cliente, 'u1')).toEqual({ usuarioId: 'u1', negocioId: 'n1', rol: 'jefe' })
    expect(from).toHaveBeenCalledWith('cuentas')
    expect(eq).toHaveBeenCalledWith('usuario_id', 'u1')
  })

  it('sin fila en cuentas devuelve null', async () => {
    const { cliente } = supabaseFalso({ data: null, error: null })
    expect(await leerCuenta(cliente, 'u1')).toBeNull()
  })

  it('un error de la base se propaga', async () => {
    const { cliente } = supabaseFalso({ data: null, error: { message: 'sin red' } })
    await expect(leerCuenta(cliente, 'u1')).rejects.toEqual({ message: 'sin red' })
  })
})
```

`src/auth/useSesion.test.ts`:
```ts
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { authFalso } from '../test/servicios'
import { resultadoLogin, useSesion } from './useSesion'

describe('resultadoLogin', () => {
  it('traduce los errores de Supabase sin revelar si el email existe', () => {
    expect(resultadoLogin(null)).toBe('ok')
    expect(resultadoLogin(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe('credenciales')
    expect(resultadoLogin(new AuthApiError('Esta cuenta no está vinculada a ningún kiosco.', 403, undefined))).toBe('sin_cuenta')
    expect(resultadoLogin(new AuthRetryableFetchError('Failed to fetch', 0))).toBe('red')
    expect(resultadoLogin(new Error('otra cosa'))).toBe('credenciales')
  })
})

describe('useSesion', () => {
  it('arranca con la sesión guardada', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const { result } = renderHook(() => useSesion(auth, async () => undefined))
    await waitFor(() => expect(result.current.estado).toEqual({ tipo: 'abierta', sesion: { usuarioId: 'u-caja' } }))
  })

  it('cerrar sesión: primero la memoria, después la caché, después Supabase', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const borrarCache = vi.fn(async () => undefined)
    const { result } = renderHook(() => useSesion(auth, borrarCache))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    await act(() => result.current.cerrarSesion())
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
    expect(borrarCache).toHaveBeenCalledTimes(1)
    expect(auth.cerrar).toHaveBeenCalledTimes(1)
    expect(borrarCache.mock.invocationCallOrder[0]).toBeLessThan(auth.cerrar.mock.invocationCallOrder[0])
  })

  it('si borrar la caché falla, la sesión se cierra igual', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const borrarCache = vi.fn(async () => {
      throw new Error('IndexedDB bloqueada')
    })
    const { result } = renderHook(() => useSesion(auth, borrarCache))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    await act(() => result.current.cerrarSesion())
    expect(auth.cerrar).toHaveBeenCalledTimes(1)
    expect(result.current.estado).toEqual({ tipo: 'cerrada' })
  })

  it('un refresco del token del mismo usuario no cambia el estado (no remonta el kiosco)', async () => {
    const auth = authFalso({ usuarioId: 'u-caja' })
    const { result } = renderHook(() => useSesion(auth, async () => undefined))
    await waitFor(() => expect(result.current.estado.tipo).toBe('abierta'))
    const antes = result.current.estado
    act(() => auth.emitir({ usuarioId: 'u-caja' }))
    expect(result.current.estado).toBe(antes)
  })
})
```

- [ ] **Step 2: Escribir las pruebas del login, del kiosco y de la app**

`src/auth/Login.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Login } from './Login'
import type { ResultadoLogin } from './useSesion'

function armar(iniciar = vi.fn(async (_email: string, _password: string): Promise<ResultadoLogin> => 'ok')) {
  const user = userEvent.setup()
  render(<Login iniciar={iniciar} />)
  return { iniciar, user }
}

async function entrar(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('Login', () => {
  it('manda email (sin espacios) y contraseña', async () => {
    const { iniciar, user } = armar()
    await entrar(user, '  caja@kiosco.local ', 'secreta')
    expect(iniciar).toHaveBeenCalledWith('caja@kiosco.local', 'secreta')
  })

  it('credenciales malas: mensaje genérico y contraseña vacía', async () => {
    const { user } = armar(vi.fn(async (): Promise<ResultadoLogin> => 'credenciales'))
    await entrar(user, 'nadie@kiosco.local', 'mala')
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(screen.getByLabelText('Contraseña')).toHaveValue('')
  })

  it('sin red o con un error inesperado: avisa que no se pudo conectar', async () => {
    const iniciar = vi.fn(async (): Promise<ResultadoLogin> => {
      throw new Error('fetch')
    })
    const { user } = armar(iniciar)
    await entrar(user, 'caja@kiosco.local', 'secreta')
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar')
  })

  it('el botón se deshabilita mientras entra', async () => {
    const iniciar = vi.fn((): Promise<ResultadoLogin> => new Promise(() => undefined))
    const { user } = armar(iniciar)
    await entrar(user, 'caja@kiosco.local', 'secreta')
    expect(screen.getByRole('button', { name: 'Entrando…' })).toBeDisabled()
    expect(iniciar).toHaveBeenCalledTimes(1)
  })
})
```

`src/Kiosco.test.tsx`:
```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Cuenta } from './auth/cuenta'
import { Kiosco } from './Kiosco'
import { CUENTA_CAJA, CUENTA_JEFE, serviciosFalsos } from './test/servicios'

function armar(cuenta: Cuenta, servicios = serviciosFalsos()) {
  const alCerrarSesion = vi.fn()
  const user = userEvent.setup()
  render(<Kiosco servicios={servicios} cuenta={cuenta} alCerrarSesion={alCerrarSesion} />)
  return { servicios, alCerrarSesion, user }
}

const secciones = () =>
  within(screen.getByRole('navigation', { name: 'Secciones' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('Kiosco', () => {
  it('registra la PC al entrar, muestra el prefijo y programa la caché', async () => {
    const { servicios } = armar(CUENTA_CAJA)
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.registrarDispositivo).toHaveBeenCalledWith('n1')
    expect(servicios.sincronizarCatalogo).toHaveBeenCalled()
    expect(servicios.turno).toHaveBeenCalledWith('pc-1')
  })

  it('la caja no ve las pantallas del jefe', async () => {
    armar(CUENTA_CAJA)
    await screen.findByText('Caja · PC A')
    expect(secciones()).toEqual(['Caja', 'Productos', 'Caja del día'])
  })

  it('el jefe ve todas las secciones y abre el historial', async () => {
    const { servicios, user } = armar(CUENTA_JEFE)
    await screen.findByText('Jefe · PC A')
    expect(secciones()).toEqual([
      'Caja', 'Productos', 'Caja del día', 'Historial', 'Módulo fiado', 'Anonimizar cliente', 'Calibrar escáner',
    ])
    await user.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('table', { name: 'Historial' })).toBeInTheDocument()
    expect(servicios.jefe.leerHistorial).toHaveBeenCalledWith(0)
  })

  it('el jefe apaga el fiado y el kiosco se queda con el estado nuevo', async () => {
    const { servicios, user } = armar(CUENTA_JEFE)
    await user.click(await screen.findByRole('button', { name: 'Módulo fiado' }))
    const interruptor = screen.getByRole('checkbox', { name: 'Fiado activo' })
    await waitFor(() => expect(interruptor).toBeChecked())
    await user.click(interruptor)
    expect(servicios.jefe.cambiarModuloFiado).toHaveBeenCalledWith(false)
    await waitFor(() => expect(interruptor).not.toBeChecked())
  })

  it('si no se puede registrar la PC, ofrece reintentar', async () => {
    const servicios = serviciosFalsos()
    servicios.registrarDispositivo.mockRejectedValueOnce(new Error('sin red'))
    const { user } = armar(CUENTA_CAJA, servicios)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar esta PC')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.registrarDispositivo).toHaveBeenCalledTimes(2)
  })

  it('cerrar turno pide confirmación, muestra el resumen y vuelve a pedir apertura', async () => {
    const { servicios, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Cerrar turno' }))
    expect(screen.getByText(/Si hay una venta sin cobrar, se pierde/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sí, cerrar turno' }))
    const turno = servicios.turno.mock.results[0].value
    expect(turno.cerrar).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Turno cerrado' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Listo' }))
    await waitFor(() => expect(turno.leer).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: 'Abrir turno' })).toBeVisible()
  })

  it('"Cerrar sesión" avisa a la app', async () => {
    const { alCerrarSesion, user } = armar(CUENTA_CAJA)
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(alCerrarSesion).toHaveBeenCalledTimes(1)
  })
})
```

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { serviciosFalsos } from './test/servicios'

async function entrar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'caja@kiosco.local')
  await user.type(screen.getByLabelText('Contraseña'), 'secreta')
  await user.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('App', () => {
  it('sin sesión muestra el login; con login correcto entra al kiosco de su cuenta', async () => {
    const servicios = serviciosFalsos()
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByText('Caja · PC A')).toBeInTheDocument()
    expect(servicios.leerCuenta).toHaveBeenCalledWith('u-caja')
  })

  it('un login con error muestra el mensaje genérico y no entra', async () => {
    const servicios = serviciosFalsos()
    servicios.auth.iniciar.mockResolvedValueOnce('credenciales')
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.')
    expect(servicios.leerCuenta).not.toHaveBeenCalled()
  })

  it('el hook rechaza a un usuario sin cuenta (plan A de la tarea 4)', async () => {
    const servicios = serviciosFalsos()
    servicios.auth.iniciar.mockResolvedValueOnce('sin_cuenta')
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await entrar(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no está vinculada a ningún kiosco.')
  })

  it('una sesión sin fila en cuentas no entra al kiosco (plan B de la tarea 4)', async () => {
    const servicios = serviciosFalsos({ sesion: { usuarioId: 'u-suelto' }, cuenta: null })
    render(<App servicios={servicios} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta no está vinculada a ningún kiosco.')
    expect(servicios.registrarDispositivo).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
  })

  it('cerrar sesión borra la caché, cierra Supabase y desmonta el kiosco con su venta en memoria', async () => {
    const servicios = serviciosFalsos({ sesion: { usuarioId: 'u-caja' } })
    const user = userEvent.setup()
    render(<App servicios={servicios} />)
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByText('Caja · PC A')).toBeNull()
    expect(servicios.borrarCache).toHaveBeenCalledTimes(1)
    expect(servicios.auth.cerrar).toHaveBeenCalledTimes(1)
    expect(servicios.borrarCache.mock.invocationCallOrder[0]).toBeLessThan(servicios.auth.cerrar.mock.invocationCallOrder[0])
  })
})
```

- [ ] **Step 3: Escribir los servicios falsos de prueba**

`src/test/servicios.ts`:
```ts
import { vi } from 'vitest'
import type { Cuenta } from '../auth/cuenta'
import type { ResultadoLogin, SesionAuth } from '../auth/useSesion'
import type { AnulacionHecha, CajaDia, VentaDelDia } from '../caja-del-dia/cajaDelDia'
import type { FilaRanking } from '../caja/ranking'
import type { FilaHistorial } from '../jefe/jefe'
import type { Servicios } from '../servicios'
import type { Cliente } from '../tipos'
import type { CierreTurno, TurnoAbierto } from '../turno/turno'
import { catalogoDePrueba } from './caja'
import { servicioProductosFalso } from './productos'

export const CUENTA_CAJA: Cuenta = { usuarioId: 'u-caja', negocioId: 'n1', rol: 'caja' }
export const CUENTA_JEFE: Cuenta = { usuarioId: 'u-jefe', negocioId: 'n1', rol: 'jefe' }

const SIN_TOTALES = { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0 }

const CAJA_VACIA: CajaDia = {
  fecha: '2026-10-19',
  ...SIN_TOTALES,
  cobrado: 0,
  anulaciones: { ...SIN_TOTALES, cantidad: 0, total: 0, detalle: [] },
}

/** Auth en memoria. iniciar entra como u-jefe si el email es jefe@kiosco.local; si no, como u-caja. */
export function authFalso(inicial: SesionAuth | null = null) {
  let oyente: ((s: SesionAuth | null) => void) | null = null
  return {
    sesionActual: vi.fn(async () => inicial),
    alCambiar: vi.fn((cb: (s: SesionAuth | null) => void) => {
      oyente = cb
      return () => {
        oyente = null
      }
    }),
    iniciar: vi.fn(async (email: string, _password: string): Promise<ResultadoLogin> => {
      oyente?.({ usuarioId: email === 'jefe@kiosco.local' ? 'u-jefe' : 'u-caja' })
      return 'ok'
    }),
    cerrar: vi.fn(async () => {
      oyente?.(null)
    }),
    /** Simula un evento de Supabase (por ejemplo TOKEN_REFRESHED). */
    emitir(s: SesionAuth | null) {
      oyente?.(s)
    },
  }
}

function turnoFalso() {
  const abierto: TurnoAbierto = { turnoId: 't1', apertura: '2026-10-19T12:00:00Z' }
  return {
    leer: vi.fn(async (): Promise<TurnoAbierto | null> => null),
    abrir: vi.fn(async () => abierto),
    cerrar: vi.fn(async (): Promise<CierreTurno> => ({
      turnoId: 't1',
      apertura: abierto.apertura,
      cierre: '2026-10-19T20:00:00Z',
      totales: { efectivo: 0, transferencia: 0, tarjeta: 0, fiado: 0, cobrado: 0 },
    })),
  }
}

/** Servicios de la app en memoria. Sin opciones: hay una cuenta caja y no hay sesión abierta. */
export function serviciosFalsos(opciones: { sesion?: SesionAuth | null; cuenta?: Cuenta | null } = {}) {
  const productos = servicioProductosFalso()
  const servicios = {
    auth: authFalso(opciones.sesion ?? null),
    leerCuenta: vi.fn(async (usuarioId: string): Promise<Cuenta | null> =>
      opciones.cuenta !== undefined ? opciones.cuenta : usuarioId === 'u-jefe' ? CUENTA_JEFE : CUENTA_CAJA,
    ),
    registrarDispositivo: vi.fn(async (_negocioId: string) => ({ dispositivoId: 'pc-1', prefijo: 'A' })),
    borrarCache: vi.fn(async () => undefined),
    sincronizarCatalogo: vi.fn(async () => undefined),
    catalogo: catalogoDePrueba(),
    leerRanking: vi.fn(async (): Promise<FilaRanking[]> => []),
    fiadoActivo: vi.fn(async () => true),
    clientes: {
      listar: vi.fn(async (): Promise<Cliente[]> => []),
      alta: vi.fn(async (nombre: string, telefono: string | null): Promise<Cliente> => ({ id: 'c1', nombre, telefono })),
    },
    rpc: vi.fn(async (_funcion: 'confirmar_venta', _args: Record<string, unknown>) => ({ data: null, error: null })),
    turno: vi.fn((_dispositivoId: string) => turnoFalso()),
    productos: vi.fn((_dispositivoId: string) => productos),
    cajaDelDia: vi.fn((_dispositivoId: string) => ({
      hoy: vi.fn(async () => '2026-10-19'),
      leerCaja: vi.fn(async (_fecha: string) => CAJA_VACIA),
      leerVentas: vi.fn(async (_fecha: string): Promise<VentaDelDia[]> => []),
      anular: vi.fn(async (ventaId: string, motivo: string): Promise<AnulacionHecha> => ({
        anulacion_id: 'an1',
        venta_id: ventaId,
        fecha: '2026-10-19T16:00:00Z',
        motivo,
        ya_existia: false,
      })),
    })),
    jefe: {
      cambiarModuloFiado: vi.fn(async (activo: boolean) => activo),
      anonimizarCliente: vi.fn(async (id: string): Promise<Cliente> => ({ id, nombre: 'Cliente suprimido', telefono: null })),
      leerHistorial: vi.fn(async (_desde: number): Promise<FilaHistorial[]> => []),
    },
  } satisfies Servicios
  return servicios
}
```

- [ ] **Step 4: Correrlas y ver que fallan**

Run: `npx vitest run src/auth src/Kiosco.test.tsx src/App.test.tsx`
Expected: FAIL: `Failed to resolve import "./cuenta"`, `"./useSesion"`, `"./Login"`, `"./Kiosco"` y `"../servicios"` (o `App` sin la prop `servicios`).

- [ ] **Step 5: Implementar cuenta y sesión**

`src/auth/cuenta.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '../tipos'

export const SIN_CUENTA = 'Esta cuenta no está vinculada a ningún kiosco.'

export interface Cuenta {
  usuarioId: string
  negocioId: string
  rol: Rol
}

/** Rol y negocio propios, leídos de cuentas (RLS: sólo la fila de auth.uid()). null = sin cuenta (plan B de la tarea 4). */
export async function leerCuenta(supabase: SupabaseClient, usuarioId: string): Promise<Cuenta | null> {
  const { data, error } = await supabase
    .from('cuentas')
    .select('usuario_id, negocio_id, rol')
    .eq('usuario_id', usuarioId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const fila = data as { usuario_id: string; negocio_id: string; rol: Rol }
  return { usuarioId: fila.usuario_id, negocioId: fila.negocio_id, rol: fila.rol }
}
```

`src/auth/useSesion.ts`:
```ts
import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'

export interface SesionAuth {
  usuarioId: string
}

export type ResultadoLogin = 'ok' | 'credenciales' | 'sin_cuenta' | 'red'

/** Lo que la app necesita de Supabase Auth. La implementación real está en src/servicios.ts. */
export interface ServicioAuth {
  sesionActual(): Promise<SesionAuth | null>
  /** Avisa cada cambio de sesión (login, logout, refresco del token). Devuelve cómo dejar de escuchar. */
  alCambiar(cb: (sesion: SesionAuth | null) => void): () => void
  iniciar(email: string, password: string): Promise<ResultadoLogin>
  cerrar(): Promise<void>
}

export type EstadoSesion = { tipo: 'cargando' } | { tipo: 'cerrada' } | { tipo: 'abierta'; sesion: SesionAuth }

/**
 * Error de signInWithPassword -> resultado. 403 = el hook rechazó a un usuario sin cuenta (tarea 4, plan A).
 * Todo lo demás es "credenciales": no se distingue email inexistente de contraseña mala.
 */
export function resultadoLogin(error: unknown): ResultadoLogin {
  if (!error) return 'ok'
  if (isAuthRetryableFetchError(error)) return 'red'
  if (isAuthApiError(error) && error.status === 403) return 'sin_cuenta'
  return 'credenciales'
}

function siguiente(previo: EstadoSesion, sesion: SesionAuth | null): EstadoSesion {
  if (!sesion) return previo.tipo === 'cerrada' ? previo : { tipo: 'cerrada' }
  // Un refresco del token del mismo usuario no cambia nada: el kiosco no se remonta.
  if (previo.tipo === 'abierta' && previo.sesion.usuarioId === sesion.usuarioId) return previo
  return { tipo: 'abierta', sesion }
}

export function useSesion(auth: ServicioAuth, borrarCache: () => Promise<void>) {
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' })

  useEffect(() => {
    let vigente = true
    // El callback sólo cambia estado: nada de await a Supabase dentro (V39).
    const dejar = auth.alCambiar((s) => setEstado((p) => siguiente(p, s)))
    auth.sesionActual().then(
      (s) => {
        if (vigente) setEstado((p) => (p.tipo === 'cargando' ? siguiente(p, s) : p))
      },
      () => {
        if (vigente) setEstado((p) => (p.tipo === 'cargando' ? { tipo: 'cerrada' } : p))
      },
    )
    return () => {
      vigente = false
      dejar()
    }
  }, [auth])

  const cerrarSesion = useCallback(async () => {
    // 1) Memoria: sin sesión, App desmonta el kiosco; la venta en armado y su id viven en PantallaCaja.
    setEstado({ tipo: 'cerrada' })
    // 2) Caché del catálogo (la PC puede ser compartida, spec sección 10).
    try {
      await borrarCache()
    } catch {
      // Sigue: la sesión se cierra igual.
    }
    // 3) Supabase, sólo esta sesión (scope local, ver src/servicios.ts).
    try {
      await auth.cerrar()
    } catch {
      // Sin red: ver V35.
    }
  }, [auth, borrarCache])

  return { estado, cerrarSesion }
}
```

- [ ] **Step 6: Implementar el login**

`src/auth/Login.tsx`:
```tsx
import { useRef, useState, type FormEvent } from 'react'
import { SIN_CUENTA } from './cuenta'
import type { ResultadoLogin } from './useSesion'

export const MENSAJES_LOGIN: Record<Exclude<ResultadoLogin, 'ok'>, string> = {
  credenciales: 'Email o contraseña incorrectos.',
  sin_cuenta: SIN_CUENTA,
  red: 'No se pudo conectar. Revisá internet y probá de nuevo.',
}

export interface PropsLogin {
  iniciar(email: string, password: string): Promise<ResultadoLogin>
}

/** Pantalla de entrada genérica (decisión 23): sin marca de ningún kiosco. */
export function Login({ iniciar }: PropsLogin) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const enCurso = useRef(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    enCurso.current = true
    setEntrando(true)
    setError(null)
    let resultado: ResultadoLogin
    try {
      resultado = await iniciar(email.trim(), password)
    } catch {
      resultado = 'red'
    }
    // Con 'ok', App cambia a la sesión abierta y este componente se desmonta.
    if (resultado !== 'ok') {
      setError(MENSAJES_LOGIN[resultado])
      setPassword('')
      enCurso.current = false
      setEntrando(false)
    }
  }

  return (
    <main className="login">
      <h1>Caja</h1>
      <form aria-label="Iniciar sesión" onSubmit={(e) => void entrar(e)}>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <button type="submit" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 7: Implementar los servicios reales**

`src/servicios.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCuenta, type Cuenta } from './auth/cuenta'
import { resultadoLogin, type ServicioAuth } from './auth/useSesion'
import { crearServicioCajaDelDia, type ServicioCajaDelDia } from './caja-del-dia/cajaDelDia'
import { crearCatalogoCaja, type CatalogoCaja } from './caja/catalogoCaja'
import type { ServicioTurno } from './caja/PantallaCaja'
import { leerRankingSinCodigo, type FilaRanking } from './caja/ranking'
import { borrarCache, sincronizarCatalogo, type CacheCatalogo } from './catalogo/cache'
import { crearFuenteSupabase } from './catalogo/fuente'
import { registrarDispositivo, type Dispositivo } from './dispositivo/dispositivo'
import { crearServicioJefe, type ServicioJefe } from './jefe/jefe'
import { crearServicioClientes, fiadoActivo, type ServicioClientes } from './pagos/clientes'
import { crearServicioProductos, type ServicioProductos } from './productos/productos'
import { abrirTurno, cerrarTurno, leerTurnoAbierto, type CierreTurno } from './turno/turno'
import type { LlamarRpc } from './venta/confirmar'

/** Turno de una PC: lo que pide PantallaCaja más el cierre (tarea 8). */
export interface ServicioTurnoPc extends ServicioTurno {
  cerrar(): Promise<CierreTurno>
}

/** Todo lo que la app usa de afuera. En las pruebas, src/test/servicios.ts. */
export interface Servicios {
  auth: ServicioAuth
  leerCuenta(usuarioId: string): Promise<Cuenta | null>
  registrarDispositivo(negocioId: string): Promise<Dispositivo>
  borrarCache(): Promise<void>
  sincronizarCatalogo(): Promise<unknown>
  catalogo: CatalogoCaja
  leerRanking(): Promise<FilaRanking[]>
  fiadoActivo(): Promise<boolean>
  clientes: ServicioClientes
  rpc: LlamarRpc
  turno(dispositivoId: string): ServicioTurnoPc
  productos(dispositivoId: string): ServicioProductos
  cajaDelDia(dispositivoId: string): ServicioCajaDelDia
  jefe: ServicioJefe
}

function crearServicioAuth(supabase: SupabaseClient): ServicioAuth {
  return {
    async sesionActual() {
      const { data } = await supabase.auth.getSession()
      return data.session ? { usuarioId: data.session.user.id } : null
    },
    alCambiar(cb) {
      const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
        cb(sesion ? { usuarioId: sesion.user.id } : null)
      })
      return () => data.subscription.unsubscribe()
    },
    async iniciar(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return resultadoLogin(error)
    },
    async cerrar() {
      // local: 'global' cerraría también la cuenta caja en las otras PCs del kiosco.
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }
}

export function crearServicios(supabase: SupabaseClient, db: CacheCatalogo): Servicios {
  const fuente = crearFuenteSupabase(supabase)
  const sincronizar = () => sincronizarCatalogo(db, fuente)
  // Después de dar de alta o editar un producto: refrescar la caché ya, sin esperar los 3 minutos.
  const alCambiarCatalogo = () => {
    sincronizar().catch(() => undefined)
  }
  return {
    auth: crearServicioAuth(supabase),
    leerCuenta: (usuarioId) => leerCuenta(supabase, usuarioId),
    registrarDispositivo: (negocioId) => registrarDispositivo(supabase, negocioId),
    borrarCache: () => borrarCache(db),
    sincronizarCatalogo: sincronizar,
    catalogo: crearCatalogoCaja(db),
    leerRanking: () => leerRankingSinCodigo(supabase),
    fiadoActivo: () => fiadoActivo(supabase),
    clientes: crearServicioClientes(supabase),
    rpc: (funcion, args) => supabase.rpc(funcion, args),
    turno: (id) => ({
      leer: () => leerTurnoAbierto(supabase, id),
      abrir: () => abrirTurno(supabase, id),
      cerrar: () => cerrarTurno(supabase, id),
    }),
    productos: (id) => crearServicioProductos(supabase, id, alCambiarCatalogo),
    cajaDelDia: (id) => crearServicioCajaDelDia(supabase, id),
    jefe: crearServicioJefe(supabase),
  }
}
```

- [ ] **Step 8: Implementar el kiosco por rol**

`src/Kiosco.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Cuenta } from './auth/cuenta'
import { CajaDelDia } from './caja-del-dia/CajaDelDia'
import { PantallaCaja } from './caja/PantallaCaja'
import { programarSincronizacion } from './catalogo/programar'
import type { Dispositivo } from './dispositivo/dispositivo'
import { Calibracion } from './escaner/Calibracion'
import { AnonimizarCliente } from './jefe/AnonimizarCliente'
import { ModuloFiado } from './jefe/ModuloFiado'
import { PantallaHistorial } from './jefe/PantallaHistorial'
import { PantallaPagos } from './pagos/PantallaPagos'
import { PantallaProductos } from './productos/PantallaProductos'
import type { Servicios } from './servicios'
import type { Rol } from './tipos'
import { ResumenCierre } from './turno/PantallaTurno'
import type { CierreTurno } from './turno/turno'

export type Seccion = 'caja' | 'productos' | 'caja_del_dia' | 'historial' | 'modulo' | 'anonimizar' | 'calibracion'

/** Tabla de permisos del spec (sección 10). Ocultar no es seguridad: la base chequea el rol igual. */
export const SECCIONES: readonly { id: Seccion; titulo: string; soloJefe: boolean }[] = [
  { id: 'caja', titulo: 'Caja', soloJefe: false },
  { id: 'productos', titulo: 'Productos', soloJefe: false },
  { id: 'caja_del_dia', titulo: 'Caja del día', soloJefe: false },
  { id: 'historial', titulo: 'Historial', soloJefe: true },
  { id: 'modulo', titulo: 'Módulo fiado', soloJefe: true },
  { id: 'anonimizar', titulo: 'Anonimizar cliente', soloJefe: true },
  { id: 'calibracion', titulo: 'Calibrar escáner', soloJefe: true },
]

export function seccionesPara(rol: Rol) {
  return SECCIONES.filter((s) => rol === 'jefe' || !s.soloJefe)
}

export interface PropsKiosco {
  servicios: Servicios
  cuenta: Cuenta
  alCerrarSesion(): void
}

/** Un kiosco logueado: registra la PC, programa la caché y arma las pantallas según el rol. */
export function Kiosco({ servicios, cuenta, alCerrarSesion }: PropsKiosco) {
  const [dispositivo, setDispositivo] = useState<Dispositivo | null>(null)
  const [errorPc, setErrorPc] = useState(false)
  const [fiado, setFiado] = useState(false)
  const [seccion, setSeccion] = useState<Seccion>('caja')
  const [vueltaCaja, setVueltaCaja] = useState(0)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [cierre, setCierre] = useState<CierreTurno | null>(null)
  const [avisoTurno, setAvisoTurno] = useState<string | null>(null)

  function registrar() {
    setErrorPc(false)
    // Primer login de la PC: alta automática con prefijo nuevo (decisión 34). Después devuelve el mismo.
    servicios.registrarDispositivo(cuenta.negocioId).then(setDispositivo, () => setErrorPc(true))
  }

  useEffect(registrar, [servicios, cuenta.negocioId])
  useEffect(() => programarSincronizacion(servicios.sincronizarCatalogo), [servicios])
  useEffect(() => {
    // El módulo lo hace cumplir la base; esto sólo muestra u oculta el medio fiado.
    servicios.fiadoActivo().then(setFiado, () => setFiado(false))
  }, [servicios])

  const porPc = useMemo(
    () =>
      dispositivo
        ? {
            turno: servicios.turno(dispositivo.dispositivoId),
            productos: servicios.productos(dispositivo.dispositivoId),
            cajaDelDia: servicios.cajaDelDia(dispositivo.dispositivoId),
          }
        : null,
    [servicios, dispositivo],
  )

  async function cerrarTurno() {
    if (!porPc) return
    setConfirmarCierre(false)
    setAvisoTurno(null)
    try {
      setCierre(await porPc.turno.cerrar())
    } catch (e) {
      const sinTurno = typeof e === 'object' && e !== null && 'message' in e && e.message === 'sin_turno'
      setAvisoTurno(sinTurno ? 'No hay turno abierto en esta PC.' : 'No se pudo cerrar el turno. Revisá la conexión.')
    }
  }

  if (errorPc) {
    return (
      <section className="kiosco">
        <p role="alert" className="aviso aviso--error">
          No se pudo registrar esta PC. Revisá la conexión.
        </p>
        <button type="button" onClick={registrar}>
          Reintentar
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </section>
    )
  }
  if (!dispositivo || !porPc) return <p className="cargando">Preparando la caja…</p>

  const dispositivoId = dispositivo.dispositivoId
  const esJefe = cuenta.rol === 'jefe'

  return (
    <div className="kiosco">
      <header className="kiosco__barra">
        <span>
          {esJefe ? 'Jefe' : 'Caja'} · PC {dispositivo.prefijo}
        </span>
        <nav aria-label="Secciones">
          {seccionesPara(cuenta.rol).map((s) => (
            <button key={s.id} type="button" aria-pressed={seccion === s.id} onClick={() => setSeccion(s.id)}>
              {s.titulo}
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => setConfirmarCierre(true)}>
          Cerrar turno
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </header>

      {confirmarCierre && (
        <div className="kiosco__confirmar" role="group" aria-label="Cerrar turno">
          <p>¿Cerrar el turno de esta PC? Si hay una venta sin cobrar, se pierde.</p>
          <button type="button" onClick={() => void cerrarTurno()}>
            Sí, cerrar turno
          </button>
          <button type="button" onClick={() => setConfirmarCierre(false)}>
            No
          </button>
        </div>
      )}
      {avisoTurno && (
        <p role="alert" className="aviso aviso--error">
          {avisoTurno}
        </p>
      )}
      {cierre && (
        <ResumenCierre
          cierre={cierre}
          alSeguir={() => {
            setCierre(null)
            setSeccion('caja')
            // Caja nueva: lee el turno de la base, no hay ninguno abierto y pide abrirlo.
            setVueltaCaja((v) => v + 1)
          }}
        />
      )}

      {/* Siempre montada: cambiar de sección no pierde la venta en armado. */}
      <div hidden={seccion !== 'caja' || cierre !== null}>
        <PantallaCaja
          key={vueltaCaja}
          catalogo={servicios.catalogo}
          turno={porPc.turno}
          leerRanking={servicios.leerRanking}
          productos={porPc.productos}
          cobro={(sesion) => (
            <PantallaPagos
              sesion={sesion}
              dispositivoId={dispositivoId}
              fiadoHabilitado={fiado}
              clientes={servicios.clientes}
              rpc={servicios.rpc}
            />
          )}
        />
      </div>

      {seccion === 'productos' && <PantallaProductos servicio={porPc.productos} />}
      {seccion === 'caja_del_dia' && <CajaDelDia rol={cuenta.rol} servicio={porPc.cajaDelDia} />}
      {esJefe && seccion === 'historial' && <PantallaHistorial servicio={servicios.jefe} />}
      {esJefe && seccion === 'modulo' && <ModuloFiado activo={fiado} servicio={servicios.jefe} alCambiar={setFiado} />}
      {esJefe && seccion === 'anonimizar' && <AnonimizarCliente clientes={servicios.clientes} servicio={servicios.jefe} />}
      {esJefe && seccion === 'calibracion' && <Calibracion />}
    </div>
  )
}
```

- [ ] **Step 9: Reemplazar App y main**

`src/App.tsx` (reemplaza el provisorio de la tarea 1 entero):
```tsx
import { useEffect, useState } from 'react'
import { SIN_CUENTA, type Cuenta } from './auth/cuenta'
import { Login } from './auth/Login'
import { useSesion } from './auth/useSesion'
import { Kiosco } from './Kiosco'
import type { Servicios } from './servicios'

/** Raíz: sin sesión, Login; con sesión, el kiosco de la cuenta. */
export function App({ servicios }: { servicios: Servicios }) {
  const { estado, cerrarSesion } = useSesion(servicios.auth, servicios.borrarCache)

  if (estado.tipo === 'cargando') return <p className="cargando">Cargando…</p>
  if (estado.tipo === 'cerrada') return <Login iniciar={servicios.auth.iniciar} />
  return (
    <SesionAbierta
      key={estado.sesion.usuarioId}
      servicios={servicios}
      usuarioId={estado.sesion.usuarioId}
      alCerrarSesion={() => void cerrarSesion()}
    />
  )
}

type EstadoCuenta = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'sin_cuenta' } | { tipo: 'lista'; cuenta: Cuenta }

interface PropsSesionAbierta {
  servicios: Servicios
  usuarioId: string
  alCerrarSesion(): void
}

function SesionAbierta({ servicios, usuarioId, alCerrarSesion }: PropsSesionAbierta) {
  const [estado, setEstado] = useState<EstadoCuenta>({ tipo: 'cargando' })

  function cargar() {
    setEstado({ tipo: 'cargando' })
    servicios.leerCuenta(usuarioId).then(
      (cuenta) => setEstado(cuenta ? { tipo: 'lista', cuenta } : { tipo: 'sin_cuenta' }),
      () => setEstado({ tipo: 'error' }),
    )
  }

  useEffect(cargar, [servicios, usuarioId])

  if (estado.tipo === 'cargando') return <p className="cargando">Cargando…</p>
  if (estado.tipo !== 'lista') {
    return (
      <main className="sin-kiosco">
        <p role="alert" className="aviso aviso--error">
          {estado.tipo === 'sin_cuenta' ? SIN_CUENTA : 'No se pudo leer la cuenta. Revisá la conexión.'}
        </p>
        {estado.tipo === 'error' && (
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        )}
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </main>
    )
  }
  return <Kiosco servicios={servicios} cuenta={estado.cuenta} alCerrarSesion={alCerrarSesion} />
}
```

`src/main.tsx` (reemplaza el de la tarea 1 entero):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { cacheDeLaApp } from './catalogo/cache'
import { supabase } from './lib/supabase'
import { crearServicios } from './servicios'
import './estilos.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Una sola vez: los servicios son estables durante toda la vida de la pestaña.
const servicios = crearServicios(supabase, cacheDeLaApp())

createRoot(raiz).render(
  <StrictMode>
    <App servicios={servicios} />
  </StrictMode>,
)
```

Con `StrictMode`, en desarrollo los efectos de montaje corren dos veces: `registrar_dispositivo` es idempotente (la misma PC devuelve el mismo prefijo, tarea 8) y `programarSincronizacion` devuelve su cancelación, así que no hay efectos dobles en la base.

- [ ] **Step 10: Correr las pruebas, los tipos y el build**

Run:
```bash
npx vitest run src/auth src/Kiosco.test.tsx src/App.test.tsx
npx tsc --noEmit
npm test
npm run build
```
Expected: `Test Files  5 passed (5)` y `Tests  24 passed (24)` (3 de `cuenta`, 5 de `useSesion`, 4 de `Login`, 7 de `Kiosco` y 5 de `App`); `tsc` sin salida; `npm test` sin fallas; el build termina con `✓ built in`. Si `useSesion.test.ts` falla al importar `AuthApiError` o `AuthRetryableFetchError` desde `@supabase/supabase-js`, ver V34. Si `tsc` marca `rpc: (funcion, args) => supabase.rpc(funcion, args)` como incompatible con `LlamarRpc`, la respuesta de PostgREST no calza con `RespuestaRpc` (tarea 10): ajustar el tipo allá, no acá.

- [ ] **Step 11: Probarlo a mano contra Supabase local**

Run:
```bash
npx supabase status
npm run dev
```
Expected: `supabase status` muestra `Studio URL: http://127.0.0.1:54323`; Vite muestra `Local:   http://localhost:5173/`.

En Studio (sólo Felipe; la app no crea cuentas): Authentication → Add user, con un email de prueba y una contraseña de prueba, dos veces (caja y jefe). Después, en el SQL Editor, reemplazando los dos ids por los de los usuarios recién creados:
```sql
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco de prueba');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('<id del usuario caja>', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('<id del usuario jefe>', 'a0000000-0000-0000-0000-000000000000', 'jefe');
```
En `http://localhost:5173/`:
1. Entrar con la cuenta caja: aparece "Caja · PC A" y "No hay turno abierto en esta PC". El menú tiene sólo Caja, Productos y Caja del día.
2. Abrir turno, escanear (o tipear rápido y Enter) un código que no existe: aparece el alta rápida; cargar nombre y precio: la línea entra a la venta.
3. Productos: el producto nuevo figura con "(creado en caja)". Desactivarlo; volver a Caja y escanearlo: aparece "Reactivar …". En Productos, "Agregar producto" sin código (por ejemplo "Pan casero"): figura con "Sin código" y, en Caja, aparece en la grilla "Sin código (F2)" con 0 ventas (la grilla toma los productos de la caché, que se resincroniza después del alta, y `ordenarSinCodigo` de la tarea 13 cuenta 0 a lo que no está en el ranking del turno).
4. Cerrar sesión y entrar con la cuenta jefe: "Jefe · PC A" (misma PC, mismo prefijo); el menú suma Historial, Módulo fiado, Anonimizar cliente y Calibrar escáner. En Historial, el alta y el cambio de activo aparecen como "Caja", con "PC A".
5. Cambiar un precio desde Studio (Table Editor → productos): en Historial aparece como "Fuera de la app" (V12 de la parte 1).
6. Contraseña mala: "Email o contraseña incorrectos.", igual con un email que no existe.
7. Un usuario de Auth sin fila en `cuentas`: "Esta cuenta no está vinculada a ningún kiosco."

- [ ] **Step 12: Commit (sólo con OK de Felipe)**

```bash
git add src/auth src/Kiosco.tsx src/App.tsx src/main.tsx src/servicios.ts src/test/servicios.ts src/Kiosco.test.tsx src/App.test.tsx
git commit -m "feat(app): login por rol, kiosco y servicios reales" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Nombres nuevos que define la parte 4

### Migraciones y funciones de la base

Ninguna tabla, columna, tipo ni valor de enum nuevo: se usan `productos.creado_en_caja`, el índice `productos_codigo_unico`, `historial` con los tipos `alta_producto`, `cambio_precio` y `cambio_producto`, `modulos_negocio` y `clientes.suprimido`, todos de la tarea 3.

| Archivo | Nombre y firma | Devuelve / hace |
|---|---|---|
| `supabase/migrations/20261019121500_productos.sql` | `alta_producto_caja(p_dispositivo_id uuid, p_codigo_barras text, p_nombre text, p_precio numeric) returns jsonb` | `p_codigo_barras` opcional: `null` o vacío = producto sin código (grilla F2, 0 ventas al principio); la unicidad aplica sólo con código. Devuelve `{id, nombre, precio, codigo_barras, activo, creado_en_caja}` con `creado_en_caja = true`. `security definer`, caja y jefe. |
| `supabase/migrations/20261019121500_productos.sql` | `editar_producto(p_producto_id uuid, p_dispositivo_id uuid, p_nombre text default null, p_precio numeric default null, p_activo boolean default null) returns jsonb` | Mismo objeto. `null` = no cambia; sin cambios no hace `update`. Sin parámetro de código. `security definer`, caja y jefe. |
| `supabase/migrations/20261019121600_historial_productos.sql` | `registrar_historial_producto() returns trigger`; trigger `productos_historial` (`after insert or update` en `productos`, `for each row`) | Escribe `alta_producto`, `cambio_precio` (`{precio}` anterior y nuevo) y `cambio_producto` (sólo los campos cambiados entre `nombre`, `activo`, `codigo_barras`). Sin EXECUTE para nadie. No es `security definer`. |
| `supabase/migrations/20261019121700_jefe.sql` | `cambiar_modulo_fiado(p_activo boolean) returns jsonb` | `{modulo: "fiado", activo}`. Sólo jefe. `insert ... on conflict do update` en `modulos_negocio`. |
| `supabase/migrations/20261019121700_jefe.sql` | `anonimizar_cliente(p_cliente_id uuid) returns jsonb` | `{id, nombre: "Cliente suprimido", telefono: null}`. Sólo jefe. Idempotente. |

Todas las `security definer`: `set search_path = ''`, negocio del token, rol desde `cuentas`, `revoke` a `public`, `anon` y `authenticated`, `grant execute` a `authenticated`.

Variable de sesión nueva: `app.dispositivo_id` (texto, con `set_config(..., true)`, local a la transacción). La ponen `alta_producto_caja` y `editar_producto` justo antes de escribir y la vuelven a `''` después; la lee el trigger.

Códigos de error nuevos (`message`, `code` = `P0001`):

| Código | Lo lanza |
|---|---|
| `codigo_invalido` | `alta_producto_caja` |
| `precio_invalido` | `alta_producto_caja`, `editar_producto` |
| `codigo_existente` (detail: id del producto, salvo en el choque simultáneo) | `alta_producto_caja` |
| `codigo_existente_inactivo` (detail: id del producto) | `alta_producto_caja` |
| `producto_desconocido` | `editar_producto` |
| `solo_jefe` | `cambiar_modulo_fiado`, `anonimizar_cliente` |
| `cliente_desconocido` | `anonimizar_cliente` |

Reusa `sin_cuenta`, `dispositivo_desconocido`, `nombre_invalido` (tarea 9) y `pedido_invalido` (tarea 10).

Cambios en pruebas existentes:
- `supabase/tests/database/010_rls.test.sql`, prueba 25: espera `('alta_producto'), ('cambio_precio')` ordenado por `tipo`.
- `supabase/tests/database/150_permisos_funciones.test.sql`, prueba 5: trece nombres: `abrir_turno`, `alta_cliente`, `alta_producto_caja`, `anonimizar_cliente`, `anular_venta`, `caja_del_dia`, `cambiar_modulo_fiado`, `cerrar_turno`, `confirmar_venta`, `editar_producto`, `ranking_sin_codigo`, `registrar_dispositivo`, `ventas_del_dia`.

### Archivos y nombres de TypeScript

| Archivo | Exporta |
|---|---|
| `src/productos/productos.ts` | `CodigoErrorProducto`, `MENSAJES_ERROR_PRODUCTO`, `ErrorProducto` (`codigo`, `productoId`), `mensajeErrorProducto`, `CambiosProducto` (`nombre?`, `precio?`, `activo?`), `ServicioProductos` (`listar`, `alta(codigo: string | null, nombre, precio)`, `editar(productoId, cambios)`), `aProductoCache`, `crearServicioProductos(supabase, dispositivoId, alCambiar?)` |
| `src/productos/AltaRapidaProducto.tsx` | `PropsAltaRapidaProducto` (`codigo`, `servicio`, `alListo`, `alCancelar`), `AltaRapidaProducto` |
| `src/productos/PantallaProductos.tsx` | `MAX_FILAS` (50), `filtrarProductos(productos, consulta)`, `PropsPantallaProductos` (`servicio`), `PantallaProductos` (con formulario interno `AltaProducto`: nombre, precio y código opcional) |
| `src/caja/PantallaCaja.tsx` (cambio) | `PropsPantallaCaja` suma `productos?: ServicioProductos` |
| `src/jefe/jefe.ts` | `TipoHistorial`, `EntidadHistorial`, `QuienHistorial` (`caja`, `jefe`, `fuera_de_la_app`), `FilaHistorialCruda`, `FilaHistorial`, `PAGINA_HISTORIAL` (100), `ServicioJefe` (`cambiarModuloFiado`, `anonimizarCliente`, `leerHistorial(desde)`), `MENSAJES_JEFE`, `mensajeJefe`, `aFilaHistorial`, `crearServicioJefe(supabase)` |
| `src/jefe/ModuloFiado.tsx` | `PropsModuloFiado` (`activo`, `servicio`, `alCambiar`), `ModuloFiado` |
| `src/jefe/AnonimizarCliente.tsx` | `PropsAnonimizarCliente` (`clientes`, `servicio`), `AnonimizarCliente` |
| `src/jefe/PantallaHistorial.tsx` | `describirFila`, `PropsPantallaHistorial` (`servicio`), `PantallaHistorial` |
| `src/caja-del-dia/cajaDelDia.ts` | `TotalesMedios`, `AnulacionDelDia`, `CajaDia`, `VentaDelDia`, `AnulacionHecha`, `ServicioCajaDelDia` (`hoy`, `leerCaja`, `leerVentas`, `anular`), `MENSAJES_CAJA_DEL_DIA`, `mensajeCajaDelDia`, `crearServicioCajaDelDia(supabase, dispositivoId)` |
| `src/caja-del-dia/CajaDelDia.tsx` | `PropsCajaDelDia` (`rol`, `servicio`), `CajaDelDia` |
| `src/caja-del-dia/VentasDelDia.tsx` | `PropsVentasDelDia` (`fecha`, `servicio`, `vuelta`, `alAnular`), `VentasDelDia` |
| `src/auth/cuenta.ts` | `SIN_CUENTA`, `Cuenta` (`usuarioId`, `negocioId`, `rol`), `leerCuenta(supabase, usuarioId)` |
| `src/auth/useSesion.ts` | `SesionAuth`, `ResultadoLogin` (`ok`, `credenciales`, `sin_cuenta`, `red`), `ServicioAuth` (`sesionActual`, `alCambiar`, `iniciar`, `cerrar`), `EstadoSesion`, `resultadoLogin`, `useSesion(auth, borrarCache)` → `{ estado, cerrarSesion }` |
| `src/auth/Login.tsx` | `MENSAJES_LOGIN`, `PropsLogin` (`iniciar`), `Login` |
| `src/servicios.ts` | `ServicioTurnoPc` (`leer`, `abrir`, `cerrar`), `Servicios`, `crearServicios(supabase, db)` |
| `src/Kiosco.tsx` | `Seccion`, `SECCIONES`, `seccionesPara(rol)`, `PropsKiosco` (`servicios`, `cuenta`, `alCerrarSesion`), `Kiosco` |
| `src/App.tsx` (reemplazo) | `App({ servicios })` |
| `src/main.tsx` (reemplazo) | arma `crearServicios(supabase, cacheDeLaApp())` |
| `src/test/productos.ts` | `productoDePrueba`, `servicioProductosFalso` |
| `src/test/servicios.ts` | `CUENTA_CAJA`, `CUENTA_JEFE`, `authFalso` (con `emitir`), `serviciosFalsos({ sesion?, cuenta? })` |
| `src/test/caja.tsx` (cambio) | `OpcionesCaja` suma `servicioProductos?` |

Etiquetas que usan las pruebas (y que puede usar el E2E de la tarea 19): `Email`, `Contraseña`, botón `Entrar`; navegación `Secciones` con `Caja`, `Productos`, `Caja del día`, `Historial`, `Módulo fiado`, `Anonimizar cliente`, `Calibrar escáner`; botones `Cerrar turno`, `Sí, cerrar turno`, `Cerrar sesión`; formulario `Alta rápida de producto` con `Nombre`, `Precio`, `Guardar y agregar`, `Reactivar y agregar`; botón `Reactivar <nombre>`; botón `Agregar producto` y formulario `Nuevo producto` con `Nombre`, `Precio`, `Código de barras (opcional)` y `Guardar producto`; tablas `Productos`, `Cobrado`, `Ventas`, `Historial`; regiones `Fiado` y `Anulaciones`; botón `Anular <A-000012>`, campo `Motivo`, `Confirmar anulación`; texto de cabecera `Caja · PC A` / `Jefe · PC A`.

Clases CSS usadas sin estilo propio (no se agregan a `src/estilos.css`): `.alta-rapida`, `.alta-producto`, `.reactivar`, `.productos`, `.marca`, `.editor-producto`, `.modulo-fiado`, `.anonimizar-cliente`, `.anonimizar-cliente__confirmacion`, `.historial`, `.caja-del-dia`, `.caja-del-dia__fecha`, `.caja-del-dia__fiado`, `.caja-del-dia__anulaciones`, `.ventas-del-dia`, `.anular-venta`, `.login`, `.sin-kiosco`, `.cargando`, `.kiosco`, `.kiosco__barra`, `.kiosco__confirmar`.

Claves del navegador: ninguna nueva. Cerrar sesión borra la caché Dexie y conserva `dispositivo-id:<negocio_id>` en `localStorage` (identifica la PC, no a la persona).

### Pruebas nuevas

- pgTAP: `supabase/tests/database/120_historial_productos.test.sql` (13), `130_productos.test.sql` (34), `135_jefe.test.sql` (22).
- Vitest: `src/productos/productos.test.ts` (5), `src/productos/AltaRapidaProducto.test.tsx` (8), `src/productos/PantallaProductos.test.tsx` (6), `src/caja/AltaEnCaja.test.tsx` (3), `src/jefe/jefe.test.ts` (3), `src/jefe/ModuloFiado.test.tsx` (3), `src/jefe/AnonimizarCliente.test.tsx` (3), `src/jefe/PantallaHistorial.test.tsx` (3), `src/caja-del-dia/CajaDelDia.test.tsx` (6), `src/auth/cuenta.test.ts` (3), `src/auth/useSesion.test.ts` (5), `src/auth/Login.test.tsx` (4), `src/Kiosco.test.tsx` (7), `src/App.test.tsx` (5).
- Integración: ninguna nueva (la del token es de la tarea 4).

### Para la parte 5

- **Tarea 18 (config visual y aviso de abono):** el punto de entrada es `SesionAbierta` en `src/App.tsx` o `Kiosco`: la config se aplica después del login (decisión 23). Sumar a `Servicios` (`src/servicios.ts`) y a `serviciosFalsos` (`src/test/servicios.ts`) lo que haga falta (por ejemplo `leerConfig()` y `leerEstadoAbono()`); `AvisoAbono` va en `.kiosco__barra` y nunca bloquea. `fiadoActivo` ya lo lee `Kiosco`.
- **Tarea 18 (`version_minima`):** si es `security definer` con `grant` a `authenticated` (o a `anon`), revisar las pruebas 2 y 5 de `150_permisos_funciones.test.sql` (hoy trece nombres y ninguna definer para `anon`).
- **Tarea 19 (Sentry):** se inicializa en `src/main.tsx`, antes de `crearServicios`. Ningún mensaje de error de esta parte lleva nombres ni teléfonos de clientes, salvo el estado visible de `AnonimizarCliente` (no es un error ni un breadcrumb).
- **Tarea 19 (E2E):** las cuentas de prueba se crean como en `tests/soporte/admin.ts` (tarea 4); el flujo manual de la tarea 17, step 11, sirve de guion.

## Verificaciones de la parte 4

Verificado contra la documentación oficial (2026-10-19 / 2026-10-20):
- Auth hooks: un error del hook (`http_code`, `message`) se traduce en un error HTTP que llega a la app con ese código; sin `http_code`, 500: https://supabase.com/docs/guides/auth/auth-hooks
- auth-js exporta `isAuthApiError` e `isAuthRetryableFetchError`; `AuthApiError(message, status, code)` y `AuthRetryableFetchError(message, status)`: https://github.com/supabase/auth-js/blob/master/src/lib/errors.ts
- `signOut`: `scope` `global` (por defecto, cierra todas las sesiones del usuario), `local` (sólo la actual) y `others`; en el navegador borra la sesión del almacenamiento y emite `SIGNED_OUT`: https://supabase.com/docs/reference/javascript/auth-signout
- `onAuthStateChange(callback)` con `(event, session)`; devuelve `data.subscription.unsubscribe()`: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- `signInWithPassword` puede no distinguir entre cuenta inexistente y contraseña mala: https://supabase.com/docs/reference/javascript/auth-signinwithpassword

| # | Qué | Dónde se usa | Cómo verificar |
|---|---|---|---|
| V30 | Que `raise ... using detail = ...` llegue al navegador como `error.details` de supabase-js (PostgREST lo manda como `details`), y que `get stacked diagnostics ... pg_exception_detail` lo lea dentro de una función `pg_temp` en pgTAP. | Tarea 15: `alta_producto_caja`, `src/productos/productos.ts` (`productoId`), prueba 28 de `130_productos.test.sql` | La prueba 28 de `130` cubre la base. Para el navegador: con la app corriendo, dar de alta un código de un producto desactivado y ver que aparece "Reactivar y agregar". https://docs.postgrest.org/en/stable/references/errors.html y https://www.postgresql.org/docs/current/plpgsql-control-structures.html#PLPGSQL-EXCEPTION-DIAGNOSTICS |
| V31 | Que Testing Library dé rol `form` a un `<form aria-label>`, rol `region` a un `<section aria-label>` y rol `group` a un `<div role="group" aria-label>`, consultables por nombre. | Tareas 15, 16 y 17 (pruebas de componentes) | Si fallan esas consultas, cambiar a `getByLabelText` del primer campo y `closest('form')`, o a `data-testid`. https://testing-library.com/docs/queries/byrole y https://www.w3.org/TR/html-aria/ |
| V32 | Que `fireEvent.change(input, { target: { value: '2026-10-10' } })` sobre un `input type="date"` cambie el valor en jsdom y dispare `onChange` de React. | Tarea 16, `CajaDelDia.test.tsx` prueba 3 | Si no cambia, usar `await user.clear(fecha)` y `await user.type(fecha, '2026-10-10')`. https://testing-library.com/docs/dom-testing-library/api-events |
| V33 | Que `supabase.rpc('hoy')` (función `stable` sin argumentos que devuelve `date`) responda el texto `'2026-10-19'` (formato ISO de PostgREST para `date`). | Tarea 16, `crearServicioCajaDelDia().hoy` | Con la app corriendo, abrir "Caja del día" como caja: debe decir "Hoy (AAAA-MM-DD)" y mostrar totales; si sale otro formato, `caja_del_dia` devuelve `fecha_invalida` o `fuera_de_dia`. https://supabase.com/docs/reference/javascript/rpc |
| V34 | Que `@supabase/supabase-js` reexporte `AuthApiError`, `AuthRetryableFetchError`, `isAuthApiError` e `isAuthRetryableFetchError` de auth-js, y que el rechazo del hook llegue como `AuthApiError` con `status` 403 (la doc confirma el código HTTP, no la clase). | Tarea 17, `resultadoLogin` y su prueba | `useSesion.test.ts` falla al importar si no se reexportan (importar entonces desde `@supabase/auth-js`). La clase y el 403: paso 11 de la tarea 17, punto 7 (debe verse el mensaje de cuenta no vinculada, no el genérico). https://github.com/supabase/supabase-js |
| V35 | Qué hace `signOut({ scope: 'local' })` sin red: si borra igual la sesión del navegador y emite `SIGNED_OUT`. La doc no lo dice. | Tarea 17, `ServicioAuth.cerrar` y `useSesion` | Con la app abierta, cortar la red en el navegador, cerrar sesión, recargar con la red de vuelta: no debe volver a entrar solo. Si vuelve a entrar, borrar también el almacenamiento de la sesión antes de `signOut`. https://supabase.com/docs/reference/javascript/auth-signout |
| V36 | Que una función `security definer` cuyo dueño es `postgres` (que en Supabase no es superusuario) pueda usar `set_config('app.dispositivo_id', ..., true)` con un nombre propio con punto, y que `current_setting('app.dispositivo_id', true)` devuelva `null` si nunca se puso. | Tarea 15, funciones de productos y trigger | Pruebas 1, 2 y 11 de `120_historial_productos.test.sql` en local; repetir el punto 4 del paso 11 de la tarea 17 en el proyecto hospedado (el historial debe mostrar "PC A"). https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET |
| V37 | Que user-event no tire error al hacer clic en un botón `disabled` (sólo no dispara el `click`). | Tarea 15, `AltaRapidaProducto.test.tsx` "mientras guarda" | Si tira error, sacar el segundo clic: el `ref` `enCurso` ya queda probado por el botón deshabilitado. https://testing-library.com/docs/user-event/pointer |
| V38 | Que `.in('id', ids)` con hasta 100 uuids (unos 3,7 KB de URL) entre en los límites de URL de la API de Supabase. | Tarea 16, `crearServicioJefe().leerHistorial` | Con 100 filas de historial de productos distintos, abrir Historial: si falla con 414 o 400, bajar `PAGINA_HISTORIAL` a 50. https://supabase.com/docs/reference/javascript/in |
| V39 | Que no haga falta nada más que no llamar a Supabase con `await` dentro del callback de `onAuthStateChange` para evitar bloqueos de sesión (advertencia conocida de la comunidad; la página de referencia no la trae). | Tarea 17, `useSesion` y `crearServicioAuth` | Entrar, recargar con F5 y cerrar sesión varias veces: la app no debe quedar en "Cargando…". https://supabase.com/docs/reference/javascript/auth-onauthstatechange |
| V40 | Que el trigger `productos_historial` funcione también cuando escribe `service_role` (las pruebas de integración de las tareas 4 y 7 insertan productos así): que no haga falta EXECUTE sobre `registrar_historial_producto` al disparar y que `service_role` tenga `insert` en `historial`. | Tarea 15; `tests/integracion/catalogo.test.ts` (tarea 7) | `npm run test:integracion` después de la tarea 15: si falla con `permission denied for function registrar_historial_producto` o `for table historial`, agregar `grant execute on function public.registrar_historial_producto() to service_role;` o `grant insert on public.historial to service_role;` en `20261019121600_historial_productos.sql`. https://www.postgresql.org/docs/current/sql-createtrigger.html |
| V12 (parte 1) | Sigue abierta: que los cambios desde Supabase Studio corran como `postgres` con `auth.uid()` nulo. La tarea 15 lo simula vaciando `request.jwt.claims`. | Tarea 15, prueba 8 de `120` | Paso 11 de la tarea 17, punto 5, en local y una vez en el proyecto hospedado. |

## Decisiones de la parte 4

- Toda alta desde la app queda `creado_en_caja = true`, también la que hace el jefe; sólo lo cargado desde Studio queda en `false`.
- En `alta_producto_caja`, un código vacío o de puros espacios cuenta como "sin código" (no es `codigo_invalido`).
- En la pantalla de productos, un alta con el código de un producto desactivado sólo avisa; se reactiva desde la lista (el alta rápida de la caja, en cambio, ofrece "Reactivar y agregar").
- `p_precio` es `numeric` para rechazar centavos con `precio_invalido`; el tope es 2.147.483.647 pesos (límite de `integer`).
- Código ya cargado y activo (caché vieja): `codigo_existente`, la caché se resincroniza y el cajero vuelve a escanear; no se agrega solo el producto existente.
- Código de un producto desactivado: `codigo_existente_inactivo` y la pantalla ofrece "Reactivar y agregar" en vez de crear otro; al reactivar desde la caja (escaneo o alta rápida), el producto entra a la venta en el mismo paso.
- El historial también registra los cambios de código de barras (que sólo se pueden hacer desde Studio) como `cambio_producto`.
- Un cambio de precio y de nombre a la vez deja dos filas en el historial (`cambio_precio` y `cambio_producto`).
- Editar sin cambios no escribe nada: ni `catalogo_version` ni historial.
- Desde Studio, cuenta y PC quedan vacías ("Fuera de la app"); una cuenta o PC que no sea del negocio del producto nunca queda registrada.
- La PC llega al trigger por la variable de transacción `app.dispositivo_id`.
- Ni el cambio del módulo fiado ni la anonimización van al historial (el spec no lo pide; auditar el módulo requeriría un tipo nuevo en `tipo_historial`).
- `solo_jefe` usa `P0001` como todos los códigos de la app, no `42501`.
- La anonimización funciona aunque el fiado esté apagado (es un pedido de la persona, no una operación del módulo).
- La lista para anonimizar muestra el teléfono junto al nombre, para identificar a la persona correcta.
- En el historial, "Caja" o "Jefe" se deduce comparando con la cuenta propia (el jefe no puede leer la fila de la caja); se lee de a 100 filas.
- La caja pide el día a la base (`hoy()`), no al reloj de la PC; "Actualizar" pasa al día nuevo después de medianoche.
- La pantalla de productos muestra hasta 50 filas, incluye los desactivados y busca sin el tope de 8 de la caja.
- La caja queda montada (oculta) al cambiar de sección, para no perder la venta en armado.
- "Cerrar turno" está en la barra para caja y jefe y pide confirmación porque una venta sin cobrar se pierde.
- `signOut` con `scope: 'local'`, para no cerrar la cuenta caja en las otras PCs del kiosco.
- "Calibrar escáner" queda sólo para el jefe.
- El mensaje "Esta cuenta no está vinculada a ningún kiosco." se muestra después de una contraseña correcta (no permite averiguar emails).
- Cerrar sesión conserva el id de la PC en `localStorage`; borra la sesión de Auth y la caché del catálogo.
- Si el registro de la PC falla, la app no deja vender hasta reintentar.

# Parte 5: Personalización, versión mínima, despliegue y E2E (tareas 18 y 19)

**Goal:** personalización visual por negocio, aviso del estado del abono (nunca bloquea), versión mínima con recarga forzada de apps viejas, Sentry sin datos personales, CSP en `_headers`, despliegue en Cloudflare Workers con static assets, pruebas E2E con Playwright y el checklist de despliegue.

**Architecture:** igual que las partes 1 a 4. La versión mínima vive en una tabla de una sola fila que leen `anon` y `authenticated` por una función `security invoker`; la app la compara con la versión de `package.json` (constante `__APP_VERSION__` de Vite) al arrancar, al volver a la pestaña y cada 3 minutos, con la misma programación del catálogo (tarea 7). La config visual y el estado del abono se leen después del login, con RLS, y nunca se escriben desde la app. El build genera `dist/_headers` con la CSP; Cloudflare sirve `dist` con fallback SPA. El E2E corre contra Supabase local y un build servido por `vite preview`.

**Tech Stack:** Vite, React, TypeScript, Vitest + Testing Library, supabase-js, Supabase CLI con pgTAP, `@sentry/browser` 10, Playwright (`@playwright/test`), wrangler (Cloudflare Workers static assets).

Reparto: P1 = tareas 0 a 5; P2 = tareas 6 a 10; P3 = tareas 11 a 14; P4 = tareas 15 a 17; **P5 = tareas 18 y 19 (este archivo)**.

Valen todas las reglas de "Antes de empezar" de la parte 1: cargar la skill `ponytail` antes de programar; commits sólo con OK de Felipe; comandos en Git Bash desde `cd "/c/Users/felipe/Desktop/app negocios"`; Docker corriendo para `npx supabase test db`.

---

### Tarea 18: Personalización, versión mínima y aviso de abono (SQL con pgTAP; TypeScript con Vitest)

**Files:**
- Create: `supabase/migrations/20261019121800_version_minima.sql`
- Modify: `supabase/tests/database/010_rls.test.sql` (prueba 1: la lista de tablas suma `version_app`)
- Create: `src/app/version.ts`, `src/negocio/config.ts`, `src/negocio/AvisoAbono.tsx`
- Modify: `vite.config.ts` (define `__APP_VERSION__`), `vitest.config.ts` (mismo define para las pruebas), `src/vite-env.d.ts` (tipo de `__APP_VERSION__`)
- Modify: `src/servicios.ts` y `src/test/servicios.ts` (`leerConfig` y `leerEstadoAbono`), `src/Kiosco.tsx` (reemplazo entero: config visual y aviso), `src/main.tsx` (reemplazo entero: vigila la versión), `src/estilos.css` (tres reglas)
- Test: `supabase/tests/database/160_version_minima.test.sql`, `src/app/version.test.ts`, `src/negocio/config.test.ts`, `src/negocio/AvisoAbono.test.tsx`, `src/Kiosco.test.tsx` (dos pruebas nuevas)

Decisiones de esta tarea (van a la lista de decisiones de la parte 5):
- `version_app` tiene una sola fila (`id boolean primary key default true check (id)`). La leen `anon` y `authenticated`: el chequeo corre antes del login, porque una app vieja sin sesión también tiene que recargarse; el dato no es sensible. Nadie la escribe desde la app: Felipe la cambia desde Supabase Studio.
- `version_minima()` es `security invoker` (lee por `grant select` y una policy), con `search_path` vacío, sin EXECUTE para `public` y con EXECUTE para `anon` y `authenticated`. Como no es `security definer`, las pruebas 2 y 5 de `150_permisos_funciones.test.sql` (sólo miran funciones definer) no cambian: queda resuelto el aviso "Para la parte 5" de la parte 4.
- `negocios.estado_abono` ya existe desde la tarea 3 (enum `public.estado_abono` con `activo`, `gracia`, `suspendido`, por defecto `activo`). Esta migración no agrega columna; la prueba 160 confirma que sólo acepta esos tres valores. Lo carga Felipe a mano desde Studio.
- Programación del chequeo de versión: se reutiliza `programarSincronizacion` de `src/catalogo/programar.ts` (tarea 7) tal cual: corre al arrancar, cada `INTERVALO_CATALOGO_MS` (3 minutos) y al volver a la pestaña, ignora errores de red y devuelve cómo cancelar. Es exactamente lo que pide el spec; el nombre es del catálogo, pero duplicarla sería peor.
- Comparación semántica número por número (`1.10.0` es mayor que `1.9.0`). Una versión ilegible nunca fuerza la recarga.
- Recarga: aviso en pantalla, espera de 3 segundos y `location.replace` con `?version-minima=<mínima>` en la URL. Si después de recargar la app sigue vieja para esa misma mínima (el deploy no llegó o Felipe cargó una mínima más alta que la publicada), muestra un aviso y no recarga de nuevo: así no hay recargas en bucle y no se guarda nada en el navegador. Una venta en armado se pierde como con F5 (decisión 31); el aviso le dice al cajero que revise las ventas de hoy.
- Config visual (spec sección 5a; columnas de la tarea 3): `nombre_visible` va al título de la pestaña y a la barra del kiosco; `color_primario` se aplica como la variable CSS `--color-primario` (la única variable de color que define la tabla); `logo_url` se muestra sólo si es del mismo origen que el Supabase del proyecto (Supabase Storage), porque la CSP de la tarea 19 sólo deja cargar imágenes de ahí. Al salir del kiosco (cerrar sesión) todo vuelve a la pantalla genérica.
- Aviso del abono: lo ven caja y jefe, se lee al entrar al kiosco (un cambio de Felipe se ve en el próximo login o recarga) y es sólo texto: nunca deshabilita nada.

- [ ] **Step 1: Escribir la prueba pgTAP**

`supabase/tests/database/160_version_minima.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- 1 a 6: estructura y permisos de la función
select has_table('public', 'version_app', 'existe version_app');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.version_app'::regclass),
  'version_app tiene RLS');
select is((select count(*)::int from public.version_app), 1, 'version_app trae una sola fila');
select ok(not (select p.prosecdef from pg_proc p where p.oid = 'public.version_minima()'::regprocedure),
  'version_minima es security invoker');
select ok(coalesce((select p.proconfig from pg_proc p where p.oid = 'public.version_minima()'::regprocedure), '{}'::text[])
  @> array['search_path=""'], 'version_minima tiene search_path vacío (V7)');
select ok(not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.version_minima()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC no ejecuta version_minima');

-- 7 y 8: reglas que valen también para postgres (Studio)
select throws_ok($$ insert into public.version_app (version_minima) values ('9.9.9') $$,
  '23505', null, 'version_app no admite una segunda fila');
select throws_ok($$ update public.version_app set version_minima = '1.0' $$,
  '23514', null, 'version_minima exige el formato X.Y.Z');

-- 9 a 11: estado del abono (columna de la tarea 3)
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
select lives_ok($$ update public.negocios set estado_abono = 'gracia'
                   where id = 'a0000000-0000-0000-0000-000000000000' $$,
  'estado_abono acepta gracia');
select lives_ok($$ update public.negocios set estado_abono = 'suspendido'
                   where id = 'a0000000-0000-0000-0000-000000000000' $$,
  'estado_abono acepta suspendido');
select throws_ok($$ update public.negocios set estado_abono = 'moroso'
                    where id = 'a0000000-0000-0000-0000-000000000000' $$,
  '22P02', null, 'estado_abono acepta sólo activo, gracia y suspendido');

-- 12 a 14: anon (la app antes del login)
set local role anon;
select is(public.version_minima(), '0.0.0', 'anon lee la versión mínima (el chequeo corre antes del login)');
select throws_ok($$ insert into public.version_app (version_minima) values ('9.9.9') $$,
  '42501', 'permission denied for table version_app', 'anon no escribe en version_app');
select throws_ok($$ update public.version_app set version_minima = '9.9.9' $$,
  '42501', 'permission denied for table version_app', 'anon no edita version_app');

-- 15 a 17: authenticated (caja o jefe)
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.version_minima(), '0.0.0', 'authenticated lee la versión mínima');
select throws_ok($$ update public.version_app set version_minima = '9.9.9' $$,
  '42501', 'permission denied for table version_app', 'authenticated no edita version_app');
select throws_ok($$ delete from public.version_app $$,
  '42501', 'permission denied for table version_app', 'authenticated no borra version_app');

select * from finish();
rollback;
```

- [ ] **Step 2: Sumar `version_app` a la lista de tablas de la prueba 010**

En `supabase/tests/database/010_rls.test.sql` (tarea 3), la prueba 1 lista exactamente las tablas de `public`: con la tabla nueva fallaría. Reemplazar el bloque entero

```sql
select tables_are(
  'public',
  array['negocios', 'cuentas', 'config_negocio', 'modulos', 'modulos_negocio', 'dispositivos',
        'productos', 'clientes', 'turnos', 'ventas', 'lineas_venta', 'pagos_venta',
        'anulaciones', 'historial'],
  'el esquema public tiene exactamente las tablas del modelo'
);
```

por

```sql
select tables_are(
  'public',
  array['negocios', 'cuentas', 'config_negocio', 'modulos', 'modulos_negocio', 'dispositivos',
        'productos', 'clientes', 'turnos', 'ventas', 'lineas_venta', 'pagos_venta',
        'anulaciones', 'historial', 'version_app'],
  'el esquema public tiene exactamente las tablas del modelo'
);
```

La prueba 2 de `010` ("todas las tablas de public tienen RLS activo") cubre la tabla nueva sin cambios.

- [ ] **Step 3: Correr las pruebas y ver que fallan**

Run: `npx supabase test db`
Expected: FAIL en `160_version_minima.test.sql` (`relation "public.version_app" does not exist` o `function public.version_minima() does not exist`) y en `010_rls.test.sql`, prueba 1 (`Missing tables: version_app`). El resto pasa.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261019121800_version_minima.sql`:
```sql
-- Versión mínima de la app (spec sección 9, caso 6, y sección 10): una app con versión menor se recarga.
-- Una sola fila. La leen anon y authenticated: el chequeo corre antes del login (una app vieja sin sesión
-- también se recarga) y el dato no es sensible. Nadie la escribe desde la app: Felipe la cambia desde Studio.
-- El estado del abono ya está en negocios.estado_abono (tarea 3, enum activo/gracia/suspendido): no se toca.

create table public.version_app (
  id boolean primary key default true check (id),
  version_minima text not null check (version_minima ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  actualizado timestamptz not null default now()
);

insert into public.version_app (version_minima) values ('0.0.0');

alter table public.version_app enable row level security;

-- Supabase da privilegios por defecto a anon y authenticated en las tablas nuevas de public: se quitan todos
-- y queda sólo la lectura.
revoke all on table public.version_app from public, anon, authenticated;
grant select on table public.version_app to anon, authenticated;

create policy version_app_select on public.version_app
  for select to anon, authenticated using (true);

-- security invoker (el valor por defecto): lee por el grant y la policy de arriba; no saltea RLS.
create or replace function public.version_minima()
returns text
language sql
stable
set search_path = ''
as $$
  select v.version_minima from public.version_app v where v.id
$$;

revoke execute on function public.version_minima() from public;
grant execute on function public.version_minima() to anon, authenticated;
```

- [ ] **Step 5: Aplicar y correr**

Run:
```bash
npx supabase db reset
npx supabase test db
```
Expected: `Applying migration 20261019121800_version_minima.sql...`, `Finished supabase db reset`; después `All tests successful.` y `Result: PASS` (`160_version_minima.test.sql` con 17 pruebas). Si `150_permisos_funciones.test.sql` falla, revisar que la función haya quedado `security invoker`: `select prosecdef from pg_proc where proname = 'version_minima';` debe dar `f`.

- [ ] **Step 6: Escribir las pruebas de TypeScript**

`src/app/version.test.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AVISO_VERSION,
  AVISO_VERSION_TRABADA,
  ESPERA_RECARGA_MS,
  PARAMETRO_RECARGA,
  avisarEnPantalla,
  compararVersiones,
  esAnterior,
  leerVersionMinima,
  revisarVersion,
  vigilarVersion,
  type EntornoVersion,
} from './version'

function entorno(actual: string, minima: string | null, url = 'https://caja.ejemplo/') {
  return {
    actual,
    leerMinima: vi.fn(async () => minima),
    url: () => new URL(url),
    avisar: vi.fn((_texto: string) => undefined),
    esperar: vi.fn((_ms: number, hacer: () => void) => hacer()),
    recargar: vi.fn((_url: string) => undefined),
  } satisfies EntornoVersion
}

afterEach(() => {
  document.getElementById('aviso-version')?.remove()
})

describe('compararVersiones', () => {
  it('compara número por número: 1.10.0 es mayor que 1.9.0', () => {
    expect(compararVersiones('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compararVersiones('1.9.0', '1.10.0')).toBeLessThan(0)
    expect(compararVersiones('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(esAnterior('1.9.0', '1.10.0')).toBe(true)
  })

  it('versiones iguales dan 0 y no fuerzan recarga', () => {
    expect(compararVersiones('1.10.0', '1.10.0')).toBe(0)
    expect(esAnterior('1.10.0', '1.10.0')).toBe(false)
    expect(esAnterior('1.10.1', '1.10.0')).toBe(false)
  })

  it('una versión ilegible nunca fuerza recarga; un sufijo se ignora', () => {
    expect(compararVersiones('1.10', '1.9.0')).toBeNull()
    expect(esAnterior('1.0.0', 'nueva')).toBe(false)
    expect(compararVersiones('1.2.3-beta', '1.2.3')).toBe(0)
  })
})

describe('revisarVersion', () => {
  it('app anterior a la mínima: avisa y recarga después de la espera, con la mínima en la URL', async () => {
    const e = entorno('1.9.0', '1.10.0')
    expect(await revisarVersion(e)).toBe('recargando')
    expect(e.avisar).toHaveBeenCalledWith(AVISO_VERSION)
    expect(e.esperar).toHaveBeenCalledWith(ESPERA_RECARGA_MS, expect.any(Function))
    expect(e.recargar).toHaveBeenCalledWith(`https://caja.ejemplo/?${PARAMETRO_RECARGA}=1.10.0`)
  })

  it('app al día o más nueva: no avisa ni recarga', async () => {
    for (const actual of ['1.10.0', '1.11.0', '2.0.0']) {
      const e = entorno(actual, '1.10.0')
      expect(await revisarVersion(e)).toBe('al_dia')
      expect(e.avisar).not.toHaveBeenCalled()
      expect(e.recargar).not.toHaveBeenCalled()
    }
  })

  it('sin mínima cargada: no hace nada', async () => {
    const e = entorno('1.0.0', null)
    expect(await revisarVersion(e)).toBe('al_dia')
    expect(e.recargar).not.toHaveBeenCalled()
  })

  it('si ya recargó para esa mínima y sigue vieja, avisa sin recargar de nuevo', async () => {
    const e = entorno('1.9.0', '1.10.0', `https://caja.ejemplo/?${PARAMETRO_RECARGA}=1.10.0`)
    expect(await revisarVersion(e)).toBe('trabada')
    expect(e.avisar).toHaveBeenCalledWith(AVISO_VERSION_TRABADA)
    expect(e.recargar).not.toHaveBeenCalled()
  })
})

describe('vigilarVersion', () => {
  it('revisa al arrancar y programa una sola recarga', async () => {
    const e = entorno('1.0.0', '2.0.0')
    const cancelar = vigilarVersion(e)
    await vi.waitFor(() => expect(e.recargar).toHaveBeenCalledTimes(1))
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(e.leerMinima).toHaveBeenCalledTimes(1)
    cancelar()
  })
})

describe('avisarEnPantalla', () => {
  it('muestra un solo aviso y lo actualiza', () => {
    avisarEnPantalla('uno')
    avisarEnPantalla('dos')
    const avisos = document.querySelectorAll('#aviso-version')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toHaveTextContent('dos')
    expect(avisos[0]).toHaveAttribute('role', 'alert')
  })
})

describe('leerVersionMinima', () => {
  it('lee version_minima por rpc', async () => {
    const rpc = vi.fn(async (_funcion: string) => ({ data: '1.2.0', error: null }))
    expect(await leerVersionMinima({ rpc } as unknown as SupabaseClient)).toBe('1.2.0')
    expect(rpc).toHaveBeenCalledWith('version_minima')
  })

  it('un error se propaga (programarSincronizacion lo ignora y reintenta en la próxima vuelta)', async () => {
    const rpc = vi.fn(async (_funcion: string) => ({ data: null, error: { message: 'sin red' } }))
    await expect(leerVersionMinima({ rpc } as unknown as SupabaseClient)).rejects.toEqual({ message: 'sin red' })
  })
})
```

`src/negocio/config.test.ts`:
```ts
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
```

`src/negocio/AvisoAbono.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvisoAbono, TEXTO_ABONO } from './AvisoAbono'

describe('AvisoAbono', () => {
  it('activo o sin dato: no muestra nada', () => {
    const { container, rerender } = render(<AvisoAbono estado="activo" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AvisoAbono estado={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('gracia y suspendido: muestra el aviso', () => {
    const { rerender } = render(<AvisoAbono estado="gracia" />)
    expect(screen.getByRole('status')).toHaveTextContent(TEXTO_ABONO.gracia)
    rerender(<AvisoAbono estado="suspendido" />)
    expect(screen.getByRole('status')).toHaveTextContent(TEXTO_ABONO.suspendido)
  })

  it('es sólo texto: no trae botones ni deshabilita lo que tiene al lado', () => {
    render(
      <>
        <AvisoAbono estado="suspendido" />
        <button type="button">Cobrar</button>
      </>,
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cobrar' })).toBeEnabled()
  })
})
```

En `src/Kiosco.test.tsx` (tarea 17), agregar estas dos pruebas dentro de `describe('Kiosco', () => { ... })`, después de la última (`'"Cerrar sesión" avisa a la app'`). Los imports del archivo ya alcanzan (`render`, `screen`, `vi`, `userEvent`, `CUENTA_CAJA`, `serviciosFalsos`):
```tsx
  it('aplica la config visual del negocio después del login y la quita al salir', async () => {
    const servicios = serviciosFalsos({
      config: { nombreVisible: 'Kiosco Don Beto', logoUrl: null, colorPrimario: '#aa3300' },
    })
    const { unmount } = render(<Kiosco servicios={servicios} cuenta={CUENTA_CAJA} alCerrarSesion={vi.fn()} />)
    expect(await screen.findByText('Kiosco Don Beto')).toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('#aa3300')
    unmount()
    expect(document.documentElement.style.getPropertyValue('--color-primario')).toBe('')
  })

  it('abono suspendido: avisa y no bloquea la venta', async () => {
    const { user } = armar(CUENTA_CAJA, serviciosFalsos({ estadoAbono: 'suspendido' }))
    expect(await screen.findByText(/El abono de este kiosco está suspendido/)).toBeInTheDocument()
    const abrir = await screen.findByRole('button', { name: 'Abrir turno' })
    expect(abrir).toBeEnabled()
    await user.click(abrir)
    expect(await screen.findByLabelText('Escanear o buscar')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sin código (F2)' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cerrar turno' })).toBeEnabled()
  })
```

- [ ] **Step 7: Correrlas y ver que fallan**

Run: `npx vitest run src/app src/negocio src/Kiosco.test.tsx`
Expected: FAIL. `version.test.ts`, `config.test.ts` y `AvisoAbono.test.tsx` con `Failed to resolve import "./version"`, `"./config"` y `"./AvisoAbono"`; en `Kiosco.test.tsx` fallan las dos pruebas nuevas (`Unable to find an element with the text: Kiosco Don Beto` y `Unable to find an element with the text: /El abono de este kiosco está suspendido/`); las 7 de la tarea 17 siguen pasando.

- [ ] **Step 8: Definir `__APP_VERSION__` en Vite, en Vitest y en los tipos**

`vite.config.ts` (reemplaza el de la tarea 1 entero; la tarea 19 lo vuelve a reemplazar para sumar `_headers`):
```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// npm y Playwright corren desde la raíz del proyecto: package.json se lee desde ahí.
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    // Versión de la app que se compara con version_minima() (src/app/version.ts).
    __APP_VERSION__: JSON.stringify(version),
  },
})
```

En `vitest.config.ts` (tarea 1), reemplazar la línea
```ts
  plugins: [react()],
```
por
```ts
  plugins: [react()],
  // Las pruebas no leen package.json; donde importa, la versión entra por parámetro.
  define: { __APP_VERSION__: JSON.stringify('0.0.0-pruebas') },
```
(si la tarea 7 sumó `'fake-indexeddb/auto'` a `setupFiles` por V17, se conserva: sólo se agrega la clave `define`).

`src/vite-env.d.ts` (reemplaza el de la tarea 1 entero):
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de package.json. La define vite.config.ts (en las pruebas, vitest.config.ts). */
declare const __APP_VERSION__: string
```

- [ ] **Step 9: Implementar la versión mínima**

`src/app/version.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { programarSincronizacion } from '../catalogo/programar'

export const ESPERA_RECARGA_MS = 3_000
/** Marca en la URL la mínima para la que ya se recargó: evita recargas en bucle sin guardar nada en el navegador. */
export const PARAMETRO_RECARGA = 'version-minima'
export const AVISO_VERSION =
  'Hay una versión nueva de la app: la página se va a recargar en unos segundos. Si estabas cargando una venta, revisá las ventas de hoy antes de cargarla de nuevo.'
export const AVISO_VERSION_TRABADA =
  'Hay una versión nueva de la app, pero esta PC no la pudo cargar. Podés seguir vendiendo; avisale a Felipe.'

type Version = readonly [number, number, number]

/** "1.10.0" → [1, 10, 0]. Ignora un sufijo como "-beta". Texto inválido: null. */
export function leerVersion(texto: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(texto.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Negativo si a < b, 0 si son iguales, positivo si a > b; null si alguna es ilegible. 1.10.0 > 1.9.0. */
export function compararVersiones(a: string, b: string): number | null {
  const va = leerVersion(a)
  const vb = leerVersion(b)
  if (!va || !vb) return null
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i]
  }
  return 0
}

/** Una versión ilegible nunca fuerza la recarga: mejor una app vieja que una PC recargando sin fin. */
export function esAnterior(actual: string, minima: string): boolean {
  const c = compararVersiones(actual, minima)
  return c !== null && c < 0
}

/** Lo que la revisión necesita del navegador. En las pruebas, falsos. */
export interface EntornoVersion {
  actual: string
  leerMinima(): Promise<string | null>
  url(): URL
  avisar(texto: string): void
  esperar(ms: number, hacer: () => void): void
  recargar(url: string): void
}

export type ResultadoVersion = 'al_dia' | 'recargando' | 'trabada'

/** Spec sección 9, caso 6: si la app quedó bajo la versión mínima, avisa y recarga. */
export async function revisarVersion(e: EntornoVersion): Promise<ResultadoVersion> {
  const minima = await e.leerMinima()
  if (minima === null || !esAnterior(e.actual, minima)) return 'al_dia'
  const url = e.url()
  // Ya recargó una vez para esta mínima y sigue vieja (el deploy no llegó): avisa sin recargar en bucle.
  if (url.searchParams.get(PARAMETRO_RECARGA) === minima) {
    e.avisar(AVISO_VERSION_TRABADA)
    return 'trabada'
  }
  url.searchParams.set(PARAMETRO_RECARGA, minima)
  e.avisar(AVISO_VERSION)
  e.esperar(ESPERA_RECARGA_MS, () => e.recargar(url.toString()))
  return 'recargando'
}

/**
 * Revisa al arrancar, al volver a la pestaña y cada 3 minutos (misma programación que el catálogo, tarea 7).
 * Después de programar una recarga, o de avisar que quedó trabada, no vuelve a revisar. Devuelve cómo cancelar.
 */
export function vigilarVersion(e: EntornoVersion): () => void {
  let enCurso = false
  let listo = false
  return programarSincronizacion(async () => {
    if (enCurso || listo) return
    enCurso = true
    try {
      listo = (await revisarVersion(e)) !== 'al_dia'
    } finally {
      enCurso = false
    }
  })
}

/** Aviso fuera de React: se ve también antes del login. Uno solo, arriba de todo. */
export function avisarEnPantalla(texto: string, doc: Document = document): void {
  let aviso = doc.getElementById('aviso-version')
  if (!aviso) {
    aviso = doc.createElement('p')
    aviso.id = 'aviso-version'
    aviso.setAttribute('role', 'alert')
    aviso.className = 'aviso aviso--version'
    doc.body.prepend(aviso)
  }
  aviso.textContent = texto
}

/** version_minima() la pueden leer anon y authenticated (tarea 18, migración 121800). */
export async function leerVersionMinima(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc('version_minima')
  if (error) throw error
  return typeof data === 'string' ? data : null
}

export function entornoNavegador(leerMinima: () => Promise<string | null>): EntornoVersion {
  return {
    actual: __APP_VERSION__,
    leerMinima,
    url: () => new URL(window.location.href),
    avisar: (texto) => avisarEnPantalla(texto),
    esperar: (ms, hacer) => {
      window.setTimeout(hacer, ms)
    },
    recargar: (url) => window.location.replace(url),
  }
}
```

- [ ] **Step 10: Implementar la config visual y el aviso de abono**

`src/negocio/config.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** Valores del enum public.estado_abono (tarea 3). Los carga Felipe a mano desde Studio. */
export type EstadoAbono = 'activo' | 'gracia' | 'suspendido'

/** Config visual del negocio (spec sección 5a). Sólo Felipe la cambia, desde Studio; la app sólo la lee. */
export interface ConfigNegocio {
  nombreVisible: string
  logoUrl: string | null
  colorPrimario: string | null
}

/** Fila de public.config_negocio (tarea 3). */
export interface FilaConfigNegocio {
  nombre_visible: string
  logo_url: string | null
  color_primario: string
}

const COLOR = /^#[0-9a-fA-F]{6}$/

/** La CSP (tarea 19) sólo deja cargar imágenes propias y del Supabase del proyecto: otro origen no se muestra. */
export function logoPermitido(url: string | null, origenLogos: string): string | null {
  if (!url) return null
  try {
    const logo = new URL(url)
    return logo.protocol === 'https:' && logo.origin === new URL(origenLogos).origin ? logo.toString() : null
  } catch {
    return null
  }
}

export function aConfig(fila: FilaConfigNegocio, origenLogos: string): ConfigNegocio {
  return {
    nombreVisible: fila.nombre_visible,
    logoUrl: logoPermitido(fila.logo_url, origenLogos),
    // La base ya lo chequea (tarea 3); se repite porque el valor termina en una variable CSS.
    colorPrimario: COLOR.test(fila.color_primario) ? fila.color_primario : null,
  }
}

/** Config del negocio del token (RLS config_negocio_select). Sin fila: null y queda la pantalla genérica. */
export async function leerConfigNegocio(supabase: SupabaseClient, origenLogos: string): Promise<ConfigNegocio | null> {
  const { data, error } = await supabase
    .from('config_negocio')
    .select('nombre_visible, logo_url, color_primario')
    .maybeSingle()
  if (error) throw error
  return data ? aConfig(data as FilaConfigNegocio, origenLogos) : null
}

/** Estado del abono del negocio del token (RLS negocios_select). Sólo aviso: nunca bloquea (spec sección 8). */
export async function leerEstadoAbonoNegocio(supabase: SupabaseClient): Promise<EstadoAbono | null> {
  const { data, error } = await supabase.from('negocios').select('estado_abono').maybeSingle()
  if (error) throw error
  return data ? (data as { estado_abono: EstadoAbono }).estado_abono : null
}

/** Aplica la config después del login (decisión 23). Devuelve cómo volver a la pantalla genérica. */
export function aplicarConfig(config: ConfigNegocio, doc: Document = document): () => void {
  const raiz = doc.documentElement
  const tituloAntes = doc.title
  const colorAntes = raiz.style.getPropertyValue('--color-primario')
  if (config.colorPrimario) raiz.style.setProperty('--color-primario', config.colorPrimario)
  doc.title = config.nombreVisible
  return () => {
    if (colorAntes) raiz.style.setProperty('--color-primario', colorAntes)
    else raiz.style.removeProperty('--color-primario')
    doc.title = tituloAntes
  }
}
```

`src/negocio/AvisoAbono.tsx`:
```tsx
import type { EstadoAbono } from './config'

export const TEXTO_ABONO = {
  gracia:
    'El abono de este kiosco está vencido (período de gracia). La caja sigue funcionando. Comunicate con Felipe para regularizarlo.',
  suspendido:
    'El abono de este kiosco está suspendido. La caja sigue funcionando. Comunicate con Felipe para regularizarlo.',
} as const

/** Sólo aviso (spec sección 8 y decisión 19): nunca bloquea la caja ni deshabilita nada, en ningún estado. */
export function AvisoAbono({ estado }: { estado: EstadoAbono | null }) {
  if (estado !== 'gracia' && estado !== 'suspendido') return null
  return (
    <p role="status" className="aviso aviso-abono">
      {TEXTO_ABONO[estado]}
    </p>
  )
}
```

- [ ] **Step 11: Sumar config y abono a los servicios**

En `src/servicios.ts` (tarea 17):

1. Agregar este import después de `import { crearServicioJefe, type ServicioJefe } from './jefe/jefe'`:
```ts
import { leerConfigNegocio, leerEstadoAbonoNegocio, type ConfigNegocio, type EstadoAbono } from './negocio/config'
```
2. En la interfaz `Servicios`, reemplazar la línea
```ts
  jefe: ServicioJefe
}
```
por
```ts
  jefe: ServicioJefe
  leerConfig(): Promise<ConfigNegocio | null>
  leerEstadoAbono(): Promise<EstadoAbono | null>
}
```
3. En `crearServicios`, reemplazar la línea
```ts
    jefe: crearServicioJefe(supabase),
```
por
```ts
    jefe: crearServicioJefe(supabase),
    // Logos sólo del Supabase del proyecto: es el único origen de imágenes que deja la CSP (tarea 19).
    leerConfig: () => leerConfigNegocio(supabase, import.meta.env.VITE_SUPABASE_URL),
    leerEstadoAbono: () => leerEstadoAbonoNegocio(supabase),
```

En `src/test/servicios.ts` (tarea 17):

1. Agregar este import después de `import type { FilaHistorial } from '../jefe/jefe'`:
```ts
import type { ConfigNegocio, EstadoAbono } from '../negocio/config'
```
2. Reemplazar la línea
```ts
export function serviciosFalsos(opciones: { sesion?: SesionAuth | null; cuenta?: Cuenta | null } = {}) {
```
por
```ts
export function serviciosFalsos(
  opciones: {
    sesion?: SesionAuth | null
    cuenta?: Cuenta | null
    config?: ConfigNegocio | null
    estadoAbono?: EstadoAbono | null
  } = {},
) {
```
3. Reemplazar el cierre del objeto
```ts
      leerHistorial: vi.fn(async (_desde: number): Promise<FilaHistorial[]> => []),
    },
  } satisfies Servicios
```
por
```ts
      leerHistorial: vi.fn(async (_desde: number): Promise<FilaHistorial[]> => []),
    },
    leerConfig: vi.fn(async (): Promise<ConfigNegocio | null> => opciones.config ?? null),
    leerEstadoAbono: vi.fn(async (): Promise<EstadoAbono | null> =>
      opciones.estadoAbono !== undefined ? opciones.estadoAbono : 'activo',
    ),
  } satisfies Servicios
```

- [ ] **Step 12: Mostrar la config y el aviso en el kiosco**

`src/Kiosco.tsx` (reemplaza el de la tarea 17 entero; lo nuevo son los estados `config` y `estadoAbono`, sus efectos, el logo y el nombre en la barra y `AvisoAbono`):
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Cuenta } from './auth/cuenta'
import { CajaDelDia } from './caja-del-dia/CajaDelDia'
import { PantallaCaja } from './caja/PantallaCaja'
import { programarSincronizacion } from './catalogo/programar'
import type { Dispositivo } from './dispositivo/dispositivo'
import { Calibracion } from './escaner/Calibracion'
import { AnonimizarCliente } from './jefe/AnonimizarCliente'
import { ModuloFiado } from './jefe/ModuloFiado'
import { PantallaHistorial } from './jefe/PantallaHistorial'
import { AvisoAbono } from './negocio/AvisoAbono'
import { aplicarConfig, type ConfigNegocio, type EstadoAbono } from './negocio/config'
import { PantallaPagos } from './pagos/PantallaPagos'
import { PantallaProductos } from './productos/PantallaProductos'
import type { Servicios } from './servicios'
import type { Rol } from './tipos'
import { ResumenCierre } from './turno/PantallaTurno'
import type { CierreTurno } from './turno/turno'

export type Seccion = 'caja' | 'productos' | 'caja_del_dia' | 'historial' | 'modulo' | 'anonimizar' | 'calibracion'

/** Tabla de permisos del spec (sección 10). Ocultar no es seguridad: la base chequea el rol igual. */
export const SECCIONES: readonly { id: Seccion; titulo: string; soloJefe: boolean }[] = [
  { id: 'caja', titulo: 'Caja', soloJefe: false },
  { id: 'productos', titulo: 'Productos', soloJefe: false },
  { id: 'caja_del_dia', titulo: 'Caja del día', soloJefe: false },
  { id: 'historial', titulo: 'Historial', soloJefe: true },
  { id: 'modulo', titulo: 'Módulo fiado', soloJefe: true },
  { id: 'anonimizar', titulo: 'Anonimizar cliente', soloJefe: true },
  { id: 'calibracion', titulo: 'Calibrar escáner', soloJefe: true },
]

export function seccionesPara(rol: Rol) {
  return SECCIONES.filter((s) => rol === 'jefe' || !s.soloJefe)
}

export interface PropsKiosco {
  servicios: Servicios
  cuenta: Cuenta
  alCerrarSesion(): void
}

/** Un kiosco logueado: registra la PC, programa la caché, aplica la config y arma las pantallas según el rol. */
export function Kiosco({ servicios, cuenta, alCerrarSesion }: PropsKiosco) {
  const [dispositivo, setDispositivo] = useState<Dispositivo | null>(null)
  const [errorPc, setErrorPc] = useState(false)
  const [fiado, setFiado] = useState(false)
  const [config, setConfig] = useState<ConfigNegocio | null>(null)
  const [estadoAbono, setEstadoAbono] = useState<EstadoAbono | null>(null)
  const [seccion, setSeccion] = useState<Seccion>('caja')
  const [vueltaCaja, setVueltaCaja] = useState(0)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [cierre, setCierre] = useState<CierreTurno | null>(null)
  const [avisoTurno, setAvisoTurno] = useState<string | null>(null)

  function registrar() {
    setErrorPc(false)
    // Primer login de la PC: alta automática con prefijo nuevo (decisión 34). Después devuelve el mismo.
    servicios.registrarDispositivo(cuenta.negocioId).then(setDispositivo, () => setErrorPc(true))
  }

  useEffect(registrar, [servicios, cuenta.negocioId])
  useEffect(() => programarSincronizacion(servicios.sincronizarCatalogo), [servicios])
  useEffect(() => {
    // El módulo lo hace cumplir la base; esto sólo muestra u oculta el medio fiado.
    servicios.fiadoActivo().then(setFiado, () => setFiado(false))
  }, [servicios])
  useEffect(() => {
    // Sin config (o sin red), queda la pantalla genérica: no es un error para el cajero.
    servicios.leerConfig().then(setConfig, () => setConfig(null))
    // Sólo aviso: si no se puede leer, no se muestra nada y la caja sigue igual.
    servicios.leerEstadoAbono().then(setEstadoAbono, () => setEstadoAbono(null))
  }, [servicios])
  // Al salir del kiosco (cerrar sesión), la vuelta atrás deja la pantalla de entrada genérica (decisión 23).
  useEffect(() => (config ? aplicarConfig(config) : undefined), [config])

  const porPc = useMemo(
    () =>
      dispositivo
        ? {
            turno: servicios.turno(dispositivo.dispositivoId),
            productos: servicios.productos(dispositivo.dispositivoId),
            cajaDelDia: servicios.cajaDelDia(dispositivo.dispositivoId),
          }
        : null,
    [servicios, dispositivo],
  )

  async function cerrarTurno() {
    if (!porPc) return
    setConfirmarCierre(false)
    setAvisoTurno(null)
    try {
      setCierre(await porPc.turno.cerrar())
    } catch (e) {
      const sinTurno = typeof e === 'object' && e !== null && 'message' in e && e.message === 'sin_turno'
      setAvisoTurno(sinTurno ? 'No hay turno abierto en esta PC.' : 'No se pudo cerrar el turno. Revisá la conexión.')
    }
  }

  if (errorPc) {
    return (
      <section className="kiosco">
        <p role="alert" className="aviso aviso--error">
          No se pudo registrar esta PC. Revisá la conexión.
        </p>
        <button type="button" onClick={registrar}>
          Reintentar
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
      </section>
    )
  }
  if (!dispositivo || !porPc) return <p className="cargando">Preparando la caja…</p>

  const dispositivoId = dispositivo.dispositivoId
  const esJefe = cuenta.rol === 'jefe'

  return (
    <div className="kiosco">
      <header className="kiosco__barra">
        {config?.logoUrl && <img className="kiosco__logo" src={config.logoUrl} alt="" />}
        {config && <strong className="kiosco__nombre">{config.nombreVisible}</strong>}
        <span>
          {esJefe ? 'Jefe' : 'Caja'} · PC {dispositivo.prefijo}
        </span>
        <nav aria-label="Secciones">
          {seccionesPara(cuenta.rol).map((s) => (
            <button key={s.id} type="button" aria-pressed={seccion === s.id} onClick={() => setSeccion(s.id)}>
              {s.titulo}
            </button>
          ))}
        </nav>
        <button type="button" onClick={() => setConfirmarCierre(true)}>
          Cerrar turno
        </button>
        <button type="button" onClick={alCerrarSesion}>
          Cerrar sesión
        </button>
        <AvisoAbono estado={estadoAbono} />
      </header>

      {confirmarCierre && (
        <div className="kiosco__confirmar" role="group" aria-label="Cerrar turno">
          <p>¿Cerrar el turno de esta PC? Si hay una venta sin cobrar, se pierde.</p>
          <button type="button" onClick={() => void cerrarTurno()}>
            Sí, cerrar turno
          </button>
          <button type="button" onClick={() => setConfirmarCierre(false)}>
            No
          </button>
        </div>
      )}
      {avisoTurno && (
        <p role="alert" className="aviso aviso--error">
          {avisoTurno}
        </p>
      )}
      {cierre && (
        <ResumenCierre
          cierre={cierre}
          alSeguir={() => {
            setCierre(null)
            setSeccion('caja')
            // Caja nueva: lee el turno de la base, no hay ninguno abierto y pide abrirlo.
            setVueltaCaja((v) => v + 1)
          }}
        />
      )}

      {/* Siempre montada: cambiar de sección no pierde la venta en armado. */}
      <div hidden={seccion !== 'caja' || cierre !== null}>
        <PantallaCaja
          key={vueltaCaja}
          catalogo={servicios.catalogo}
          turno={porPc.turno}
          leerRanking={servicios.leerRanking}
          productos={porPc.productos}
          cobro={(sesion) => (
            <PantallaPagos
              sesion={sesion}
              dispositivoId={dispositivoId}
              fiadoHabilitado={fiado}
              clientes={servicios.clientes}
              rpc={servicios.rpc}
            />
          )}
        />
      </div>

      {seccion === 'productos' && <PantallaProductos servicio={porPc.productos} />}
      {seccion === 'caja_del_dia' && <CajaDelDia rol={cuenta.rol} servicio={porPc.cajaDelDia} />}
      {esJefe && seccion === 'historial' && <PantallaHistorial servicio={servicios.jefe} />}
      {esJefe && seccion === 'modulo' && <ModuloFiado activo={fiado} servicio={servicios.jefe} alCambiar={setFiado} />}
      {esJefe && seccion === 'anonimizar' && <AnonimizarCliente clientes={servicios.clientes} servicio={servicios.jefe} />}
      {esJefe && seccion === 'calibracion' && <Calibracion />}
    </div>
  )
}
```

- [ ] **Step 13: Vigilar la versión desde el arranque y sumar los estilos**

`src/main.tsx` (reemplaza el de la tarea 17 entero; la tarea 19 lo vuelve a reemplazar para sumar Sentry):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { entornoNavegador, leerVersionMinima, vigilarVersion } from './app/version'
import { cacheDeLaApp } from './catalogo/cache'
import { supabase } from './lib/supabase'
import { crearServicios } from './servicios'
import './estilos.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Antes del login y durante toda la vida de la pestaña: una app vieja, con sesión o sin ella, se recarga.
vigilarVersion(entornoNavegador(() => leerVersionMinima(supabase)))

// Una sola vez: los servicios son estables durante toda la vida de la pestaña.
const servicios = crearServicios(supabase, cacheDeLaApp())

createRoot(raiz).render(
  <StrictMode>
    <App servicios={servicios} />
  </StrictMode>,
)
```

Al final de `src/estilos.css`:
```css
/* Personalización y avisos (tarea 18) */
.kiosco__barra { border-bottom: 4px solid var(--color-primario); }
.kiosco__logo { height: 2rem; width: auto; }
.aviso--version { margin: 0; border-radius: 0; text-align: center; }
```

- [ ] **Step 14: Correr las pruebas, los tipos y el build**

Run:
```bash
npx vitest run src/app src/negocio src/Kiosco.test.tsx
npx tsc --noEmit
npm test
npm run build
grep -c "__APP_VERSION__" dist/assets/*.js
```
Expected: `Test Files  4 passed (4)` y `Tests  29 passed (29)` (11 de `version`, 6 de `config`, 3 de `AvisoAbono` y 9 de `Kiosco`); `tsc` sin salida; `npm test` sin fallas; el build termina con `✓ built in`; el `grep` imprime `0` para cada archivo (Vite reemplazó la constante). Si `config.test.ts` falla porque `getPropertyValue('--color-primario')` devuelve `''` después de `setProperty`, jsdom no soporta variables CSS en esa versión (V41): cambiar esas dos comprobaciones por `expect(document.documentElement.style.cssText).toContain('--color-primario: #aa3300')`.

- [ ] **Step 15: Probarlo a mano contra Supabase local**

Run:
```bash
ANON=$(sed -n 's/^VITE_SUPABASE_ANON_KEY=//p' .env.local)
curl -s -X POST "http://127.0.0.1:54321/rest/v1/rpc/version_minima" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'
npm run dev
```
Expected: el `curl` (como `anon`, sin sesión) imprime `"0.0.0"`; Vite muestra `Local:   http://localhost:5173/`. Si el `curl` da `401`, la clave quedó entre comillas en `.env.local` (V2): sacarle las comillas a `ANON`.

En Studio (`http://127.0.0.1:54323`), SQL Editor, con el kiosco de prueba de la tarea 17, step 11:
```sql
insert into public.config_negocio (negocio_id, nombre_visible, color_primario)
values ('a0000000-0000-0000-0000-000000000000', 'Kiosco de prueba', '#2e7d32')
on conflict (negocio_id) do update set nombre_visible = excluded.nombre_visible, color_primario = excluded.color_primario;
update public.negocios set estado_abono = 'suspendido' where id = 'a0000000-0000-0000-0000-000000000000';
```
En `http://localhost:5173/`:
1. La pantalla de login es genérica (pestaña "Caja", sin nombre ni color del kiosco).
2. Entrar con la cuenta caja: la pestaña dice "Kiosco de prueba", la barra muestra el nombre y una línea verde, y aparece el aviso de abono suspendido. Abrir turno y vender: todo funciona igual.
3. Cerrar sesión: vuelve el login genérico (pestaña "Caja", sin la línea verde).
4. En Studio: `update public.version_app set version_minima = '9.0.0';`. Volver a la pestaña de la app: aparece "Hay una versión nueva de la app…", a los 3 segundos recarga con `?version-minima=9.0.0` y después muestra "…esta PC no la pudo cargar…" sin volver a recargar; la caja sigue vendiendo.
5. Dejar todo como estaba:
```sql
update public.version_app set version_minima = '0.0.0';
update public.negocios set estado_abono = 'activo' where id = 'a0000000-0000-0000-0000-000000000000';
```

- [ ] **Step 16: Commit (sólo con OK de Felipe)**

```bash
git add supabase/migrations/20261019121800_version_minima.sql supabase/tests/database/160_version_minima.test.sql supabase/tests/database/010_rls.test.sql vite.config.ts vitest.config.ts src/vite-env.d.ts src/app src/negocio src/servicios.ts src/test/servicios.ts src/Kiosco.tsx src/Kiosco.test.tsx src/main.tsx src/estilos.css
git commit -m "feat: config visual, aviso de abono y versión mínima con recarga" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarea 19: Despliegue, E2E y cierre (Vitest; Playwright; configuración de Cloudflare)

**Files:**
- Create: `src/lib/sentry.ts`, `config/headers.ts`, `wrangler.jsonc`, `playwright.config.ts`, `tests/e2e/preparar.ts`
- Modify: `vite.config.ts` (reemplazo entero: suma el plugin que escribe `dist/_headers`), `src/main.tsx` (reemplazo entero: inicia Sentry), `src/vite-env.d.ts` (reemplazo entero: `VITE_SENTRY_DSN`), `.env.example` (reemplazo entero), `package.json` (dependencias y scripts `test:e2e` y `deploy`, por `npm`)
- Test: `src/lib/sentry.test.ts`, `config/headers.test.ts`, `tests/e2e/venta.spec.ts`

Decisiones de esta tarea (van a la lista de decisiones de la parte 5):
- Sentry sólo para errores: sin tracing, sin replay, `sendDefaultPii: false` (sin IP, cookies ni usuario). Se inicializa sólo si existe `VITE_SENTRY_DSN`. Con el SDK 10, `sendDefaultPii` está deprecado en favor de `dataCollection`, pero sigue funcionando y, mientras `dataCollection` no se use, es la configuración más restrictiva (un `dataCollection: {}` vacío es más permisivo): se fija la versión mayor 10 y se anota V42 para el paso a 11.
- `beforeSend` borra `user`, `extra` y el cuerpo, cookies, headers y consulta de `request`; deja sólo los `contexts` técnicos (`browser`, `os`, `device`, `culture`, `trace`); tapa emails y teléfonos en el mensaje y en las excepciones (puede tapar también tramos de uuids con muchos dígitos: se acepta, pierde algo de detalle). `beforeBreadcrumb` (y `beforeSend`, sobre las migas ya guardadas) deja sólo migas de red (`fetch` y `xhr`: método, estado y URL sin consulta; nunca cuerpos) y de navegación; descarta las de consola, clics y teclas, que pueden llevar nombres o teléfonos de clientes.
- CSP sin `'unsafe-inline'` en ningún lado, tampoco en `style-src`: la app no tiene `<style>` ni atributos `style` en el HTML; React y `aplicarConfig` (tarea 18) cambian estilos por CSSOM (`element.style`), que la CSP no bloquea (V47). Se suman `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `font-src 'self'`. `img-src` suma el origen de Supabase para los logos (tarea 18). `connect-src`: la app, Supabase y el origen del DSN de Sentry (sin la clave).
- El build falla si falta `VITE_SUPABASE_URL`: sin ella no hay CSP correcta.
- El E2E corre contra Supabase local con un build en modo `e2e` (lee `.env.local`, nunca `.env.production.local`) servido por `vite preview`, que no aplica `_headers`: la CSP se prueba aparte con `wrangler dev` (step 10) y en el proyecto hospedado (checklist, paso D10).

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install @sentry/browser@10
npm install -D wrangler @playwright/test
npx playwright install chromium
npm pkg set "scripts.test:e2e=playwright test" "scripts.deploy=npm run build && wrangler deploy"
npm pkg get scripts
```
Expected: los `npm install` terminan con `added N packages` y sin `ERR!`; `playwright install` baja Chromium (unos 150 MB, desde el CDN de Playwright); `npm pkg get scripts` muestra `"test:e2e": "playwright test"` y `"deploy": "npm run build && wrangler deploy"` además de los scripts de la tarea 1.

- [ ] **Step 2: Escribir las pruebas de Sentry y de los headers**

`src/lib/sentry.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { iniciarSentry, limpiarMiga, redactar, type EventoLimpiable } from './sentry'

const DSN = 'https://clave123@o111.ingest.us.sentry.io/222'

function eventoConDatosPersonales(): EventoLimpiable {
  return {
    message: 'No se pudo dar de alta a ana.gomez@kiosco.com (11 5555-1234)',
    user: { email: 'ana.gomez@kiosco.com', ip_address: '200.1.2.3' },
    extra: { nombre: 'Ana Gómez', telefono: '11 5555-1234' },
    contexts: {
      browser: { name: 'Chrome' },
      cliente: { nombre: 'Ana Gómez', telefono: '11 5555-1234' },
    },
    request: {
      url: 'https://caja.ejemplo/?q=Ana%20G%C3%B3mez',
      data: { nombre: 'Ana Gómez' },
      headers: { Cookie: 'sb-token' },
    },
    exception: { values: [{ value: 'alta_cliente falló para ana.gomez@kiosco.com, tel. +54 11 5555-1234' }] },
    breadcrumbs: [
      { category: 'console', message: 'cliente Ana Gómez 11 5555-1234' },
      { category: 'ui.input', message: 'input[name="Nombre o alias"]' },
      {
        category: 'fetch',
        data: {
          method: 'POST',
          status_code: 400,
          url: 'https://abcd.supabase.co/rest/v1/rpc/alta_cliente?nombre=Ana',
          request_body: { p_nombre: 'Ana Gómez' },
        },
      },
    ],
  }
}

interface OpcionesCapturadas {
  dsn: string
  sendDefaultPii: boolean
  beforeSend(evento: EventoLimpiable, hint: unknown): EventoLimpiable | null
  beforeBreadcrumb(miga: object): object | null
}

function opcionesDe(iniciar: ReturnType<typeof vi.fn>): OpcionesCapturadas {
  return iniciar.mock.calls[0][0] as OpcionesCapturadas
}

describe('Sentry sin datos personales', () => {
  it('sin DSN no se inicializa', () => {
    const iniciar = vi.fn()
    expect(iniciarSentry(undefined, iniciar)).toBe(false)
    expect(iniciarSentry('', iniciar)).toBe(false)
    expect(iniciar).not.toHaveBeenCalled()
  })

  it('con DSN se inicializa sin PII por defecto', () => {
    const iniciar = vi.fn()
    expect(iniciarSentry(DSN, iniciar)).toBe(true)
    expect(iniciar).toHaveBeenCalledTimes(1)
    expect(opcionesDe(iniciar)).toEqual(expect.objectContaining({ dsn: DSN, sendDefaultPii: false }))
  })

  it('un evento con email, nombre y teléfono sale sin esos campos', () => {
    const iniciar = vi.fn()
    iniciarSentry(DSN, iniciar)
    const limpio = opcionesDe(iniciar).beforeSend(eventoConDatosPersonales(), {})
    const texto = JSON.stringify(limpio)
    for (const dato of ['ana.gomez@kiosco.com', 'Ana', 'Gómez', '5555', '200.1.2.3', 'Cookie', 'request_body']) {
      expect(texto).not.toContain(dato)
    }
    expect(limpio?.contexts).toEqual({ browser: { name: 'Chrome' } })
    expect(limpio?.breadcrumbs).toEqual([
      {
        category: 'fetch',
        data: { method: 'POST', status_code: 400, url: 'https://abcd.supabase.co/rest/v1/rpc/alta_cliente' },
      },
    ])
  })

  it('beforeBreadcrumb descarta la consola antes de guardarla', () => {
    const iniciar = vi.fn()
    iniciarSentry(DSN, iniciar)
    expect(opcionesDe(iniciar).beforeBreadcrumb({ category: 'console', message: 'Ana Gómez' })).toBeNull()
  })

  it('migas de interfaz afuera; las de red pierden la consulta y los cuerpos', () => {
    expect(limpiarMiga({ category: 'ui.click', message: 'button.alta-cliente' })).toBe(false)
    const red = {
      category: 'xhr',
      data: {
        method: 'GET',
        status_code: 200,
        url: 'https://abcd.supabase.co/rest/v1/clientes?select=*&nombre=ilike.Ana*',
        response_body: 'Ana Gómez',
      },
    }
    expect(limpiarMiga(red)).toBe(true)
    expect(red.data).toEqual({ method: 'GET', status_code: 200, url: 'https://abcd.supabase.co/rest/v1/clientes' })
  })

  it('redactar tapa emails y teléfonos', () => {
    expect(redactar('escribió a ana@kiosco.com desde el 11 4444-5555')).toBe('escribió a [email] desde el [número]')
    expect(redactar('venta A-000123 rechazada')).toBe('venta A-000123 rechazada')
  })
})
```

`config/headers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { archivoHeaders, origen, politicaDeContenido } from './headers'

const SUPABASE = 'https://abcd.supabase.co'
const DSN = 'https://clave123@o111.ingest.us.sentry.io/222'

function directivas(csp: string): Map<string, string> {
  return new Map(
    csp.split('; ').map((directiva) => {
      const [nombre, ...valores] = directiva.split(' ')
      return [nombre, valores.join(' ')]
    }),
  )
}

describe('CSP de _headers', () => {
  it('scripts y estilos sólo propios, sin unsafe-inline ni unsafe-eval', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    const d = directivas(csp)
    expect(d.get('default-src')).toBe("'self'")
    expect(d.get('script-src')).toBe("'self'")
    expect(d.get('style-src')).toBe("'self'")
    expect(d.get('object-src')).toBe("'none'")
    expect(d.get('frame-ancestors')).toBe("'none'")
    expect(csp).not.toMatch(/unsafe-/)
  })

  it('connect-src: la app, Supabase y el origen de Sentry, sin la clave del DSN', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    expect(directivas(csp).get('connect-src')).toBe("'self' https://abcd.supabase.co https://o111.ingest.us.sentry.io")
    expect(csp).not.toContain('clave123')
  })

  it('sin DSN, connect-src queda en la app y Supabase', () => {
    const csp = politicaDeContenido({ supabaseUrl: SUPABASE })
    expect(directivas(csp).get('connect-src')).toBe("'self' https://abcd.supabase.co")
  })

  it('img-src: imágenes propias, data: y Supabase (logos de la config visual)', () => {
    const csp = politicaDeContenido({ supabaseUrl: `${SUPABASE}/` })
    expect(directivas(csp).get('img-src')).toBe("'self' data: https://abcd.supabase.co")
  })

  it('archivo _headers: una regla para todo el sitio con los cuatro headers', () => {
    const texto = archivoHeaders({ supabaseUrl: SUPABASE, sentryDsn: DSN })
    const lineas = texto.trimEnd().split('\n')
    expect(lineas[0]).toBe('/*')
    expect(lineas.slice(1).map((l) => l.split(':')[0].trim())).toEqual([
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ])
    expect(lineas.every((l) => l.length <= 2000)).toBe(true)
    expect(texto).toContain('  X-Content-Type-Options: nosniff\n')
    expect(texto).toContain('  Referrer-Policy: strict-origin-when-cross-origin\n')
    expect(texto).toContain('  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n')
  })

  it('una URL de Supabase mal escrita corta el build', () => {
    expect(() => origen('abcd.supabase.co')).toThrow()
    expect(() => archivoHeaders({ supabaseUrl: 'ftp://abcd.supabase.co' })).toThrow()
  })
})
```

- [ ] **Step 3: Correrlas y ver que fallan**

Run: `npx vitest run src/lib/sentry.test.ts config/headers.test.ts`
Expected: FAIL con `Failed to resolve import "./sentry"` y `Failed to resolve import "./headers"`.

- [ ] **Step 4: Implementar Sentry**

`src/lib/sentry.ts`:
```ts
import * as Sentry from '@sentry/browser'

/** Lo que se mira de una miga (breadcrumb) de Sentry. */
export interface MigaLimpiable {
  category?: string
  message?: string
  data?: { [clave: string]: unknown }
}

/** Lo que se mira de un evento de error de Sentry. */
export interface EventoLimpiable {
  message?: string
  user?: unknown
  extra?: unknown
  contexts?: object
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown }
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: MigaLimpiable[]
}

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g
const TELEFONO = /\+?\d[\d\s().-]{5,}\d/g
const CONTEXTOS_TECNICOS = new Set(['browser', 'os', 'device', 'culture', 'trace'])

/** Tapa emails y teléfonos en un texto libre (mensajes de error). */
export function redactar(texto: string): string {
  return texto.replace(EMAIL, '[email]').replace(TELEFONO, '[número]')
}

/** URL sin consulta ni fragmento: los filtros de PostgREST (?nombre=...) pueden llevar datos de clientes. */
export function sinConsulta(url: string): string {
  const corte = url.search(/[?#]/)
  return corte === -1 ? url : url.slice(0, corte)
}

/**
 * Deja pasar sólo migas de red (método, estado y URL sin consulta, nunca cuerpos) y de navegación.
 * Consola, clics, teclas y cualquier otra quedan afuera: pueden llevar nombres o teléfonos de clientes.
 * Modifica la miga; devuelve false si hay que descartarla.
 */
export function limpiarMiga(miga: MigaLimpiable): boolean {
  const d = miga.data ?? {}
  if (miga.category === 'fetch' || miga.category === 'xhr') {
    miga.data = {
      method: d.method,
      status_code: d.status_code,
      url: typeof d.url === 'string' ? sinConsulta(d.url) : undefined,
    }
    miga.message = undefined
    return true
  }
  if (miga.category === 'navigation') {
    miga.data = {
      from: typeof d.from === 'string' ? sinConsulta(d.from) : undefined,
      to: typeof d.to === 'string' ? sinConsulta(d.to) : undefined,
    }
    miga.message = undefined
    return true
  }
  return false
}

/** Saca del evento todo lo que puede tener datos personales (spec sección 10). Modifica el evento. */
export function limpiarEvento(evento: EventoLimpiable): void {
  evento.user = undefined
  evento.extra = undefined
  if (evento.request) {
    evento.request = { url: evento.request.url ? sinConsulta(evento.request.url) : undefined }
  }
  if (evento.contexts) {
    evento.contexts = Object.fromEntries(
      Object.entries(evento.contexts).filter(([clave]) => CONTEXTOS_TECNICOS.has(clave)),
    )
  }
  if (evento.message) evento.message = redactar(evento.message)
  for (const valor of evento.exception?.values ?? []) {
    if (valor.value) valor.value = redactar(valor.value)
  }
  if (evento.breadcrumbs) evento.breadcrumbs = evento.breadcrumbs.filter(limpiarMiga)
}

type IniciarSentry = (opciones: Sentry.BrowserOptions) => unknown

/** Sentry sólo para errores (spec sección 3 y decisión 32). Sin VITE_SENTRY_DSN, no hace nada. */
export function iniciarSentry(
  dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN,
  iniciar: IniciarSentry = Sentry.init,
): boolean {
  if (!dsn) return false
  iniciar({
    dsn,
    release: __APP_VERSION__,
    environment: import.meta.env.MODE,
    // SDK 10: sin dataCollection manda sendDefaultPii (V42). false = sin IP, cookies ni datos del usuario.
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(miga) {
      return limpiarMiga(miga) ? miga : null
    },
    beforeSend(evento) {
      limpiarEvento(evento)
      return evento
    },
  })
  return true
}
```

- [ ] **Step 5: Implementar la generación de `_headers`**

`config/headers.ts`:
```ts
/** Lo que hace falta para armar dist/_headers. Sale de las variables VITE_ del build. */
export interface OpcionesHeaders {
  supabaseUrl: string
  sentryDsn?: string
}

/** Origen (esquema, host y puerto) de una URL: sin usuario, ruta ni consulta. Tira error si no es http(s). */
export function origen(url: string): string {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`URL sin http(s): ${url}`)
  return u.origin
}

/**
 * CSP: scripts y estilos sólo propios (sin 'unsafe-inline'); red sólo a la app, Supabase y Sentry;
 * imágenes propias, data: y Supabase (logos); nadie puede meter la app en un iframe.
 */
export function politicaDeContenido({ supabaseUrl, sentryDsn }: OpcionesHeaders): string {
  const supabase = origen(supabaseUrl)
  const conexiones = ["'self'", supabase, ...(sentryDsn ? [origen(sentryDsn)] : [])]
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${supabase}`,
    `connect-src ${conexiones.join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** La app no usa cámara, micrófono, ubicación, pagos del navegador ni WebUSB (el escáner es un teclado). */
export const PERMISOS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'

/** Contenido de dist/_headers: una regla para todo el sitio (Cloudflare: máximo 100 reglas, 2.000 caracteres por línea). */
export function archivoHeaders(opciones: OpcionesHeaders): string {
  return [
    '/*',
    `  Content-Security-Policy: ${politicaDeContenido(opciones)}`,
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    `  Permissions-Policy: ${PERMISOS}`,
    '',
  ].join('\n')
}
```

`vite.config.ts` (reemplaza el de la tarea 18 entero; conserva el define de `__APP_VERSION__`):
```ts
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { archivoHeaders } from './config/headers'

// npm y Playwright corren desde la raíz del proyecto: package.json se lee desde ahí.
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/** Escribe dist/_headers con la CSP armada con las URLs del build (Cloudflare lo aplica a los assets). */
function headersCloudflare(supabaseUrl: string | undefined, sentryDsn: string | undefined): Plugin {
  return {
    name: 'headers-cloudflare',
    apply: 'build',
    generateBundle() {
      if (!supabaseUrl) this.error('Falta VITE_SUPABASE_URL: sin ella no se puede armar la CSP de _headers.')
      this.emitFile({ type: 'asset', fileName: '_headers', source: archivoHeaders({ supabaseUrl, sentryDsn }) })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), headersCloudflare(env.VITE_SUPABASE_URL, env.VITE_SENTRY_DSN || undefined)],
    define: {
      // Versión de la app que se compara con version_minima() (src/app/version.ts, tarea 18).
      __APP_VERSION__: JSON.stringify(version),
    },
  }
})
```

`src/vite-env.d.ts` (reemplaza el de la tarea 18 entero):
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Vacío o ausente: Sentry apagado (src/lib/sentry.ts). */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de package.json. La define vite.config.ts (en las pruebas, vitest.config.ts). */
declare const __APP_VERSION__: string
```

`.env.example` (reemplaza el de la tarea 2 entero):
```dotenv
# Generar .env.local con:
#   npx supabase status -o env | sed -n 's/^API_URL=/VITE_SUPABASE_URL=/p; s/^ANON_KEY=/VITE_SUPABASE_ANON_KEY=/p' > .env.local
# En producción, .env.production.local con la URL y la anon key del proyecto hospedado, y el DSN de Sentry.
# La service role key NUNCA va en variables VITE_ (terminaría en el navegador).
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
# Sentry, sólo errores. Vacío = apagado. El DSN es público por diseño (viaja al navegador).
VITE_SENTRY_DSN=
```

- [ ] **Step 6: Iniciar Sentry al arrancar**

`src/main.tsx` (reemplaza el de la tarea 18 entero):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { entornoNavegador, leerVersionMinima, vigilarVersion } from './app/version'
import { cacheDeLaApp } from './catalogo/cache'
import { iniciarSentry } from './lib/sentry'
import { supabase } from './lib/supabase'
import { crearServicios } from './servicios'
import './estilos.css'

// Primero, para que lleguen también los errores del arranque. Sólo con VITE_SENTRY_DSN y sin datos personales.
iniciarSentry()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Antes del login y durante toda la vida de la pestaña: una app vieja, con sesión o sin ella, se recarga.
vigilarVersion(entornoNavegador(() => leerVersionMinima(supabase)))

// Una sola vez: los servicios son estables durante toda la vida de la pestaña.
const servicios = crearServicios(supabase, cacheDeLaApp())

createRoot(raiz).render(
  <StrictMode>
    <App servicios={servicios} />
  </StrictMode>,
)
```

- [ ] **Step 7: Configurar Cloudflare Workers con static assets**

`wrangler.jsonc`:
```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "venta-y-cobro",
  // Fecha del primer despliegue. Cambiarla es cambiar el comportamiento del runtime: sólo a propósito.
  "compatibility_date": "2026-10-20",
  // Sin "main": no hay código de Worker, sólo assets. _headers (dist/_headers) se aplica a los assets.
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

- [ ] **Step 8: Correr las pruebas, los tipos y el build**

Run:
```bash
npx vitest run src/lib/sentry.test.ts config/headers.test.ts
npx tsc --noEmit
npm test
npm run build
cat dist/_headers
```
Expected: `Test Files  2 passed (2)` y `Tests  12 passed (12)` (6 de `sentry` y 6 de `headers`); `tsc` sin salida; `npm test` sin fallas; el build termina con `✓ built in`; `cat` muestra `/*` y las cuatro líneas de headers, con `connect-src 'self' http://127.0.0.1:54321` (el build local usa `.env.local`). Si `tsc` marca `beforeSend` o `beforeBreadcrumb` como incompatibles con `EventoLimpiable` o `MigaLimpiable`, los tipos de `@sentry/browser` cambiaron (V42): ajustar las dos interfaces de `src/lib/sentry.ts` a los tipos `ErrorEvent` y `Breadcrumb` que exporte el paquete, sin cambiar la lógica.

- [ ] **Step 9: Ver que el build sin Supabase falla**

Run:
```bash
VITE_SUPABASE_URL= npx vite build --mode sin-supabase; echo "salida: $?"
```
Expected: el build corta con `Falta VITE_SUPABASE_URL: sin ella no se puede armar la CSP de _headers.` y `salida: 1`. (Las variables del proceso le ganan a los archivos `.env` en `loadEnv`; la vacía cuenta como ausente.) Después, `npm run build` para dejar `dist` bien.

- [ ] **Step 10: Probar `_headers` y la CSP en local con wrangler (V1, V47, V48)**

Run, en una terminal de Git Bash (queda corriendo):
```bash
npx wrangler dev --port 8787
```
Y en otra:
```bash
cd "/c/Users/felipe/Desktop/app negocios"
curl -sI http://localhost:8787/una-ruta-que-no-existe | grep -i -E "^(HTTP|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)"
curl -sI http://localhost:8787/ | grep -i -c "content-security-policy"
curl -s http://localhost:8787/_headers | head -c 15; echo
```
Expected: la primera muestra `HTTP/1.1 200 OK` (fallback SPA) y las cuatro líneas de headers; la segunda, `1`; la tercera, `<!doctype html>` (el archivo `_headers` no se publica: la ruta cae en el fallback). Si las líneas de headers no aparecen en local, anotarlo: puede ser que `wrangler dev` no aplique `_headers` (V1 sigue abierta) y la prueba que vale es la del proyecto hospedado (checklist, paso D10).

Después, con Supabase local corriendo, abrir `http://localhost:8787/` en Chrome con DevTools (consola abierta), entrar con la cuenta caja de la tarea 17, abrir turno, escanear, cobrar y confirmar una venta. Expected: ningún mensaje `Refused to …` de CSP en la consola (V47). Cortar `wrangler dev` con Ctrl+C.

- [ ] **Step 11: Configurar Playwright**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY de Supabase LOCAL (tarea 4, .env.integracion.local).
// Los usan preparar.ts y las pruebas (en Node); nunca llegan al navegador. Las variables ya puestas ganan.
Object.assign(process.env, { ...loadEnv('integracion', process.cwd(), 'SUPABASE_'), ...process.env })

const PUERTO = 4173

export default defineConfig({
  testDir: './tests/e2e',
  // Ruta en texto: testConfig.globalSetup acepta "string | Array<string>" (V8 de la parte 1, verificada).
  globalSetup: './tests/e2e/preparar.ts',
  // Un kiosco compartido y una prueba que apaga el fiado: de a una y en orden.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PUERTO}`,
    // Las trazas guardan lo tipeado (contraseñas de prueba generadas en cada corrida): quedan en test-results/,
    // que no va al repo (.gitignore de la tarea 0).
    trace: 'retain-on-failure',
  },
  webServer: {
    // Modo e2e: Vite lee .env y .env.local (Supabase local) y nunca .env.production.local.
    command: `npx vite build --mode e2e && npx vite preview --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 12: Preparar el kiosco de prueba del E2E**

`tests/e2e/preparar.ts`:
```ts
import type { FullConfig } from '@playwright/test'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

/** Productos del kiosco de prueba. Dos con código (escáner) y dos sin código (grilla F2). */
export const PRODUCTOS_E2E = {
  alfajor: { nombre: 'Alfajor E2E', precio: 900, codigo: 'E2E-ALF-0001' },
  agua: { nombre: 'Agua E2E', precio: 1200, codigo: 'E2E-AGU-0002' },
  chipa: { nombre: 'Chipá E2E', precio: 500, codigo: null },
  turron: { nombre: 'Turrón E2E', precio: 300, codigo: null },
} as const

export const CLIENTE_E2E = 'Cliente E2E'
export const NOMBRE_VISIBLE_E2E = 'Kiosco E2E'

function exigir<T>(valor: T | null | undefined, error: unknown, que: string): T {
  if (error || valor === null || valor === undefined) {
    throw new Error(`preparar.ts: no se pudo crear ${que}: ${JSON.stringify(error)}`)
  }
  return valor
}

/**
 * Kiosco nuevo en Supabase LOCAL con caja y jefe, config, productos con y sin código, un cliente de fiado
 * y una venta de ayer (para la anulación del jefe). Usa la service role local de tests/soporte/admin.ts.
 * Las credenciales (emails y contraseñas al azar) viven sólo en process.env durante la corrida: nunca en el repo.
 */
export default async function preparar(_config: FullConfig): Promise<void> {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? '')) {
    throw new Error('El E2E corre sólo contra Supabase local (SUPABASE_URL de .env.integracion.local).')
  }
  const kiosco = await crearKioscoDePrueba(`Kiosco E2E ${new Date().toISOString()}`)
  const admin = clienteAdmin()
  const negocioId = kiosco.negocioId
  const cajaId = kiosco.caja.usuarioId

  const config = await admin
    .from('config_negocio')
    .insert({ negocio_id: negocioId, nombre_visible: NOMBRE_VISIBLE_E2E, color_primario: '#2e7d32' })
  exigir(config.error ? null : true, config.error, 'la config del negocio')

  const productos = await admin
    .from('productos')
    .insert(
      Object.values(PRODUCTOS_E2E).map((p) => ({
        negocio_id: negocioId,
        nombre: p.nombre,
        precio: p.precio,
        codigo_barras: p.codigo,
      })),
    )
    .select('id, nombre')
  const filas = exigir(productos.data, productos.error, 'los productos')
  const alfajorId = exigir(
    filas.find((p) => p.nombre === PRODUCTOS_E2E.alfajor.nombre)?.id as string | undefined,
    null,
    'el alfajor',
  )

  const cliente = await admin.from('clientes').insert({ negocio_id: negocioId, nombre: CLIENTE_E2E }).select('id').single()
  const clienteId = exigir(cliente.data?.id as string | undefined, cliente.error, 'el cliente de fiado')

  // Venta de ayer, insertada directo con la service role: confirmar_venta siempre fecha con now().
  // El trigger de la tarea 3 sólo impide update y delete; insertar se puede (V44).
  const ayer = Date.now() - 24 * 60 * 60 * 1000
  const dispositivoAyer = crypto.randomUUID()
  const turnoAyer = crypto.randomUUID()
  const ventaAyer = crypto.randomUUID()

  const pc = await admin.from('dispositivos').insert({
    id: dispositivoAyer,
    negocio_id: negocioId,
    prefijo: 'A',
    ultimo_numero: 1,
    creado_por: cajaId,
  })
  exigir(pc.error ? null : true, pc.error, 'la PC de ayer')

  const turno = await admin.from('turnos').insert({
    id: turnoAyer,
    negocio_id: negocioId,
    dispositivo_id: dispositivoAyer,
    cuenta_id: cajaId,
    apertura: new Date(ayer - 60 * 60 * 1000).toISOString(),
    cierre: new Date(ayer + 60 * 60 * 1000).toISOString(),
    cierre_cuenta_id: cajaId,
  })
  exigir(turno.error ? null : true, turno.error, 'el turno de ayer')

  const venta = await admin.from('ventas').insert({
    id: ventaAyer,
    negocio_id: negocioId,
    dispositivo_id: dispositivoAyer,
    cuenta_id: cajaId,
    turno_id: turnoAyer,
    numero: 1,
    fecha: new Date(ayer).toISOString(),
    total: PRODUCTOS_E2E.alfajor.precio,
    hash_contenido: 'e'.repeat(64),
  })
  exigir(venta.error ? null : true, venta.error, 'la venta de ayer')

  const linea = await admin.from('lineas_venta').insert({
    negocio_id: negocioId,
    venta_id: ventaAyer,
    producto_id: alfajorId,
    cantidad: 1,
    precio_unitario: PRODUCTOS_E2E.alfajor.precio,
  })
  exigir(linea.error ? null : true, linea.error, 'la línea de la venta de ayer')

  const pago = await admin.from('pagos_venta').insert({
    negocio_id: negocioId,
    venta_id: ventaAyer,
    medio: 'efectivo',
    importe: PRODUCTOS_E2E.alfajor.precio,
  })
  exigir(pago.error ? null : true, pago.error, 'el pago de la venta de ayer')

  // "environment variables which are set in globalSetup are only available inside test()" (doc de Playwright).
  Object.assign(process.env, {
    E2E_NEGOCIO_ID: negocioId,
    E2E_CAJA_EMAIL: kiosco.caja.email,
    E2E_CAJA_PASSWORD: kiosco.caja.password,
    E2E_JEFE_EMAIL: kiosco.jefe.email,
    E2E_JEFE_PASSWORD: kiosco.jefe.password,
    E2E_CLIENTE_ID: clienteId,
    E2E_ALFAJOR_ID: alfajorId,
    E2E_VENTA_AYER_ID: ventaAyer,
    E2E_DISPOSITIVO_AYER_ID: dispositivoAyer,
  })
}
```

La PC de ayer toma el prefijo `A`. Cada prueba del E2E abre un contexto de navegador nuevo, o sea una PC nueva: `registrar_dispositivo` cuenta las PCs del kiosco y le da `B`, `C`, … (tarea 8). Por eso las pruebas buscan `PC [A-Z]+` y no una letra fija.

- [ ] **Step 13: Commit de la mitad de despliegue (sólo con OK de Felipe)**

```bash
git add src/lib/sentry.ts src/lib/sentry.test.ts config wrangler.jsonc vite.config.ts src/main.tsx src/vite-env.d.ts .env.example package.json package-lock.json playwright.config.ts tests/e2e/preparar.ts
git commit -m "feat: sentry sin datos personales, csp en _headers y wrangler" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 14: Escribir las pruebas E2E**

Usan las etiquetas que fijaron las partes 3 y 4: `Email`, `Contraseña`, `Entrar`; `Caja · PC X` / `Jefe · PC X`; navegación `Secciones`; `Abrir turno`; campo `Escanear o buscar`; tabla `Venta`; botón `Cobrar $…`; región `Cobro` con `Efectivo`, `Tarjeta`, `Entrega en efectivo` y `Confirmar`; región `Comprobante`; `Sin código (F2)` y grupo `Grilla sin código`; formulario `Alta rápida de producto` con `Nombre`, `Precio` y `Guardar y agregar`; casilla `Fiado activo`; tablas `Cobrado` y `Ventas`; botón `Anular A-000001`, formulario `Anular venta` con `Motivo` y `Confirmar anulación`.

`tests/e2e/venta.spec.ts`:
```ts
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { clienteAdmin, iniciarSesion } from '../soporte/admin'
import { NOMBRE_VISIBLE_E2E, PRODUCTOS_E2E } from './preparar'

type Rol = 'caja' | 'jefe'

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: la pone tests/e2e/preparar.ts`)
  return valor
}

const negocioId = () => variable('E2E_NEGOCIO_ID')
const credenciales = (rol: Rol) => {
  const ROL = rol.toUpperCase()
  return { email: variable(`E2E_${ROL}_EMAIL`), password: variable(`E2E_${ROL}_PASSWORD`) }
}

/** Otro contexto de navegador = otra PC (otro localStorage, otro id de dispositivo). */
async function nuevaPc(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  return contexto.newPage()
}

async function entrar(page: Page, rol: Rol): Promise<void> {
  const { email, password } = credenciales(rol)
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText(new RegExp(`^${rol === 'jefe' ? 'Jefe' : 'Caja'} · PC [A-Z]+$`))).toBeVisible()
}

async function irA(page: Page, seccion: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: seccion, exact: true }).click()
}

const campo = (page: Page) => page.getByLabel('Escanear o buscar')

/** Espera a que la caché Dexie tenga el catálogo: la búsqueda por nombre (tipeo lento) encuentra el alfajor. */
async function esperarCatalogo(page: Page): Promise<void> {
  await expect(async () => {
    await campo(page).fill('')
    await campo(page).pressSequentially('alfa', { delay: 120 })
    await expect(page.getByRole('option', { name: /Alfajor E2E/ })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await campo(page).fill('')
}

async function abrirTurno(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Abrir turno' }).click()
  await expect(campo(page)).toBeVisible()
  await esperarCatalogo(page)
}

/** Como el escáner USB: caracteres seguidos, sin pausa, y Enter (spec sección 6; V45). */
async function escanear(page: Page, codigo: string): Promise<void> {
  await campo(page).focus()
  await page.keyboard.type(codigo)
  await page.keyboard.press('Enter')
}

const lineaVenta = (page: Page, nombre: string) =>
  page.getByRole('table', { name: 'Venta' }).getByRole('row', { name: new RegExp(nombre) })

async function cobrar(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Cobrar/ }).click()
  const cobro = page.getByRole('region', { name: 'Cobro' })
  await expect(cobro).toBeVisible()
  return cobro
}

const comprobante = (page: Page) => page.getByRole('region', { name: 'Comprobante' })

async function idDeLaPc(page: Page): Promise<string> {
  const id = await page.evaluate((n) => localStorage.getItem(`dispositivo-id:${n}`), negocioId())
  if (!id) throw new Error('La PC no tiene id en localStorage')
  return id
}

/** Ventas grabadas desde una PC, leídas con la service role local (la verdad está en la base). */
async function ventasDeLaPc(dispositivoId: string): Promise<{ id: string; numero: number }[]> {
  const { data, error } = await clienteAdmin().from('ventas').select('id, numero').eq('dispositivo_id', dispositivoId)
  if (error) throw error
  return (data ?? []) as { id: string; numero: number }[]
}

/** Día operativo en Buenos Aires, en formato AAAA-MM-DD. */
function diaOperativo(diasAtras: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
  )
}

/** "$1.200" → 1200; "-$900" → -900. */
function pesos(texto: string | null): number {
  return Number((texto ?? '').replace(/[^\d-]/g, ''))
}

async function importe(tabla: Locator, fila: string): Promise<number> {
  const celda = tabla.locator('tr', { has: tabla.page().locator('th', { hasText: new RegExp(`^${fila}$`) }) }).locator('td')
  return pesos(await celda.textContent())
}

test('1. la caja abre turno, escanea, cobra en efectivo con vuelto y ve el comprobante', async ({ page }) => {
  await entrar(page, 'caja')
  await expect(page.getByText(NOMBRE_VISIBLE_E2E, { exact: true })).toBeVisible()
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  await expect(lineaVenta(page, 'Alfajor E2E')).toContainText('$900')
  const cobro = await cobrar(page)
  await cobro.getByLabel('Entrega en efectivo').fill('2000')
  await expect(cobro.locator('.vuelto')).toHaveText('Vuelto: $1.100')
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page).getByRole('heading', { name: /^Venta [A-Z]+-\d{6}$/ })).toBeVisible()
  await expect(comprobante(page)).toContainText('1 × Alfajor E2E')
  await expect(comprobante(page)).toContainText('Vuelto $1.100')
  expect(await ventasDeLaPc(await idDeLaPc(page))).toHaveLength(1)
})

test('2. código inexistente: alta rápida, entra a la venta y queda "creado en caja"', async ({ page }) => {
  const codigo = `E2E-NUEVO-${Date.now()}`
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, codigo)
  const alta = page.getByRole('form', { name: 'Alta rápida de producto' })
  await expect(alta).toBeVisible()
  await alta.getByLabel('Nombre').fill('Producto nuevo E2E')
  await alta.getByLabel('Precio').fill('750')
  await alta.getByRole('button', { name: 'Guardar y agregar' }).click()
  await expect(lineaVenta(page, 'Producto nuevo E2E')).toContainText('$750')
  const { data, error } = await clienteAdmin()
    .from('productos')
    .select('nombre, precio, creado_en_caja')
    .eq('negocio_id', negocioId())
    .eq('codigo_barras', codigo)
    .single()
  expect(error).toBeNull()
  expect(data).toEqual({ nombre: 'Producto nuevo E2E', precio: 750, creado_en_caja: true })
})

test('3. F2: dos toques en un producto sin código suman 2 y el foco queda en el campo', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await campo(page).focus()
  await page.keyboard.press('F2')
  const grilla = page.getByRole('group', { name: 'Grilla sin código' })
  await expect(grilla).toBeVisible()
  const chipa = grilla.getByRole('button', { name: /Chipá E2E/ })
  await chipa.click()
  await chipa.click()
  await expect(lineaVenta(page, 'Chipá E2E')).toContainText('$1.000')
  await expect(campo(page)).toBeFocused()
  await expect(grilla).toBeVisible()
})

test('4. el jefe apaga el fiado: la caja no lo ofrece y la base rechaza un pago fiado', async ({ page, browser }) => {
  const jefeApi = await iniciarSesion(credenciales('jefe').email, credenciales('jefe').password)
  try {
    await entrar(page, 'jefe')
    await irA(page, 'Módulo fiado')
    const interruptor = page.getByRole('checkbox', { name: 'Fiado activo' })
    await expect(interruptor).toBeChecked()
    await interruptor.uncheck()
    await expect(interruptor).not.toBeChecked()

    // La caja, en otra PC, ya no ve el medio fiado.
    const caja = await nuevaPc(browser)
    await entrar(caja, 'caja')
    await abrirTurno(caja)
    await escanear(caja, PRODUCTOS_E2E.alfajor.codigo)
    const cobro = await cobrar(caja)
    await expect(cobro.getByLabel('Efectivo', { exact: true })).toBeVisible()
    await expect(cobro.getByLabel('Fiado', { exact: true })).toHaveCount(0)
    await caja.context().close()

    // La base lo rechaza aunque una pantalla lo mostrara (spec sección 5b).
    const cajaApi = await iniciarSesion(credenciales('caja').email, credenciales('caja').password)
    const pc = crypto.randomUUID()
    expect((await cajaApi.rpc('registrar_dispositivo', { p_dispositivo_id: pc })).error).toBeNull()
    expect((await cajaApi.rpc('abrir_turno', { p_dispositivo_id: pc })).error).toBeNull()
    const { error } = await cajaApi.rpc('confirmar_venta', {
      p_venta_id: crypto.randomUUID(),
      p_dispositivo_id: pc,
      p_lineas: [{ producto_id: variable('E2E_ALFAJOR_ID'), cantidad: 1, precio_visto: PRODUCTOS_E2E.alfajor.precio }],
      p_pagos: [{ medio: 'fiado', importe: PRODUCTOS_E2E.alfajor.precio, cliente_id: variable('E2E_CLIENTE_ID') }],
      p_total: PRODUCTOS_E2E.alfajor.precio,
      p_efectivo_entregado: null,
    })
    expect(error?.message).toBe('fiado_deshabilitado')
  } finally {
    // Deja el kiosco como estaba para las pruebas siguientes.
    const { error } = await jefeApi.rpc('cambiar_modulo_fiado', { p_activo: true })
    expect(error).toBeNull()
  }
})

test('5. el jefe anula una venta de ayer con motivo; la caja no puede', async ({ page, browser }) => {
  const ventaAyer = variable('E2E_VENTA_AYER_ID')

  // La caja: su caja del día es sólo de hoy y la base le rechaza la venta de ayer.
  const caja = await nuevaPc(browser)
  await entrar(caja, 'caja')
  await irA(caja, 'Caja del día')
  await expect(caja.getByText(`Hoy (${diaOperativo(0)})`)).toBeVisible()
  await expect(caja.getByLabel('Fecha')).toHaveCount(0)
  await expect(caja.getByRole('button', { name: 'Anular A-000001' })).toHaveCount(0)
  await caja.context().close()
  const cajaApi = await iniciarSesion(credenciales('caja').email, credenciales('caja').password)
  const rechazo = await cajaApi.rpc('anular_venta', {
    p_venta_id: ventaAyer,
    p_dispositivo_id: variable('E2E_DISPOSITIVO_AYER_ID'),
    p_motivo: 'Intento de la caja',
  })
  expect(rechazo.error?.message).toBe('fuera_de_dia')

  // El jefe: elige ayer, anula con motivo; la venta queda anulada y no se borra.
  await entrar(page, 'jefe')
  await irA(page, 'Caja del día')
  await page.getByLabel('Fecha').fill(diaOperativo(1))
  await page.getByRole('button', { name: 'Anular A-000001' }).click()
  const anular = page.getByRole('form', { name: 'Anular venta' })
  await anular.getByLabel('Motivo').fill('Prueba E2E: el cliente devolvió el producto')
  await anular.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(page.getByRole('table', { name: 'Ventas' }).getByRole('row', { name: /A-000001/ })).toContainText('Anulada')

  const anulaciones = await clienteAdmin().from('anulaciones').select('motivo').eq('venta_id', ventaAyer)
  expect(anulaciones.data).toEqual([{ motivo: 'Prueba E2E: el cliente devolvió el producto' }])
  const ventas = await clienteAdmin().from('ventas').select('id').eq('id', ventaAyer)
  expect(ventas.data).toHaveLength(1)
})

test('6. la caja del día muestra los totales por medio de pago', async ({ page }) => {
  await entrar(page, 'caja')
  await irA(page, 'Caja del día')
  const cobrado = page.getByRole('table', { name: 'Cobrado' })
  await expect(cobrado).toBeVisible()
  const antes = { tarjeta: await importe(cobrado, 'Tarjeta'), total: await importe(cobrado, 'Total cobrado') }

  await irA(page, 'Caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.agua.codigo)
  const cobro = await cobrar(page)
  await cobro.getByLabel('Efectivo', { exact: true }).fill('')
  await cobro.getByLabel('Tarjeta', { exact: true }).fill(String(PRODUCTOS_E2E.agua.precio))
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page)).toBeVisible()
  await page.getByRole('button', { name: 'Nueva venta' }).click()

  await irA(page, 'Caja del día')
  await expect(cobrado).toBeVisible()
  await expect.poll(() => importe(cobrado, 'Tarjeta')).toBe(antes.tarjeta + PRODUCTOS_E2E.agua.precio)
  expect(await importe(cobrado, 'Total cobrado')).toBe(antes.total + PRODUCTOS_E2E.agua.precio)
  await expect(page.getByRole('region', { name: 'Fiado' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Anulaciones' })).toBeVisible()
})

test('7. sin red al confirmar: aviso, reintento con el mismo id y una sola venta', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  const cobro = await cobrar(page)

  const ids: string[] = []
  let cortes = 0
  await page.route('**/rest/v1/rpc/confirmar_venta', async (route) => {
    ids.push((route.request().postDataJSON() as { p_venta_id: string }).p_venta_id)
    if (cortes === 0) {
      cortes++
      // El peor corte de Wi-Fi: la base graba la venta, pero la respuesta no llega (V46).
      await route.fetch()
      await route.abort('internetdisconnected')
      return
    }
    await route.continue()
  })

  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(cobro.getByRole('alert')).toContainText('No se pudo confirmar')
  await expect(lineaVenta(page, 'Alfajor E2E')).toBeVisible()
  await cobro.getByRole('button', { name: 'Confirmar' }).click()
  await expect(comprobante(page)).toContainText('Esta venta ya estaba grabada: no se duplicó.')

  expect(ids).toHaveLength(2)
  expect(ids[1]).toBe(ids[0])
  const ventas = await ventasDeLaPc(await idDeLaPc(page))
  expect(ventas.map((v) => v.id)).toEqual([ids[0]])
})

test('8. doble clic en Confirmar deja una sola venta', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  await escanear(page, PRODUCTOS_E2E.alfajor.codigo)
  const cobro = await cobrar(page)
  await cobro.getByRole('button', { name: 'Confirmar' }).dblclick()
  await expect(comprobante(page)).toBeVisible()
  expect(await ventasDeLaPc(await idDeLaPc(page))).toHaveLength(1)
})

test('9. dos pestañas de la misma PC confirman a la vez sin repetir número', async ({ page }) => {
  await entrar(page, 'caja')
  await abrirTurno(page)
  const otra = await page.context().newPage()
  await otra.goto('/')
  await expect(otra.getByText(/^Caja · PC [A-Z]+$/)).toBeVisible()
  await expect(campo(otra)).toBeVisible()
  await esperarCatalogo(otra)
  expect(await idDeLaPc(otra)).toBe(await idDeLaPc(page))

  for (const pestaña of [page, otra]) {
    await escanear(pestaña, PRODUCTOS_E2E.alfajor.codigo)
    await cobrar(pestaña)
  }
  await Promise.all(
    [page, otra].map((pestaña) =>
      pestaña.getByRole('region', { name: 'Cobro' }).getByRole('button', { name: 'Confirmar' }).click(),
    ),
  )
  const titulos = await Promise.all(
    [page, otra].map(async (pestaña) => {
      const titulo = comprobante(pestaña).getByRole('heading')
      await expect(titulo).toBeVisible()
      return titulo.textContent()
    }),
  )
  expect(titulos[0]).not.toBe(titulos[1])
  const ventas = await ventasDeLaPc(await idDeLaPc(page))
  expect(ventas).toHaveLength(2)
  expect(new Set(ventas.map((v) => v.numero)).size).toBe(2)
})
```

- [ ] **Step 15: Correr el E2E**

Run:
```bash
npx supabase status
npm run test:e2e
```
Expected: `supabase status` muestra `API URL: http://127.0.0.1:54321` (si no, `npx supabase start`); Playwright arma el build en modo `e2e`, levanta `vite preview` en el puerto 4173, corre `preparar.ts` y termina con `9 passed`. Si falla:
- `preparar.ts` con `permission denied for table ventas` (o `turnos`, `dispositivos`): la service role no tiene `insert` (V44). Agregar en una migración nueva `grant insert on public.dispositivos, public.turnos, public.ventas, public.lineas_venta, public.pagos_venta to service_role;` sólo si Felipe lo aprueba, o crear la venta de ayer por `confirmar_venta` y moverla de fecha no es posible (las ventas no se editan): en ese caso la prueba 5 se corre a mano con una venta real del día anterior.
- Prueba 1 o 2 sin línea en la venta (el código fue a la búsqueda por nombre): `keyboard.type` mandó las teclas más lento que el umbral de escaneo (V45). Ver la pantalla `Calibrar escáner` con la misma secuencia; no subir el umbral de la app por el E2E.
- Prueba 7 sin aviso (aparece directo el comprobante): supabase-js reintentó solo o el error no llegó como `error_red` (V5 y V46).
- Import de `../soporte/admin` o de `./preparar` sin resolver: ver V50.
- Para ver qué pasó: `npx playwright show-trace test-results/<carpeta de la prueba>/trace.zip`.

- [ ] **Step 16: Correr todo una última vez**

Run:
```bash
npx tsc --noEmit
npm test
npx supabase test db
npm run test:integracion
npm run test:e2e
npm run build
```
Expected: `tsc` sin salida; Vitest, pgTAP, integración y E2E sin fallas (`All tests successful.` y `Result: PASS` en pgTAP, `9 passed` en E2E); el build termina con `✓ built in` y deja `dist/_headers`.

- [ ] **Step 17: Checklist de despliegue (lo hace Felipe; cada paso con su verificación)**

Todos los comandos, en Git Bash. Antes de empezar, en la terminal (la anon key es pública: es la que va en el navegador):
```bash
cd "/c/Users/felipe/Desktop/app negocios"
read -r -p "URL del proyecto (https://<ref>.supabase.co): " SUPABASE_URL
read -r -p "anon key del proyecto: " ANON_KEY
read -r -p "dominio, o <nombre>.<subdominio>.workers.dev, sin https:// : " DOMINIO
```

- [ ] **D1. Proyecto de Supabase en plan Free mientras se desarrolla; plan Pro con backups diarios antes de cargar datos reales del primer kiosco (no al primer pago).** Crear el proyecto en el panel de Supabase (región São Paulo, la más cercana). Verificación:
  ```bash
  npx supabase login
  npx supabase projects list
  ```
  Esperado: el proyecto aparece con su `REFERENCE ID`. Antes del primer dato real: Billing muestra Pro y Database → Backups lista un backup diario (spec sección 15: que Free no los incluya y Pro sí está sin verificar; costo no verificado).

- [ ] **D2. Registro público apagado en el proyecto hospedado (V4 y V10 de la parte 1).** Authentication → Sign In / Providers → apagar "Allow new users to sign up". Verificación:
  ```bash
  curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"email":"intruso-prueba@example.com","password":"Intruso-Prueba-123456"}'
  ```
  Esperado: un error con `signup_disabled` ("Signups not allowed for this instance"; el texto exacto puede variar, V4) y ningún `access_token`. Si devuelve un usuario, el registro está abierto: borrar ese usuario en Authentication → Users y repetir. V10 (cierre remoto de sesiones): con la cuenta caja de prueba abierta en un navegador, cambiarle la contraseña desde Authentication → Users y anotar si la app sigue operando pasada 1 hora (vence el token). Hasta verificarlo, no asumir que cambiar la contraseña corta una sesión abierta (V52).

- [ ] **D3. Site URL y redirects de Auth.** Authentication → URL Configuration: Site URL `https://$DOMINIO` y Redirect URLs `https://$DOMINIO/**`. No hay correos automáticos (decisión 32), pero así ningún enlace de Supabase apunta a `localhost`. Verificación: `echo "https://$DOMINIO"` coincide con lo guardado en esa pantalla. Repetir cuando cambie el dominio (D9).

- [ ] **D4. Migraciones en el proyecto hospedado.** Verificación:
  ```bash
  npx supabase link --project-ref <REFERENCE ID de D1>
  npx supabase db push
  npx supabase migration list
  ```
  Esperado: `link` pide la contraseña de la base y termina con `Finished supabase link.`; `db push` lista las 16 migraciones de `supabase/migrations` (de `20261019120000_esquema_base.sql` a `20261019121800_version_minima.sql`), pide confirmar y termina sin errores; `migration list` muestra cada una con la misma marca en `Local` y en `Remote`.

- [ ] **D5. Hook de token configurado con la función verificada (V3 de la parte 1).** Authentication → Hooks → Custom Access Token → tipo Postgres, esquema `public`, función `custom_access_token_hook`. Si el panel no ofrece el hook en el plan del proyecto, frenar acá (spec sección 15). Verificación, después de D6:
  ```bash
  read -r -p "email de la caja: " EMAIL_CAJA; read -r -s -p "contraseña de la caja: " PASS_CAJA; echo
  curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_CAJA\",\"password\":\"$PASS_CAJA\"}" | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const t=JSON.parse(s).access_token;console.log(t?JSON.parse(Buffer.from(t.split(".")[1],"base64url")).negocio_id:s)})'
  unset PASS_CAJA
  ```
  Esperado: imprime el uuid del negocio de esa cuenta. Si imprime un JSON de error o `undefined`, el hook no está activo o no lee `cuentas` (V14).

- [ ] **D6. Cuentas de caja y de jefe con contraseña fuerte.** Authentication → Providers → Email: mínimo de contraseña 12 caracteres (spec sección 15). Generar cada contraseña con:
  ```bash
  node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))"
  ```
  Authentication → Users → Add user → Create new user (email, contraseña generada, "Auto Confirm User"), una vez para la caja y otra para el jefe. Después, en el SQL Editor:
  ```sql
  insert into public.negocios (nombre) values ('<nombre del kiosco>') returning id;
  insert into public.cuentas (usuario_id, negocio_id, rol) values
    ('<id del usuario caja>', '<id del negocio>', 'caja'),
    ('<id del usuario jefe>', '<id del negocio>', 'jefe');
  ```
  Verificación (SQL Editor):
  ```sql
  select n.nombre, c.rol, u.email
  from public.cuentas c
  join public.negocios n on n.id = c.negocio_id
  join auth.users u on u.id = c.usuario_id
  order by n.nombre, c.rol;
  ```
  Esperado: dos filas por kiosco, `caja` y `jefe`. Las contraseñas se entregan al kiosco por un canal privado, nunca por el mismo chat que el email. Recuperación de contraseña (decisión 32): Felipe le pone una nueva desde Authentication → Users; si el panel no lo permite, con la Admin API de Supabase desde su PC (V51).

- [ ] **D7. Config visual y módulos cargados desde Studio.** SQL Editor:
  ```sql
  insert into public.config_negocio (negocio_id, nombre_visible, color_primario)
  values ('<id del negocio>', '<nombre que ve el kiosco>', '#1f4e79');
  ```
  El logo, si hay, se sube a un bucket público de Supabase Storage y su URL va en `logo_url` (la CSP sólo deja cargar imágenes de ese origen, tarea 18). Fiado viene activo por defecto (tabla `modulos`); lo apaga el jefe desde la app (decisión 39). Verificación:
  ```sql
  select negocio_id, nombre_visible, logo_url, color_primario from public.config_negocio;
  select clave, activo_por_defecto from public.modulos;
  ```
  Esperado: la fila del kiosco; `fiado | true`.

- [ ] **D8. Build y `npx wrangler deploy`.** Antes del primer build: `npm version 1.0.0 --no-git-tag-version`. Crear `.env.production.local` (no va al repo: lo cubre `.env.*` de la tarea 0) con:
  ```dotenv
  VITE_SUPABASE_URL=https://<ref>.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key del proyecto>
  VITE_SENTRY_DSN=
  ```
  Verificación:
  ```bash
  git status --short .env.production.local
  npm run build
  grep -o "connect-src[^;]*" dist/_headers
  npx wrangler login
  npx wrangler deploy
  ```
  Esperado: `git status` no imprime nada; el build termina con `✓ built in`; el `grep` muestra `connect-src 'self' https://<ref>.supabase.co`; `wrangler deploy` termina con `Uploaded venta-y-cobro` y la URL `https://venta-y-cobro.<subdominio>.workers.dev`. Desde el segundo despliegue alcanza con `npm run deploy`.

- [ ] **D9. Dominio .com.ar, cuando esté decidido (costo no verificado).** Registrarlo en NIC Argentina, pasar su DNS a Cloudflare y sumar a `wrangler.jsonc`, después de `"compatibility_date"`:
  ```jsonc
  "routes": [{ "pattern": "<dominio>.com.ar", "custom_domain": true }],
  ```
  Verificación:
  ```bash
  npx wrangler deploy
  curl -sI "https://$DOMINIO/" | head -1
  ```
  Esperado: `HTTP/2 200`. Repetir D3 con el dominio nuevo.

- [ ] **D10. `_headers` aplicado, también en el fallback SPA (V1 de la parte 1).** Verificación:
  ```bash
  curl -sI "https://$DOMINIO/una-ruta-que-no-existe" | grep -i -E "^(HTTP|content-security-policy|x-content-type-options|referrer-policy|permissions-policy)"
  curl -sI "https://$DOMINIO/" | grep -i -c "content-security-policy"
  curl -s "https://$DOMINIO/_headers" | head -c 15; echo
  ```
  Esperado: `HTTP/2 200` y las cuatro líneas de headers; `1`; `<!doctype html>` (el archivo `_headers` no se publica, V48). Si la ruta inexistente responde sin `content-security-policy`, V1 da negativo: no publicar para kioscos hasta que Felipe decida el plan B (CSP también en un `<meta http-equiv>` de `index.html`, que no admite `frame-ancestors`, o un Worker que ponga los headers).

- [ ] **D11. Sentry DSN.** Crear un proyecto "Browser JavaScript" en Sentry (plan Developer; costo no verificado). En Settings → Security & Privacy del proyecto: "Data Scrubber" y "Use Default Scrubbers" prendidos, "Prevent Storing of IP Addresses" prendido. Poner el DSN en `VITE_SENTRY_DSN` de `.env.production.local`. Verificación:
  ```bash
  npm run deploy
  grep -o "connect-src[^;]*" dist/_headers
  ```
  Esperado: el `grep` suma `https://o<org>.ingest.<región>.sentry.io` (sin la clave). Después, en la app publicada, en la consola de DevTools: `setTimeout(() => { throw new Error('prueba-sentry-despliegue') })`. En Sentry → Issues aparece el error en menos de un minuto, sin usuario ni IP, y con migas sólo de red y navegación (V43).

- [ ] **D12. Restaurar un backup en un proyecto de prueba antes del primer kiosco (recomendado, no decidido).** Con plan Pro, restaurar el último backup diario en un proyecto nuevo (nunca "Restore" sobre el proyecto de producción, que lo pisa; V49). Verificación, en el SQL Editor de los dos proyectos:
  ```sql
  select (select count(*) from public.ventas) as ventas, (select count(*) from public.productos) as productos,
         (select count(*) from public.historial) as historial;
  ```
  Esperado: los mismos números (salvo lo grabado después del backup).

- [ ] **D13. 2FA en Supabase y en Cloudflare (recomendado, no decidido).** Supabase: Account → Security → Multi-Factor Authentication. Cloudflare: My Profile → Authentication → Two-Factor Authentication. Verificación: cerrar sesión en los dos paneles y volver a entrar: piden el segundo factor.

- [ ] **D14. Un cambio de precio desde Studio aparece en el historial (V12 de la parte 1).** Table Editor → `productos` → cambiar el precio de un producto de prueba. Verificación (SQL Editor):
  ```sql
  select tipo, cuenta_id, dispositivo_id, valor_anterior, valor_nuevo
  from public.historial order by fecha desc limit 1;
  ```
  Esperado: `cambio_precio`, `cuenta_id` y `dispositivo_id` vacíos, y los precios anterior y nuevo. En la app, el jefe lo ve en Historial como "Fuera de la app".

- [ ] **D15. Versión mínima en `version_app`.** En cada despliegue que tenga que obligar a recargar las pestañas viejas (por ejemplo, porque cambió una función de la base): `npm version patch --no-git-tag-version`, `npm run deploy` y recién después, en el SQL Editor, `update public.version_app set version_minima = '<versión recién publicada>', actualizado = now();`. Nunca cargar una mínima más alta que la publicada (las PCs quedan con el aviso "no la pudo cargar"). Verificación:
  ```bash
  curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/version_minima" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{}'
  ```
  Esperado: `"<versión recién publicada>"`; una pestaña abierta con la versión anterior muestra el aviso y se recarga sola en menos de 3 minutos o al volver a la pestaña.

- [ ] **D16. Revocación de funciones viejas a las 48 horas de cada cambio (spec secciones 9 y 10).** No aplica al primer despliegue. Cuando un despliegue reemplaza una función de la base por otra con nombre nuevo, 48 horas después crear `supabase/migrations/<AAAAMMDDHHMMSS>_revocar_<función vieja>.sql` con `revoke execute on function public.<función vieja>(<tipos de sus parámetros>) from authenticated;`, sacar ese nombre de la prueba 5 de `150_permisos_funciones.test.sql`, correr `npx supabase test db` en local y `npx supabase db push`. Verificación (SQL Editor del proyecto hospedado):
  ```sql
  select has_function_privilege('authenticated', 'public.<función vieja>(<tipos de sus parámetros>)', 'execute');
  ```
  Esperado: `false`.

- [ ] **D17. Consulta con abogado sobre la Ley 25.326 antes del primer kiosco (no técnico).** Roles de responsable y encargado, contrato con cada kiosco y anonimización de clientes del fiado (spec sección 15). Verificación: la conclusión queda escrita en el spec, sección 15, como pasó con la consulta al contador.

- [ ] **Step 18: Commit del E2E (sólo con OK de Felipe)**

```bash
git add tests/e2e/venta.spec.ts
git commit -m "test(e2e): flujos de venta, fiado, anulación, caja del día y concurrencia" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Nombres nuevos que define la parte 5

### Base de datos

| Archivo | Nombre | Qué es |
|---|---|---|
| `supabase/migrations/20261019121800_version_minima.sql` | tabla `public.version_app` (`id boolean` PK con `check (id)`, `version_minima text` con formato `X.Y.Z`, `actualizado timestamptz`) | Una sola fila, `'0.0.0'` al crearla. RLS; `select` para `anon` y `authenticated` (policy `version_app_select`); sin escritura desde la app. |
| `supabase/migrations/20261019121800_version_minima.sql` | `version_minima() returns text` | `security invoker`, `stable`, `search_path` vacío; EXECUTE para `anon` y `authenticated`, no para `public`. No entra en la lista de `150_permisos_funciones.test.sql` (sólo lista funciones definer). |

Sin columnas nuevas: `negocios.estado_abono` y `config_negocio` (`nombre_visible`, `logo_url`, `color_primario`) son de la tarea 3.

Cambio en una prueba existente: `supabase/tests/database/010_rls.test.sql`, prueba 1, suma `version_app` a `tables_are`.

### TypeScript y configuración

| Archivo | Exporta |
|---|---|
| `src/app/version.ts` | `ESPERA_RECARGA_MS` (3.000), `PARAMETRO_RECARGA` (`'version-minima'`), `AVISO_VERSION`, `AVISO_VERSION_TRABADA`, `leerVersion`, `compararVersiones`, `esAnterior`, `EntornoVersion` (`actual`, `leerMinima`, `url`, `avisar`, `esperar`, `recargar`), `ResultadoVersion` (`al_dia`, `recargando`, `trabada`), `revisarVersion`, `vigilarVersion`, `avisarEnPantalla`, `leerVersionMinima(supabase)`, `entornoNavegador(leerMinima)` |
| `src/negocio/config.ts` | `EstadoAbono`, `ConfigNegocio` (`nombreVisible`, `logoUrl`, `colorPrimario`), `FilaConfigNegocio`, `logoPermitido`, `aConfig`, `leerConfigNegocio(supabase, origenLogos)`, `leerEstadoAbonoNegocio(supabase)`, `aplicarConfig(config, doc?)` → función de vuelta atrás |
| `src/negocio/AvisoAbono.tsx` | `TEXTO_ABONO` (`gracia`, `suspendido`), `AvisoAbono({ estado })` |
| `src/servicios.ts` (cambio) | `Servicios` suma `leerConfig()` y `leerEstadoAbono()` |
| `src/test/servicios.ts` (cambio) | `serviciosFalsos` acepta `config` y `estadoAbono` |
| `src/Kiosco.tsx` (cambio) | mismo `Kiosco`; la barra suma logo, `nombreVisible` y `AvisoAbono` |
| `src/lib/sentry.ts` | `MigaLimpiable`, `EventoLimpiable`, `redactar`, `sinConsulta`, `limpiarMiga`, `limpiarEvento`, `iniciarSentry(dsn?, iniciar?)` |
| `config/headers.ts` | `OpcionesHeaders` (`supabaseUrl`, `sentryDsn?`), `origen`, `politicaDeContenido`, `PERMISOS`, `archivoHeaders` |
| `vite.config.ts` | define `__APP_VERSION__`; plugin `headers-cloudflare` (sólo en build) que emite `dist/_headers` |
| `src/vite-env.d.ts` | `VITE_SENTRY_DSN?`; `declare const __APP_VERSION__: string` |
| `wrangler.jsonc` | Worker `venta-y-cobro`, sólo assets: `./dist`, `not_found_handling: "single-page-application"` |
| `playwright.config.ts` | `testDir: './tests/e2e'`, `globalSetup: './tests/e2e/preparar.ts'`, `workers: 1`, `webServer` en el puerto 4173 con build `--mode e2e` |
| `tests/e2e/preparar.ts` | `PRODUCTOS_E2E`, `CLIENTE_E2E`, `NOMBRE_VISIBLE_E2E`, `default preparar(config)` |
| `package.json` (cambio) | scripts `test:e2e` y `deploy`; dependencias `@sentry/browser@10`, `wrangler`, `@playwright/test` |

Clases CSS nuevas en `src/estilos.css`: `.kiosco__barra` (borde con `--color-primario`), `.kiosco__logo`, `.aviso--version`. Se usan sin estilo propio: `.kiosco__nombre`, `.aviso-abono`.

Claves del navegador: ninguna nueva. El parámetro `?version-minima=X.Y.Z` vive en la URL, no en el almacenamiento.

Variables de entorno del E2E (sólo en `process.env` durante la corrida, puestas por `preparar.ts`): `E2E_NEGOCIO_ID`, `E2E_CAJA_EMAIL`, `E2E_CAJA_PASSWORD`, `E2E_JEFE_EMAIL`, `E2E_JEFE_PASSWORD`, `E2E_CLIENTE_ID`, `E2E_ALFAJOR_ID`, `E2E_VENTA_AYER_ID`, `E2E_DISPOSITIVO_AYER_ID`.

### Pruebas nuevas

- pgTAP: `supabase/tests/database/160_version_minima.test.sql` (17).
- Vitest: `src/app/version.test.ts` (11), `src/negocio/config.test.ts` (6), `src/negocio/AvisoAbono.test.tsx` (3), `src/Kiosco.test.tsx` (+2, queda en 9), `src/lib/sentry.test.ts` (6), `config/headers.test.ts` (6).
- Playwright: `tests/e2e/venta.spec.ts` (9).

## Verificaciones de la parte 5

Verificado contra la documentación oficial (2026-10-20):
- Playwright: `testConfig.globalSetup` es `string | Array<string>` ("Path to the global setup file"): **V8 de la parte 1 queda verificada** (ruta en texto, sin `require.resolve`). `webServer` con `command`, `url`, `reuseExistingServer`, `timeout` (60.000 por defecto). "environment variables which are set in globalSetup are only available inside test()". `route.fetch()` hace el pedido al servidor sin responder al navegador; `route.abort(errorCode)` acepta `internetdisconnected`: https://playwright.dev/docs/api/class-testconfig , https://playwright.dev/docs/test-global-setup-teardown , https://playwright.dev/docs/api/class-route
- Cloudflare: con `not_found_handling: "single-page-application"` se sirve `/index.html` con `200 OK`; `_headers` no se aplica a respuestas generadas por código de Worker; máximo 100 reglas y 2.000 caracteres por línea. Ninguna de las dos páginas dice si `_headers` se aplica al fallback SPA ni si `wrangler dev` lo aplica: **V1 sigue abierta**, con los comandos de la tarea 19, step 10 (local) y checklist D10 (hospedado). https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/ y https://developers.cloudflare.com/workers/static-assets/headers/
- Sentry: `beforeSend(event, hint)` y `beforeBreadcrumb(breadcrumb, hint)` descartan con `null`; `sendDefaultPii` está deprecado en el SDK 10 en favor de `dataCollection` y se quita en el 11; sin `dataCollection` rige `sendDefaultPii`; un `dataCollection: {}` vacío es más permisivo que `sendDefaultPii: false`: https://docs.sentry.io/platforms/javascript/configuration/options/ y https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/

| # | Qué | Dónde se usa | Cómo verificar |
|---|---|---|---|
| V1 (parte 1) | Sigue abierta: si `_headers` se aplica al fallback SPA y si `wrangler dev` lo aplica. | Tarea 19, step 10; checklist D10 | `curl -sI` a una ruta inexistente y buscar `content-security-policy` (comandos exactos en step 10 y D10). |
| V41 | Que el jsdom de Vitest soporte variables CSS en `style.setProperty('--color-primario', …)` y `getPropertyValue`. | Tarea 18, `config.test.ts` y `Kiosco.test.tsx` | Si `getPropertyValue` da `''`, cambiar esas comprobaciones por `style.cssText` (instrucción en step 14 de la tarea 18). https://github.com/jsdom/cssstyle |
| V42 | Que la versión 10 de `@sentry/browser` siga aceptando `sendDefaultPii` y que sus tipos `ErrorEvent` y `Breadcrumb` sean asignables a `EventoLimpiable` y `MigaLimpiable`. Al pasar al SDK 11, reemplazar por `dataCollection` con cada categoría en `false`. | Tarea 19, `src/lib/sentry.ts` | `npx tsc --noEmit` (step 8). https://docs.sentry.io/platforms/javascript/configuration/options/ |
| V43 | Que las migas del SDK usen las categorías `console`, `fetch`, `xhr`, `ui.click`, `ui.input` y `navigation`, y que las de `fetch` no traigan cuerpos. | Tarea 19, `limpiarMiga` | Checklist D11: el evento de prueba en Sentry muestra sólo migas de red y navegación. https://docs.sentry.io/platforms/javascript/enriching-events/breadcrumbs/ |
| V44 | Que `service_role` pueda insertar en `dispositivos`, `turnos`, `ventas`, `lineas_venta` y `pagos_venta` (la tarea 3 sólo revocó a `anon` y `authenticated`; el trigger impide `update` y `delete`, no `insert`). | Tarea 19, `tests/e2e/preparar.ts` | `npm run test:e2e`: si `preparar.ts` falla con `permission denied`, ver el step 15. https://supabase.com/docs/guides/database/postgres/roles |
| V45 | Que `page.keyboard.type` mande las teclas más rápido que el umbral de escaneo (50 ms entre caracteres, tarea 12), así el E2E escanea como el escáner real. | Tarea 19, `escanear` en `venta.spec.ts` | Pruebas 1 y 2 del E2E. https://playwright.dev/docs/api/class-keyboard |
| V46 | Que `route.fetch()` seguido de `route.abort('internetdisconnected')` llegue a supabase-js como error de red (`error_red`, V5 de la parte 1) y que supabase-js no reintente solo. | Tarea 19, prueba 7 | Prueba 7 del E2E: debe aparecer "No se pudo confirmar" antes del comprobante. https://playwright.dev/docs/api/class-route |
| V47 | Que la CSP `style-src 'self'` no bloquee los estilos que React y `aplicarConfig` ponen por CSSOM, y que el build de Vite no meta `<script>` ni `<style>` en línea en `index.html`. | Tareas 18 y 19 | Tarea 19, step 10: consola sin `Refused to …` con la app servida por `wrangler dev`. https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src |
| V48 | Que Cloudflare no publique el archivo `_headers` (pedirlo cae en el fallback SPA). | Tarea 19, step 10; checklist D10 | `curl -s .../_headers | head -c 15` debe dar `<!doctype html>`. https://developers.cloudflare.com/workers/static-assets/headers/ |
| V49 | Que el plan Pro de Supabase permita restaurar un backup diario en un proyecto nuevo (no sobre producción). | Checklist D12 | Panel de Supabase, Database → Backups, antes del primer kiosco. https://supabase.com/docs/guides/platform/backups |
| V50 | Que Playwright, con `"type": "module"`, resuelva imports TypeScript sin extensión (`../soporte/admin`, `./preparar`) y cargue `vite` (sólo ESM) desde `playwright.config.ts`. | Tarea 19, step 15 | `npm run test:e2e` falla al cargar la config o `preparar.ts` si no. https://playwright.dev/docs/test-typescript |
| V51 | Cómo pone Felipe una contraseña nueva a mano (panel de Authentication → Users o Admin API `updateUserById`), sin servicio de correo. | Checklist D6 (decisión 32) | En el proyecto hospedado, con una cuenta de prueba. https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid |
| V52 | V10 de la parte 1 sigue abierta: si cambiar la contraseña o desactivar una cuenta corta sesiones y refresh tokens ya abiertos. | Checklist D2 | Procedimiento de D2. https://supabase.com/docs/guides/auth/sessions |

## Decisiones de la parte 5

- `version_app` la leen `anon` y `authenticated` (el chequeo corre antes del login); `version_minima()` es `security invoker`.
- La recarga forzada avisa y espera 3 segundos; una venta en armado se pierde como con F5. Si después de recargar sigue vieja para esa mínima, sólo avisa (parámetro en la URL, nada en el navegador).
- El chequeo de versión reutiliza `programarSincronizacion` (al arrancar, al volver a la pestaña, cada 3 minutos).
- La config visual aplica un solo color (`color_primario`, el único de la tabla), el nombre visible en la pestaña y la barra, y el logo sólo si está en el Supabase del proyecto (por la CSP).
- El aviso de abono lo ven caja y jefe, se lee al entrar y dice "Comunicate con Felipe para regularizarlo".
- CSP sin `'unsafe-inline'` en ningún lado; `img-src` suma Supabase; se agregan `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `font-src 'self'`.
- Sentry: SDK 10 con `sendDefaultPii: false`; sólo migas de red y navegación; `contexts` sólo técnicos; emails y teléfonos tapados en mensajes (puede tapar tramos de uuids).
- El E2E corre sin CSP (`vite preview`); la CSP se prueba con `wrangler dev` y en el hospedado. La venta de ayer del E2E se inserta con la service role; el E2E apaga el fiado y lo vuelve a prender.
- Si D10 da que el fallback SPA no lleva la CSP, no se publica para kioscos hasta elegir plan B (meta CSP o Worker).
- Contraseñas de 24 caracteres generadas al azar y mínimo de 12 en Supabase Auth.

## Cobertura del spec

Tareas: 0 repo; 1 scaffold; 2 Supabase local; 3 esquema y RLS; 4 token hook; 5 cobro en TS; 6 búsqueda; 7 caché Dexie; 8 dispositivos y turnos; 9 módulo fiado y clientes; 10 `confirmar_venta`, carrito e id; 11 anulación, ranking y caja del día (SQL); 12 pantalla de caja y escáner; 13 panel F2; 14 pagos, comprobante e integración; 15 productos y precios; 16 jefe y caja del día (UI); 17 login por rol; 18 personalización, versión mínima y abono; 19 despliegue, E2E y checklist (D1 a D17).

### Decisiones de producto (spec sección 2)

| # | Decisión | Tarea(s) |
|---|---|---|
| 1 | App para varios kioscos con abono mensual cobrado fuera de la app | 3 (multi-negocio), 18 (aviso del abono). El cobro del abono no lleva código. |
| 2 | Dos cuentas por kiosco, caja y jefe; cada cuenta en un solo kiosco; las crea Felipe | 3, 4, 17, 19 (D6) |
| 3 | Modelo A: una web, un despliegue, un Supabase; aislamiento por `negocio_id` en el token y RLS | 3, 4, 10 (140), 19 (D4, D8) |
| 4 | Sólo web, sin modo offline | 10, 14, 19 (E2E 7) |
| 5 | Dexie sólo caché | 7, 10 |
| 6 | Diseño para varias PCs: UUID y prefijo por dispositivo | 3, 8 |
| 7 | Email y contraseña sin PIN; caja compartida; todo asociado a cuenta y dispositivo | 3, 8, 10, 11, 15, 17 |
| 8 | Pagos combinables, incluido fiado parcial | 5, 10, 14 |
| 9 | Tarjeta sólo se registra | 5, 14 |
| 10 | Vuelto exacto | 5, 10, 14, 19 (E2E 1) |
| 11 | Pesos enteros | 3, 5, 15 |
| 12 | Precio congelado por línea | 3, 10 |
| 13 | Campo único "Escanear o buscar" con foco | 12 |
| 14 | Enter nunca agrega una sugerencia sola | 12 |
| 15 | Botón "Sin código (F2)" con grilla por ventas recientes | 11, 13, 19 (E2E 3) |
| 16 | Fiado como módulo activo por defecto; lista y alta rápida de clientes | 3, 9, 14, 16 |
| 17 | Anulación completa, con motivo, por rol y día; idempotente; resta el día en que se anula | 11, 16, 19 (E2E 5) |
| 18 | Caja del día por medio de pago | 11, 16, 19 (E2E 6) |
| 19 | Abono: sólo aviso, nunca bloquea | 18 |
| 20 | Personalización "Ambas": config visual y módulos en la base | 3, 9, 16, 18 |
| 21 | Catálogo mínimo; se desactiva, no se borra | 3, 15 |
| 22 | La confirmación relee precios y rechaza si difieren | 10, 14 |
| 23 | Pantalla de entrada genérica | 17, 18 |
| 24 | Permisos de la caja | 3, 11, 15, 16, 17 |
| 25 | Permisos del jefe (estadísticas, v2) | 3, 11, 16, 17 |
| 26 | Turnos sin monto inicial; cierre simple con totales | 8, 17 |
| 27 | Historial de auditoría | 3, 8, 11, 15, 16 |
| 28 | Único módulo: fiado; alta y edición de productos no son módulos | 3, 9, 15 |
| 29 | Anonimización de clientes a pedido | 3, 16, 19 (D17, abogado) |
| 30 | Sin contingencia de Wi-Fi; aviso, reintento con el mismo id, doble clic | 10, 14, 19 (E2E 7 y 8) |
| 31 | F5 pierde la venta; el cajero revisa las ventas de hoy | 10 (id en memoria), 16 (ventas de hoy). **HUECO parcial:** el procedimiento para el cajero no está escrito en ninguna pantalla ni guía (sólo lo menciona el aviso de recarga de la tarea 18). |
| 32 | Sin Resend; recuperación manual; Sentry sin datos personales | 19 (Sentry; D6 y V51 para la recuperación) |
| 33 | Códigos con letras por escaneo; tipeo va a nombre | 3, 12 |
| 34 | Alta automática de dispositivos, sin tope | 8, 14 (concurrencia), 17 |
| 35 | Pantalla de precios y productos; alta en caja "creado en caja" | 15, 19 (E2E 2) |
| 36 | Sin comprobante fiscal ni ARCA | No requiere tarea (nada que construir). |
| 37 | Comprobante sólo en pantalla | 14, 19 (E2E 1) |
| 38 | Un turno por PC | 3, 8 |
| 39 | El jefe activa o desactiva el fiado desde la app | 16, 19 (E2E 4) |
| 40 | El jefe anonimiza desde la app | 16 |

### Secciones 3 a 16 del spec

| Sección | Tarea(s) |
|---|---|
| 3. Arquitectura (stack, hosting en Workers con static assets, Supabase sin Edge Functions, token hook, caché) | 1, 2, 4, 7, 19. Dominio .com.ar: 19 (D9), pendiente de decidir. Costos de Supabase Pro y Sentry: **HUECO** (ninguna tarea los verifica; D1 y D11 sólo los anotan). |
| 4. Modelo de datos y numeración | 3, 8, 9, 10, 11, 15 |
| 5. Personalización (config visual, módulos, reglas) | 3, 9, 16, 18. Desvío menor: el spec dice "colores"; la tabla de la tarea 3 tiene un solo color (`color_primario`). |
| 6. Flujo de venta y cobro | 8, 10, 12, 13, 14, 15, 19 (E2E 1 a 3) |
| 7. Turnos, anulación y caja del día | 8, 11, 16, 17, 19 (E2E 5 y 6) |
| 8. Estado de cuenta del abono | 3, 18 |
| 9. Fallas y casos borde (casos 1 a 12) | 1, 2, 7, 9: 10 y 14 (+ E2E 7 y 8); 3: ver decisión 31 (**HUECO parcial**); 4: 12; 5: 7, 10, 14; 6: 18 (versión mínima) y 19 (D15, D16); 8: 10; 10: 12, 14; 11: 10, 14, 19 (E2E 9); 12: 10, 12 |
| 10. Seguridad | 3, 4, 10 (140 y 150), 11, 15, 16, 17 (caché por negocio y borrado al salir), 18, 19 (CSP, Sentry, D2, D6, D13) |
| 11. Pruebas | Cada tarea con sus pgTAP, Vitest e integración; 14 (concurrencia real); 19 (E2E). Restaurar un backup: 19 (D12). |
| 12. Alcance del MVP | Tareas 0 a 19; lo de "Fuera del MVP" va en la sección siguiente. |
| 13. Supuestos a validar | Parte 1, "Antes de empezar" (la lista de supuestos con las tareas que tocan). |
| 14. Pendiente técnico | Umbral del escáner: 12 (calibración). Refresco de Dexie: 7. Prefijo después de Z: 8. Rendimiento del ranking: **HUECO** (ninguna tarea lo mide). |
| 15. Sin verificar | Registro público: 2, 4, 19 (D2). Cierre remoto de sesiones y corte de refresh tokens: 19 (D2, V52), sin implementar. Mecanismo "caja abierta en otra pestaña" (BroadcastChannel o Web Locks): **HUECO** (no se implementa; dos pestañas no repiten número por el bloqueo de la PC, tarea 10 y E2E 9). Dominio: 19 (D9). Costos: **HUECO** (ver sección 3). Backups Free/Pro: 19 (D1, D12). Hook en el plan: 19 (D5). Mínimo de contraseña: 19 (D6). Sentry sin datos personales: 19. Ley 25.326 y anonimización: 19 (D17). |
| 16. Registro de revisión | Informativo; no requiere tarea. |

## v2 pendiente (no se implementa en el MVP)

Del spec, sección 12 ("Fuera del MVP") y decisiones:
- Reportes y estadísticas (decisión 25).
- Saldo por cliente, cobro de deuda y recordatorios del fiado (decisión 16).
- Ticket impreso (decisión 37).
- ARCA o factura electrónica (decisión 36; el sistema es de administración).
- Stock, productos pesables y descuentos o promociones.
- Integración con posnet y Mercado Pago integrado (decisión 9).
- Modo offline y cualquier contingencia sin internet: cuaderno o cola (decisiones 4 y 30).
- PIN y cajeros identificados por persona (decisión 7).
- Correo automático (Resend) y recuperación automática de contraseña (decisión 32).
- Cobro automático del abono (decisión 1).
- Panel de admin propio: hoy Felipe usa Supabase Studio (sección 5).
- Arqueo y conteo de efectivo (decisión 26).
- Edición de ventas y anulación parcial (decisión 17).
- Favoritos y "Varios" con importe libre.
- Aviso de "caja abierta en otra pestaña" (sección 15, sin verificar el mecanismo).

## Autorrevisión

Qué revisé y qué encontré:
- **Placeholders:** búsqueda de `TBD`, `TODO`, "agregar validación", "manejar errores" y "similar a la tarea" en las partes 1 a 5: ninguna aparición. En el checklist quedan valores que completa Felipe en el momento (`<ref>`, `<id del negocio>`, `<función vieja>`): son datos de su proyecto, no diseño pendiente.
- **Nombres que usan las partes 4 y 5, y dónde se definen:** tablas `negocios` (con `estado_abono`), `config_negocio`, `cuentas`, `dispositivos`, `turnos`, `ventas`, `lineas_venta`, `pagos_venta`, `anulaciones`, `productos`, `clientes`, `historial`: tarea 3. `crearKioscoDePrueba`, `clienteAdmin`, `iniciarSesion`: tarea 4 (`tests/soporte/admin.ts`). `programarSincronizacion` e `INTERVALO_CATALOGO_MS`: tarea 7. `supabase` (`src/lib/supabase.ts`) y `cacheDeLaApp`: tarea 7. `registrar_dispositivo`, `abrir_turno` y la clave `dispositivo-id:<negocio_id>`: tarea 8. `confirmar_venta` y `fiado_deshabilitado`: tarea 10. `anular_venta` y `fuera_de_dia`: tarea 11. `alta_producto_caja` y el formulario "Alta rápida de producto": tarea 15. `cambiar_modulo_fiado`, `CajaDelDia`, `VentasDelDia` y sus etiquetas: tarea 16. `Servicios`, `crearServicios`, `serviciosFalsos`, `Kiosco`, `CUENTA_CAJA` y `armar` de `Kiosco.test.tsx`: tarea 17. Las etiquetas de las pantallas de caja, F2 y pagos: tareas 12 a 14. Los dos archivos que la tarea 18 reemplaza enteros (`Kiosco.tsx`, `main.tsx`) se copiaron de la versión actual de la tarea 17.
- **`sessionStorage` y `localStorage`:** no hay `sessionStorage` en ninguna parte. La app sólo escribe en `localStorage` la clave `dispositivo-id:<negocio_id>` (tarea 8); el E2E sólo la lee. Desvío a anotar: supabase-js guarda por defecto la sesión de Auth en `localStorage` (no son datos de ventas, el spec no lo menciona y ninguna parte lo cambia); cerrar sesión la borra (tarea 17).
- **Pantalla "Sin confirmar":** no existe. Las partes la nombran sólo para decir que no hay; un error de red deja el carrito igual y se reintenta con el mismo id (tareas 10 y 14, E2E 7).
- **Atribución:** los 18 pasos de commit de las partes 1 a 4 y los 3 de esta parte terminan con `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` (conteo de `git commit` igual al de la línea de atribución en cada parte).
- **Correcciones de la parte 4:** la sección "Correcciones a los pasos de arriba" ya no existe (búsqueda vacía de "Correcciones a los pasos" y de "no hay alta sin código"). Usé la versión nueva: `alta_producto_caja` acepta producto sin código y la pantalla de productos tiene "Agregar producto"; la cobertura de las decisiones 15 y 35 la toma.
- **Permisos de funciones:** `version_minima()` no es `security definer`, así que `150_permisos_funciones.test.sql` (trece nombres) no cambia; `010_rls.test.sql` sí cambia (tabla nueva).
- **Huecos del spec:** procedimiento para el cajero tras F5 (decisión 31, parcial); rendimiento del ranking sin medir (sección 14); mecanismo "caja abierta en otra pestaña" (sección 15); costos de Supabase Pro y Sentry sin verificar (secciones 3 y 15).
- **Desvíos del spec que quedan anotados:** `ranking_sin_codigo` es `security definer` (el spec dice invoker; decisión de la parte 3); un solo color en la config visual (sección 5 dice "colores"); la sesión de Auth en `localStorage`; la recarga forzada puede perder una venta en armado (igual que F5); el E2E no corre con CSP (se prueba aparte); cambio del módulo fiado y anonimización no van al historial (decisión de la parte 4; el spec no lo pide).

## Ejecución

- **Orden:** tareas 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 y 19, en ese orden. Varias tareas modifican archivos de tareas anteriores (por ejemplo, la 18 cambia `010_rls.test.sql`, `Kiosco.tsx` y `main.tsx`): no saltear ni reordenar.
- **Antes de programar:** cargar la skill `ponytail` (regla de Felipe en su CLAUDE.md), una vez por sesión.
- **Modo:** elegir `superpowers:subagent-driven-development` (un subagente por tarea, con revisión entre tareas; recomendado) o `superpowers:executing-plans` (en la misma sesión, por tandas con puntos de control).
- **Cierre de cada tarea:** cada tarea termina con su verificación (pruebas, tipos y build con la salida esperada) antes de pasar a la siguiente; si una salida no coincide, se para y se revisa la verificación V correspondiente.
- **Tarea 0 necesita OK de Felipe antes de empezar:** la carpeta del proyecto está dentro de un repo git del home sin commits (`C:\Users\felipe` tiene `.git`), así que `git init` en la carpeta crea un repo anidado. Decidirlo antes de tocar nada.
- **Commits:** sólo con OK de Felipe en el chat; sin OK, el paso de commit se saltea y se sigue.

