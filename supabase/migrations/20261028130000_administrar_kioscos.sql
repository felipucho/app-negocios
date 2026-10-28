-- Operador: da de alta kioscos, asigna sus cuentas y prende o apaga módulos. Cada función chequea
-- es_operador() en la base, no sólo la pantalla. Los usuarios de Auth los crea la función alta-kiosco.

create or replace function public.es_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.operadores o where o.usuario_id = auth.uid())
$$;

create or replace function public.crear_kiosco(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  if p_nombre is null or char_length(btrim(p_nombre)) not between 1 and 80 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  insert into public.negocios (nombre) values (btrim(p_nombre)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vincular_cuenta(p_negocio uuid, p_usuario uuid, p_rol public.rol_cuenta)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  insert into public.cuentas (usuario_id, negocio_id, rol) values (p_usuario, p_negocio, p_rol);
end;
$$;

create or replace function public.listar_kioscos()
returns table (negocio_id uuid, nombre text, estado_abono public.estado_abono, creado timestamptz, jefe_email text, caja_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  return query
    select n.id, n.nombre, n.estado_abono, n.creado,
      (select u.email::text from public.cuentas c join auth.users u on u.id = c.usuario_id
        where c.negocio_id = n.id and c.rol = 'jefe'),
      (select u.email::text from public.cuentas c join auth.users u on u.id = c.usuario_id
        where c.negocio_id = n.id and c.rol = 'caja')
    from public.negocios n
    order by n.creado desc;
end;
$$;

-- Lo que vale para cada kiosco: su fila en modulos_negocio, o si no el valor por defecto del catálogo.
create or replace function public.modulos_de_kiosco(p_negocio uuid)
returns table (modulo text, descripcion text, activo boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  return query
    select m.clave, m.descripcion, coalesce(mn.activo, m.activo_por_defecto)
    from public.modulos m
    left join public.modulos_negocio mn on mn.modulo = m.clave and mn.negocio_id = p_negocio
    order by m.clave;
end;
$$;

create or replace function public.cambiar_modulo_kiosco(p_negocio uuid, p_modulo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  if p_activo is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo) then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;
  insert into public.modulos_negocio (negocio_id, modulo, activo) values (p_negocio, p_modulo, p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;
end;
$$;

revoke all on function public.es_operador() from public, anon, authenticated;
grant execute on function public.es_operador() to authenticated;
revoke all on function public.crear_kiosco(text) from public, anon, authenticated;
grant execute on function public.crear_kiosco(text) to authenticated;
revoke all on function public.vincular_cuenta(uuid, uuid, public.rol_cuenta) from public, anon, authenticated;
grant execute on function public.vincular_cuenta(uuid, uuid, public.rol_cuenta) to authenticated;
revoke all on function public.listar_kioscos() from public, anon, authenticated;
grant execute on function public.listar_kioscos() to authenticated;
revoke all on function public.modulos_de_kiosco(uuid) from public, anon, authenticated;
grant execute on function public.modulos_de_kiosco(uuid) to authenticated;
revoke all on function public.cambiar_modulo_kiosco(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cambiar_modulo_kiosco(uuid, text, boolean) to authenticated;
