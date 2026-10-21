begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'prod-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'prod-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'prod-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'prod-sin-cuenta@prueba.local');
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
insert into public.productos (id, negocio_id, nombre, precio, codigo_barras, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, '7790001', true),
  ('a2000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000000', 'Turrón viejo', 400, '7790008', false),
  ('a2000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000000', 'Pan de ayer', 200, '7790010', false);

-- Devuelve "message:detail" del error que lanza p_sql (el detail lleva el id del producto existente).
create function pg_temp.error_de(p_sql text) returns text language plpgsql as $f$
declare
  v_mensaje text;
  v_detalle text;
begin
  execute p_sql;
  return 'sin error';
exception when others then
  get stacked diagnostics v_mensaje = message_text, v_detalle = pg_exception_detail;
  return v_mensaje || ':' || coalesce(v_detalle, '');
end;
$f$;

-- 1 a 23: la caja de A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790002', 'Agua mineral', 1200) ->> 'creado_en_caja',
  'true', 'la caja da de alta y el producto vuelve marcado como creado en caja');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790003', '  Chicle  ', 200) ->> 'nombre',
  'Chicle', 'el nombre se recorta');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', null, 'Pan casero', 800) ->> 'codigo_barras',
  null, 'la caja da de alta un producto sin código');
select is(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '  ', 'Pan casero', 850) ->> 'creado_en_caja',
  'true', 'otro sin código con el mismo nombre no falla: la unicidad es sólo del código (vacío = sin código)');
select results_eq(
  $$ select cantidad_ventas from public.ranking_sin_codigo() where nombre = 'Pan casero' $$,
  $$ values (0), (0) $$,
  'los productos sin código entran a la grilla F2 con 0 ventas');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790001', 'Otro alfajor', 950) $$,
  'P0001', 'codigo_existente', 'un código que ya está activo no se da de alta otra vez');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790008', 'Turrón nuevo', 450) $$,
  'P0001', 'codigo_existente_inactivo', 'el código de un producto desactivado da error propio: se ofrece reactivar');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 12.5) $$,
  'P0001', 'precio_invalido', 'un precio con centavos se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 0) $$,
  'P0001', 'precio_invalido', 'precio cero se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', -100) $$,
  'P0001', 'precio_invalido', 'precio negativo se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', '   ', 100) $$,
  'P0001', 'nombre_invalido', 'el nombre es obligatorio');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', 'con espacio', 'Caramelo', 100) $$,
  'P0001', 'codigo_invalido', 'un código con espacios no es un código escaneado');
select throws_ok($$ select public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790004', 'Caramelo', 100) $$,
  'P0001', 'dispositivo_desconocido', 'la caja de A no usa una PC de B');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1000) ->> 'precio',
  '1000', 'la caja edita el precio');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 9.99) $$,
  'P0001', 'precio_invalido', 'editar con centavos se rechaza');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 0) $$,
  'P0001', 'precio_invalido', 'editar a precio cero se rechaza');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_nombre => '  ') $$,
  'P0001', 'nombre_invalido', 'editar a nombre vacío se rechaza');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790004', E'Cara
melo', 100) $$,
  'P0001', 'nombre_invalido', 'un nombre con saltos de línea se rechaza');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_nombre => 'Alfajor ' || chr(8238) || 'falso') $$,
  'P0001', 'nombre_invalido', 'editar a un nombre con override de dirección se rechaza');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_activo => false) ->> 'activo',
  'false', 'la caja desactiva un producto');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000009',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_activo => true) ->> 'activo',
  'true', 'la caja reactiva un producto desactivado');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_nombre => 'Alfajor triple') ->> 'codigo_barras',
  '7790001', 'cambiar el nombre no toca el código de barras');
select throws_ok($$ select public.editar_producto(p_producto_id => gen_random_uuid(),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 100) $$,
  'P0001', 'producto_desconocido', 'un producto inexistente se rechaza');

-- 24 y 25: el jefe de A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', null, 'Caramelos sueltos', 50) ->> 'id',
  null, 'el jefe también da de alta, también sin código');
select is(public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1100) ->> 'precio',
  '1100', 'el jefe también edita');

-- 26: sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790005', 'Intruso', 100) $$,
  'P0001', 'sin_cuenta', 'sin cuenta no se dan de alta productos');

-- 27 a 29: la caja de B (aislamiento entre negocios, obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'b1000000-0000-0000-0000-000000000001', p_precio => 1) $$,
  'P0001', 'producto_desconocido', 'B no edita productos de A');
select is(public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor de B', 800) ->> 'codigo_barras',
  '7790001', 'B carga el mismo código que A: es único por kiosco y B no se entera de que existe en A');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790099', 'Otro', 100) $$,
  'P0001', 'dispositivo_desconocido', 'B no usa la PC de A');

-- 30 a 36: como postgres
reset role;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(pg_temp.error_de($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790010', 'Pan nuevo', 300) $$),
  'codigo_existente_inactivo:a2000000-0000-0000-0000-000000000010',
  'el error trae el id del producto desactivado para reactivarlo');
select results_eq(
  $$ select nombre, precio, codigo_barras, activo, creado_en_caja from public.productos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and codigo_barras = '7790002' $$,
  $$ values ('Agua mineral'::text, 1200, '7790002'::text, true, true) $$,
  'el alta rápida quedó guardada con el código escaneado y "creado en caja"');
select results_eq(
  $$ select precio, codigo_barras, creado_en_caja from public.productos
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and nombre = 'Pan casero' order by precio $$,
  $$ values (800, null::text, true), (850, null::text, true) $$,
  'los dos "Pan casero" quedaron sin código y marcados creado en caja');
select results_eq(
  $$ select nombre, precio, activo from public.productos where id = 'a2000000-0000-0000-0000-000000000001' $$,
  $$ values ('Alfajor triple'::text, 1100, false) $$,
  'los intentos de B no cambiaron el producto de A');
select results_eq(
  $$ select negocio_id from public.productos where codigo_barras = '7790001' order by negocio_id $$,
  $$ values ('a0000000-0000-0000-0000-000000000000'::uuid), ('b0000000-0000-0000-0000-000000000000'::uuid) $$,
  'el mismo código existe una vez por kiosco');

create temporary table version_antes as
  select catalogo_version as v from public.negocios where id = 'a0000000-0000-0000-0000-000000000000';
do $$ begin
  perform public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1100);
end $$;
select is((select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000'),
  (select v from version_antes), 'editar sin cambios no sube catalogo_version');
do $$ begin
  perform public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1150);
end $$;
select is((select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000'),
  (select v + 1 from version_antes), 'un cambio de precio sube catalogo_version');

select * from finish();
rollback;
