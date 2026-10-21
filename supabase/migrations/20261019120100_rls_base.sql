-- RLS en todas las tablas. La app (authenticated) sólo lee; escribe por funciones de la base (tareas 8 a 16).
-- anon no tiene acceso a nada. authenticated sólo tiene select.

alter table public.negocios enable row level security;
alter table public.cuentas enable row level security;
alter table public.config_negocio enable row level security;
alter table public.modulos enable row level security;
alter table public.modulos_negocio enable row level security;
alter table public.dispositivos enable row level security;
alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.turnos enable row level security;
alter table public.ventas enable row level security;
alter table public.lineas_venta enable row level security;
alter table public.pagos_venta enable row level security;
alter table public.anulaciones enable row level security;
alter table public.historial enable row level security;

-- revoke all, no una lista: así también cae MAINTAIN (PG17: LOCK, VACUUM, ANALYZE, REINDEX).
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

revoke execute on function public.negocio_actual(), public.rol_actual(),
  public.dia_operativo(timestamptz), public.hoy() from public, anon;
grant execute on function public.negocio_actual(), public.rol_actual(),
  public.dia_operativo(timestamptz), public.hoy() to authenticated;
revoke execute on function public.impedir_cambios() from public, anon, authenticated;

-- Objetos futuros (tareas 4 a 18): Supabase da por defecto todo a anon y authenticated en public,
-- incluido TRUNCATE (la RLS no lo filtra) y EXECUTE. Desde acá cada permiso es explícito
-- (grant select / grant execute en la migración de cada objeto).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
-- EXECUTE a PUBLIC es el default global de Postgres: por esquema no se puede quitar, sólo sin "in schema".
alter default privileges for role postgres revoke execute on functions from public;

-- Tablas de configuración y catálogo: todo el negocio.
create policy negocios_select on public.negocios
  for select to authenticated using (id = (select public.negocio_actual()));

create policy cuentas_select on public.cuentas
  for select to authenticated using (usuario_id = (select auth.uid()));

create policy config_negocio_select on public.config_negocio
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy modulos_select on public.modulos
  for select to authenticated using (true);

create policy modulos_negocio_select on public.modulos_negocio
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy dispositivos_select on public.dispositivos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy productos_select on public.productos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy clientes_select on public.clientes
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

create policy turnos_select on public.turnos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

-- Ventas: la caja ve las de hoy; el jefe, todas (SUPUESTO NUEVO del spec).
create policy ventas_select on public.ventas
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Líneas y pagos: visibles si su venta es visible (la RLS de ventas aplica dentro del exists).
create policy lineas_venta_select on public.lineas_venta
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and exists (select 1 from public.ventas v where v.id = lineas_venta.venta_id)
  );

create policy pagos_venta_select on public.pagos_venta
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and exists (select 1 from public.ventas v where v.id = pagos_venta.venta_id)
  );

-- Anulaciones: la caja ve las hechas hoy; el jefe, todas.
create policy anulaciones_select on public.anulaciones
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Historial de auditoría: sólo el jefe.
create policy historial_select on public.historial
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and (select public.rol_actual()) = 'jefe'
  );
