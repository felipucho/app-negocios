# Panel de operador, ficha de kiosco, avisos y notificaciones

Fecha: 2026-10-28
Estado: borrador, pendiente de aprobación de Felipe
Alcance: funciones nuevas del panel de operador y de las pantallas de jefe y caja: qué hace cada una, quién la usa, sus reglas, el orden en que se construyen y los problemas que pueden aparecer. Sin código. Cada fase tiene después su propio plan de implementación. Incorpora lo útil del informe de mejoras del 28/10/2026 (§15).
Depende de: `2026-10-28-planes-modulos-operador.md` (planes, excepciones, historial del operador y MFA). Respeta las decisiones 7, 13, 19 y 34 de `2026-10-19-venta-y-cobro-design.md` y la regla de que todo es personalizable por kiosco.

Convención, igual que el spec de planes: **[tomada]** lo pidió Felipe; **[propuesta]** es recomendación y falta confirmar; **supuesto** es algo no verificado. Los problemas van numerados (P1 a P61) y las decisiones abiertas también (§13), para poder citarlos.

## 1. Qué pidió Felipe [tomada]

1. Más funciones de administración en la cuenta de operador.
2. Una estructura mejor del panel.
3. Al tocar un kiosco, ver su resumen: cuánto tiempo lleva y qué plan tiene.
4. Mandarle un aviso.
5. Notificaciones en las pantallas de jefe y de caja.
6. Agregar todo lo posible, pensando en los problemas que pueden aparecer.

"Cuenta" se interpreta como cada kiosco cliente, con su cuenta de jefe y su cuenta de caja (decisión 1).

## 2. Qué hay hoy

Leído del código:

- **Panel** (`src/operador/PantallaOperador.tsx`): una sola pantalla larga. Arriba, la lista de kioscos con nombre y mails; en el medio, las casillas de módulos del kiosco elegido; al pie, el alta. No tiene buscador, resumen, plan ni historial. Si no tocaste ningún kiosco, muestra y deja cambiar los módulos del primero de la lista.
- **Funciones del operador** (`supabase/migrations/20261028130000_administrar_kioscos.sql`): listar kioscos, ver y cambiar módulos, crear kiosco y vincular cuentas. Todas chequean que quien llama sea operador. La lista ya trae el estado del abono y la fecha de alta, pero la pantalla no los muestra. No dejan historial ni piden MFA, a diferencia de lo que pide el spec de planes.
- **Alta** (`supabase/functions/alta-kiosco/index.ts`): crea el kiosco y los usuarios de jefe y caja, y muestra las claves una sola vez. No crea la configuración visible (nombre visible, logo, color): el kiosco nuevo arranca con la pantalla genérica.
- **Pantalla del kiosco** (`src/Kiosco.tsx`): lee el estado del abono una sola vez, al entrar. Si Felipe lo cambia, la PC no se entera hasta volver a entrar. Los módulos se releen cada 3 minutos y al volver a la pestaña (`src/catalogo/programar.ts`). El aviso de abono es una franja fija en la barra (`src/negocio/AvisoAbono.tsx`) y lo ven jefe y caja. El aviso de versión nueva va aparte, fuera de React (`src/app/version.ts`).
- **Caja**: es una cuenta compartida (dec. 7) que puede estar abierta en varias PCs (dec. 34). El campo de escaneo tiene siempre el foco (dec. 13) y los botones de la barra no se lo sacan.
- **PCs**: cada una se identifica con un id guardado en el navegador. Si se borran los datos del navegador, la misma PC se registra como nueva, con otro prefijo. Las PCs no informan su versión ni cuándo se conectaron por última vez.
- La app no tiene direcciones por pantalla: el botón "atrás" del navegador no vuelve a la pantalla anterior.
- No hay avisos, bandeja ni campana.
- Los planes todavía no existen en la base (el spec está en borrador).

## 3. Principios

1. **La base decide, la pantalla muestra.** Toda escritura pasa por una función que chequea quién llama (operador, jefe o caja) y de qué kiosco es. Ocultar algo en pantalla no es seguridad.
2. **Todo lo que hace el operador o el jefe y cambia un valor deja historial**, con motivo, valor anterior y valor nuevo. Incluye los cambios de límite de fiado y de módulos, que hoy no lo dejan (P91).
3. **Nada se borra.** Avisos, lecturas, pagos e historial se retiran o se archivan. Dos excepciones, por privacidad: los mensajes del jefe a la caja (§7.5) y las notas internas (§8.1).
4. **La caja nunca se bloquea ni pierde el foco** por un aviso (dec. 13 y 19).
5. **Sin tareas programadas.** Lo que depende de la fecha (aviso programado, vencimiento, abono por vencer, baja programada, alertas del día) se calcula al leer. No hace falta un proceso que corra a cierta hora. La excepción son los canales fuera de la app (fase 6).
6. **Una sola lectura periódica por PC.** Módulos, abono, avisos y alertas llegan juntos, cada 3 minutos y al volver a la pestaña.
7. **Personalizable.** Las funciones nuevas del kiosco son módulos apagados por defecto, que el plan incluye o no (§9).
8. **Reintentar no duplica.** Los ids de lo que se crea los genera el navegador, como en el resto del repo.
9. **Fechas en hora de Buenos Aires y con el reloj del servidor**, nunca con el de la PC.
10. **Medir antes de construir.** Una función entra si resuelve un problema real: cuántos kioscos lo sufren y con qué frecuencia, cuánto ahorra o qué pérdida evita, cuánto cuesta, qué riesgo de error agrega y cuánto soporte genera (criterio del informe de mejoras).
11. **Todo toggle declara su contrato.** Qué hace al prenderse y al apagarse, quién lo cambia, qué valida, qué queda en el historial y qué prueba lo cubre. Apagar no borra datos (P80).
12. **Cada ajuste tiene su ámbito.** Lo del dispositivo (impresora, lector, sonido, nombre de la PC, tamaño de texto) se guarda en el dispositivo; lo del negocio (medios, stock mínimo, permisos, políticas) en el negocio (P81, §9.1).
13. **Los cambios masivos muestran antes cuántos registros tocan.** Se confirman y quedan en el historial con la cantidad y el resultado (P83).
14. **Reportes y resúmenes se calculan en la base.** El navegador recibe el resultado, no las ventas para sumar. Lo heredan los reportes del jefe (decisión 37).

## 4. Estructura nueva del panel de operador

Pensado primero para el celular, porque Felipe lo va a tocar, y que también ande bien en la PC. [propuesta]

### 4.1 Secciones

| Sección | Para qué |
|---|---|
| Inicio | Lo que necesita atención hoy (§4.3). |
| Kioscos | Lista con buscador y filtros. Al tocar uno, su ficha (§5). |
| Avisos | Enviados, programados, borradores, plantillas y pedidos de ayuda (§6 y §7.6). |
| Planes | Definir planes y ver cuántos kioscos tiene cada uno (spec de planes). |
| Historial | Todo lo que hizo el operador, con filtros (§8.7). |
| Nuevo kiosco | Botón fijo que abre el alta en su propia pantalla, en lugar de tenerla al pie de todo. |

En el celular, el menú va abajo; en la PC, a la izquierda.

### 4.2 Navegación

- Cada pantalla tiene su dirección, por ejemplo "ficha del kiosco X, pestaña Avisos". El botón "atrás" del celular vuelve a la pantalla anterior en lugar de salir de la app, y recargar deja donde estabas.
- En la PC, lista a la izquierda y ficha a la derecha. En el celular, la ficha ocupa toda la pantalla, con "← Kioscos" arriba.
- Nada queda elegido por defecto (P49).
- El nombre del kiosco queda fijo arriba de la ficha mientras bajás, para saber siempre sobre cuál estás actuando.
- El panel relee los datos al volver a la pestaña y después de cada acción.

### 4.3 Inicio

Contadores. Al tocar uno, se abre la lista ya filtrada.

- Kioscos activos, en gracia y suspendidos; desde la fase 5, también con baja programada o hecha.
- Altas del mes.
- Sin actividad hace 7 días o más: riesgo de que dejen de usar la app.
- Nunca vendieron: alta hecha y ninguna venta, un problema de puesta en marcha.
- Recordatorios de hoy (§8.1).
- Problemas de datos del chequeo de salud (§8.9).
- PCs con versión vieja de la app (fase 3).
- Avisos urgentes sin leer hace más de 48 horas (fase 3).
- Pedidos de ayuda sin responder (fase 4).
- Abonos que vencen en los próximos 7 días y vencidos sin pago registrado (fase 5).

### 4.4 Lista de kioscos

- Cada fila: nombre, plan, estado del abono (con texto, no sólo color), antigüedad ("3 meses"), última actividad ("hoy 14:20", "hace 9 días") e insignias (aviso urgente sin leer, pedido de ayuda, demo, baja programada).
- Buscador por nombre del kiosco y por mail del jefe o de la caja.
- Filtros: plan, estado del abono, actividad (vendió hoy, sin actividad hace 7 días o más, nunca vendió), módulo prendido, etiqueta (rubro, zona), real o demo.
- Orden: nombre, más nuevos, más antiguos, última actividad, próximo vencimiento.
- Carga por partes cuando haya más de 50 kioscos.
- Kioscos demo o de prueba (por ejemplo, los que crea `tests/soporte/seed-demo.mts`, uno por corrida): marcados, ocultos por defecto, fuera de los contadores y de los avisos masivos.

### 4.5 Estructura interna (sin código)

- Una carpeta por sección del panel: inicio, kioscos (lista, ficha y pestañas), avisos, planes e historial. Hoy todo está en un archivo.
- La campana, la franja y la bandeja son una sola pieza compartida por jefe y caja, que recibe el rol y la PC.
- El panel se carga aparte, con import dinámico (lo propone el spec de planes), para que las PCs de caja no lo descarguen.
- Los textos de error del panel van en un solo diccionario tipado, como propone el spec de planes, en lugar de uno por pantalla.

## 5. Ficha del kiosco (al tocarlo)

### 5.1 Resumen

