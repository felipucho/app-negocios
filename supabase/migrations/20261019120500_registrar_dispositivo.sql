-- Orden 1 = A, 26 = Z, 27 = AA, 703 = AAA (numeración biyectiva en base 26).
create or replace function public.prefijo_dispositivo(p_orden integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_resto integer := p_orden;
  v_prefijo text := '';
begin
  if p_orden is null or p_orden < 1 or p_orden > 18278 then
    raise exception 'prefijo_fuera_de_rango' using errcode = 'P0001';
  end if;
  while v_resto > 0 loop
    v_prefijo := chr(65 + (v_resto - 1) % 26) || v_prefijo;
    v_resto := (v_resto - 1) / 26;
  end loop;
  return v_prefijo;
end;
$$;

-- Alta automática de la PC (decisión 34). El id lo genera el navegador (localStorage).
create or replace function public.registrar_dispositivo(p_dispositivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_negocio uuid := public.negocio_actual();
  v_rol public.rol_cuenta := public.rol_actual();
  v_dispositivo public.dispositivos%rowtype;
  v_orden integer;
begin
  if v_rol is null then
    raise exception 'sin_cuenta' using errcode = 'P0001';
  end if;
  if p_dispositivo_id is null then
    raise exception 'dispositivo_desconocido' using errcode = 'P0001';
  end if;

  -- Serializa altas simultáneas del mismo kiosco: dos PCs nunca reciben el mismo prefijo.
  perform 1 from public.negocios n where n.id = v_negocio for no key update;

  select * into v_dispositivo from public.dispositivos d where d.id = p_dispositivo_id;
  if found then
    if v_dispositivo.negocio_id <> v_negocio then
      raise exception 'dispositivo_ajeno' using errcode = 'P0001';
    end if;
    return jsonb_build_object('dispositivo_id', v_dispositivo.id, 'prefijo', v_dispositivo.prefijo, 'nuevo', false);
  end if;

  -- count+1 choca si se borró una PC del medio: avanzar hasta el primer prefijo libre.
  select count(*) + 1 into v_orden from public.dispositivos d where d.negocio_id = v_negocio;
  while exists (select 1 from public.dispositivos d
                where d.negocio_id = v_negocio and d.prefijo = public.prefijo_dispositivo(v_orden)) loop
    v_orden := v_orden + 1;
  end loop;

  insert into public.dispositivos (id, negocio_id, prefijo, creado_por)
  values (p_dispositivo_id, v_negocio, public.prefijo_dispositivo(v_orden), auth.uid())
  returning * into v_dispositivo;

  return jsonb_build_object('dispositivo_id', v_dispositivo.id, 'prefijo', v_dispositivo.prefijo, 'nuevo', true);
end;
$$;

revoke all on function public.prefijo_dispositivo(integer) from public, anon, authenticated;
revoke all on function public.registrar_dispositivo(uuid) from public, anon, authenticated;
grant execute on function public.registrar_dispositivo(uuid) to authenticated;
