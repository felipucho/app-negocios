# Spec: Venta y cobro

Fecha: 2026-10-19
Estado: Revisado con decisiones de Felipe. Pendiente de aprobación final de Felipe. No implementado.

---

## 1. Estado y alcance

- Este documento describe el sub-proyecto "Venta y cobro" de una app de punto de venta para kioscos en Argentina.
- Revisado con las decisiones de Felipe del 2026-10-19. Falta su aprobación final. Nada de lo descripto está implementado ni probado.
- Cubre: cuentas por rol (caja y jefe), turnos, escaneo y búsqueda de productos, armado de la venta, cobro con uno o varios medios de pago, vuelto, módulo fiado, confirmación de la venta, comprobante en pantalla, anulación, caja del día, pantalla de precios y productos, historial de auditoría y aviso de estado del abono.
- Incluye también lo transversal que la venta necesita: multi-negocio, modelo de datos, personalización por negocio, fallas y seguridad.
- No cubre lo listado en la sección 12 como fuera de alcance.

---

## 2. Decisiones de producto

Todas aprobadas por Felipe. Las marcadas con una letra (A a Q) son decisiones del 2026-10-19; reemplazan el texto anterior donde lo contradecían.

1. **App de punto de venta para kioscos, vendida a varios kioscos.** Felipe cobra un abono mensual a cada kiosco por transferencia, WhatsApp o link de Mercado Pago. Motivo: modelo de negocio elegido; la tarjeta no se cobra dentro de la web.
2. **(A) Dos cuentas por kiosco: "caja" y "jefe". Cada cuenta pertenece a un solo kiosco.** "Caja" es la cuenta compartida del mostrador. "Jefe" es la cuenta personal del dueño, vinculada al kiosco. Felipe crea ambas.
3. **Modelo A: una sola web, un despliegue, un proyecto de Supabase.** Cada login entra a su kiosco. Motivo: un solo código y una sola base para mantener; el aislamiento lo da `negocio_id` en el token y RLS.
4. **Solo web, sin modo offline.** Sin internet la caja se para: no hay cola local ni sincronización. Motivo: evitar la complejidad y los riesgos de sincronizar ventas.
5. **Dexie es sólo caché.** Sirve para cargar rápido; nunca es fuente de verdad. Motivo: la verdad está en la base; la caché puede estar vieja.
6. **Equipo: hoy una PC Windows con escáner USB por kiosco; puede haber varias.** Se diseña para varias: UUID en las entidades y prefijo de número de venta por dispositivo. El alta automática de dispositivos (decisión 34) ya admite varias PCs. Motivo: no rehacer el modelo cuando lleguen más PCs.
7. **(A) Login con email y contraseña en las dos cuentas, sin PIN.** La caja es compartida, como hoy: no hay cajero identificado por persona. Cada venta, anulación y cambio queda asociado a la cuenta (caja o jefe) y al dispositivo. Las cuentas las crea Felipe.
8. **Pagos combinables.** Una venta se puede pagar con cualquier combinación de efectivo, transferencia, tarjeta y fiado, incluido fiado parcial. Fiado, sólo si el módulo fiado está activo. Motivo: así se cobra en un kiosco real.
9. **La tarjeta sólo se registra.** El cobro lo hace el posnet; la app no procesa tarjetas. Motivo: fuera del alcance y del riesgo de manejar datos de tarjeta.
10. **Vuelto exacto: lo que el cliente entrega en efectivo menos la parte del total que se cobra en efectivo.** Sin billetes sugeridos ni redondeo. Motivo: simplicidad.
11. **Plata en pesos enteros, nunca decimales flotantes.** Motivo: evitar errores de redondeo.
12. **El precio se congela en cada línea de venta.** Motivo: un cambio de precio posterior no altera ventas pasadas.
13. **Campo único "Escanear o buscar", siempre con foco.** Motivo: el escáner USB escribe como un teclado; el cajero no tiene que elegir dónde escribir.
14. **Enter nunca agrega una sugerencia sola.** Se elige con clic, o con flechas y Enter. Motivo: evitar agregar un producto equivocado.
15. **Productos sin código: botón "Sin código (F2)" con grilla de botones grandes.** Ordenada por ventas recientes. Motivo: acceso rápido a lo que más se vende sin código.
16. **(F) Fiado es un módulo, activo por defecto, que cada kiosco puede desactivar.** Apagado, el medio fiado no aparece en la caja. Dentro del módulo: lista de clientes del kiosco, alta rápida desde la caja (nombre o alias, teléfono opcional) y venta con parte fiada. Fuera del MVP: saldo por cliente, cobro de deuda y recordatorios. Motivo del mínimo de datos: son datos personales de terceros (Ley 25.326).
17. **(Q) Anulación: sólo venta completa, con motivo, nunca se borra.** La caja anula sólo ventas del mismo día; el jefe, de cualquier día. Anular dos veces devuelve la anulación existente. La caja del día resta la anulación el día en que se anula. Motivo: trazabilidad; la anulación es un movimiento nuevo.
18. **(D) Caja del día: total cobrado por medio de pago, por día.** Suma todos los turnos del día. Entra en el MVP. Motivo: es lo mínimo que el kiosco necesita para controlar el día.
19. **Estado de cuenta del abono: sólo aviso, nunca bloquea la caja.** Felipe lo decidió. Motivo: no cortar la venta de un kiosco por un atraso.
20. **Personalización por negocio, opción "Ambas":** config visual en la base y módulos de función con flags en la base. Nunca copias de código por cliente ni `if` por negocio. Motivo: un solo código para todos.
21. **Catálogo mínimo: nombre, precio, código de barras opcional, activo.** Los productos se desactivan, no se borran. Motivo: las ventas pasadas siguen apuntando al producto.
22. **La función que confirma la venta vuelve a leer los precios desde la base.** Si difieren del precio que vio el cajero, no graba nada y avisa. Motivo: la caché puede estar vieja; la base tiene la última palabra.
23. **(A) Pantalla de entrada genérica.** Después del login, cada cuenta llega a su kiosco.
24. **(B) Permisos de la caja:** vender (cobrar; fiado sólo si el módulo está activo); dar de alta productos desde la caja; editar precios y productos; anular ventas sólo del mismo día, con motivo; abrir y cerrar turno; ver ventas y caja del día.
25. **(C) Permisos del jefe:** todo lo de la caja, más ver todo el historial de ventas, caja del día y productos; editar precios y productos; anular ventas de cualquier día, con motivo. Estadísticas: fuera del MVP (v2).
26. **(D) Turnos.** La apertura marca el inicio del turno, con cuenta, dispositivo y fecha y hora. No pide monto inicial en efectivo. El cierre es simple: marca el fin y muestra el total cobrado por medio de pago en el turno. Sin arqueo ni conteo de efectivo. La caja se reporta por día; el turno es un marcador.
27. **(E) Historial de auditoría.** Cada cambio de precio o de producto, cada anulación y cada apertura y cierre de turno queda registrado con cuenta, dispositivo, fecha y hora. En cambios de precio o de producto, también valor anterior y valor nuevo. Las anulaciones guardan motivo.
28. **(G) Módulos: el único módulo de función en el MVP es "fiado".** Alta de productos desde la caja y edición de precios son funciones siempre disponibles, no módulos. Cada módulo tiene un valor por defecto en la base; fiado = activo por defecto.
29. **(H) Clientes de fiado: a pedido de la persona, se anonimizan.** El nombre pasa a "Cliente suprimido" y el teléfono se vacía. Las ventas se mantienen. Pendiente de consulta con abogado (Ley 25.326), sección 15.
30. **(I) Corte de Wi-Fi: no se diseña contingencia.** Ni cuaderno, ni cola, ni modo offline. Se mantienen el aviso de error si falla la confirmación, el reintento con el mismo `id` y la protección de doble clic.
31. **(J) F5 con una venta sin confirmar: la venta se pierde.** No se guarda nada en el navegador. Procedimiento para el cajero: antes de volver a cargarla, revisar las ventas de hoy para no duplicar.
32. **(K) Sin Resend.** La recuperación de contraseña la hace Felipe a mano desde Supabase. Sentry sigue para errores, sin datos personales.
33. **(L) Los códigos con letras se escanean como código.** Lo que llega como escaneo (rápido, terminado en Enter) busca el código exacto; lo tipeado a mano va a búsqueda por nombre. El umbral de velocidad es un supuesto a medir.
34. **(M) Alta de dispositivos automática.** La PC se da de alta sola en su primer login; la base asigna el prefijo siguiente (A, B, …). Sin tope de PCs por kiosco.
35. **(N) Pantalla propia de precios y productos en el MVP.** Editar precio, nombre y activo. Caja y jefe pueden hacerlo. El alta rápida desde la caja queda marcada como "creado en caja".
36. **(O) Venta sin comprobante fiscal.** El sistema es de administración, independiente de la facturación. Sin comprobante fiscal ni ARCA. Motivo: conclusión de la consulta con el contador (sección 15).
37. **(P) Comprobante sólo en pantalla.** Sin ticket impreso en el MVP.
38. **(R) Turnos: un turno por PC.** Cada PC abre y cierra el suyo. Hoy hay una sola PC, así que es igual.
39. **(S) El módulo fiado lo activa o desactiva el jefe desde la app.** Felipe no interviene.
40. **(T) La anonimización de clientes la hace el jefe desde la app.** Felipe no interviene.

