# Planes, módulos y cuenta de operador

Fecha: 2026-10-28
Estado: borrador, pendiente de aprobación de Felipe
Alcance: modelo de planes, módulos por kiosco, derecho y uso; funciones de dueño y de operador; cuenta de operador; migración de los kioscos existentes; cambios de UI y pruebas. No incluye la implementación ni la ficha de clientes (sólo cómo se aloja).

Convención: cada decisión lleva **[tomada]** (la pidió Felipe) o **[propuesta]** (recomendación nuestra, falta confirmar). Lo que afirmo del código sale de la lectura de los archivos citados. Lo que no verifiqué va marcado como **supuesto**.

## Idea

Cada función se usa o no, por kiosco. Felipe define qué incluye cada plan y qué agrega o saca a cada kiosco. El dueño (rol jefe) prende y apaga lo que su plan le permite. Algunas funciones van en planes y otras son extras o no se venden.

Cuatro piezas:

1. **Catálogo de módulos**: qué existe (`modulos`, ya existe) y qué depende de qué (`modulo_dependencias`, nueva).
2. **Planes**: qué módulos incluye cada plan (`planes` y `plan_modulos`, nuevas).
3. **Derecho del kiosco**: lo que el kiosco tiene permitido. Es su plan, más las excepciones que agrega o quita Felipe (`negocio_plan` y `excepciones_modulo`, nuevas).
4. **Uso**: prendido o apagado. Lo cambia el dueño dentro de su derecho, o Felipe desde la cuenta de operador (`modulos_negocio`, ya existe).

Un módulo funciona si tiene **derecho**, está **prendido** y **todas sus dependencias requeridas también funcionan**. La base calcula esto. La app sólo lo muestra.

Felipe pidió [tomada]: (1) todo personalizable por kiosco; (2) Felipe agrega o saca funciones por kiosco; (3) el dueño agrega o saca funciones dentro de su plan; (4) algunas funciones van en planes y otras son extras; (5) una cuenta de operador para administrar planes y módulos de todos los kioscos.

## Qué cambia respecto de decisiones anteriores

Venta-y-cobro (`docs/superpowers/specs/2026-10-19-venta-y-cobro-design.md`):

| Decisión o sección | Qué dice hoy | Qué cambia | Por qué |
|---|---|---|---|
| §5 "Reglas" (línea 160) | "La config visual y el catálogo de módulos los cambia sólo Felipe, desde Supabase Studio. No hay panel de admin propio." | Felipe administra planes y módulos desde la cuenta de operador (funciones y pantalla propia). Studio queda para emergencias y altas de kiosco. | Pedido de Felipe [tomada]. Studio no deja historial y no escala a varios kioscos. |
| §10 "Escritura por tabla" (línea 343) | `modulos` y `negocios` sólo se escriben desde Studio. | `modulos` sigue igual (catálogo, por migración). Planes, excepciones y uso se escriben por funciones de la base. | Mismo motivo. |
| Dec. 2 y 3 | Cada cuenta pertenece a un kiosco; cada login entra a su kiosco. | Vale para cuentas de kiosco. La cuenta de operador no pertenece a ningún kiosco y entra a la pantalla de operador. | Pedido de Felipe [tomada]. |
| Dec. 7 | "Las cuentas las crea Felipe" (caja o jefe). | Felipe sigue creando las cuentas. Aparece un tercer tipo, el operador, que se crea con un script de una sola vez y no desde la app. | Pedido de Felipe [tomada]. |
| Dec. 20 | Nada de copias ni `if` por negocio. | Se mantiene. Los planes son datos. | |
| Dec. 24, 25 | Permisos de caja y jefe. | Se agrega la columna operador a la matriz (ver Permisos). | |
| Dec. 27 | Historial de precio, producto, anulación y turnos. | Se amplía a módulos, planes y excepciones. Se enmienda la dec. 27. | Pedido de Felipe [tomada]: toda escritura de dueño u operador sobre módulos, planes o excepciones deja historial. |
| Dec. 39 | El jefe activa o desactiva fiado sin intervención de Felipe. | Se mantiene sólo si fiado está en todos los planes (ver decisiones abiertas). | |
| Dec. 40 | El jefe anonimiza clientes sin intervención de Felipe. | Se mantiene. La anonimización no depende de ningún módulo ni plan. | |
| Dec. 19 | El estado del abono nunca bloquea la caja. | Se mantiene. Bajar de plan apaga módulos; no corta la venta básica. No hay suspensión por plan ni por morosidad. | |
| Dec. 34 | Sin tope de PCs. | Se mantiene. Un tope por plan queda fuera de alcance. | |
| Dec. 16 | Fiado fuera del MVP en saldo y cobro. | Ya superada por el spec de módulos (ver abajo). | |
| Spec de módulos (2026-10-27) dec. 26 | Cambiada en su momento. | Sin cambio. | |
| Spec de módulos dec. 5 | Cobrar deuda de fiado funciona con el módulo apagado. | Se mantiene. | Consistente con `cobrar_fiado` sin chequeo de módulo. |
| `cambiar_modulo_fiado` (jefe.sql) | No escribe historial, a propósito. | Se reemplaza por `cambiar_modulo`, que sí escribe historial. | Dec. 27 enmendada. |

## Modelo

**Derecho** (lo que el kiosco puede tener prendido):

```
derecho(n, m) = excepción(n, m).permite                       si hay excepción
              = m ∈ plan(n)                                    si no hay excepción
```

**Uso** (lo que el dueño tiene prendido): fila en `modulos_negocio`. Si no hay fila, vale `modulos.activo_por_defecto`. Esto es igual que hoy.

