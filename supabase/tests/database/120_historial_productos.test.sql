begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'hp-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'hp-jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'hp-caja-b@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000001a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');

-- 1 y 2: alta desde la caja de A, PC A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
do $$ begin
  perform public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor', 900);
end $$;
reset role;
select results_eq(
  $$ select h.tipo::text, h.cuenta_id, h.dispositivo_id, h.valor_anterior, h.valor_nuevo
     from public.historial h join public.productos p on p.id = h.entidad_id
     where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.codigo_barras = '7790001' $$,
  $$ values ('alta_producto'::text, 'c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid,
             null::jsonb,
             '{"nombre": "Alfajor", "precio": 900, "codigo_barras": "7790001", "activo": true, "creado_en_caja": true}'::jsonb) $$,
  'el alta queda en el historial con cuenta, PC y valores');
select is(current_setting('app.dispositivo_id', true), '', 'la función no deja la PC puesta en la sesión');

-- 3 y 4: la caja cambia el precio
set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1000);
end $$;
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_precio' $$,
  $$ values ('c0000000-0000-0000-0000-00000000000a'::uuid, 'a1000000-0000-0000-0000-000000000001'::uuid,
             '{"precio": 900}'::jsonb, '{"precio": 1000}'::jsonb) $$,
  'el cambio de precio guarda valor anterior y nuevo, cuenta y PC');
select is_empty(
  $$ select 1 from public.historial where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_producto' $$,
  'un cambio sólo de precio no registra cambio de producto');

-- 5 a 7: el jefe, desde la PC B, cambia nombre y desactiva
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000002', p_nombre => 'Alfajor triple', p_activo => false);
end $$;
reset role;
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_producto' $$,
  $$ values ('c0000000-0000-0000-0000-00000000001a'::uuid, 'a1000000-0000-0000-0000-000000000002'::uuid,
             '{"nombre": "Alfajor", "activo": true}'::jsonb, '{"nombre": "Alfajor triple", "activo": false}'::jsonb) $$,
  'nombre y activo quedan en una fila de cambio de producto, con valores anteriores y nuevos');
select is((select count(*)::int from public.historial where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_precio'), 1,
  'cambiar nombre y activo no registra cambio de precio');

set local role authenticated;
do $$ begin
  perform public.editar_producto(
    p_producto_id => (select p.id from public.productos p where p.codigo_barras = '7790001'),
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000002', p_nombre => 'Alfajor triple');
end $$;
reset role;
select is(
  (select count(*)::int from public.historial h join public.productos p on p.id = h.entidad_id
   where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.codigo_barras = '7790001'),
  3, 'editar sin cambios no deja historial');

-- 8 a 11: cambios desde Supabase Studio (postgres, sin usuario de la app)
select set_config('request.jwt.claims', '', true);
update public.productos set precio = 1200
where negocio_id = 'a0000000-0000-0000-0000-000000000000' and codigo_barras = '7790001';
select results_eq(
  $$ select cuenta_id, dispositivo_id, valor_anterior, valor_nuevo from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_precio' and valor_nuevo = '{"precio": 1200}'::jsonb $$,
  $$ values (null::uuid, null::uuid, '{"precio": 1000}'::jsonb, '{"precio": 1200}'::jsonb) $$,
  'un cambio de precio desde Studio queda en el historial con cuenta y PC vacías');

insert into public.productos (negocio_id, nombre, precio) values ('a0000000-0000-0000-0000-000000000000', 'Chicle', 200);
select results_eq(
  $$ select h.tipo::text, h.cuenta_id, h.valor_nuevo ->> 'creado_en_caja'
     from public.historial h join public.productos p on p.id = h.entidad_id
     where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.nombre = 'Chicle' $$,
  $$ values ('alta_producto'::text, null::uuid, 'false'::text) $$,
  'un alta desde Studio también queda, sin cuenta y sin marca de caja');

update public.productos set codigo_barras = '7790011' where negocio_id = 'a0000000-0000-0000-0000-000000000000' and nombre = 'Chicle';
select results_eq(
  $$ select h.valor_anterior, h.valor_nuevo
     from public.historial h join public.productos p on p.id = h.entidad_id
     where p.negocio_id = 'a0000000-0000-0000-0000-000000000000' and p.nombre = 'Chicle' and h.tipo = 'cambio_producto' $$,
  $$ values ('{"codigo_barras": null}'::jsonb, '{"codigo_barras": "7790011"}'::jsonb) $$,
  'un cambio de código desde Studio queda como cambio de producto');

select set_config('app.dispositivo_id', 'b1000000-0000-0000-0000-000000000001', true);
update public.productos set precio = 250 where negocio_id = 'a0000000-0000-0000-0000-000000000000' and nombre = 'Chicle';
select set_config('app.dispositivo_id', '', true);
select results_eq(
  $$ select dispositivo_id from public.historial
     where negocio_id = 'a0000000-0000-0000-0000-000000000000' and tipo = 'cambio_precio' and valor_nuevo = '{"precio": 250}'::jsonb $$,
  $$ values (null::uuid) $$,
  'una PC de otro kiosco nunca queda en el historial de A');

-- 12 y 13: aislamiento entre negocios (obligatorio)
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$ begin
  perform public.alta_producto_caja('b1000000-0000-0000-0000-000000000001', '7790001', 'Alfajor de B', 800);
end $$;
reset role;
select results_eq(
  $$ select negocio_id, cuenta_id, dispositivo_id from public.historial
     where tipo = 'alta_producto' and valor_nuevo ->> 'nombre' = 'Alfajor de B' $$,
  $$ values ('b0000000-0000-0000-0000-000000000000'::uuid, 'c0000000-0000-0000-0000-00000000000b'::uuid,
             'b1000000-0000-0000-0000-000000000001'::uuid) $$,
  'el alta de B queda en el historial de B');
select is_empty(
  $$ select 1 from public.historial h join public.productos p on p.id = h.entidad_id
     where h.entidad = 'productos' and h.negocio_id <> p.negocio_id $$,
  'ninguna fila del historial cruza negocios');

select * from finish();
rollback;
