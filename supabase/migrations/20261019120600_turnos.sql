-- Turno por PC (decisión 38), sin monto inicial (decisión 26). Caja y jefe abren y cierran.
create or replace function public.abrir_turno(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_anterior public.turnos%rowtype;
  v_nuevo public.turnos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- Bloquear la PC: dos pestañas que abren a la vez no chocan con el índice de un turno abierto.
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- SUPUESTO NUEVO: el turno abierto de esta PC se cierra solo con la hora de esta apertura.
  update public.turnos t set cierre = now(), cierre_cuenta_id = auth.uid()
  where t.dispositivo_id = p_dispositivo_id and t.cierre is null
  returning * into v_anterior;
  if v_anterior.id is not null then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
    values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_anterior.id,
            jsonb_build_object('automatico', true));
  end if;

  insert into public.turnos (negocio_id, dispositivo_id, cuenta_id)
  values (v_negocio, p_dispositivo_id, auth.uid())
  returning * into v_nuevo;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id)
  values (v_negocio, 'apertura_turno', auth.uid(), p_dispositivo_id, 'turnos', v_nuevo.id);

  return jsonb_build_object('turno_id', v_nuevo.id, 'apertura', v_nuevo.apertura, 'turno_cerrado_id', v_anterior.id);
end;
$$;

-- Cierre simple: marca el fin y devuelve el total por medio de pago del turno. Sin arqueo.
-- Las anulaciones hechas desde esta PC durante el turno restan (misma regla que la caja del día:
-- la anulación resta cuando se hace, no cuando se vendió).
create or replace function public.cerrar_turno(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_turno public.turnos%rowtype;
  v_totales jsonb;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  update public.turnos t set cierre = now(), cierre_cuenta_id = auth.uid()
  where t.dispositivo_id = p_dispositivo_id and t.cierre is null
  returning * into v_turno;
  if v_turno.id is null then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  with movimientos as (
    select pv.medio, pv.importe
    from public.ventas v
    join public.pagos_venta pv on pv.venta_id = v.id
    where v.turno_id = v_turno.id
    union all
    select pv.medio, -pv.importe
    from public.anulaciones a
    join public.pagos_venta pv on pv.venta_id = a.venta_id
    where a.negocio_id = v_turno.negocio_id and a.dispositivo_id = v_turno.dispositivo_id
      and a.fecha >= v_turno.apertura and a.fecha <= v_turno.cierre
  )
  select jsonb_build_object(
    'efectivo', coalesce(sum(importe) filter (where medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(importe) filter (where medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(importe) filter (where medio = 'tarjeta'), 0),
    'fiado', coalesce(sum(importe) filter (where medio = 'fiado'), 0),
    'cobrado', coalesce(sum(importe) filter (where medio <> 'fiado'), 0)
  )
  into v_totales
  from movimientos;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
  values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_turno.id,
          jsonb_build_object('automatico', false));

  return jsonb_build_object('turno_id', v_turno.id, 'apertura', v_turno.apertura, 'cierre', v_turno.cierre,
                            'totales', v_totales);
end;
$$;

revoke all on function public.abrir_turno(uuid), public.cerrar_turno(uuid) from public, anon, authenticated;
grant execute on function public.abrir_turno(uuid), public.cerrar_turno(uuid) to authenticated;
