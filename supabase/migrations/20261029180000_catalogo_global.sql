-- Catálogo global de productos, alimentado por el runner de SEPA con service_role.
-- publicar_catalogo es todo-o-nada: ante cualquier regla que falle, el catálogo queda como estaba.

-- Dato público: la app lo lee; sólo el runner escribe.
-- ean canónico: 8 dígitos, o 13 con a lo sumo 4 ceros adelante (con 5 sería un EAN-8 sin canonizar) y sin prefijos restringidos.
create table public.catalogo_global (
  ean text primary key check (ean ~ '^[13-9][0-9]{7}$' or (ean ~ '^[0-9]{13}$' and ean !~ '^(2|02|04|00000)')),
  nombre text not null check (nombre = btrim(nombre) and char_length(nombre) between 1 and 80
    and nombre !~ E'[[:cntrl:]\u200b-\u200f\u202a-\u202e\u2066-\u2069]'),
  marca text check (marca is null or (marca = btrim(marca) and char_length(marca) between 1 and 80
    and marca !~ E'[[:cntrl:]\u200b-\u200f\u202a-\u202e\u2066-\u2069]')),
  cantidad numeric check (cantidad is null or (cantidad > 0 and cantidad <= 100000)),
  unidad text check (unidad is null or unidad in ('ml', 'g', 'un')),
  comercios smallint not null check (comercios >= 1),
  apariciones integer not null check (apariciones >= 1),
  primera_vez date not null,
  visto date not null,
  check ((cantidad is null) = (unidad is null))
);

comment on table public.catalogo_global is 'Fuente: SEPA - Secretaría de Comercio (CC BY 4.0), datos normalizados (nombres unificados, unidades convertidas a ml/g/un). Hay que atribuir.';

create table public.catalogo_importaciones (
  id uuid primary key default gen_random_uuid(),
  fuente text not null default 'sepa',
  iniciada timestamptz not null default now(),
  terminada timestamptz,
  estado text not null default 'corriendo' check (estado in ('corriendo', 'publicada', 'rechazada', 'error')),
  fecha_fuente date not null,
  url text,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  motivo text,
  metricas jsonb not null default '{}'
);
-- Un advisory lock no sirve entre requests HTTP: la exclusion de corridas la da este índice.
create unique index catalogo_importaciones_una_corriendo on public.catalogo_importaciones (fuente) where estado = 'corriendo';
create index catalogo_importaciones_publicadas on public.catalogo_importaciones (fuente, fecha_fuente desc) where estado = 'publicada';

-- UNLOGGED: es una escala descartable; si cae la base, la corrida se repite desde cero.
create unlogged table public.catalogo_global_staging (
  importacion_id uuid not null references public.catalogo_importaciones (id) on delete cascade,
  ean text not null check (ean ~ '^[13-9][0-9]{7}$' or (ean ~ '^[0-9]{13}$' and ean !~ '^(2|02|04|00000)')),
  nombre text not null check (nombre = btrim(nombre) and char_length(nombre) between 1 and 80
    and nombre !~ E'[[:cntrl:]\u200b-\u200f\u202a-\u202e\u2066-\u2069]'),
  marca text check (marca is null or (marca = btrim(marca) and char_length(marca) between 1 and 80
    and marca !~ E'[[:cntrl:]\u200b-\u200f\u202a-\u202e\u2066-\u2069]')),
  cantidad numeric check (cantidad is null or (cantidad > 0 and cantidad <= 100000)),
  unidad text check (unidad is null or unidad in ('ml', 'g', 'un')),
  comercios smallint not null check (comercios >= 1),
  apariciones integer not null check (apariciones >= 1),
  primary key (importacion_id, ean),
  check ((cantidad is null) = (unidad is null))
);

alter table public.catalogo_global enable row level security;
revoke all on table public.catalogo_global from public, anon, authenticated;
grant select on table public.catalogo_global to authenticated;
grant all on table public.catalogo_global to service_role;
create policy catalogo_global_select on public.catalogo_global
  for select to authenticated using (true);

alter table public.catalogo_importaciones enable row level security;
revoke all on table public.catalogo_importaciones from public, anon, authenticated;
grant all on table public.catalogo_importaciones to service_role;

alter table public.catalogo_global_staging enable row level security;
revoke all on table public.catalogo_global_staging from public, anon, authenticated;
grant all on table public.catalogo_global_staging to service_role;

