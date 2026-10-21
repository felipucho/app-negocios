-- Historial de productos (decisión 27, spec sección 4): alta, precio, nombre, activo y código.
-- Corre en cada insert o update de productos, venga de las funciones de la app o de Supabase Studio.
-- cuenta_id: auth.uid() sólo si es una cuenta de ese negocio. dispositivo_id: el que pasa la función
-- de la app en app.dispositivo_id, sólo si es una PC de ese negocio. Desde Studio quedan vacíos (V12).
-- Sin security definer: el que escribe es siempre el dueño de las funciones o Studio (postgres).
create or replace function public.registrar_historial_producto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cuenta uuid;
  v_dispositivo uuid;
  v_anterior jsonb := '{}'::jsonb;
  v_nuevo jsonb := '{}'::jsonb;
begin
  select c.usuario_id into v_cuenta from public.cuentas c
  where c.usuario_id = auth.uid() and c.negocio_id = new.negocio_id;

  select d.id into v_dispositivo from public.dispositivos d
  where d.id = nullif(current_setting('app.dispositivo_id', true), '')::uuid and d.negocio_id = new.negocio_id;

  if tg_op = 'INSERT' then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_nuevo)
    values (new.negocio_id, 'alta_producto', v_cuenta, v_dispositivo, 'productos', new.id,
            jsonb_build_object('nombre', new.nombre, 'precio', new.precio, 'codigo_barras', new.codigo_barras,
                               'activo', new.activo, 'creado_en_caja', new.creado_en_caja));
    return null;
  end if;

  if new.precio is distinct from old.precio then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo)
    values (new.negocio_id, 'cambio_precio', v_cuenta, v_dispositivo, 'productos', new.id,
            jsonb_build_object('precio', old.precio), jsonb_build_object('precio', new.precio));
  end if;

  if new.nombre is distinct from old.nombre then
    v_anterior := v_anterior || jsonb_build_object('nombre', old.nombre);
    v_nuevo := v_nuevo || jsonb_build_object('nombre', new.nombre);
  end if;
  if new.activo is distinct from old.activo then
    v_anterior := v_anterior || jsonb_build_object('activo', old.activo);
    v_nuevo := v_nuevo || jsonb_build_object('activo', new.activo);
  end if;
  if new.codigo_barras is distinct from old.codigo_barras then
    v_anterior := v_anterior || jsonb_build_object('codigo_barras', old.codigo_barras);
    v_nuevo := v_nuevo || jsonb_build_object('codigo_barras', new.codigo_barras);
  end if;

  if v_nuevo <> '{}'::jsonb then
    insert into public.historial (negocio_id, tipo, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo)
    values (new.negocio_id, 'cambio_producto', v_cuenta, v_dispositivo, 'productos', new.id, v_anterior, v_nuevo);
  end if;

  return null;
end;
$$;

create trigger productos_historial
  after insert or update on public.productos
  for each row execute function public.registrar_historial_producto();

revoke all on function public.registrar_historial_producto() from public, anon, authenticated;
