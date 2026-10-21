begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Genéricas sobre TODAS las funciones security definer de public. El aislamiento de cada una lo prueba su caso en 140_aislamiento.
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""'] $$,
  'toda función security definer tiene search_path vacío (V7)');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon no ejecuta ninguna función security definer');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') $$,
  'PUBLIC no ejecuta ninguna función security definer');
select is_empty($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef group by p.proname having count(*) > 1 $$,
  'ninguna función security definer está sobrecargada (la lista de abajo va por nombre)');

-- Lista explícita: cada tarea que agrega una función security definer para la app suma su nombre acá.
select set_eq($$
  select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
  array['abrir_turno', 'alta_cliente', 'alta_producto_caja', 'anular_venta', 'caja_del_dia', 'cerrar_turno',
        'confirmar_venta', 'editar_producto', 'ranking_sin_codigo', 'registrar_dispositivo', 'ventas_del_dia'],
  'authenticated ejecuta sólo las funciones security definer de la lista');

select ok(not has_function_privilege('anon', 'public.modulo_activo(text)', 'execute'), 'anon no ejecuta modulo_activo');
select ok(not has_function_privilege('authenticated', 'public.prefijo_dispositivo(integer)', 'execute'),
  'prefijo_dispositivo es interna');

select * from finish();
rollback;
