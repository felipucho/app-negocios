# Catálogo global desde SEPA (carga diaria)

Una vez al día se baja el paquete oficial de precios de la Secretaría de Comercio (SEPA / Precios Claros) y se actualiza `catalogo_global`: código de barras (EAN), nombre, marca y presentación. Es todo o nada: si algo falla, viene corrupto o se ve raro, no se actualiza nada y el catálogo anterior queda como estaba. Los precios no se cargan todavía.

Fuente: https://datos.produccion.gob.ar/dataset/sepa-precios, licencia CC BY 4.0. Hay que atribuir: "Fuente: SEPA – Secretaría de Comercio (CC BY 4.0), datos normalizados". Cuando la app muestre estos datos al usuario, tiene que llevar esa leyenda. La constancia ya está en el `comment on table` de `catalogo_global`.

## Piezas

| Pieza | Archivo |
|---|---|
| Tablas y función de publicación | `supabase/migrations/20261029180000_catalogo_global.sql` |
| Pruebas pgTAP (escritas, no corridas) | `supabase/tests/database/250_catalogo_global.test.sql` |
| Script de descarga y validación | `scripts/catalogo_sepa.py` (Python, solo biblioteca estándar) |

## Cómo corre

1. `package_show` de la API del portal: se elige el recurso más reciente. Se exige que sea de los últimos días y que el tamaño bajado coincida exacto con el informado.
2. Si la última importación publicada ya tiene esa fecha, termina sin hacer nada.
3. Baja el zip a un temporal (unos 310 MB, el servidor no admite rangos) y lo lee por streaming: nunca extrae nada a disco.
4. Cada comercio se valida por separado. Un comercio vacío, corrupto o con demasiadas filas rotas se descarta entero y se sigue con los demás; hoy mismo el archivo oficial trae uno de 0 bytes. Un comercio sólo se suma al total si se leyó completo sin error.
5. Sube el resultado a una tabla de paso y llama a `publicar_catalogo`, que decide sobre el total y publica en una sola operación.

`publicar_catalogo` rechaza (y no toca el catálogo) si: faltan filas respecto de lo subido (`staging_incompleto`), la fecha de la fuente está más de un día en el futuro (`fecha_futura`; el script también lo rechaza antes de empezar), la fecha no avanza (`fecha_no_avanza`), hay menos de 10 comercios o menos del 70 % de los de la última corrida (`pocos_comercios`), hay menos de 50.000 productos la primera vez o cae más de un 30 % después (`caida_ean`), o más de la mitad de los nombres cambian de golpe (`cambio_masivo_nombres`).

Nunca se borra nada: lo que un día no aparece en la fuente queda con su fecha de último avistamiento (`visto`). Tampoco se pisa un dato conocido con uno vacío: si hoy ninguna cadena informa la marca o la presentación de un producto, se conserva la de antes (la presentación se conserva en par, cantidad y unidad juntas). El nombre sí se actualiza siempre.

Una corrida que quedó "en curso" más de 2 horas (la PC se apagó, por ejemplo) se marca como abandonada al arrancar la siguiente, así que el reintento de las 19:00 no queda bloqueado por una caída de las 15:00. El temporal de 310 MB se borra al terminar; si Windows lo tiene abierto y no se puede borrar, la corrida siguiente lo limpia.

## Reglas de datos

- EAN canónico: 8 dígitos, o 13 si tiene más de 8 cifras significativas. Los códigos de 12 dígitos (UPC-A) pasan a 13 con un cero adelante, así que **la búsqueda por código escaneado tiene que canonizar igual**. Se valida el dígito verificador.
- Se excluyen los códigos de uso restringido (13 dígitos que empiezan con 2, 02 o 04; 8 dígitos que empiezan con 0 o 2): son de balanza o internos de cada cadena. Los códigos internos de cada cadena (`productos_ean = 0`) tampoco entran.
- Nombre: cada comercio vota con su descripción más frecuente; gana la más votada entre comercios distintos. Desempate: con minúsculas, que quepa en 80 caracteres, la más larga. Máximo 80 caracteres porque `productos.nombre` de los kioscos acepta hasta 80.
- Presentación: se convierte a `ml`, `g` o `un` con una tabla fija; si la unidad no está en la tabla, queda sin presentación. No se inventa nada.

## Configuración

El script lee `.env.catalogo.local` (ya ignorado por git) con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La clave no va nunca en la línea de comando de la tarea programada. Rechaza una URL que no sea `https`, salvo `localhost` o `127.0.0.1`.

## Comandos

