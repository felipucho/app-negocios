begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.negocios (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Kiosco A'),
  ('b0000000-0000-0000-0000-000000000000', 'Kiosco B'),
  ('d0000000-0000-0000-0000-000000000000', 'Kiosco C');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select ok(public.modulo_activo('fiado'), 'sin fila en modulos_negocio vale el defecto: fiado activo');

reset role;
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('b0000000-0000-0000-0000-000000000000', 'fiado', false);
set local role authenticated;
select ok(public.modulo_activo('fiado'), 'la fila de otro negocio no afecta');

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"b0000000-0000-0000-0000-000000000000"}', true);
select ok(not public.modulo_activo('fiado'), 'la fila del negocio manda');

reset role;
update public.modulos set activo_por_defecto = false where clave = 'fiado';
insert into public.modulos_negocio (negocio_id, modulo, activo) values ('a0000000-0000-0000-0000-000000000000', 'fiado', true);
set local role authenticated;

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"d0000000-0000-0000-0000-000000000000"}', true);
select ok(not public.modulo_activo('fiado'), 'sin fila sigue al defecto, aunque cambie');

select set_config('request.jwt.claims', '{"role":"authenticated","negocio_id":"a0000000-0000-0000-0000-000000000000"}', true);
select ok(public.modulo_activo('fiado'), 'una fila activa gana a un defecto apagado');
select ok(not public.modulo_activo('no_existe'), 'un módulo desconocido vale apagado');

reset role;
select ok(not has_function_privilege('anon', 'public.modulo_activo(text)', 'execute'), 'anon no lo ejecuta');
select ok((select not prosecdef from pg_proc where oid = 'public.modulo_activo(text)'::regprocedure),
  'security invoker: con RLS del que llama');

select * from finish();
rollback;
