-- Esquema base de Venta y cobro.
-- Reglas: UUID en todas las entidades; negocio_id en todas las tablas del negocio; importes en pesos
-- enteros (integer); fechas de la base (now()); día operativo en America/Argentina/Buenos_Aires.
-- Las claves foráneas compuestas (x_id, negocio_id) impiden que una fila apunte a datos de otro negocio.

create type public.estado_abono as enum ('activo', 'gracia', 'suspendido');
create type public.rol_cuenta as enum ('caja', 'jefe');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'fiado');
create type public.tipo_historial as enum (
  'alta_producto', 'cambio_precio', 'cambio_producto', 'anulacion', 'apertura_turno', 'cierre_turno'
);

-- Estado del abono y catalogo_version: sólo aviso (decisión 19); catalogo_version la sube un trigger (tarea 7).
create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  estado_abono public.estado_abono not null default 'activo',
  catalogo_version bigint not null default 0 check (catalogo_version >= 0),
  creado timestamptz not null default now()
);

-- Dos cuentas por kiosco: caja (compartida del mostrador) y jefe (del dueño). Las crea Felipe.
-- Borrar el usuario de Auth falla si la cuenta ya operó (ventas, turnos, historial): es a propósito.
create table public.cuentas (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  negocio_id uuid not null references public.negocios (id),
  rol public.rol_cuenta not null,
  creado timestamptz not null default now(),
  unique (negocio_id, rol),
  unique (usuario_id, negocio_id)
);

create table public.config_negocio (
  negocio_id uuid primary key references public.negocios (id),
  nombre_visible text not null check (char_length(btrim(nombre_visible)) between 1 and 60),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  color_primario text not null default '#1f4e79' check (color_primario ~ '^#[0-9a-fA-F]{6}$')
);

-- Catálogo de módulos con su valor por defecto. En el MVP, sólo fiado (decisión 28).
create table public.modulos (
  clave text primary key check (clave ~ '^[a-z_]{1,30}$'),
  activo_por_defecto boolean not null
);
insert into public.modulos (clave, activo_por_defecto) values ('fiado', true);

-- Sin fila para un módulo = vale modulos.activo_por_defecto.
create table public.modulos_negocio (
  negocio_id uuid not null references public.negocios (id),
  modulo text not null references public.modulos (clave),
  activo boolean not null,
  primary key (negocio_id, modulo)
);

-- El id lo genera el navegador y vive en localStorage. El prefijo lo asigna registrar_dispositivo (tarea 8).
-- Después de Z (spec sección 14): AA..ZZ y AAA..ZZZ, como columnas de planilla (tarea 8).
create table public.dispositivos (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  prefijo text not null check (prefijo ~ '^[A-Z]{1,3}$'),
  ultimo_numero integer not null default 0 check (ultimo_numero >= 0),
  creado_por uuid not null,
  creado timestamptz not null default now(),
  unique (negocio_id, prefijo),
  unique (id, negocio_id),
  foreign key (creado_por, negocio_id) references public.cuentas (usuario_id, negocio_id)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  precio integer not null check (precio > 0),
  -- Con letras o sin ellas (decisión 33): ASCII imprimible, sin espacios.
  codigo_barras text check (codigo_barras ~ '^[!-~]{1,48}$'),
  activo boolean not null default true,
  creado_en_caja boolean not null default false,
  creado timestamptz not null default now(),
  unique (id, negocio_id)
);
create index productos_negocio_idx on public.productos (negocio_id);
-- Único por negocio, incluidos los inactivos: un inactivo escaneado se ofrece reactivar.
create unique index productos_codigo_unico on public.productos (negocio_id, codigo_barras)
  where codigo_barras is not null;

-- Datos personales de terceros (Ley 25.326): sólo nombre o alias y teléfono opcional.
-- Anonimizado = nombre 'Cliente suprimido', teléfono vacío; la fila y sus ventas quedan.
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 60),
  telefono text check (telefono is null or telefono ~ '^[0-9 +()-]{6,20}$'),
  suprimido boolean not null default false,
  creado timestamptz not null default now(),
  unique (id, negocio_id),
  check (not suprimido or (nombre = 'Cliente suprimido' and telefono is null))
);
create index clientes_negocio_idx on public.clientes (negocio_id);

