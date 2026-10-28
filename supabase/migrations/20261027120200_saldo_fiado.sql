-- Módulo fiado, segunda parte: saldo por cliente, cobro de deuda y límite (spec 2026-10-27).
-- Saldo = fiado de ventas no anuladas − cobros de deuda.

-- null = sin límite. Lo fija el jefe; la caja lo ve para avisar antes de fiar.
alter table public.clientes add column limite_fiado integer check (limite_fiado is null or limite_fiado > 0);
grant select (limite_fiado) on public.clientes to authenticated;

create index pagos_venta_cliente_idx on public.pagos_venta (cliente_id) where cliente_id is not null;

-- Cobro de deuda: entra a la caja por su medio, en el turno abierto de la PC. El id lo genera el navegador
-- (un reintento no cobra dos veces). Sólo se agrega; no se anula (v2).
create table public.pagos_fiado (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  cliente_id uuid not null,
  turno_id uuid not null,
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  fecha timestamptz not null default now(),
  medio public.medio_pago not null check (medio <> 'fiado'),
  importe integer not null check (importe > 0),
  foreign key (cliente_id, negocio_id) references public.clientes (id, negocio_id),
  foreign key (turno_id, negocio_id) references public.turnos (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id)
);
create index pagos_fiado_cliente_idx on public.pagos_fiado (cliente_id);
create index pagos_fiado_turno_idx on public.pagos_fiado (turno_id);
create index pagos_fiado_negocio_fecha_idx on public.pagos_fiado (negocio_id, fecha);

create trigger pagos_fiado_solo_agrega before update or delete on public.pagos_fiado
  for each row execute function public.impedir_cambios();
create trigger pagos_fiado_sin_truncate before truncate on public.pagos_fiado
  for each statement execute function public.impedir_cambios();

alter table public.pagos_fiado enable row level security;
revoke all on table public.pagos_fiado from public, anon, authenticated;
grant select on table public.pagos_fiado to authenticated;
-- Como ventas: la caja ve los de hoy; el jefe, todos.
create policy pagos_fiado_select on public.pagos_fiado
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and ((select public.rol_actual()) = 'jefe' or public.dia_operativo(fecha) = (select public.hoy()))
  );

-- Interna: no filtra por negocio. La llaman funciones que ya validaron el cliente.
create or replace function public.saldo_fiado(p_cliente_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(pv.importe) from public.pagos_venta pv
                   where pv.cliente_id = p_cliente_id and pv.medio = 'fiado'
                     and not exists (select 1 from public.anulaciones a where a.venta_id = pv.venta_id)), 0)
       - coalesce((select sum(pf.importe) from public.pagos_fiado pf where pf.cliente_id = p_cliente_id), 0)
$$;