---

## 3. Arquitectura

### Stack
- Frontend: Vite + React + TypeScript, como SPA estática.
- Caché local: Dexie (IndexedDB). Sólo para cargar rápido; nunca fuente de verdad.

### Hosting
- Cloudflare Workers con static assets. Felipe lo eligió.
- Cloudflare Pages se consideró; mismo costo.
- Vercel descartado: el plan Hobby no permite uso comercial.
- Dominio .com.ar.

### Backend
- Supabase: Auth, Postgres con RLS y funciones de la base.
- Sin Edge Functions en el MVP.
- `negocio_id` va en el token mediante un Custom Access Token Hook.
- RLS en todas las tablas.

### Servicios y costos base
- Supabase Free mientras se desarrolla.
- Supabase Pro antes de cargar datos reales del primer kiosco (no al primer pago), por los backups. El plan Free no los incluye (verificar, sección 15).
- Errores: Sentry Developer. Sólo errores, sin datos personales.
- Sin servicio de correo: la recuperación de contraseña la hace Felipe a mano desde Supabase (decisión 32).
- Todas las cifras de costo están a verificar (ver sección 15). Este documento no fija montos.

### Caché
- Dexie guarda el catálogo del negocio para búsqueda rápida, con un campo de nombre normalizado (sin tildes, en minúsculas) para buscar.
- Cada cambio de catálogo sube `catalogo_version`, por un trigger en la base sobre `productos` y `negocios`. Así cuenta también lo que se cambie desde Supabase Studio o desde la pantalla de precios y productos. La app la compara al arrancar, al volver a la pestaña y cada pocos minutos.
- La función que confirma la venta tiene la última palabra sobre precios y productos.
- Sin internet no se vende: la caché no habilita ventas offline.

---

## 4. Modelo de datos

Nombres de tablas y columnas: orientativos. Lo que importa son las claves, los campos clave y las reglas.

### Reglas generales
- Todas las entidades usan UUID como clave primaria.
- Todas las tablas del negocio llevan `negocio_id` y tienen RLS.
- Los importes son enteros en pesos. Nunca decimales flotantes.
- Nadie escribe directo en las tablas de ventas, turnos, historial ni dispositivos: sólo las funciones de la base.
- Nada de ventas se borra. El historial tampoco se edita ni se borra.
- Fechas y horas de venta, anulación, turnos, historial y movimientos las asigna la base (`now()`), nunca el navegador. El día es el día operativo en America/Argentina/Buenos_Aires.
- Totales e importes los calcula y valida la base. El cliente no es fuente de totales.

