-- Anulación de venta completa (spec sección 7). Es un movimiento nuevo: la venta no se toca ni se borra.
-- Caja: sólo ventas cuyo día operativo es hoy. Jefe: cualquier día. La base chequea rol y día.
-- Caja y jefe anulan sólo con un turno abierto en esa PC, y la anulación cuenta en ese turno (2026-10-22).
-- Una sola anulación por venta: anular dos veces devuelve la que ya existe. Queda en historial con su motivo.
-- security definer: saltea RLS, por eso todo se filtra por el negocio del token (prueba 090 y 140).
create or replace function public.anular_venta(p_venta_id uuid, p_dispositivo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_venta public.ventas%rowtype;
  v_turno uuid;
  v_anulacion public.anulaciones%rowtype;
begin
  -- 1. Cuenta del negocio del token.
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- 2. La PC desde donde se anula es del negocio. Mismo bloqueo que cerrar_turno: la anulación
  --    y el cierre del turno de esta PC no se cruzan (ver paso 6).
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- 3. La venta es del negocio. El bloqueo serializa dos anulaciones a la vez de la misma venta.
  --    Un bloqueo de fila no dispara el trigger que impide editar ventas (V24).
  select * into v_venta
  from public.ventas v
  where v.id = p_venta_id and v.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'venta_desconocida' using errcode = 'P0001';
  end if;

  -- 4. Regla de día por rol, antes de mirar si ya está anulada: la caja no consulta otros días.
  if v_rol = 'caja' and public.dia_operativo(v_venta.fecha) <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  -- 5. Idempotente: si ya está anulada, devuelve esa anulación.
  select * into v_anulacion from public.anulaciones a where a.venta_id = v_venta.id;
  if found then
    return jsonb_build_object(
      'anulacion_id', v_anulacion.id,
      'venta_id', v_anulacion.venta_id,
      'fecha', v_anulacion.fecha,
      'motivo', v_anulacion.motivo,
      'ya_existia', true
    );
  end if;

  -- 6. Turno abierto en esta PC, después del reintento: una anulación ya hecha se devuelve aunque
  --    el turno se haya cerrado. Con la PC bloqueada, el turno no se cierra hasta el commit.
  select t.id into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  -- 7. Motivo obligatorio (mismo rango que el check de anulaciones.motivo, tarea 3).
  if char_length(v_motivo) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;

  -- 8. Movimiento nuevo y su registro en el historial.
  insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo)
  values (v_negocio, v_venta.id, auth.uid(), p_dispositivo_id, v_turno, v_motivo)
  returning * into v_anulacion;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id,
                                valor_anterior, valor_nuevo, motivo)
  values (v_negocio, 'anulacion', auth.uid(), p_dispositivo_id, 'ventas', v_venta.id,
          jsonb_build_object('total', v_venta.total, 'fecha_venta', v_venta.fecha),
          jsonb_build_object('anulacion_id', v_anulacion.id),
          v_motivo);

  return jsonb_build_object(
    'anulacion_id', v_anulacion.id,
    'venta_id', v_anulacion.venta_id,
    'fecha', v_anulacion.fecha,
    'motivo', v_anulacion.motivo,
    'ya_existia', false
  );
end;
$$;

revoke all on function public.anular_venta(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_venta(uuid, uuid, text) to authenticated;
