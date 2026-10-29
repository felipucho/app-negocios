-- Planes, derecho y uso de módulos (spec de planes 2026-10-28, secciones Modelo, Datos y Funciones).
-- derecho = excepción del kiosco, o si no, el plan. uso = modulos_negocio (o el defecto del catálogo).
-- activo = derecho y uso y todas las dependencias 'requiere' activas. La base calcula activo; la app sólo lo muestra.

-- 1. Historial: también registra planes (sin kiosco), excepciones, límite de fiado y cambios de operador.
alter table public.historial alter column negocio_id drop not null;
alter table public.historial drop constraint historial_entidad_check;
alter table public.historial add constraint historial_entidad_check
  check (entidad in ('productos', 'ventas', 'turnos', 'negocios', 'planes', 'clientes'));
-- Sin FK: dar de baja a un operador no borra su historial.
alter table public.historial add column operador_id uuid;
alter table public.historial add constraint historial_cuenta_u_operador_check
  check (cuenta_id is null or operador_id is null);
alter table public.historial add constraint historial_negocio_o_planes_check
  check (negocio_id is not null or entidad = 'planes');
alter table public.historial add constraint historial_motivo_planes_check
  check (tipo not in ('cambio_plan', 'excepcion_modulo', 'plan_definido') or char_length(btrim(motivo)) >= 1);

-- 2. Tablas nuevas.
create table public.planes (
  id uuid primary key,
  codigo text not null unique check (codigo ~ '^[a-z_]{1,30}$'),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  descripcion text not null default '',
  activo boolean not null default true
);

create table public.plan_modulos (
  plan_id uuid not null references public.planes (id),
  modulo text not null references public.modulos (clave),
  primary key (plan_id, modulo)
);

create table public.negocio_plan (
  negocio_id uuid primary key references public.negocios (id),
  plan_id uuid not null references public.planes (id),
  desde timestamptz not null default now()
);

-- Excepciones: extras que Felipe agrega (permite = true) o quita (permite = false) sobre el plan.
-- Sin grant ni policy para authenticated: se leen y escriben sólo por funciones.
create table public.excepciones_modulo (
  negocio_id uuid not null references public.negocios (id),
  modulo text not null references public.modulos (clave),
  permite boolean not null,
  motivo text not null check (char_length(btrim(motivo)) between 1 and 200),
  creado timestamptz not null default now(),
  primary key (negocio_id, modulo)
);

create table public.modulo_dependencias (
  modulo text not null references public.modulos (clave),
  requiere text not null references public.modulos (clave),
  tipo text not null check (tipo in ('requiere', 'integra')),
  primary key (modulo, requiere),
  check (modulo <> requiere)
);

create or replace function public.impedir_ciclo_dependencias()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'requiere' and exists (
    with recursive camino(modulo) as (
      select d.requiere from public.modulo_dependencias d where d.modulo = new.requiere and d.tipo = 'requiere'
      union
      select d.requiere from public.modulo_dependencias d
      join camino c on d.modulo = c.modulo and d.tipo = 'requiere'
    )
    select 1 from camino where camino.modulo = new.modulo
  ) then
    raise exception 'dependencia_ciclica' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger modulo_dependencias_sin_ciclos
  before insert or update on public.modulo_dependencias
  for each row execute function public.impedir_ciclo_dependencias();

alter table public.planes enable row level security;
alter table public.plan_modulos enable row level security;
alter table public.negocio_plan enable row level security;
alter table public.excepciones_modulo enable row level security;
alter table public.modulo_dependencias enable row level security;

create policy planes_select on public.planes for select to authenticated using (true);
create policy plan_modulos_select on public.plan_modulos for select to authenticated using (true);
create policy negocio_plan_select on public.negocio_plan for select to authenticated
  using (negocio_id = public.negocio_actual());
create policy modulo_dependencias_select on public.modulo_dependencias for select to authenticated using (true);

grant select on public.planes, public.plan_modulos, public.modulo_dependencias to authenticated;
grant select on public.negocio_plan to authenticated;