### Tablas

| Tabla | Clave | Campos clave | Reglas |
|---|---|---|---|
| `negocios` | `id` (UUID) | estado del abono (activo, gracia, suspendido), `catalogo_version` | Estado del abono y config los carga sólo Felipe. |
| `cuentas` | usuario de Auth | `negocio_id`, rol (`caja` o `jefe`) | Cada cuenta pertenece a un solo kiosco: `usuario_id` es único. Una cuenta por rol en cada kiosco: único (`negocio_id`, rol). Las crea Felipe. La lee el Custom Access Token Hook para poner `negocio_id` en el token. Propuesta: las funciones leen el rol desde esta tabla con `auth.uid()`, no desde el token, para que un cambio aplique sin esperar a que venza el token. |
| `config_negocio` | `negocio_id` | nombre visible, logo, colores | Sólo Felipe la modifica (Supabase Studio en el MVP). Se aplica después del login. |
| `modulos` | clave del módulo | activo por defecto | Catálogo de módulos con su valor por defecto. En el MVP, una sola fila: `fiado`, activo por defecto. Sólo Felipe la modifica. |
| `modulos_negocio` | `negocio_id` + módulo | flag activo/inactivo | Si un negocio no tiene fila para un módulo, vale el valor por defecto de `modulos`. Sólo Felipe los modifica. No van en el token. |
| `dispositivos` | `id` (UUID) | `negocio_id`, prefijo, último número usado, cuenta y fecha de alta | Se crea solo en el primer login de la PC; la base asigna el prefijo siguiente (A, B, …). Prefijo único por negocio. Sin tope por kiosco. Su fila se bloquea al numerar una venta. Dos pestañas del mismo navegador comparten el id del dispositivo (en `localStorage`). Consecuencia: si se borran los datos del navegador, la PC se registra como dispositivo nuevo, con prefijo nuevo. |
| `productos` | `id` (UUID) | `negocio_id`, nombre, precio (entero), código de barras (opcional, con letras o sin ellas), activo, creado en caja | Se desactivan, no se borran. Código de barras único por negocio, incluidos los inactivos: si se escanea uno inactivo, se ofrece reactivarlo. El alta rápida desde la caja se marca como "creado en caja". Cada cambio sube `catalogo_version` del negocio y queda en `historial`. |
| `clientes` | `id` (UUID) | `negocio_id`, nombre o alias, teléfono (opcional) | Sólo con el módulo fiado. Datos personales de terceros (Ley 25.326); sólo lo mínimo. Anonimización a pedido de la persona: nombre "Cliente suprimido", teléfono vacío; la fila y las ventas se mantienen. |
| `turnos` | `id` (UUID) | `negocio_id`, `dispositivo_id`, cuenta, apertura, cierre (vacío mientras está abierto) | Sin monto inicial. La apertura y el cierre los asigna la base y quedan en `historial`. Un turno no cerrado queda abierto hasta la próxima apertura (SUPUESTO NUEVO, sección 13). |
| `ventas` | `id` (UUID, generado antes de confirmar) | `negocio_id`, `dispositivo_id`, cuenta, `turno_id`, número, fecha, total, `hash_contenido` | El mismo `id` viaja en cada reintento con el carrito y los pagos intactos; cualquier cambio en el carrito, aunque vuelva al mismo contenido, genera uno nuevo. `número` es único por (`negocio_id`, `dispositivo_id`, `número`). `total` y `fecha` los calcula la base. Índice por fecha (lo usa el ranking). |
| `lineas_venta` | `id` (UUID) | `venta_id`, `producto_id`, cantidad, precio unitario congelado | El precio se congela al confirmar. |
| `pagos_venta` | `id` (UUID) | `venta_id`, medio (efectivo, transferencia, tarjeta, fiado), importe, `cliente_id` si es fiado | La tarjeta sólo se registra. Fiado exige cliente y módulo activo. `importe` es lo aplicado al total, no lo entregado: la suma de pagos de una venta es igual a su total. El vuelto no se guarda; se calcula. |
| `anulaciones` | `id` (UUID) | `venta_id`, cuenta, dispositivo, `turno_id`, fecha, motivo | Movimiento nuevo; la venta no se toca. Una sola por venta. `turno_id` es el turno abierto de la PC donde se anula; su cierre la resta. Queda en `historial`. |
| `historial` | `id` (UUID) | `negocio_id`, tipo (cambio de precio, cambio de producto, anulación, apertura de turno, cierre de turno), cuenta, dispositivo, fecha y hora, entidad afectada, valor anterior, valor nuevo, motivo | Sólo se agrega; nunca se edita ni se borra. Valor anterior y nuevo en cambios de precio o de producto (nombre, precio, activo). Motivo en anulaciones. Propuesta: también se registra el alta de un producto. |

### Numeración de ventas
- Número por dispositivo, con el prefijo del dispositivo. Se muestra en el comprobante en pantalla.
- Orden obligatorio dentro de la función que confirma:
  1. Bloquear la fila del dispositivo.
  2. Verificar si la venta (`id`) ya existe. Si existe, devolverla.
  3. Recién después numerar e insertar.
- Así un reintento no deja huecos ni números repetidos.

---

## 5. Personalización por negocio

Opción elegida: "Ambas".

### (a) Config visual
- Guardada en la base, por negocio: nombre visible, logo, colores.
- La app la lee y la aplica después del login. La pantalla de entrada es genérica. El código es el mismo para todos.

