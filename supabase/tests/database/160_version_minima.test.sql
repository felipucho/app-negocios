begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- 1 a 6: estructura y permisos de la función
select has_table('public', 'version_app', 'existe version_app');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.version_app'::regclass),
  'version_app tiene RLS');
select is((select count(*)::int from public.version_app), 1, 'version_app trae una sola fila');
select ok(not (select p.prosecdef from pg_proc p where p.oid = 'public.version_minima()'::regprocedure),
  'version_minima es security invoker');
select ok(coalesce((select p.proconfig from pg_proc p where p.oid = 'public.version_minima()'::regprocedure), '{}'::text[])
  @> array['search_path=""'], 'version_minima tiene search_path vacío (V7)');
select ok(not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.version_minima()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC no ejecuta version_minima');

-- 7 y 8: reglas que valen también para postgres (Studio)
select throws_ok($$ insert into public.version_app (version_minima) values ('9.9.9') $$,
  '23505', null, 'version_app no admite una segunda fila');
select throws_ok($$ update public.version_app set version_minima = '1.0' $$,
  '23514', null, 'version_minima exige el formato X.Y.Z');

-- 9 a 11: estado del abono (columna de la tarea 3)
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
select lives_ok($$ update public.negocios set estado_abono = 'gracia'
                   where id = 'a0000000-0000-0000-0000-000000000000' $$,
  'estado_abono acepta gracia');
select lives_ok($$ update public.negocios set estado_abono = 'suspendido'
                   where id = 'a0000000-0000-0000-0000-000000000000' $$,
  'estado_abono acepta suspendido');
select throws_ok($$ update public.negocios set estado_abono = 'moroso'
                    where id = 'a0000000-0000-0000-0000-000000000000' $$,
  '22P02', null, 'estado_abono acepta sólo activo, gracia y suspendido');

-- 12 a 14: anon (la app antes del login)
set local role anon;
select is(public.version_minima(), '0.0.0', 'anon lee la versión mínima (el chequeo corre antes del login)');
select throws_ok($$ insert into public.version_app (version_minima) values ('9.9.9') $$,
  '42501', 'permission denied for table version_app', 'anon no escribe en version_app');
select throws_ok($$ update public.version_app set version_minima = '9.9.9' $$,
  '42501', 'permission denied for table version_app', 'anon no edita version_app');

-- 15 a 17: authenticated (caja o jefe)
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.version_minima(), '0.0.0', 'authenticated lee la versión mínima');
select throws_ok($$ update public.version_app set version_minima = '9.9.9' $$,
  '42501', 'permission denied for table version_app', 'authenticated no edita version_app');
select throws_ok($$ delete from public.version_app $$,
  '42501', 'permission denied for table version_app', 'authenticated no borra version_app');

select * from finish();
rollback;
