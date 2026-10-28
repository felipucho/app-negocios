begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'sal-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'sal-jefe@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');
insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a');
insert into public.turnos (negocio_id, dispositivo_id, cuenta_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a');
insert into public.productos (id, negocio_id, nombre, precio) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Caramelo', 100);
insert into public.clientes (id, negocio_id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan');

-- Venta fiada a Juan de n caramelos.
create function pg_temp.fiar(p_id uuid, n integer) returns jsonb language sql as $f$
  select public.confirmar_venta(p_id, 'a1000000-0000-0000-0000-000000000001',
    jsonb_build_array(jsonb_build_object('producto_id', 'a2000000-0000-0000-0000-000000000001', 'cantidad', n, 'precio_visto', 100)),
    jsonb_build_array(jsonb_build_object('medio', 'fiado', 'importe', n * 100, 'cliente_id', 'a5000000-0000-0000-0000-000000000001')),
    n * 100, null)
$f$;
grant execute on function pg_temp.fiar(uuid, integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(pg_temp.fiar('a4000000-0000-0000-0000-000000000001', 9) ->> 'estado', 'confirmada', 'se fían 900');
select is(pg_temp.fiar('a4000000-0000-0000-0000-000000000002', 5) ->> 'estado', 'confirmada', 'se fían 500');
select results_eq($$ select nombre, saldo, limite_fiado from public.saldos_fiado() $$,
  $$ values ('Juan'::text, 1400::bigint, null::integer) $$, 'el saldo suma lo fiado');

select is(public.anular_venta('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Error')
  ->> 'ya_existia', 'false', 'se anula una venta fiada');
select results_eq($$ select saldo from public.saldos_fiado() $$, $$ values (900::bigint) $$,
  'una venta anulada no se debe');

select is(public.cobrar_fiado('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'efectivo', 300) ->> 'saldo', '600', 'el cobro baja el saldo');
select is(public.cobrar_fiado('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'efectivo', 300) ->> 'ya_existia', 'true', 'el reintento no cobra dos veces');
select throws_ok($$ select public.cobrar_fiado('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'efectivo', 200) $$,
  'P0001', 'pago_id_reusado', 'el mismo id con otro importe es un error');
select throws_ok($$ select public.cobrar_fiado(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'efectivo', 700) $$,
  'P0001', 'importe_mayor_a_saldo', 'no se cobra más que el saldo');
select throws_ok($$ select public.cobrar_fiado(gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'fiado', 100) $$,
  'P0001', 'pago_invalido', 'una deuda no se cobra con fiado');

select throws_ok($$ select public.fijar_limite_fiado('a5000000-0000-0000-0000-000000000001', 1000) $$,
  'P0001', 'solo_jefe', 'la caja no fija límites');
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select is(public.fijar_limite_fiado('a5000000-0000-0000-0000-000000000001', 1000) ->> 'limite_fiado', '1000',
  'el jefe fija el límite');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select pg_temp.fiar('a4000000-0000-0000-0000-000000000003', 5) $$,
  'P0001', 'limite_fiado', 'saldo 600 + 500 pasa el límite de 1000');
select is(pg_temp.fiar('a4000000-0000-0000-0000-000000000004', 4) ->> 'estado', 'confirmada', 'saldo 600 + 400 llega justo al límite');

-- Con el fiado apagado, la deuda vieja se sigue cobrando.
reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select is(public.cobrar_fiado('a7000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'transferencia', 100) ->> 'saldo', '900', 'con el fiado apagado se cobra igual');

-- Efectivo 300 y transferencia 100 de cobros; fiado 900 + 500 − 500 + 400.
select is(public.cerrar_turno('a1000000-0000-0000-0000-000000000001') -> 'totales',
  '{"efectivo": 300, "transferencia": 100, "tarjeta": 0, "fiado": 1300, "cobrado": 400}'::jsonb,
  'los cobros de deuda suman en el turno por su medio');

select * from finish();
rollback;
