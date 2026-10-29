begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000a', 'operador-f@prueba.local'),
  ('f0000000-0000-0000-0000-00000000000b', 'caja-f@prueba.local');
insert into public.operadores (usuario_id) values ('f0000000-0000-0000-0000-00000000000a');
insert into public.negocios (id, nombre) values ('f0000000-0000-0000-0000-000000000000', 'Kiosco F');
insert into public.negocios (id, nombre) values ('f0000000-0000-0000-0000-0000000000a1', 'Kiosco alta');
insert into public.cuentas (usuario_id, negocio_id, rol) values
  ('f0000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000000', 'caja');

-- Como operador: datos, nota y recordatorio.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok($$ select public.guardar_datos_kiosco('f0000000-0000-0000-0000-000000000000', 'Visible F', '#1f4e79', null,
  public.hoy(), array['  rubro  '], true, 'Dueño F', '11 5555-0000', 'Calle 1', 'Prueba de la fase 1') $$,
  'el operador guarda los datos del kiosco con motivo');
select throws_ok($$ select public.guardar_datos_kiosco('f0000000-0000-0000-0000-000000000000', 'Visible F', '#1f4e79', null,
  public.hoy(), null, false, null, null, null, 'no') $$, 'P0001', 'motivo_invalido', 'sin motivo no se guarda nada');
select throws_ok($$ select public.guardar_datos_kiosco('f0000000-0000-0000-0000-000000000000', 'Visible F', '#1f4e79',
  'https://otro.test/storage/v1/object/public/logos/f0000000-0000-0000-0000-0000000000ff/logo.png',
  public.hoy(), null, false, null, null, null, 'Prueba de logo') $$, 'P0001', 'logo_invalido', 'un logo de otro kiosco se rechaza');
select lives_ok($$ select public.agregar_nota('f0000000-0000-0000-0000-000000000000', 'Llamar el lunes') $$,
  'el operador agrega una nota');
select lives_ok($$ select public.agregar_recordatorio('f0000000-0000-0000-0000-000000000000', 'Llamar', public.hoy()) $$,
  'el operador agrega un recordatorio');
select is(jsonb_array_length(public.ficha_kiosco('f0000000-0000-0000-0000-000000000000') -> 'notas'), 1,
  'la ficha muestra la nota');

-- El alta carga los datos del cliente y valida cada uno antes de escribir.
select lives_ok($$ select public.cerrar_alta_kiosco('f0000000-0000-0000-0000-0000000000a1', 'Alta visible', '#112233',
  public.hoy(), array['  rubro  ', 'zona norte'], true, 'Dueño alta', '11 5555-0101', 'Calle 2') $$,
  'el operador da de alta con color, etiquetas, demo y contacto');
select throws_ok($$ select public.cerrar_alta_kiosco('f0000000-0000-0000-0000-0000000000a1', null, '#zzzzzz',
  public.hoy(), null, false, null, null, null) $$, 'P0001', 'color_invalido', 'el color tiene que ser #RRGGBB');
select throws_ok($$ select public.cerrar_alta_kiosco('f0000000-0000-0000-0000-0000000000a1', null, '#112233',
  public.hoy() + 1, null, false, null, null, null) $$, 'P0001', 'fecha_invalida', 'cliente desde no puede ser futuro');
select throws_ok($$ select public.cerrar_alta_kiosco('f0000000-0000-0000-0000-0000000000a1', null, '#112233',
  public.hoy(), array(select 'e' || g from generate_series(1, 11) g), false, null, null, null) $$,
  'P0001', 'etiquetas_invalidas', 'hasta 10 etiquetas');
select throws_ok($$ select public.cerrar_alta_kiosco('f0000000-0000-0000-0000-0000000000a1', null, '#112233',
  public.hoy(), null, false, repeat('x', 81), null, null) $$, 'P0001', 'contacto_invalido', 'el contacto tiene largo máximo');

-- La caja no ve la ficha.
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.ficha_kiosco('f0000000-0000-0000-0000-000000000000') $$, 'P0001', 'no_operador',
  'la caja no ve la ficha');

-- Como dueño de la base: el historial sólo se agrega y no guarda el texto de la nota.
reset role;
select throws_ok($$ update public.historial_operador set motivo = 'editado' $$, 'P0001',
  'historial_operador: no se edita ni se borra', 'el historial del operador no se edita');
select is((select count(*)::integer from public.historial_operador where accion = 'nota_agregada'), 1,
  'agregar una nota deja historial');
select ok(not exists (select 1 from public.historial_operador
    where valor_anterior::text like '%Llamar el lunes%' or valor_nuevo::text like '%Llamar el lunes%'),
  'el historial no guarda el texto de la nota');
select is((select cardinality(etiquetas) from public.ficha_kiosco where negocio_id = 'f0000000-0000-0000-0000-0000000000a1'), 2,
  'el alta guarda las etiquetas sin espacios');
select is((select count(*)::integer from public.historial_operador
    where negocio_id = 'f0000000-0000-0000-0000-0000000000a1' and accion = 'alta_kiosco'), 1,
  'el alta deja historial');
select ok(not exists (select 1 from public.historial_operador
    where negocio_id = 'f0000000-0000-0000-0000-0000000000a1' and valor_nuevo::text like '%11 5555-0101%'),
  'el historial del alta no guarda el teléfono del dueño');

select * from finish();
rollback;
