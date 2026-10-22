begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'rank-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'rank-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'rank-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'rank-sin-cuenta@prueba.local');
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
insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
insert into public.productos (id, negocio_id, nombre, precio, codigo_barras, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Bizcochos', 500, null, true),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Alfajor de maicena', 700, null, true),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'Chicle', 200, null, true),
  ('a2000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'Pan', 300, null, false),
  ('a2000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'Gaseosa', 1500, '7790005', true),
  ('a2000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'Medialuna', 400, null, true),
  ('a2000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000000', 'Turron', 600, null, true),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochos B', 500, null, true);

-- s1 hoy; s2 ayer; s3 hace 10 días; s4 hace 29 días; s5 hace 31 días (no cuenta); s6 hoy, anulada; s7 de B.
insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 3200, repeat('1', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 5700, repeat('2', 64)),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, now() - interval '10 days', 1800, repeat('3', 64)),
  ('a4000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 4, now() - interval '29 days', 500, repeat('4', 64)),
  ('a4000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 5, now() - interval '31 days', 1100, repeat('5', 64)),
  ('a4000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 6, now(), 800, repeat('6', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 500, repeat('7', 64));

insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario) values
  -- s1: 5 bizcochos (5 unidades, 1 venta) y 1 alfajor
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 5, 500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  -- s2: alfajor, chicle, gaseosa (con código) y pan (desactivado)
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003', 1, 200),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000005', 3, 1500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000004', 1, 300),
  -- s3: el alfajor en dos líneas de la misma venta (cuenta una vez) y 2 chicles
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000002', 1, 700),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000003', 2, 200),
  -- s4: hace 29 días, cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 1, 500),
  -- s5: hace 31 días, no cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000001', 1, 500),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000007', 1, 600),
  -- s6: anulada, no cuenta
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000007', 1, 600),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000003', 1, 200),
  -- s7: B
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 1, 500);

insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Prueba de ranking');

-- 1 a 7: caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Alfajor de maicena'::text, 3), ('Bizcochos'::text, 2), ('Chicle'::text, 2),
            ('Medialuna'::text, 0), ('Turron'::text, 0) $$,
  'más ventas primero; empates en orden alfabético; los no vendidos al final con 0');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Bizcochos'), 2,
  'cuenta ventas, no unidades: 6 unidades en 2 ventas (la de hace 31 días no cuenta)');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Alfajor de maicena'), 3,
  'el producto en dos líneas de una misma venta cuenta una sola venta');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Turron'), 0,
  'no cuentan la venta anulada ni la de hace 31 días');
select is((select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Chicle'), 2,
  'la venta anulada no suma');
select is_empty(
  $$ select nombre from public.ranking_sin_codigo() where nombre in ('Pan', 'Gaseosa') $$,
  'excluye productos desactivados y productos con código de barras');
select is((select count(*)::int from public.ventas), 2,
  'por RLS la caja ve sólo las 2 ventas de hoy: por eso el ranking de 30 días es security definer');

-- 8: jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Alfajor de maicena'::text, 3), ('Bizcochos'::text, 2), ('Chicle'::text, 2),
            ('Medialuna'::text, 0), ('Turron'::text, 0) $$,
  'el jefe ve el mismo ranking');

-- 9: caja de B (aislamiento)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select results_eq(
  $$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Bizcochos B'::text, 1) $$,
  'B ve sólo su ranking: ni productos ni ventas de A');

-- 10: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select * from public.ranking_sin_codigo() $$, 'P0001', 'sin_cuenta', 'sin cuenta no hay ranking');

-- 11 a 13: forma y permisos
reset role;
select is((select proargnames from pg_proc where oid = 'public.ranking_sin_codigo()'::regprocedure),
  array['producto_id', 'nombre', 'cantidad_ventas'],
  'no recibe parámetros y devuelve sólo producto, nombre y cantidad de ventas');
select ok((select prosecdef from pg_proc where oid = 'public.ranking_sin_codigo()'::regprocedure),
  'security definer (decisión que va para OK de Felipe)');
select ok(not has_function_privilege('anon', 'public.ranking_sin_codigo()', 'execute'), 'anon no lo ejecuta');

select * from finish();
rollback;
