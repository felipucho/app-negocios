-- Anular según lo que pasó al vender (spec de planes 2026-10-28, efecto en funciones de venta): anular_venta
-- devolvía stock según el módulo al anular. Ahora la venta guarda si descontó y la anulación sigue eso.
-- Las ventas anteriores a esta migración quedan en false: anularlas no devuelve stock (limitación del spec).
alter table public.ventas add column stock_descontado boolean not null default false;

-- Igual que 20261027120500_venta_modulos.sql, más ventas.stock_descontado: lo graba el paso 8 y decide el paso 9.
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
  v_limite record;
  v_stock_bajo jsonb := '[]'::jsonb;
  v_stock_descontado boolean;
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
  -- Las líneas varios no tienen producto: se saltean acá y se validan en 7.
  perform 1 from public.productos p
  where p.negocio_id = v_negocio
    and p.id::text in (select e ->> 'producto_id' from jsonb_array_elements(p_lineas) e where not e ? 'varios')
  order by p.id
  for share;

  select coalesce(jsonb_agg(e -> 'producto_id'), '[]'::jsonb) into v_faltantes
  from jsonb_array_elements(p_lineas) e
  where not e ? 'varios'
    and not exists (
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
  where not e ? 'varios' and p.precio::text is distinct from e ->> 'precio_visto';
  if jsonb_array_length(v_diferencias) > 0 then
    -- No graba nada: la pantalla muestra qué cambió y confirma de nuevo con un id nuevo.
    return jsonb_build_object('estado', 'precios_distintos', 'diferencias', v_diferencias);
  end if;

  if exists (select 1 from jsonb_array_elements(p_lineas) e where e ? 'varios')
     and not public.modulo_activo('varios') then
    raise exception 'modulo_deshabilitado' using errcode = 'P0001', detail = 'varios';
  end if;

  -- 6. Fiado: módulo activo y cliente del mismo negocio, no suprimido.
  if exists (select 1 from jsonb_array_elements(p_pagos) e where e ->> 'medio' = 'fiado') then
    if not public.modulo_activo('fiado') then
      raise exception 'fiado_deshabilitado' using errcode = 'P0001';
    end if;
    -- for update (no share): que no lo supriman entre el control y el insert del pago, y que dos ventas
    -- fiadas o un cobro de deuda al mismo cliente lean su saldo de a una (límite, paso 7).
    perform 1 from public.clientes c
    where c.negocio_id = v_negocio
      and c.id::text in (select e ->> 'cliente_id' from jsonb_array_elements(p_pagos) e where e ->> 'medio' = 'fiado')
    for update;
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
       -- Varios: sin producto, precio entero positivo y descripción opcional sin caracteres de control.
       or (e ? 'varios' and (e -> 'varios' is distinct from 'true'::jsonb
           or e ? 'producto_id'
           or jsonb_typeof(e -> 'precio') is distinct from 'number'
           or e ->> 'precio' !~ '^[1-9][0-9]{0,8}$'
           or (e ? 'descripcion' and (jsonb_typeof(e -> 'descripcion') is distinct from 'string'
               or char_length(btrim(e ->> 'descripcion')) not between 1 and 40
               or e ->> 'descripcion' ~ '[[:cntrl:]​-‏‪-‮⁦-⁩]'))))
  ) or (select count(*) from jsonb_array_elements(p_lineas) e where not e ? 'varios')
       <> (select count(distinct e ->> 'producto_id') from jsonb_array_elements(p_lineas) e where not e ? 'varios') then
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

  select coalesce((select sum((e ->> 'cantidad')::bigint * p.precio)
                   from jsonb_array_elements(p_lineas) e
                   join public.productos p on p.negocio_id = v_negocio and p.id::text = e ->> 'producto_id'
                   where not e ? 'varios'), 0)
       + coalesce((select sum((e ->> 'cantidad')::bigint * (e ->> 'precio')::bigint)
                   from jsonb_array_elements(p_lineas) e where e ? 'varios'), 0)
  into v_total;
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

  -- Límite de fiado del cliente (null = sin límite): saldo actual + lo que se fía ahora. Hay un solo pago fiado.
  select c.id, c.limite_fiado, public.saldo_fiado(c.id) as saldo, (e ->> 'importe')::bigint as importe
  into v_limite
  from jsonb_array_elements(p_pagos) e
  join public.clientes c on c.negocio_id = v_negocio and c.id::text = e ->> 'cliente_id'
  where e ->> 'medio' = 'fiado' and c.limite_fiado is not null;
  if found and v_limite.saldo + v_limite.importe > v_limite.limite_fiado then
    raise exception 'limite_fiado' using errcode = 'P0001',
      detail = jsonb_build_object('saldo', v_limite.saldo, 'limite', v_limite.limite_fiado)::text;
  end if;

  -- 8. Recién ahora numerar e insertar. Todo es una transacción: si algo falla, el número no se consume.
  update public.dispositivos d set ultimo_numero = d.ultimo_numero + 1
  where d.id = p_dispositivo_id
  returning d.ultimo_numero into v_numero;

  insert into public.ventas (id, negocio_id, dispositivo_id, cuenta_id, turno_id, numero, total, hash_contenido,
                             stock_descontado)
  values (p_venta_id, v_negocio, p_dispositivo_id, auth.uid(), v_turno, v_numero, v_total::integer, v_hash,
          public.modulo_activo('stock'))
  returning fecha, stock_descontado into v_fecha, v_stock_descontado;

  insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario)
  select v_negocio, p_venta_id, p.id, (e ->> 'cantidad')::integer, p.precio
  from jsonb_array_elements(p_lineas) e
  join public.productos p on p.negocio_id = v_negocio and p.id::text = e ->> 'producto_id'
  where not e ? 'varios';

  insert into public.lineas_venta (negocio_id, venta_id, producto_id, cantidad, precio_unitario, descripcion)
  select v_negocio, p_venta_id, null, (e ->> 'cantidad')::integer, (e ->> 'precio')::integer,
         coalesce(btrim(e ->> 'descripcion'), 'Varios')
  from jsonb_array_elements(p_lineas) e
  where e ? 'varios';

  insert into public.pagos_venta (negocio_id, venta_id, medio, importe, cliente_id)
  select v_negocio, p_venta_id, (e ->> 'medio')::public.medio_pago, (e ->> 'importe')::integer,
         case when e ->> 'medio' = 'fiado' then (e ->> 'cliente_id')::uuid end
  from jsonb_array_elements(p_pagos) e;

  -- 9. Stock: descuenta y avisa, nunca rechaza (Felipe, 2026-10-27).
  if v_stock_descontado then
    v_stock_bajo := public.mover_stock_venta(p_venta_id, -1);
  end if;

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
  ) || case when jsonb_array_length(v_stock_bajo) > 0
            then jsonb_build_object('stock_bajo', v_stock_bajo) else '{}'::jsonb end;