### (b) Módulos de función
- Se activan por negocio con flags en la base.
- Cada módulo tiene un valor por defecto en la base (tabla `modulos`). Si un negocio no tiene fila para un módulo, vale ese valor por defecto.
- Único módulo en el MVP: **fiado**, activo por defecto. Cada kiosco puede desactivarlo.
- Con fiado apagado: el medio fiado no aparece en la caja, y la base rechaza pagos fiados y altas de clientes.
- Alta de productos desde la caja y edición de precios no son módulos: están siempre disponibles.
- Los flags no van en el token (el token dura 1 hora; un cambio tardaría en aplicarse).
- La base chequea el módulo donde corresponda. Un flag que sólo oculta algo en la pantalla no es seguridad.

### Reglas
- Nunca copias de código por cliente.
- Prohibido ramificar el código por negocio (`if` por negocio).
- La config visual y el catálogo de módulos los cambia sólo Felipe, desde Supabase Studio en el MVP. No hay panel de admin propio.
- El módulo fiado lo activa o desactiva el jefe desde la app (decisión 39).

---

## 6. Flujo de venta y cobro

### Antes de vender
- Login con la cuenta caja o la cuenta jefe. Después del login, la cuenta llega a su kiosco.
- En el primer login de una PC, el dispositivo se da de alta solo.
- La caja sólo vende con un turno abierto (SUPUESTO NUEVO, sección 13). Si no hay turno abierto, la pantalla pide abrirlo.

### Campo único "Escanear o buscar"
- Siempre tiene el foco.
- Lo que llega como escaneo (caracteres rápidos terminados en Enter) busca el código exacto, tenga letras o no. Si existe, agrega el producto.
- Lo tipeado a mano (sin esa velocidad) va a búsqueda por nombre.
- El umbral de velocidad que separa escaneo de tipeo es un supuesto a medir con el escáner real (sección 14).
- Consecuencia: un código tipeado a mano no se busca como código.

### Búsqueda por nombre
- Coincide con palabras que empiezan con lo escrito.
- Desde 2 letras.
- Sin distinguir tildes ni mayúsculas (usa el campo normalizado de la caché).
- Hasta 8 resultados, cada uno con nombre, precio y código.
- Enter nunca agrega una sugerencia sola. Se elige con clic, o con flechas y Enter.
- Si llega un escaneo con la lista abierta, gana el código.
- Con el cobro abierto no se agregan productos: el total ya se mostró. Un escaneo en ese momento se ignora y avisa.
- El buscador general no usa el orden del ranking de productos sin código.

### Agregar productos
- Cada producto agregado se resalta y suena un pitido.
- Escanear un producto que ya está en el carrito suma 1 a su línea; no crea otra línea (propuesta).
- La cantidad se cambia con botones + y − en la línea.

### Código inexistente
- Aviso "no encontrado".
- El campo se limpia.
- Se ofrece buscar por nombre.
- Alta rápida del producto con nombre y precio. Queda marcado como "creado en caja" y en el historial.

### Productos sin código de barras
- Botón "Sin código (F2)" que abre una grilla de botones grandes (4×5) con nombre y precio.
- Cada toque suma 1 unidad. El panel queda abierto.
- El foco nunca sale del campo de escaneo:
  - Escribir con el panel abierto filtra la lista.
  - Un escaneo agrega el producto y cierra el panel.
  - Esc o F2 también lo cierran.
- Orden:
  - Por cantidad de ventas confirmadas y sin anular en los últimos 30 días. Cuenta ventas, no unidades.
  - Se calcula al abrir el turno y queda fijo durante el turno.
  - Empates: orden alfabético.
  - Lo que deja de venderse baja solo.
  - Lo desactivado sale de la lista.
- El cálculo lo hace una función de sólo lectura con security invoker (ver sección 10).

### Pagos
- Cualquier combinación de efectivo, transferencia, tarjeta y fiado, incluido fiado parcial. Fiado, sólo con el módulo activo.
- Tarjeta: sólo se registra el importe. El cobro lo hace el posnet.
- Todos los importes en pesos enteros.

### Vuelto
- Vuelto exacto: lo que el cliente entrega en efectivo menos la parte del total que se cobra en efectivo.
- La base valida: la suma de los importes es igual al total; el efectivo entregado es igual o mayor que la parte en efectivo; cada importe es mayor que cero.
- Sin billetes sugeridos ni redondeo.

### Fiado (módulo)
- Sólo si el módulo fiado está activo. Apagado, el medio fiado no aparece.
- Se identifica al cliente con la lista de clientes del kiosco.
- Alta rápida desde la caja: nombre o alias, y teléfono opcional.
- En el MVP sólo se registra la parte fiada de la venta. Saldo por cliente, cobro de deuda y recordatorios quedan fuera.
- Consecuencia: en el MVP la app no muestra cuánto debe cada cliente.

### Confirmación
- El `id` identifica un contenido exacto. Se genera antes de confirmar y vive sólo en la memoria de la pestaña: no se guarda en `sessionStorage` ni en `localStorage`. Cualquier cambio en el carrito o en los pagos genera un `id` nuevo.
- El botón de confirmar se deshabilita durante la llamada.
- Si la confirmación falla: aviso de error. El carrito queda como estaba y el cajero reintenta con el mismo `id`. No hay pantalla especial "Sin confirmar" ni cola.
- La función que confirma, en este orden:
  1. Toma el `negocio_id` del token.
  2. Bloquea la fila del dispositivo.
  3. Busca la venta por `id` dentro de ese `negocio_id`. Si existe con el mismo `hash_contenido`, la devuelve. Si existe con otro contenido, devuelve error: nunca devuelve en silencio una venta distinta de la que el cajero confirma.
  4. Recalcula el total desde las líneas. Verifica: turno abierto; productos del negocio y activos; precios iguales a los que vio el cajero (si no, no graba nada y devuelve las diferencias); suma de pagos igual al total; efectivo entregado igual o mayor que la parte en efectivo; cantidades e importes enteros mayores que cero; módulos requeridos activos (fiado).
  5. Recién después numera e inserta, registra cuenta, dispositivo y turno, y congela el precio en cada línea.