-- Turno por PC (decisión 38), sin monto inicial. Abierto mientras cierre es null.
create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  apertura timestamptz not null default now(),
  cierre timestamptz,
  cierre_cuenta_id uuid,
  unique (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (cierre_cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  check (cierre is null or cierre >= apertura),
  check ((cierre is null) = (cierre_cuenta_id is null))
);
create unique index turnos_un_abierto_por_dispositivo on public.turnos (dispositivo_id)
  where cierre is null;
-- ultimo_turno_cerrado.
create index turnos_dispositivo_cierre_idx on public.turnos (dispositivo_id, cierre);

-- El id lo genera el navegador antes de confirmar y viaja igual en cada reintento del mismo contenido.
-- hash_contenido: sha256 en hex del contenido, lo calcula confirmar_venta (tarea 10).
create table public.ventas (
  id uuid primary key,
  negocio_id uuid not null references public.negocios (id),
  dispositivo_id uuid not null,
  cuenta_id uuid not null,
  turno_id uuid not null,
  numero integer not null check (numero > 0),
  fecha timestamptz not null default now(),
  total integer not null check (total > 0),
  hash_contenido text not null check (hash_contenido ~ '^[0-9a-f]{64}$'),
  unique (negocio_id, dispositivo_id, numero),
  unique (id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (turno_id, negocio_id) references public.turnos (id, negocio_id)
);
create index ventas_negocio_fecha_idx on public.ventas (negocio_id, fecha);
create index ventas_turno_idx on public.ventas (turno_id);

-- Precio congelado al confirmar (decisión 12).
create table public.lineas_venta (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null,
  producto_id uuid not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario integer not null check (precio_unitario > 0),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (producto_id, negocio_id) references public.productos (id, negocio_id)
);
create index lineas_venta_venta_idx on public.lineas_venta (venta_id);
create index lineas_venta_producto_idx on public.lineas_venta (producto_id);

-- importe = lo aplicado al total, no lo entregado. Suma de pagos = total. El vuelto no se guarda.
create table public.pagos_venta (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null,
  medio public.medio_pago not null,
  importe integer not null check (importe > 0),
  cliente_id uuid,
  check ((medio = 'fiado') = (cliente_id is not null)),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (cliente_id, negocio_id) references public.clientes (id, negocio_id)
);
create index pagos_venta_venta_idx on public.pagos_venta (venta_id);

-- La anulación es un movimiento nuevo: la venta no se toca. Una sola por venta.
-- La caja del día la resta el día de anulaciones.fecha (decisión 17).
-- turno_id: el turno abierto de la PC donde se anula; su cierre la resta (2026-10-22).
create table public.anulaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  venta_id uuid not null unique,
  cuenta_id uuid not null,
  dispositivo_id uuid not null,
  turno_id uuid not null,
  fecha timestamptz not null default now(),
  motivo text not null check (char_length(btrim(motivo)) between 3 and 200),
  foreign key (venta_id, negocio_id) references public.ventas (id, negocio_id),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id),
  foreign key (turno_id, negocio_id) references public.turnos (id, negocio_id)
);
create index anulaciones_negocio_fecha_idx on public.anulaciones (negocio_id, fecha);
create index anulaciones_turno_idx on public.anulaciones (turno_id);

-- Historial de auditoría: sólo se agrega. cuenta_id y dispositivo_id vacíos = cambio hecho fuera
-- de la app (Supabase Studio). Nunca guarda datos de clientes (la anonimización no deja rastro del nombre).
create table public.historial (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id),
  tipo public.tipo_historial not null,
  cuenta_id uuid,
  dispositivo_id uuid,
  fecha timestamptz not null default now(),
  entidad text not null check (entidad in ('productos', 'ventas', 'turnos')),
  entidad_id uuid not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  motivo text,
  check (tipo <> 'anulacion' or motivo is not null),
  foreign key (cuenta_id, negocio_id) references public.cuentas (usuario_id, negocio_id),
  foreign key (dispositivo_id, negocio_id) references public.dispositivos (id, negocio_id)
);
create index historial_negocio_fecha_idx on public.historial (negocio_id, fecha);

-- negocio_id del token (lo pone el Custom Access Token Hook). Null si no hay.
create or replace function public.negocio_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'negocio_id', '')::uuid
$$;

-- Rol de la cuenta que llama, leído de cuentas (no del token): un cambio aplica sin esperar
-- a que venza el token. Null si la cuenta no es de ese negocio.
create or replace function public.rol_actual()
returns public.rol_cuenta
language sql
stable
set search_path = ''
as $$
  select c.rol
  from public.cuentas c
  where c.usuario_id = auth.uid()
    and c.negocio_id = public.negocio_actual()
$$;

-- Día operativo del kiosco.
create or replace function public.dia_operativo(momento timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (momento at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.hoy()
returns date
language sql
stable
set search_path = ''
as $$
  select public.dia_operativo(now())
$$;

-- Nada de ventas se borra ni se edita; el historial tampoco (spec sección 4).
create or replace function public.impedir_cambios()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%: no se edita ni se borra', tg_table_name;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['ventas', 'lineas_venta', 'pagos_venta', 'anulaciones', 'historial'] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.impedir_cambios()',
      t || '_solo_agrega', t);
    execute format(
      'create trigger %I before truncate on public.%I for each statement execute function public.impedir_cambios()',
      t || '_sin_truncate', t);
  end loop;
end
$$;
