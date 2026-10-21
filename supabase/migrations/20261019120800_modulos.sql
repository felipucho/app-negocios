-- Módulo activo para el negocio del token. Sin fila en modulos_negocio vale el defecto de modulos.
-- Módulo desconocido = apagado. security invoker: llamada por la app, RLS le deja ver sólo su negocio.
create or replace function public.modulo_activo(p_clave text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select mn.activo from public.modulos_negocio mn
     where mn.negocio_id = public.negocio_actual() and mn.modulo = p_clave),
    (select m.activo_por_defecto from public.modulos m where m.clave = p_clave),
    false
  )
$$;

revoke all on function public.modulo_activo(text) from public, anon, authenticated;
grant execute on function public.modulo_activo(text) to authenticated;
