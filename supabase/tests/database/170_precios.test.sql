begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'pre-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'pre-jefe@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Gaseosa', 1000);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select throws_ok($$ select public.editar_gestion_producto('a2000000-0000-0000-0000-000000000001', 500, 'Golosinas', null) $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no se cargan costos');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'precios', true);
set local role authenticated;

select is(public.editar_gestion_producto('a2000000-0000-0000-0000-000000000001', 500, '  Golosinas ', 'Distri') ->> 'rubro',
  'Golosinas', 'el jefe carga costo, rubro y proveedor (el rubro sin blancos de más)');
select throws_ok($$ select public.editar_gestion_producto('a2000000-0000-0000-0000-000000000001', 10.5, null, null) $$,
  'P0001', 'costo_invalido', 'el costo es en pesos enteros');

select is(public.aumentar_precios('a1000000-0000-0000-0000-000000000001', 10, 10, 'GOLOSINAS') ->> 'cantidad', '1',
  'el aumento por rubro toca sólo ese rubro, sin distinguir mayúsculas');
select results_eq($$ select nombre, precio from public.productos order by nombre $$,
  $$ values ('Alfajor'::text, 990), ('Gaseosa', 1000) $$, 'Alfajor sube 10 %; Gaseosa no es del rubro');
select results_eq(
  $$ select valor_anterior ->> 'precio', valor_nuevo ->> 'precio', dispositivo_id from public.historial
     where tipo = 'cambio_precio' and entidad_id = 'a2000000-0000-0000-0000-000000000001' $$,
  $$ values ('900'::text, '990'::text, 'a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'cada precio aumentado queda en el historial con la PC');

select is(public.aumentar_precios('a1000000-0000-0000-0000-000000000001', 7, 50) ->> 'cantidad', '2',
  'sin filtro toca todos');
select results_eq($$ select precio from public.productos order by nombre $$,
  $$ values (1100), (1100) $$, 'redondea hacia arriba al múltiplo pedido (1059,3 → 1100; 1070 → 1100)');

select throws_ok($$ select public.aumentar_precios('a1000000-0000-0000-0000-000000000001', 0, 10) $$,
  'P0001', 'porcentaje_invalido', 'un aumento de 0 % no se acepta');
select throws_ok($$ select public.aumentar_precios('a1000000-0000-0000-0000-000000000001', 10, 7) $$,
  'P0001', 'redondeo_invalido', 'el redondeo es 1, 5, 10, 50 o 100');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.aumentar_precios('a1000000-0000-0000-0000-000000000001', 10, 10) $$,
  'P0001', 'solo_jefe', 'la caja no aumenta precios');

select * from finish();
rollback;