| Dato | Cómo se muestra | Detalle |
|---|---|---|
| Nombre | El nombre y, si es distinto, el nombre visible. | Si falta la configuración visible, una alerta ofrece crearla. |
| Antigüedad | "Cliente hace 3 meses y 12 días (desde el 16/07/2026)". | Sale de la fecha de alta. "Cliente desde" se puede corregir (kioscos migrados o con prueba previa), con motivo e historial (P32). Se cuenta en meses calendario, hora de Buenos Aires. |
| Plan | "Básico + 2 extras (Stock, Proveedores)", y desde cuándo. | Fase 2. Hasta entonces dice "Sin plan" (P36). "Plan discontinuado" si ya no se ofrece. |
| Abono | Activo, en gracia o suspendido, y desde cuándo. | Próximo vencimiento y último pago, en la fase 5. |
| Uso | En uso, poco uso o sin uso, según los días con ventas de los últimos 30. | |
| Módulos | Los activos, como etiquetas. Los que no funcionan por una dependencia, marcados. | |
| Cuentas | Mail del jefe y de la caja, último ingreso de cada uno, si está bloqueada. | El último ingreso de la caja engaña (P57): la sesión queda abierta días. La actividad real sale de ventas y turnos. |
| PCs | Cantidad. Por cada una: nombre, prefijo, alta, última vez vista, versión y si tiene turno abierto. | "Vista" y versión desde la fase 3. |
| Actividad | Última venta; cantidad de ventas en 7 y en 30 días; días con ventas; turnos abiertos ahora; último cierre. Una tira de 30 días con y sin ventas. | Sin montos ni clientes (decisión 2). |
| Puesta en marcha | "4 de 6": configuración visible, primera PC, productos cargados, primer turno, primera venta, primer cierre. | Sirve para acompañar a un kiosco nuevo. |
| Avisos | Último aviso enviado y si lo leyeron; urgentes sin leer. | Fase 3. |
| Pedidos de ayuda | Abiertos y el último. | Fase 4. |
| Notas | Contacto del dueño, rubro, la última nota y los recordatorios. | Sólo las ve el operador. |
| Alertas para Felipe | "Nunca abrió un turno", "Sin actividad hace 9 días", "PC con versión vieja", "Falta la cuenta de caja", "Falta la configuración visible". | Salen del chequeo de salud (§8.9). |

### 5.2 Pestañas

1. **Resumen** (§5.1).
2. **Plan y módulos**: plan, extras y quitados con motivo, y cada módulo con derecho, uso, activo y qué le falta (spec de planes). Cambiar de plan muestra antes qué se gana y qué se pierde.
3. **Cuentas y PCs**: acciones de §8.2 y §8.3.
4. **Avisos**: los enviados a este kiosco, con la lectura por cuenta y por PC. "Mandar aviso" con el kiosco ya elegido.
5. **Datos**: nombre, nombre visible, logo, color, etiquetas, "cliente desde", demo, contacto, notas y recordatorios.
6. **Historial**: los cambios de este kiosco, del operador y del jefe, por páginas.

### 5.3 Acciones rápidas

Mandar aviso · Cambiar plan · Prender o apagar un módulo · Cambiar el estado del abono · Registrar un pago · Restablecer una clave · Abrir WhatsApp del dueño · Programar la baja.

Las graves (baja, restablecer clave, cerrar sesiones) vuelven a pedir el código de MFA y que escribas el nombre del kiosco (P50).

## 6. Avisos de Felipe a los kioscos

### 6.1 Qué tiene un aviso

- **Título** (hasta 80 caracteres) y **texto** (hasta 1000). Sólo texto: sin formato ni enlaces tocables. Una dirección web se ve como texto (P11, P14). [propuesta]
- **Prioridad**:
  - **Info**: va a la bandeja y suma a la campana. Sin franja.
  - **Importante**: además, franja en la barra hasta que alguien toque "Entendido".
  - **Urgente**: franja destacada. En la caja vuelve a aparecer al abrir cada turno, en cada PC, hasta que vence.
  - Ninguna bloquea la caja ni tapa la venta (dec. 19).
- **Categoría**: abono, corte o mantenimiento programado, novedad de la app, cambio de plan o de precio, recordatorio u otro. Sirve para filtrar y para las plantillas.
- **Para quién dentro del kiosco**: jefe, caja o los dos.
- **Destinatarios**: un kiosco, varios elegidos a mano o un grupo (todos, por plan, por estado del abono, por etiqueta o por módulo prendido). Nunca kioscos demo ni dados de baja.
- **Desde y hasta**: por defecto, desde ya y por 30 días; los urgentes, 7. Un aviso programado aparece en la primera relectura después de su hora.
- **Confirmación**: "Entendido" opcional en info, obligatorio en importante y urgente.
- **Firma fija**: "Aviso de Felipe". Un mensaje del jefe nunca se ve como un aviso de Felipe, ni al revés.
- **Pie fijo**: el contacto oficial de Felipe (se carga una vez en el panel) y "Felipe nunca te va a pedir tu contraseña" (P11). [propuesta]

### 6.2 Escribir y enviar

- Vista previa de cómo se ve en la caja y en el jefe, en celular y en PC.
- Plantillas con huecos (nombre del kiosco, fecha, plan): "Abono vencido", "Corte programado", "Función nueva", "Cambio de plan". No deja enviar con un hueco vacío.
- Antes de enviar: "Se va a mandar a 14 kioscos (jefe y caja)". Con más de 5 kioscos, hay que escribir el número para confirmar (P48). [propuesta]
- Borradores.
- Tocar dos veces o reintentar sin red no lo duplica (P31).
- **La lista de destinatarios se fija al enviar**: un kiosco que se da de alta después no lo recibe; si hace falta, como en un corte programado, se reenvía (P26). [propuesta]

### 6.3 Después de enviar

- **Estados**: borrador, programado, publicado, vencido y retirado.
- **Lecturas**: por kiosco, quién lo vio y cuándo (jefe; caja en la PC A; caja en la PC B), y quién tocó "Entendido". Totales, como "9 de 14 lo leyeron".
- **Editar** guarda una versión nueva y el aviso muestra "editado". Cada confirmación queda atada a la versión que se leyó. Si el cambio es de fondo, Felipe marca "pedir confirmación otra vez" y la franja vuelve a aparecer (P28).
- **Retirar**: sale de todas las pantallas en la siguiente relectura, hasta 3 minutos después, y queda en el historial con motivo. No se borra.
- **Reenviar a quienes no lo leyeron** y **copiar como nuevo**.
- **WhatsApp**: abre WhatsApp con el teléfono del dueño (de las notas) y el texto del aviso. Sirve para urgentes sin leer. Por ese canal no hay confirmación de lectura.

### 6.4 Límites

- En la franja, un aviso a la vez, con "1 de 3" para pasar al siguiente. El resto queda en la bandeja (P7).
- El aviso del abono no se escribe a mano cada mes: es automático (§7.3).

## 7. Notificaciones en jefe y caja

### 7.1 Dónde se ven

- **Campana** en la barra, con el número de no leídas.
- **Franja** debajo de la barra para los importantes y urgentes. Reemplaza a la franja de abono de hoy.
- **Bandeja**: la sección "Avisos" en el menú del jefe; en la caja, un panel que se abre desde la campana. Cada fila tiene fecha, origen (Felipe, Sistema, Jefe o Alerta), texto y estado (nueva, leída, confirmada o vencida). Los vencidos pasan a "Anteriores" y se ven durante 90 días.
- El jefe ve también lo que se le mandó a la caja y qué PC lo leyó.

### 7.2 Reglas de la caja

Son las más delicadas, porque la caja se usa mientras se vende.

1. **No saca el foco del campo de escaneo** (dec. 13). La campana, la franja y sus botones no toman el foco al aparecer ni al tocarlos, igual que los botones de la barra hoy (P1).
2. **Nada tapa la venta** ni pide una respuesta para seguir vendiendo (P4).
3. **No mueve los botones.** La franja usa un lugar reservado de la barra. Un cartel que aparece y corre "Cobrar" justo cuando el cajero lo va a tocar le hace tocar otra cosa (P3).
4. **Con una venta en armado, el aviso espera**: sólo sube el número de la campana. La franja aparece cuando la venta está vacía (P10).
5. **Sin teclado.** Ningún aviso responde a Enter, porque el escáner manda un Enter después de cada código. "Entendido" se toca con el mouse o el dedo, como "Cobrar" (P2).
6. **Cuenta compartida.** "Leído" y "Entendido" se anotan por PC y por turno, no por cuenta. Lo que leyó el cajero de la mañana en la PC A no desaparece para la PC B, y los urgentes vuelven a aparecer al abrir cada turno (P6).
7. **Sin sonido.** [propuesta]
8. **Texto corto en la franja**: una línea y "Ver". El texto completo, en la bandeja.
9. **Lo importante del negocio va al jefe.** La caja recibe lo operativo: cortes, proveedores, precios cambiados y mensajes del jefe. Si un cajero toca "Entendido" sin leer, el jefe igual lo tiene en su bandeja (P5).
10. **Con una venta en armado, nada cierra la sesión ni recarga la app.** El vencimiento por inactividad y las actualizaciones esperan a que la venta esté vacía (P65, P67).

### 7.3 Avisos del sistema

Los arma la app sola, sin que nadie los escriba.

| Aviso | Para | Aparece | Se va |
|---|---|---|---|
| Abono en gracia | Jefe | Felipe cambia el estado | Vuelve a activo |
| Abono suspendido | Jefe y caja | Felipe cambia el estado | Vuelve a activo |
| Abono por vencer | Jefe | 5 días antes del vencimiento (fase 5) | Se registra el pago |
| Felipe cambió el plan o un módulo | Jefe ("Felipe activó Stock") | El operador lo cambia | Al leerlo |
| Sección nueva o quitada | Caja ("Se agregó la sección Proveedores") | Cambian los módulos | Al leerlo |
| Versión nueva de la app | Todos | Como hoy | Al recargar |
| Baja programada | Jefe | 15, 7 y 1 día antes | Se cancela la baja |
| Sin conexión | La PC | Falla la relectura | Vuelve la red |

