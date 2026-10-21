-- Versión mínima de la app (spec sección 9, caso 6, y sección 10): una app con versión menor se recarga.
-- Una sola fila. La leen anon y authenticated: el chequeo corre antes del login (una app vieja sin sesión
-- también se recarga) y el dato no es sensible. Nadie la escribe desde la app: Felipe la cambia desde Studio.
-- El estado del abono ya está en negocios.estado_abono (tarea 3, enum activo/gracia/suspendido): no se toca.

create table public.version_app (
  id boolean primary key default true check (id),
  version_minima text not null check (version_minima ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$'),
  actualizado timestamptz not null default now()
);

insert into public.version_app (version_minima) values ('0.0.0');

alter table public.version_app enable row level security;

-- rls_base ya quita los privilegios por defecto; el revoke queda por si cambian. Sólo lectura, explícita.
revoke all on table public.version_app from public, anon, authenticated;
grant select on table public.version_app to anon, authenticated;

create policy version_app_select on public.version_app
  for select to anon, authenticated using (true);

-- security invoker (el valor por defecto): lee por el grant y la policy de arriba; no saltea RLS.
create or replace function public.version_minima()
returns text
language sql
stable
set search_path = ''
as $$
  select v.version_minima from public.version_app v where v.id
$$;

revoke execute on function public.version_minima() from public;
grant execute on function public.version_minima() to anon, authenticated;
