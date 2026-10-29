begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000a', 'proveedores@prueba.local');
insert into public.negocios (id, nombre) values ('d0000000-0000-0000-0000-000000000000', 'Kiosco D');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('d0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'A', 'd0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('d0000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000000', 'Alfajor', 900),
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 'Galletitas', 1400),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 'Galletitas', 1400);
insert into public.productos_gestion (producto_id, negocio_id, costo, rubro, proveedor) values
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 900, 'Almacén', 'COCA-COLA'),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 900, 'Almacén', 'COCA-COLA');
insert into public.stock_productos (producto_id, negocio_id, cantidad, minimo) values
  ('d2000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000000', 2, 5),
  ('d2000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000000', 1, 5);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"d0000000-0000-0000-0000-000000000000"}', true);

select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000001', 'Coca Cola') $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no hay proveedores');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values
  ('d0000000-0000-0000-0000-000000000000', 'proveedores', true),
  ('d0000000-0000-0000-0000-000000000000', 'movimientos_caja', true),
  ('d0000000-0000-0000-0000-000000000000', 'stock', true);
set local role authenticated;

select is(public.guardar_proveedor('d3000000-0000-0000-0000-000000000001', '  Coca   Cola ') ->> 'nombre', 'Coca Cola',
  'el nombre se limpia de espacios sobrantes');
select is(public.guardar_proveedor('d3000000-0000-0000-0000-000000000001', 'Coca-Cola', 'Juan 11-5555-0101', null) ->> 'contacto',
  'Juan 11-5555-0101', 'guardar otra vez con el mismo id actualiza la ficha');
select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000002', 'COCA-COLA') $$,
  'P0001', 'nombre_repetido', 'no hay dos proveedores con el mismo nombre, sin mayúsculas');
select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000003', '   ') $$,
  'P0001', 'texto_invalido', 'el nombre no puede quedar vacío');
select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000003', 'Coca' || chr(8238)) $$,
  'P0001', 'texto_invalido', 'el nombre no lleva caracteres de sentido oculto');
select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000003', 'Pepsi', chr(7)) $$,
  'P0001', 'texto_invalido', 'el contacto no lleva caracteres de control');
select is(public.guardar_proveedor('d3000000-0000-0000-0000-000000000001', 'Coca-Cola', 'Juan 11-5555-0101', E'Viene\nlos martes') ->> 'notas',
  'Viene los martes', 'las notas con salto de línea se guardan en una sola línea');

select is(public.registrar_visita_proveedor('d4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
  '2026-10-30', 'Trae los pedidos') ->> 'estado', 'prevista', 'una visita nueva queda prevista');
select is(public.registrar_visita_proveedor('d4000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
  '2026-10-30', 'Trae los pedidos') ->> 'id', 'd4000000-0000-0000-0000-000000000001',
  'un reintento con el mismo id no suma otra visita');
select throws_ok($$ select public.registrar_visita_proveedor('d4000000-0000-0000-0000-000000000009', 'd3000000-0000-0000-0000-000000000099',
  '2026-10-31', null) $$, 'P0001', 'proveedor_desconocido', 'la visita tiene que ser de un proveedor del kiosco');
select is(public.marcar_visita_proveedor('d4000000-0000-0000-0000-000000000001', 'llego') ->> 'estado', 'llego',
  'la visita se marca como llegó');
select throws_ok($$ select public.marcar_visita_proveedor('d4000000-0000-0000-0000-000000000001', 'cancelada') $$,
  'P0001', 'estado_invalido', 'el estado tiene que ser de la lista');
select throws_ok($$ select public.quitar_visita_proveedor('d4000000-0000-0000-0000-000000000001') $$,
  'P0001', 'visita_ya_marcada', 'una visita ya marcada no se quita');
select lives_ok($$ select public.registrar_visita_proveedor('d4000000-0000-0000-0000-000000000002',
  'd3000000-0000-0000-0000-000000000001', '2026-11-02', null) $$, 'otra visita, esta prevista');
select lives_ok($$ select public.quitar_visita_proveedor('d4000000-0000-0000-0000-000000000002') $$,
  'una visita prevista sí se quita');

select is(public.agregar_pedido_proveedor('d5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
  '  Coca 2,25 L  ', '2 cajas') ->> 'descripcion', 'Coca 2,25 L', 'el renglón de pedido se limpia');
select is(public.agregar_pedido_proveedor('d5000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001',
  'Coca 2,25 L', '2 cajas') ->> 'id', 'd5000000-0000-0000-0000-000000000001', 'un reintento no suma otro renglón');
select is(public.marcar_pedido_proveedor('d5000000-0000-0000-0000-000000000001', true) ->> 'hecho', 'true',
  'el renglón se marca como pedido');
select throws_ok($$ select public.quitar_pedido_proveedor('d5000000-0000-0000-0000-000000000099') $$,
  'P0001', 'pedido_desconocido', 'un renglón que no existe no se puede quitar');

select is(public.agregar_faltantes_al_pedido('d3000000-0000-0000-0000-000000000001') ->> 'cantidad', '1',
  'suma el faltante que Precios tiene con este proveedor, sin mayúsculas');
select is(public.agregar_faltantes_al_pedido('d3000000-0000-0000-0000-000000000001') ->> 'cantidad', '0',
  'un faltante ya pendiente no se repite');

select is(public.registrar_movimiento_caja('d6000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
  'pago_proveedor', 500, 'Pago de la semana', 'd3000000-0000-0000-0000-000000000001') ->> 'proveedor_id',
  'd3000000-0000-0000-0000-000000000001', 'el retiro queda a nombre del proveedor');
select is(public.registrar_movimiento_caja('d6000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
  'pago_proveedor', 500, 'Pago de la semana', 'd3000000-0000-0000-0000-000000000001') ->> 'ya_existia', 'true',
  'el reintento del retiro no registra dos veces');
select throws_ok($$ select public.registrar_movimiento_caja('d6000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001', 'pago_proveedor', 500, 'Pago de la semana', null) $$,
  'P0001', 'movimiento_id_reusado', 'el mismo id sin proveedor es otro movimiento');
select throws_ok($$ select public.registrar_movimiento_caja('d6000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000001', 'retiro', 300, null, 'd3000000-0000-0000-0000-000000000001') $$,
  'P0001', 'tipo_invalido', 'sólo un pago a proveedor lleva proveedor');
select throws_ok($$ select public.registrar_movimiento_caja('d6000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000001', 'gasto', 100, 'Bolsas' || chr(8238)) $$,
  'P0001', 'texto_invalido', 'el detalle no lleva caracteres de sentido oculto');

reset role;
insert into public.negocios (id, nombre) values ('d0000000-0000-0000-0000-000000000009', 'Kiosco ajeno');
insert into public.proveedores (id, negocio_id, nombre) values
  ('d3000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', 'Proveedor ajeno');
set local role authenticated;

select is((select count(*)::int from public.proveedores), 1, 'la caja sólo ve los proveedores de su kiosco');
select throws_ok($$ select public.guardar_proveedor('d3000000-0000-0000-0000-000000000009', 'Robado') $$,
  'P0001', 'proveedor_desconocido', 'no se edita la ficha de otro kiosco');
select throws_ok($$ insert into public.proveedores (negocio_id, nombre) values
  ('d0000000-0000-0000-0000-000000000000', 'Directo') $$,
  '42501', 'permission denied for table proveedores', 'la tabla no se escribe directo');

select * from finish();
rollback;