**Activo**:

```
activo(n, m) = derecho(n, m) and uso(n, m)
               and for all d in requiere(m): activo(n, d)
```

Las dependencias son transitivas. Las cadenas no pueden tener ciclos.

**Integra**: no bloquea. Si el módulo `m` integra `d` y `d` está apagado, la pantalla oculta la parte que usa `d`. La función que escribe esa parte rechaza con `modulo_deshabilitado` detail `d`. La base no cae en cascada.

**Planes**: un plan es un conjunto de módulos. Cada kiosco tiene exactamente un plan. Un plan puede tener excepciones por kiosco.

**Excepciones**: son las funciones que Felipe agrega (`permite = true`, extras cobrados) o saca (`permite = false`) para un kiosco, por encima del plan. Quitar la excepción vuelve al plan.

**Módulo nuevo**: apagado en todos los kioscos existentes. Ningún plan lo incluye hasta que Felipe lo asigne. Su `activo_por_defecto` es `false`.

[tomada] Un flag que sólo oculta algo en pantalla no es seguridad. La base chequea derecho y uso en cada función.
[tomada] Los flags no van en el token (dura 1 hora). El estado se lee de la base en cada función.

## Datos

Convención del repo: RLS activo en toda tabla nueva, `grant select to authenticated` sólo cuando hace falta, escrituras por funciones `security definer` con `search_path = ''`, y sin grant para `anon`. Los UUID de alta los genera el navegador.

Excepciones a esa convención, explícitas:
- `excepciones_modulo` y `operadores` no tienen grant para `authenticated`. Se leen sólo por funciones. `excepciones_modulo` tiene motivo interno y no debe llegar a la app del kiosco. [propuesta]
- `historial` acepta `negocio_id` nulo en un caso (ver más abajo).

### Tablas existentes que cambian

**`modulos`** (catálogo, ya existe): `clave text pk` con regex `^[a-z_]{1,30}$` (`esquema_base.sql:42`), `activo_por_defecto boolean`. Ahora también `descripcion`, que ya se carga en la app (`src/modulos/modulos.ts:8`). Sin cambios de columnas. Lectura: `modulos_select` con `using (true)`.

**`modulos_negocio`** (uso, ya existe): `(negocio_id, modulo, activo)`. Sin cambios de columnas. Lectura por negocio. Escritura sólo por funciones (`cambiar_modulo`, `operador_fijar_uso`).

**`historial`** (ya existe, `esquema_base.sql:192-208`). Cambios:

- `negocio_id` pasa a nulo, con `check (negocio_id is not null or entidad = 'planes')`. Un cambio que no es de un kiosco (la definición de un plan) no tiene dueño. Sin esto, un plan sin kioscos no dejaría historial.
- Nueva columna `operador_id uuid`, **sin FK**. Motivo: si hubiera FK, dar de baja a un operador con historial sería imposible, igual que hoy con `cuenta_id` (`esquema_base.sql:23`).
- `check (cuenta_id is null or operador_id is null)`.
- `tipo` gana: `cambio_modulo`, `cambio_plan`, `excepcion_modulo`, `plan_definido`. Se hace con `alter type ... add value` en una migración propia. En PostgreSQL el valor nuevo no se puede usar hasta que la transacción confirme (supuesto de PG, no del repo). Ninguna migración posterior en esa transacción puede usarlo.
- `entidad` gana `negocios` y `planes`. Se reemplaza el check (su nombre autogenerado es `historial_entidad_check`, según la investigación).
- `entidad_id` (uuid, not null): para `negocios` es el `negocio_id`; para `planes`, el id del plan.
- `motivo` obligatorio para `excepcion_modulo`, `cambio_plan` y `plan_definido`. Jefe sin motivo en `cambio_modulo`.
- Los triggers `historial_solo_agrega` y `historial_sin_truncate` siguen igual.
- Lectura: la policy `historial_select` no cambia (negocio del token y rol jefe). Las filas de `planes` no son visibles para el jefe; las lee el operador por función.

**`cuentas`** (existe): sin cambios de columnas. Se agrega un trigger que impide que un usuario esté en `cuentas` y en `operadores` a la vez.

**`custom_access_token_hook`** (existe): ver Cuenta de operador.

### Tablas nuevas

**`planes`**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | Lo genera el navegador. |
| `codigo` | text unique | Regex `^[a-z_]{1,30}$`. Lo usa Studio y los textos. |
| `nombre` | text | Visible para el dueño. |
| `descripcion` | text | |
| `activo` | boolean | Un plan inactivo no se asigna a kioscos nuevos ni a cambios. Los kioscos que ya lo tienen lo conservan. |

RLS: select `using (true)` para `authenticated`. Escritura sólo por `operador_guardar_plan`.

**`plan_modulos`**: `(plan_id uuid fk planes, modulo text fk modulos, pk (plan_id, modulo))`. Mismo RLS que `planes`. Escritura por `operador_guardar_plan`. La función exige que el plan incluya el cierre de `requiere` de sus módulos.

**`negocio_plan`**: `(negocio_id uuid pk fk negocios, plan_id uuid fk planes, desde timestamptz not null default now())`. RLS: select con `negocio_id = (select negocio_actual())`, para caja y jefe. Escritura por `operador_fijar_plan`.

Invariante: todo negocio tiene plan. Se exige con un trigger de restricción diferida sobre `negocios` (inserción) que comprueba que exista `negocio_plan` al confirmar. [propuesta]

**`excepciones_modulo`**: `(negocio_id fk, modulo fk, permite boolean not null, motivo text not null check (char_length(btrim(motivo)) between 1 and 200), creado timestamptz default now(), pk (negocio_id, modulo))`. Sin grant ni policy para `authenticated`. Escritura y lectura por funciones. [propuesta]