- Al confirmar, la pantalla muestra el comprobante: número con prefijo del dispositivo, líneas, pagos y vuelto. No se imprime.

---

## 7. Turnos, anulación y caja del día

### Turnos
- Apertura: marca el inicio del turno con cuenta, dispositivo y fecha y hora. No pide monto inicial en efectivo.
- Cierre simple, en el MVP: marca el fin y muestra el total cobrado por medio de pago en el turno. Sin arqueo ni conteo de efectivo. Las anulaciones hechas en el turno restan en ese turno, aunque la venta sea de otro turno, de otra PC o de otro día.
- La pantalla "No hay turno abierto en esta PC" vuelve a mostrar el último turno cerrado de esa PC: apertura, cierre y total por medio de pago, igual que al cerrarlo (decisión de Felipe, 2026-10-22). Así los totales se ven aunque se pierda la respuesta del cierre. La caja lo ve sólo si el turno cerró hoy, como la caja del día; el jefe, de cualquier día. Un turno que se cerró solo al abrir otro no llega a esa pantalla, porque ya hay uno abierto; sus ventas siguen en la caja del día.
- Caja y jefe pueden abrir y cerrar turno. Cada apertura y cierre queda en el historial.
- Un turno por PC (decisión 38). Si una PC abre un turno mientras tiene otro abierto, el anterior se cierra solo con la hora de la nueva apertura (SUPUESTO NUEVO, sección 13).
- El turno es un marcador: la caja se reporta por día, no por turno.
- La caja sólo vende con un turno abierto (SUPUESTO NUEVO).
- Para anular hace falta un turno abierto en la PC donde se anula, también para el jefe (decisión de Felipe, 2026-10-22). Así cada anulación resta en exactamente un turno: el abierto en la PC donde se hizo. Si los turnos de un día abren y cierran ese mismo día, la suma de sus cierres es igual a la caja del día; un turno que pasa la medianoche suma en su cierre las ventas y anulaciones de los dos días, y la caja del día las separa por día.
- Un turno que no se cierra queda abierto hasta la próxima apertura (SUPUESTO NUEVO).

### Anulación
- Sólo venta completa. No hay anulación parcial ni edición de ventas.
- Por rol:
  - Caja: sólo ventas del mismo día (día operativo de la venta igual al día de hoy, en America/Argentina/Buenos_Aires).
  - Jefe: ventas de cualquier día.
- La base chequea el rol y el día. Ocultar el botón no es seguridad.
- Requiere motivo.
- Requiere un turno abierto en la PC donde se anula, para la caja y para el jefe (2026-10-22). Si no hay, la base la rechaza (`sin_turno`) y la pantalla pide abrir el turno en esa PC. La anulación cuenta en ese turno: resta en su cierre. Un reintento de una anulación ya hecha la devuelve aunque el turno ya esté cerrado.
- Nunca se borra nada: la anulación es un movimiento nuevo.
- Anular dos veces devuelve la anulación que ya existe; no falla. Hay una sola anulación por venta, aunque llegue otro `id`.
- Una venta con pagos fiados se anula completa: la deuda se anula con ella.
- Cada anulación guarda cuenta, dispositivo, turno, fecha y motivo, y queda en el historial. La caja del día muestra las anulaciones aparte, para revisarlas.
- La caja del día resta la anulación el día en que se anula, aunque la venta sea de otro día.

### Caja del día
- Muestra el total cobrado por medio de pago: efectivo neto de vuelto, transferencia y tarjeta. El fiado aparece aparte, como no cobrado. Las anulaciones restan y se muestran aparte.
- Se reporta por día: el total del día suma todos sus turnos.
- Zona horaria: America/Argentina/Buenos_Aires.
- La caja ve las ventas y la caja del día de hoy. El jefe ve el historial completo (SUPUESTO NUEVO).
- Entra en el MVP, con cierre simple de turno. Arqueo y conteo de efectivo quedan fuera.

---

## 8. Estado de cuenta del abono

- Tres estados: activo, gracia, suspendido.
- Los carga a mano Felipe.
- Es SOLO AVISO: nunca bloquea la caja, en ningún estado. Felipe lo decidió.
- El cobro del abono ocurre fuera de la app (transferencia, WhatsApp o link de Mercado Pago). No hay cobro automático.

---

## 9. Fallas y casos borde

| # | Caso | Comportamiento |
|---|---|---|
| 1 | Corte de red a mitad de un cobro | Sin contingencia (decisión 30). Aviso de error. El carrito queda como estaba y el cajero reintenta con el mismo `id` cuando vuelve la red; si la venta ya se había grabado, se devuelve, sin duplicar. No hay pantalla "Sin confirmar" ni cola. |
| 2 | Doble clic en confirmar | Botón deshabilitado durante la llamada. Si llega otro clic, viaja el mismo `id`. Queda una sola venta. |
| 3 | F5 con una venta sin confirmar | La venta se pierde: no se guarda nada en el navegador. La venta pudo haberse grabado igual en la base. Procedimiento para el cajero: antes de volver a cargarla, revisar las ventas de hoy para no duplicar. |
| 4 | Escáner | Lo que llega como escaneo (rápido, terminado en Enter) busca el código exacto, con letras o sin ellas; lo tipeado a mano va a búsqueda por nombre. Lectura doble: el mismo código en menos de 150 ms se ignora; aplica a la lectura del escáner, no a la venta (para más unidades se usa el +). SUPUESTO: ambos umbrales hay que medirlos con el escáner real. |
| 5 | Caché desactualizada | Cada cambio de catálogo sube `catalogo_version`. La app la compara al arrancar, al volver a la pestaña y cada pocos minutos. La función que confirma tiene la última palabra. Tras un rechazo por precio, la pantalla muestra qué cambió, actualiza el carrito y deja confirmar de nuevo, con `id` nuevo. |
| 6 | Versión vieja de la app tras un deploy | Las funciones nuevas tienen nombre nuevo. Las viejas se revocan a las 48 horas. La app vieja se fuerza a recargar si su versión queda bajo el mínimo. |
| 7 | Precio distinto al confirmar | La función no graba nada y avisa. |
| 8 | Sin internet | La caja se para. No hay modo offline ni contingencia diseñada (decisión 30): ni cuaderno ni cola. |
| 9 | Cambio de carrito o de pagos después de un error | Se genera un `id` nuevo. Si llegara el mismo `id` con otro contenido: error; no devuelve la venta anterior. |
| 10 | Escaneo con el cobro abierto | Se ignora y avisa. El total mostrado no cambia. |
| 11 | Dos pestañas abiertas | Comparten el id del dispositivo (en `localStorage`). El id de venta vive en la memoria de cada pestaña: nunca se comparte, así dos pestañas no confirman carritos distintos con el mismo id. El bloqueo de la fila del dispositivo evita números repetidos. |
| 12 | Venta sin turno abierto | La base la rechaza y la pantalla pide abrir turno (SUPUESTO NUEVO). |

