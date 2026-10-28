-- Cuentas de operador: administran planes, módulos y kioscos. No pertenecen a un kiosco,
-- por eso no tienen fila en cuentas. Las carga Felipe con el service role, no hay alta desde la app.
create table public.operadores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  creado timestamptz not null default now()
);

alter table public.operadores enable row level security;
revoke all on public.operadores from anon, authenticated;

-- El hook lee operadores (igual que cuentas) para dejar entrar a un operador sin kiosco.
grant select on table public.operadores to supabase_auth_admin;
create policy operadores_auth_admin on public.operadores
  as permissive for select to supabase_auth_admin using (true);

-- Mismo hook que 20261019120200, con una excepción: un operador entra sin negocio_id en el token.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_negocio uuid;
begin
  select c.negocio_id into v_negocio
  from public.cuentas c
  where c.usuario_id = (event ->> 'user_id')::uuid;

  if v_negocio is null and not exists (
    select 1 from public.operadores o where o.usuario_id = (event ->> 'user_id')::uuid
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Esta cuenta no está vinculada a ningún kiosco.'
    ));
  end if;

  if v_negocio is not null then
    v_claims := jsonb_set(v_claims, '{negocio_id}', to_jsonb(v_negocio::text));
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;
