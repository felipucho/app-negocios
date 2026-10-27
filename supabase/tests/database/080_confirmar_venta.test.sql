begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'venta-caja@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'venta-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'B', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio, activo) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, true),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Gaseosa', 1500, true),
  ('a2000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000000', 'Discontinuado', 500, false);
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan del 5to');
insert into public.clientes (id, negocio_id, nombre, telefono, suprimido) values
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'Cliente suprimido', null, true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

-- 1 a 5: venta normal e idempotencia
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'numero',
  '1', 'la primera venta de la PC es la 1');
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'ya_existia',
  'true', 'mismo id y mismo contenido devuelve la venta grabada');
select is((select count(*)::int from public.ventas), 1, 'el reintento no grabó otra venta');
select results_eq(
  $$ select cantidad, precio_unitario from public.lineas_venta where venta_id = 'a4000000-0000-0000-0000-000000000001' $$,
  $$ values (2, 900) $$, 'la línea congela el precio');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":3,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":2700}]', 2700, null) $$,
  'P0001', 'venta_id_reusado', 'mismo id con otro contenido: error, no devuelve la venta anterior');

-- 6 y 7: pagos combinados, sin huecos
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":1,"precio_visto":1500}]',
    '[{"medio":"efectivo","importe":500},{"medio":"tarjeta","importe":1000}]', 1500, null) ->> 'numero',
  '2', 'después del reintento y del rechazo el número sigue sin huecos');
select results_eq(
  $$ select medio::text, importe from public.pagos_venta where venta_id = 'a4000000-0000-0000-0000-000000000002' order by medio $$,
  $$ values ('efectivo'::text, 500), ('tarjeta'::text, 1000) $$, 'se guardan los pagos combinados');

-- 8 a 10: precio distinto no graba y devuelve las diferencias
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":800}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) ->> 'estado',
  'precios_distintos', 'precio distinto en la base: avisa');
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":800}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) -> 'diferencias',
  '[{"producto_id":"a2000000-0000-0000-0000-000000000001","nombre":"Alfajor","precio_visto":800,"precio_actual":900}]'::jsonb,
  'devuelve producto, precio visto y precio actual');
select is((select count(*)::int from public.ventas), 2, 'precio distinto: no grabó nada');

-- 11 a 19: reglas de turno, productos e importes
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'sin_turno', 'sin turno abierto en la PC no se vende');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000003","cantidad":1,"precio_visto":500}]',
    '[{"medio":"efectivo","importe":500}]', 500, null) $$,
  'P0001', 'producto_no_disponible', 'un producto desactivado no se vende');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":800}]', 800, null) $$,
  'P0001', 'total_distinto', 'el total enviado que no coincide con el recalculado se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":800}]', 900, null) $$,
  'P0001', 'no_suma_total', 'los pagos tienen que sumar el total');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, 500) $$,
  'P0001', 'efectivo_insuficiente', 'lo entregado no alcanza para la parte en efectivo');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"tarjeta","importe":900}]', 900, 1000) $$,
  'P0001', 'entrega_sin_efectivo', 'efectivo entregado sin parte en efectivo');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900},{"medio":"tarjeta","importe":0}]', 900, null) $$,
  'P0001', 'importe_invalido', 'un importe en cero se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1.5,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1350}]', 1350, null) $$,
  'P0001', 'linea_invalida', 'una cantidad con decimales se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
    '[]', '[{"medio":"efectivo","importe":100}]', 100, null) $$,
  'P0001', 'venta_vacia', 'una venta sin líneas se rechaza');

-- 20 a 22: fiado
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":400},{"medio":"fiado","importe":500,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]',
    900, 1000) ->> 'vuelto',
  '600', 'fiado parcial con cliente; el vuelto sale sólo del efectivo');
select is((select numero from public.ventas where id = 'a4000000-0000-0000-0000-000000000005'), 3,
  'llamadas seguidas numeran 1, 2, 3 sin huecos ni repetidos');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"fiado","importe":900}]', 900, null) $$,
  'P0001', 'fiado_sin_cliente', 'el fiado exige un cliente');

-- 23 a 29: reglas extra y a qué turno y cuenta queda atada la venta
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"fiado","importe":900,"cliente_id":"a5000000-0000-0000-0000-000000000002"}]', 900, null) $$,
  'P0001', 'fiado_sin_cliente', 'no se fía a un cliente suprimido');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":400},{"medio":"efectivo","importe":500}]', 900, null) $$,
  'P0001', 'pago_invalido', 'un medio de pago repetido se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900},
      {"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, null) $$,
  'P0001', 'linea_invalida', 'un producto repetido en dos líneas se rechaza');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '{"producto_id":"a2000000-0000-0000-0000-000000000001"}', '[{"medio":"efectivo","importe":900}]', 900, null) $$,
  'P0001', 'pedido_invalido', 'las líneas tienen que ser un arreglo');
