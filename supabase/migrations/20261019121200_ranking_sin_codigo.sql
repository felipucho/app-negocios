-- Ranking de productos sin código para el panel F2 (spec sección 6).
-- Cuenta ventas no anuladas de los últimos 30 días en las que aparece cada producto (ventas, no unidades).
-- Excluye desactivados y productos con código. Los no vendidos aparecen con 0. Empates: alfabético.
-- DECISIÓN PARA OK DE FELIPE: security definer (el spec dice invoker). Con invoker, la RLS deja a la caja
-- ver sólo las ventas de hoy y el ranking de 30 días no serviría. Límites: negocio del token, nunca un
-- parámetro; sólo devuelve producto_id, nombre y la cantidad agregada; nada de ventas, montos ni clientes.
create or replace function public.ranking_sin_codigo()
returns table (producto_id uuid, nombre text, cantidad_ventas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_negocio uuid := public.negocio_actual();
begin
  if public.rol_actual() is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  return query
  with vendidas as (
    select l.producto_id as pid, count(distinct v.id) as n
    from public.ventas v
    join public.lineas_venta l on l.venta_id = v.id and l.negocio_id = v_negocio
    where v.negocio_id = v_negocio
      and v.fecha >= now() - interval '30 days'
      and not exists (select 1 from public.anulaciones a where a.venta_id = v.id)
    group by l.producto_id
  )
  select p.id, p.nombre, coalesce(x.n, 0)::integer
  from public.productos p
  left join vendidas x on x.pid = p.id
  where p.negocio_id = v_negocio and p.activo and p.codigo_barras is null
  order by coalesce(x.n, 0) desc, lower(p.nombre), p.id;
end;
$$;

revoke all on function public.ranking_sin_codigo() from public, anon, authenticated;
grant execute on function public.ranking_sin_codigo() to authenticated;
