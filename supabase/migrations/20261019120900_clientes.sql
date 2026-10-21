-- Alta rápida de cliente de fiado (decisión 16): sólo con el módulo activo; caja y jefe.
-- Datos personales de terceros (Ley 25.326): nombre o alias y teléfono opcional, nada más.
create or replace function public.alta_cliente(p_nombre text, p_telefono text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  -- Cualquier blanco (tab, salto de línea) cuenta como un espacio.
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_telefono text := nullif(btrim(regexp_replace(coalesce(p_telefono, ''), '\s+', ' ', 'g')), '');
  v_cliente public.clientes%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('fiado') then
    raise exception 'fiado_deshabilitado' using errcode = 'P0001';
  end if;
  -- Sin caracteres de control ni de dirección de texto, y sin el nombre reservado de la anonimización.
  if char_length(v_nombre) not between 1 and 60
     or v_nombre ~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2066-\u2069]'
     or lower(v_nombre) = 'cliente suprimido' then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if v_telefono is not null
     and (v_telefono !~ '^[0-9 +()-]{6,20}$' or char_length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) < 6) then
    raise exception 'telefono_invalido' using errcode = 'P0001';
  end if;

  insert into public.clientes (negocio_id, nombre, telefono)
  values (v_negocio, v_nombre, v_telefono)
  returning * into v_cliente;

  return jsonb_build_object('id', v_cliente.id, 'nombre', v_cliente.nombre, 'telefono', v_cliente.telefono);
end;
$$;

revoke all on function public.alta_cliente(text, text) from public, anon, authenticated;
grant execute on function public.alta_cliente(text, text) to authenticated;
