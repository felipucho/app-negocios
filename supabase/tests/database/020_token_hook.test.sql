begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'hook-caja@prueba.local'),
  ('c0000000-0000-0000-0000-00000000001a', 'hook-jefe@prueba.local'),
  ('c0000000-0000-0000-0000-0000000000ff', 'hook-sin-cuenta@prueba.local');
insert into public.negocios (id, nombre) values ('a0000000-0000-0000-0000-000000000000', 'Kiosco A');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('c0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'caja'),
  ('c0000000-0000-0000-0000-00000000001a', 'a0000000-0000-0000-0000-000000000000', 'jefe');

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000000a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated')
  )) -> 'claims' ->> 'negocio_id',
  'a0000000-0000-0000-0000-000000000000',
  'caja: el hook pone el negocio_id de su cuenta'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000001a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000001a', 'role', 'authenticated')
  )) -> 'claims' ->> 'negocio_id',
  'a0000000-0000-0000-0000-000000000000',
  'jefe: el hook pone el negocio_id de su cuenta'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-00000000000a',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated')
  )) -> 'claims' ->> 'sub',
  'c0000000-0000-0000-0000-00000000000a',
  'el hook conserva los claims que ya venían'
);

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-0000000000ff',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated',
                                 'negocio_id', 'b0000000-0000-0000-0000-000000000000')
  )) -> 'error' ->> 'http_code',
  '403',
  'sin cuenta: el hook rechaza el login, aunque llegue un negocio_id en los claims'
);

select ok(
  not (public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'c0000000-0000-0000-0000-0000000000ff',
    'claims', jsonb_build_object('sub', 'c0000000-0000-0000-0000-0000000000ff', 'role', 'authenticated')
  )) ? 'claims'),
  'sin cuenta: el hook no devuelve claims'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'supabase_auth_admin puede ejecutar el hook'
);

select ok(
  not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'authenticated no puede ejecutar el hook'
);

select ok(
  not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'anon no puede ejecutar el hook'
);

select ok(
  has_table_privilege('supabase_auth_admin', 'public.cuentas', 'select'),
  'supabase_auth_admin puede leer cuentas (V14)'
);

select policy_roles_are(
  'public', 'cuentas', 'cuentas_auth_admin', array['supabase_auth_admin'],
  'la policy que deja leer cuentas al hook es sólo para supabase_auth_admin (V14)'
);

select * from finish();
rollback;
