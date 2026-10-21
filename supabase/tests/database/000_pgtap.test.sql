begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

select has_schema('public', 'existe el esquema public');

select * from finish();
rollback;
