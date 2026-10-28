begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'mov-caja@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select throws_ok($$ select public.registrar_movimiento_caja(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'retiro', 100) $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no hay movimientos');
select throws_ok($$ select public.cerrar_turno('a1000000-0000-0000-0000-000000000001', 1000) $$,
  'P0001', 'modulo_deshabilitado', 'con el módulo apagado no se arquea (y el turno sigue abierto)');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo)
values ('a0000000-0000-0000-0000-000000000000', 'movimientos_caja', true);
set local role authenticated;

select is(public.fijar_monto_inicial('a1000000-0000-0000-0000-000000000001', 1000) ->> 'monto_inicial', '1000',
  'se fija el monto inicial');
select is(public.fijar_monto_inicial('a1000000-0000-0000-0000-000000000001', 1000) ->> 'monto_inicial', '1000',
  'el mismo monto otra vez es un reintento');
select throws_ok($$ select public.fijar_monto_inicial('a1000000-0000-0000-0000-000000000001', 2000) $$,
  'P0001', 'monto_inicial_fijado', 'el monto inicial no se cambia');

select is(public.confirmar_venta('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
    '[{"producto_id":"a2000000-0000-0000-0000-000000000001","cantidad":1,"precio_visto":900}]',
    '[{"medio":"efectivo","importe":900}]', 900, null) ->> 'numero', '1', 'venta en efectivo de 900');

select is(public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'retiro', 300) ->> 'ya_existia', 'false', 'retiro de 300');
select is(public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'retiro', 300) ->> 'ya_existia', 'true', 'el reintento no registra dos veces');
select throws_ok($$ select public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001', 'retiro', 400) $$,
  'P0001', 'movimiento_id_reusado', 'el mismo id con otro importe es un error');
select is(public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
  'gasto', 100, ' Lavandina ') ->> 'detalle', 'Lavandina', 'gasto de 100 con detalle');
select is(public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
  'ingreso', 50) ->> 'tipo', 'ingreso', 'ingreso de 50');
select is(public.registrar_movimiento_caja('a6000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001',
  'pago_proveedor', 200, 'Distribuidora') ->> 'tipo', 'pago_proveedor', 'pago a proveedor de 200');
select throws_ok($$ select public.registrar_movimiento_caja(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'robo', 1) $$,
  'P0001', 'tipo_invalido', 'tipo desconocido');

-- Esperado: 1000 + 900 + 50 − 300 − 100 − 200 = 1350. Contado 1300: faltan 50.
select is(public.cerrar_turno('a1000000-0000-0000-0000-000000000001', 1300) -> 'arqueo',
  '{"monto_inicial": 1000, "ingresos": 50, "retiros": 300, "gastos": 100, "pagos_proveedor": 200,
    "efectivo_esperado": 1350, "efectivo_contado": 1300, "diferencia": -50}'::jsonb,
  'el arqueo compara lo esperado con lo contado');

reset role;
select is((select valor_nuevo from public.historial where tipo = 'cierre_turno' and negocio_id = 'a0000000-0000-0000-0000-000000000000'),
  '{"automatico": false, "efectivo_contado": 1300, "diferencia": -50}'::jsonb, 'el historial guarda el arqueo');
set local role authenticated;

select is(public.abrir_turno('a1000000-0000-0000-0000-000000000001') ->> 'turno_cerrado', null,
  'tras cerrar no queda turno que cerrar solo');
select is(public.cerrar_turno('a1000000-0000-0000-0000-000000000001') -> 'arqueo' -> 'diferencia', 'null'::jsonb,
  'sin contar el efectivo, la diferencia queda vacía');

select * from finish();
rollback;
