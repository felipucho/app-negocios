-- El historial del operador suma las definiciones de planes (spec de planes 2026-10-28, Permisos: el operador
-- ve el historial de planes). Son de un plan, no de un kiosco (negocio_id nulo): salen en la lista general y
-- no en la de un kiosco (p_negocio con valor). Las acciones de historial_operador, como cerrar_sesiones, ya salían.
create or replace function public.listar_historial_operador(
  p_negocio uuid default null,
  p_accion text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite integer default 100
)
returns table (
  id uuid,
  fecha timestamptz,
  negocio_id uuid,
  kiosco text,
  operador text,
  accion text,
  motivo text,
  valor_anterior jsonb,
  valor_nuevo jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  return query
    select x.id, x.fecha, x.negocio_id, x.kiosco, x.operador, x.accion, x.motivo, x.valor_anterior, x.valor_nuevo
    from (
      select h.id, h.fecha, h.negocio_id, n.nombre as kiosco, u.email::text as operador, h.accion, h.motivo,
        h.valor_anterior, h.valor_nuevo
      from public.historial_operador h
      join public.negocios n on n.id = h.negocio_id
      join auth.users u on u.id = h.operador_id
      union all
      select h.id, h.fecha, h.negocio_id, n.nombre, coalesce(u.email::text, 'Cuenta del kiosco'), h.tipo::text, h.motivo,
        h.valor_anterior, h.valor_nuevo
      from public.historial h
      left join public.negocios n on n.id = h.negocio_id
      left join auth.users u on u.id = h.operador_id
      where h.tipo in ('cambio_modulo', 'cambio_plan', 'excepcion_modulo', 'cambio_limite_fiado', 'plan_definido')
    ) x
    where (p_negocio is null or x.negocio_id = p_negocio)
      and (p_accion is null or x.accion = p_accion)
      and (p_desde is null or x.fecha >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (p_hasta is null or x.fecha < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    order by x.fecha desc
    limit least(greatest(p_limite, 1), 500);
end;
$$;

revoke all on function public.listar_historial_operador(uuid, text, date, date, integer) from public, anon, authenticated;
grant execute on function public.listar_historial_operador(uuid, text, date, date, integer) to authenticated;
