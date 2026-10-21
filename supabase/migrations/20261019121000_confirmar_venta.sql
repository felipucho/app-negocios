-- Única puerta de escritura de ventas (spec secciones 4, 6 y 10). security definer: saltea RLS,
-- por eso negocio_id sale del token y la prueba de aislamiento (140) es obligatoria.
-- Orden fijo: 1 cuenta, 2 bloquear PC, 3 id y hash, 4 turno, 5 precios, 6 fiado, 7 importes, 8 numerar e insertar.
-- Los códigos de cobro son los mismos que ErrorCobro (src/venta/cobro.ts, tarea 5).
create or replace function public.confirmar_venta(
  p_venta_id uuid,
  p_dispositivo_id uuid,
  p_lineas jsonb,
  p_pagos jsonb,
  p_total integer,
  p_efectivo_entregado integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_prefijo text;
  v_hash text;
  v_existente public.ventas%rowtype;
  v_turno uuid;
  v_faltantes jsonb;
  v_diferencias jsonb;
  v_total bigint;
  v_suma bigint;
  v_efectivo bigint;
  v_entregado bigint;
  v_numero integer;
  v_fecha timestamptz;
  v_anulada boolean;
begin
  -- 1. Negocio del token y cuenta en ese negocio (rol leído de cuentas con auth.uid()).
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- 2. Bloquear la PC: serializa la numeración (doble clic, dos pestañas). Sólo PCs del negocio.
  select d.prefijo into v_prefijo
  from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- 3. id y hash del contenido recibido. jsonb ordena las claves: el texto es estable.
  if p_venta_id is null
     or jsonb_typeof(p_lineas) is distinct from 'array'
     or jsonb_typeof(p_pagos) is distinct from 'array' then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  -- Tope de tamaño antes de cualquier trabajo por línea: lineas_venta es de sólo agregar.
  if jsonb_array_length(p_lineas) > 200 or jsonb_array_length(p_pagos) > 4 then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  -- Sin efectivo_entregado: no se guarda (2026-10-20) y un hash sin sal lo dejaría recuperable.
  -- Un reintento con otra entrega devuelve la misma venta con el vuelto de esta llamada.
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'dispositivo_id', p_dispositivo_id,
      'lineas', p_lineas,
      'pagos', p_pagos,
      'total', p_total
    )::text, 'UTF8')), 'hex');

  select * into v_existente from public.ventas v where v.id = p_venta_id;
  if found then
    -- Otro contenido, u otro negocio: error. Nunca se devuelve en silencio otra venta.
    if v_existente.negocio_id <> v_negocio or v_existente.hash_contenido <> v_hash then
      raise exception 'venta_id_reusado' using errcode = 'P0001';
    end if;
    select coalesce(sum(pv.importe), 0) into v_efectivo
    from public.pagos_venta pv where pv.venta_id = v_existente.id and pv.medio = 'efectivo';
    -- Grabada, error de red, anulada desde la caja del día y recién ahí el reintento: no es un cobro, no hay vuelto.
    v_anulada := exists (select 1 from public.anulaciones a where a.venta_id = v_existente.id);
    return jsonb_build_object(
      'estado', 'confirmada',
      'venta_id', v_existente.id,
      'prefijo', (select d.prefijo from public.dispositivos d where d.id = v_existente.dispositivo_id),
      'numero', v_existente.numero,
      'total', v_existente.total,
      'fecha', v_existente.fecha,
      'vuelto', case when v_anulada then 0 else greatest(coalesce(p_efectivo_entregado, v_efectivo) - v_efectivo, 0) end,
      'ya_existia', true,
      'anulada', v_anulada
    );
  end if;

  -- 4. Turno abierto en esta PC (un turno por PC, decisión 38).
  select t.id into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  -- 5. Productos activos del negocio y precios: la base tiene la última palabra (decisión 22).
  -- for share: un cambio de precio o una baja concurrente espera a que termine esta venta, así el
  -- control de precios, el total y las líneas leen el mismo precio (cada sentencia ve otro snapshot).
  perform 1 from public.productos p
  where p.negocio_id = v_negocio
    and p.id::text in (select e ->> 'producto_id' from jsonb_array_elements(p_lineas) e)
  order by p.id
  for share;

  select coalesce(jsonb_agg(e -> 'producto_id'), '[]'::jsonb) into v_faltantes
  from jsonb_array_elements(p_lineas) e
  where not exists (
    select 1 from public.productos p
    where p.negocio_id = v_negocio and p.activo and p.id::text = e ->> 'producto_id'
  );
  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'producto_no_disponible' using errcode = 'P0001', detail = v_faltantes::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'producto_id', p.id, 'nombre', p.nombre,
           'precio_visto', e -> 'precio_visto', 'precio_actual', p.precio)), '[]'::jsonb)
  into v_diferencias
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id::text = e ->> 'producto_id'
  where p.precio::text is distinct from e ->> 'precio_visto';
  if jsonb_array_length(v_diferencias) > 0 then
    -- No graba nada: la pantalla muestra qué cambió y confirma de nuevo con un id nuevo.
    return jsonb_build_object('estado', 'precios_distintos', 'diferencias', v_diferencias);
  end if;

  -- 6. Fiado: módulo activo y cliente del mismo negocio, no suprimido.
  if exists (select 1 from jsonb_array_elements(p_pagos) e where e ->> 'medio' = 'fiado') then
    if not public.modulo_activo('fiado') then
      raise exception 'fiado_deshabilitado' using errcode = 'P0001';
    end if;
    -- Mismo motivo que en 5: que no lo supriman entre el control y el insert del pago.
    perform 1 from public.clientes c
    where c.negocio_id = v_negocio
      and c.id::text in (select e ->> 'cliente_id' from jsonb_array_elements(p_pagos) e where e ->> 'medio' = 'fiado')
    for share;
    if exists (
      select 1 from jsonb_array_elements(p_pagos) e
      where e ->> 'medio' = 'fiado'
        and not exists (
          select 1 from public.clientes c
          where c.negocio_id = v_negocio and not c.suprimido and c.id::text = e ->> 'cliente_id'
        )
    ) then
      raise exception 'fiado_sin_cliente' using errcode = 'P0001';
    end if;
  end if;

  -- 7. Forma e importes: enteros mayores que cero; total recalculado; pagos = total; efectivo suficiente.
  if jsonb_array_length(p_lineas) = 0 then
    raise exception 'venta_vacia' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lineas) e
    where jsonb_typeof(e -> 'cantidad') is distinct from 'number'
       or e ->> 'cantidad' !~ '^[1-9][0-9]{0,4}$'
  ) or (select count(*) from jsonb_array_elements(p_lineas))
       <> (select count(distinct e ->> 'producto_id') from jsonb_array_elements(p_lineas) e) then
    raise exception 'linea_invalida' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagos) e
    where coalesce(e ->> 'medio', '') not in ('efectivo', 'transferencia', 'tarjeta', 'fiado')
  ) or (select count(*) from jsonb_array_elements(p_pagos))
       <> (select count(distinct e ->> 'medio') from jsonb_array_elements(p_pagos) e) then
    raise exception 'pago_invalido' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagos) e
    where jsonb_typeof(e -> 'importe') is distinct from 'number'
       or e ->> 'importe' !~ '^[1-9][0-9]{0,8}$'
  ) or p_total is null or p_total <= 0 or p_efectivo_entregado < 0 then
    raise exception 'importe_invalido' using errcode = 'P0001';
  end if;

  select sum((e ->> 'cantidad')::bigint * p.precio) into v_total
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id = (e ->> 'producto_id')::uuid;
  if v_total <> p_total then
    raise exception 'total_distinto' using errcode = 'P0001',
      detail = jsonb_build_object('total_enviado', p_total, 'total_calculado', v_total)::text;
  end if;

  select coalesce(sum((e ->> 'importe')::bigint), 0),
         coalesce(sum((e ->> 'importe')::bigint) filter (where e ->> 'medio' = 'efectivo'), 0)
  into v_suma, v_efectivo
  from jsonb_array_elements(p_pagos) e;
  if v_suma <> v_total then
    raise exception 'no_suma_total' using errcode = 'P0001';
  end if;

  v_entregado := coalesce(p_efectivo_entregado, v_efectivo);
  if v_efectivo = 0 and v_entregado > 0 then
    raise exception 'entrega_sin_efectivo' using errcode = 'P0001';
  end if;
  if v_entregado < v_efectivo then
    raise exception 'efectivo_insuficiente' using errcode = 'P0001';
  end if;

  -- 8. Recién ahora numerar e insertar. Todo es una transacción: si algo falla, el número no se consume.
  update public.dispositivos d set ultimo_numero = d.ultimo_numero + 1
  where d.id = p_dispositivo_id
  returning d.ultimo_numero into v_numero;

  insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido)
  values (p_venta_id, v_negocio, p_dispositivo_id, auth.uid(), v_turno, v_numero, v_total::integer, v_hash)
  returning fecha into v_fecha;

  insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario)
  select v_negocio, p_venta_id, p.id, (e ->> 'cantidad')::integer, p.precio
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id = (e ->> 'producto_id')::uuid;

  insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id)
  select v_negocio, p_venta_id, (e ->> 'medio')::public.medio_pago, (e ->> 'importe')::integer,
         case when e ->> 'medio' = 'fiado' then (e ->> 'cliente_id')::uuid end
  from jsonb_array_elements(p_pagos) e;

  return jsonb_build_object(
    'estado', 'confirmada',
    'venta_id', p_venta_id,
    'prefijo', v_prefijo,
    'numero', v_numero,
    'total', v_total,
    'fecha', v_fecha,
    'vuelto', v_entregado - v_efectivo,
    'ya_existia', false,
    'anulada', false
  );
end;
$$;

revoke all on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) to authenticated;
