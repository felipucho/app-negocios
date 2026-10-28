-- Módulo movimientos_caja: monto inicial, ingresos y salidas de efectivo del turno, y arqueo al cerrar.
-- Cambia la decisión 26 sólo con el módulo prendido (Felipe, 2026-10-27). Sin el módulo, los turnos siguen igual.

create type public.tipo_movimiento_caja as enum ('ingreso', 'retiro', 'gasto', 'pago_proveedor');

alter table public.turnos
  add column monto_inicial integer check (monto_inicial is null or monto_inicial >= 0),
  add column efectivo_contado integer check (efectivo_contado is null or efectivo_contado >= 0);

-- El id lo genera el navegador: un reintento no registra dos veces. Sólo se agrega.
create table public.movimientos_caja (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  turno_id uuid not null,
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  fecha timestamptz not null default now(),
  tipo public.tipo_movimiento_caja not null,
  importe integer not null check (importe > 0),
  detalle text check (detalle is null or char_length(detalle) between 1 and 120),
  foreign key (turno_id, negocio_id) references public.turnos (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id)
);
create index movimientos_caja_turno_idx on public.movimientos_caja (turno_id);
create index movimientos_caja_negocio_fecha_idx on public.movimientos_caja (negocio_id, fecha);

create trigger movimientos_caja_solo_agrega before update or delete on public.movimientos_caja
  for each row execute function public.impedir_cambios();
create trigger movimientos_caja_sin_truncate before truncate on public.movimientos_caja
  for each statement execute function public.impedir_cambios();

alter table public.movimientos_caja enable row level security;
revoke all on table public.movimientos_caja from public, anon, authenticated;
grant select on table public.movimientos_caja to authenticated;
-- Como ventas: la caja ve los de hoy; el jefe, todos.
create policy movimientos_caja_select on public.movimientos_caja
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Una vez por turno: cambiarlo después taparía un faltante en el arqueo.
create or replace function public.fijar_monto_inicial(p_dispositivo_id uuid, p_monto integer)
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
  if not public.modulo_activo('movimientos_caja') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'movimientos_caja';
  end if;
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto < 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;

  select * into v_turno from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;
  if v_turno.monto_inicial is not null then
    -- Mismo monto: es un reintento.
    if v_turno.monto_inicial = p_monto then
      return jsonb_build_object('turno_id', v_turno.id, 'monto_inicial', p_monto);
    end if;
    raise exception 'monto_inicial_fijado' using errcode = 'P0001';
  end if;

  update public.turnos t set monto_inicial = p_monto where t.id = v_turno.id;
  return jsonb_build_object('turno_id', v_turno.id, 'monto_inicial', p_monto);
end;
$$;

