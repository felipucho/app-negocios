-- Panel de operador, fase 1 (spec 2026-10-28-panel-operador-avisos, §4 a §8.7).
-- Cada función llama exigir_operador(): es_operador() y, si la cuenta tiene un factor de MFA verificado,
-- sesión aal2. La app del kiosco no lee estas tablas: sólo las funciones de abajo.

create or replace function public.mfa_pendiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
    and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
$$;

create or replace function public.exigir_operador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_operador() then
    raise exception 'no_operador' using errcode = 'P0001';
  end if;
  if public.mfa_pendiente() then
    raise exception 'mfa_requerido' using errcode = 'P0001';
  end if;
end;
$$;

-- Datos comerciales y de contacto: sólo los ve el operador. La config visible (config_negocio) sí la lee el kiosco.
create table public.ficha_kiosco (
  negocio_id uuid primary key references public.negocios (id),
  cliente_desde date,
  etiquetas text[] not null default '{}' check (cardinality(etiquetas) <= 10),
  es_demo boolean not null default false,
  contacto_nombre text check (char_length(btrim(contacto_nombre)) between 1 and 80),
  contacto_telefono text check (char_length(btrim(contacto_telefono)) between 1 and 40),
  contacto_direccion text check (char_length(btrim(contacto_direccion)) between 1 and 120),
  actualizado timestamptz not null default now()
);

-- Notas internas y recordatorios del operador. Las notas se pueden borrar: tienen datos personales del dueño (P22).
create table public.notas_operador (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  operador_id uuid not null references public.operadores (usuario_id),
  texto text not null check (char_length(btrim(texto)) between 1 and 1000),
  creada timestamptz not null default now()
);
create index notas_operador_negocio_idx on public.notas_operador (negocio_id, creada);

create table public.recordatorios_operador (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  operador_id uuid not null references public.operadores (usuario_id),
  texto text not null check (char_length(btrim(texto)) between 1 and 200),
  vence_el date not null,
  hecho_en timestamptz,
  creado timestamptz not null default now()
);
create index recordatorios_operador_negocio_idx on public.recordatorios_operador (negocio_id, vence_el);

-- Historial del operador: sólo se agrega, como el del negocio. Nunca guarda el texto de una nota
-- ni el teléfono o la dirección de contacto.
create table public.historial_operador (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  operador_id uuid not null references public.operadores (usuario_id),
  fecha timestamptz not null default now(),
  accion text not null check (accion in ('alta_kiosco', 'datos_kiosco', 'modulo', 'nota_agregada', 'nota_borrada',
    'recordatorio_agregado', 'recordatorio_hecho')),
  motivo text check (char_length(btrim(motivo)) between 3 and 200),
  valor_anterior jsonb,
  valor_nuevo jsonb
);
create index historial_operador_negocio_fecha_idx on public.historial_operador (negocio_id, fecha);
create trigger historial_operador_solo_agrega before update or delete on public.historial_operador
  for each row execute function public.impedir_cambios();
create trigger historial_operador_sin_truncate before truncate on public.historial_operador
  for each statement execute function public.impedir_cambios();

alter table public.ficha_kiosco enable row level security;
alter table public.notas_operador enable row level security;
alter table public.recordatorios_operador enable row level security;
alter table public.historial_operador enable row level security;
revoke all on public.ficha_kiosco, public.notas_operador, public.recordatorios_operador, public.historial_operador
  from anon, authenticated;

-- Lo que se ve de un kiosco en la ficha. Interna: los datos de contacto salen sólo desde funciones de operador.
create or replace function public.datos_del_kiosco(p_negocio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'nombre_visible', coalesce(cfg.nombre_visible, n.nombre),
    'logo_url', cfg.logo_url,
    'color_primario', coalesce(cfg.color_primario, '#1f4e79'),
    'cliente_desde', coalesce(f.cliente_desde, public.dia_operativo(n.creado)),
    'es_demo', coalesce(f.es_demo, false),
    'etiquetas', to_jsonb(coalesce(f.etiquetas, '{}'::text[])),
    'contacto_nombre', f.contacto_nombre,
    'contacto_telefono', f.contacto_telefono,
    'contacto_direccion', f.contacto_direccion
  )
  from public.negocios n
  left join public.config_negocio cfg on cfg.negocio_id = n.id
  left join public.ficha_kiosco f on f.negocio_id = n.id
  where n.id = p_negocio
