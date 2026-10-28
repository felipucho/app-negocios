-- Módulo stock: cantidad y mínimo por producto, ingreso de mercadería, ajuste y faltantes.
-- Avisa y nunca bloquea la venta (Felipe, 2026-10-27): la cantidad puede quedar negativa.
-- Tabla aparte de productos: descontar en cada venta no sube catalogo_version ni invalida la caché de las PCs.
-- Un producto sin fila acá no lleva stock.
create table public.stock_productos (
  producto_id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  cantidad integer not null default 0,
  minimo integer not null default 0 check (minimo >= 0),
  foreign key (producto_id, negocio_id) references public.productos (id, negocio_id)
);
create index stock_productos_negocio_idx on public.stock_productos (negocio_id);

alter table public.stock_productos enable row level security;
revoke all on table public.stock_productos from public, anon, authenticated;
grant select on table public.stock_productos to authenticated;
create policy stock_productos_select on public.stock_productos
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

-- Ingresos y ajustes a mano. Las ventas no se registran acá: salen de lineas_venta. Sólo se agrega.
-- lote_id lo genera el navegador: un reintento del mismo ingreso no suma dos veces.
create type public.tipo_movimiento_stock as enum ('ingreso', 'ajuste');

create table public.movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  lote_id uuid not null,
  producto_id uuid not null,
  tipo public.tipo_movimiento_stock not null,
  cantidad integer not null check (cantidad <> 0),
  fecha timestamptz not null default now(),
  cuenta_id uuid not null,
  dispositivo_id uuid not null,
  motivo text check (motivo is null or char_length(motivo) between 3 and 200),
  check (tipo <> 'ajuste' or motivo is not null),
  foreign key (producto_id, negocio_id) references public.productos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id)
);
create index movimientos_stock_lote_idx on public.movimientos_stock (lote_id);
create index movimientos_stock_negocio_fecha_idx on public.movimientos_stock (negocio_id, fecha);

create trigger movimientos_stock_solo_agrega before update or delete on public.movimientos_stock
  for each row execute function public.impedir_cambios();
create trigger movimientos_stock_sin_truncate before truncate on public.movimientos_stock
  for each statement execute function public.impedir_cambios();

alter table public.movimientos_stock enable row level security;
revoke all on table public.movimientos_stock from public, anon, authenticated;
grant select on table public.movimientos_stock to authenticated;
create policy movimientos_stock_select on public.movimientos_stock
  for select to authenticated using (
    negocio_id = (select public.negocio_actual())
    and (select public.rol_actual()) = 'jefe'
  );

-- Ingreso de mercadería: suma a cada producto. Caja y jefe. p_items: [{"producto_id": ..., "cantidad": N}].
create or replace function public.ingresar_stock(p_lote_id uuid, p_dispositivo_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_lote_negocio uuid;
  v_cantidad integer;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('stock') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'stock';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  if p_lote_id is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 200 then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  -- Dos reintentos a la vez del mismo lote: el segundo espera y ve el primero.
  perform pg_advisory_xact_lock(hashtextextended(p_lote_id::text, 0));
  select m.negocio_id into v_lote_negocio from public.movimientos_stock m where m.lote_id = p_lote_id limit 1;
  if found then
    if v_lote_negocio <> v_negocio then
      raise exception 'lote_id_reusado' using errcode = 'P0001';
    end if;
    return jsonb_build_object('lote_id', p_lote_id, 'ya_existia', true);
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where jsonb_typeof(e -> 'cantidad') is distinct from 'number'
       or e ->> 'cantidad' !~ '^[1-9][0-9]{0,4}$'
  ) or (select count(*) from jsonb_array_elements(p_items))
       <> (select count(distinct e ->> 'producto_id') from jsonb_array_elements(p_items) e) then
    raise exception 'linea_invalida' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where not exists (select 1 from public.productos p
                      where p.negocio_id = v_negocio and p.id::text = e ->> 'producto_id')
  ) then
    raise exception 'producto_desconocido' using errcode = 'P0001';
  end if;

  insert into public.stock_productos (producto_id, negocio_id, cantidad)
  select (e ->> 'producto_id')::uuid, v_negocio, (e ->> 'cantidad')::integer
  from jsonb_array_elements(p_items) e
  on conflict (producto_id) do update set cantidad = public.stock_productos.cantidad + excluded.cantidad;

  insert into public.movimientos_stock (negocio_id, lote_id, producto_id, tipo, cantidad, cuenta_id, dispositivo_id)
  select v_negocio, p_lote_id, (e ->> 'producto_id')::uuid, 'ingreso', (e ->> 'cantidad')::integer,
         auth.uid(), p_dispositivo_id
  from jsonb_array_elements(p_items) e;
  get diagnostics v_cantidad = row_count;

  return jsonb_build_object('lote_id', p_lote_id, 'productos', v_cantidad, 'ya_existia', false);
