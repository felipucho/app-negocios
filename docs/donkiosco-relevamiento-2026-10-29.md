# Relevamiento de DonKiosco (2026-10-29)

Hecho con una cuenta gratuita de prueba de Felipe, en app.donkiosco.com.ar. Sólo lectura: no se cargaron productos ni se pagó nada.

## Catálogo inicial

- `tests/soporte/catalogo-inicial.csv`: 710 productos en 8 rubros, cada uno con código de barras (EAN), marca, precio sugerido, rango habitual (mín. y máx.) y ranking dentro del rubro. Separador `;`, UTF-8 con BOM, como `src/lib/csv.ts`.
- Sale de `GET api.donkiosco.com.ar/onboarding/starter-kit`, la pantalla "Armá tu kiosco". Según DonKiosco, el precio es el habitual de los kioscos que usan su sistema.
- Se verificó todo: 710 filas, EAN sin repetir y con dígito verificador válido, y precios con mín ≤ máx.
- Se acortaron 3 nombres de más de 80 caracteres (límite de `productos.nombre`). Hay 3 nombres repetidos ("Beldent Menta", dos fideos Sol Pampeano), pero con EAN distintos: son presentaciones distintas y quedan las dos.
- Los precios son de octubre de 2026. Con la inflación se desactualizan rápido: tomarlos como sugerencia.

## Catálogo global (no descargado)

- `GET /catalog/browse?scope=all|core` tiene 323.142 productos (68.329 en `core`), con EAN, nombre, marca y categorías de 3 niveles.
- Se usa para tres cosas: autocompletar nombre y marca al escanear un código desconocido (`/catalog/lookup?ean=`), buscar por nombre al dar de alta, e importar en lote desde el catálogo (`/products/bulk-import-catalog`, que omite los que ya tenés).
- Los nombres tienen el formato del relevamiento oficial de precios (SEPA / Precios Claros), por ejemplo "Salchichas Panchin De Viena-viena-paq-un.-6" o "Gaseosa Pritty Limón X 1 Lt-pet-lt.-1". Probablemente la fuente sea ese dataset público, aunque es una inferencia. Si se confirma, conviene bajarlo de la fuente oficial en vez de copiarlo de DonKiosco.

## Planes (`GET /plans`)

| Plan | Precio/mes | Productos | Empleados | Suma |
|---|---|---|---|---|
| Gratuito | $0 | 50 | 0 | Punto de venta, promos, caja, carteles y etiquetas, push |
| Básico | $9.900 | 500 | 2 | Estadísticas y ganancia, ritmo de venta y días de stock, fiado, venta mayorista |
| Premium | $17.900 | 25.000 | 10 | Proveedores, remitos y cuenta corriente, distribuidoras, reporte de turno por mail, exportar a Excel, varios negocios (+$8.900 c/u) |

Los códigos de barra no se cobran aparte: el plan gratuito ya tiene la búsqueda por EAN y el catálogo con códigos. Lo que limita el plan gratuito es la cantidad de productos (50).

## Funciones que vale mirar

- **Alta de producto**: si escaneás un código desconocido, autocompleta con el catálogo. También genera un código interno (EAN-13 que empieza con 2, el rango de uso interno) para imprimir y pegar. Vende por peso o medida (kg, g, l, ml, docena, $). Calcula el precio por margen, tiene precio mayorista, IVA por producto e historial de precios.
- **Actualizar precios en lote**: aumenta venta, costo o los dos. Al terminar ofrece imprimir las etiquetas nuevas para que góndola y caja coincidan.
- **Stock**: conteo con planilla impresa y opción de conteo a ciegas (quien cuenta no ve el stock del sistema). Ritmo de venta a 30, 60 o 90 días, filtro de productos sin movimiento, mínimo con alerta y costo promedio o último.
- **Caja y turnos**: ingresos y egresos con categoría, venta cancelada con motivo, cambio de medio de pago después de la venta y exportación a Excel.
- **Proveedores**: días de visita, demora de entrega, pedido mínimo y plazo de pago. Saldo y deuda, pedidos sugeridos por stock bajo, envío por WhatsApp, recepción con foto del remito que actualiza el costo, y pagos a cuenta o por remito.
- **Configuración**: vender sin stock, recargo con tarjeta, descuentos con tope para empleados, tope de fiado, "cuenta empleado" (consumo del personal con tope cada 30 días), mayorista automático por cantidad, condición fiscal e IVA, opciones del ticket, y alias, CBU o QR para transferencias.
- **Tienda online**: catálogo web con pedidos por WhatsApp, QR para imprimir y pegar en el mostrador, y pausa temporal.
- **Distribuidoras**: directorio de mayoristas de la zona que mandan propuestas al kiosco.

## Para nuestra app (ideas, sin decidir)

1. Importar el catálogo inicial (spec del panel de operador, §8.11): la planilla ya está lista. DonKiosco lo hace en el alta del kiosco: elegís rubros, se marcan los más vendidos (12 por rubro) y ajustás precios.
2. Buscar por EAN al escanear un código desconocido, con el catálogo propio como fuente.
3. Generar códigos internos (prefijo 2) para productos sin código, con etiqueta. Encaja con "código interno y oficial" del spec de comprobantes.
4. Conteo a ciegas e impresión de etiquetas después de un aumento.
5. Cuenta empleado (consumo del personal con tope).
