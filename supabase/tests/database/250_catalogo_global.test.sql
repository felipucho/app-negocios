begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- Parte de un catálogo vacío aunque la base ya tenga la carga real; el rollback del final lo devuelve todo.
delete from public.catalogo_importaciones;
delete from public.catalogo_global;

-- 1 a 12: RLS, privilegios y ejecución de la función (sin datos)
select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('catalogo_global', 'catalogo_importaciones', 'catalogo_global_staging')
       and not c.relrowsecurity $$,
  'RLS activa en las tres tablas del catálogo'
);
select ok(exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'catalogo_global' and policyname = 'catalogo_global_select'
      and cmd = 'SELECT' and 'authenticated'::name = any (roles)),
  'catalogo_global tiene la policy de lectura para authenticated');
select is_empty(
  $$ select tablename::text from pg_policies
     where schemaname = 'public' and tablename in ('catalogo_importaciones', 'catalogo_global_staging') $$,
  'el log y el staging no tienen policies');
select ok(has_table_privilege('authenticated', 'public.catalogo_global', 'select'),
  'authenticated lee catalogo_global');
select ok(not has_table_privilege('authenticated', 'public.catalogo_global',
  'insert, update, delete, truncate, references, trigger'),
  'authenticated no escribe catalogo_global');
select is_empty(
  $$ select t.nombre from unnest(array['catalogo_importaciones', 'catalogo_global_staging']) as t(nombre)
     where has_table_privilege('authenticated', 'public.' || t.nombre,
       'select, insert, update, delete, truncate, references, trigger') $$,
  'authenticated no tiene ningún privilegio sobre el log ni el staging'
);
select is_empty(
  $$ select t.nombre from unnest(array['catalogo_global', 'catalogo_importaciones', 'catalogo_global_staging']) as t(nombre)
     where has_table_privilege('anon', 'public.' || t.nombre,
       'select, insert, update, delete, truncate, references, trigger') $$,
  'anon no tiene ningún privilegio sobre las tablas del catálogo'
);
select is_empty(
  $$ select c.relname::text
     from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relname in ('catalogo_global', 'catalogo_importaciones', 'catalogo_global_staging')
       and exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
                   where a.grantee = 0) $$,
  'PUBLIC no tiene privilegios sobre las tablas del catálogo'
);
select ok(not has_function_privilege('anon', 'public.publicar_catalogo(uuid,integer,jsonb)', 'execute'),
  'anon no ejecuta publicar_catalogo');
select ok(not has_function_privilege('authenticated', 'public.publicar_catalogo(uuid,integer,jsonb)', 'execute'),
  'authenticated no ejecuta publicar_catalogo');
select ok(not exists (
    select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'public.publicar_catalogo(uuid,integer,jsonb)'::regprocedure
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC no ejecuta publicar_catalogo');
select ok(has_function_privilege('service_role', 'public.publicar_catalogo(uuid,integer,jsonb)', 'execute'),
  'service_role ejecuta publicar_catalogo');

-- 13 a 25: primer arranque (50000 EAN) y republicación (50001 EAN, uno nuevo; el primero ya no trae marca ni presentación)
insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000001', '2026-10-28');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, marca, cantidad, unidad, comercios, apariciones)
select 'ca000000-0000-0000-0000-000000000001'::uuid, '779' || lpad(i::text, 10, '0'), 'Producto ' || i,
       case when i = 1 then 'MARCA X' end, 500, 'ml', 1, 1
from generate_series(1, 50000) as i;
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000001', 50000,
     '{"comercios_ok": 16, "ean_distintos": 50000}'::jsonb) ->> 'estado'),
  'publicada', 'primer arranque: 50000 EAN y 16 cadenas se publican');
select is((select count(*) from public.catalogo_global), 50000::bigint, 'el catálogo queda con los 50000 EAN');
select is((select (metricas ->> 'nuevos')::integer from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000001'),
  50000, 'en el primer arranque todas las filas son nuevas');
select is((select estado from public.catalogo_importaciones where id = 'ca000000-0000-0000-0000-000000000001'),
  'publicada', 'la importación queda publicada');
select is((select count(*) from public.catalogo_global_staging
           where importacion_id = 'ca000000-0000-0000-0000-000000000001'),
  0::bigint, 'el staging se vacía al publicar');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000002', '2026-10-29');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, marca, cantidad, unidad, comercios, apariciones)
select 'ca000000-0000-0000-0000-000000000002'::uuid, '779' || lpad(i::text, 10, '0'), 'Producto ' || i,
       null, case when i = 1 then null::numeric else 500 end, case when i = 1 then null::text else 'ml' end, 1, 1
from generate_series(1, 50001) as i;
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000002', 50001,
     '{"comercios_ok": 16, "ean_distintos": 50001}'::jsonb) ->> 'estado'),
  'publicada', 'republicación: 50000 EAN conocidos y uno nuevo se publican');
