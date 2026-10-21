begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- 1 a 5: prefijos como columnas de planilla
select is(public.prefijo_dispositivo(1), 'A', 'la PC 1 es A');
select is(public.prefijo_dispositivo(26), 'Z', 'la PC 26 es Z');
select is(public.prefijo_dispositivo(27), 'AA', 'la PC 27 es AA');
select is(public.prefijo_dispositivo(53), 'BA', 'la PC 53 es BA');
select is(public.prefijo_dispositivo(703), 'AAA', 'la PC 703 es AAA');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'disp-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'disp-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'disp-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') ->> 'prefijo', 'A',
  'la primera PC del kiosco recibe A');
select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') ->> 'nuevo', 'false',
  'la misma PC (otra pestaña) no se registra dos veces');
select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000002') ->> 'prefijo', 'B',
  'la segunda PC recibe B');

-- PCs 3 a 26 cargadas directo, para llegar a la 27
reset role;
insert into public.dispositivos (id, negocio_id, prefijo, creado_por)
select gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', public.prefijo_dispositivo(i),
       'c0000000-0000-0000-0000-00000000000a'
from generate_series(3, 26) i;
set local role authenticated;

select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000027') ->> 'prefijo', 'AA',
  'la PC 27 no falla: recibe AA');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_ajeno', 'otro kiosco no se apropia de una PC ajena');
select is(public.registrar_dispositivo('b1000000-0000-0000-0000-000000000001') ->> 'prefijo', 'A',
  'los prefijos se numeran por kiosco');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000099') $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se registran PCs');

reset role;
select is((select creado_por from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000002'),
  'c0000000-0000-0000-0000-00000000000a'::uuid, 'el alta guarda la cuenta que la hizo');

-- PC sin uso borrada a mano (B): count+1 cae en AA, que está ocupado; el alta sigue
delete from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.registrar_dispositivo('a1000000-0000-0000-0000-000000000028') ->> 'prefijo', 'AB',
  'borrar una PC del medio no traba las altas');
reset role;

select * from finish();
rollback;
