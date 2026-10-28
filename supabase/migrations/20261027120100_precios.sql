-- Módulo precios: costo, rubro y proveedor por producto, y aumento masivo.
-- Tabla aparte de productos: la caja no la ve (RLS sólo jefe) y cambiarla no sube catalogo_version.
-- rubro y proveedor también los usa el módulo stock (faltantes por proveedor).
create table public.productos_gestion (
  producto_id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  costo integer check (costo is null or costo >= 0),
  rubro text check (rubro is null or char_length(rubro) between 1 and 40),
  proveedor text check (proveedor is null or char_length(proveedor) between 1 and 60),
  foreign key (producto_id, negocio_id) references public.productos (id, negocio_id)
);
create index productos_gestion_negocio_idx on public.productos_gestion (negocio_id);

alter table public.productos_gestion enable row level security;
revoke all on table public.productos_gestion from public, anon, authenticated;
grant select on table public.productos_gestion to authenticated;
create policy productos_gestion_select on public.productos_gestion
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and (select public.rol_actual()) = 'jefe'
  );

-- Reemplaza los tres valores (null o vacío = sin dato). Sólo jefe.
create or replace function public.editar_gestion_producto(
  p_producto_id uuid,
  p_costo numeric,
  p_rubro text,
  p_proveedor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_rubro text := nullif(btrim(regexp_replace(coalesce(p_rubro, ''), '\s+', ' ', 'g')), '');
  v_proveedor text := nullif(btrim(regexp_replace(coalesce(p_proveedor, ''), '\s+', ' ', 'g')), '');
  v_fila public.productos_gestion%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if not (public.modulo_activo('precios') or public.modulo_activo('stock')) then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'precios';
  end if;
  perform 1 from public.productos p where p.id = p_producto_id and p.negocio_id = v_negocio;
  if not found then
    raise exception 'producto_desconocido' using errcode = 'P0001';
  end if;
  if p_costo is not null and (p_costo < 0 or p_costo <> trunc(p_costo) or p_costo > 2147483647) then
    raise exception 'costo_invalido' using errcode = 'P0001';
  end if;
  if (v_rubro is not null and (char_length(v_rubro) > 40 or v_rubro ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'))
     or (v_proveedor is not null and (char_length(v_proveedor) > 60
         or v_proveedor ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]')) then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;

  insert into public.productos_gestion (producto_id, negocio_id, costo, rubro, proveedor)
  values (p_producto_id, v_negocio, p_costo::integer, v_rubro, v_proveedor)
  on conflict (producto_id) do update
    set costo = excluded.costo, rubro = excluded.rubro, proveedor = excluded.proveedor
  returning * into v_fila;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Aumento (o baja) por porcentaje de todos los productos, o de un rubro o proveedor (sin distinguir mayúsculas).
-- Redondea hacia arriba al múltiplo de p_redondeo. Cada cambio queda en el historial (trigger de productos).
create or replace function public.aumentar_precios(
  p_dispositivo_id uuid,
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
  if p_porcentaje is null or p_porcentaje = 0 or p_porcentaje < -90 or p_porcentaje > 1000 then
    raise exception 'porcentaje_invalido' using errcode = 'P0001';
  end if;
  if p_redondeo is null or p_redondeo not in (1, 5, 10, 50, 100) then
    raise exception 'redondeo_invalido' using errcode = 'P0001';
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

  return jsonb_build_object('cantidad', v_cantidad);
end;
$$;

revoke all on function public.editar_gestion_producto(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.editar_gestion_producto(uuid, numeric, text, text) to authenticated;
revoke all on function public.aumentar_precios(uuid, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.aumentar_precios(uuid, numeric, integer, text, text) to authenticated;