### Numeración (corrección obligatoria)
- Primero bloquear la fila del dispositivo.
- Después verificar si la venta ya existe.
- Recién después numerar e insertar.
- Si se numera antes de verificar, un reintento deja huecos.

---

## 10. Seguridad

### Aislamiento entre negocios
- `negocio_id` en el token, puesto por el Custom Access Token Hook. El hook lee la tabla `cuentas`; no usa `user_metadata`, que el propio usuario puede editar.
- RLS en todas las tablas.

### Permisos por rol
| Acción | Caja | Jefe |
|---|---|---|
| Vender y cobrar | Sí | Sí |
| Fiado | Sí, si el módulo está activo | Sí, si el módulo está activo |
| Alta de productos desde la caja | Sí | Sí |
| Editar precio, nombre y activo de productos | Sí | Sí |
| Anular ventas, con motivo | Sólo del mismo día | De cualquier día |
| Abrir y cerrar turno | Sí | Sí |
| Ver ventas, caja del día y último turno cerrado | Sólo de hoy | Historial completo |
| Ver productos | Sí | Sí |
| Activar o desactivar el módulo fiado | No | Sí (decisión 39) |
| Anonimizar un cliente a pedido | No | Sí (decisión 40) |
| Ver el historial de auditoría | No | Sí |
| Estadísticas | No (fuera del MVP) | No (fuera del MVP, v2) |

- La base chequea el rol en cada función que lo requiera. Ocultar un botón no es seguridad.

### Escritura por tabla (propuesta, a validar con las pruebas)
- `productos`: alta y edición de precio, nombre y activo desde la app, por caja y jefe. Propuesta: por funciones de la base que registran el cambio en `historial` con cuenta y dispositivo, más un trigger que registra también lo que se cambie desde Supabase Studio.
- `clientes`: alta desde la app sólo con el módulo fiado activo. La anonimización la hace el jefe desde la app, por una función de la base.
- `negocios`, `cuentas`, `config_negocio`, `modulos`: ninguna escritura desde la app; sólo Felipe, desde Supabase Studio.
- `modulos_negocio`: sólo el módulo fiado, desde la app, y lo escribe el jefe por una función de la base. El resto, sólo Felipe.
- Tablas de ventas, anulaciones, `turnos`, `historial` y `dispositivos`: ninguna escritura directa; sólo las funciones.
- El id de dispositivo llega del navegador: cada función verifica que pertenezca al `negocio_id` del token.

### Función que confirma la venta
- `security definer`, con `search_path` vacío.
- Sin permiso de ejecución para `public` ni `anon`. Permiso sólo para `authenticated`, lo necesario.
- Toma el `negocio_id` del token, nunca de un parámetro.
- Nadie escribe directo en las tablas de ventas.
- Como saltea RLS, la prueba de aislamiento entre negocios es OBLIGATORIA.
- Propuesta: las mismas reglas para las demás funciones que escriben (anulación, turnos, alta de dispositivo, productos, anonimización).

### Ranking de productos sin código
- Función de sólo lectura con `security invoker`, sobre los últimos 30 días: RLS se aplica al usuario que llama.

### Funciones viejas tras un deploy
- Se revocan a las 48 horas.
- La app se fuerza a recargar si su versión queda bajo el mínimo.

### Módulos
- La base chequea el módulo donde corresponda. Ocultar algo en la pantalla no es seguridad.

### Cuentas
- Las crea Felipe: dos por kiosco, caja y jefe. El registro público de Supabase Auth debería estar apagado (sin verificar que se pueda; ver sección 15).
- La cuenta caja es compartida: cualquiera que tenga la contraseña opera la caja, edita precios y anula ventas del día, y ninguna acción queda asociada a una persona, sólo a la cuenta y al dispositivo. Es consecuencia aceptada de la decisión 7. El control es el historial de auditoría.
- Riesgo: la contraseña de la caja alcanza para registrar PCs sin límite (decisión 34, sin tope).
- Recuperación de contraseña: la hace Felipe a mano desde Supabase. No hay correo automático.
- Cierre remoto de sesiones: sin verificar (ver sección 15). Hasta verificarlo, no se puede asumir que cambiar la contraseña o desactivar una cuenta corte una sesión ya abierta.
- Recomendado (no decidido): 2FA en las cuentas de Supabase y Cloudflare de Felipe, que son el acceso de mayor poder del sistema. Mínimo de contraseña: revisar en Supabase Auth (sección 15).

### Backups
- Supabase Pro antes de cargar datos reales del primer kiosco.
- Recomendado (no decidido): restaurar un backup en un proyecto de prueba antes del primer kiosco real.