- El abono en gracia ya no le llega a la caja (decisión 21, P61): hoy lo ven los dos.
- "Sin conexión" no se guarda: es el estado de la PC ("Los avisos pueden estar atrasados. Última revisión: 10:42").

### 7.4 Alertas del negocio (módulo Alertas)

La base las arma con los datos del propio kiosco. Hay dos tipos:

- **De estado**: se calcula al leer y desaparece sola cuando se resuelve. No hay duplicados ni alertas que ya no valen (P30).
- **De evento**: pasa una vez, se guarda con su id y queda en la bandeja como leída o no leída (P31).

| Alerta | Para | Necesita | Aparece | Se va | Tipo |
|---|---|---|---|---|---|
| Productos bajo el mínimo | Jefe; caja, si el jefe quiere | Stock | Hay productos con cantidad igual o menor al mínimo | Se reponen | Estado, agrupada ("8 productos") |
| Proveedor viene hoy | Jefe y caja | Proveedores | Hay una visita prevista para hoy | Se marca "llegó" o "no vino", o termina el día | Estado |
| Visita sin marcar | Jefe | Proveedores | Una visita de un día anterior sigue "prevista" | Se marca | Estado |
| Turno abierto desde otro día | Jefe y la caja de esa PC | — | Un turno abierto en un día operativo anterior | Lo cierra el jefe con motivo, o la caja de esa PC (P62) | Estado |
| Diferencia de caja | Jefe | Movimientos de caja | Un cierre con diferencia mayor al umbral | Al leerla | Evento |
| Retiros repetidos | Jefe | Movimientos de caja | Tres o más retiros del mismo tipo en el día, por encima del umbral. El texto dice cuántos, sin nombrar a nadie | Termina el día | Estado |
| Anulaciones del día | Jefe | — | Hoy hubo más anulaciones que el umbral | Termina el día | Estado |
| Ventas con importe libre | Jefe | Varios | Hoy hubo ventas de "varios" | Termina el día | Estado |
| Productos creados en la caja | Jefe | — | Hubo altas desde la caja en los últimos 7 días | Pasan los 7 días | Estado |
| Fiado sobre el límite | Jefe | Fiado | Clientes con saldo mayor a su límite | Pagan | Estado |
| Deudas sin movimiento | Jefe | Fiado | Clientes con deuda y sin pagos hace más de 30 días | Pagan | Estado |
| Precios actualizados | Caja | Precios | El jefe aplicó un aumento | Pasan 24 horas | Evento ("El jefe actualizó 25 precios") |
| Catálogo atrasado | Esa PC | — | La PC no sincroniza hace más de 30 minutos | Sincroniza | Estado |

- El jefe prende o apaga cada alerta y elige los umbrales en "Preferencias de alertas", por ejemplo "diferencia de caja mayor a $500". Arrancan prendidas las más útiles. [propuesta]
- Las de estado se calculan como mucho cada 15 minutos, o al abrir la bandeja, y no en cada relectura de 3 minutos (P44).
- Las alertas con nombres de clientes (fiado) las ve sólo quien ya ve esos clientes hoy. Felipe, nunca.

### 7.5 Mensajes del jefe a la caja (módulo Mensajes a la caja)

- El jefe escribe un mensaje corto, de hasta 300 caracteres: "Hoy cerramos a las 20", "Al de bebidas se le paga con lo de la caja".
- Siguen las reglas de la caja (§7.2). Vencen al terminar el día o a los 7 días, como elija el jefe.
- El jefe ve qué PC lo leyó.
- Felipe no los ve: son internos del kiosco. [propuesta]
- Se borran solos a los 90 días. Al escribir, la pantalla avisa "no pongas datos de clientes" (P23). Queda el rastro de que hubo un mensaje, sin el texto.

### 7.6 Pedir ayuda (del jefe a Felipe)

- Botón "Necesito ayuda" en la bandeja del jefe, y "Tengo una duda" al lado del "Entendido" de cada aviso.
- Le llega a Felipe en Inicio y en Avisos, con kiosco, PC, versión de la app y hora. Texto libre de hasta 300 caracteres. Tipo: crítico (no se puede cobrar), consulta o pedido de función. El crítico sube arriba en Inicio (decisión 25).
- Felipe contesta con un aviso a ese kiosco y queda el hilo. Estados: abierto, respondido y cerrado.
- Hasta 3 pedidos abiertos por kiosco (P20). Al escribir: "no pongas contraseñas ni datos de clientes" (P24).
- El pedido incluye un código de diagnóstico: versión de la app, PC, hora y último código de error, sin datos personales ni tokens (fase 4).
- La caja no pide ayuda al principio: le avisa al jefe (decisión 19).

### 7.7 Cómo llegan

| | Relectura cada 3 minutos (recomendada) | Tiempo real | Push del navegador |
|---|---|---|---|
| Demora | Hasta 3 minutos, y al volver a la pestaña | Segundos | Segundos, aun con la app cerrada |
| Qué hace falta | Ya existe para catálogo, módulos y versión | Una conexión abierta por PC, reconexión con mala red, cuidado con los permisos | Permiso del usuario; en iPhone, sólo con la app instalada; claves y un servicio que envíe |
| Sirve para | Todo lo de este spec | Nada de esto necesita segundos | Que el jefe se entere sin abrir la app |

Recomendación: relectura ahora, push sólo para el jefe en la fase 6, tiempo real no (decisión 9).

- **Una sola lectura de novedades por PC** trae módulos, estado del abono, avisos y alertas. Así el abono se relee, cosa que hoy no pasa (P43).
- **Sin red**, la pantalla muestra la última lista guardada con "actualizado a las 10:42". "Leído" y "Entendido" se guardan y se mandan cuando vuelve la red, sin duplicarse (P37).
- **"PC vista" y versión**: la relectura anota que la PC está viva y qué versión tiene, como mucho una vez cada 15 minutos por PC, para no escribir en la base cada 3 minutos (P44).
- "Hace 5 minutos" se calcula con el reloj del servidor (P38).

### 7.8 Menú del jefe

Hoy la barra del jefe llega a 12 botones en una fila, y con "Avisos" serían 13. Propuesta: agruparlos en Vender (Caja, Caja del día, Movimientos), Mercadería (Productos, Stock, Proveedores, Precios), Clientes (Fiado, Anonimizar) y Administración (Avisos, Historial, Módulos, Calibrar escáner). La caja no cambia: sus botones quedan donde están, porque el cajero los usa de memoria. La campana se suma en el lugar reservado (decisión 20).

## 8. Más funciones de administración

### 8.1 Kiosco

- **Datos visibles**: nombre visible, logo y color, desde el panel (hoy sólo desde Studio). El alta pide también el nombre visible y crea la configuración, así el kiosco nuevo no arranca con la pantalla genérica.
- **Logo**: se sube una imagen PNG, JPG o WebP de hasta 300 KB al almacenamiento del proyecto, el único origen del que la app acepta imágenes (`src/negocio/config.ts`). SVG no (P18). [propuesta]
- **Etiquetas** (rubro, zona), **"cliente desde"** y **demo**.
- **Contacto del dueño** (nombre, teléfono, dirección) y **notas internas**, con fecha. **Recordatorios** con fecha ("llamarlo el lunes"), que aparecen en Inicio ese día. Las notas nunca llegan a la app del kiosco. Se pueden borrar, porque tienen datos personales del dueño; el borrado queda en el historial, sin el texto (P22).
- **Programar la baja** (el cliente se va), con fecha. Antes llegan avisos automáticos (§7.3). Desde esa fecha nadie del kiosco puede entrar, y ve un mensaje claro. La baja no se confirma mientras haya turnos abiertos: los cierra el jefe o el operador con motivo (P64). Los datos quedan durante el plazo de la decisión 11. **Reactivar** deja todo como estaba. Nunca es automática por deuda (dec. 19). Un kiosco con ventas no se puede borrar: la base ya lo impide.
- **Descargar los datos**: la descarga la hace el jefe desde su pantalla ("Descargar mis datos": productos, ventas y clientes), no Felipe, que no ve ventas ni clientes (P25, decisión 14).

### 8.2 Cuentas (jefe y caja)

- **Restablecer la clave**: genera una nueva, la muestra una sola vez (como el alta) y cierra las sesiones abiertas de esa cuenta. Si la pantalla se recarga antes de anotarla, no vuelve a verse: se restablece otra vez y queda en el historial (P69). Lo mismo vale para las claves del alta. En la caja, avisa antes: "Se va a cerrar la sesión de la caja en 2 PCs. Una venta en armado se pierde". Conviene hacerlo fuera de horario.
- **Mandar un enlace de recuperación por mail**, como alternativa. El correo que trae Supabase tiene un límite bajo de envíos por hora (supuesto: verificarlo en el dashboard). Si se usa seguido, hace falta un servidor de correo propio (P47).
- **Cambiar el mail** de una cuenta (el dueño cambió de correo). Chequea que el nuevo no esté usado; el viejo deja de servir.
- **Bloquear y desbloquear** una cuenta sin borrarla. La base lo chequea en cada función, así el corte es inmediato y no hay que esperar a que venza el token, que dura hasta una hora.
- **Cerrar sesiones** (celular robado, cajero que se fue): corta la renovación. Junto con bloquear, corta todo al instante.
- Límite actual: una cuenta de jefe y una de caja por kiosco. Un socio con su propia clave, o una segunda caja, no se pueden hacer hoy (fuera de alcance).

### 8.3 PCs

- Lista con nombre, prefijo, alta, quién la registró, última vez vista, versión y turno abierto.
- **Nombre amigable** ("Mostrador", "Depósito").
- **Dar de baja una PC** (robada, rota, reemplazada): ya no puede abrir turnos ni vender. Si tiene un turno abierto, la baja no se confirma hasta que lo cierre el jefe o el operador con motivo (P63; decisión 27). La baja no corta el acceso de la cuenta: si el equipo se robó, además hay que cerrar sus sesiones o restablecer la clave (§8.2; P66). Su prefijo no se vuelve a usar, porque está en los números de sus ventas.
- Las PCs fantasma (la misma PC registrada otra vez porque se borró el navegador) se resuelven dando de baja las viejas (P34).
- **Dar de baja sus propias PCs** lo puede hacer el jefe desde su pantalla (fase 3), con la misma regla del turno abierto. El operador las da de baja desde el panel (fase 5).