-- Un rechazo por regla (P0001) deja catalogo_global intacto y la importación en 'rechazada'; un fallo
-- inesperado la deja en 'error'.
create or replace function public.publicar_catalogo(p_importacion_id uuid, p_filas integer, p_metricas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Primer arranque: el catálogo entero de la fuente, no un pedazo.
  c_min_ean_primera constant integer := 50000;
  -- Ninguna corrida puede achicar el catálogo más de un 30 % de golpe.
  c_factor_caida constant numeric := 0.7;
  c_min_comercios constant integer := 10;
  -- Con pocos EAN en común, el porcentaje de nombres cambiados no dice nada.
  c_min_comunes_nombres constant integer := 1000;
  -- Más de la mitad de los nombres cambiados en un paso es error de normalización, no cambio real.
  c_tope_cambio_nombres constant numeric := 0.5;
  v_imp public.catalogo_importaciones%rowtype;
  v_prev public.catalogo_importaciones%rowtype;
  v_hay_prev boolean;
  v_prev_comercios integer;
  v_prev_ean integer;
  v_comercios integer;
  v_minimo_ean numeric;
  v_en_staging integer;
  v_comunes integer;
  v_cambian integer;
  v_nuevos integer;
  v_actualizados integer;
begin
  select * into v_imp from public.catalogo_importaciones where id = p_importacion_id for update;
  if not found or v_imp.estado <> 'corriendo' then
    raise exception 'importacion_invalida' using errcode = 'P0001';
  end if;

  -- Staging de corridas muertas: nunca se mezcla con esta importación.
  delete from public.catalogo_global_staging where importacion_id <> p_importacion_id;

  begin
    select * into v_prev from public.catalogo_importaciones
    where fuente = v_imp.fuente and estado = 'publicada'
    order by fecha_fuente desc limit 1;
    v_hay_prev := found;
    if v_hay_prev then
      v_prev_comercios := (v_prev.metricas ->> 'comercios_ok')::integer;
      v_prev_ean := (v_prev.metricas ->> 'ean_distintos')::integer;
    end if;
    v_comercios := coalesce((p_metricas ->> 'comercios_ok')::integer, 0);

    select count(*) into v_en_staging from public.catalogo_global_staging where importacion_id = p_importacion_id;
    if not (coalesce(p_filas, 0) > 0 and v_en_staging = p_filas) then
      raise exception 'staging_incompleto' using errcode = 'P0001';
    end if;

    -- Una fecha adelantada publicada una vez dejaría "sin novedad" a todas las corridas siguientes.
    if v_imp.fecha_fuente > (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1 then
      raise exception 'fecha_futura' using errcode = 'P0001';
    end if;

    if v_hay_prev and v_imp.fecha_fuente <= v_prev.fecha_fuente then
      raise exception 'fecha_no_avanza' using errcode = 'P0001';
    end if;

    -- Sin métrica en la corrida anterior no hay contra qué comparar: rechaza (coalesce a false).
    if v_comercios < c_min_comercios
       or (v_hay_prev and not coalesce(v_comercios >= c_factor_caida * v_prev_comercios, false)) then
      raise exception 'pocos_comercios' using errcode = 'P0001';
    end if;

    if v_hay_prev then
      v_minimo_ean := c_factor_caida * v_prev_ean;
    else
      v_minimo_ean := c_min_ean_primera;
    end if;
    if not coalesce(p_filas >= v_minimo_ean, false) then
      raise exception 'caida_ean' using errcode = 'P0001';
    end if;

    select count(*), count(*) filter (where g.nombre <> s.nombre)
    into v_comunes, v_cambian
    from public.catalogo_global_staging s
    join public.catalogo_global g on g.ean = s.ean
    where s.importacion_id = p_importacion_id;
    if v_comunes >= c_min_comunes_nombres and v_cambian > c_tope_cambio_nombres * v_comunes then
      raise exception 'cambio_masivo_nombres' using errcode = 'P0001';
    end if;

    -- primera_vez no se toca en el conflicto y ninguna fila del catálogo se borra.
    with up as (
      insert into public.catalogo_global as g
        (ean, nombre, marca, cantidad, unidad, comercios, apariciones, primera_vez, visto)
      select s.ean, s.nombre, s.marca, s.cantidad, s.unidad, s.comercios, s.apariciones,
             v_imp.fecha_fuente, v_imp.fecha_fuente
      from public.catalogo_global_staging s
      where s.importacion_id = p_importacion_id
      on conflict (ean) do update set
        nombre = excluded.nombre,
        -- Un dato conocido no se pierde porque hoy lo informe sólo una cadena que no lo trae; la presentación va en par.
        marca = coalesce(excluded.marca, g.marca),
        cantidad = case when excluded.unidad is null then g.cantidad else excluded.cantidad end,
        unidad = coalesce(excluded.unidad, g.unidad),
        comercios = excluded.comercios,
        apariciones = excluded.apariciones,
        visto = excluded.visto
      returning (xmax = 0) as nuevo
    )
    select count(*) filter (where nuevo), count(*) filter (where not nuevo)
    into v_nuevos, v_actualizados
    from up;

    delete from public.catalogo_global_staging where importacion_id = p_importacion_id;
    update public.catalogo_importaciones
    set estado = 'publicada', terminada = now(),
        metricas = coalesce(p_metricas, '{}'::jsonb)
          || jsonb_build_object('nuevos', v_nuevos, 'actualizados', v_actualizados)
    where id = p_importacion_id;
    return jsonb_build_object('estado', 'publicada', 'nuevos', v_nuevos,
                              'actualizados', v_actualizados, 'ean', p_filas);
  exception
    when sqlstate 'P0001' then
      delete from public.catalogo_global_staging where importacion_id = p_importacion_id;
      update public.catalogo_importaciones
      set estado = 'rechazada', terminada = now(), motivo = sqlerrm,
          metricas = coalesce(p_metricas, '{}'::jsonb)
      where id = p_importacion_id;
      return jsonb_build_object('estado', 'rechazada', 'motivo', sqlerrm);
    when others then
      delete from public.catalogo_global_staging where importacion_id = p_importacion_id;
      update public.catalogo_importaciones
      set estado = 'error', terminada = now(), motivo = sqlstate || ' ' || sqlerrm,
          metricas = coalesce(p_metricas, '{}'::jsonb)
      where id = p_importacion_id;
      return jsonb_build_object('estado', 'error', 'motivo', sqlstate || ' ' || sqlerrm);
  end;
end;
$$;

revoke all on function public.publicar_catalogo(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.publicar_catalogo(uuid, integer, jsonb) to service_role;