**`modulo_dependencias`**: `(modulo fk, requiere fk, tipo text check in ('requiere', 'integra'), pk (modulo, requiere), check (modulo <> requiere))`. Select `using (true)`. Escritura por migración o Studio, no desde la app. Trigger que rechaza ciclos en `requiere`. [propuesta]

**`operadores`** (ya existe en el borrador `supabase/migrations/20261028120000_operadores.sql`, sin commit): `(usuario_id uuid pk fk auth.users on delete cascade, creado timestamptz)`. RLS activo, sin grant a `anon` ni `authenticated`. Lectura para `supabase_auth_admin` (el hook). Se mantiene el nombre `operadores` del borrador, en lugar de `administradores` que propuso la investigación.

## Funciones

Todas las funciones de escritura reciben `p_op_id uuid` (generado por el navegador). Ese id se usa como `historial.id`. Ver Idempotencia.

### Idempotencia

[tomada] Un reintento no duplica (los ids de alta los genera el navegador).

Orden dentro de la función, en una sola transacción:

1. Insertar la fila de historial con `id = p_op_id` con `on conflict (id) do nothing`.
2. Si no insertó nada, la operación ya se aplicó. Devolver `{ya_aplicada: true}` sin tocar nada. Antes de devolverlo, verificar que la fila existente sea del mismo negocio. Si no, `id_repetido`.
3. Si insertó, validar, aplicar el cambio y devolver.

Si las validaciones fallan, la transacción se deshace y no queda fila de historial. Las filas derivadas de un cambio múltiple (por ejemplo, al cambiar un plan) usan ids del servidor, porque se insertan junto con `p_op_id`.

### Funciones internas (sin grant a `authenticated`)

| Función | Argumentos | Qué hace |
|---|---|---|
| `tiene_derecho` | `(p_negocio uuid, p_modulo text) → boolean` | Excepción si existe; si no, pertenencia al plan. `security definer`. |
| `uso_modulo` | `(p_negocio uuid, p_modulo text) → boolean` | Fila de `modulos_negocio`, o `activo_por_defecto`, o `false`. |
| `modulo_activo_negocio` | `(p_negocio uuid, p_modulo text) → boolean` | Derecho, uso y dependencias `requiere` recursivas. Desconocido = `false`. |
| `exigir_operador` | `() → void` | Operador en `operadores` (`auth.uid()`) y `aal = 'aal2'`. Errores `no_es_operador` y `requiere_mfa`. |

`tiene_derecho`, `uso_modulo` y `modulo_activo_negocio` reciben un negocio como parámetro. Por eso no pueden tener grant a `authenticated`: si lo tuvieran, cualquier usuario podría consultar el estado de otro kiosco. Lo mismo vale para las funciones de operador (ver Permisos).

### Cambio en una función existente

**`modulo_activo(p_clave text) → boolean`** conserva su firma. Su cuerpo pasa a ser `select modulo_activo_negocio(negocio_actual(), p_clave)`. Las ~17 funciones que ya la llaman no cambian. Mantiene `security invoker`, `stable` y el grant a `authenticated`, porque lo llama la app y lo usan las funciones de venta.

### Funciones de dueño y de caja

| Función | Argumentos | Quién | Chequeos | Errores |
|---|---|---|---|---|
| `mis_modulos` | `() → table(clave, descripcion, en_plan, excepcion text, derecho, uso, activo, faltan text[])` | caja y jefe (lectura) | `negocio_actual()`. Sin motivo de excepción. | `sin_cuenta` si no hay cuenta. |
| `cambiar_modulo` | `(p_modulo text, p_activo boolean, p_op_id uuid, p_dispositivo_id uuid default null)` | jefe | Rol jefe. Módulo en catálogo. Si prende: derecho y dependencias `requiere` activas. Si apaga: ningún módulo activo lo requiere. | `sin_cuenta`, `solo_jefe`, `pedido_invalido`, `modulo_desconocido`, `sin_derecho`, `dependencia_inactiva`, `modulo_requerido` |

`cambiar_modulo_fiado` se borra en la misma migración que crea `cambiar_modulo` (regla del repo: firma nueva, drop de la vieja). La app cambia `cambiarModuloFiado` por `cambiarModulo(modulo, activo)`.

Historial de `cambiar_modulo`: `tipo = 'cambio_modulo'`, `entidad = 'negocios'`, `entidad_id = negocio`, `valor_anterior` y `valor_nuevo` = `{modulo, activo}`, `cuenta_id = auth.uid()`.

### Funciones de operador

Todas reciben `p_negocio_id uuid` (salvo las de lista y de plan), llaman a `exigir_operador()` en el cuerpo, y usan `p_negocio_id`, nunca el negocio del token. Quedan en una lista blanca de la prueba 140 (ver Tests).

