begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- 1 a 3: estructura
select tables_are(
  'public',
  array['negocios', 'cuentas', 'config_negocio', 'modulos', 'modulos_negocio', 'dispositivos',
        'productos', 'clientes', 'turnos', 'ventas', 'lineas_venta', 'pagos_venta',
        'anulaciones', 'historial', 'version_app'],
  'el esquema public tiene exactamente las tablas del modelo'
);

select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'todas las tablas de public tienen RLS activo'
);

select results_eq(
  $$ select clave, activo_por_defecto from public.modulos $$,
  $$ values ('fiado'::text, true) $$,
  'el único módulo es fiado, activo por defecto'
);

-- 4 a 6: permisos. Los objetos zz_ simulan los que creen migraciones futuras (default privileges).
create table public.zz_futura (id integer);
create sequence public.zz_futura_seq;
create function public.zz_futura() returns integer language sql as $$ select 1 $$;

select is_empty(
  $$ select c.relname || ' ' || case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
            || ' ' || a.privilege_type
     from pg_class c
     cross join lateral aclexplode(coalesce(
       c.relacl, acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
       and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))
       and not (a.grantee = 'authenticated'::regrole and a.privilege_type = 'SELECT')
       -- Única excepción (tarea 18): la versión mínima se lee antes del login.
       and not (c.relname = 'version_app' and a.grantee = 'anon'::regrole and a.privilege_type = 'SELECT') $$,
  'anon y PUBLIC no tienen nada en public (salvo select de anon en version_app); authenticated, sólo select (sin MAINTAIN ni TRUNCATE)'
);

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- Única excepción (tarea 18): el chequeo de versión corre antes del login.
       and p.oid <> 'public.version_minima()'::regprocedure $$,
  'anon (ni PUBLIC) no ejecuta ninguna función de public (salvo version_minima)'
);

select ok(
  not has_table_privilege('authenticated', 'public.zz_futura', 'SELECT')
  and not has_sequence_privilege('authenticated', 'public.zz_futura_seq', 'USAGE')
  and not has_function_privilege('authenticated', 'public.zz_futura()', 'EXECUTE'),
  'un objeto nuevo en public no da nada a authenticated sin grant explícito'
);

-- Datos de prueba, como postgres (saltea RLS)
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'caja-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'jefe-a@prueba.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'caja-b@prueba.local');

insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');

insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe'),
  ('c0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'caja');

insert into public.config_negocio (negocio_id, nombre_visible) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');

insert into public.modulos_negocio (negocio_id, modulo, activo) values
  ('a0000000-0000-0000-0000-000000000000', 'fiado', false),
  ('b0000000-0000-0000-0000-000000000000', 'fiado', true);

insert into public.clientes (id, negocio_id, nombre, telefono) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Juan A', null),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Juana B', '11 5555-1234');

insert into public.dispositivos (id, negocio_id, prefijo, creado_por) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'A', 'c0000000-0000-0000-0000-00000000000b');

insert into public.productos (id, negocio_id, nombre, precio, codigo_barras) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Alfajor', 900, 'ABC-7790001'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'Bizcochitos', 700, null);

insert into public.turnos (id, negocio_id, dispositivo_id, cuenta_id) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b');

insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, fecha, total, hash_contenido) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 1, now(), 900, repeat('a', 64)),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 2, now() - interval '1 day', 900, repeat('b', 64)),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 1, now(), 700, repeat('c', 64));

insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 1, 900),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 1, 900),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 1, 700);

insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'efectivo', 900, null),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'fiado', 900, 'a5000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'efectivo', 700, null);

-- Anulación hecha hoy (venta de hoy) y hecha ayer (venta de ayer).
insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, fecha, motivo) values
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000001a',
   'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', now(), 'error de carga'),
  ('a0000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000001a',
   'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', now() - interval '1 day', 'error de carga'),
  ('b0000000-0000-0000-0000-000000000000', 'b4000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b',
   'b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', now(), 'error de carga');

insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo) values
  ('a0000000-0000-0000-0000-000000000000', 'cambio_precio', 'c0000000-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-000000000001', 'productos', 'a2000000-0000-0000-0000-000000000001',
   '{"precio": 800}', '{"precio": 900}'),
  ('b0000000-0000-0000-0000-000000000000', 'cambio_precio', 'c0000000-0000-0000-0000-00000000000b',
   'b1000000-0000-0000-0000-000000000001', 'productos', 'b2000000-0000-0000-0000-000000000001',
   '{"precio": 600}', '{"precio": 700}');

