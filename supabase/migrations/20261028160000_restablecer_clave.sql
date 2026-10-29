-- Restablecer la clave de jefe o caja. La base valida el pedido y lo anota antes de que la edge function
-- toque Auth: si algo no cumple, la clave no cambia. Como en el resto del historial, no guarda la clave.

alter table public.historial_operador drop constraint historial_operador_accion_check;
alter table public.historial_operador add constraint historial_operador_accion_check check (accion in (
  'alta_kiosco', 'datos_kiosco', 'modulo', 'nota_agregada', 'nota_borrada',
  'recordatorio_agregado', 'recordatorio_hecho', 'restablecer_clave'));

-- Sólo valida y anota. El cambio de clave lo hace la edge function restablecer-clave con la clave de servicio.
create or replace function public.registrar_restablecer_clave(p_negocio uuid, p_rol text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  perform public.exigir_operador();
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if coalesce(p_rol, '') not in ('jefe', 'caja') then
    raise exception 'rol_invalido' using errcode = 'P0001';
  end if;
  select c.usuario_id into v_usuario
  from public.cuentas c
  where c.negocio_id = p_negocio and c.rol::text = p_rol;
  if not found then
    raise exception 'cuenta_desconocida' using errcode = 'P0001';
  end if;
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_nuevo)
  values (p_negocio, auth.uid(), 'restablecer_clave', btrim(p_motivo), jsonb_build_object('rol', p_rol));
  return v_usuario;
end;
$$;

-- Corta las sesiones de la cuenta: sus refresh tokens dejan de servir. El JWT ya emitido vale hasta que vence.
create or replace function public.cerrar_sesiones_cuenta(p_negocio uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  perform public.exigir_operador();
  if coalesce(p_rol, '') not in ('jefe', 'caja') then
    raise exception 'rol_invalido' using errcode = 'P0001';
  end if;
  select c.usuario_id into v_usuario
  from public.cuentas c
  where c.negocio_id = p_negocio and c.rol::text = p_rol;
  if not found then
    raise exception 'cuenta_desconocida' using errcode = 'P0001';
  end if;
  delete from auth.refresh_tokens where user_id = v_usuario::text;
  delete from auth.sessions where user_id = v_usuario;
end;
$$;

revoke all on function public.registrar_restablecer_clave(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_restablecer_clave(uuid, text, text) to authenticated;
revoke all on function public.cerrar_sesiones_cuenta(uuid, text) from public, anon, authenticated;
grant execute on function public.cerrar_sesiones_cuenta(uuid, text) to authenticated;
