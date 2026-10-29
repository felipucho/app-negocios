-- Módulo proveedores (docs/superpowers/specs/2026-10-28-proveedores.md): ficha, cuándo vienen, qué pedirles y los
-- retiros de caja para cada uno. Un retiro es un movimiento de caja pago_proveedor con proveedor_id: entra al arqueo.
insert into public.modulos (clave, activo_por_defecto, descripcion) values
  ('proveedores', false, 'Ficha de proveedores, cuándo vienen, qué pedirles y los retiros de caja para cada uno.');

create type public.estado_visita as enum ('prevista', 'llego', 'no_vino');

-- Nombre único por negocio sin distinguir mayúsculas: une al proveedor con productos_gestion.proveedor.
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  contacto text check (contacto is null or char_length(btrim(contacto)) between 1 and 80),
  notas text check (notas is null or char_length(btrim(notas)) between 1 and 200),
  creado timestamptz not null default now(),
  unique (id, negocio_id)
);
create index proveedores_negocio_idx on public.proveedores (negocio_id);
create unique index proveedores_nombre_unico on public.proveedores (negocio_id, lower(nombre));

-- Visitas y pedidos se cambian (no son plata). Se escriben sólo con las funciones de abajo.
create table public.visitas_proveedor (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  proveedor_id uuid not null,
  fecha date not null,
  estado public.estado_visita not null default 'prevista',
  nota text check (nota is null or char_length(btrim(nota)) between 1 and 120),
  creado timestamptz not null default now(),
  foreign key (proveedor_id, negocio_id) references public.proveedores (id, negocio_id)
);
create index visitas_proveedor_negocio_fecha_idx on public.visitas_proveedor (negocio_id, fecha);
create index visitas_proveedor_proveedor_idx on public.visitas_proveedor (proveedor_id);

create table public.pedidos_proveedor (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  proveedor_id uuid not null,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 80),
  cantidad text check (cantidad is null or char_length(btrim(cantidad)) between 1 and 30),
  hecho boolean not null default false,
  creado timestamptz not null default now(),
  foreign key (proveedor_id, negocio_id) references public.proveedores (id, negocio_id)
);
create index pedidos_proveedor_proveedor_idx on public.pedidos_proveedor (proveedor_id);

-- El retiro lleva a quién se le pagó. Sólo un pago a proveedor puede llevarlo.
alter table public.movimientos_caja
  add column proveedor_id uuid,
  add constraint movimientos_caja_proveedor_fk foreign key (proveedor_id, negocio_id)
    references public.proveedores (id, negocio_id),
  add constraint movimientos_caja_proveedor_tipo check (proveedor_id is null or tipo = 'pago_proveedor');
create index movimientos_caja_proveedor_idx on public.movimientos_caja (proveedor_id) where proveedor_id is not null;

-- RLS: la lectura es del negocio, para caja y jefe. Las escrituras pasan por las funciones de abajo.
alter table public.proveedores enable row level security;
revoke all on table public.proveedores from public, anon, authenticated;
grant select on table public.proveedores to authenticated;
create policy proveedores_select on public.proveedores
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

alter table public.visitas_proveedor enable row level security;
revoke all on table public.visitas_proveedor from public, anon, authenticated;
grant select on table public.visitas_proveedor to authenticated;
create policy visitas_proveedor_select on public.visitas_proveedor
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

alter table public.pedidos_proveedor enable row level security;
revoke all on table public.pedidos_proveedor from public, anon, authenticated;
grant select on table public.pedidos_proveedor to authenticated;
create policy pedidos_proveedor_select on public.pedidos_proveedor
  for select to authenticated using (negocio_id = (select public.negocio_actual()));