| Función | Argumentos | Qué hace | Errores |
|---|---|---|---|
| `operador_listar_kioscos` | `()` | Nombre, id, plan, cantidad de módulos activos. Sin clientes ni ventas. | `no_es_operador`, `requiere_mfa`. Excepción: no recibe negocio (ver nota). |
| `operador_ver_kiosco` | `(p_negocio_id uuid)` → jsonb | Plan, módulos (derecho, uso, activo, faltan), excepciones con motivo, primera página de historial. | `negocio_desconocido` |
| `operador_previsualizar_plan` | `(p_negocio_id uuid, p_plan_id uuid)` → table(modulo, pasa) | Módulos que ganan y pierden derecho si cambia el plan. Sólo lectura. | `negocio_desconocido`, `plan_desconocido` |
| `operador_fijar_plan` | `(p_negocio_id, p_plan_id, p_motivo, p_op_id)` | Cambia `negocio_plan`. Apaga uso de los módulos que pierden derecho (ver Reglas). Historial `cambio_plan` y un `cambio_modulo` por cada uso apagado. | `negocio_desconocido`, `plan_desconocido` (inactivo), `motivo_requerido` |
| `operador_fijar_excepcion` | `(p_negocio_id, p_modulo, p_permite boolean, p_motivo, p_op_id)` | `p_permite = null` quita la excepción. Historial `excepcion_modulo`. | `modulo_desconocido`, `motivo_requerido`, `dependencia_sin_derecho` (al dar), `modulo_requerido` (al quitar con dependientes activos) |
| `operador_fijar_uso` | `(p_negocio_id, p_modulo, p_activo, p_op_id, p_motivo default null)` | Igual que `cambiar_modulo`, para cualquier kiosco. Historial con `operador_id`. | Los de `cambiar_modulo` |
| `operador_guardar_plan` | `(p_plan_id, p_codigo, p_nombre, p_descripcion, p_activo, p_modulos text[], p_motivo, p_op_id)` | Crea o edita un plan y sus módulos. Para cada kiosco que lo tiene, aplica lo mismo que `operador_fijar_plan`. Historial `plan_definido` con id del plan, y `cambio_modulo` por cada uso apagado. | `motivo_requerido`, `modulo_desconocido`, `dependencia_sin_derecho` (el plan no incluye un `requiere`) |
| `operador_historial` | `(p_negocio_id, p_cursor timestamptz default null, p_limite int default 100)` | Historial del kiosco, paginado. | `negocio_desconocido` |

Nota sobre `operador_listar_kioscos`: la regla "cada función de operador recibe el negocio como argumento" no se cumple acá, porque la lista no es de un kiosco. Igual chequea `exigir_operador()` y no usa el negocio del token. Es una excepción explícita. [propuesta]

**Quitar derecho apaga el uso**. Al quitar una excepción, o al bajar de plan, la función apaga el uso de cada módulo que pierde derecho, en la misma operación. Cada apagado queda en historial. Dar derecho no prende nada. [propuesta] Razón: la pantalla y la base quedan con el mismo estado sin que el dueño tenga que adivinar si un módulo volvió a estar disponible. La alternativa (conservar el uso y dejar que el derecho lo tape) hace que un módulo vuelva solo cuando alguien le restituye el derecho.

### Errores

Códigos (todos `errcode = 'P0001'`, mismo patrón que `cambiar_modulo_fiado`):

| Código | Detail | Cuándo |
|---|---|---|
| `sin_cuenta` | | No hay cuenta de kiosco. |
| `solo_jefe` | | La cuenta no es jefe. |
| `no_es_operador` | | No está en `operadores`. |
| `requiere_mfa` | | Operador sin `aal2`. |
| `pedido_invalido` | | Argumento nulo. |
| `negocio_desconocido` | | No existe el kiosco. |
| `modulo_desconocido` | | Clave fuera del catálogo. |
| `plan_desconocido` | | No existe o está inactivo. |
| `sin_derecho` | modulo | Quiere prender algo que el plan no incluye. |
| `dependencia_inactiva` | lista de claves | Prende un módulo cuyo `requiere` está apagado. |
| `dependencia_sin_derecho` | lista de claves | Da derecho sin que su `requiere` lo tenga, o el plan no incluye un `requiere`. |
| `modulo_requerido` | lista de claves | Apaga o quita algo que otro módulo activo requiere. |
| `modulo_deshabilitado` | clave | Escritura de un módulo que no está activo. |
| `motivo_requerido` | | Cambio de operador sin motivo. |
| `id_repetido` | | `p_op_id` ya existe para otro negocio. |

Hoy `stock_deshabilitado` (`20261028110000_proveedores_revision.sql:220`) no lleva detail. Se reemplaza por `modulo_deshabilitado` con detail `stock`. `fiado_deshabilitado` se mantiene, por contrato del spec de módulos.

**Cliente**: `src/lib/errores.ts` sólo lee `message` (`codigoDeError`). El detail nunca llega a la UI. Se agrega una función que lea `details` del error de PostgREST. [supuesto: PostgREST expone el DETAIL de PostgreSQL como `details`; verificar con supabase-js.] Los textos de los errores van en un solo diccionario tipado con `satisfies Record<CodigoError, string>`, no en un diccionario por servicio (el de `proveedores.ts` no tiene chequeo de compilación).

### Efecto en funciones de venta

Las funciones que ya chequean módulo no cambian de firma. Cambian sólo porque `modulo_activo` ya incorpora derecho y dependencias.

Cambio obligatorio en `anular_venta`. Hoy decide con el estado actual del módulo (`20261027120500_venta_modulos.sql:376`). Si el módulo `stock` se apagó entre la venta y la anulación, el stock no se devuelve. El propio código lo marca como shortcut (líneas 374-375). Fix: guardar en `ventas` si la venta descontó stock (`stock_descontado boolean`), y anular según ese valor. Las ventas anteriores a la migración tienen `stock_descontado = false` por defecto; es una limitación.

Anulación, cobro de deuda, cierre de turno y anonimización **no se bloquean** por apagar un módulo. Son cierres. `anonimizar_cliente` ya no chequea módulo (`jefe.sql:35-63`) y debe quedar así. Anonimizar no escribe historial, por lo que dice `jefe.sql:2-3`.

El OR de `editar_gestion_producto` (precios o stock) se mantiene tal cual. No se puede expresar como dependencia.