### 8.4 Plan y módulos

Lo define el spec de planes. Se suma:

- Prender y apagar módulos (ya existe) pasa a pedir motivo y a dejar historial.
- **Probar un módulo**: "Stock gratis por 14 días" es un extra con vencimiento. Tres días antes, aviso al jefe; al vencer, se apaga sin borrar datos. Se calcula al leer, sin tarea programada.
- **Cambio de plan programado**, por ejemplo para el 1° del mes, con aviso previo al jefe.

### 8.5 Abono

- **Cambiar el estado** (activo, gracia, suspendido) desde el panel, con motivo e historial. Nunca bloquea la caja (dec. 19).
- **Vencimiento** y día de cobro.
- **Registro de pagos**: fecha, monto, medio, período que cubre y nota. No cobra nada: anota lo que Felipe cobró por fuera, que sigue siendo como hoy (decisión 12).
- **Sugerencias, no cambios automáticos**: "3 kioscos vencidos hace más de 10 días: ¿pasarlos a gracia?". Felipe decide (decisión 18).
- **Precio del plan y descuento por kiosco**, sólo para la ficha y los contadores. El jefe no lo ve (decisión 13).

### 8.6 Avisos

Ver §6. Las plantillas se editan desde el panel.

### 8.7 Historial y auditoría

- Todo lo que hace el operador: quién, qué, cuándo, a qué kiosco, con qué motivo, valor anterior y valor nuevo. Filtros por kiosco, tipo y fecha. Exportar a planilla.
- También cuándo entró el operador al panel.
- El jefe ve en su historial los cambios de Felipe sobre su kiosco, rotulados "Felipe (operador)", como dice el spec de planes.
- Sólo se agrega, como todo historial (P35).

### 8.8 Seguridad del operador

- MFA para abrir el panel, cuando el proyecto lo tenga (spec de planes).
- Volver a pedir el código para las acciones graves: baja, restablecer clave, cerrar sesiones y avisos a más de 5 kioscos. [propuesta]
- Cerrar el panel tras 30 minutos sin uso. El celular de Felipe pasa a ser la llave de todos los kioscos. [propuesta]
- Si algún día hay un segundo operador, harán falta roles (soporte: ver y avisar; administrador: todo). Fuera de alcance.

### 8.9 Chequeo de salud

El panel busca solo estos problemas y los muestra en Inicio y en la ficha:

- Kiosco sin cuenta de jefe o de caja.
- Kiosco sin ninguna cuenta: el alta falló después de crearlo y no se pudo deshacer (P33).
- Usuario que no es cuenta de ningún kiosco ni operador: el alta lo creó, después falló, y el borrado tampoco anduvo. No puede entrar y ocupa el mail (P33).
- Kiosco sin configuración visible.
- Kiosco sin plan (desde la fase 2).
- Turnos abiertos hace más de 48 horas.
- PC dada de baja con un turno abierto (P63).
- PCs con versión menor a la mínima.
- Avisos urgentes vencidos sin que nadie los leyera.
- Más PCs activas que el tope de alerta (P66).

Además, un control del sistema, no de un kiosco: la última restauración verificada tiene más de 6 meses. La fecha la anota Felipe después de cada prueba de restauración; no es una señal automática (P74).

"Arreglar" aparece sólo donde el arreglo es seguro, como borrar un usuario suelto sin nada asociado. En el resto, el panel explica qué pasa.

### 8.10 Versión mínima de la app

- Subir la versión mínima desde el panel (hoy, desde Studio). Eso hace recargar todas las PCs.
- No deja poner una mínima mayor que la versión publicada, la del propio panel. Si no, todas las PCs quedarían con el aviso de "versión trabada" (P53).

### 8.11 Importar el catálogo inicial (fase 5) [propuesta]

- Sólo el operador, al dar de alta un kiosco o cuando llega con una planilla.
- Vista previa: cuántos productos se crean, cuántos se actualizan y cuáles tienen errores (columnas, precios, códigos repetidos).
- Nunca reemplaza el catálogo entero: los códigos repetidos se muestran y no se duplican. Se confirma antes de crear filas y se toma una copia antes de importar.
- Queda en el historial con la cantidad importada y el nombre del archivo, sin datos personales.
- Decisión 36. Las reglas de productos (unicidad del código, precios) son las del diseño de venta.

## 9. Módulos y planes

| Función | ¿Es módulo? | Por qué |
|---|---|---|
| Avisos de Felipe y del sistema | No: llegan siempre | Felipe tiene que poder avisar siempre, como hoy con el abono. |
| Campana, franja y bandeja | No: base | Sin ellas no hay dónde ver los avisos. |
| Pedir ayuda | No: base | Es el soporte de Felipe. |
| Descargar mis datos | No: base | Los datos son del dueño. |
| Alertas del negocio | Sí: Alertas | Cada alerta necesita, además, su módulo de origen: sin Stock no hay alerta de stock. |
| Mensajes a la caja | Sí: Mensajes a la caja | |
| Push al celular del jefe | Sí (fase 6) | |

Los módulos nuevos arrancan apagados y los planes los incluyen o no. El jefe los prende dentro de su plan. La base chequea el módulo, no sólo la pantalla.

### 9.1 Configuración del jefe (mapa) [propuesta]

La pantalla de configuración del jefe agrupa lo que ya existe y suma lo que falta. Cada grupo aparece sólo cuando existe su módulo (decisión 40). Son pantallas sobre reglas que ya están en otros specs: no cambian el comportamiento de la caja.

| Grupo | Qué tiene | Fase | Dónde se define |
|---|---|---|---|
| Negocio | Nombre visible, logo, color, dirección, teléfono | 1 (lo edita Felipe); 3 (lo edita el jefe) | §8.1. Zona horaria fija en Buenos Aires (principio 9). Día comercial: hoy es medianoche; spec aparte |
| Caja y ventas | Medios de pago, pagos mixtos, número de operación de transferencias, descuentos, favoritos, importes libres | Según el módulo de cada uno | Cada módulo; ver §15 |
| Turnos y arqueo | Fondo inicial, conteo obligatorio, umbral con motivo, cierre de turnos abandonados | 4 (cierre del jefe); el resto, spec de arqueo | §7.4, P62 |
| Productos y stock | Categorías, unidades, mínimos, redondeo, stock negativo (decisión 45) | Según el módulo | Spec de stock y de productos, a crear |
| Fiado y clientes | Módulo, límites, campos requeridos, recordatorios manuales | Según el módulo | Spec de fiado, a crear; hoy las reglas están en el diseño de venta |
| Usuarios y dispositivos | Ver PCs, renombrarlas, dar de baja, tope de alerta | 3 (PCs del jefe); 4 (tope) | §8.3, P66. Crear usuarios o cambiar permisos: no (decisiones 33 y 34) |
| Preferencias personales y de la PC | Sonido del pitido y de los avisos, tema, tamaño de texto, orden de favoritos | Cuando haga falta | Spec aparte; ámbito de dispositivo (principio 12) |
| Comprobantes | Nombre, pie, ancho de impresión | Cuando exista la impresión | Spec aparte (decisión 38) |
| Alertas | Prender cada alerta y sus umbrales | 4 | §7.4 |
| Copias | Texto fijo sobre el plan del proveedor. No hay indicador automático | 5 | §8.9, P74 |
| Importar y exportar | Exportar: el jefe, con aviso de datos personales. Importar: sólo el operador | 3 (exportar); 5 (importar) | §8.1, §8.11, P72 |
| Suscripción | Estado del abono, canal de soporte, módulos. Renovación, vencimientos y pagos. Sin precio del plan (decisión 13) | 3 (estado y canal); 5 (vencimientos y pagos) | §8.5 |
| Integraciones | Impresora y lector, por dispositivo. Nunca claves en el frontend | Cuando exista | Spec aparte |
| Diagnóstico | Versión y fecha de la última actualización, estado de servicios, código de diagnóstico | 3 (versión); 4 (código) | §7.6 |

Reglas de la pantalla:

- Lo personal se separa de lo del negocio: el cajero cambia tamaño de texto y sonido; sólo el jefe cambia módulos, límites, permisos, precios masivos y políticas (P81).
- Cada opción dice qué cambia y qué pasa con los datos existentes al apagarla (P80).
- "Restaurar pantalla" sólo toca preferencias personales. No hay "restablecer negocio" por ahora: cada cambio comercial se hace campo por campo, con historial (P82).
- Los cambios masivos muestran cuántos registros tocan antes de confirmar (P83).
- Sin exceso de opciones: no se exponen parámetros internos ni flags experimentales (P84).
- Deshacer sólo en cambios reversibles sin efectos, como prender y apagar un módulo (fase 2). Lo demás se corrige con otro cambio, con historial.

## 10. Problemas posibles

### Caja

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P1 | Aparece un aviso mientras se escanea | El código va a parar a otro lado | El aviso no toma el foco (§7.2) |
| P2 | El escáner manda Enter | Cierra o confirma un aviso sin querer | Los avisos no responden al teclado |
| P3 | La franja corre los botones | El cajero toca otra cosa | Lugar reservado en la barra |
| P4 | Una ventana tapa la venta | Se frena la caja | Nada que tape en la caja |
| P5 | El cajero toca "Entendido" sin leer | Nadie se entera | Lo importante también le llega al jefe |
| P6 | Cambia el cajero | El de la tarde no ve lo de la mañana | Lectura por PC y turno; urgentes al abrir cada turno |
| P7 | Llegan muchos avisos juntos | Se ignoran | Uno por vez en la franja; alertas agrupadas |
| P8 | La PC está sin red cuando sale un urgente | Llega tarde | Llega al volver la red; para lo crítico, WhatsApp |
| P9 | La app se recarga por versión nueva mientras se lee un aviso | Se pierde el aviso | Queda guardado en la bandeja |
| P10 | Hay una venta en armado | El aviso distrae | Espera a que la venta esté vacía |