-- Alta o cambio de ficha. El id lo genera el navegador: guardar otra vez el mismo proveedor lo actualiza.
create or replace function public.guardar_proveedor(
  p_id uuid,
  p_nombre text,
  p_contacto text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_contacto text := nullif(btrim(coalesce(p_contacto, '')), '');
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_fila public.proveedores%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if p_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) not between 1 and 60 or v_nombre ~ '[[:cntrl:]]'
     or (v_contacto is not null and (char_length(v_contacto) > 80 or v_contacto ~ '[[:cntrl:]]'))
     or (v_notas is not null and (char_length(v_notas) > 200 or v_notas ~ '[[:cntrl:]]')) then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.proveedores p
             where p.negocio_id = v_negocio and lower(p.nombre) = lower(v_nombre) and p.id <> p_id) then
    raise exception 'nombre_repetido' using errcode = 'P0001';
  end if;

  insert into public.proveedores (id, negocio_id, nombre, contacto, notas)
  values (p_id, v_negocio, v_nombre, v_contacto, v_notas)
  on conflict (id) do update
    set nombre = excluded.nombre, contacto = excluded.contacto, notas = excluded.notas
    where public.proveedores.negocio_id = v_negocio
  returning * into v_fila;
  -- Un id de otro negocio no entra en el update de arriba: no devuelve fila.
  if v_fila.id is null then
    raise exception 'proveedor_desconocido' using errcode = 'P0001';
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Una visita prevista para un proveedor. Un reintento con el mismo id no suma otra.
create or replace function public.registrar_visita_proveedor(
  p_id uuid,
  p_proveedor_id uuid,
  p_fecha date,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_nota text := nullif(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), '');
  v_fila public.visitas_proveedor%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if p_id is null or p_proveedor_id is null or p_fecha is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if v_nota is not null and (char_length(v_nota) > 120 or v_nota ~ '[[:cntrl:]]') then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;
  perform 1 from public.proveedores p where p.id = p_proveedor_id and p.negocio_id = v_negocio;
  if not found then
    raise exception 'proveedor_desconocido' using errcode = 'P0001';
  end if;

  insert into public.visitas_proveedor (id, negocio_id, proveedor_id, fecha, nota)
  values (p_id, v_negocio, p_proveedor_id, p_fecha, v_nota)
  on conflict (id) do nothing
  returning * into v_fila;
  if v_fila.id is null then
    select * into v_fila from public.visitas_proveedor v where v.id = p_id and v.negocio_id = v_negocio;
    if not found then
      raise exception 'visita_id_reusado' using errcode = 'P0001';
    end if;
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Marca la visita como llegó, no vino o prevista de nuevo.
create or replace function public.marcar_visita_proveedor(p_visita_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_fila public.visitas_proveedor%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if p_visita_id is null or coalesce(p_estado, '') not in ('prevista', 'llego', 'no_vino') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;

  update public.visitas_proveedor v
  set estado = p_estado::public.estado_visita
  where v.id = p_visita_id and v.negocio_id = v_negocio
  returning * into v_fila;
  if v_fila.id is null then
    raise exception 'visita_desconocida' using errcode = 'P0001';
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Sólo se quita una visita que todavía está prevista: una ya marcada queda como historial.
create or replace function public.quitar_visita_proveedor(p_visita_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_fila public.visitas_proveedor%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;

  select * into v_fila from public.visitas_proveedor v where v.id = p_visita_id and v.negocio_id = v_negocio;
  if not found then
    raise exception 'visita_desconocida' using errcode = 'P0001';
  end if;
  if v_fila.estado <> 'prevista' then
    raise exception 'visita_ya_marcada' using errcode = 'P0001';
  end if;

  delete from public.visitas_proveedor where id = p_visita_id;
end;
$$;

-- Un renglón de "qué pedirle". Un reintento con el mismo id no suma otro.
create or replace function public.agregar_pedido_proveedor(
  p_id uuid,
  p_proveedor_id uuid,
  p_descripcion text,
  p_cantidad text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_descripcion text := btrim(regexp_replace(coalesce(p_descripcion, ''), '\s+', ' ', 'g'));
  v_cantidad text := nullif(btrim(regexp_replace(coalesce(p_cantidad, ''), '\s+', ' ', 'g')), '');
  v_fila public.pedidos_proveedor%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if p_id is null or p_proveedor_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(v_descripcion) not between 1 and 80 or v_descripcion ~ '[[:cntrl:]]'
     or (v_cantidad is not null and (char_length(v_cantidad) > 30 or v_cantidad ~ '[[:cntrl:]]')) then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;
  perform 1 from public.proveedores p where p.id = p_proveedor_id and p.negocio_id = v_negocio;
  if not found then
    raise exception 'proveedor_desconocido' using errcode = 'P0001';
  end if;

  insert into public.pedidos_proveedor (id, negocio_id, proveedor_id, descripcion, cantidad)
  values (p_id, v_negocio, p_proveedor_id, v_descripcion, v_cantidad)
  on conflict (id) do nothing
  returning * into v_fila;
  if v_fila.id is null then
    select * into v_fila from public.pedidos_proveedor pp where pp.id = p_id and pp.negocio_id = v_negocio;
    if not found then
      raise exception 'pedido_id_reusado' using errcode = 'P0001';
    end if;
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

-- Marca el renglón como pedido (hecho = true) o lo vuelve pendiente.
create or replace function public.marcar_pedido_proveedor(p_pedido_id uuid, p_hecho boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_fila public.pedidos_proveedor%rowtype;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if p_pedido_id is null or p_hecho is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;

  update public.pedidos_proveedor pp
  set hecho = p_hecho
  where pp.id = p_pedido_id and pp.negocio_id = v_negocio
  returning * into v_fila;
  if v_fila.id is null then
    raise exception 'pedido_desconocido' using errcode = 'P0001';
  end if;

  return to_jsonb(v_fila) - 'negocio_id';
end;
$$;

create or replace function public.quitar_pedido_proveedor(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;

  delete from public.pedidos_proveedor pp where pp.id = p_pedido_id and pp.negocio_id = v_negocio;
  if not found then
    raise exception 'pedido_desconocido' using errcode = 'P0001';
  end if;
end;
$$;

-- Suma al pedido los productos en mínimo o sin stock que tienen a este proveedor en Precios (por nombre).
-- No repite un renglón pendiente. security definer: la caja no ve productos_gestion, pero el pedido sí lo usa.
create or replace function public.agregar_faltantes_al_pedido(p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_nombre text;
  v_cantidad integer;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if not public.modulo_activo('proveedores') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'proveedores';
  end if;
  if not public.modulo_activo('stock') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'stock';
  end if;

  select p.nombre into v_nombre from public.proveedores p where p.id = p_proveedor_id and p.negocio_id = v_negocio;
  if not found then
    raise exception 'proveedor_desconocido' using errcode = 'P0001';
  end if;

  with faltan as (
    select p.nombre
    from public.stock_productos s
    join public.productos p on p.id = s.producto_id
    join public.productos_gestion g on g.producto_id = p.id
    where s.negocio_id = v_negocio and p.activo and s.cantidad <= s.minimo
      and lower(btrim(g.proveedor)) = lower(btrim(v_nombre))
      and not exists (
        select 1 from public.pedidos_proveedor pp
        where pp.proveedor_id = p_proveedor_id and not pp.hecho and lower(pp.descripcion) = lower(p.nombre)
      )
  ),
  nuevos as (
    insert into public.pedidos_proveedor (id, negocio_id, proveedor_id, descripcion)
    select gen_random_uuid(), v_negocio, p_proveedor_id, f.nombre from faltan f
    returning id
  )
  select count(*) into v_cantidad from nuevos;

  return jsonb_build_object('cantidad', v_cantidad);
end;
$$;

-- Igual que la versión de 20261027120300_movimientos_caja.sql, con proveedor_id: un retiro para un proveedor.
-- Cambia la firma (p_proveedor_id): la vieja se borra, si no quedarían dos sobrecargas.
drop function public.registrar_movimiento_caja(uuid, uuid, text, integer, text);

create function public.registrar_movimiento_caja(
  p_movimiento_id uuid,
  p_dispositivo_id uuid,
  p_tipo text,
  p_importe integer,
  p_detalle text default null,
  p_proveedor_id uuid default null
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
       or v_mov.importe is distinct from p_importe or v_mov.detalle is distinct from v_detalle
       or v_mov.proveedor_id is distinct from p_proveedor_id then
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
  -- Un proveedor sólo se asigna a un pago a proveedor, y tiene que ser de este kiosco.
  if p_proveedor_id is not null then
    if p_tipo <> 'pago_proveedor' then
      raise exception 'tipo_invalido' using errcode = 'P0001';
    end if;
    perform 1 from public.proveedores p where p.id = p_proveedor_id and p.negocio_id = v_negocio;
    if not found then
      raise exception 'proveedor_desconocido' using errcode = 'P0001';
    end if;
  end if;

  insert into public.movimientos_caja (id, negocio_id, turno_id, dispositivo_id, cuenta_id, tipo, importe, detalle, proveedor_id)
  values (p_movimiento_id, v_negocio, v_turno, p_dispositivo_id, auth.uid(), p_tipo::public.tipo_movimiento_caja,
          p_importe, v_detalle, p_proveedor_id)
  returning * into v_mov;

  return to_jsonb(v_mov) - 'negocio_id' || jsonb_build_object('ya_existia', false);
end;
$$;

revoke all on function public.guardar_proveedor(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.guardar_proveedor(uuid, text, text, text) to authenticated;
revoke all on function public.registrar_visita_proveedor(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.registrar_visita_proveedor(uuid, uuid, date, text) to authenticated;
revoke all on function public.marcar_visita_proveedor(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_visita_proveedor(uuid, text) to authenticated;
revoke all on function public.quitar_visita_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.quitar_visita_proveedor(uuid) to authenticated;
revoke all on function public.agregar_pedido_proveedor(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.agregar_pedido_proveedor(uuid, uuid, text, text) to authenticated;
revoke all on function public.marcar_pedido_proveedor(uuid, boolean) from public, anon, authenticated;
grant execute on function public.marcar_pedido_proveedor(uuid, boolean) to authenticated;
revoke all on function public.quitar_pedido_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.quitar_pedido_proveedor(uuid) to authenticated;
revoke all on function public.agregar_faltantes_al_pedido(uuid) from public, anon, authenticated;
grant execute on function public.agregar_faltantes_al_pedido(uuid) to authenticated;
revoke all on function public.registrar_movimiento_caja(uuid, uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.registrar_movimiento_caja(uuid, uuid, text, integer, text, uuid) to authenticated;