## Permisos

| Acción | Felipe (Studio o script, emergencia) | Dueño (jefe) | Caja | Operador (cuenta en la app) |
|---|---|---|---|---|
| Ver módulos de su kiosco (`mis_modulos`) | Sí | Sí | Sí, sólo lectura | Sí, cualquier kiosco |
| Prender o apagar módulo dentro de su derecho | No (usa operador) | Sí (`cambiar_modulo`) | No | Sí (`operador_fijar_uso`) |
| Cambiar plan de un kiosco | No | No | No | Sí |
| Dar o quitar excepción | No | No | No | Sí |
| Crear o editar un plan y sus módulos | Sólo migración | No | No | Sí |
| Editar catálogo (`modulos`, `modulo_dependencias`) | Sí, por migración o Studio | No | No | No |
| Ver historial de su kiosco | Sí | Sí | No (como hoy) | Sí |
| Ver historial de planes | Sí | No | No | Sí |
| Cobrar deuda de fiado | No aplica | Sí | Sí | No |
| Anonimizar cliente | No | Sí (dec. 40) | No | No (no ve clientes) |
| Ver datos de clientes | No | Sí | Sí (como hoy) | **No** |
| Crear cuenta de operador | Sí, script de una vez | No | No | No |

Studio y el script de creación usan la clave service role. Saltean RLS y no pasan por las funciones. Por eso Studio es sólo emergencia, y cada uso que escriba queda anotado en historial con `operador_id` de la cuenta que corresponde (propuesta).

## Cuenta de operador

[tomada] Cómo se crea: script de una sola vez, corrido por Felipe en su PC con la clave service role. Nunca desde el navegador.

[tomada] MFA TOTP: si el proyecto lo permite. **A verificar**: el repo tiene `[auth.mfa.totp]` con `enroll_enabled = false` y `verify_enabled = false` (`supabase/config.toml:303-305`), que es sólo el entorno local. El proyecto hospedado no se puede verificar desde el repo. Hay que revisar Authentication > Multi-factor en el dashboard antes de crear la cuenta.

[tomada] La contraseña se genera al azar (24 bytes, como hace hoy el script) y se guarda en `.env.operador.local`. Ese archivo está cubierto por `.gitignore` (`.env.*`, línea 11). Nunca va al chat ni al repo, ni se imprime.

[tomada] El token de la cuenta de operador no lleva `negocio_id`.

[tomada] Cada función de operador recibe el negocio como argumento y verifica que quien llama es operador.

### Hook

El borrador `20261028120000_operadores.sql` ya tiene un hook que deja pasar a un operador sin negocio y mantiene el 403 para quien no tiene cuenta ni es operador. Se conserva con estos ajustes:

- Si el usuario está en `operadores` y en `cuentas`, el hook rechaza. Lo impide el trigger de exclusividad, pero el hook también lo chequea.
- El rol de operador **no va en el token**. La app le pregunta a la base con `es_operador()` después del login. Así la revocación es inmediata, porque cada función lee `operadores` en el momento.

### Chequeos de la cuenta

- `es_operador() → boolean`: `security definer`, `search_path = ''`, grant a `authenticated` (la app lo usa al entrar). No pide `aal`, para que la app pueda mostrar el paso de MFA.
- `exigir_operador()`: pide `operadores` **y** `aal2`. Se usa en todas las funciones de operador.
- `auth.jwt() ->> 'aal'` dentro de una función `security definer`: [supuesto] devuelve el claim de la sesión. Verificar en pgTAP.

### Script de creación

Cambios necesarios sobre `tests/soporte/crear-operador.mts` antes de usarlo en el proyecto hospedado:

1. **Quitar el camino de contraseña nueva para un email existente.** Hoy, si el email ya existe, el script le cambia la contraseña (líneas 26-36) y lo convierte en operador. Si Felipe pasa por error el correo de un jefe de kiosco, esa persona queda con acceso a todos los kioscos. El script debe abortar si el email ya existe.
2. **Guardia de proyecto.** Hoy `clienteAdmin()` (`tests/soporte/admin.ts:13-15`) acepta cualquier `SUPABASE_URL`. El script debe exigir la referencia del proyecto que Felipe escribe a mano, y no alcanza con leer una variable.
3. **Archivo de clave aparte.** Hoy el script toma la clave de `.env.integracion.local` (línea 11). `vitest.integracion.config.ts:8` carga todo el `.env` sin prefijo. Si la clave del proyecto hospedado entra ahí, las pruebas de integración podrían apuntar a producción. La clave de producción va en un archivo propio, por ejemplo `.env.produccion.solo-operador.local`, que el script lee sólo para ese alta.
4. **Escritura con `wx`.** `writeFileSync(destino, ..., { flag: 'wx' })` para no pisar un archivo existente.
5. Mantener: no imprimir la clave (hoy sólo imprime el id del usuario, línea 44).

### Vista

- Felipe crea la cuenta con el script. Cuando el proyecto tiene MFA, enrola TOTP en el primer login.
- Revocar: borrar la fila de `operadores` y dar de baja el usuario de Auth. La revocación en la base es inmediata, porque cada función lee `operadores`. El JWT vivo (hasta 1 hora) no sirve para nada, porque ninguna función confía en el token para decidir si es operador.

### Riesgos

- Si el proyecto hospedado no tiene TOTP, la cuenta queda con una sola contraseña de máximo poder. En ese caso no se abre la pantalla de operador hasta tener MFA. [propuesta]
- Contraseña del operador robada = control sobre todos los kioscos. Mitigación: MFA, contraseña de 24 caracteres, guardia del script.
- La clave service role en la PC de Felipe es el acceso de mayor poder del sistema (el propio spec de venta lo marca en §10, línea 372).

