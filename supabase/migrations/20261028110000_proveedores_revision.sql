-- Revisión del módulo proveedores (hallazgos del 2026-10-28). Reemplaza funciones de 20261028100000_proveedores.sql:
-- los textos rechazan caracteres de sentido oculto, como el resto del sistema; el contacto y las notas se guardan
-- en una línea; quitar y sumar faltantes bloquean la fila del proveedor; los faltantes no repiten productos con el
-- mismo nombre; y el módulo de stock apagado tiene su propio código de error. create or replace conserva los permisos.

-- Ficha: nombre único, y contacto y notas en una línea.
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
  v_contacto text := nullif(btrim(regexp_replace(coalesce(p_contacto, ''), '\s+', ' ', 'g')), '');
  v_notas text := nullif(btrim(regexp_replace(coalesce(p_notas, ''), '\s+', ' ', 'g')), '');
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
  if char_length(v_nombre) not between 1 and 60 or v_nombre ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'
     or (v_contacto is not null and (char_length(v_contacto) > 80
         or v_contacto ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'))
     or (v_notas is not null and (char_length(v_notas) > 200
         or v_notas ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]')) then
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
  if v_nota is not null and (char_length(v_nota) > 120 or v_nota ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]') then
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

-- Sólo se quita una visita que todavía está prevista. for update: si otra PC la marca en ese instante, gana la que llegó primero.
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

  select * into v_fila from public.visitas_proveedor v
  where v.id = p_visita_id and v.negocio_id = v_negocio
  for update;
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
  if char_length(v_descripcion) not between 1 and 80 or v_descripcion ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'
     or (v_cantidad is not null and (char_length(v_cantidad) > 30
         or v_cantidad ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]')) then
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

-- Suma al pedido los productos en mínimo o sin stock que Precios tiene con este proveedor (por nombre).
-- for update sobre el proveedor: dos llamadas seguidas corren de a una, y la segunda ya ve los renglones de la primera.
-- distinct: dos productos con el mismo nombre dan un solo renglón.
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
    raise exception 'stock_deshabilitado' using errcode = 'P0001';
  end if;

  select p.nombre into v_nombre from public.proveedores p
  where p.id = p_proveedor_id and p.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'proveedor_desconocido' using errcode = 'P0001';
  end if;

  with faltan as (
    select distinct p.nombre
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
