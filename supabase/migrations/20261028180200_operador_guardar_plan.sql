-- Editor de planes (spec de planes 2026-10-28, Funciones de operador: operador_guardar_plan, y Reglas).
-- Cambiar los módulos de un plan aplica, en cada kiosco que lo tiene, lo mismo que operador_fijar_plan:
-- lo que pierde derecho se apaga en la misma operación, con historial. No crea ni borra planes, ni cambia
-- su código ni si está activo: el spec lo deja abierto.

-- Derecho del kiosco si su plan tuviera estos módulos. Interna, como derecho_con_plan.
create or replace function public.derecho_con_modulos(p_negocio uuid, p_modulos text[], p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.permite from public.excepciones_modulo e where e.negocio_id = p_negocio and e.modulo = p_modulo),
    p_modulo = any(p_modulos),
    false)
$$;

-- Sólo lectura: qué gana y qué pierde cada kiosco del plan si el plan queda con estos módulos.
-- 'pierde' con uso = true se apaga al guardar.
create or replace function public.operador_previsualizar_guardar_plan(p_plan_id uuid, p_modulos text[])
returns table (negocio_id uuid, kiosco text, clave text, descripcion text, efecto text, uso boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if p_modulos is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.planes p where p.id = p_plan_id) then
    raise exception 'plan_desconocido' using errcode = 'P0001';
  end if;
  return query
    select np.negocio_id, n.nombre, m.clave, m.descripcion,
      case when public.derecho_con_modulos(np.negocio_id, p_modulos, m.clave) then 'gana' else 'pierde' end,
      public.uso_modulo(np.negocio_id, m.clave)
    from public.negocio_plan np
    join public.negocios n on n.id = np.negocio_id
    cross join public.modulos m
    where np.plan_id = p_plan_id
      and public.tiene_derecho(np.negocio_id, m.clave) <> public.derecho_con_modulos(np.negocio_id, p_modulos, m.clave)
    order by n.nombre, m.clave;
end;
$$;

-- Edita nombre, descripción y módulos de un plan. El plan tiene que incluir los 'requiere' de sus módulos.
-- Un reintento con el mismo p_op_id no vuelve a aplicarse.
create or replace function public.operador_guardar_plan(p_plan_id uuid, p_nombre text, p_descripcion text,
  p_modulos text[], p_motivo text, p_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.planes%rowtype;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_descripcion text := btrim(coalesce(p_descripcion, ''));
  v_modulos text[];
  v_anteriores text[];
  v_detalle text;
  r record;
  v_apagados jsonb := '[]';
begin
  perform public.exigir_operador();
  if p_plan_id is null or p_modulos is null or p_op_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.historial h where h.id = p_op_id) then
    if exists (select 1 from public.historial h
               where h.id = p_op_id and h.tipo = 'plan_definido' and h.entidad_id = p_plan_id) then
      return jsonb_build_object('ya_aplicada', true);
    end if;
    raise exception 'id_repetido' using errcode = 'P0001';
  end if;
  -- Dos ediciones del mismo plan a la vez se aplican una después de la otra.
  select p.* into v_plan from public.planes p where p.id = p_plan_id for update;
  if not found then
    raise exception 'plan_desconocido' using errcode = 'P0001';
  end if;
  if char_length(v_nombre) not between 1 and 60 then
    raise exception 'nombre_plan_invalido' using errcode = 'P0001';
  end if;
  if char_length(v_descripcion) > 200 then
    raise exception 'descripcion_invalida' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(p_modulos) x where not exists (select 1 from public.modulos m where m.clave = x)) then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;
  v_modulos := array(select distinct x from unnest(p_modulos) x order by x);
  select string_agg(distinct d.requiere, ', ') into v_detalle from public.modulo_dependencias d
  where d.tipo = 'requiere' and d.modulo = any(v_modulos) and d.requiere <> all(v_modulos);
  if v_detalle is not null then
    raise exception 'dependencia_sin_derecho' using errcode = 'P0001', detail = v_detalle;
  end if;

  for r in
    select np.negocio_id, m.clave from public.negocio_plan np cross join public.modulos m
    where np.plan_id = p_plan_id
      and public.tiene_derecho(np.negocio_id, m.clave)
      and not public.derecho_con_modulos(np.negocio_id, v_modulos, m.clave)
    order by np.negocio_id, m.clave
  loop
    -- Un módulo que otro módulo que sigue activo requiere no puede perder derecho.
    select string_agg(d.modulo, ', ') into v_detalle from public.modulo_dependencias d
    where d.requiere = r.clave and d.tipo = 'requiere'
      and public.modulo_activo_negocio(r.negocio_id, d.modulo)
      and public.derecho_con_modulos(r.negocio_id, v_modulos, d.modulo);
    if v_detalle is not null then
      raise exception 'modulo_requerido' using errcode = 'P0001', detail = v_detalle;
    end if;
    if public.uso_modulo(r.negocio_id, r.clave) then
      insert into public.modulos_negocio (negocio_id, modulo, activo) values (r.negocio_id, r.clave, false)
      on conflict (negocio_id, modulo) do update set activo = false;
      insert into public.historial (negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
      values (r.negocio_id, 'cambio_modulo', auth.uid(), 'negocios', r.negocio_id,
        jsonb_build_object('modulo', r.clave, 'activo', true), jsonb_build_object('modulo', r.clave, 'activo', false),
        btrim(p_motivo));
      v_apagados := v_apagados || jsonb_build_object('negocio_id', r.negocio_id, 'modulo', r.clave);
    end if;
  end loop;

  v_anteriores := array(select pm.modulo from public.plan_modulos pm where pm.plan_id = p_plan_id order by pm.modulo);
  delete from public.plan_modulos pm where pm.plan_id = p_plan_id and pm.modulo <> all(v_modulos);
  insert into public.plan_modulos (plan_id, modulo)
  select p_plan_id, x from unnest(v_modulos) x
  on conflict (plan_id, modulo) do nothing;
  update public.planes p set nombre = v_nombre, descripcion = v_descripcion where p.id = p_plan_id;
  -- Sin negocio: la definición de un plan no es de un kiosco (historial_negocio_o_planes_check).
  insert into public.historial (id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
  values (p_op_id, 'plan_definido', auth.uid(), 'planes', p_plan_id,
    jsonb_build_object('nombre', v_plan.nombre, 'descripcion', v_plan.descripcion, 'modulos', to_jsonb(v_anteriores)),
    jsonb_build_object('nombre', v_nombre, 'descripcion', v_descripcion, 'modulos', to_jsonb(v_modulos)),
    btrim(p_motivo));

  return jsonb_build_object('plan', v_plan.codigo, 'apagados', v_apagados);
end;
$$;

-- Grants: la interna, sin grant (recibe negocio). Las de operador, sólo authenticated.
revoke all on function public.derecho_con_modulos(uuid, text[], text) from public, anon, authenticated;
revoke all on function public.operador_previsualizar_guardar_plan(uuid, text[]) from public, anon, authenticated;
grant execute on function public.operador_previsualizar_guardar_plan(uuid, text[]) to authenticated;
revoke all on function public.operador_guardar_plan(uuid, text, text, text[], text, uuid) from public, anon, authenticated;
grant execute on function public.operador_guardar_plan(uuid, text, text, text[], text, uuid) to authenticated;