## Reglas

### Bajar de plan

1. Los datos quedan. Nada se borra ni se edita.
2. Los módulos que pierden derecho se apagan en la misma operación (uso = false), con historial.
3. Las excepciones no se tocan, salvo que Felipe las cambie en la misma operación. La pantalla del operador muestra el preview de `operador_previsualizar_plan` antes de confirmar.
4. Lo que no es alta ni edición sigue andando: ver, cobrar deuda, anular, cerrar turno, anonimizar.
5. La caja no se bloquea. Vender en efectivo y con transferencia sigue. Sólo se rechazan las partes del módulo, por ejemplo `fiado_deshabilitado` en un pago fiado (dec. 19).

**Bloqueo de altas o de ediciones**: [propuesta] se bloquean altas **y** ediciones del módulo, no sólo altas. El código ya lo hace así hoy con precios, stock y proveedores. Si Felipe prefiere sólo altas, se cambian esas funciones.

### Apagar (dueño u operador)

1. Rechaza con `modulo_requerido` si otro módulo activo lo requiere. Sin cascada: el mensaje lista los módulos que hay que apagar primero.
2. Los datos quedan. Las escrituras del módulo quedan bloqueadas. Ver y cobrar siguen.
3. Un módulo que sólo "integra" a otro no bloquea al apagarse. La pantalla oculta la parte integrada.
4. Historial `cambio_modulo`.

### Prender

1. Requiere derecho (`sin_derecho`).
2. Requiere que sus `requiere` estén activos (`dependencia_inactiva`). Sin cascada: no prende los requisitos por sí solo.
3. Historial `cambio_modulo`.

### Dependencias

- `requiere`: afecta `activo`. Los ciclos están prohibidos (trigger).
- `integra`: no afecta `activo`. La pantalla oculta la parte que depende del módulo integrado. La función que escribe esa parte rechaza con `modulo_deshabilitado` detail `d` (si `d` está apagado).
- Un plan debe incluir el cierre de `requiere` de sus módulos. Un operador no puede guardar un plan que lo viola.
- Dar una excepción `permite = true` exige que los `requiere` tengan derecho.
- Quitar derecho a un módulo que otro módulo activo requiere se rechaza con `modulo_requerido`.

Dependencias iniciales propuestas (todas [propuesta], confirmar):

- `proveedores` requiere `stock`: `agregar_faltantes_al_pedido` usa faltantes de stock.
- `movimientos_caja` no requiere nada. `cerrar_turno` lo usa sólo si llega efectivo contado.

### Historial

- Sólo agrega. Nunca guarda datos de clientes. El `motivo` lo escribe el operador, con la indicación de no poner datos personales.
- Quién: `cuenta_id` (jefe o caja), `operador_id` (operador), ambos nulos (cambio fuera de la app).
- El jefe ve el historial de su kiosco, con los cambios del operador rotulados como "Operador" [propuesta]. Caja no lo ve, como hoy.
- Limitación: el jefe ve el apagado de un módulo, pero no un cambio de derecho que no apagó nada. El cambio de derecho queda en el historial del operador (`negocio_id` nulo, `entidad = 'planes'`) y en el `cambio_plan` del kiosco.

### Caché

- La fuente de verdad es la base. `mis_modulos()` devuelve el estado calculado.
- Dexie ya existe en el proyecto (`src/catalogo/cache.ts`, `src/caja/catalogoCaja.ts`). Para módulos se guarda la última respuesta de `mis_modulos()` sólo para renderizar sin red. [propuesta]
- Si hay caché y no hay red, la pantalla muestra el estado guardado con la fecha. Las escrituras **no** se hacen contra la caché: siempre pasan por la función, y si la red falla no se aplican localmente.
- El estado local **no es optimista**: el interruptor cambia cuando la función responde ok. Esto corrige la carrera de `Kiosco.tsx:90-92` contra `:109` (investigación).
- La app relee cada 3 minutos y al volver a la pestaña (como hoy, `programar.ts`). Latencia máxima de la pantalla: 3 minutos. La base rechaza al instante.

## Migración de kioscos existentes

[propuesta] Plan `base` provisorio, con `fiado` como único módulo incluido (así se mantiene `activo_por_defecto = true` de fiado). Excepciones `permite = true` para cada par (kiosco, módulo) que hoy está prendido y no está en `base`. Así el derecho queda exacto a lo que ya tienen prendido, sin cambiar ningún uso.

Pasos, en este orden:

1. Migración de enum (`alter type ... add value` para `tipo_historial`), sola en su archivo.
2. Migración de tablas nuevas, `historial` (columnas y checks), `operadores` (del borrador), funciones internas, triggers de exclusividad y de planes.
3. Migración de datos:
   - Insertar `planes` (`base`) y `plan_modulos` (fiado).
   - Insertar `negocio_plan` para cada kiosco.
   - Insertar `excepciones_modulo` (`permite = true`, motivo "migración 2026-10-28") para cada par prendido fuera del plan.
   - Historial `cambio_plan` por kiosco, sin actor, motivo "migración".
4. **Guardia de equivalencia dentro de la migración**: antes de cambiar `modulo_activo`, guardar el `activo` de cada (kiosco, módulo). Después de cambiarlo, comparar. Si hay una diferencia, `raise exception` y la migración no se confirma.
5. Reemplazar `modulo_activo`. Crear `cambiar_modulo`, `mis_modulos` y las funciones de operador. Borrar `cambiar_modulo_fiado`. Normalizar `stock_deshabilitado`.
6. Agregar `ventas.stock_descontado` (default `false`). Las ventas anteriores quedan con `false`.
7. Pruebas de equivalencia (ver Tests).