end;
$$;

-- Ajuste de inventario y mínimo. Sólo jefe. null = no cambia. Cambiar la cantidad pide motivo.
create or replace function public.ajustar_stock(
  p_dispositivo_id uuid,
  p_producto_id uuid,
  p_cantidad integer default null,
  p_minimo integer default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_anterior integer;
  v_fila public.stock_productos%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('stock') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'stock';
  end if;
  perform 1 from public.dispositivos d where d.id = p_dispositivo_id and d.negocio_id = v_negocio;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;
  perform 1 from public.productos p where p.id = p_producto_id and p.negocio_id = v_negocio;
  if not found then
    raise exception 'producto_desconocido' using errcode = 'P0001';
  end if;
  if p_minimo is not null and p_minimo < 0 then
    raise exception 'cantidad_invalida' using errcode = 'P0001';
  end if;
  if p_cantidad is not null and (v_motivo is null or char_length(v_motivo) not between 3 and 200) then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;

  insert into public.stock_productos (producto_id, negocio_id) values (p_producto_id, v_negocio)
  on conflict (producto_id) do nothing;
  select s.cantidad into v_anterior from public.stock_productos s where s.producto_id = p_producto_id for update;

  update public.stock_productos s
  set cantidad = coalesce(p_cantidad, s.cantidad), minimo = coalesce(p_minimo, s.minimo)
  where s.producto_id = p_producto_id
  returning * into v_fila;

  if v_fila.cantidad <> v_anterior then
    insert into public.movimientos_stock (negocio_id, lote_id, producto_id, tipo, cantidad, cuenta_id, dispositivo_id, motivo)
    values (v_negocio, gen_random_uuid(), p_producto_id, 'ajuste', v_fila.cantidad - v_anterior, auth.uid(),
            p_dispositivo_id, v_motivo);
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Productos activos en o bajo su mínimo. security invoker: la RLS filtra por negocio, y el proveedor
-- (productos_gestion, sólo jefe) le llega vacío a la caja.
create or replace function public.faltantes()
returns table (producto_id uuid, nombre text, cantidad integer, minimo integer, proveedor text)
language sql
stable
set search_path = ''
as $$
  select p.id, p.nombre, s.cantidad, s.minimo, g.proveedor
  from public.stock_productos s
  join public.productos p on p.id = s.producto_id
  left join public.productos_gestion g on g.producto_id = s.producto_id
  where s.negocio_id = public.negocio_actual() and p.activo and s.cantidad <= s.minimo
  order by g.proveedor nulls last, p.nombre
$$;

-- Interna: la llaman confirmar_venta (resta) y anular_venta (devuelve) con la venta ya validada.
-- p_signo -1 descuenta, 1 devuelve. Devuelve los productos que quedaron en o bajo su mínimo.
create or replace function public.mover_stock_venta(p_venta_id uuid, p_signo integer)
returns jsonb
language sql
set search_path = ''
as $$
  with movido as (
    update public.stock_productos s
    set cantidad = s.cantidad + p_signo * l.cantidad
    from public.lineas_venta l
    where l.venta_id = p_venta_id and l.producto_id = s.producto_id
    returning s.producto_id, s.cantidad, s.minimo
  )
  select coalesce(jsonb_agg(jsonb_build_object('producto_id', m.producto_id, 'nombre', p.nombre,
                                               'cantidad', m.cantidad, 'minimo', m.minimo) order by p.nombre), '[]'::jsonb)
  from movido m join public.productos p on p.id = m.producto_id
  where m.cantidad <= m.minimo
$$;

revoke all on function public.ingresar_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingresar_stock(uuid, uuid, jsonb) to authenticated;
revoke all on function public.ajustar_stock(uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.ajustar_stock(uuid, uuid, integer, integer, text) to authenticated;
revoke all on function public.faltantes() from public, anon, authenticated;
grant execute on function public.faltantes() to authenticated;
revoke all on function public.mover_stock_venta(uuid, integer) from public, anon, authenticated;
