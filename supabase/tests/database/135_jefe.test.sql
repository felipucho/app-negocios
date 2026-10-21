begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

-- 11 a 13: con el fiado de A todavía apagado, el jefe ve sus clientes y anonimiza igual (es pedido de la persona)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select set_eq($$ select id from public.clientes $$,
  $$ values ('a5000000-0000-0000-0000-000000000001'::uuid), ('a5000000-0000-0000-0000-000000000002'::uuid) $$,
  'con el fiado apagado, el jefe sigue viendo los clientes de A (y no los de B)');
select is(public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') ->> 'nombre', 'Cliente suprimido',
  'con el fiado apagado, el jefe anonimiza un cliente igual');
select results_eq($$ select id from public.clientes_con_telefono() $$,
  $$ values ('a5000000-0000-0000-0000-000000000002'::uuid) $$,
  'clientes_con_telefono no trae al suprimido ni a los clientes de B');

-- 14 a 18: el jefe de A, con el fiado prendido de nuevo
select is(public.cambiar_modulo_fiado(true) ->> 'activo', 'true', 'el jefe vuelve a prender el fiado');
select ok(public.modulo_activo('fiado'), 'el cambio aplica sin esperar a que venza el token');
select throws_ok($$ select public.cambiar_modulo_fiado(null) $$, 'P0001', 'pedido_invalido', 'activo nulo se rechaza');
select is(public.anonimizar_cliente('a5000000-0000-0000-0000-000000000001') ->> 'nombre', 'Cliente suprimido',
  'anonimizar dos veces no falla');
select throws_ok($$ select public.anonimizar_cliente(gen_random_uuid()) $$, 'P0001', 'cliente_desconocido',
  'un cliente inexistente se rechaza');

-- 19: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.cambiar_modulo_fiado(true) $$, 'P0001', 'sin_cuenta', 'sin cuenta no cambia el módulo');

-- 20 a 24: como postgres, qué quedó
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
  $$ select negocio_id, activo from public.modulos_negocio where modulo = 'fiado'
     and negocio_id in ('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000') order by negocio_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000000'::uuid, true), ('b0000000-0000-0000-0000-000000000000'::uuid, false) $$,
  'una fila por kiosco: cada jefe cambia sólo el suyo');

select * from finish();
rollback;