create or replace function public.registrar_movimiento_caja(
  p_movimiento_id uuid,
  p_dispositivo_id uuid,
  p_tipo text,
  p_importe integer,
  p_detalle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_detalle text := nullif(btrim(regexp_replace(coalesce(p_detalle, ''), '\s+', ' ', 'g')), '');
  v_mov public.movimientos_caja%rowtype;
  v_turno uuid;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('movimientos_caja') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'movimientos_caja';
  end if;
  -- Mismo bloqueo que cerrar_turno: el movimiento no entra en un turno ya arqueado.
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  if p_movimiento_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  select * into v_mov from public.movimientos_caja m where m.id = p_movimiento_id;
  if found then
    if v_mov.negocio_id <> v_negocio or v_mov.tipo::text is distinct from p_tipo
       or v_mov.importe is distinct from p_importe or v_mov.detalle is distinct from v_detalle then
      raise exception 'movimiento_id_reusado' using errcode = 'P0001';
    end if;
    return to_jsonb(v_mov) - 'negocio_id' || jsonb_build_object('ya_existia', true);
  end if;

  select t.id into v_turno from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;
  if coalesce(p_tipo, '') not in ('ingreso', 'retiro', 'gasto', 'pago_proveedor') then
    raise exception 'tipo_invalido' using errcode = 'P0001';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;
  if v_detalle is not null and (char_length(v_detalle) > 120
     or v_detalle ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]') then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;

  insert into public.movimientos_caja (id, negocio_id, turno_id, dispositivo_id, cuenta_id, tipo, importe, detalle)
  values (p_movimiento_id, v_negocio, v_turno, p_dispositivo_id, auth.uid(), p_tipo::public.tipo_movimiento_caja,
          p_importe, v_detalle)
  returning * into v_mov;

  return to_jsonb(v_mov) - 'negocio_id' || jsonb_build_object('ya_existia', false);
end;
$$;

-- Interna. Efectivo esperado = monto inicial + efectivo del turno (ventas, anulaciones y cobros de deuda)
-- + ingresos − retiros − gastos − pagos a proveedor. diferencia = contado − esperado (null sin contar).
create or replace function public.arqueo_turno(p_turno_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with t as (select * from public.turnos where id = p_turno_id),
  m as (
    select coalesce(sum(importe) filter (where tipo = 'ingreso'), 0) as ingresos,
           coalesce(sum(importe) filter (where tipo = 'retiro'), 0) as retiros,
           coalesce(sum(importe) filter (where tipo = 'gasto'), 0) as gastos,
           coalesce(sum(importe) filter (where tipo = 'pago_proveedor'), 0) as pagos_proveedor
    from public.movimientos_caja where turno_id = p_turno_id
  ),
  e as (
    select coalesce(t.monto_inicial, 0) + (public.totales_turno(t.id) ->> 'efectivo')::bigint
           + m.ingresos - m.retiros - m.gastos - m.pagos_proveedor as esperado
    from t, m
  )
  select jsonb_build_object(
    'monto_inicial', t.monto_inicial,
    'ingresos', m.ingresos,
    'retiros', m.retiros,
    'gastos', m.gastos,
    'pagos_proveedor', m.pagos_proveedor,
    'efectivo_esperado', e.esperado,
    'efectivo_contado', t.efectivo_contado,
    'diferencia', t.efectivo_contado - e.esperado
  )
  from t, m, e
$$;

-- Interna. El formato de cierre que devuelven abrir_turno, cerrar_turno y ultimo_turno_cerrado.
-- 'arqueo' sólo con el módulo prendido: sin él, la respuesta queda igual que antes.
create or replace function public.resumen_turno(p_turno public.turnos)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('turno_id', p_turno.id, 'apertura', p_turno.apertura, 'cierre', p_turno.cierre,
                            'totales', public.totales_turno(p_turno.id))
         || case when public.modulo_activo('movimientos_caja')
                 then jsonb_build_object('arqueo', public.arqueo_turno(p_turno.id)) else '{}'::jsonb end
$$;

-- Igual que 20261019120600_turnos.sql, con resumen_turno para el turno cerrado solo.
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
    'turno_cerrado', case when v_anterior.id is not null then public.resumen_turno(v_anterior) end);
end;
$$;

-- Cambia la firma (p_efectivo_contado): la vieja se borra, si no quedarían dos sobrecargas.
drop function public.cerrar_turno(uuid);

-- Cierre: marca el fin y devuelve el total por medio de pago. Con movimientos_caja, guarda el efectivo
-- contado (opcional) y devuelve el arqueo. anular_venta, cobrar_fiado y registrar_movimiento_caja toman
-- el mismo bloqueo de la PC: nada entra en el turno después de calcular estos totales.
create function public.cerrar_turno(p_dispositivo_id uuid, p_efectivo_contado integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_turno public.turnos%rowtype;
  v_resumen jsonb;
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
  if p_efectivo_contado is not null then
    if not public.modulo_activo('movimientos_caja') then
      raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'movimientos_caja';
    end if;
    if p_efectivo_contado < 0 then
      raise exception 'importe_invalido' using errcode = 'P0001';
    end if;
  end if;

  update public.turnos t set cierre = now(), cierre_cuenta_id = auth.uid(), efectivo_contado = p_efectivo_contado
  where t.dispositivo_id = p_dispositivo_id and t.cierre is null
  returning * into v_turno;
  if v_turno.id is null then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  v_resumen := public.resumen_turno(v_turno);
  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
  values (v_negocio, 'cierre_turno', auth.uid(), p_dispositivo_id, 'turnos', v_turno.id,
          jsonb_build_object('automatico', false)
          || case when p_efectivo_contado is not null
                  then jsonb_build_object('efectivo_contado', p_efectivo_contado,
                                          'diferencia', v_resumen -> 'arqueo' -> 'diferencia')
                  else '{}'::jsonb end);

  return v_resumen;
end;
$$;

-- Igual que 20261019120600_turnos.sql, con resumen_turno.
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

  return public.resumen_turno(v_turno);
end;
$$;

revoke all on function public.arqueo_turno(uuid), public.resumen_turno(public.turnos) from public, anon, authenticated;
revoke all on function public.fijar_monto_inicial(uuid, integer), public.cerrar_turno(uuid, integer),
  public.registrar_movimiento_caja(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.fijar_monto_inicial(uuid, integer), public.cerrar_turno(uuid, integer),
  public.registrar_movimiento_caja(uuid, uuid, text, integer, text) to authenticated;
