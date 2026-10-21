-- Alta de productos (con código o sin código) y edición de precio, nombre y activo (decisiones 21, 24, 25 y 35).
-- Caja y jefe pueden las dos. El historial lo escribe el trigger productos_historial (121600);
-- estas funciones le pasan la PC con app.dispositivo_id y la limpian al terminar.
-- p_precio es numeric para rechazar centavos con un error propio (precio_invalido).

create or replace function public.alta_producto_caja(
  p_dispositivo_id uuid,
  p_codigo_barras text,
  p_nombre text,
  p_precio numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  -- null o vacío = producto sin código (va a la grilla F2).
  v_codigo text := nullif(btrim(coalesce(p_codigo_barras, '')), '');
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_existente public.productos%rowtype;
  v_producto public.productos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  -- Mismo check que productos.codigo_barras (tarea 3): ASCII imprimible, sin espacios.
  if v_codigo is not null and v_codigo !~ '^[!-~]{1,48}$' then
    raise exception 'codigo_invalido' using errcode = 'P0001';
  end if;
  -- Sin caracteres de control ni de dirección de texto (mismo criterio que clientes).
  if char_length(v_nombre) not between 1 and 80
     or v_nombre ~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2066-\u2069]' then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio <> trunc(p_precio) or p_precio > 2147483647 then
    raise exception 'precio_invalido' using errcode = 'P0001';
  end if;

  -- Único por negocio, incluidos los inactivos, sólo cuando hay código (índice parcial productos_codigo_unico).
  -- Un inactivo se reactiva. Sin código no hay nada que chequear: dos "Pan casero" sin código conviven.
  if v_codigo is not null then
    select * into v_existente from public.productos p
    where p.negocio_id = v_negocio and p.codigo_barras = v_codigo;
  end if;
  if v_existente.id is not null then
    if v_existente.activo then
      raise exception 'codigo_existente' using errcode = 'P0001', detail = v_existente.id::text;
    end if;
    raise exception 'codigo_existente_inactivo' using errcode = 'P0001', detail = v_existente.id::text;
  end if;

  perform set_config('app.dispositivo_id', p_dispositivo_id::text, true);
  begin
    insert into public.productos (negocio_id, nombre, precio, codigo_barras, creado_en_caja)
    values (v_negocio, v_nombre, p_precio::integer, v_codigo, true)
    returning * into v_producto;
  exception when unique_violation then
    -- Dos altas del mismo código a la vez: la segunda choca con el índice.
    raise exception 'codigo_existente' using errcode = 'P0001';
  end;
  perform set_config('app.dispositivo_id', '', true);

  return to_jsonb(v_producto) - 'negocio_id' - 'creado';
end;
$$;

-- null = no cambia. El código de barras no se edita desde la app.
create or replace function public.editar_producto(
  p_producto_id uuid,
  p_dispositivo_id uuid,
  p_nombre text default null,
  p_precio numeric default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_actual public.productos%rowtype;
  v_nombre text;
  v_precio integer;
  v_activo boolean;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  select * into v_actual from public.productos p
  where p.id = p_producto_id and p.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'producto_desconocido' using errcode = 'P0001';
  end if;

  v_nombre := coalesce(btrim(p_nombre), v_actual.nombre);
  -- Nombre nuevo sin caracteres de control ni de dirección de texto (mismo criterio que clientes).
  if char_length(v_nombre) not between 1 and 80
     or (p_nombre is not null and v_nombre ~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2066-\u2069]') then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  if p_precio is not null and (p_precio <= 0 or p_precio <> trunc(p_precio) or p_precio > 2147483647) then
    raise exception 'precio_invalido' using errcode = 'P0001';
  end if;
  v_precio := coalesce(p_precio::integer, v_actual.precio);
  v_activo := coalesce(p_activo, v_actual.activo);

  -- Sin cambios no hay update: no sube catalogo_version ni deja historial.
  if (v_nombre, v_precio, v_activo) is distinct from (v_actual.nombre, v_actual.precio, v_actual.activo) then
    perform set_config('app.dispositivo_id', p_dispositivo_id::text, true);
    update public.productos p set nombre = v_nombre, precio = v_precio, activo = v_activo
    where p.id = v_actual.id
    returning * into v_actual;
    perform set_config('app.dispositivo_id', '', true);
  end if;

  return to_jsonb(v_actual) - 'negocio_id' - 'creado';
end;
$$;

revoke all on function public.alta_producto_caja(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.alta_producto_caja(uuid, text, text, numeric) to authenticated;
revoke all on function public.editar_producto(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function public.editar_producto(uuid, uuid, text, numeric, boolean) to authenticated;