end;
$$;

-- Igual que 20261027120500_venta_modulos.sql, salvo el paso 9: sigue ventas.stock_descontado, sin mirar el módulo.
create or replace function public.anular_venta(p_venta_id uuid, p_dispositivo_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_venta public.ventas%rowtype;
  v_turno uuid;
  v_anulacion public.anulaciones%rowtype;
begin
  -- 1. Cuenta del negocio del token.
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;

  -- 2. La PC desde donde se anula es del negocio. Mismo bloqueo que cerrar_turno: la anulación
  --    y el cierre del turno de esta PC no se cruzan (ver paso 6).
  perform 1 from public.dispositivos d
  where d.id = p_dispositivo_id and d.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- 3. La venta es del negocio. El bloqueo serializa dos anulaciones a la vez de la misma venta.
  --    Un bloqueo de fila no dispara el trigger que impide editar ventas (V24).
  select * into v_venta
  from public.ventas v
  where v.id = p_venta_id and v.negocio_id = v_negocio
  for update;
  if not found then
    raise exception 'venta_desconocida' using errcode = 'P0001';
  end if;

  -- 4. Regla de día por rol, antes de mirar si ya está anulada: la caja no consulta otros días.
  if v_rol = 'caja' and public.dia_operativo(v_venta.fecha) <> public.hoy() then
    raise exception 'fuera_de_dia' using errcode = 'P0001';
  end if;

  -- 5. Idempotente: si ya está anulada, devuelve esa anulación.
  select * into v_anulacion from public.anulaciones a where a.venta_id = v_venta.id;
  if found then
    return jsonb_build_object(
      'anulacion_id', v_anulacion.id,
      'venta_id', v_anulacion.venta_id,
      'fecha', v_anulacion.fecha,
      'motivo', v_anulacion.motivo,
      'ya_existia', true
    );
  end if;

  -- 6. Turno abierto en esta PC, después del reintento: una anulación ya hecha se devuelve aunque
  --    el turno se haya cerrado. Con la PC bloqueada, el turno no se cierra hasta el commit.
  select t.id into v_turno
  from public.turnos t
  where t.dispositivo_id = p_dispositivo_id and t.negocio_id = v_negocio and t.cierre is null;
  if not found then
    raise exception 'sin_turno' using errcode = 'P0001';
  end if;

  -- 7. Motivo obligatorio (mismo rango que el check de anulaciones.motivo, tarea 3).
  if char_length(v_motivo) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;

  -- 8. Movimiento nuevo y su registro en el historial.
  insert into public.anulaciones (negocio_id, venta_id, cuenta_id, dispositivo_id, turno_id, motivo)
  values (v_negocio, v_venta.id, auth.uid(), p_dispositivo_id, v_turno, v_motivo)
  returning * into v_anulacion;

  insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id,
                                valor_anterior, valor_nuevo, motivo)
  values (v_negocio, 'anulacion', auth.uid(), p_dispositivo_id, 'ventas', v_venta.id,
          jsonb_build_object('total', v_venta.total, 'fecha_venta', v_venta.fecha),
          jsonb_build_object('anulacion_id', v_anulacion.id),
          v_motivo);

  -- 9. Stock: devuelve lo que la venta descontó, aunque el módulo haya cambiado después.
  if v_venta.stock_descontado then
    perform public.mover_stock_venta(v_venta.id, 1);
  end if;

  return jsonb_build_object(
    'anulacion_id', v_anulacion.id,
    'venta_id', v_anulacion.venta_id,
    'fecha', v_anulacion.fecha,
    'motivo', v_anulacion.motivo,
    'ya_existia', false
  );
end;
$$;

revoke all on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.confirmar_venta(uuid, uuid, jsonb, jsonb, integer, integer) to authenticated;
revoke all on function public.anular_venta(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_venta(uuid, uuid, text) to authenticated;