select throws_ok(format($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    %L, '[{"medio":"efectivo","importe":900}]', 900, null) $$,
    (select jsonb_agg(jsonb_build_object('producto_id', gen_random_uuid(), 'cantidad', 1, 'precio_visto', 1))
     from generate_series(1, 201))),
  'P0001', 'pedido_invalido', 'más de 200 líneas se rechaza antes de procesarlas');
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, -5) $$,
  'P0001', 'importe_invalido', 'efectivo entregado negativo se rechaza');
select results_eq(
  $$ select turno_id, cuenta_id from public.ventas where id = 'a4000000-0000-0000-0000-000000000005' $$,
  $$ select t.id, 'c0000000-0000-0000-0000-00000000000a'::uuid from public.turnos t
     where t.dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and t.cierre is null $$,
  'la venta queda en el turno abierto de esa PC y a nombre de quien llama');

-- 30: reintento después de un cambio de precio
reset role;
update public.productos set precio = 1000 where id = 'a2000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":1800}]', 1800, 2000) ->> 'ya_existia',
  'true', 'reintento después de un cambio de precio: devuelve la venta grabada, no falla por precio');

-- 30b: la entrega no es parte de la identidad (no se guarda): otra entrega, misma venta, vuelto nuevo
select is((select r ->> 'venta_id' || '|' || (r ->> 'ya_existia') || '|' || (r ->> 'vuelto') || '|' || (r ->> 'anulada')
    from public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
      '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
      '[{"medio":"efectivo","importe":1800}]', 1800, 5000) r),
  'a4000000-0000-0000-0000-000000000001|true|3200|false',
  'mismo id con otra entrega: devuelve la misma venta y el vuelto de esa entrega');

-- 30c: grabada, error de red, el jefe la anula, la caja reintenta: avisa que está anulada y no hay vuelto
reset role;
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo)
select 'a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001',
       'c0000000-0000-0000-0000-00000000000a', t.dispositivo_id, t.id, 'Se anuló antes del reintento'
from public.turnos t where t.dispositivo_id = 'a1000000-0000-0000-0000-000000000001' and t.cierre is null;
set local role authenticated;
select is((select (r ->> 'ya_existia') || '|' || (r ->> 'anulada') || '|' || (r ->> 'vuelto')
    from public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
      '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":2,"precio_visto":900}]',
      '[{"medio":"efectivo","importe":1800}]', 1800, 2000) r),
  'true|true|0',
  'reintento de una venta anulada: avisa que está anulada y sin vuelto');

-- 31: fiado apagado
reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":1000}]',
    '[{"medio":"fiado","importe":1000,"cliente_id":"a5000000-0000-0000-0000-000000000001"}]', 1000, null) $$,
  'P0001', 'fiado_deshabilitado', 'con fiado apagado la base rechaza el pago fiado');

-- 32: authenticated sin cuenta
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000002","cantidad":1,"precio_visto":1500}]',
    '[{"medio":"efectivo","importe":1500}]', 1500, null) $$,
  'P0001', 'sin_cuenta', 'un usuario autenticado sin cuenta no confirma');

-- 33 a 36: numeración y permisos
reset role;
select is((select ultimo_numero from public.dispositivos where id = 'a1000000-0000-0000-0000-000000000001'), 3,
  'los rechazos no consumen número');
select ok(not has_function_privilege('anon', 'public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer)', 'execute'),
  'anon no tiene permiso de ejecución');
select ok(has_function_privilege('authenticated', 'public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer)', 'execute'),
  'authenticated sí');
-- Sin for share, un cambio de precio puede confirmarse entre el control de precios y el insert de lineas_venta.
select ok(pg_get_functiondef('public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer)'::regprocedure)
            ~ 'from public\.productos p\s+where p\.negocio_id = v_negocio[^;]*\sfor share;',
  'confirmar_venta toma for share sobre productos: un cambio de precio espera a que termine la venta');
set local role anon;
select throws_ok($$ select public.confirmar_venta('a4000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001',
    '[]', '[]', 1, null) $$,
  '42501', null, 'anon no puede ejecutar la función de venta');

select * from finish();
rollback;
