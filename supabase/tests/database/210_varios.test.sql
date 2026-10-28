begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'var-caja@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900);

-- Venta en efectivo con estas líneas y este total.
create function pg_temp.vender(p_id uuid, p_lineas jsonb, p_total integer) returns jsonb language sql as $f$
  select public.confirmar_venta(p_id, 'a1000000-0000-0000-0000-000000000001', p_lineas,
    jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', p_total)), p_total, null)
$f$;
grant execute on function pg_temp.vender(uuid, jsonb, integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select throws_ok($$ select pg_temp.vender(gen_random_uuid(), '[{"varios":true,"precio":250,"cantidad":1}]', 250) $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no hay líneas varios');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'varios', true);
set local role authenticated;

select is(pg_temp.vender('a4000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900},
      {"varios":true,"precio":250,"cantidad":2,"descripcion":"Fotocopias"}]', 1400) ->> 'total', '1400',
  'producto + varios: el total suma las dos líneas');
select results_eq(
  $$ select producto_id, descripcion, cantidad, precio_unitario from public.lineas_venta
     where venta_id = 'a4000000-0000-0000-0000-000000000001' order by descripcion nulls first $$,
  $$ values ('a2000000-0000-0000-0000-000000000001'::uuid, null::text, 1, 900), (null, 'Fotocopias', 2, 250) $$,
  'la línea varios queda sin producto, con descripción y su precio');
select is(pg_temp.vender('a4000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900},
      {"varios":true,"precio":250,"cantidad":2,"descripcion":"Fotocopias"}]', 1400) ->> 'ya_existia', 'true',
  'el reintento con el mismo contenido devuelve la misma venta');

select is(pg_temp.vender('a4000000-0000-0000-0000-000000000002', '[{"varios":true,"precio":300,"cantidad":1}]', 300)
  ->> 'estado', 'confirmada', 'varios sin descripción');
select is((select descripcion from public.lineas_venta where venta_id = 'a4000000-0000-0000-0000-000000000002'), 'Varios',
  'sin descripción queda "Varios"');

select throws_ok($$ select pg_temp.vender(gen_random_uuid(),
    '[{"varios":true,"producto_id":"a2000000-0000-0000-0000-000000000001","precio":900,"cantidad":1}]', 900) $$,
  'P0001', 'linea_invalida', 'una línea varios no lleva producto');
select throws_ok($$ select pg_temp.vender(gen_random_uuid(), '[{"varios":true,"precio":10.5,"cantidad":1}]', 10) $$,
  'P0001', 'linea_invalida', 'el precio de varios es en pesos enteros');
select throws_ok($$ select pg_temp.vender(gen_random_uuid(), '[{"varios":false,"precio":100,"cantidad":1}]', 100) $$,
  'P0001', 'linea_invalida', 'varios: false no es una línea válida');
select throws_ok($$ select pg_temp.vender(gen_random_uuid(), '[{"varios":true,"precio":100,"cantidad":2}]', 100) $$,
  'P0001', 'total_distinto', 'el total de varios se recalcula');

select * from finish();
rollback;
