-- Funciones del jefe (decisiones 39 y 40). La base chequea el rol: ocultar la pantalla no es seguridad.
-- Ninguna escribe en historial: el spec no lo pide (sección 4, decisión 27) y guardar el nombre
-- anterior del cliente anularía la anonimización.

create or replace function public.cambiar_modulo_fiado(p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if p_activo is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  -- Sólo la clave 'fiado', fija: el resto de modulos_negocio lo cambia Felipe desde Studio.
  insert into public.modulos_negocio (negocio_id, modulo, activo)
  values (v_negocio, 'fiado', p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;

  return jsonb_build_object('modulo', 'fiado', 'activo', p_activo);
end;
$$;

-- Ley 25.326, a pedido de la persona: nombre 'Cliente suprimido', teléfono vacío. La fila y sus ventas quedan.
create or replace function public.anonimizar_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_cliente public.clientes%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;

  update public.clientes c
  set nombre = 'Cliente suprimido', telefono = null, suprimido = true
  where c.id = p_cliente_id and c.negocio_id = v_negocio
  returning * into v_cliente;
  if not found then
    raise exception 'cliente_desconocido' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_cliente.id, 'nombre', v_cliente.nombre, 'telefono', v_cliente.telefono);
end;
$$;

revoke all on function public.cambiar_modulo_fiado(boolean) from public, anon, authenticated;
grant execute on function public.cambiar_modulo_fiado(boolean) to authenticated;
revoke all on function public.anonimizar_cliente(uuid) from public, anon, authenticated;
grant execute on function public.anonimizar_cliente(uuid) to authenticated;

-- Lista para anonimizar: el teléfono distingue dos clientes con el mismo nombre. Es la única lectura
-- del teléfono: authenticated no tiene select sobre esa columna (20261019120900_clientes.sql).
create or replace function public.clientes_con_telefono()
returns table (id uuid, nombre text, telefono text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;

  return query
  select c.id, c.nombre, c.telefono
  from public.clientes c
  where c.negocio_id = v_negocio and not c.suprimido
  order by c.nombre;
end;
$$;

revoke all on function public.clientes_con_telefono() from public, anon, authenticated;
grant execute on function public.clientes_con_telefono() to authenticated;