-- Tablas de public con alguna fila del negocio dado que quien llama puede ver
-- (negocios por id; el resto, toda tabla con columna negocio_id, también las que agreguen tareas futuras).
create function pg_temp.tablas_con_filas_de(p_negocio uuid) returns setof text language plpgsql as $f$
declare
  t record;
  hay boolean;
begin
  for t in
    select c.relname, case when c.relname = 'negocios' then 'id' else 'negocio_id' end as col
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      and (c.relname = 'negocios'
           or exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped))
  loop
    execute format('select exists (select 1 from public.%I where %I = $1)', t.relname, t.col)
      into hay using p_negocio;
    if hay then
      return next t.relname::text;
    end if;
  end loop;
end
$f$;
grant execute on function pg_temp.tablas_con_filas_de(uuid) to authenticated;

-- 7: sin filas de A y de B en cada tabla del negocio, las pruebas de aislamiento no prueban nada.
select set_eq(
  $$ select pg_temp.tablas_con_filas_de('a0000000-0000-0000-0000-000000000000')
     intersect
     select pg_temp.tablas_con_filas_de('b0000000-0000-0000-0000-000000000000') $$,
  $$ values ('negocios'), ('cuentas'), ('config_negocio'), ('modulos_negocio'), ('dispositivos'), ('productos'),
            ('clientes'), ('turnos'), ('ventas'), ('lineas_venta'), ('pagos_venta'), ('anulaciones'), ('historial') $$,
  'hay filas de A y de B en todas las tablas del negocio'
);

-- 8 a 13: reglas que valen también para postgres
select throws_ok(
  $$ insert into public.turnos (negocio_id, dispositivo_id, cuenta_id)
     values ('a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a') $$,
  '23505', null,
  'una PC no tiene dos turnos abiertos'
);

select throws_ok(
  $$ insert into public.productos (negocio_id, nombre, precio, codigo_barras, activo)
     values ('a0000000-0000-0000-0000-000000000000', 'Otro', 100, 'ABC-7790001', false) $$,
  '23505', null,
  'el código de barras es único por negocio, incluidos los inactivos'
);

select throws_ok(
  $$ insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
     values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 3, 100, repeat('d', 64)) $$,
  '23503', null,
  'una venta no apunta a una PC de otro negocio'
);

select throws_ok(
  $$ delete from public.historial $$,
  'P0001', null,
  'el historial no se borra, ni siquiera como postgres'
);

select throws_ok(
  $$ update public.ventas set total = 1 $$,
  'P0001', null,
  'las ventas no se editan, ni siquiera como postgres'
);

select set_has(
  $$ select c.relname || ':' || t.tgname
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'public'::regnamespace and not t.tgisinternal and t.tgenabled <> 'D'
       and t.tgfoid = 'public.impedir_cambios'::regproc $$,
  $$ values ('ventas:ventas_solo_agrega'), ('ventas:ventas_sin_truncate'),
            ('lineas_venta:lineas_venta_solo_agrega'), ('lineas_venta:lineas_venta_sin_truncate'),
            ('pagos_venta:pagos_venta_solo_agrega'), ('pagos_venta:pagos_venta_sin_truncate'),
            ('anulaciones:anulaciones_solo_agrega'), ('anulaciones:anulaciones_sin_truncate'),
            ('historial:historial_solo_agrega'), ('historial:historial_sin_truncate') $$,
  'las tablas de sólo agregar tienen activos sus triggers de update, delete y truncate'
);

-- 14 a 36: cuenta caja del kiosco A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre from public.productos $$,
  $$ values ('Alfajor'::text) $$,
  'caja A sólo ve sus productos'
);

select results_eq(
  $$ select nombre from public.negocios $$,
  $$ values ('Kiosco A'::text) $$,
  'caja A sólo ve su negocio'
);

select results_eq(
  $$ select clave from public.modulos $$,
  $$ values ('fiado'::text) $$,
  'authenticated ve el catálogo de módulos'
);

select results_eq(
  $$ select rol::text from public.cuentas $$,
  $$ values ('caja'::text) $$,
  'caja A sólo ve su propia cuenta'
);

select results_eq(
  $$ select numero from public.ventas $$,
  $$ values (1) $$,
  'la caja ve sólo las ventas de hoy'
);

select results_eq(
  $$ select venta_id from public.lineas_venta $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid) $$,
  'la caja ve sólo las líneas de ventas de hoy'
);

select is_empty(
  $$ select id from public.historial $$,
  'la caja no ve el historial de auditoría'
);

select results_eq(
  $$ select venta_id from public.pagos_venta $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid) $$,
  'la caja ve sólo los pagos de ventas de hoy'
);

