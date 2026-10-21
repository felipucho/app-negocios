begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'turno-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'turno-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'turno-sin-cuenta@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'turno-caja-b@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to');

-- 1 a 3: la caja abre
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.abrir_turno('a1000000-0000-0000-0000-000000000001') ->> 'turno_id', null,
  'la caja abre turno sin monto inicial');
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, cierre is null from public.turnos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid, true) $$,
  'la apertura registra cuenta y dispositivo');
select results_eq(
  $$ select tipo::text, cuenta_id, dispositivo_id from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' $$,
  $$ values ('apertura_turno'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'la apertura queda en el historial');

-- 4 a 7: el jefe abre en la misma PC; el turno de la caja se cierra solo
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.abrir_turno('a1000000-0000-0000-0000-000000000001') ->> 'turno_cerrado_id',
  (select id::text from public.turnos where cuenta_id = 'c0000000-0000-0000-0000-00000000000a'),
  'abrir con otro abierto cierra el anterior');
reset role;
select is((select count(*)::int from public.turnos
           where dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and cierre is null),
  1, 'queda un solo turno abierto en la PC');
select ok(
  (select a.cierre = b.apertura from public.turnos a, public.turnos b
   where a.cuenta_id = 'c0000000-0000-0000-0000-00000000000a' and b.cuenta_id = 'c0000000-0000-0000-0000-00000000001a'),
  'el anterior se cierra con la hora de la nueva apertura');
select results_eq(
  $$ select valor_nuevo ->> 'automatico' from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cierre_turno' $$,
  $$ values ('true'::text) $$,
  'el cierre automático queda en el historial');

-- Ventas del turno del jefe: efectivo 900 + tarjeta 500; transferencia 700 + fiado 300; efectivo 200 anulada.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
select v.id, 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-00000000001a', t.id, v.numero, v.total, repeat(v.letra, 64)
from public.turnos t,
     (values ('a4000000-0000-0000-0000-000000000001'::uuid, 1, 1400, 'a'),
             ('a4000000-0000-0000-0000-000000000002'::uuid, 2, 1000, 'b'),
             ('a4000000-0000-0000-0000-000000000003'::uuid, 3, 200, 'c')) v(id, numero, total, letra)
where t.dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and t.cierre is null;
insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'efectivo', 900, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'tarjeta', 500, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'transferencia', 700, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'fiado', 300, 'a5000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'efectivo', 200, null);
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-00000000001a', 'a1000000-0000-0000-0000-000000000001', 'Se cobró mal');

-- 8 a 10: cierre con total por medio de pago
set local role authenticated;
select is(public.cerrar_turno('a1000000-0000-0000-0000-000000000001') -> 'totales',
  '{"efectivo": 900, "transferencia": 700, "tarjeta": 500, "fiado": 300, "cobrado": 2100}'::jsonb,
  'total por medio del turno; la anulación resta; el fiado no suma a lo cobrado');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'sin_turno', 'sin turno abierto no hay nada que cerrar');
reset role;
select results_eq(
  $$ select valor_nuevo ->> 'automatico' from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cierre_turno'
     order by valor_nuevo ->> 'automatico' $$,
  $$ values ('false'::text), ('true'::text) $$,
  'el cierre manual también queda en el historial');

-- 11 y 12: sin cuenta y PC desconocida
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se abre turno');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000099') $$,
  'P0001', 'dispositivo_desconocido', 'una PC no registrada no abre turno');

-- 13 a 15: otro kiosco no abre ni cierra turnos en una PC ajena (security definer saltea RLS)
select public.abrir_turno('a1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'otro kiosco no abre turno en una PC ajena');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'otro kiosco no cierra el turno de una PC ajena');
reset role;
select results_eq(
  $$ select cuenta_id from public.turnos
     where dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and cierre is null $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid) $$,
  'el turno abierto de la PC ajena sigue abierto y con su cuenta');

select * from finish();
rollback;
