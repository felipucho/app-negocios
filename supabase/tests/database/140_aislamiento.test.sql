begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- 1 a 3: genéricas sobre TODAS las funciones security definer de public (también las de las tareas 11 a 17).
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and exists (select 1 from unnest(coalesce(p.proargnames, '{}'::text[])) a where a ilike '%negocio%') $$,
  'ninguna función security definer recibe el negocio por parámetro');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prosrc !~ '(negocio_actual|rol_actual)\(\)' $$,
  'toda función security definer toma el negocio del token (negocio_actual o rol_actual)');
-- Las dos de arriba miran el texto, no el comportamiento: cada función nueva suma su nombre acá y su caso de B contra A abajo.
select set_eq(
  $$ select p.proname::text from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef $$,
  $$ values ('abrir_turno'), ('alta_cliente'), ('alta_producto_caja'), ('anular_venta'), ('caja_del_dia'), ('cerrar_turno'),
            ('confirmar_venta'), ('editar_producto'), ('ranking_sin_codigo'), ('registrar_dispositivo'), ('ventas_del_dia') $$,
  'cada función security definer de public tiene su caso de aislamiento en este archivo');

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'ais-caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'ais-caja-b@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001b', 'ais-jefe-b@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001b', 'b0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor A', 900),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochitos B', 700);
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Cliente de A');
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);

-- 4: A vende
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) ->> 'numero', '1', 'A vende');

-- 5 a 25: opera la caja de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select is((select count(*)::int from public.ventas), 0, 'B no ve ventas de A');
select is((select count(*)::int from public.lineas_venta), 0, 'B no ve líneas de A');
select is((select count(*)::int from public.pagos_venta), 0, 'B no ve pagos de A');
select is((select count(*)::int from public.clientes), 0, 'B no ve clientes de A');
select is((select count(*)::int from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 0, 'B no ve PCs de A');
select is((select count(*)::int from public.turnos where dispositivo_id = 'a1000000-0000-0000-0000-000000000001'), 0, 'B no ve turnos de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"efectivo","importe":700}]', 700, null) $$,
  'P0001', 'dispositivo_desconocido', 'B no confirma con la PC de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'producto_no_disponible', 'B no vende productos de A');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"efectivo","importe":700}]', 700, null) $$,
  'P0001', 'venta_id_reusado', 'un id de venta de A no devuelve datos de A');
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"b2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":700}]',
    '[{"medio":"fiado","importe":700,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]', 700, null) $$,
  'P0001', 'fiado_sin_cliente', 'B no fía a un cliente de A');
select throws_ok($$ select public.registrar_dispositivo('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_ajeno', 'B no registra como propia la PC de A');
select throws_ok($$ select public.abrir_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'B no abre turno en la PC de A');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001') $$,
  'P0001', 'dispositivo_desconocido', 'B no cierra el turno de A');
select ok(public.modulo_activo('fiado'), 'el fiado apagado en A no apaga el de B');
select isnt(public.alta_cliente('Cliente de B', null) ->> 'id', null, 'B da de alta su propio cliente');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    'Intruso') $$,
  'P0001', 'venta_desconocida', 'B no anula una venta de A');
select results_eq($$ select nombre, cantidad_ventas from public.ranking_sin_codigo() $$,
  $$ values ('Bizcochitos B'::text, 0) $$, 'el ranking de B no trae productos ni ventas de A');
select is(public.caja_del_dia(public.hoy()) ->> 'cobrado', '0', 'la caja del día de B no suma la venta de A');
select is_empty($$ select numero from public.ventas_del_dia(public.hoy()) $$, 'B no ve ventas de A en ventas_del_dia');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'b1000000-0000-0000-0000-000000000001', p_precio => 1) $$,
  'P0001', 'producto_desconocido', 'B no edita productos de A');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790099', 'Intruso', 100) $$,
  'P0001', 'dispositivo_desconocido', 'B no da de alta productos con la PC de A');

-- 26 a 30: el jefe de B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select is((select count(*)::int from public.ventas), 0, 'el jefe de B, que ve todos los días, tampoco ve ventas de A');
select throws_ok($$ select public.anular_venta('a4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
    'Intruso jefe') $$,
  'P0001', 'venta_desconocida', 'el jefe de B, que anula cualquier día, no anula una venta de A');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001b","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.confirmar_venta('b4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'sin_cuenta', 'una cuenta de B con negocio_id de A en el token no opera en A');
select throws_ok($$ select public.alta_producto_caja('a1000000-0000-0000-0000-000000000001', '7790099', 'Intruso', 100) $$,
  'P0001', 'sin_cuenta', 'con negocio_id de A en el token, B no da de alta productos en A');
select throws_ok($$ select public.editar_producto(p_producto_id => 'a2000000-0000-0000-0000-000000000001',
    p_dispositivo_id => 'a1000000-0000-0000-0000-000000000001', p_precio => 1) $$,
  'P0001', 'sin_cuenta', 'con negocio_id de A en el token, B no edita productos de A');

-- 31 a 36: nada de A cambió
reset role;
select is((select ultimo_numero from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 1,
  'los intentos de B no tocaron la numeración de A');
select is((select negocio_id from public.clientes where nombre = 'Cliente de B' and negocio_id in
           ('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000')),
  'b0000000-0000-0000-0000-000000000000'::uuid, 'el cliente de B quedó en B sin pasar negocio por parámetro');
select is((select count(*)::int from public.turnos
           where dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and cierre is null), 1,
  'el turno de A sigue abierto');
select is((select count(*)::int from public.anulaciones), 0, 'la venta de A sigue sin anular');
select is((select precio from public.productos where id = 'a2000000-0000-0000-0000-000000000001'), 900,
  'el producto de A sigue con su precio');
select is((select count(*)::int from public.productos where negocio_id = 'a0000000-0000-0000-0000-000000000000'), 1,
  'B no dejó productos en A');

select * from finish();
rollback;