### Datos personales
- Los clientes del fiado son datos personales de terceros (Ley 25.326). Se guarda sólo nombre o alias y teléfono opcional.
- A pedido de la persona se anonimizan: nombre "Cliente suprimido", teléfono vacío. Las ventas se mantienen. Pendiente de consulta con abogado (sección 15).
- Sentry recibe sólo errores. No debe recibir nombres ni teléfonos de clientes, ni en eventos ni en breadcrumbs.

### Tarjetas
- La app no procesa ni guarda datos de tarjeta. Sólo registra el importe cobrado por posnet.

### Caché local
- Dexie guarda datos del catálogo en el navegador de la PC del kiosco. No es fuente de verdad: todo se revalida en la base. La caché se separa por `negocio_id` y se borra al cerrar sesión, porque la PC puede ser compartida.

---

## 11. Pruebas

Obligatoria por decisión:
- **Aislamiento entre negocios**, en especial sobre la función que confirma la venta (`security definer`, saltea RLS): una cuenta de un negocio, caja o jefe, no puede leer ni escribir datos de otro.

Pruebas que se derivan de las decisiones de este documento:
- Confirmar dos veces con el mismo `id` devuelve la misma venta, sin huecos ni números repetidos.
- Doble clic en confirmar deja una sola venta.
- Dos pestañas confirmando a la vez no repiten número.
- Error de red al confirmar: el reintento con el mismo `id` no duplica la venta.
- Precio distinto en la base: la función no graba nada y avisa.
- Anular dos veces devuelve la misma anulación.
- Permisos por rol: la caja no puede anular una venta de otro día; el jefe sí. La base lo rechaza aunque la pantalla no muestre el botón.
- Permisos por rol: la caja ve sólo ventas y caja de hoy; el jefe ve el historial completo.
- La caja del día resta la anulación el día en que se anula, en zona America/Argentina/Buenos_Aires, también cuando el jefe anula una venta de otro día.
- Turnos: la apertura registra cuenta, dispositivo y fecha y hora, sin monto inicial; el cierre muestra el total por medio de pago del turno.
- Turnos: la caja del día suma todos los turnos del día.
- Turnos: sin turno abierto, la base rechaza la venta (SUPUESTO NUEVO).
- Historial: cada cambio de precio o de producto queda registrado con cuenta, dispositivo, fecha y hora, valor anterior y valor nuevo; cada anulación con motivo; cada apertura y cierre de turno.
- Historial: no se puede editar ni borrar desde la app.
- Edición de productos: caja y jefe pueden cambiar precio, nombre y activo; el cambio sube `catalogo_version`.
- Alta rápida desde la caja: el producto queda marcado como "creado en caja".
- Anonimización: el nombre pasa a "Cliente suprimido", el teléfono queda vacío y las ventas del cliente siguen intactas.
- Permisos: la caja no puede anonimizar un cliente ni apagar el módulo fiado; el jefe sí. La base lo rechaza en la caja.
- Dispositivos sin tope: varias PCs del mismo kiosco se dan de alta solas con prefijos distintos y consecutivos (A, B, …); dos altas simultáneas no repiten prefijo.
- Códigos con letras: un código con letras que llega como escaneo agrega el producto; lo mismo tipeado a mano va a búsqueda por nombre.
- Módulo fiado apagado: el medio fiado no aparece en la caja, y la base rechaza un pago fiado y un alta de cliente.
- Módulo fiado sin fila en `modulos_negocio`: vale el valor por defecto (activo).
- Vuelto exacto sobre el efectivo, con pagos combinados.
- Importes siempre enteros.
- Búsqueda por nombre: desde 2 letras, inicio de palabra, sin tildes ni mayúsculas, máximo 8 resultados.
- Enter con la lista abierta no agrega una sugerencia sola; un escaneo con la lista abierta gana.
- Mismo código en menos de 150 ms se ignora.
- Ranking de productos sin código: cuenta ventas (no unidades) de los últimos 30 días, excluye anuladas y desactivados, desempata alfabético.
- El ranking con `security invoker` respeta RLS.
- Un módulo desactivado se rechaza en la base, no sólo en la pantalla.
- `catalogo_version` sube con cada cambio de catálogo y la app refresca la caché.
- Reintento con el mismo `id` después de cambiar un precio: devuelve la venta grabada, no falla por precio.
- Mismo `id` con contenido distinto: error; no devuelve la venta anterior.
- Un `id` de otro negocio no devuelve datos ajenos (prueba de aislamiento sobre la función de venta).
- Un id de dispositivo de otro negocio se rechaza.
- El total se recalcula en la base: un total enviado por el cliente que no coincide se rechaza.
- Suma de pagos distinta del total, o efectivo entregado menor que la parte en efectivo: se rechaza.
- Con el cobro abierto, un escaneo no agrega productos.
- Una cuenta de la app no puede escribir en `negocios`, `cuentas`, `config_negocio`, `modulos` ni `modulos_negocio`.
- Un rol `anon` no puede ejecutar la función de venta.

Recomendado (no decidido):
- Restaurar un backup en un proyecto de prueba antes del primer kiosco real.

---

## 12. Alcance del MVP y fuera de alcance

### Entra en el MVP
- Dos cuentas por kiosco con permisos por rol: caja y jefe.
- Pantalla de entrada genérica.
- Alta automática de dispositivos, sin tope.
- Turnos: apertura y cierre simple.
- Campo único de escaneo y búsqueda, con códigos con letras por escaneo.
- Productos sin código (grilla F2).
- Alta rápida de producto ante código inexistente, marcada como "creado en caja".
- Pantalla de precios y productos: editar precio, nombre y activo.
- Pagos combinados: efectivo, transferencia, tarjeta (sólo registro) y fiado (incluido parcial).
- Vuelto exacto.
- Módulo fiado, activo por defecto: lista de clientes con alta rápida y venta con parte fiada.
- Anonimización de clientes a pedido.
- Confirmación idempotente de la venta.
- Comprobante en pantalla.
- Anulación de venta completa: caja, del mismo día; jefe, de cualquier día.
- Caja del día por medio de pago.
- Historial de auditoría.
- Aviso de estado del abono.
- Config visual y módulos por negocio, cargados desde Supabase Studio.