select results_eq(
  $$ select venta_id from public.anulaciones $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid) $$,
  'la caja ve sólo las anulaciones hechas hoy'
);

select results_eq(
  $$ select nombre from public.clientes $$,
  $$ values ('Juan A'::text) $$,
  'caja A sólo ve sus clientes'
);

select results_eq(
  $$ select id from public.turnos $$,
  $$ values ('a3000000-0000-0000-0000-000000000001'::uuid) $$,
  'caja A sólo ve sus turnos'
);

select results_eq(
  $$ select id from public.dispositivos $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'caja A sólo ve sus PCs'
);

select results_eq(
  $$ select nombre_visible from public.config_negocio $$,
  $$ values ('Kiosco A'::text) $$,
  'caja A sólo ve su configuración'
);

select results_eq(
  $$ select negocio_id from public.modulos_negocio $$,
  $$ values ('a0000000-0000-0000-0000-000000000000'::uuid) $$,
  'caja A sólo ve sus módulos'
);

select throws_ok(
  $$ insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
     values (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 9, 100, repeat('e', 64)) $$,
  '42501', 'permission denied for table ventas',
  'nadie escribe directo en ventas'
);

select throws_ok(
  $$ delete from public.ventas $$,
  '42501', 'permission denied for table ventas',
  'nada de ventas se borra desde la app'
);

select throws_ok(
  $$ update public.productos set precio = 1 $$,
  '42501', 'permission denied for table productos',
  'la app no edita productos directo (sólo por funciones)'
);

select throws_ok(
  $$ insert into public.historial (negocio_id, tipo, entidad, entidad_id)
     values ('a0000000-0000-0000-0000-000000000000', 'cambio_precio', 'productos', gen_random_uuid()) $$,
  '42501', 'permission denied for table historial',
  'la app no escribe en el historial'
);

select throws_ok(
  $$ update public.negocios set estado_abono = 'activo' $$,
  '42501', 'permission denied for table negocios',
  'la app no escribe en negocios'
);

select throws_ok(
  $$ update public.cuentas set rol = 'jefe' $$,
  '42501', 'permission denied for table cuentas',
  'la caja no se convierte en jefe'
);

select throws_ok(
  $$ update public.config_negocio set nombre_visible = 'x' $$,
  '42501', 'permission denied for table config_negocio',
  'la app no escribe en config_negocio'
);

select throws_ok(
  $$ update public.modulos set activo_por_defecto = false $$,
  '42501', 'permission denied for table modulos',
  'la app no escribe en modulos'
);

select throws_ok(
  $$ insert into public.modulos_negocio (negocio_id, modulo, activo)
     values ('a0000000-0000-0000-0000-000000000000', 'fiado', false) $$,
  '42501', 'permission denied for table modulos_negocio',
  'la app no escribe directo en modulos_negocio'
);

-- 37 a 41: cuenta jefe del kiosco A
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000001a","role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select numero from public.ventas order by numero $$,
  $$ values (1), (2) $$,
  'el jefe ve el historial completo de ventas'
);

select results_eq(
  $$ select tipo::text from public.historial order by tipo $$,
  $$ values ('alta_producto'::text), ('cambio_precio'::text) $$,
  'el jefe ve el historial de auditoría de su kiosco (el alta de Bizcochitos es de B y no aparece)'
);

select results_eq(
  $$ select venta_id from public.pagos_venta order by venta_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid), ('a4000000-0000-0000-0000-000000000002'::uuid) $$,
  'el jefe ve los pagos de todas las ventas'
);

select results_eq(
  $$ select venta_id from public.anulaciones order by venta_id $$,
  $$ values ('a4000000-0000-0000-0000-000000000001'::uuid), ('a4000000-0000-0000-0000-000000000002'::uuid) $$,
  'el jefe ve todas las anulaciones'
);

select is_empty(
  $$ select pg_temp.tablas_con_filas_de('b0000000-0000-0000-0000-000000000000') $$,
  'el jefe de A no ve ninguna fila de B en ninguna tabla'
);

-- 42 y 43: cuenta caja del kiosco B
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-00000000000b","role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);

select results_eq(
  $$ select nombre from public.productos $$,
  $$ values ('Bizcochitos'::text) $$,
  'caja B no ve productos de A'
);

select is_empty(
  $$ select pg_temp.tablas_con_filas_de('a0000000-0000-0000-0000-000000000000') $$,
  'caja B no ve ninguna fila de A en ninguna tabla'
);

-- 44: anon
reset role;
set local role anon;

select throws_ok(
  $$ select * from public.productos $$,
  '42501', 'permission denied for table productos',
  'anon no lee nada'
);

select * from finish();
rollback;
