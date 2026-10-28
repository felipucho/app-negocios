begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'stk-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'stk-jefe@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Chicle', 100),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'Diario', 1500);

-- Venta en efectivo de n chicles.
create function pg_temp.vender_chicles(p_id uuid, n integer) returns jsonb language sql as $f$
  select public.confirmar_venta(p_id, 'a1000000-0000-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object('producto_id', 'a2000000-0000-0000-0000-000000000002', 'cantidad', n, 'precio_visto', 100)),
    jsonb_build_array(jsonb_build_object('medio', 'efectivo', 'importe', n * 100)), n * 100, null)
$f$;
grant execute on function pg_temp.vender_chicles(uuid, integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select throws_ok($$ select public.ingresar_stock(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":10}]') $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no se ingresa stock');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'stock', true);
set local role authenticated;

select is(public.ingresar_stock('a8000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":10},
      {"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":3}]') ->> 'productos', '2',
  'la caja ingresa mercadería');
select is(public.ingresar_stock('a8000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":10},
      {"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":3}]') ->> 'ya_existia', 'true',
  'el reintento del mismo lote no suma dos veces');
select results_eq($$ select cantidad from public.stock_productos order by cantidad desc $$,
  $$ values (10), (3) $$, 'quedan 10 alfajores y 3 chicles');
select throws_ok($$ select public.ingresar_stock(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1},
      {"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2}]') $$,
  'P0001', 'linea_invalida', 'un producto repetido en el lote es un error');
select throws_ok($$ select public.ajustar_stock('a1000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000002', null, 2, null) $$,
  'P0001', 'solo_jefe', 'la caja no ajusta stock');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.ajustar_stock('a1000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000002', null, 2, null) ->> 'minimo', '2', 'el jefe fija el mínimo sin motivo');
select throws_ok($$ select public.ajustar_stock('a1000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001', 8, null, null) $$,
  'P0001', 'motivo_invalido', 'cambiar la cantidad pide motivo');
select is(public.ajustar_stock('a1000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001', 8, null, 'Rotura') ->> 'cantidad', '8', 'el jefe corrige la cantidad');
select results_eq($$ select tipo::text, cantidad, motivo from public.movimientos_stock where tipo = 'ajuste' $$,
  $$ values ('ajuste'::text, -2, 'Rotura'::text) $$, 'el ajuste queda con la diferencia y el motivo');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(pg_temp.vender_chicles('a4000000-0000-0000-0000-000000000001', 2) -> 'stock_bajo',
  '[{"producto_id": "a2000000-0000-0000-0000-000000000002", "nombre": "Chicle", "cantidad": 1, "minimo": 2}]'::jsonb,
  'la venta descuenta y avisa lo que quedó bajo el mínimo');
select results_eq($$ select nombre, cantidad, minimo from public.faltantes() $$,
  $$ values ('Chicle'::text, 1, 2) $$, 'faltantes lista lo que está en o bajo el mínimo');
select is(pg_temp.vender_chicles('a4000000-0000-0000-0000-000000000002', 5) ->> 'estado', 'confirmada',
  'sin stock suficiente, vende igual (avisa y vende)');
select is((select cantidad from public.stock_productos where producto_id = 'a2000000-0000-0000-0000-000000000002'), -4,
  'el stock queda negativo');
select is(public.anular_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Error')
  ->> 'ya_existia', 'false', 'se anula la venta de 5');
select is((select cantidad from public.stock_productos where producto_id = 'a2000000-0000-0000-0000-000000000002'), 1,
  'la anulación devuelve el stock');

select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000003","cantidad":1,"precio_visto":1500}]',
    '[{"medio":"efectivo","importe":1500}]', 1500, null) ? 'stock_bajo', false,
  'un producto sin stock cargado no lleva stock ni avisa');

reset role;
update public.modulos_negocio set activo = false where modulo = 'stock';
set local role authenticated;
select is(pg_temp.vender_chicles('a4000000-0000-0000-0000-000000000004', 1) ? 'stock_bajo', false,
  'con el módulo apagado no avisa');

select * from finish();
rollback;
