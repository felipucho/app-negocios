-- aumentar_precios pasa a ser idempotente: la app elige un id de operación y lo reusa en cada reintento.
-- Sin esto, un corte de red después de que la base aplicó el aumento y antes de la respuesta lo duplicaba al volver a tocar Aplicar.

-- Registro de cada aumento aplicado. Append-only: lo que se aplicó no se edita ni se borra. Sólo el jefe lo ve.
create table public.aumentos_precios (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  cuenta_id uuid not null,
  dispositivo_id uuid not null references public.dispositivos (id),
  fecha timestamptz not null default now(),
  porcentaje numeric not null check (porcentaje <> 0 and porcentaje between -90 and 1000),
  redondeo integer not null check (redondeo in (1, 5, 10, 50, 100)),
  rubro text check (rubro is null or char_length(rubro) between 1 and 40),
  proveedor text check (proveedor is null or char_length(proveedor) between 1 and 60),
  cantidad integer not null check (cantidad >= 0)
);
create index aumentos_precios_negocio_fecha_idx on public.aumentos_precios (negocio_id, fecha);

alter table public.aumentos_precios enable row level security;
revoke all on table public.aumentos_precios from public, anon, authenticated;
grant select on table public.aumentos_precios to authenticated;
create policy aumentos_precios_select on public.aumentos_precios
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and (select public.rol_actual()) = 'jefe'
  );
create trigger aumentos_precios_solo_agrega before update or delete on public.aumentos_precios
  for each row execute function public.impedir_cambios();
create trigger aumentos_precios_sin_truncate before truncate on public.aumentos_precios
  for each statement execute function public.impedir_cambios();

-- La firma nueva suma p_operacion_id: la vieja se quita para que no quede una segunda sobrecarga.
drop function public.aumentar_precios(uuid, numeric, integer, text, text);

-- Aumento (o baja) por porcentaje de todos los productos, o de un rubro o proveedor (sin distinguir mayúsculas).
-- Redondea hacia arriba al múltiplo de p_redondeo. Cada cambio queda en el historial (trigger de productos).
-- p_operacion_id: si ya se aplicó, devuelve el resultado guardado y no cambia nada (ya_existia = true).
create or replace function public.aumentar_precios(
  p_dispositivo_id uuid,
  p_operacion_id uuid,
  p_porcentaje numeric,
  p_redondeo integer,
  p_rubro text default null,
  p_proveedor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_rubro text := nullif(btrim(coalesce(p_rubro, '')), '');
  v_proveedor text := nullif(btrim(coalesce(p_proveedor, '')), '');
  v_cantidad integer;
  v_previa integer;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('precios') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'precios';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  if p_operacion_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if p_porcentaje is null or p_porcentaje = 0 or p_porcentaje < -90 or p_porcentaje > 1000 then
    raise exception 'porcentaje_invalido' using errcode = 'P0001';
  end if;
  if p_redondeo is null or p_redondeo not in (1, 5, 10, 50, 100) then
    raise exception 'redondeo_invalido' using errcode = 'P0001';
  end if;
  -- Los mismos límites que la tabla aumentos_precios: un texto más largo rompería el registro después del update.
  if (v_rubro is not null and char_length(v_rubro) > 40) or (v_proveedor is not null and char_length(v_proveedor) > 60) then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;

  -- Un aumento a la vez por negocio. El reintento que espera acá ve el registro del primero ya confirmado.
  perform pg_advisory_xact_lock(hashtextextended('aumentos_precios:' || v_negocio::text, 0));
  select a.cantidad into v_previa from public.aumentos_precios a
  where a.id = p_operacion_id and a.negocio_id = v_negocio;
  if found then
    return jsonb_build_object('cantidad', v_previa, 'ya_existia', true);
  end if;

  -- Un precio que no entra en integer frena todo el aumento: nada a medias.
  if exists (
    select 1 from public.productos p
    where p.negocio_id = v_negocio
      and (v_rubro is null or exists (select 1 from public.productos_gestion g
                                      where g.producto_id = p.id and lower(g.rubro) = lower(v_rubro)))
      and (v_proveedor is null or exists (select 1 from public.productos_gestion g
                                          where g.producto_id = p.id and lower(g.proveedor) = lower(v_proveedor)))
      and ceil(p.precio * (1 + p_porcentaje / 100) / p_redondeo) * p_redondeo > 2147483647
  ) then
    raise exception 'precio_invalido' using errcode = 'P0001';
  end if;

  perform set_config('app.dispositivo_id', p_dispositivo_id::text, true);
  -- ceil sobre un positivo da al menos p_redondeo: el precio nunca llega a 0.
  update public.productos p
  set precio = (ceil(p.precio * (1 + p_porcentaje / 100) / p_redondeo) * p_redondeo)::integer
  where p.negocio_id = v_negocio
    and (v_rubro is null or exists (select 1 from public.productos_gestion g
                                    where g.producto_id = p.id and lower(g.rubro) = lower(v_rubro)))
    and (v_proveedor is null or exists (select 1 from public.productos_gestion g
                                        where g.producto_id = p.id and lower(g.proveedor) = lower(v_proveedor)))
    and (ceil(p.precio * (1 + p_porcentaje / 100) / p_redondeo) * p_redondeo)::integer <> p.precio;
  get diagnostics v_cantidad = row_count;
  perform set_config('app.dispositivo_id', '', true);

  insert into public.aumentos_precios (id, negocio_id, cuenta_id, dispositivo_id, porcentaje, redondeo, rubro, proveedor, cantidad)
  values (p_operacion_id, v_negocio, auth.uid(), p_dispositivo_id, p_porcentaje, p_redondeo, v_rubro, v_proveedor, v_cantidad);

  return jsonb_build_object('cantidad', v_cantidad, 'ya_existia', false);
end;
$$;

revoke all on function public.aumentar_precios(uuid, uuid, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.aumentar_precios(uuid, uuid, numeric, integer, text, text) to authenticated;
