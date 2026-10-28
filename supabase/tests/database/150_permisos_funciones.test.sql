begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
  array['abrir_turno', 'alta_cliente', 'alta_producto_caja', 'anonimizar_cliente', 'anular_venta', 'caja_del_dia',
        'cambiar_modulo_fiado', 'cerrar_turno', 'clientes_con_telefono', 'confirmar_venta', 'editar_producto',
        'ranking_sin_codigo', 'registrar_dispositivo', 'ultimo_turno_cerrado', 'ventas_del_dia',
        -- Módulos de 2026-10-27.
        'ajustar_stock', 'aumentar_precios', 'cobrar_fiado', 'editar_gestion_producto', 'fijar_limite_fiado',
        'fijar_monto_inicial', 'ingresar_stock', 'registrar_movimiento_caja', 'saldos_fiado'],
  'authenticated ejecuta sólo las funciones security definer de la lista');

select ok(not has_function_privilege('anon', 'public.modulo_activo(text)', 'execute'), 'anon no ejecuta modulo_activo');
select ok(not has_function_privilege('authenticated', 'public.prefijo_dispositivo(integer)', 'execute'),
  'prefijo_dispositivo es interna');
select ok(not has_function_privilege('authenticated', 'public.totales_turno(uuid)', 'execute'),
  'totales_turno es interna: no filtra por negocio, sólo la llaman abrir_turno, cerrar_turno y ultimo_turno_cerrado');

select ok(not has_function_privilege('authenticated', 'public.saldo_fiado(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.arqueo_turno(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.resumen_turno(public.turnos)', 'execute')
  and not has_function_privilege('authenticated', 'public.mover_stock_venta(uuid, integer)', 'execute'),
  'saldo_fiado, arqueo_turno, resumen_turno y mover_stock_venta son internas: no filtran por negocio');

select * from finish();
rollback;
