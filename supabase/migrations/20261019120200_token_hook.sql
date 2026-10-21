-- Custom Access Token Hook: pone negocio_id en el token leyendo cuentas.
-- Sin security definer (recomendación de Supabase): lee cuentas por grant + policy para supabase_auth_admin.
-- Sin cuenta, rechaza el login con 403.
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

  if v_negocio is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Esta cuenta no está vinculada a ningún kiosco.'
    ));
  end if;

  v_claims := jsonb_set(v_claims, '{negocio_id}', to_jsonb(v_negocio::text));
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.cuentas to supabase_auth_admin;
create policy cuentas_auth_admin on public.cuentas
  as permissive for select to supabase_auth_admin using (true);
