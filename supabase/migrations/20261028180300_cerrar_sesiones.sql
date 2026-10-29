-- Cerrar sesiones de jefe o caja desde el panel. La base valida el pedido y lo anota antes de que la edge
-- function cerrar-sesiones llame a cerrar_sesiones_cuenta (20261028160000): si algo no cumple, no se cierra nada.

alter table public.historial_operador drop constraint historial_operador_accion_check;
alter table public.historial_operador add constraint historial_operador_accion_check check (accion in (
  'alta_kiosco', 'datos_kiosco', 'modulo', 'nota_agregada', 'nota_borrada',
  'recordatorio_agregado', 'recordatorio_hecho', 'restablecer_clave', 'cerrar_sesiones'));

-- Sólo valida y anota. Las sesiones las cierra la edge function cerrar-sesiones.
create or replace function public.registrar_cerrar_sesiones(p_negocio uuid, p_rol text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if coalesce(p_rol, '') not in ('jefe', 'caja') then
    raise exception 'rol_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cuentas c where c.negocio_id = p_negocio and c.rol::text = p_rol) then
    raise exception 'cuenta_desconocida' using errcode = 'P0001';
  end if;
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_nuevo)
  values (p_negocio, auth.uid(), 'cerrar_sesiones', btrim(p_motivo), jsonb_build_object('rol', p_rol));
end;
$$;

revoke all on function public.registrar_cerrar_sesiones(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_cerrar_sesiones(uuid, text, text) to authenticated;