### Seguridad

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P11 | Roban la cuenta de operador | Control de todos los kioscos y avisos a todos pidiendo claves | MFA, código otra vez para masivos, firma y pie fijos, sin enlaces |
| P12 | Un kiosco lee los avisos de otro | Fuga de datos | La base filtra por kiosco; prueba de aislamiento |
| P13 | Alguien marca leído en nombre de otro | Constancia falsa | La base anota la cuenta y la PC de quien llama, no lo que dice la pantalla |
| P14 | Texto con código malicioso | Se ejecuta en la caja | Sólo texto; la pantalla nunca interpreta formato |
| P15 | Una clave nueva queda a la vista | Alguien la copia | Se muestra una vez, sin caché; nunca por aviso ni por mail |
| P16 | Acciones sin rastro | No se sabe quién hizo qué | Historial obligatorio, con motivo |
| P17 | `alta-kiosco` acepta llamadas desde cualquier origen | Más superficie de ataque | Limitarlo al dominio de la app (revisión final) |
| P18 | Logo malicioso | Código en la pantalla del kiosco | Sólo PNG, JPG o WebP; tamaño máximo; almacenamiento del proyecto |
| P19 | Funciones nuevas con la clave de servicio | Si se saltean el chequeo, cualquiera restablece claves | Siempre en el servidor, chequeando operador con el token de quien llama, como hace `alta-kiosco` |
| P20 | Abuso de pedidos de ayuda o mensajes | Ruido y costo | Límites por kiosco |

### Privacidad

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P21 | Felipe ve montos y clientes | Contradice el spec de planes | Ficha sin montos ni clientes (decisión 2) |
| P22 | Notas con datos personales del dueño | Datos guardados de más | Sólo las ve el operador; lo mínimo; se pueden borrar |
| P23 | Mensajes del jefe con nombres de clientes | La anonimización de clientes no los alcanza | Felipe no los ve; se borran a los 90 días; advertencia al escribir |
| P24 | Pedidos de ayuda con datos personales | Felipe recibe lo que no necesita | Advertencia; se archivan |
| P25 | Exportar los datos del kiosco | Felipe vería ventas y clientes | Exporta el jefe |

### Datos y consistencia

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P26 | Aviso a "todos" y después se da de alta un kiosco | Recibe un aviso viejo, o no recibe uno vigente | Lista fija al enviar; se reenvía si hace falta |
| P27 | Kiosco dado de baja con avisos vigentes | Ruido en las cuentas | Dejan de valer para él |
| P28 | Aviso editado después de confirmado | Confirmó algo que no leyó | Versiones; "pedir confirmación otra vez" |
| P29 | Dos acciones a la vez (dos pestañas o dos operadores) | Una pisa a la otra | Historial; la ficha se relee; si cambió desde que la abriste, avisa |
| P30 | Una alerta que ya no vale | Confusión | Las de estado se calculan al leer |
| P31 | Reintentos | Avisos o alertas dobles | Id generado en el navegador; un solo evento por hecho |
| P32 | La fecha de alta no es la real | Antigüedad equivocada | "Cliente desde" editable |
| P33 | Un alta falla a mitad de camino | Kiosco sin cuentas o usuarios sueltos | Chequeo de salud |
| P34 | PC registrada dos veces | Lista de PCs inflada | Baja de PC |
| P35 | Borrar historial o avisos | Se pierde la constancia | Nunca se borran: se retiran |
| P36 | Todavía no hay planes | La ficha no puede mostrar el plan | "Sin plan" hasta la fase 2 |

### Red, hora y sincronización

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P37 | Sin red | No se ven avisos nuevos o no se anota la lectura | Lista guardada y cola de lecturas |
| P38 | La PC tiene mal la hora | "Hace 5 minutos" falso | Reloj del servidor |
| P39 | Zona horaria | Día equivocado en alertas y vencimientos | Hora de Buenos Aires, como el día operativo |
| P40 | Demora de hasta 3 minutos | Un urgente llega tarde | Aceptado; para lo crítico, WhatsApp |
| P41 | Pestaña en segundo plano | El navegador frena la relectura | Relee al volver a la pestaña (ya existe) |
| P42 | PC con una versión vieja que no conoce los avisos | No los muestra | Subir la versión mínima al lanzar la fase 3 |
| P43 | El abono se lee sólo al entrar (hoy) | El kiosco no se entera del cambio | Va en la lectura de novedades |

### Escala y costo

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P44 | Muchas PCs releyendo cada 3 minutos | Carga en la base | Una sola lectura; alertas de estado y "PC vista" cada 15 minutos |
| P45 | La lista con el resumen de 200 kioscos | Lenta | Una sola consulta con todos los resúmenes, por partes |
| P46 | Las lecturas crecen (avisos por PCs) | Tabla grande | Es chica; si hace falta, se resumen las de más de 12 meses |
| P47 | El correo de Supabase | Límite de envíos | Servidor de correo propio si se usa el mail |

### Errores del operador

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P48 | Mandar a todos por error | Un aviso equivocado en todos los kioscos | Confirmar escribiendo el número; retirar en un toque |
| P49 | Actuar sobre el kiosco equivocado | Cambian los módulos de otro | Nada elegido por defecto; nombre fijo arriba de la ficha |
| P50 | Dar de baja el kiosco equivocado | Un kiosco sin poder entrar | Escribir el nombre, código de MFA, fecha programada con tiempo para cancelar |
| P51 | Error de tipeo | Aviso con errores | Vista previa; editar |
| P52 | Olvidarse de vencer un aviso | Queda para siempre | Vencimiento por defecto |
| P53 | Versión mínima mayor que la publicada | Todas las PCs con "versión trabada" | El panel no lo permite |

### Comunicación

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P54 | Demasiados avisos | Se dejan de leer | Prioridades, agrupar, alertas apagables (las de Felipe no) |
| P55 | Un aviso que nadie lee | No llega el mensaje | Estadística, reenviar, WhatsApp |
| P56 | El jefe nunca abre la app | No se entera | Lo importante "para los dos"; WhatsApp; push y mail en la fase 6 |
| P57 | El último ingreso de la caja engaña | Parece que no usan la app | Actividad por ventas y turnos |
| P58 | El dueño también atiende la caja | Ve el mismo aviso dos veces | Aceptado: son dos cuentas. La bandeja del jefe muestra si la caja ya confirmó |

### Comercial y legal

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P59 | Cambia el precio o las condiciones del abono | Reclamo de que no se avisó | Aviso con anticipación y "Entendido"; la confirmación queda con fecha |
| P60 | Datos de un kiosco que se fue | Se guardan sin necesidad | Plazo definido (decisión 11) y descarga antes |
| P61 | Un empleado ve que el abono está vencido | Incomoda al dueño | Gracia sólo al jefe; suspendido a los dos (decisión 21) |

### Turnos y dispositivos (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P62 | Una PC se apaga o se rompe con el turno abierto | El efectivo de ese turno no se cuenta. El conteo es opcional (`20261027120300_movimientos_caja.sql:285-292`). Si la PC vuelve a abrir un turno, el anterior se cierra solo, sin conteo, y queda en el historial como automático (`:232-240`). Si la PC no vuelve, el turno queda abierto | El jefe lo cierra desde la alerta (§7.4), con motivo y conteo, o sin conteo marcado como tal (fase 4). La caja del día no se rompe: suma por fecha, no por turno |
| P63 | Se da de baja una PC con turno abierto | La PC no debería poder cerrar, y el turno quedaría pendiente | La baja no se confirma con turnos abiertos: los cierra el jefe o el operador (§8.3, decisión 27) |
| P64 | Se da de baja un kiosco con turnos abiertos | Después de la fecha nadie entra y los turnos quedan abiertos | La baja pide cerrar antes los turnos (§8.1) |
| P65 | Vence la sesión o se actualiza la app con una venta en armado | Se pierde la venta armada | El vencimiento y la recarga esperan a que la venta esté vacía (§7.2, regla 10) |
| P66 | Una cuenta filtrada registra muchas PCs (el alta de PC no tiene tope, dec. 34 de venta) | Un atacante abre turnos desde equipos nuevos | Alerta por cantidad de PCs activas, baja por el jefe y por el operador; no bloquea la caja (decisión 28) |

### Seguridad (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P67 | La sesión de caja queda abierta días enteros en una PC compartida | Cualquiera que llegue opera con la cuenta | Vencimiento por inactividad de 12 horas, sólo sin venta en armado (decisión 29). Hoy el cierre manual sólo borra la sesión de esa PC: el token sigue vivo en el servidor, así que para un equipo robado hace falta cerrar sesiones (§8.2) |
| P68 | Intentos repetidos de clave de jefe o de caja | Acceso a la cuenta | Límite de intentos del proveedor de autenticación, con el valor revisado en el proyecto (decisión 35) |
| P69 | La clave de un kiosco se pierde al recargar la pantalla (hoy pasa en el alta) | Hay que restablecerla otra vez | Se muestra una sola vez y no se guarda; si se pierde, se restablece y queda en el historial (fase 1) |
| P70 | Se recarga o se cierra la pestaña con una venta en armado | Se pierde la venta armada, y con ella el identificador de la venta: si ya se había grabado, cobrarla de nuevo la duplica | Hoy no se guarda nada en el navegador (venta, dec. 31): antes de volver a cobrar, el cajero revisa las ventas de hoy. Advertencia al cerrar la pestaña con una venta en armado (fase 0) |

### Privacidad (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P71 | Sentry recibe datos personales en mensajes o por la consola | Datos fuera del sistema | Hoy se redactan mails y teléfonos, pero no nombres en texto libre, y `console.error` va a Sentry (tres llamadas). Lista de campos permitidos y revisión de esas llamadas (fase 0, decisión 30) |
| P72 | Una exportación queda accesible por un enlace | Ventas y clientes fuera del control del dueño | Descarga directa del jefe, sin enlace público, registrada en el historial, con aviso de que el archivo tiene datos de clientes (decisión 31) |
| P73 | La anonimización sólo toca la tabla de clientes | El dato queda en notas, copias, exportaciones o Sentry | Procedimiento con lista de lugares y prueba. El acto de anonimizar queda en el historial, sin datos. Al restaurar una copia se vuelven a aplicar las supresiones (decisión 32, fase 5). Marco legal: Ley 25.326, con abogado |