select is((select (metricas ->> 'actualizados')::integer from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000002'),
  50000, 'los EAN conocidos cuentan como actualizados');
select is((select (metricas ->> 'nuevos')::integer from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000002'),
  1, 'sólo el EAN nuevo cuenta como nuevo');
select is((select count(*) from public.catalogo_global where visto = '2026-10-29'), 50001::bigint,
  'visto pasa a la fecha de la fuente nueva');
select is((select count(*) from public.catalogo_global where primera_vez = '2026-10-28'), 50000::bigint,
  'primera_vez de los EAN conocidos no cambia');
select is((select primera_vez from public.catalogo_global where ean = '7790000050001'), '2026-10-29'::date,
  'el EAN nuevo arranca con la fecha de su fuente');
select is((select marca from public.catalogo_global where ean = '7790000000001'), 'MARCA X',
  'una marca conocida no se pierde si hoy no la informa nadie');
select is((select cantidad || unidad from public.catalogo_global where ean = '7790000000001'), '500ml',
  'la presentación conocida no se pierde si hoy no la informa nadie');

create temporary table antes as
  select md5(string_agg(c::text, '|' order by c.ean)) as h from public.catalogo_global c;

-- 26 a 39: los seis rechazos por regla. Ninguno toca catalogo_global ni deja staging
insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000003', '2026-10-30');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
values ('ca000000-0000-0000-0000-000000000003', '7790000000001', 'Producto 1', 1, 1);
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000003', 2,
     '{"comercios_ok": 16, "ean_distintos": 2}'::jsonb) ->> 'motivo'),
  'staging_incompleto', 'si el staging no tiene las filas que dice el runner, se rechaza');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000003'),
  'rechazada:staging_incompleto', 'la importación queda rechazada con su motivo');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000004', '2026-10-29');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
values ('ca000000-0000-0000-0000-000000000004', '7790000000001', 'Producto 1', 1, 1);
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000004', 1,
     '{"comercios_ok": 16, "ean_distintos": 1}'::jsonb) ->> 'motivo'),
  'fecha_no_avanza', 'una fuente con la fecha de la última publicada no se publica');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000004'),
  'rechazada:fecha_no_avanza', 'la importación queda rechazada con su motivo');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-00000000000a', '2099-01-01');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
values ('ca000000-0000-0000-0000-00000000000a', '7790000000001', 'Producto 1', 1, 1);
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-00000000000a', 1,
     '{"comercios_ok": 16, "ean_distintos": 1}'::jsonb) ->> 'motivo'),
  'fecha_futura', 'una fuente con fecha en el futuro no se publica');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-00000000000a'),
  'rechazada:fecha_futura', 'la importación queda rechazada con su motivo');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000005', '2026-10-30');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
values ('ca000000-0000-0000-0000-000000000005', '7790000000001', 'Producto 1', 1, 1);
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000005', 1,
     '{"comercios_ok": 9, "ean_distintos": 1}'::jsonb) ->> 'motivo'),
  'pocos_comercios', 'con 9 cadenas el archivo viene incompleto');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000005'),
  'rechazada:pocos_comercios', 'la importación queda rechazada con su motivo');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000006', '2026-10-30');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
values ('ca000000-0000-0000-0000-000000000006', '7790000000001', 'Producto 1', 1, 1);
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000006', 1,
     '{"comercios_ok": 16, "ean_distintos": 1}'::jsonb) ->> 'motivo'),
  'caida_ean', 'un EAN bajo el 70 % de la corrida anterior no se publica');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000006'),
  'rechazada:caida_ean', 'la importación queda rechazada con su motivo');

insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000007', '2026-10-30');
insert into public.catalogo_global_staging (importacion_id, ean, nombre, comercios, apariciones)
select 'ca000000-0000-0000-0000-000000000007'::uuid, '779' || lpad(i::text, 10, '0'), 'Otro nombre ' || i, 1, 1
from generate_series(1, 50001) as i;
select is(
  (select public.publicar_catalogo('ca000000-0000-0000-0000-000000000007', 50001,
     '{"comercios_ok": 16, "ean_distintos": 50001}'::jsonb) ->> 'motivo'),
  'cambio_masivo_nombres', 'más de la mitad de los nombres cambiados de golpe no se publica');