### Fuera del MVP
- ARCA o factura electrónica (el sistema es de administración, decisión 36).
- Ticket impreso.
- Reportes y estadísticas (v2).
- Stock.
- Productos pesables.
- Descuentos.
- Integración con posnet.
- Mercado Pago integrado.
- Saldo por cliente, cobro de deuda y recordatorios del fiado.
- Modo offline y cualquier contingencia sin internet (cuaderno, cola).
- PIN y cajeros identificados por persona.
- Correo automático (Resend) y recuperación de contraseña automática.
- Cobro automático del abono.
- Panel de admin propio.
- Arqueo y conteo de efectivo.
- Edición de ventas.
- Favoritos.
- "Varios" con importe libre.

---

## 13. Supuestos a validar

Felipe no los confirmó.

- Precios en pesos enteros con IVA incluido.
- Sin control de stock.
- Sin descuentos ni promociones.
- Sin productos pesables.
- El catálogo de un kiosco entra en la caché sin problemas (no medido).
- El alta rápida de un producto nuevo guarda también el código escaneado.
- SUPUESTO NUEVO: la caja sólo vende con un turno abierto.
- SUPUESTO NUEVO: un turno que no se cierra queda abierto hasta la próxima apertura.
- SUPUESTO NUEVO: la caja ve ventas y caja del día de hoy. El jefe ve el historial completo.
- SUPUESTO NUEVO: si una PC abre un turno mientras tiene otro abierto, el anterior se cierra solo con la hora de la nueva apertura.

---

## 14. Pendiente

Puntos técnicos a medir:
- Umbral del escáner: la velocidad que separa escaneo de tipeo, y el tiempo para ignorar lecturas dobles (hoy 150 ms). A medir con el escáner real.
- Rendimiento de la función de ranking de productos sin código.
- Cómo se refresca la caché de Dexie cuando cambia `catalogo_version`.

Pendiente técnico menor:
- Prefijo de dispositivo después de Z: definir esquema.

---

## 15. Sin verificar

- Que el registro público de Supabase Auth se pueda apagar.
- Que exista cierre remoto de sesiones.
- El mecanismo para avisar "caja abierta en otra pestaña" (BroadcastChannel o Web Locks).
- El dominio .com.ar.
- Los costos de Supabase Pro y Sentry.
- Que el plan Free de Supabase no incluya backups diarios, y que Pro sí.
- Que el Custom Access Token Hook esté disponible en el plan que se use.
- Que cambiar la contraseña o desactivar una cuenta corte sesiones y refresh tokens ya abiertos.
- Mínimo de longitud de contraseña configurado en Supabase Auth.
- Que Sentry permita quitar datos personales de eventos y breadcrumbs.
- Roles de Ley 25.326 (responsable y encargado) y contrato con cada kiosco: consultar abogado.
- Consulta con abogado sobre la anonimización de clientes (Ley 25.326).

Constancia: la consulta con el contador sobre vender sin comprobante fiscal se hizo. Conclusión: el sistema es de administración, independiente de la facturación; sin comprobante fiscal ni ARCA (decisión 36).

---

## 16. Registro de revisión

Revisión del 2026-10-19: contradicciones, huecos y riesgos de integridad.
- Corregido: la función de confirmación chequea la idempotencia antes que los precios; el `id` de venta va en `sessionStorage`; un `id` con otro contenido ya no devuelve la venta anterior; el total y los pagos los valida la base; la búsqueda por `id` se filtra por `negocio_id`.
- Corregido: "Ninguna" en pendientes, ahora con la lista de decisiones abiertas (sección 14). Agregados: escritura por tabla y revocación (sección 10), validaciones de importes (sección 6), casos 9 y 10 (sección 9).
- Sin cambios en decisiones aprobadas. Lo que contradice la decisión 4 (sección 9, caso 1) queda como propuesta hasta que Felipe la acepte.

Revisión del 2026-10-19 (decisiones de Felipe A a Q):
- Decisiones de Felipe: las 14 pendientes resueltas; ver secciones 2 y 13.
- Cuentas: de "una cuenta = un kiosco" a dos cuentas por kiosco (caja y jefe) con permisos por rol. Nueva tabla `cuentas`; sale la relación usuario → negocio de una sola cuenta.
- Turnos con apertura y cierre simple, sin monto inicial ni arqueo; la caja se reporta por día. Nueva tabla `turnos`; las ventas guardan cuenta y turno.
- Historial de auditoría de precios, productos, anulaciones y turnos. Nueva tabla `historial`.
- Fiado pasa a módulo activo por defecto; regla de módulos sin fila: vale el valor por defecto de la nueva tabla `modulos`. Anonimización de clientes, con consulta a abogado.
- Sin contingencia sin internet: sale la pantalla "Sin confirmar" y la propuesta de `sessionStorage`; el `id` de venta vive en memoria; un F5 pierde la venta y el cajero revisa las ventas de hoy. Sección 9 reordenada: F5 es el caso 3; dos pestañas pasa al 11; nuevo caso 12 (venta sin turno).
- Códigos con letras por escaneo, según velocidad y Enter; alta automática de dispositivos sin tope, con el riesgo escrito en la sección 10. "Varias PCs" sale de fuera del MVP.
- Pantalla de precios y productos en el MVP; sale el supuesto de precio libre sin control.
- Sin Resend; sin comprobante fiscal (constancia del contador en la sección 15); comprobante sólo en pantalla: sale "pie de ticket" y "prefijo de ticket" pasa a prefijo del número de venta, que se muestra en pantalla.
- Revocación de funciones viejas fijada en 48 horas. Sección 14 queda sólo con puntos técnicos.
- Huecos resueltos: turno por PC (decisión 38); el módulo fiado lo apaga el jefe desde la app (39); la anonimización la hace el jefe (40).
