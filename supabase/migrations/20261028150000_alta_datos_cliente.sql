-- El alta carga también los datos del cliente: color, cliente desde, etiquetas, demo y contacto del dueño.
-- Reemplaza cerrar_alta_kiosco(uuid, text) de 20261028140000. Sigue siendo el último paso del alta:
-- todo lo que escribe va en una sola función, así que si falla no queda nada a medias.
-- Como en guardar_datos_kiosco, el contacto no va al historial (P22).

drop function if exists public.cerrar_alta_kiosco(uuid, text);

create or replace function public.cerrar_alta_kiosco(
  p_negocio uuid,
  p_nombre_visible text,
  p_color_primario text,
  p_cliente_desde date,
  p_etiquetas text[],
  p_es_demo boolean,
  p_contacto_nombre text,
  p_contacto_telefono text,
  p_contacto_direccion text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_etiquetas text[] := array(select btrim(e) from unnest(coalesce(p_etiquetas, '{}'::text[])) e);
  v_demo boolean := coalesce(p_es_demo, false);
  v_nombre_contacto text := nullif(btrim(p_contacto_nombre), '');
  v_telefono text := nullif(btrim(p_contacto_telefono), '');
  v_direccion text := nullif(btrim(p_contacto_direccion), '');
begin
  perform public.exigir_operador();
  select n.nombre into v_nombre from public.negocios n where n.id = p_negocio;
  if not found then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_nombre_visible, ''))) > 60 then
    raise exception 'nombre_visible_invalido' using errcode = 'P0001';
  end if;
  if p_color_primario is null or p_color_primario !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'color_invalido' using errcode = 'P0001';
  end if;
  if p_cliente_desde is null or p_cliente_desde > public.hoy() then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if cardinality(v_etiquetas) > 10 or exists (
    select 1 from unnest(v_etiquetas) e where e is null or char_length(e) not between 1 and 30
  ) then
    raise exception 'etiquetas_invalidas' using errcode = 'P0001';
  end if;
  if char_length(v_nombre_contacto) > 80 or char_length(v_telefono) > 40 or char_length(v_direccion) > 120 then
    raise exception 'contacto_invalido' using errcode = 'P0001';
  end if;

  -- Sin nombre visible, vale el de la cuenta recortado a 60.
  v_nombre := coalesce(nullif(btrim(p_nombre_visible), ''), left(v_nombre, 60));
  insert into public.config_negocio (negocio_id, nombre_visible, color_primario)
  values (p_negocio, v_nombre, p_color_primario);
  insert into public.ficha_kiosco (negocio_id, cliente_desde, etiquetas, es_demo,
    contacto_nombre, contacto_telefono, contacto_direccion)
  values (p_negocio, p_cliente_desde, v_etiquetas, v_demo, v_nombre_contacto, v_telefono, v_direccion);
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_nuevo)
  values (p_negocio, auth.uid(), 'alta_kiosco', 'Alta del kiosco', jsonb_build_object(
    'nombre_visible', v_nombre,
    'color_primario', p_color_primario,
    'cliente_desde', p_cliente_desde,
    'etiquetas', to_jsonb(v_etiquetas),
    'es_demo', v_demo));
end;
$$;

revoke all on function public.cerrar_alta_kiosco(uuid, text, text, date, text[], boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cerrar_alta_kiosco(uuid, text, text, date, text[], boolean, text, text, text)
  to authenticated;
