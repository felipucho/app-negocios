begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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

-- Borde del día operativo en Buenos Aires (V26): una venta a las 23:59:59 y dos del día siguiente.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 7, '2026-10-10 23:59:59-03', 100, repeat('8', 64)),
  ('a4000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 8, '2026-10-11 00:00:00-03', 200, repeat('9', 64)),
  ('a4000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000002', 9, '2026-10-11 23:59:59-03', 400, repeat('0', 64));
insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000007', 'efectivo', 100, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000008', 'efectivo', 200, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000009', 'efectivo', 400, null);

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
select is((public.caja_del_dia(public.hoy()) -> 'anulaciones') - 'detalle',
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

-- 22 a 24: borde del día operativo, con la sesión en UTC para que no dependa de la zona de la sesión
set local timezone = 'UTC';
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.caja_del_dia('2026-10-10') ->> 'efectivo', '100',
  'la venta de las 23:59:59 cuenta en su día');
select is(public.caja_del_dia('2026-10-11') ->> 'efectivo', '600',
  'las de 00:00 y 23:59:59 cuentan en el día siguiente');
select results_eq(
  $$ select numero, hora from public.ventas_del_dia('2026-10-11') order by numero $$,
  $$ values (8, '00:00'::text), (9, '23:59'::text) $$,
  'ventas_del_dia usa el día y la hora de Buenos Aires');

-- 25 a 28: forma y permisos
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