$$;

drop function if exists public.listar_kioscos();

-- Una fila por kiosco, con la actividad calculada en la base. Sin montos ni clientes (decisión 2).
create or replace function public.resumen_kioscos()
returns table (
  negocio_id uuid,
  nombre text,
  nombre_visible text,
  jefe_email text,
  caja_email text,
  creado timestamptz,
  cliente_desde date,
  es_demo boolean,
  etiquetas text[],
  pcs integer,
  modulos_activos integer,
  ventas_hoy integer,
  ventas_7d integer,
  ventas_30d integer,
  dias_con_ventas_30d integer,
  ultima_venta timestamptz,
  recordatorios_hoy integer,
  alta_este_mes boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy();
begin
  perform public.exigir_operador();
  return query
    with recientes as (
      select v.negocio_id, public.dia_operativo(v.fecha) as dia
      from public.ventas v
      where v.fecha >= ((v_hoy - 29)::timestamp at time zone 'America/Argentina/Buenos_Aires')
        and not exists (select 1 from public.anulaciones x where x.venta_id = v.id)
    ),
    actividad as (
      select r.negocio_id,
        count(*) filter (where r.dia = v_hoy)::integer as ventas_hoy,
        count(*) filter (where r.dia > v_hoy - 7)::integer as ventas_7d,
        count(*)::integer as ventas_30d,
        count(distinct r.dia)::integer as dias_con_ventas_30d
      from recientes r
      group by r.negocio_id
    )
    select
      n.id,
      n.nombre,
      coalesce(cfg.nombre_visible, n.nombre),
      (select u.email::text from public.cuentas c join auth.users u on u.id = c.usuario_id
        where c.negocio_id = n.id and c.rol = 'jefe'),
      (select u.email::text from public.cuentas c join auth.users u on u.id = c.usuario_id
        where c.negocio_id = n.id and c.rol = 'caja'),
      n.creado,
      coalesce(f.cliente_desde, public.dia_operativo(n.creado)),
      coalesce(f.es_demo, false),
      coalesce(f.etiquetas, '{}'::text[]),
      (select count(*)::integer from public.dispositivos d where d.negocio_id = n.id),
      (select count(*)::integer from public.modulos m
        left join public.modulos_negocio mn on mn.modulo = m.clave and mn.negocio_id = n.id
        where coalesce(mn.activo, m.activo_por_defecto)),
      coalesce(a.ventas_hoy, 0),
      coalesce(a.ventas_7d, 0),
      coalesce(a.ventas_30d, 0),
      coalesce(a.dias_con_ventas_30d, 0),
      (select max(v.fecha) from public.ventas v
        where v.negocio_id = n.id and not exists (select 1 from public.anulaciones x where x.venta_id = v.id)),
      (select count(*)::integer from public.recordatorios_operador r
        where r.negocio_id = n.id and r.hecho_en is null and r.vence_el <= v_hoy),
      public.dia_operativo(n.creado) >= date_trunc('month', v_hoy::timestamp)::date
    from public.negocios n
    left join public.config_negocio cfg on cfg.negocio_id = n.id
    left join public.ficha_kiosco f on f.negocio_id = n.id
    left join actividad a on a.negocio_id = n.id
    order by n.creado desc;
end;
$$;

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

create or replace function public.crear_kiosco(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.exigir_operador();
  if p_nombre is null or char_length(btrim(p_nombre)) not between 1 and 80 then
    raise exception 'nombre_invalido' using errcode = 'P0001';
  end if;
  insert into public.negocios (nombre) values (btrim(p_nombre)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vincular_cuenta(p_negocio uuid, p_usuario uuid, p_rol public.rol_cuenta)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  insert into public.cuentas (usuario_id, negocio_id, rol) values (p_usuario, p_negocio, p_rol);
end;
$$;

-- Último paso del alta: con las cuentas ya vinculadas, crea la configuración visible y deja historial.
create or replace function public.cerrar_alta_kiosco(p_negocio uuid, p_nombre_visible text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  perform public.exigir_operador();
  select n.nombre into v_nombre from public.negocios n where n.id = p_negocio;
  if not found then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_nombre_visible, ''))) > 60 then
    raise exception 'nombre_visible_invalido' using errcode = 'P0001';
  end if;
  -- Sin nombre visible, vale el de la cuenta recortado a 60.
  v_nombre := coalesce(nullif(btrim(p_nombre_visible), ''), left(v_nombre, 60));
  insert into public.config_negocio (negocio_id, nombre_visible) values (p_negocio, v_nombre);
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_nuevo)
  values (p_negocio, auth.uid(), 'alta_kiosco', 'Alta del kiosco', jsonb_build_object('nombre_visible', v_nombre));
