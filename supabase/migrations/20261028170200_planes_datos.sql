-- Datos de planes (spec de planes 2026-10-28, sección Migración de kioscos existentes).
-- Los planes son provisorios: Felipe define su contenido. Ningún uso cambia: cada kiosco recibe un
-- extra por cada módulo que ya tenía prendido y que el plan base no incluye.

insert into public.planes (id, codigo, nombre, descripcion, activo) values
  ('5b1e0c2a-7d3f-4a10-9c11-000000000001', 'base', 'Básico', 'Plan provisorio: sólo fiado. Felipe define el contenido.', true),
  ('5b1e0c2a-7d3f-4a10-9c11-000000000002', 'completo', 'Completo', 'Plan provisorio con todos los módulos. Felipe define el contenido.', true);

insert into public.plan_modulos (plan_id, modulo)
select p.id, m.clave from public.planes p cross join public.modulos m
where p.codigo = 'completo' or (p.codigo = 'base' and m.clave = 'fiado');

insert into public.negocio_plan (negocio_id, plan_id)
select n.id, p.id from public.negocios n cross join public.planes p
where p.codigo = 'base';

insert into public.excepciones_modulo (negocio_id, modulo, permite, motivo)
select n.id, m.clave, true, 'migración 2026-10-28'
from public.negocios n
cross join public.modulos m
left join public.modulos_negocio mn on mn.negocio_id = n.id and mn.modulo = m.clave
where coalesce(mn.activo, m.activo_por_defecto, false)
  and m.clave not in (select pm.modulo from public.plan_modulos pm join public.planes p on p.id = pm.plan_id
                      where p.codigo = 'base');

insert into public.historial (negocio_id, tipo, entidad, entidad_id, valor_nuevo, motivo)
select n.id, 'cambio_plan', 'negocios', n.id, jsonb_build_object('plan', 'base'), 'migración'
from public.negocios n;

-- Guardia de equivalencia: el activo de cada (kiosco, módulo) tiene que ser el mismo que tenía antes
-- (uso con el defecto del catálogo, sin plan ni derecho). Si no coincide, la migración no se confirma.
do $$
declare
  r record;
  v_despues boolean;
begin
  if exists (select 1 from public.negocios n where not exists (
      select 1 from public.negocio_plan np where np.negocio_id = n.id)) then
    raise exception 'equivalencia_rota: kiosco sin plan';
  end if;
  for r in
    select n.id as negocio, m.clave as modulo,
      coalesce(mn.activo, m.activo_por_defecto, false) as antes
    from public.negocios n
    cross join public.modulos m
    left join public.modulos_negocio mn on mn.negocio_id = n.id and mn.modulo = m.clave
  loop
    v_despues := public.modulo_activo_negocio(r.negocio, r.modulo);
    if v_despues is distinct from r.antes then
      raise exception 'equivalencia_rota: kiosco % modulo % antes % despues %', r.negocio, r.modulo, r.antes, v_despues;
    end if;
  end loop;
end;
$$;