```
python scripts/catalogo_sepa.py --autotest                       # aserciones sobre las funciones puras, sin red
python scripts/catalogo_sepa.py --seco --archivo ARCHIVO.zip     # parsea y valida un zip ya bajado, sin tocar la base
python scripts/catalogo_sepa.py                                  # corrida real
```

Códigos de salida: `0` publicada o sin novedad; `1` rechazada por una regla; `2` error; `3` ya hay una corrida en curso.

Para ver qué pasó: `select estado, motivo, fecha_fuente, metricas from catalogo_importaciones order by iniciada desc limit 5;`

## Programarlo (Windows)

Registrada el 2026-10-29 en el Programador de tareas de Windows como "Catalogo SEPA" (usuario felipe, solo corre con la sesión iniciada). Necesita `.env.catalogo.local` en la raíz del repo con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; hoy son los de la base local y salen de `npx supabase status -o env` (el archivo está ignorado por git, no se commitea). A la hora de correr, el Supabase local (Docker) tiene que estar levantado y la PC prendida; si no, la corrida sale con error y la ventana de las 19:00 reintenta.

El recurso del día se publica alrededor de las 13:20 hora de Buenos Aires, así que se corre a las 15:00 y otra vez a las 19:00 (la segunda no hace nada si ya se publicó), con "ejecutar apenas se pueda si se perdió el horario" y sin frenar por estar a batería:

```powershell
$py = (Get-Command python).Source
$accion = New-ScheduledTaskAction -Execute $py -Argument "-I scripts\catalogo_sepa.py" -WorkingDirectory "C:\Users\felipe\Desktop\app negocios"
$disparadores = @((New-ScheduledTaskTrigger -Daily -At 15:00), (New-ScheduledTaskTrigger -Daily -At 19:00))
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "Catalogo SEPA" -Action $accion -Trigger $disparadores -Settings $ajustes
```

Para ver cómo le fue, además de `catalogo_importaciones`: `Get-ScheduledTaskInfo -TaskName "Catalogo SEPA"` (`LastTaskResult` es el código de salida: 0 ok o sin novedad, 1 rechazada, 2 error, 3 ya había una corrida). Si Docker estaba apagado la corrida no llega a la base y no deja fila, pero el código 2 queda ahí. Mientras baja el zip puede abrirse una ventana de consola unos minutos. Para sacarla: `Unregister-ScheduledTask -TaskName "Catalogo SEPA" -Confirm:$false`.

Si un día no corre no pasa nada: el catálogo es acumulativo. Cuando el repo tenga remoto en GitHub, el mismo script sirve en una GitHub Action programada. "Iniciar en" tiene que ser la raíz del repo (el script busca `.env.catalogo.local` ahí); si se usa una ruta absoluta al script, va entre comillas porque "app negocios" tiene un espacio.

## Si rechaza todos los días

Los chequeos de caída (`caida_ean`, `pocos_comercios`) y de cambio de nombres (`cambio_masivo_nombres`) comparan contra lo último publicado, así que un cambio real y grande (una cadena que deja de informar, o una regla de nombres nueva en el script) los dispara todos los días. Antes de forzar nada, revisar con `--seco` que el resultado es el esperado. Para destrabar a mano, en el editor SQL de Supabase: en `caida_ean` y `pocos_comercios`, bajar los valores `ean_distintos` y `comercios_ok` de la última fila `publicada` de `catalogo_importaciones` (`update ... set metricas = jsonb_set(metricas, '{ean_distintos}', '0')`); en `cambio_masivo_nombres`, vaciar `catalogo_global` (`truncate`), que se reconstruye entera con la corrida siguiente.

## Antes de conectarlo a la nube

La función publica unas 75 mil filas dentro de una sola llamada. En Supabase las llamadas por la API tienen un límite de 8 segundos por consulta; si en la base real la llamada lo supera, cada corrida se cancela y se revierte sola (es seguro, pero nunca publica). En la base local (2026-10-29, 74.793 filas nuevas) la llamada tardó 0,7 segundos y la corrida entera, con descarga, 138 segundos; una instancia chica de la nube puede ser varias veces más lenta, así que conviene medir una corrida real y, si hace falta: `alter role service_role set statement_timeout = '120s'; notify pgrst, 'reload config';`. El script espera hasta 300 segundos esa llamada.

## Qué no hace (todavía)

Precios y sucursales, búsqueda por nombre o código desde la app, alertas, limpieza de productos viejos, guardar las descripciones crudas. Los precios de SEPA son además poco confiables (hay valores como 0,60 por una gaseosa de 2 litros), así que van a necesitar filtros propios antes de usarse.
