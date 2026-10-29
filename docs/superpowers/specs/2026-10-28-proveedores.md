# Proveedores (módulo `proveedores`)

Fecha: 2026-10-28. Alcance: base de datos (migración, funciones, pgTAP), servicio TypeScript y pantalla. Felipe lo prende por negocio con una fila en `modulos_negocio`, como los demás módulos. Viene apagado.

## Idea

Un proveedor viene, se le pide mercadería y a veces se le paga con plata de la caja. El módulo anota eso en un solo lugar, por proveedor:

| Qué anota | Dónde | Quién |
|---|---|---|
| Ficha: nombre, contacto, notas | `proveedores` | caja y jefe |
| Cuándo viene: fecha y estado (prevista, llegó, no vino), nota | `visitas_proveedor` | caja y jefe |
| Qué pedirle: descripción, cantidad, pedido hecho | `pedidos_proveedor` | caja y jefe |
| Retiros de caja para el proveedor | `movimientos_caja` (tipo `pago_proveedor` + `proveedor_id`) | caja y jefe |

## Decisiones

1. Un retiro para proveedor es un movimiento de caja `pago_proveedor` con `proveedor_id`. Entra al arqueo igual que cualquier pago a proveedor: no hay plata fuera de la caja.
2. Los retiros piden el módulo `movimientos_caja` y el turno abierto en la PC. Sin el módulo, la pantalla muestra ficha, visitas y pedidos, y avisa que los retiros están apagados.
3. El nombre es único por negocio sin distinguir mayúsculas. Es lo que une un proveedor con `productos_gestion.proveedor` (texto libre de Precios).
4. "Agregar faltantes" suma al pedido los productos en mínimo o sin stock cuyo proveedor coincide con el nombre. No duplica un pedido pendiente. Pide el módulo `stock`.
5. Visitas y pedidos se pueden cambiar; no son plata. Sólo se quita una visita que todavía está prevista. Los retiros son de sólo agregar, como todos los movimientos.
6. Alta, visita, pedido y retiro llevan id generado por el navegador: un reintento no duplica.
7. Renombrar un proveedor no cambia el texto que tienen los productos en Precios. Limitación conocida.

## Limitaciones conocidas

- Dos PCs editando la misma ficha a la vez: gana quien guarda último, porque la ficha se escribe completa.
- Un retiro en vuelo al cambiar de sección: si se vuelve a cargar con el mismo importe y detalle antes de que llegue la respuesta, puede grabarse dos veces. Un retiro no se anula en esta versión.
- Al quitar o marcar un renglón, el foco vuelve al cuerpo de la página: la pantalla no mueve el foco.

## Fuera de alcance

Cuenta corriente con el proveedor (compras con costo y saldo), facturas, recordatorios automáticos, visitas que se repiten, anular un retiro y ocultar el contacto a la caja.