### Continuidad y operación (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P74 | La copia de seguridad nunca se probó | No se sabe si un kiosco se puede recuperar | Restauración en entorno aislado antes de la fase 1 y cada 6 meses. Chequeos: ventas, movimientos, usuarios, configuración y referencias. Felipe anota la fecha (fase 0, decisiones 22 y 23) |
| P75 | Una migración falla a mitad de camino en producción | Datos a medio aplicar | Copia antes de migrar, migraciones aditivas por defecto y ensayo en copia local (fase 0) |
| P76 | Supabase no responde | Nadie puede vender | Sin conexión no se vende (decisión 30 de venta). El runbook dice qué responder al cliente y cómo se registra (fase 0) |
| P77 | Una venta duplicada o un daño reportado sin registro | No se sabe qué pasó | Registro de incidentes sin secretos, con el id de operación (fase 0) |
| P78 | La app y la base quedan en versiones distintas | Error en medio de una venta | Primero la base (migración aditiva), después la app; la versión mínima sube cuando la base está lista (fase 0 y §8.10) |
| P79 | Las pruebas corren contra datos reales | Se toca un kiosco de verdad | Pruebas en local y copia restaurada; proyecto de prueba aparte en el piloto (decisión 24) |

### Configuración (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P80 | Un toggle sin definir qué hace al apagarse | Datos a medio camino | Contrato del toggle (§3, principio 11) |
| P81 | Una preferencia de PC se guarda como si fuera del negocio | Cambia en todas las cajas | Ámbito por dispositivo o negocio (§3, principio 12; §9.1) |
| P82 | "Restaurar" borra configuración comercial | Se pierden precios o medios de pago | Restaurar sólo toca la pantalla. No hay "restablecer negocio" por ahora: cada cambio comercial se hace campo por campo, con historial (§9.1) |
| P83 | Un cambio masivo sin mostrar cuántos registros toca | Se cambia más de lo que se ve | Confirmación con la cantidad y resultado en el historial (§3, principio 13) |
| P84 | Demasiadas opciones en una pantalla | Errores y más soporte | Secciones progresivas, sin flags internos, descripciones breves (§9.1) |

### Comercial y soporte (informe)

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P85 | Soporte sin horario ni severidad | Un corte un domingo a la noche sin respuesta | Horario, canal y severidad; "no se puede cobrar" es crítico (decisión 25) |
| P86 | La guía no coincide con la versión instalada | Instrucciones que no sirven | Guía versionada, con número de versión; lista antes del piloto (fase 3) |
| P87 | Abono fijado sin costo calculado | Vender por debajo del costo | Costo por kiosco antes de fijar planes (decisión 39) |
| P88 | Métricas que miden el tiempo de cada cajero | Vigilancia y conflicto con el personal | Métricas agregadas por kiosco; nada por cajero (§5.1, Actividad) |
| P89 | El piloto no tiene criterio de salida | Se extiende con errores ocultos | Criterio: incidencias, tiempos de cobro, diferencias de caja y tareas que siguen en papel (decisión 26) |

### Hallazgos del cruce con el código

| # | Problema | Qué pasaría | Qué hacemos |
|---|---|---|---|
| P90 | El aviso de PC trabada dice "Podés seguir vendiendo" (`src/app/version.ts:10`) | Las funciones viejas se revocan a las 48 horas (venta, §9, caso 6): después la PC no puede vender, sin un aviso claro | El aviso dice hasta cuándo puede vender y qué hacer. El panel muestra las PCs con versión vieja (fase 3) |
| P91 | Un cambio de módulo o de límite de fiado no deja historial (`20261019121700_jefe.sql`, `20261027120200_saldo_fiado.sql:163-194`) | No queda constancia de quién cambió un límite de deuda | Historial con motivo, valor anterior y valor nuevo para todo cambio de módulo y de límite (fase 2) |
| P92 | El costo de compra no se guarda en la línea de venta | Al cambiar el costo, las ventas pasadas pierden la ganancia de entonces; no hay margen confiable | Guardar el costo en cada línea desde ya (decisión 41). El cálculo va al spec de reportes |
| P93 | Un retiro mal cargado no se puede corregir: hoy sólo se agrega (`20261027120300_movimientos_caja.sql:28-31`) | Bloquea activar `movimientos_caja` en un kiosco real | Corrección con movimiento compensatorio y motivo, especificada antes de activar el módulo (spec de arqueo) |
| P94 | Cualquier cuenta del kiosco puede cerrar el turno de otra PC (`20261027120300_movimientos_caja.sql:275-296`) | Un cierre ajeno deja sin turno a la PC que estaba vendiendo | Decisión 44: sólo el jefe cierra el turno de otra PC. Hoy la base no lo impide |

## 11. Fases

Cada fase se puede usar sola y después tiene su propio plan de implementación. La revisión de seguridad va al cierre de cada una (§12).

### Fase 0: continuidad y operación (previa)

- **Qué**: copias probadas con tiempos medidos; runbook de incidentes y registro de incidentes; orden de despliegue con migraciones aditivas; entorno de prueba (decisión 24); vencimiento de sesión en la caja y límite de intentos (P67, P68); revisión de Sentry (P71); horario y canal de soporte (decisión 25); costo por kiosco antes de fijar planes (decisión 39). Los cambios de base van por migración; Studio sólo en emergencia y con registro. Verificar el plan de Supabase del proyecto (decisión 23). Guardar el costo en la línea de venta (decisión 41).
- **Piezas**: un procedimiento escrito de copia y restauración; el runbook; la lista de campos permitidos de Sentry; el vencimiento de sesión de la caja, que no corta una venta en armado.
- **Datos nuevos**: la fecha de la última restauración verificada, que anota Felipe (P74), y el registro de incidentes.
- **Terminado cuando**: una restauración en entorno aislado está hecha y medida; el runbook está escrito; Sentry pasó la revisión de campos; el orden de despliegue está escrito. Es la condición de la decisión 22: se cumple antes de la próxima migración en producción y antes de sumar un kiosco nuevo.

### Fase 1: estructura del panel y ficha del kiosco

- **Qué**: navegación por secciones con direcciones propias; Inicio con los contadores que ya se pueden calcular; lista con buscador, filtros, orden y demo; ficha con resumen (sin plan, pagos ni versión de PCs), datos, notas, recordatorios e historial; datos visibles editables; el alta crea la configuración visible; el logo se sube al almacenamiento del proyecto (P18); las claves del alta y de restablecer se muestran una sola vez y, si se pierden al recargar, se restablecen otra vez (P69).
- **Piezas**: un resumen de todos los kioscos en una sola consulta; la ficha de un kiosco; guardar los datos del kiosco; notas y recordatorios; el historial del operador con filtros. Las funciones de operador de hoy pasan a dejar historial con motivo y a pedir MFA cuando el proyecto lo tenga, con los nombres del spec de planes (decisión 17).
- **Datos nuevos**: datos comerciales del kiosco (cliente desde, etiquetas, demo, contacto del dueño), notas y recordatorios, y el operador en el historial (spec de planes).
- **Terminado cuando**: en el celular, tocás un kiosco y ves antigüedad, abono, módulos, cuentas, PCs y actividad; "atrás" vuelve a la lista; nada queda elegido solo; cada cambio aparece en el historial.

### Fase 2: planes

- **Qué**: el spec de planes tal cual. La ficha y la lista muestran el plan; cambiar de plan con vista previa; extras. Historial de cambios de módulo y de límite de fiado (P91). Deshacer sólo en cambios reversibles (§9.1).
- **Terminado cuando**: la ficha dice "Básico + 2 extras" y cambiar de plan muestra antes qué se gana y qué se pierde.

### Fase 3: avisos y notificaciones

- **Qué**: la lectura única de novedades, con lista guardada y cola de lecturas; campana, franja y bandeja en jefe y caja, con las reglas de la caja (la franja de abono pasa a esta pieza); los avisos de Felipe completos (§6); los avisos del sistema que no dependen de la fase 5; "PC vista" y versión de cada PC. El jefe da de baja sus propias PCs con la regla del turno abierto (P63). La guía de uso versionada queda lista antes del piloto (P86). El jefe descarga sus datos desde su pantalla, con aviso de datos personales (decisiones 14 y 31).
- **Piezas del operador**: enviar, editar, retirar y reenviar un aviso; ver sus lecturas; plantillas. **Piezas del kiosco**: leer las novedades, marcar leído, confirmar y anotar "PC vista".
- **Datos nuevos**: avisos y sus versiones, destinatarios, lecturas (cuenta, PC, turno y versión), plantillas, y la última vez vista y la versión de cada PC.
- **Terminado cuando**: Felipe manda un urgente a un kiosco; en menos de 3 minutos aparece en la caja sin sacar el foco del escaneo ni mover botones; la confirmación queda por PC; Felipe ve "1 de 1 lo leyó".

### Fase 4: alertas, mensajes y ayuda

- **Qué**: módulo Alertas con el catálogo de §7.4 y las preferencias del jefe; módulo Mensajes a la caja; pedir ayuda, con su código de diagnóstico; cerrar un turno abandonado desde la alerta (P62).
- **Piezas**: alertas del kiosco (calcula las de estado y trae las de evento); preferencias; mensajes (escribir, leer, marcar leído); pedidos de ayuda (crear desde el jefe; ver, responder y cerrar desde el panel). Se guardan como evento la diferencia de caja al cerrar el turno y el aumento de precios.
- **Datos nuevos**: eventos de alerta, preferencias por kiosco, mensajes con lecturas por PC y pedidos de ayuda.
- **Terminado cuando**: con Stock y Alertas prendidos, un producto bajo el mínimo aparece en la bandeja del jefe y desaparece al reponerlo.