-- Todo kiosco nuevo arranca con el plan base (el del código 'base', que carga la migración de datos).
create or replace function public.asignar_plan_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.negocio_plan (negocio_id, plan_id)
  select new.id, p.id from public.planes p where p.codigo = 'base';
  return new;
end;
$$;

create trigger negocios_plan_base
  after insert on public.negocios
  for each row execute function public.asignar_plan_base();

-- 3. Derecho, uso y activo. Internas: reciben negocio, así que sin grant a authenticated.
create or replace function public.derecho_con_plan(p_negocio uuid, p_plan uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e.permite from public.excepciones_modulo e where e.negocio_id = p_negocio and e.modulo = p_modulo),
    exists (select 1 from public.plan_modulos pm where pm.plan_id = p_plan and pm.modulo = p_modulo),
    false)
$$;

create or replace function public.tiene_derecho(p_negocio uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.derecho_con_plan(p_negocio,
    (select np.plan_id from public.negocio_plan np where np.negocio_id = p_negocio), p_modulo)
$$;

create or replace function public.uso_modulo(p_negocio uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select mn.activo from public.modulos_negocio mn where mn.negocio_id = p_negocio and mn.modulo = p_modulo),
    (select m.activo_por_defecto from public.modulos m where m.clave = p_modulo),
    false)
$$;

