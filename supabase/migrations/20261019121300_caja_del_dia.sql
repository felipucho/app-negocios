-- Caja del día (spec sección 7): total cobrado por medio, fiado aparte, anulaciones aparte.
-- La anulación resta el día en que se anula (anulaciones.fecha), aunque la venta sea de otro día.
-- Caja: sólo hoy. Jefe: cualquier día. Día operativo en America/Argentina/Buenos_Aires.
-- security definer: la caja no ve por RLS las ventas viejas que se anulan hoy (nota de la tarea 3).
create or replace function public.caja_del_dia(p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_desde timestamptz;
  v_hasta timestamptz;
  v_totales jsonb;
  v_anulaciones jsonb;
  v_detalle jsonb;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if v_rol = 'caja' and p_fecha <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  -- Medianoche local del día pedido y del siguiente (V26). Rango para usar los índices por fecha.
  v_desde := p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_hasta := (p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  -- Totales netos: pagos de las ventas del día menos pagos de las ventas anuladas ese día.
  with movimientos as (
    select pv.medio, pv.importe
    from public.ventas v
    join public.pagos_venta pv on pv.venta_id = v.id and pv.negocio_id = v_negocio
    where v.negocio_id = v_negocio and v.fecha >= v_desde and v.fecha < v_hasta
    union all
    select pv.medio, -pv.importe
    from public.anulaciones a
    join public.pagos_venta pv on pv.venta_id = a.venta_id and pv.negocio_id = v_negocio
    where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta
  )
  select jsonb_build_object(
    'efectivo', coalesce(sum(m.importe) filter (where m.medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(m.importe) filter (where m.medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(m.importe) filter (where m.medio = 'tarjeta'), 0),
    'cobrado', coalesce(sum(m.importe) filter (where m.medio <> 'fiado'), 0),
    'fiado', coalesce(sum(m.importe) filter (where m.medio = 'fiado'), 0)
  )
  into v_totales
  from movimientos m;

  -- Anulaciones del día, aparte, para revisarlas.
  select jsonb_build_object(
    'cantidad', count(distinct a.id),
    'efectivo', coalesce(sum(pv.importe) filter (where pv.medio = 'efectivo'), 0),
    'transferencia', coalesce(sum(pv.importe) filter (where pv.medio = 'transferencia'), 0),
    'tarjeta', coalesce(sum(pv.importe) filter (where pv.medio = 'tarjeta'), 0),
    'fiado', coalesce(sum(pv.importe) filter (where pv.medio = 'fiado'), 0),
    'total', coalesce(sum(pv.importe), 0)
  )
  into v_anulaciones
  from public.anulaciones a
  join public.pagos_venta pv on pv.venta_id = a.venta_id and pv.negocio_id = v_negocio
  where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta;

  select coalesce(jsonb_agg(jsonb_build_object(
           'venta_id', v.id,
           'prefijo', d.prefijo,
           'numero', v.numero,
           'fecha_venta', v.fecha,
           'fecha', a.fecha,
           'total', v.total,
           'motivo', a.motivo
         ) order by a.fecha, v.numero), '[]'::jsonb)
  into v_detalle
  from public.anulaciones a
  join public.ventas v on v.id = a.venta_id and v.negocio_id = v_negocio
  join public.dispositivos d on d.id = v.dispositivo_id
  where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta;

  return v_totales || jsonb_build_object(
    'fecha', p_fecha,
    'anulaciones', v_anulaciones || jsonb_build_object('detalle', v_detalle)
  );
end;
$$;

-- Lista de ventas del día: número, hora, total, medios y si está anulada. Sin datos de cliente.
create or replace function public.ventas_del_dia(p_fecha date)
returns table (venta_id uuid, prefijo text, numero integer, hora text, total integer, medios jsonb, anulada boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if v_rol = 'caja' and p_fecha <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  v_desde := p_fecha::timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_hasta := (p_fecha + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';

  return query
  select v.id,
         d.prefijo,
         v.numero,
         to_char(v.fecha at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
         v.total,
         (select coalesce(jsonb_agg(jsonb_build_object('medio', pv.medio, 'importe', pv.importe) order by pv.medio), '[]'::jsonb)
          from public.pagos_venta pv
          where pv.venta_id = v.id and pv.negocio_id = v_negocio),
         exists (select 1 from public.anulaciones a where a.venta_id = v.id)
  from public.ventas v
  join public.dispositivos d on d.id = v.dispositivo_id
  where v.negocio_id = v_negocio and v.fecha >= v_desde and v.fecha < v_hasta
  order by v.fecha desc, d.prefijo, v.numero desc;
end;
$$;

revoke all on function public.caja_del_dia(date), public.ventas_del_dia(date) from public, anon, authenticated;
grant execute on function public.caja_del_dia(date), public.ventas_del_dia(date) to authenticated;
