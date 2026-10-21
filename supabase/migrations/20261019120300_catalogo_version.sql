-- Cada cambio de catálogo sube negocios.catalogo_version (spec sección 3), también desde Studio.
-- Sin security definer: productos sólo se escribe desde funciones definer (dueño postgres) o desde Studio.
create or replace function public.subir_catalogo_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.negocios set catalogo_version = catalogo_version + 1
  where id in (old.negocio_id, new.negocio_id); -- los dos si un producto cambia de negocio
  return null;
end;
$$;

create trigger productos_catalogo_version
  after insert or update or delete on public.productos
  for each row execute function public.subir_catalogo_version();

-- En negocios: sube si cambió algo que no sea la versión (si ya la subió el trigger de productos, no suma otra).
-- Nunca baja: un cliente compara por igualdad y una versión vieja lo haría creerse al día.
create or replace function public.subir_version_por_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.catalogo_version < old.catalogo_version
     or (new.catalogo_version = old.catalogo_version
         and (to_jsonb(new) - 'catalogo_version') is distinct from (to_jsonb(old) - 'catalogo_version')) then
    new.catalogo_version := old.catalogo_version + 1;
  end if;
  return new;
end;
$$;

create trigger negocios_catalogo_version
  before update on public.negocios
  for each row execute function public.subir_version_por_negocio();

revoke all on function public.subir_catalogo_version(), public.subir_version_por_negocio()
  from public, anon, authenticated;