Precondición: correr después de `20261028100000_proveedores.sql` y `20261028110000_proveedores_revision.sql` (el módulo `proveedores` debe existir antes de la migración de datos).

Riesgo: el plan `base` es provisorio. Cuando Felipe defina los planes reales, las excepciones se convierten en membresía de plan (o se mantienen como extras cobrados).

Reversión: no hay "down" en Supabase. El plan de reversión es un script manual que restaura el cuerpo viejo de `modulo_activo` y borra las tablas nuevas. Los valores del enum no se pueden borrar.

Antes de aplicar en el proyecto hospedado: backup y OK explícito de Felipe (cambio de base de datos en producción).

## UI

- **"Módulo fiado" pasa a "Módulos" para el jefe.** Lista todos los módulos del kiosco. Cada uno muestra: incluido en tu plan, agregado por Felipe, no incluido. El interruptor queda deshabilitado si no hay derecho, con el texto "No está en tu plan" (sin datos de contacto). Si falta una dependencia, lo dice con el nombre del módulo.
- **Caja**: no tiene interruptores. Las secciones de módulos apagados no aparecen. `SECCIONES` (`Kiosco.tsx:43-56`) gana gating por módulo para `fichas_clientes` y el resto, en lugar de la lista fija actual.
- **Pantalla de operador** (ruta propia, cargada con import dinámico para que la caja no baje ese código):
  - Lista de kioscos (nombre, plan, módulos activos).
  - Detalle de un kiosco: plan (con preview antes de confirmar), módulos con derecho y uso, excepciones con motivo, historial.
  - Pantalla de planes: editar contenido y dependencias visibles.
  - Sin acceso a ventas, caja ni clientes.
- **Cómo se distingue el operador del kiosco** (después del login):
  1. `es_operador()` true → pantalla de operador (se pide `aal2` para cada acción).
  2. Si no, `cuentas` con kiosco → app de kiosco.
  3. Si no, `sin_cuenta`.
  El código del operador viaja en el mismo bundle. La protección es la base, no el código oculto.
- **Errores**: textos desde el diccionario tipado. El detail llega a la UI por la función nueva de `errores.ts`.
- **Caché y estados vacíos**: si no hay caché ni red, la pantalla de módulos muestra "No se pudo leer el estado de los módulos" y no muestra ningún módulo como activo (fail-closed, como hoy).

## Fichas de clientes como un módulo más

No es parte de este spec. Sólo define cómo se aloja sin cambiar la estructura:

- Fila en `modulos`: `fichas_clientes`, con `descripcion`, `activo_por_defecto = false`.
- Asignación a planes por `plan_modulos`, y excepciones por kiosco.
- Dependencias en `modulo_dependencias`. Propuesta: `fiado` requiere `fichas_clientes` (una deuda pertenece a un cliente), a confirmar al crear el módulo.
- Funciones de fichas: chequean `modulo_activo('fichas_clientes')`.
- `alta_cliente` chequea `fiado` (ya lo hace) y, cuando exista, también `fichas_clientes`.
- `anonimizar_cliente` **no** chequea ningún módulo (dec. 40, y `jefe.sql:35-63` ya lo cumple).
- El operador nunca ve datos de clientes. La pantalla de operador no tiene una vista de clientes.

## Tests a escribir

Lista para escribir. **No se corren**: no corro vitest, pgTAP, E2E ni tsc sin orden explícita de Felipe. Los números de archivo son propuestas: el último pgTAP existente es `220_proveedores`.

### pgTAP (nuevos)

- `230_planes_derecho.test.sql`:
  - Derecho por plan; excepción `true` agrega; excepción `false` quita; quitar excepción vuelve al plan.
  - Plan inactivo no se asigna a kioscos nuevos.
  - `modulo_activo` = derecho ∧ uso ∧ dependencias, con cadenas de tres módulos.
  - Ciclo en `modulo_dependencias` rechazado.
  - Todo negocio tiene `negocio_plan` (restricción diferida).
- `240_operador.test.sql`:
  - Sin fila en `operadores`: `no_es_operador`.
  - Token sin `aal2`: `requiere_mfa`.
  - Token de operador sin negocio: las funciones de kiosco rechazan con `sin_cuenta`.
  - Operador actúa sobre el kiosco B aunque el token diga A (no usa el negocio del token).
  - Operador no puede dejar un plan que viole `requiere`.
  - Quitar derecho apaga uso con historial.
  - Operador no aparece en `cuentas` ni es jefe a la vez (trigger).
  - Revocación: borrar la fila de `operadores` y la siguiente llamada falla, sin esperar al token.
- `250_historial_modulos.test.sql`:
  - Idempotencia: mismo `p_op_id` no duplica ni vuelve a aplicar.
  - `id_repetido` con otro negocio.
  - Historial sólo agrega (update y delete rechazados) para los tipos nuevos.
  - Check `cuenta_id` xor `operador_id`.
  - `motivo_requerido` para cambios de operador.