end;
$$;

create or replace function public.modulos_de_kiosco(p_negocio uuid)
returns table (modulo text, descripcion text, activo boolean)
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
    select m.clave, m.descripcion, coalesce(mn.activo, m.activo_por_defecto)
    from public.modulos m
    left join public.modulos_negocio mn on mn.modulo = m.clave and mn.negocio_id = p_negocio
    order by m.clave;
end;
$$;

drop function if exists public.cambiar_modulo_kiosco(uuid, text, boolean);

create or replace function public.cambiar_modulo_kiosco(p_negocio uuid, p_modulo text, p_activo boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes boolean;
begin
  perform public.exigir_operador();
  if p_activo is null then
    raise exception 'pedido_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  select coalesce(mn.activo, m.activo_por_defecto) into v_antes
  from public.modulos m
  left join public.modulos_negocio mn on mn.modulo = m.clave and mn.negocio_id = p_negocio
  where m.clave = p_modulo;
  if not found then
    raise exception 'modulo_desconocido' using errcode = 'P0001';
  end if;
  insert into public.modulos_negocio (negocio_id, modulo, activo) values (p_negocio, p_modulo, p_activo)
  on conflict (negocio_id, modulo) do update set activo = excluded.activo;
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_anterior, valor_nuevo)
  values (p_negocio, auth.uid(), 'modulo', btrim(p_motivo),
    jsonb_build_object('modulo', p_modulo, 'activo', v_antes),
    jsonb_build_object('modulo', p_modulo, 'activo', p_activo));
end;
$$;