select is((select estado || ':' || motivo from public.catalogo_importaciones
           where id = 'ca000000-0000-0000-0000-000000000007'),
  'rechazada:cambio_masivo_nombres', 'la importación queda rechazada con su motivo');
select is((select md5(string_agg(c::text, '|' order by c.ean)) from public.catalogo_global c),
  (select h from antes), 'ningún rechazo cambia catalogo_global');
select is((select count(*) from public.catalogo_global_staging), 0::bigint, 'ningún rechazo deja staging');

-- 40 a 42: importacion_invalida sale sin tocar nada
select throws_ok(
  $$ select public.publicar_catalogo('ca000000-0000-0000-0000-000000000001', 50000, '{}'::jsonb) $$,
  'P0001', 'importacion_invalida', 'una importación ya publicada no se vuelve a publicar');
select throws_ok(
  $$ select public.publicar_catalogo('ca000000-0000-0000-0000-0000000000ff', 1, '{}'::jsonb) $$,
  'P0001', 'importacion_invalida', 'una importación inexistente no se publica');
select is((select estado from public.catalogo_importaciones where id = 'ca000000-0000-0000-0000-000000000001'),
  'publicada', 'importacion_invalida no cambia el estado');

-- 43 a 47: una sola corrida por fuente y los CHECK del catálogo
insert into public.catalogo_importaciones (id, fecha_fuente)
values ('ca000000-0000-0000-0000-000000000008', '2026-10-30');
select throws_ok(
  $$ insert into public.catalogo_importaciones (id, fecha_fuente)
     values ('ca000000-0000-0000-0000-000000000009', '2026-10-30') $$,
  '23505', null, 'no puede haber dos importaciones corriendo para la misma fuente');
select throws_ok(
  $$ insert into public.catalogo_global (ean, nombre, comercios, apariciones, primera_vez, visto)
     values ('2893554588074', 'Coca Cola 2.25L', 1, 1, '2026-10-29', '2026-10-29') $$,
  '23514', null, 'un EAN restringido (empieza con 2) no entra al catálogo');
select throws_ok(
  $$ insert into public.catalogo_global (ean, nombre, comercios, apariciones, primera_vez, visto)
     values ('0000077956262', 'Sal fina', 1, 1, '2026-10-29', '2026-10-29') $$,
  '23514', null, 'un EAN-8 rellenado con ceros a 13 dígitos no entra: tiene que venir canonizado');
select throws_ok(
  $$ insert into public.catalogo_global (ean, nombre, comercios, apariciones, primera_vez, visto)
     values ('7790000099999', repeat('A', 81), 1, 1, '2026-10-29', '2026-10-29') $$,
  '23514', null, 'un nombre de 81 caracteres no entra al catálogo');
select throws_ok(
  $$ insert into public.catalogo_global (ean, nombre, cantidad, unidad, comercios, apariciones, primera_vez, visto)
     values ('7790000099998', 'Pan', 500, 'kg', 1, 1, '2026-10-29', '2026-10-29') $$,
  '23514', null, 'una unidad fuera de ml, g y un no entra al catálogo');

-- 48 a 54: lectura y escritura según el rol (la app es authenticated; anon, antes del login)
set local role authenticated;
select is((select count(*) from public.catalogo_global), 50001::bigint, 'authenticated lee el catálogo entero');
select throws_ok($$ select count(*) from public.catalogo_global_staging $$,
  '42501', 'permission denied for table catalogo_global_staging', 'authenticated no ve el staging');
select throws_ok($$ select * from public.catalogo_importaciones $$,
  '42501', 'permission denied for table catalogo_importaciones', 'authenticated no ve el log de importaciones');
select throws_ok($$ update public.catalogo_global set nombre = 'Otro' $$,
  '42501', 'permission denied for table catalogo_global', 'authenticated no edita el catálogo');
select throws_ok($$ select public.publicar_catalogo('ca000000-0000-0000-0000-000000000001'::uuid, 1, '{}'::jsonb) $$,
  '42501', 'permission denied for function publicar_catalogo', 'authenticated no publica');
reset role;
set local role anon;
select throws_ok($$ select * from public.catalogo_global $$,
  '42501', 'permission denied for table catalogo_global', 'anon no lee el catálogo');
select throws_ok($$ select public.publicar_catalogo('ca000000-0000-0000-0000-000000000001'::uuid, 1, '{}'::jsonb) $$,
  '42501', 'permission denied for function publicar_catalogo', 'anon no publica');
reset role;

select * from finish();
rollback;
