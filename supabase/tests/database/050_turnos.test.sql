begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'turno-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'turno-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'turno-sin-cuenta@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'turno-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'turno-jefe-b@prueba.local');
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
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b'),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000001b');
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
select is(public.abrir_turno('a1000000-0000-0000-0000-000000000001') -> 'turno_cerrado' ->> 'turno_id',
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
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo)
select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003',
       'c0000000-0000-0000-0000-00000000001a', t.dispositivo_id, t.id, 'Se cobró mal'
from public.turnos t where t.dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and t.cierre is null;

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

-- 16 a 18: dos PCs de B. La venta b1 es del turno de la PC 1; el jefe la anula desde la PC 2, en su turno.
-- PC 1: efectivo 1000 + tarjeta 500 (b1). PC 2: transferencia 800 (b2).
create temp table cierres (dispositivo_id uuid, totales jsonb);
grant select, insert on cierres to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select public.abrir_turno('b1000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select public.abrir_turno('b1000000-0000-0000-0000-000000000002');
reset role;
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
select v.id, 'b0000000-0000-0000-0000-000000000000', t.dispositivo_id, t.cuenta_id, t.id, 1, v.total, repeat(v.letra, 64)
from public.turnos t
join (values ('b4000000-0000-0000-0000-000000000001'::uuid, 'b1000000-0000-0000-0000-000000000001'::uuid, 1500, 'd'),
             ('b4000000-0000-0000-0000-000000000002'::uuid, 'b1000000-0000-0000-0000-000000000002'::uuid, 800, 'e'))
  v(id, dispositivo_id, total, letra) on v.dispositivo_id = t.dispositivo_id
where t.cierre is null;
insert into public.pagos_venta (negocio_id, venta_id, medio, importe) values
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'efectivo', 1000),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'tarjeta', 500),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000002', 'transferencia', 800);
set local role authenticated;
select public.anular_venta('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Se cobró dos veces');
insert into cierres select 'b1000000-0000-0000-0000-000000000002', public.cerrar_turno('b1000000-0000-0000-0000-000000000002') -> 'totales';
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
insert into cierres select 'b1000000-0000-0000-0000-000000000001', public.cerrar_turno('b1000000-0000-0000-0000-000000000001') -> 'totales';
select is((select totales from cierres where dispositivo_id = 'b1000000-0000-0000-0000-000000000001'),
  '{"efectivo": 1000, "transferencia": 0, "tarjeta": 500, "fiado": 0, "cobrado": 1500}'::jsonb,
  'la anulación hecha desde otra PC no resta en el turno de la venta');
select is((select totales from cierres where dispositivo_id = 'b1000000-0000-0000-0000-000000000002'),
  '{"efectivo": -1000, "transferencia": 800, "tarjeta": -500, "fiado": 0, "cobrado": -700}'::jsonb,
  'resta en el turno de la PC donde se anuló');
select is(
  (select jsonb_object_agg(k, s) from (
     select e.key k, sum(e.value::bigint) s from cierres c, jsonb_each_text(c.totales) e group by e.key) x),
  public.caja_del_dia(public.hoy()) - 'anulaciones' - 'fecha',
  'la suma de los cierres del día es la caja del día');

-- 19 a 25: último turno cerrado (la pantalla sin turno abierto lo vuelve a mostrar)
select is(public.ultimo_turno_cerrado('b1000000-0000-0000-0000-000000000002') -> 'totales',
  (select totales from cierres where dispositivo_id = 'b1000000-0000-0000-0000-000000000002'),
  'la caja lee el cierre de hoy con los mismos totales que devolvió cerrar_turno');
select throws_ok($$ select public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'otro kiosco no lee el último turno cerrado de una PC ajena');

-- PC A2: un turno viejo (efectivo 1000), el último cerrado, hace dos días (transferencia 2000 y efectivo
-- 400; anula la venta del viejo) y uno abierto (anula la de 400). PC A3: sólo un turno abierto.
reset role;
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'C', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id, apertura, cierre, cierre_cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-00000000000a', now() - interval '3 days', now() - interval '3 days' + interval '8 hours',
   'c0000000-0000-0000-0000-00000000000a'),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-00000000000a', now() - interval '2 days', now() - interval '40 hours',
   'c0000000-0000-0000-0000-00000000000a'),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-00000000000a', now() - interval '1 hour', null, null),
  ('a3000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-00000000000a', now() - interval '1 hour', null, null);
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
select v.id, 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000002',
       'c0000000-0000-0000-0000-00000000000a', v.turno_id, v.numero, v.total, repeat(v.letra, 64)