create or replace function public.guardar_datos_kiosco(
  p_negocio uuid,
  p_nombre_visible text,
  p_color_primario text,
  p_logo_url text,
  p_cliente_desde date,
  p_etiquetas text[],
  p_es_demo boolean,
  p_contacto_nombre text,
  p_contacto_telefono text,
  p_contacto_direccion text,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_etiquetas text[] := coalesce(p_etiquetas, '{}'::text[]);
  v_nombre_contacto text := nullif(btrim(p_contacto_nombre), '');
  v_telefono text := nullif(btrim(p_contacto_telefono), '');
  v_direccion text := nullif(btrim(p_contacto_direccion), '');
begin
  perform public.exigir_operador();
  v_antes := public.datos_del_kiosco(p_negocio);
  if v_antes is null then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) not between 3 and 200 then
    raise exception 'motivo_invalido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_nombre_visible, ''))) not between 1 and 60 then
    raise exception 'nombre_visible_invalido' using errcode = 'P0001';
  end if;
  if p_color_primario is null or p_color_primario !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'color_invalido' using errcode = 'P0001';
  end if;
  -- El logo tiene que ser un archivo de la carpeta de este kiosco en el bucket logos.
  if p_logo_url is not null and not (
    p_logo_url like 'https://%'
    and p_logo_url like ('%/storage/v1/object/public/logos/' || p_negocio::text || '/%')
    and p_logo_url ~* '\.(png|jpe?g|webp)$'
  ) then
    raise exception 'logo_invalido' using errcode = 'P0001';
  end if;
  if p_cliente_desde is null or p_cliente_desde > public.hoy() then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  if cardinality(v_etiquetas) > 10 or exists (
    select 1 from unnest(v_etiquetas) e where char_length(btrim(e)) not between 1 and 30
  ) then
    raise exception 'etiquetas_invalidas' using errcode = 'P0001';
  end if;
  if char_length(v_nombre_contacto) > 80 or char_length(v_telefono) > 40 or char_length(v_direccion) > 120 then
    raise exception 'contacto_invalido' using errcode = 'P0001';
  end if;

  insert into public.config_negocio (negocio_id, nombre_visible, logo_url, color_primario)
  values (p_negocio, btrim(p_nombre_visible), p_logo_url, p_color_primario)
  on conflict (negocio_id) do update set
    nombre_visible = excluded.nombre_visible,
    logo_url = excluded.logo_url,
    color_primario = excluded.color_primario;

  insert into public.ficha_kiosco (negocio_id, cliente_desde, etiquetas, es_demo,
    contacto_nombre, contacto_telefono, contacto_direccion)
  values (p_negocio, p_cliente_desde, array(select btrim(e) from unnest(v_etiquetas) e), coalesce(p_es_demo, false),
    v_nombre_contacto, v_telefono, v_direccion)
  on conflict (negocio_id) do update set
    cliente_desde = excluded.cliente_desde,
    etiquetas = excluded.etiquetas,
    es_demo = excluded.es_demo,
    contacto_nombre = excluded.contacto_nombre,
    contacto_telefono = excluded.contacto_telefono,
    contacto_direccion = excluded.contacto_direccion,
    actualizado = now();

  v_despues := public.datos_del_kiosco(p_negocio);
  insert into public.historial_operador (negocio_id, operador_id, accion, motivo, valor_anterior, valor_nuevo)
  values (p_negocio, auth.uid(), 'datos_kiosco', btrim(p_motivo),
    v_antes - 'contacto_nombre' - 'contacto_telefono' - 'contacto_direccion',
    v_despues - 'contacto_nombre' - 'contacto_telefono' - 'contacto_direccion');
end;
$$;

create or replace function public.agregar_nota(p_negocio uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_texto, ''))) not between 1 and 1000 then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;
  insert into public.notas_operador (negocio_id, operador_id, texto) values (p_negocio, auth.uid(), btrim(p_texto));
  insert into public.historial_operador (negocio_id, operador_id, accion) values (p_negocio, auth.uid(), 'nota_agregada');
end;
$$;

-- El historial guarda sólo la fecha de la nota, nunca su texto (P22).
create or replace function public.borrar_nota(p_nota uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota public.notas_operador;
begin
  perform public.exigir_operador();
  select * into v_nota from public.notas_operador where id = p_nota;
  if not found then
    raise exception 'nota_desconocida' using errcode = 'P0001';
  end if;
  delete from public.notas_operador where id = p_nota;
  insert into public.historial_operador (negocio_id, operador_id, accion, valor_anterior)
  values (v_nota.negocio_id, auth.uid(), 'nota_borrada', jsonb_build_object('creada', v_nota.creada));
end;
$$;

create or replace function public.agregar_recordatorio(p_negocio uuid, p_texto text, p_vence_el date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_operador();
  if not exists (select 1 from public.negocios n where n.id = p_negocio) then
    raise exception 'kiosco_desconocido' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_texto, ''))) not between 1 and 200 then
    raise exception 'texto_invalido' using errcode = 'P0001';
  end if;
  if p_vence_el is null then
    raise exception 'fecha_invalida' using errcode = 'P0001';
  end if;
  insert into public.recordatorios_operador (negocio_id, operador_id, texto, vence_el)
  values (p_negocio, auth.uid(), btrim(p_texto), p_vence_el);
  insert into public.historial_operador (negocio_id, operador_id, accion, valor_nuevo)
  values (p_negocio, auth.uid(), 'recordatorio_agregado', jsonb_build_object('vence_el', p_vence_el));
end;
$$;