create or replace function public.modulo_activo_negocio(p_negocio uuid, p_modulo text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_derecho(p_negocio, p_modulo) or not public.uso_modulo(p_negocio, p_modulo) then
    return false;
  end if;
  return not exists (
    select 1 from public.modulo_dependencias d
    where d.modulo = p_modulo and d.tipo = 'requiere' and not public.modulo_activo_negocio(p_negocio, d.requiere)
  );
end;
$$;

-- Misma firma que antes. Ahora es security definer: llama a funciones internas sin grant, y usa negocio_actual().
create or replace function public.modulo_activo(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.modulo_activo_negocio(public.negocio_actual(), p_clave)
$$;

-- 4. Lectura de caja y jefe.
create or replace function public.mis_modulos()
returns table (
  clave text,
  descripcion text,
  en_plan boolean,
  excepcion text,
  derecho boolean,
  uso boolean,
  activo boolean,
  faltan text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
begin
  if public.rol_actual() is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  return query
    select m.clave, m.descripcion,
      exists (select 1 from public.negocio_plan np join public.plan_modulos pm on pm.plan_id = np.plan_id
              where np.negocio_id = v_negocio and pm.modulo = m.clave),
      (select case when e.permite then 'agregado' else 'quitado' end
       from public.excepciones_modulo e where e.negocio_id = v_negocio and e.modulo = m.clave),
      public.tiene_derecho(v_negocio, m.clave),
      public.uso_modulo(v_negocio, m.clave),
      public.modulo_activo_negocio(v_negocio, m.clave),
      coalesce(array(select d.requiere from public.modulo_dependencias d
                     where d.modulo = m.clave and d.tipo = 'requiere'
                       and not public.modulo_activo_negocio(v_negocio, d.requiere)), '{}')
    from public.modulos m
    order by m.clave;
end;
$$;

-- Prende o apaga un módulo del kiosco del jefe. Un reintento con el mismo p_op_id no vuelve a aplicarse.
create or replace function public.cambiar_modulo(p_modulo text, p_activo boolean, p_op_id uuid,
  p_dispositivo_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_antes boolean;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if v_rol <> 'jefe' then
    raise exception 'solo_jefe' using errcode = 'P0001';
  end if;
  if p_modulo is null or p_activo is null or p_op_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.historial h where h.id = p_op_id) then
    if exists (select 1 from public.historial h where h.id = p_op_id and h.negocio_id = v_negocio) then
      return jsonb_build_object('modulo', p_modulo, 'activo', p_activo, 'ya_aplicada', true);
    end if;
    raise exception 'id_repetido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo) then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;

  v_antes := public.uso_modulo(v_negocio, p_modulo);
  if p_activo then
    if not public.tiene_derecho(v_negocio, p_modulo) then
      raise exception 'sin_derecho' using errcode = 'P0001', detail = p_modulo;
    end if;
    if exists (select 1 from public.modulo_dependencias d
               where d.modulo = p_modulo and d.tipo = 'requiere' and not public.modulo_activo_negocio(v_negocio, d.requiere)) then
      raise exception 'dependencia_inactiva' using errcode = 'P0001',
        detail = (select string_agg(d.requiere, ', ') from public.modulo_dependencias d
                  where d.modulo = p_modulo and d.tipo = 'requiere' and not public.modulo_activo_negocio(v_negocio, d.requiere));
    end if;
  elsif exists (select 1 from public.modulo_dependencias d
                where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(v_negocio, d.modulo)) then
    raise exception 'modulo_requerido' using errcode = 'P0001',
      detail = (select string_agg(d.modulo, ', ') from public.modulo_dependencias d
                where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(v_negocio, d.modulo));
  end if;

  insert into public.modulos_negocio (negocio_id, modulo, activo) values (v_negocio, p_modulo, p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;
  insert into public.historial (id, negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id,
    valor_anterior, valor_nuevo)
  values (p_op_id, v_negocio, 'cambio_modulo', auth.uid(), p_dispositivo_id, 'negocios', v_negocio,
    jsonb_build_object('modulo', p_modulo, 'activo', v_antes),
    jsonb_build_object('modulo', p_modulo, 'activo', p_activo));

  return jsonb_build_object('modulo', p_modulo, 'activo', p_activo);
end;
$$;

-- Reemplaza al cambio de fiado de 20261019121700: escribe historial y sirve para cualquier módulo.
drop function if exists public.cambiar_modulo_fiado(boolean);

-- 5. Límite de fiado: ahora deja historial con el valor anterior y el nuevo (P91).
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
  v_anterior integer;
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

  select c.* into v_cliente from public.clientes c
  where c.id = p_cliente_id and c.negocio_id = v_negocio and not c.suprimido;
  if not found then
    raise exception 'cliente_desconocido' using errcode = 'P0001';
  end if;
  v_anterior := v_cliente.limite_fiado;

  update public.clientes c set limite_fiado = p_limite where c.id = p_cliente_id
  returning * into v_cliente;

  insert into public.historial (negocio_id, tipo, cuenta_id, entidad, entidad_id, valor_anterior, valor_nuevo)
  values (v_negocio, 'cambio_limite_fiado', auth.uid(), 'clientes', p_cliente_id,
    jsonb_build_object('limite_fiado', v_anterior), jsonb_build_object('limite_fiado', p_limite));

  return jsonb_build_object('id', v_cliente.id, 'limite_fiado', v_cliente.limite_fiado);
end;
$$;

-- 6. Funciones de operador. Todas llaman a exigir_operador() y usan el negocio que reciben, nunca el del token.
create or replace function public.operador_listar_planes()
returns table (id uuid, codigo text, nombre text, descripcion text, activo boolean, modulos integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  return query
    select p.id, p.codigo, p.nombre, p.descripcion, p.activo,
      (select count(*)::integer from public.plan_modulos pm where pm.plan_id = p.id)
    from public.planes p
    order by p.codigo;
end;
$$;

-- Plan y extras de cada kiosco, para la lista.
create or replace function public.operador_planes_kioscos()
returns table (negocio_id uuid, plan_codigo text, plan_nombre text, extras integer, quitados integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  return query
    select np.negocio_id, p.codigo, p.nombre,
      (select count(*)::integer from public.excepciones_modulo e where e.negocio_id = np.negocio_id and e.permite),
      (select count(*)::integer from public.excepciones_modulo e where e.negocio_id = np.negocio_id and not e.permite)
    from public.negocio_plan np join public.planes p on p.id = np.plan_id;
end;
$$;

create or replace function public.operador_modulos_kiosco(p_negocio uuid)
returns table (
  clave text,
  descripcion text,
  en_plan boolean,
  excepcion text,
  derecho boolean,
  uso boolean,
  activo boolean,
  faltan text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  return query
    select m.clave, m.descripcion,
      exists (select 1 from public.negocio_plan np join public.plan_modulos pm on pm.plan_id = np.plan_id
              where np.negocio_id = p_negocio and pm.modulo = m.clave),
      (select case when e.permite then 'agregado' else 'quitado' end
       from public.excepciones_modulo e where e.negocio_id = p_negocio and e.modulo = m.clave),
      public.tiene_derecho(p_negocio, m.clave),
      public.uso_modulo(p_negocio, m.clave),
      public.modulo_activo_negocio(p_negocio, m.clave),
      coalesce(array(select d.requiere from public.modulo_dependencias d
                     where d.modulo = m.clave and d.tipo = 'requiere'
                       and not public.modulo_activo_negocio(p_negocio, d.requiere)), '{}')
    from public.modulos m
    order by m.clave;
end;
$$;

-- Sólo lectura: qué gana y qué pierde el kiosco si cambia de plan. 'pierde' con uso = true se apaga al confirmar.
create or replace function public.operador_previsualizar_plan(p_negocio uuid, p_plan_id uuid)
returns table (clave text, descripcion text, efecto text, uso boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.planes p where p.id = p_plan_id) then
    raise exception 'plan_desconocido' using errcode = 'P0001';
  end if;
  return query
    select m.clave, m.descripcion,
      case when public.derecho_con_plan(p_negocio, p_plan_id, m.clave) and not public.tiene_derecho(p_negocio, m.clave) then 'gana'
           when not public.derecho_con_plan(p_negocio, p_plan_id, m.clave) and public.tiene_derecho(p_negocio, m.clave) then 'pierde'
           else 'igual' end,
      public.uso_modulo(p_negocio, m.clave)
    from public.modulos m
    order by m.clave;
end;
$$;

-- Cambia el plan. Los módulos que pierden derecho se apagan en la misma operación, con historial.
create or replace function public.operador_fijar_plan(p_negocio uuid, p_plan_id uuid, p_motivo text, p_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_anterior text;
  v_plan_nuevo text;
  r record;
  v_apagados text[] := '{}';
begin
  perform public.exigir_operador();
  if p_plan_id is null or p_op_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.historial h where h.id = p_op_id) then
    if exists (select 1 from public.historial h where h.id = p_op_id and h.negocio_id = p_negocio) then
      return jsonb_build_object('ya_aplicada', true);
    end if;
    raise exception 'id_repetido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.planes p where p.id = p_plan_id and p.activo) then
    raise exception 'plan_desconocido' using errcode = 'P0001';
  end if;

  select p.codigo into v_plan_anterior from public.negocio_plan np join public.planes p on p.id = np.plan_id
  where np.negocio_id = p_negocio;
  select p.codigo into v_plan_nuevo from public.planes p where p.id = p_plan_id;

  for r in
    select m.clave from public.modulos m
    where public.tiene_derecho(p_negocio, m.clave) and not public.derecho_con_plan(p_negocio, p_plan_id, m.clave)
    order by m.clave
  loop
    -- Un módulo que otro módulo que sigue activo requiere no puede perder derecho.
    if exists (select 1 from public.modulo_dependencias d
               where d.requiere = r.clave and d.tipo = 'requiere'
                 and public.modulo_activo_negocio(p_negocio, d.modulo)
                 and public.derecho_con_plan(p_negocio, p_plan_id, d.modulo)) then
      raise exception 'modulo_requerido' using errcode = 'P0001', detail = r.clave;
    end if;
    if public.uso_modulo(p_negocio, r.clave) then
      insert into public.modulos_negocio (negocio_id, modulo, activo) values (p_negocio, r.clave, false)
      on conflict (negocio_id, modulo) do update set activo = false;
      insert into public.historial (negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
      values (p_negocio, 'cambio_modulo', auth.uid(), 'negocios', p_negocio,
        jsonb_build_object('modulo', r.clave, 'activo', true), jsonb_build_object('modulo', r.clave, 'activo', false),
        btrim(p_motivo));
      v_apagados := v_apagados || r.clave;
    end if;
  end loop;

  update public.negocio_plan set plan_id = p_plan_id, desde = now() where negocio_id = p_negocio;
  if not found then
    insert into public.negocio_plan (negocio_id, plan_id) values (p_negocio, p_plan_id);
  end if;
  insert into public.historial (id, negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
  values (p_op_id, p_negocio, 'cambio_plan', auth.uid(), 'negocios', p_negocio,
    jsonb_build_object('plan', v_plan_anterior), jsonb_build_object('plan', v_plan_nuevo), btrim(p_motivo));

  return jsonb_build_object('plan', v_plan_nuevo, 'apagados', to_jsonb(v_apagados));
end;
$$;

-- Da, quita o deja sin efecto un extra. p_permite null quita la excepción y vuelve al plan.
create or replace function public.operador_fijar_excepcion(p_negocio uuid, p_modulo text, p_permite boolean,
  p_motivo text, p_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permite_anterior boolean;
  v_derecho_antes boolean;
  v_derecho_despues boolean;
  v_uso_antes boolean;
begin
  perform public.exigir_operador();
  if p_modulo is null or p_op_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.historial h where h.id = p_op_id) then
    if exists (select 1 from public.historial h where h.id = p_op_id and h.negocio_id = p_negocio) then
      return jsonb_build_object('ya_aplicada', true);
    end if;
    raise exception 'id_repetido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo) then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;

  select e.permite into v_permite_anterior from public.excepciones_modulo e
  where e.negocio_id = p_negocio and e.modulo = p_modulo;
  v_derecho_antes := public.tiene_derecho(p_negocio, p_modulo);
  v_uso_antes := public.uso_modulo(p_negocio, p_modulo);

  if p_permite is null then
    delete from public.excepciones_modulo where negocio_id = p_negocio and modulo = p_modulo;
  else
    if p_permite and exists (select 1 from public.modulo_dependencias d
                             where d.modulo = p_modulo and d.tipo = 'requiere' and not public.tiene_derecho(p_negocio, d.requiere)) then
      raise exception 'dependencia_sin_derecho' using errcode = 'P0001',
        detail = (select string_agg(d.requiere, ', ') from public.modulo_dependencias d
                  where d.modulo = p_modulo and d.tipo = 'requiere' and not public.tiene_derecho(p_negocio, d.requiere));
    end if;
    insert into public.excepciones_modulo (negocio_id, modulo, permite, motivo)
    values (p_negocio, p_modulo, p_permite, btrim(p_motivo))
    on conflict (negocio_id, modulo) do update set permite = excluded.permite, motivo = excluded.motivo, creado = now();
  end if;

  v_derecho_despues := public.tiene_derecho(p_negocio, p_modulo);
  if v_derecho_antes and not v_derecho_despues then
    if exists (select 1 from public.modulo_dependencias d
               where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(p_negocio, d.modulo)) then
      raise exception 'modulo_requerido' using errcode = 'P0001',
        detail = (select string_agg(d.modulo, ', ') from public.modulo_dependencias d
                  where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(p_negocio, d.modulo));
    end if;
    if v_uso_antes then
      insert into public.modulos_negocio (negocio_id, modulo, activo) values (p_negocio, p_modulo, false)
      on conflict (negocio_id, modulo) do update set activo = false;
      insert into public.historial (negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
      values (p_negocio, 'cambio_modulo', auth.uid(), 'negocios', p_negocio,
        jsonb_build_object('modulo', p_modulo, 'activo', true), jsonb_build_object('modulo', p_modulo, 'activo', false),
        btrim(p_motivo));
    end if;
  end if;

  insert into public.historial (id, negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
  values (p_op_id, p_negocio, 'excepcion_modulo', auth.uid(), 'negocios', p_negocio,
    jsonb_build_object('modulo', p_modulo, 'permite', v_permite_anterior),
    jsonb_build_object('modulo', p_modulo, 'permite', p_permite), btrim(p_motivo));

  return jsonb_build_object('modulo', p_modulo, 'permite', p_permite, 'derecho', v_derecho_despues);
end;
$$;

-- Prende o apaga el uso de un módulo del kiosco. Requiere derecho y dependencias para prender.
create or replace function public.operador_fijar_uso(p_negocio uuid, p_modulo text, p_activo boolean,
  p_motivo text, p_op_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean;
begin
  perform public.exigir_operador();
  if p_modulo is null or p_activo is null or p_op_id is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.historial h where h.id = p_op_id) then
    if exists (select 1 from public.historial h where h.id = p_op_id and h.negocio_id = p_negocio) then
      return jsonb_build_object('modulo', p_modulo, 'activo', p_activo, 'ya_aplicada', true);
    end if;
    raise exception 'id_repetido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.modulos m where m.clave = p_modulo) then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;

  v_antes := public.uso_modulo(p_negocio, p_modulo);
  if p_activo then
    if not public.tiene_derecho(p_negocio, p_modulo) then
      raise exception 'sin_derecho' using errcode = 'P0001', detail = p_modulo;
    end if;
    if exists (select 1 from public.modulo_dependencias d
               where d.modulo = p_modulo and d.tipo = 'requiere' and not public.modulo_activo_negocio(p_negocio, d.requiere)) then
      raise exception 'dependencia_inactiva' using errcode = 'P0001',
        detail = (select string_agg(d.requiere, ', ') from public.modulo_dependencias d
                  where d.modulo = p_modulo and d.tipo = 'requiere' and not public.modulo_activo_negocio(p_negocio, d.requiere));
    end if;
  elsif exists (select 1 from public.modulo_dependencias d
                where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(p_negocio, d.modulo)) then
    raise exception 'modulo_requerido' using errcode = 'P0001',
      detail = (select string_agg(d.modulo, ', ') from public.modulo_dependencias d
                where d.requiere = p_modulo and d.tipo = 'requiere' and public.modulo_activo_negocio(p_negocio, d.modulo));
  end if;

  insert into public.modulos_negocio (negocio_id, modulo, activo) values (p_negocio, p_modulo, p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;
  insert into public.historial (id, negocio_id, tipo, operador_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo)
  values (p_op_id, p_negocio, 'cambio_modulo', auth.uid(), 'negocios', p_negocio,
    jsonb_build_object('modulo', p_modulo, 'activo', v_antes), jsonb_build_object('modulo', p_modulo, 'activo', p_activo),
    btrim(p_motivo));

  return jsonb_build_object('modulo', p_modulo, 'activo', p_activo);
end;
$$;

-- Ya no existen: los reemplazan cambiar_modulo y las funciones operador_*.
drop function if exists public.cambiar_modulo_kiosco(uuid, text, boolean, text);
drop function if exists public.modulos_de_kiosco(uuid);

-- Plan del kiosco dentro de la ficha.
create or replace function public.ficha_kiosco(p_negocio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_datos jsonb;
begin
  perform public.exigir_operador();
  v_datos := public.datos_del_kiosco(p_negocio);
  if v_datos is null then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'datos', v_datos,
    'plan', (select jsonb_build_object(
        'codigo', p.codigo,
        'nombre', p.nombre,
        'extras', (select count(*) from public.excepciones_modulo e where e.negocio_id = p_negocio and e.permite),
        'quitados', (select count(*) from public.excepciones_modulo e where e.negocio_id = p_negocio and not e.permite))
      from public.negocio_plan np join public.planes p on p.id = np.plan_id
      where np.negocio_id = p_negocio),
    'pcs', (select coalesce(jsonb_agg(jsonb_build_object(
        'prefijo', d.prefijo,
        'creado', d.creado,
        'turno_abierto', exists (select 1 from public.turnos t where t.dispositivo_id = d.id and t.cierre is null)
      ) order by char_length(d.prefijo), d.prefijo), '[]'::jsonb)
      from public.dispositivos d
      where d.negocio_id = p_negocio),
    'notas', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'texto', x.texto, 'creada', x.creada)
        order by x.creada desc), '[]'::jsonb)
      from public.notas_operador x
      where x.negocio_id = p_negocio),
    'recordatorios', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto,
        'vence_el', r.vence_el, 'hecho_en', r.hecho_en) order by r.hecho_en is not null, r.vence_el), '[]'::jsonb)
      from public.recordatorios_operador r
      where r.negocio_id = p_negocio)
  );
end;
$$;

-- El historial del operador suma los cambios de módulos, planes, extras y límite de fiado de cada kiosco.
create or replace function public.listar_historial_operador(
  p_negocio uuid default null,
  p_accion text default null,
  p_desde date default null,
  p_hasta date default null,
  p_limite integer default 100
)
returns table (
  id uuid,
  fecha timestamptz,
  negocio_id uuid,
  kiosco text,
  operador text,
  accion text,
  motivo text,
  valor_anterior jsonb,
  valor_nuevo jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  return query
    select x.id, x.fecha, x.negocio_id, x.kiosco, x.operador, x.accion, x.motivo, x.valor_anterior, x.valor_nuevo
    from (
      select h.id, h.fecha, h.negocio_id, n.nombre as kiosco, u.email::text as operador, h.accion, h.motivo,
        h.valor_anterior, h.valor_nuevo
      from public.historial_operador h
      join public.negocios n on n.id = h.negocio_id
      join auth.users u on u.id = h.operador_id
      union all
      select h.id, h.fecha, h.negocio_id, n.nombre, coalesce(u.email::text, 'Cuenta del kiosco'), h.tipo::text, h.motivo,
        h.valor_anterior, h.valor_nuevo
      from public.historial h
      join public.negocios n on n.id = h.negocio_id
      left join auth.users u on u.id = h.operador_id
      where h.tipo in ('cambio_modulo', 'cambio_plan', 'excepcion_modulo', 'cambio_limite_fiado')
    ) x
    where (p_negocio is null or x.negocio_id = p_negocio)
      and (p_accion is null or x.accion = p_accion)
      and (p_desde is null or x.fecha >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (p_hasta is null or x.fecha < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    order by x.fecha desc
    limit least(greatest(p_limite, 1), 500);
end;
$$;

-- Grants: sólo authenticated ejecuta lo que la app llama. Las funciones con negocio como parámetro, sin grant.
revoke all on function public.derecho_con_plan(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.tiene_derecho(uuid, text) from public, anon, authenticated;
revoke all on function public.uso_modulo(uuid, text) from public, anon, authenticated;
revoke all on function public.modulo_activo_negocio(uuid, text) from public, anon, authenticated;
revoke all on function public.asignar_plan_base() from public, anon, authenticated;
revoke all on function public.impedir_ciclo_dependencias() from public, anon, authenticated;

revoke all on function public.modulo_activo(text) from public, anon, authenticated;
grant execute on function public.modulo_activo(text) to authenticated;

revoke all on function public.mis_modulos() from public, anon, authenticated;
grant execute on function public.mis_modulos() to authenticated;
revoke all on function public.cambiar_modulo(text, boolean, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cambiar_modulo(text, boolean, uuid, uuid) to authenticated;

revoke all on function public.operador_listar_planes() from public, anon, authenticated;
grant execute on function public.operador_listar_planes() to authenticated;
revoke all on function public.operador_planes_kioscos() from public, anon, authenticated;
grant execute on function public.operador_planes_kioscos() to authenticated;
revoke all on function public.operador_modulos_kiosco(uuid) from public, anon, authenticated;
grant execute on function public.operador_modulos_kiosco(uuid) to authenticated;
revoke all on function public.operador_previsualizar_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.operador_previsualizar_plan(uuid, uuid) to authenticated;
revoke all on function public.operador_fijar_plan(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.operador_fijar_plan(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.operador_fijar_excepcion(uuid, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.operador_fijar_excepcion(uuid, text, boolean, text, uuid) to authenticated;
revoke all on function public.operador_fijar_uso(uuid, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.operador_fijar_uso(uuid, text, boolean, text, uuid) to authenticated;

revoke all on function public.ficha_kiosco(uuid) from public, anon, authenticated;
grant execute on function public.ficha_kiosco(uuid) to authenticated;
revoke all on function public.listar_historial_operador(uuid, text, date, date, integer) from public, anon, authenticated;
grant execute on function public.listar_historial_operador(uuid, text, date, date, integer) to authenticated;
