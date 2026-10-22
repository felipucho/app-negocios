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

  -- El turno cerrado solo, con el formato de cerrar_turno (Felipe, 2026-10-22): con el nuevo ya abierto, la
  -- pantalla sin turno no llega a mostrarlo y la caja lo avisa al abrir. Sin chequeo de rol: cerró ahora, y
  -- ultimo_turno_cerrado también se lo muestra a la caja (cierre de hoy).
  return jsonb_build_object('turno_id', v_nuevo.id, 'apertura', v_nuevo.apertura,
    'turno_cerrado', case when v_anterior.id is not null then
      jsonb_build_object('turno_id', v_anterior.id, 'apertura', v_anterior.apertura, 'cierre', v_anterior.cierre,
                         'totales', public.totales_turno(v_anterior.id))
    end);
end;
$$;

-- Total por medio de pago de un turno. Las anulaciones hechas en ese turno restan (misma regla que la
-- caja del día: la anulación resta cuando se hace, no cuando se vendió).
-- Sin chequeo de negocio: la llaman abrir_turno, cerrar_turno y ultimo_turno_cerrado con un turno ya validado; la app no.
create or replace function public.totales_turno(p_turno_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with movimientos as (
    select pv.medio, pv.importe
    from public.ventas v
    join public.pagos_venta pv on pv.venta_id = v.id
    where v.turno_id = p_turno_id
    union all
    select pv.medio, -pv.importe
    from public.anulaciones a
    join public.pagos_venta pv on pv.venta_id = a.venta_id
    where a.turno_id = p_turno_id
  )
  select jsonb_build_object(
    'efectivo', coalesce(sum(importe) filter (where medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(importe) filter (where medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(importe) filter (where medio = 'tarjeta'), 0),
    'fiado', coalesce(sum(importe) filter (where medio = 'fiado'), 0),
    'cobrado', coalesce(sum(importe) filter (where medio <> 'fiado'), 0)
  )
  from movimientos
$$;

-- Cierre simple: marca el fin y devuelve el total por medio de pago del turno. Sin arqueo.
-- anular_venta toma el mismo bloqueo de la PC: ninguna anulación entra en el turno después de
-- calcular estos totales.
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

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
  values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_turno.id,
          jsonb_build_object('automatico', false));

  return jsonb_build_object('turno_id', v_turno.id, 'apertura', v_turno.apertura, 'cierre', v_turno.cierre,
                            'totales', public.totales_turno(v_turno.id));
end;
$$;

-- Último turno cerrado de esta PC, con el mismo formato que cerrar_turno; null si no cerró ninguno.
-- La pantalla sin turno abierto lo muestra (Felipe, 2026-10-22): si se perdió la respuesta del cierre,
-- el reintento da sin_turno y los totales sólo se ven acá. Sólo lee: un turno cerrado ya no suma
-- anulaciones (anular_venta exige un turno abierto en la PC). La caja sólo ve un cierre de hoy (spec
-- sección 10, como caja_del_dia); el jefe, de cualquier día.
create or replace function public.ultimo_turno_cerrado(p_dispositivo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_turno public.turnos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  select * into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is not null
  order by t.cierre desc
  limit 1;
  if v_turno.id is null or (v_rol = 'caja' and public.dia_operativo(v_turno.cierre) <> public.hoy()) then
    return null;
  end if;

  return jsonb_build_object('turno_id', v_turno.id, 'apertura', v_turno.apertura, 'cierre', v_turno.cierre,
                            'totales', public.totales_turno(v_turno.id));
end;
$$;

revoke all on function public.totales_turno(uuid) from public, anon, authenticated;
revoke all on function public.abrir_turno(uuid), public.cerrar_turno(uuid), public.ultimo_turno_cerrado(uuid)
  from public, anon, authenticated;
grant execute on function public.abrir_turno(uuid), public.cerrar_turno(uuid), public.ultimo_turno_cerrado(uuid)
  to authenticated;