create or replace function public.completar_recordatorio(p_recordatorio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid;
begin
  perform public.exigir_operador();
  select r.negocio_id into v_negocio from public.recordatorios_operador r where r.id = p_recordatorio;
  if not found then
    raise exception 'recordatorio_desconocido' using errcode = 'P0001';
  end if;
  update public.recordatorios_operador set hecho_en = now() where id = p_recordatorio and hecho_en is null;
  if found then
    insert into public.historial_operador (negocio_id, operador_id, accion)
    values (v_negocio, auth.uid(), 'recordatorio_hecho');
  end if;
end;
$$;

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
    select h.id, h.fecha, h.negocio_id, n.nombre, u.email::text, h.accion, h.motivo, h.valor_anterior, h.valor_nuevo
    from public.historial_operador h
    join public.negocios n on n.id = h.negocio_id
    join auth.users u on u.id = h.operador_id
    where (p_negocio is null or h.negocio_id = p_negocio)
      and (p_accion is null or h.accion = p_accion)
      and (p_desde is null or h.fecha >= (p_desde::timestamp at time zone 'America/Argentina/Buenos_Aires'))
      and (p_hasta is null or h.fecha < ((p_hasta + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'))
    order by h.fecha desc
    limit least(greatest(p_limite, 1), 500);
end;
$$;

-- Grants: sólo authenticated ejecuta lo que la app llama. exigir_operador y datos_del_kiosco quedan internas.
revoke all on function public.mfa_pendiente() from public, anon, authenticated;
grant execute on function public.mfa_pendiente() to authenticated;
revoke all on function public.exigir_operador() from public, anon, authenticated;
revoke all on function public.datos_del_kiosco(uuid) from public, anon, authenticated;

revoke all on function public.resumen_kioscos() from public, anon, authenticated;
grant execute on function public.resumen_kioscos() to authenticated;
revoke all on function public.ficha_kiosco(uuid) from public, anon, authenticated;
grant execute on function public.ficha_kiosco(uuid) to authenticated;
revoke all on function public.crear_kiosco(text) from public, anon, authenticated;
grant execute on function public.crear_kiosco(text) to authenticated;
revoke all on function public.vincular_cuenta(uuid, uuid, public.rol_cuenta) from public, anon, authenticated;
grant execute on function public.vincular_cuenta(uuid, uuid, public.rol_cuenta) to authenticated;
revoke all on function public.cerrar_alta_kiosco(uuid, text) from public, anon, authenticated;
grant execute on function public.cerrar_alta_kiosco(uuid, text) to authenticated;
revoke all on function public.modulos_de_kiosco(uuid) from public, anon, authenticated;
grant execute on function public.modulos_de_kiosco(uuid) to authenticated;
revoke all on function public.cambiar_modulo_kiosco(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.cambiar_modulo_kiosco(uuid, text, boolean, text) to authenticated;
revoke all on function public.guardar_datos_kiosco(uuid, text, text, text, date, text[], boolean, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.guardar_datos_kiosco(uuid, text, text, text, date, text[], boolean, text, text, text, text)
  to authenticated;
revoke all on function public.agregar_nota(uuid, text) from public, anon, authenticated;
grant execute on function public.agregar_nota(uuid, text) to authenticated;
revoke all on function public.borrar_nota(uuid) from public, anon, authenticated;
grant execute on function public.borrar_nota(uuid) to authenticated;
revoke all on function public.agregar_recordatorio(uuid, text, date) from public, anon, authenticated;
grant execute on function public.agregar_recordatorio(uuid, text, date) to authenticated;
revoke all on function public.completar_recordatorio(uuid) from public, anon, authenticated;
grant execute on function public.completar_recordatorio(uuid) to authenticated;
revoke all on function public.listar_historial_operador(uuid, text, date, date, integer) from public, anon, authenticated;
grant execute on function public.listar_historial_operador(uuid, text, date, date, integer) to authenticated;

-- Logos: el operador sube a la carpeta de un kiosco. Público para que la app del kiosco los muestre.
-- Las subidas tienen nombre nuevo, así que no hay política de update ni de delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 307200, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy logos_operador_sube on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.es_operador()
    and not public.mfa_pendiente()
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