### Fase 5: administración completa

- **Qué**: cuentas (restablecer clave, cambiar mail, bloquear, cerrar sesiones); PCs (nombre, baja); abono (estado, vencimiento, pagos, sugerencias); baja y reactivación; chequeo de salud; versión mínima; prueba de módulos; cambio de plan programado; Inicio completo; importación del catálogo inicial (§8.11); anonimización completa al vencer el plazo de la decisión 11, con sus copias y exportaciones (P73, decisión 32); la baja no se confirma con turnos abiertos (P64).
- **Piezas**: en el servidor, con la clave de servicio y el chequeo de operador (como el alta): restablecer clave, cambiar mail y cerrar sesiones. El resto, en la base.
- **Datos nuevos**: cuenta bloqueada, PC dada de baja y su nombre, vencimiento y pagos del abono, baja programada, vencimiento de extras y cambio de plan programado.
- **Terminado cuando**: cada acción grave pide MFA y el nombre del kiosco, y queda en el historial.

### Fase 6 (opcional): canales fuera de la app

- **Qué**: push al celular del jefe (módulo); mail para avisos importantes; avisos a Felipe cuando llega un pedido de ayuda o un kiosco deja de usar la app.
- **Piezas**: suscripción push por dispositivo, un envío que corre a cierta hora (acá sí hace falta), proveedor de correo y preferencias de canal.
- **Terminado cuando**: el jefe recibe un urgente en el celular con la app cerrada.

La 2 y la 3 no dependen entre sí. Si Felipe quiere los avisos antes que los planes, se cambian de orden (decisión 15).

### Criterio común para cerrar una fase [propuesta]

- Pruebas aprobadas. La suite se corre cuando Felipe lo ordena.
- Documentación al día: guía de uso y runbook.
- Pruebas de interfaz del panel y del jefe: zoom, teclado y accesibilidad básica. La caja sigue siendo sólo mouse, por decisión del dueño.
- Reversión definida: un módulo que se apaga sin borrar datos, o una migración aditiva con su vuelta atrás.
- Feedback de un piloto, desde la fase 3 (decisión 26).
- Revisión de seguridad de la fase (§12).
- No se libera si falla un caso que duplica dinero, borra trazabilidad, permite permisos indebidos o deja un turno imposible de resolver (P62 a P64).

## 12. Revisión de seguridad (al cierre de cada fase)

1. MFA del operador: verificar si el proyecto hospedado tiene TOTP antes de exigirlo (spec de planes).
2. Las funciones de operador de hoy, sin historial ni MFA.
3. Orígenes permitidos en `alta-kiosco` y en las funciones nuevas.
4. Funciones con la clave de servicio (restablecer clave, cambiar mail, cerrar sesiones): chequeo de operador con el token de quien llama.
5. Aislamiento entre kioscos de avisos, lecturas, alertas, mensajes y pedidos de ayuda (sumar a la prueba 140). Cada función nueva entra en esa prueba.
6. Sólo texto en avisos y mensajes, en todas las pantallas.
7. Subida de logos: tipo, tamaño y almacenamiento.
8. Límites de uso: avisos masivos, pedidos de ayuda, mensajes y restablecer clave.
9. Notas internas y contacto del dueño: que ninguna función del kiosco los lea.
10. Cierre del panel por inactividad en el celular.
11. Vencimiento de sesión de caja: no corta una venta en armado (P65, P67).
12. Límite de intentos de login y longitud mínima de la clave: valores revisados en el proyecto hospedado (P68). El repo fija 6 caracteres.
13. Sentry: campos permitidos, nombres en texto libre y llamadas a console.error (P71).
14. Exportaciones: descarga directa, registro en el historial, sin enlace público (P72).
15. PCs activas y bajas: el tope de alerta no bloquea la caja, y una baja no deja turnos sin dueño (P63, P66).
16. Restauración de copias: vuelve a aplicar las supresiones de anonimización (P73, P74).
17. Cierre de sesión: el cierre local no revoca el token en el servidor. Para un equipo robado, cerrar sesiones (§8.2; P67).

## 13. Decisiones abiertas

Cada una con recomendación.

1. **"Cuenta" es el kiosco**, con su jefe y su caja. Recomendación: sí.
2. **Actividad sin montos ni clientes en la ficha** (cantidad de ventas, días con ventas, última venta). Enmienda el "sin acceso a ventas" del spec de planes. Recomendación: sí.
3. **Avisos sólo texto**, sin enlaces tocables. Recomendación: sí.
4. **Lectura de la caja por PC y por turno.** Recomendación: sí.
5. **Destinatarios fijos al enviar.** Recomendación: sí.
6. **Avisos de Felipe y del sistema sin módulo**: llegan siempre. Recomendación: sí.
7. **Alertas y mensajes a la caja como módulos** apagados por defecto. Recomendación: sí.
8. **Mensajes del jefe**: Felipe no los ve y se borran a los 90 días. Recomendación: sí.
9. **Relectura cada 3 minutos**, sin tiempo real. Recomendación: sí.
10. **La baja impide entrar** desde la fecha programada. No es por deuda: la dec. 19 queda igual. Recomendación: sí, con avisos antes y reactivable.
11. **Cuánto se guardan los datos** de un kiosco que se fue. Recomendación: 12 meses; después, anonimizar sus clientes. Las ventas no se pueden borrar (la base lo impide). Lo decide Felipe.
12. **Registro manual de pagos del abono.** Recomendación: sí, sólo como anotación.
13. **El jefe no ve el precio de su plan.** Recomendación: no mostrarlo por ahora.
14. **Los datos los descarga el jefe**, no Felipe. Recomendación: sí.
15. **Orden de fases**: ficha, planes, avisos (planes y avisos intercambiables). Recomendación: así.
16. **Push al celular del jefe.** Recomendación: después de ver si alcanzan los avisos en la app.
17. **Alinear las funciones de operador de hoy con el spec de planes** (nombres, MFA, historial). Recomendación: sí, en la fase 1.
18. **Pasar a gracia automáticamente.** Recomendación: no; sólo sugerir.
19. **Pedir ayuda desde la caja.** Recomendación: no al principio.
20. **Agrupar el menú del jefe** y no tocar el de la caja. Recomendación: sí.
21. **A quién le llega el aviso de abono**: gracia sólo al jefe; suspendido, al jefe y a la caja. Hoy los dos ven los dos. Recomendación: sí.
22. **Fase 0 antes de la próxima alta y antes de la próxima migración en producción.** Copias probadas, runbook, orden de despliegue y entorno de prueba. Recomendación: sí.
23. **Copias del proyecto.** La decisión de venta exige Supabase Pro antes de cargar datos reales del primer kiosco, porque el plan Free no incluye copias diarias (venta, §3; "verificar"). Ya hay kioscos en uso: verificar hoy el plan del proyecto. La recuperación a un punto en el tiempo se contrata sólo si la pérdida aceptable lo exige. Lo decide Felipe por costo. Recomendación: verificar hoy.
24. **Entorno de prueba.** Hasta el piloto, pruebas en local y una copia restaurada para ensayos. Después, un proyecto de prueba separado. Recomendación: así.
25. **Horario y canal de soporte.** Los define Felipe antes del piloto. "No se puede cobrar" es crítico. Recomendación: sí.
26. **Piloto con un kiosco.** Antes de cerrar la fase 3, con el criterio de salida de §11. En el piloto se pregunta a quien atiende la caja y al jefe qué tarea ahorra la app y qué error evita. Recomendación: sí.
27. **Turno abandonado.** El jefe lo cierra con motivo: con conteo, o sin conteo marcado como tal. La baja de una PC no se confirma con un turno abierto, y la PC dada de baja no cierra. Esto cambia, sólo para ese caso, la decisión 8 del spec de planes (cierres que no se bloquean), que se mantiene para apagar módulos y suspender abonos. Recomendación: sí.
28. **Tope de PCs activas por kiosco.** Alerta a partir de N PCs activas, sin bloqueo duro. Propuesta: N = 4. Recomendación: sí; el número lo fija Felipe.
29. **Vencimiento de sesión de caja.** A las 12 horas sin uso, sólo cuando no hay venta en armado. Recomendación: sí; el número lo fija Felipe.
30. **Sentry sin datos personales.** Lista de campos permitidos y prueba de limpieza, revisada en cada versión. Recomendación: sí.
31. **Exportaciones.** Descarga directa del jefe, registrada en el historial, sin enlace público. Completa la decisión 14. Recomendación: sí.
32. **Alcance de la anonimización.** Clientes, notas, exportaciones, copias y Sentry, con un procedimiento verificable, y una tabla de retención por tipo de dato (ventas, auditoría, clientes, copias). Recomendación: sí, con asesoramiento legal; sigue vigente la decisión 11.
33. **Usuarios individuales por empleado.** Quedan fuera por ahora (dec. 7 de venta). La atribución es por PC y turno, y se le explica al cliente. Recomendación: no por ahora; revisar si un cliente lo pide.
34. **Permisos finos (matriz).** Quedan fuera por ahora; se revisan después del piloto. Recomendación: no ahora.
35. **Límite de intentos de login.** Usar el límite del proveedor de autenticación, revisar su valor en el proyecto y no sumar CAPTCHA por ahora. Recomendación: sí.
36. **Importar el catálogo inicial.** Sólo el operador, con vista previa y sin reemplazar nunca el catálogo, en la fase 5. Recomendación: sí.
37. **Reportes del jefe** (dashboard, rentabilidad, comparación de períodos, cierre mensual). Spec aparte, después de la fase 4. Recomendación: sí.
38. **Comprobantes, reimpresión y etiquetas.** Spec aparte; el orden lo define Felipe con los clientes del piloto. Recomendación: después del piloto.
39. **Costo por kiosco antes de fijar planes.** Infraestructura, soporte, copias y comisiones. Recomendación: sí.
40. **Configuración del jefe por grupos.** Cada grupo aparece cuando existe su módulo (§9.1). Recomendación: sí.
41. **Costo de compra en cada línea de venta, desde ya** (P92). Sin eso, la ganancia de las ventas pasadas no se reconstruye. Recomendación: sí, antes de sumar kioscos.
42. **Que el jefe cierre sesiones de su cuenta.** Requiere una función con chequeo de jefe, sin clave de servicio (P19). Recomendación: sí, en la fase 3.
43. **Turno que cruza medianoche.** Hoy el cierre suma las ventas de los dos días y la caja del día las separa por fecha (venta, §7). Partir el cierre cambia una regla de venta. Recomendación: no tocar el cierre; los reportes separan por fecha. Lo decide Felipe en el spec de arqueo.
44. **Quién cierra el turno de otra PC del kiosco** (P94). Hoy lo puede cerrar cualquier cuenta del kiosco. Recomendación: sólo el jefe cierra el turno de otra PC; la caja cierra el suyo.
45. **Stock negativo.** Hoy la venta avisa y vende. Impedirla reabre una decisión de venta; una política por negocio, guardada como dato, es compatible. Recomendación: mantener hoy y dejarla configurable después. Lo decide Felipe.
46. **Devolución parcial.** Choca con la decisión 17 de venta (anulación sólo completa). Hay que decidir antes stock, caja, pagos y fiado. Recomendación: no ahora.
47. **Estado "pendiente de verificar" en pantalla.** Reabre la decisión 30 de venta. Hoy el aviso ya dice que la venta no se duplica si se reintenta. Recomendación: no reabrirla.
48. **Límite de PCs por plan.** Choca con la decisión 34 de venta. Recomendación: no limitar PCs por plan; la alerta de la decisión 28 alcanza.

