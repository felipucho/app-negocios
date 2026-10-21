begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');

create temporary view version_a as
  select catalogo_version from public.negocios where id = 'a0000000-0000-0000-0000-000000000000';

select is((select * from version_a), 0::bigint, 'un negocio nuevo arranca en 0');

insert into public.productos (id, negocio_id, nombre, precio)
values ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000000', 'Chicle', 200);
select is((select * from version_a), 1::bigint, 'un alta sube la versión');

update public.productos set precio = 250 where id = 'a2000000-0000-0000-0000-000000000001';
select is((select * from version_a), 2::bigint, 'un cambio de precio sube la versión');

update public.productos set activo = false where id = 'a2000000-0000-0000-0000-000000000001';
select is((select * from version_a), 3::bigint, 'desactivar sube la versión');

update public.negocios set nombre = 'Kiosco A nuevo' where id = 'a0000000-0000-0000-0000-000000000000';
select is((select * from version_a), 4::bigint, 'un cambio en negocios sube la versión');

update public.negocios set nombre = nombre where id = 'a0000000-0000-0000-0000-000000000000';
select is((select * from version_a), 4::bigint, 'un update sin cambios no sube la versión');

update public.negocios set catalogo_version = 0 where id = 'a0000000-0000-0000-0000-000000000000';
select is((select * from version_a), 5::bigint, 'la versión nunca baja');

insert into public.negocios (id, nombre) values ('b0000000-0000-0000-0000-000000000000', 'Kiosco B');
update public.productos set negocio_id = 'b0000000-0000-0000-0000-000000000000'
where id = 'a2000000-0000-0000-0000-000000000001';
select is((select * from version_a), 6::bigint, 'mover un producto sube la versión del negocio de origen');
select is((select catalogo_version from public.negocios where id = 'b0000000-0000-0000-0000-000000000000'),
  1::bigint, 'y la del negocio de destino');

select * from finish();
rollback;
