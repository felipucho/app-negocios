begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'cli-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'cli-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'cli-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select is(public.alta_cliente('  Juan del 5to  ', '11 5555-1234') ->> 'nombre', 'Juan del 5to',
  'la caja da de alta un cliente; el nombre se recorta');
select is(public.alta_cliente('Marta', '') ->> 'telefono', null, 'teléfono vacío queda vacío');
select throws_ok($$ select public.alta_cliente('   ', null) $$, 'P0001', 'nombre_invalido', 'el nombre es obligatorio');
select throws_ok($$ select public.alta_cliente('Pedro', 'llamame') $$, 'P0001', 'telefono_invalido',
  'el teléfono sólo lleva números y signos de teléfono');
select throws_ok($$ select public.alta_cliente(E'\t\n', null) $$, 'P0001', 'nombre_invalido',
  'un nombre hecho sólo de blancos no vale');
select throws_ok($$ select public.alta_cliente(repeat('x', 61), null) $$, 'P0001', 'nombre_invalido',
  'el nombre tiene como máximo 60 caracteres');
select throws_ok($$ select public.alta_cliente(E'Ana\u202Eesrever', null) $$, 'P0001', 'nombre_invalido',
  'el nombre no lleva caracteres que inviertan el texto');
select throws_ok($$ select public.alta_cliente('cliente SUPRIMIDO', null) $$, 'P0001', 'nombre_invalido',
  'el nombre de la anonimización está reservado');
select throws_ok($$ select public.alta_cliente('Pedro', '((((((') $$, 'P0001', 'telefono_invalido',
  'el teléfono lleva al menos 6 dígitos');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select isnt(public.alta_cliente('Rosa', null) ->> 'id', null, 'el jefe también da de alta');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-0000000000ff","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Intruso', null) $$, 'P0001', 'sin_cuenta', 'sin cuenta no da de alta');

-- Aislamiento: la caja de A con un token de B no tiene cuenta en B.
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Ajeno', null) $$, 'P0001', 'sin_cuenta',
  'la cuenta de otro negocio no da de alta en este');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select throws_ok($$ select public.alta_cliente('Luis', null) $$, 'P0001', 'fiado_deshabilitado',
  'con fiado apagado la base rechaza el alta');

reset role;
select is((select count(*)::int from public.clientes where negocio_id = 'a0000000-0000-0000-0000-000000000000'), 3,
  'quedaron tres clientes, en el negocio del token');
select is((select count(*)::int from public.clientes where negocio_id = 'b0000000-0000-0000-0000-000000000000'), 0,
  'ningún cliente en el otro negocio');

select * from finish();
rollback;
