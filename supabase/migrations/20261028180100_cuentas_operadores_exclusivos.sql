-- Exclusividad entre cuentas y operadores (spec de planes 2026-10-28, secciones Datos y Hook): un usuario
-- es cuenta de un kiosco u operador, nunca las dos cosas.

-- security definer: tiene que ver la otra tabla entera, aunque quien escribe no tenga grant ni policy sobre ella.
create or replace function public.impedir_cuenta_y_operador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Dos altas a la vez del mismo usuario, una en cada tabla, no se verían: la segunda espera acá y ve la primera ya confirmada.
  perform pg_advisory_xact_lock(hashtextextended('cuenta_y_operador:' || new.usuario_id::text, 0));
  if (tg_table_name = 'cuentas' and exists (select 1 from public.operadores o where o.usuario_id = new.usuario_id))
    or (tg_table_name = 'operadores' and exists (select 1 from public.cuentas c where c.usuario_id = new.usuario_id)) then
    raise exception 'cuenta_y_operador' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger cuentas_sin_operador
  before insert or update of usuario_id on public.cuentas
  for each row execute function public.impedir_cuenta_y_operador();

create trigger operadores_sin_cuenta
  before insert or update of usuario_id on public.operadores
  for each row execute function public.impedir_cuenta_y_operador();

revoke all on function public.impedir_cuenta_y_operador() from public, anon, authenticated;

-- Los triggers no revisan lo ya cargado: si un usuario ya está en las dos tablas, la migración no se confirma.
do $$
begin
  if exists (select 1 from public.cuentas c join public.operadores o on o.usuario_id = c.usuario_id) then
    raise exception 'cuenta_y_operador: hay usuarios en cuentas y en operadores';
  end if;
end;
$$;