from (values ('a4000000-0000-0000-0000-000000000011'::uuid, 'a3000000-0000-0000-0000-000000000001'::uuid, 1, 1000, '1'),
             ('a4000000-0000-0000-0000-000000000012'::uuid, 'a3000000-0000-0000-0000-000000000002'::uuid, 2, 2000, '2'),
             ('a4000000-0000-0000-0000-000000000013'::uuid, 'a3000000-0000-0000-0000-000000000002'::uuid, 3, 400, '3'))
  v(id, turno_id, numero, total, letra);
insert into public.pagos_venta (negocio_id, venta_id, medio, importe) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000011', 'efectivo', 1000),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000012', 'transferencia', 2000),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000013', 'efectivo', 400);
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo)
select 'a0000000-0000-0000-0000-000000000000', a.venta_id, 'c0000000-0000-0000-0000-00000000000a',
       'a1000000-0000-0000-0000-000000000002', a.turno_id, 'Se cobró mal'
from (values ('a4000000-0000-0000-0000-000000000011'::uuid, 'a3000000-0000-0000-0000-000000000002'::uuid),
             ('a4000000-0000-0000-0000-000000000013'::uuid, 'a3000000-0000-0000-0000-000000000003'::uuid)) a(venta_id, turno_id);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000002') ->> 'turno_id',
  'a3000000-0000-0000-0000-000000000002', 'devuelve el último turno cerrado de la PC, no el abierto ni uno anterior');
select is(public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000002'),
  jsonb_build_object('turno_id', 'a3000000-0000-0000-0000-000000000002'::uuid,
    'apertura', now() - interval '2 days', 'cierre', now() - interval '40 hours',
    'totales', '{"efectivo": -600, "transferencia": 2000, "tarjeta": 0, "fiado": 0, "cobrado": 1400}'::jsonb),
  'el jefe ve un cierre de otro día: apertura, cierre y total por medio; restan las anulaciones de ese turno y no las de otro');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000002'), null::jsonb,
  'la caja no ve los totales de un turno cerrado otro día (sólo hoy, como caja_del_dia)');
select is(public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000003'), null::jsonb,
  'null si la PC no cerró ningún turno (el abierto no cuenta)');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.ultimo_turno_cerrado('a1000000-0000-0000-0000-000000000002') $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se lee el último turno cerrado');

-- 26 y 27: abrir_turno devuelve el turno que cerró solo, como cerrar_turno (la caja lo avisa al abrir).
-- Turno abierto de A3: efectivo 600 + transferencia 250; tarjeta 300 anulada en el mismo turno.
reset role;
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
select v.id, 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000003',
       'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000004', v.numero, v.total, repeat(v.letra, 64)
from (values ('a4000000-0000-0000-0000-000000000021'::uuid, 1, 850, '4'),
             ('a4000000-0000-0000-0000-000000000022'::uuid, 2, 300, '5')) v(id, numero, total, letra);
insert into public.pagos_venta (negocio_id, venta_id, medio, importe) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000021', 'efectivo', 600),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000021', 'transferencia', 250),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000022', 'tarjeta', 300);
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000022', 'c0000000-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000004', 'Se cobró mal');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.abrir_turno('a1000000-0000-0000-0000-000000000003') -> 'turno_cerrado',
  jsonb_build_object('turno_id', 'a3000000-0000-0000-0000-000000000004'::uuid,
    'apertura', now() - interval '1 hour', 'cierre', now(),
    'totales', '{"efectivo": 600, "transferencia": 250, "tarjeta": 0, "fiado": 0, "cobrado": 850}'::jsonb),
  'abrir con otro abierto devuelve el cerrado: apertura, cierre y total por medio, neto de sus anulaciones');
select public.cerrar_turno('a1000000-0000-0000-0000-000000000003');
select is(public.abrir_turno('a1000000-0000-0000-0000-000000000003') -> 'turno_cerrado', 'null'::jsonb,
  'abrir sin turno abierto en la PC no cierra nada: turno_cerrado null');

select * from finish();
rollback;