## 14. Fuera de alcance

- Cobro automático o pasarela de pago.
- Suspensión que bloquee la caja (dec. 19).
- Chat en vivo con soporte.
- Más de una cuenta de jefe o de caja por kiosco, y permisos por persona.
- Roles entre operadores.
- Mensajes automáticos por WhatsApp (la API de WhatsApp Business es paga y pide plantillas aprobadas). El botón que abre WhatsApp con el texto sí entra.
- "Entrar como el jefe" para ver su pantalla: el riesgo es alto.
- Reportes de ventas por kiosco para Felipe.
- Ideas para después: encuestas cortas dentro de un aviso, catálogo inicial de productos por rubro, errores de la app por kiosco (la app ya manda errores a Sentry) y un dueño con varios kioscos.
- Modo offline completo (informe, P3; ver decisión 30 de venta).
- Multisucursal, API pública, contabilidad e IA (informe, P3).
- Facturación electrónica: proyecto aparte, con normativa y proveedor (informe, §19).
- Atajos de teclado en la caja: los botones son sólo mouse, por decisión del dueño.
- Usuarios individuales por empleado y permisos finos, por ahora (decisiones 33 y 34).
- Vencimientos y lotes de productos, sin demanda comprobada (informe, §8).

## 15. Informe de mejoras del 28/10/2026: qué entra y qué no

El informe se cruzó con este plan y con los specs vigentes, y cada punto se verificó contra el código y las migraciones. El informe se escribió sin ver el repo: algunas afirmaciones eran ciertas, otras ya estaban resueltas y algunas eran imprecisas (§15.6). Resultado de los 119 ítems: 39 cubiertos, 51 parciales (se completan con lo de §15.1), 11 van a otro spec, 10 chocan con una decisión y 7 quedan para después. Un principio nuevo (14) es lo único que entra sin más.

### 15.1 Entra en este spec

- Principios 10 a 14 (§3).
- Problemas P62 a P94 (§10).
- Fase 0 y criterio común para cerrar una fase (§11).
- Configuración del jefe por grupos (§9.1), importación del catálogo (§8.11), tipo de pedido de ayuda y código de diagnóstico (§7.6), alerta de retiros repetidos (§7.4).
- Revisión de seguridad: puntos 11 a 17 (§12).
- Decisiones 22 a 48 (§13). Las 41 a 48 nacen del cruce y necesitan la decisión de Felipe.

### 15.2 Ya cubierto

- Ventas no duplicables: el reintento con el mismo identificador devuelve la venta grabada (venta, dec. 30).
- Importes enteros en la base y venta de $0 no admitida (venta, §6).
- Precio congelado en cada línea y relectura al confirmar (venta).
- Anulación completa, con motivo, autor y fecha. Ventas y anulaciones no se borran (venta, dec. 17).
- Permisos comprobados en la base, con pruebas que los leen. Ocultar botones no es el control.
- Historial solo-agregar en ventas, anulaciones y turnos.
- Stock descontado en la misma transacción que la venta. La venta nunca rechaza por stock.
- Saldo de fiado calculado desde cargos y pagos; límite verificado en la base, dentro de la transacción.
- Pagos mixtos con importe por medio.
- Sin internet no se vende y no hay cola (venta, dec. 4 y 30).
- Estado de conexión sin verde falso (§3).
- Aislamiento entre negocios probado desde la base (prueba 140).
- Clave de servicio sólo en el servidor; `alta-kiosco` chequea operador con el token de quien llama.
- Apagar un módulo no bloquea anulaciones, cobros, cierres ni anonimización (spec de planes, dec. 8).
- Alertas de diferencias, anulaciones y retiros repetidos en el catálogo (§7.4).

### 15.3 Va a otro spec

- **Caja y arqueo** (a crear): fondo inicial con monto configurable; umbral de diferencia que exige motivo, sin alterar el contado; corrección de movimientos con movimiento compensatorio (P93); regla del turno que cruza medianoche (decisión 43).
- **Venta y cobro**: transferencias y tarjetas declaradas por quien cobra, no verificadas. El número de operación de la transferencia sí; la terminal y los últimos dígitos de la tarjeta no, porque la venta sólo registra el importe. Pitido configurable por PC (hoy es fijo, `src/ui/pitido.ts`). Un código tipeado a mano va a búsqueda por nombre: medir con el escáner real. Descuentos y notas internas en el carrito.
- **Productos y precios** (a crear): ficha de producto con campos opcionales, en la tabla de gestión y no en la de caja; aviso de código repetido que muestra el producto existente; margen y recargo; historial de precios con el aumento que lo originó.
- **Stock** (a crear): libro de stock completo (venta, anulación, devolución, merma, vencimiento, ajuste); conteo por categoría; política de stock negativo (decisión 45). La anulación según lo que pasó en la venta ya está prevista en el spec de planes (`stock_descontado`).
- **Proveedores v2**: ficha con días de visita, rubros y plazo; lista para pedir con sugerencia por ventas; exportar o compartir la lista.
- **Compras y recepción** (a crear): documento, costos, diferencias contra lo pedido, duplicados por comprobante, costo de compra por proveedor.
- **Fiado** (a crear): recordatorios manuales con consentimiento (Ley 25.326, con abogado); qué pasa si se anula una venta fiada con cobros ya hechos (hoy no hay regla).
- **Reportes** (a crear): dashboard diario; rentabilidad con costos (depende de P92), marcando costo faltante o estimado; ranking y comparación de períodos; cierre mensual aclarado como no contable; CSV y PDF con filtros y zona horaria.
- **Comprobantes e impresión** (a crear): leyenda fija "comprobante interno no fiscal"; reimpresión marcada como duplicado, sin otra operación; una impresora que falla no revierte la venta; anchos de 58 y 80 mm; etiquetas con código de barras, y distinción entre código interno y oficial.
- **Textos legales** (con abogado): términos, política de privacidad, qué se envía a Sentry, por qué se pide cada dato.

### 15.4 Después (P2 o P3 del informe)

- Cuenta corriente de proveedores (después de compras y recepción).
- Vencimientos y lotes, cuando haya demanda comprobada.
- Listas de precios y promociones: antes hay que decidir cómo se combinan con el precio congelado y con la relectura al confirmar.
- Varias cajas con conciliación consolidada (hoy cada PC es una caja con su turno).
- Tope o confirmación por importe inusual, y confirmación de productos de alto valor: no se construyen sin datos de errores reales.
- Asistente de alta para el jefe (negocio, productos, cajas, usuarios, stock, venta de prueba): decidir si va en fase 3 o después.
- Descuentos autorizados, favoritos y categorías de productos: cuando tengan spec.
- Historial de clientes opcional.

### 15.5 Fuera de alcance o no conviene

- Modo offline completo, multisucursal, API pública, contabilidad, IA y facturación electrónica (ya en §14).
- Atajos de teclado en la caja, o usarla sin mouse: los botones de caja son sólo mouse por decisión del dueño.
- Usuarios individuales por empleado y permisos finos, por ahora (decisiones 33 y 34).
- Mostrar tiempo de cobro por cajero (P88).

### 15.6 Correcciones al informe

- "Consultar por identificador antes de reintentar" no agrega seguridad. Un reintento con el mismo identificador ya devuelve la venta grabada, y la base busca la venta antes de insertarla; no usa `on conflict`. Lo que falta después de una recarga es el aviso de revisar las ventas de hoy, que ya existe (P70).
- "Calcular el vuelto en la misma unidad monetaria": ya está resuelto, los importes son enteros en la base (venta, §6). Lo que falta es un tope de importes, para después.
- "El turno que cruza medianoche no debe mezclarse con el día siguiente": hoy el cierre suma los dos días y la caja del día los separa por fecha. El informe pide otra regla: decisión 43.
- "Si la PC queda con turno abierto, la caja del día no cierra": no es así. La caja del día suma por fecha, no por turno. Lo que se pierde es el conteo de efectivo de ese turno (P62).
- "Hacer copias": el informe tiene razón en que una copia no verificada no sirve. Además, la venta exige Supabase Pro antes de cargar datos reales, porque el plan Free no incluye copias diarias (venta, §3). Hay que verificar el plan del proyecto (decisión 23).

### 15.7 Pendiente de verificar fuera del repo

- Plan de Supabase del proyecto hospedado: copias diarias y límite de envío de mails.
- Límite de intentos de login y longitud mínima de clave en el proyecto hospedado (el repo dice 6 caracteres).
- Si las migraciones 20261028100000 a 20261028130000 están aplicadas en el proyecto hospedado.
