# Módulos configurables (backend)

Fecha: 2026-10-27. Alcance: sólo base de datos (migraciones, funciones, pgTAP) y servicios TypeScript. Las pantallas van aparte.

## Idea

Felipe arma la cuenta de cada cliente según su rubro **prendiendo módulos**, no programando. Cada módulo es una fila de `modulos` (con `descripcion` para mostrarle al cliente qué hace) y se activa por negocio con una fila en `modulos_negocio` desde Supabase Studio. Los módulos nuevos vienen **apagados por defecto**: los kioscos que ya existen no cambian.

| Clave | Qué habilita | Quién |
|---|---|---|
| `fiado` (ya existía) | + saldo por cliente, cobro de deuda, límite de fiado | cobrar: caja y jefe; límite: jefe |
| `precios` | costo, rubro y proveedor por producto; aumento masivo por % con redondeo | jefe |
| `movimientos_caja` | monto inicial, ingresos, retiros, gastos, pagos a proveedor; arqueo al cerrar | caja y jefe |
| `stock` | stock por producto, ingreso de mercadería, ajuste, mínimo y faltantes | ingreso: caja y jefe; ajuste y mínimo: jefe |
| `varios` | líneas de venta sin producto, con importe libre | caja y jefe |

Un módulo apagado rechaza con `modulo_deshabilitado` (detalle = clave). El fiado conserva su código `fiado_deshabilitado`.

## Decisiones

1. **Cambia la decisión 26** (Felipe, 2026-10-27): con `movimientos_caja` el turno tiene monto inicial opcional y arqueo al cerrar (esperado contra contado). Sin el módulo, todo sigue como antes.
2. **Stock en 0: avisa y vende** (Felipe, 2026-10-27). `confirmar_venta` descuenta y devuelve `stock_bajo` con los productos en o bajo su mínimo; nunca rechaza por stock. Productos sin fila en `stock_productos` no llevan stock.
3. Costo, rubro y proveedor van en `productos_gestion`, no en `productos`: la caja no los ve (RLS sólo jefe) y cambiarlos no sube `catalogo_version` ni invalida la caché de las PCs. Por lo mismo, el stock va en `stock_productos`.
4. Los cobros de deuda de fiado (`pagos_fiado`) suman en el turno y en la caja del día por su medio, como plata que entró. No se anulan (v2).
5. El cobro de fiado se permite con el módulo apagado: cobrar deuda vieja nunca hace daño. No se puede cobrar más que el saldo.
6. Con límite de fiado, una venta que lo pasa se rechaza con `limite_fiado`.
7. Movimientos de caja, cobros de fiado e ingresos de stock llevan id generado por el navegador: un reintento no duplica (mismo criterio que `confirmar_venta`).
8. Movimientos de caja, cobros de fiado y movimientos de stock son de sólo agregar.
9. Aumento masivo: porcentaje entre −90 y 1000, distinto de 0; redondeo hacia arriba a 1, 5, 10, 50 o 100; filtro opcional por rubro o proveedor. Cada precio queda en el historial por el trigger de productos.
10. Línea "Varios": `{"varios": true, "precio": N, "cantidad": N, "descripcion": "..."}`; descripción opcional (por defecto "Varios"), 1 a 40 letras. Queda en `lineas_venta` con `producto_id` vacío.

## Fuera de alcance

Pantallas; anular un cobro de fiado o un movimiento de caja; proveedores como entidad; stock con lotes o vencimientos; movimientos de caja en `caja_del_dia`.