-- Saldos de los clientes del negocio. Caja y jefe. Un suprimido sólo aparece si todavía debe.
-- security definer: la caja no ve por RLS los pagos de días anteriores, y el saldo los necesita.
create or replace function public.saldos_fiado()
returns table (cliente_id uuid, nombre text, saldo bigint, limite_fiado integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  return query
  select s.id, s.nombre, s.saldo, s.limite_fiado
  from (select c.id, c.nombre, c.suprimido, c.limite_fiado, public.saldo_fiado(c.id) as saldo
        from public.clientes c where c.negocio_id = v_negocio) s
  where not s.suprimido or s.saldo <> 0
  order by s.saldo desc, s.nombre;
end;
$$;

create or replace function public.cobrar_fiado(
  p_pago_id uuid,
  p_dispositivo_id uuid,
  p_cliente_id uuid,
  p_medio text,
  p_importe integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_existente public.pagos_fiado%rowtype;
  v_turno uuid;
  v_saldo bigint;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  -- Sin chequeo de módulo: cobrar deuda vieja con el fiado apagado nunca hace daño (spec 2026-10-27).
  -- Mismo bloqueo que cerrar_turno: el cobro no entra en un turno ya sumado.
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  if p_pago_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  select * into v_existente from public.pagos_fiado pf where pf.id = p_pago_id;
  if found then
    if v_existente.negocio_id <> v_negocio or v_existente.cliente_id is distinct from p_cliente_id
       or v_existente.medio::text is distinct from p_medio or v_existente.importe is distinct from p_importe then
      raise exception 'pago_id_reusado' using errcode = 'P0001';
    end if;
    return jsonb_build_object('pago_id', v_existente.id, 'fecha', v_existente.fecha,
                              'saldo', public.saldo_fiado(v_existente.cliente_id), 'ya_existia', true);
  end if;

  select t.id into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  -- for update: dos cobros (o un cobro y una venta fiada) al mismo cliente leen el saldo de a uno.
  perform 1 from public.clientes c where c.id = p_cliente_id and c.negocio_id = v_negocio for update;
  if not found then
    raise exception 'cliente_desconocido' using errcode = 'P0001';
  end if;
  if coalesce(p_medio, '') not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'pago_invalido' using errcode = 'P0001';
  end if;
  if p_importe is null or p_importe <= 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;
  v_saldo := public.saldo_fiado(p_cliente_id);
  if p_importe > v_saldo then
    raise exception 'importe_mayor_a_saldo' using errcode = 'P0001', detail = v_saldo::text;
  end if;

  insert into public.pagos_fiado (id, negocio_id, cliente_id, turno_id, dispositivo_id, cuenta_id, medio, importe)
  values (p_pago_id, v_negocio, p_cliente_id, v_turno, p_dispositivo_id, auth.uid(), p_medio::public.medio_pago, p_importe)
  returning * into v_existente;

  return jsonb_build_object('pago_id', v_existente.id, 'fecha', v_existente.fecha,
                            'saldo', v_saldo - p_importe, 'ya_existia', false);
end;
$$;

-- null = sin límite. Sólo jefe, con el módulo prendido.
create or replace function public.fijar_limite_fiado(p_cliente_id uuid, p_limite integer)
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
  if not public.modulo_activo('fiado') then
    raise exception 'fiado_deshabilitado' using errcode = 'P0001';
  end if;
  if p_limite is not null and p_limite <= 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;

  update public.clientes c set limite_fiado = p_limite
  where c.id = p_cliente_id and c.negocio_id = v_negocio and not c.suprimido
  returning * into v_cliente;
  if not found then
    raise exception 'cliente_desconocido' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_cliente.id, 'limite_fiado', v_cliente.limite_fiado);
end;
$$;

-- totales_turno y caja_del_dia suman los cobros de deuda por su medio: es plata que entró (spec 2026-10-27).
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
    union all
    select pf.medio, pf.importe
    from public.pagos_fiado pf
    where pf.turno_id = p_turno_id
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

  -- Totales netos: pagos de las ventas del día menos pagos de las ventas anuladas ese día, más cobros de deuda.
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
    union all
    select pf.medio, pf.importe
    from public.pagos_fiado pf
    where pf.negocio_id = v_negocio and pf.fecha >= v_desde and pf.fecha < v_hasta
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

  -- Anulaciones del día, aparte, para revisarlas: cantidad, total (ventas.total) y detalle, en una consulta.
  select jsonb_build_object(
    'cantidad', count(*),
    'total', coalesce(sum(v.total), 0),
    'detalle', coalesce(jsonb_agg(jsonb_build_object(
                 'venta_id', v.id,
                 'prefijo', d.prefijo,
                 'numero', v.numero,
                 'fecha_venta', v.fecha,
                 'fecha', a.fecha,
                 'total', v.total,
                 'motivo', a.motivo
               ) order by a.fecha, v.numero), '[]'::jsonb)
  )
  into v_anulaciones
  from public.anulaciones a
  join public.ventas v on v.id = a.venta_id and v.negocio_id = v_negocio
  join public.dispositivos d on d.id = v.dispositivo_id
  where a.negocio_id = v_negocio and a.fecha >= v_desde and a.fecha < v_hasta;

  return v_totales || jsonb_build_object(
    'fecha', p_fecha,
    'anulaciones', v_anulaciones
  );
end;
$$;

revoke all on function public.saldo_fiado(uuid) from public, anon, authenticated;
revoke all on function public.saldos_fiado() from public, anon, authenticated;
grant execute on function public.saldos_fiado() to authenticated;
revoke all on function public.cobrar_fiado(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cobrar_fiado(uuid, uuid, uuid, text, integer) to authenticated;
revoke all on function public.fijar_limite_fiado(uuid, integer) from public, anon, authenticated;
grant execute on function public.fijar_limite_fiado(uuid, integer) to authenticated;
