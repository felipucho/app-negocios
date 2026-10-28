begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-00000000000a', 'operador-e@prueba.local'),
  ('e0000000-0000-0000-0000-00000000000b', 'caja-e@prueba.local'),
  ('e0000000-0000-0000-0000-00000000000c', 'jefe-e@prueba.local');
insert into public.operadores (usuario_id) values ('e0000000-0000-0000-0000-00000000000a');
insert into public.negocios (id, nombre) values ('e0000000-0000-0000-0000-000000000000', 'Kiosco E');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('e0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000000', 'caja');

-- El hook (lo llama Auth, no la app): el operador entra sin negocio_id; la caja sigue con el suyo.
select ok(not ((public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'e0000000-0000-0000-0000-00000000000a', 'claims', '{}'::jsonb)) -> 'claims') ? 'negocio_id'),
  'el operador entra sin negocio_id en el token');
select ok(public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'e0000000-0000-0000-0000-00000000000c', 'claims', '{}'::jsonb)) ? 'error',
  'una cuenta sin kiosco ni operador sigue rechazada');
select is(public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'e0000000-0000-0000-0000-00000000000b', 'claims', '{}'::jsonb)) #>> '{claims,negocio_id}',
  'e0000000-0000-0000-0000-000000000000', 'la caja sigue entrando con su negocio_id');

select ok(not has_function_privilege('anon', 'public.resumen_kioscos()', 'execute'), 'anon no puede listar kioscos');
select ok(has_function_privilege('authenticated', 'public.cambiar_modulo_kiosco(uuid, text, boolean, text)', 'execute'),
  'authenticated puede llamar cambiar_modulo_kiosco: la base chequea exigir_operador()');

-- Las que llaman exigir_operador(): si aparece otra, sumarla acá y en la lista de 140 y 150.
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prosrc like '%exigir_operador()%' $$,
  array['agregar_nota', 'agregar_recordatorio', 'borrar_nota', 'cambiar_modulo_kiosco', 'cerrar_alta_kiosco',
    'completar_recordatorio', 'crear_kiosco', 'ficha_kiosco', 'guardar_datos_kiosco', 'listar_historial_operador',
    'modulos_de_kiosco', 'resumen_kioscos', 'vincular_cuenta'],
  'las funciones de operador que llaman exigir_operador() son estas trece');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select ok(public.es_operador(), 'el operador es operador');
select is(public.crear_kiosco('  Kiosco nuevo  ') is not null, true, 'el operador da de alta un kiosco');
select throws_ok($$ select public.crear_kiosco('   ') $$, 'P0001', 'nombre_invalido', 'un nombre vacío no da de alta nada');
select lives_ok($$ select public.vincular_cuenta('e0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-00000000000c', 'jefe') $$,
  'el operador vincula al jefe del kiosco');
select ok(exists (select 1 from public.resumen_kioscos()
    where negocio_id = 'e0000000-0000-0000-0000-000000000000'
      and jefe_email = 'jefe-e@prueba.local' and caja_email = 'caja-e@prueba.local'),
  'resumen_kioscos muestra los mails del jefe y de la caja');
select is((select activo from public.modulos_de_kiosco('e0000000-0000-0000-0000-000000000000') where modulo = 'stock'),
  false, 'stock viene apagado por defecto');
select lives_ok($$ select public.cambiar_modulo_kiosco('e0000000-0000-0000-0000-000000000000', 'stock', true, 'Prueba de módulo') $$,
  'el operador prende stock');
select is((select activo from public.modulos_de_kiosco('e0000000-0000-0000-0000-000000000000') where modulo = 'stock'),
  true, 'stock queda prendido para ese kiosco');
select throws_ok($$ select public.cambiar_modulo_kiosco('e0000000-0000-0000-0000-000000000000', 'nope', true, 'Prueba de módulo') $$,
  'P0001', 'modulo_desconocido', 'no se puede prender un módulo que no está en el catálogo');
select throws_ok($$ select * from public.modulos_de_kiosco('e0000000-0000-0000-0000-0000000000ff') $$,
  'P0001', 'kiosco_desconocido', 'un kiosco que no existe no tiene módulos');

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select ok(not public.es_operador(), 'la caja no es operador');
select throws_ok($$ select * from public.resumen_kioscos() $$, 'P0001', 'no_operador', 'la caja no lista kioscos');
select throws_ok($$ select public.cambiar_modulo_kiosco('e0000000-0000-0000-0000-000000000000', 'stock', false, 'Prueba de caja') $$,
  'P0001', 'no_operador', 'la caja no cambia módulos de otro kiosco');
select throws_ok($$ select public.vincular_cuenta('e0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-00000000000c', 'caja') $$,
  'P0001', 'no_operador', 'la caja no vincula cuentas');
select throws_ok($$ select public.crear_kiosco('Kiosco ajeno') $$, 'P0001', 'no_operador', 'la caja no da de alta kioscos');
select throws_ok($$ select * from public.modulos_de_kiosco('e0000000-0000-0000-0000-000000000000') $$,
  'P0001', 'no_operador', 'la caja no ve los módulos de un kiosco');

select * from finish();
rollback;