- Cambios en archivos existentes:
  - `060_modulos.test.sql` (plan 8): casos nuevos, actualizar el número.
  - `010_rls.test.sql`: tablas nuevas, sus grants (`operadores`, `excepciones_modulo` sin grant), `modulos` no cambia; plan(56) sube.
  - `020_token_hook.test.sql`: operador sin `negocio_id`; usuario sin cuenta ni operador sigue con 403.
  - `140_aislamiento.test.sql`:
    - Las dos reglas genéricas (líneas 6-14) excluyen una lista blanca: las funciones de operador, que reciben `p_negocio_id`. Cada una de esa lista debe contener `exigir_operador()`.
    - `set_eq` (líneas 16-25): sumar `cambiar_modulo`, `mis_modulos`, `operador_*`, `es_operador`, `exigir_operador` (esta última no debe estar en la lista de ejecutables), y quitar `cambiar_modulo_fiado`.
    - Caso de aislamiento para cada función nueva.
    - `plan(70)` sube.
  - `150_permisos_funciones.test.sql`: funciones internas (`tiene_derecho`, `uso_modulo`, `modulo_activo_negocio`, `exigir_operador`) sin ejecución para `authenticated`.
- Migración: prueba de equivalencia (lo mismo que la guardia de la migración): `activo` antes y después para cada (kiosco, módulo), en un dataset de prueba con kioscos de varios tipos.
- `anular_venta` devuelve stock aunque el módulo se haya apagado después de la venta.
- `cobrar_fiado` y `anonimizar_cliente` funcionan con todos los módulos apagados.

### Vitest (unitarias)

- `errores.ts` lee `details` cuando el código es de módulo.
- Diccionario de errores con `satisfies` (compila sólo si están todos los códigos).
- `ClaveModulo` coincide con el catálogo (prueba de integración, `tests/integracion`).
- La pantalla de módulos muestra los tres estados y deshabilita el interruptor sin derecho.
- Caja no ve interruptores.
- Caché: lectura y escritura de Dexie envueltas en try/catch; sin caché, la pantalla queda fail-closed.
- Mock compartido `src/test/servicios.ts`: sumar los métodos nuevos.

### E2E (opcional)

- Jefe prende un módulo, la caja lo ve después de la siguiente relectura.
- Operador baja de plan, el jefe ve el módulo apagado con su historial.

## Decisiones abiertas

Cada una con recomendación.

1. **Fiado en todos los planes** (dec. 39). Recomendación: sí. Si Felipe lo quiere como extra cobrado, dec. 39 se enmienda, porque el jefe ya no podría activarlo sin Felipe.
2. **Bloquear ediciones además de altas** al bajar de plan. Recomendación: sí (lo que hace el código hoy).
3. **Quitar derecho apaga el uso** (en lugar de dejar que el derecho lo tape). Recomendación: sí.
4. **Migración**: plan `base` más excepciones (exacto) o plan con todos los módulos (más simple, pero da derecho a módulos no pagados). Recomendación: exacto.
5. **Pantalla de operador**: entregar con las funciones, o usar Studio hasta tener 3 o 4 kioscos (propuesta de la investigación). Recomendación: entregar la pantalla mínima junto con las funciones, porque sin pantalla la cuenta no administra nada y Studio no deja historial. Studio queda para emergencias.
6. **MFA TOTP**: si el proyecto hospedado no lo tiene, no abrir la pantalla de operador hasta tenerlo. Recomendación: sí.
7. **Email de la cuenta de operador**: un alias, no el correo personal de Felipe. Recomendación: sí. El email se pasa al script por argumento y no se escribe en el repo.
8. **Cierres que no se bloquean** (anular, cobrar, cerrar turno, anonimizar). Recomendación: mantener.
9. **Dexie para módulos**: sólo lectura para arranque sin red. Recomendación: sí.
10. **Latencia de 3 minutos**. Recomendación: mantener el polling, sin realtime por ahora.
11. **`fiado` requiere `fichas_clientes`**. Recomendación: decidir al crear el módulo.
12. **Historial visible para el jefe**, con los cambios del operador rotulados "Operador". Recomendación: sí.
13. **Lecturas por módulo** (RLS no corta datos de un módulo apagado). Recomendación: no tocar ahora, riesgo bajo; reevaluar cuando haya datos sensibles de fichas.

## Limitaciones conocidas

- La pantalla del kiosco va hasta 3 minutos atrasada. La base rechaza al instante.
- Studio escribe sin historial, salvo que se use el script de operador. Es una excepción aceptada para emergencias.
- El jefe no ve cambios de derecho que no apagaron nada.
- `stock_descontado` de las ventas anteriores a la migración queda en `false`. Anular una venta de antes no devuelve stock.
- El plan `base` es provisorio. Los nombres comerciales de los planes no están definidos.
- Un plan sin kioscos cambia sin historial por kiosco, pero queda en el historial de planes (`negocio_id` nulo).
- La pantalla de operador viaja en el mismo bundle. El import dinámico reduce la descarga, no la elimina.
- Las lecturas no se cortan por módulo (RLS).
- Dar de baja un kiosco o una cuenta no tiene procedimiento en el repo (ya existente).
- El jefe no tiene MFA (ya existente). Su riesgo es bajo, porque sólo afecta a su kiosco y dentro de su plan.
- La clave service role en la PC de Felipe concentra el riesgo más alto del sistema.
- No hay tope de PCs por plan (dec. 34).
- Nada de esto se probó: no se corrieron pruebas, ni se verificó la configuración del proyecto hospedado.

## Fuera de alcance

- Pantallas de la ficha de clientes y su contenido (es un módulo aparte).
- Cobro automático, pasarela de pago y vencimientos. El cobro del abono sigue por fuera de la app.
- Suspensión por morosidad (choca con dec. 19).
- Tope de PCs por plan (choca con dec. 34).
- Reportes o estadísticas por plan.
- Alta o baja de kioscos desde la app (dec. 7).
- Realtime o push de cambios de módulos.
- Revisión de `ranking_sin_codigo` (función `security definer` pendiente de OK de Felipe).
- Permisos granulares de caja (dec. 24) o por persona.