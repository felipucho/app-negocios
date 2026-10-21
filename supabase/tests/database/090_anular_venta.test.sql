begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'anu-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'anu-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'anu-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'anu-jefe-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'anu-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001b', 'b0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
-- v1 y v3 son de hoy; v2 es de ayer. bv1 es de B.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 900, repeat('a', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 900, repeat('b', 64)),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, now(), 900, repeat('c', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 700, repeat('d', 64));

-- 1 a 11: caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '  Se cobró dos veces  ') ->> 'ya_existia',
  'false', 'la caja anula una venta de hoy');
select is((select motivo from public.anulaciones where venta_id = 'a4000000-0000-0000-0000-000000000001'),
  'Se cobró dos veces', 'el motivo se guarda recortado');
select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    'Otro motivo') ->> 'ya_existia',
  'true', 'anular dos veces no falla: devuelve la anulación que ya existe');
select is(public.anular_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    'Tercer intento') ->> 'anulacion_id',
  (select id::text from public.anulaciones where venta_id = 'a4000000-0000-0000-0000-000000000001'),
  'y es la misma anulación, no otra');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'Error de carga') $$,
  'P0001', 'fuera_de_dia', 'la caja no anula una venta de ayer');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', '   ') $$,
  'P0001', 'motivo_invalido', 'el motivo vacío se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', null) $$,
  'P0001', 'motivo_invalido', 'sin motivo no se anula');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', ' ab ') $$,
  'P0001', 'motivo_invalido', 'un motivo de 2 letras se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', repeat('x', 201)) $$,
  'P0001', 'motivo_invalido', 'un motivo de 201 letras se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000009',
    'a1000000-0000-0000-0000-000000000001', 'No existe') $$,
  'P0001', 'venta_desconocida', 'una venta inexistente se rechaza');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'PC ajena') $$,
  'P0001', 'dispositivo_desconocido', 'no se anula desde una PC de otro negocio');

-- 12 y 13: jefe de A, después la caja reintenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.anular_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    'Devolución del cliente') ->> 'ya_existia',
  'false', 'el jefe anula una venta de ayer');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001', 'Reintento') $$,
  'P0001', 'fuera_de_dia', 'la caja no ve la anulación de ayer aunque exista');

-- 14 a 16: caja de B (aislamiento, obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001', 'Curioso') $$,
  'P0001', 'venta_desconocida', 'B no recibe la anulación existente de una venta de A');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'Intruso') $$,
  'P0001', 'venta_desconocida', 'B no anula una venta de A');
select is((select count(*)::int from public.anulaciones), 0, 'B no ve anulaciones de A');

-- 17 y 18: jefe de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001', 'Intruso jefe') $$,
  'P0001', 'venta_desconocida', 'el jefe de B, que anula cualquier día, tampoco anula ventas de A');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', 'Token trucado') $$,
  'P0001', 'sin_cuenta', 'una cuenta de B con negocio_id de A en el token no anula en A');

-- 19: authenticated sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001', 'Sin cuenta') $$,
  'P0001', 'sin_cuenta', 'un usuario sin cuenta no anula');

-- 20 a 25: lo que quedó grabado, visto como postgres
reset role;
select results_eq(
  $$ select venta_id, cuenta_id, dispositivo_id from public.anulaciones
     where venta_id in ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002') order by venta_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid),
            ('a4000000-0000-0000-0000-000000000002'::uuid, 'c0000000-0000-0000-0000-00000000001a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'una sola anulación por venta, con cuenta y dispositivo');
select results_eq(
  $$ select entidad_id, motivo, cuenta_id from public.historial where tipo = 'anulacion'
     and entidad_id in ('a4000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002') order by entidad_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid, 'Se cobró dos veces'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid),
            ('a4000000-0000-0000-0000-000000000002'::uuid, 'Devolución del cliente'::text, 'c0000000-0000-0000-0000-00000000001a'::uuid) $$,
  'cada anulación queda en el historial con su motivo, sin duplicados por los reintentos');
select is((select count(*)::int from public.ventas where negocio_id = 'a0000000-0000-0000-0000-000000000000'), 3,
  'la anulación no borra ventas');
select is((select total from public.ventas where id = 'a4000000-0000-0000-0000-000000000002'), 900,
  'ni las modifica');
select ok(not has_function_privilege('anon', 'public.anular_venta(uuid, uuid, text)', 'execute'),
  'anon no ejecuta anular_venta');
select ok(has_function_privilege('authenticated', 'public.anular_venta(uuid, uuid, text)', 'execute'),
  'authenticated sí');

select * from finish();
rollback;
