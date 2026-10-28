-- Módulos configurables (docs/superpowers/specs/2026-10-27-modulos-configurables.md). Felipe los prende por
-- negocio desde Studio (fila en modulos_negocio). Los nuevos vienen apagados: los kioscos existentes no cambian.
alter table public.modulos add column descripcion text;

update public.modulos set descripcion = 'Ventas fiadas a clientes, saldo por cliente, cobro de deuda y límite.'
where clave = 'fiado';

insert into public.modulos (clave, activo_por_defecto, descripcion) values
  ('precios', false, 'Costo, rubro y proveedor por producto; margen; aumento masivo de precios por porcentaje.'),
  ('movimientos_caja', false, 'Monto inicial, ingresos, retiros, gastos y pagos a proveedor; arqueo al cerrar el turno.'),
  ('stock', false, 'Stock por producto, ingreso de mercadería, ajustes, mínimos y faltantes. Avisa, nunca bloquea la venta.'),
  ('varios', false, 'Cobrar líneas sin producto cargado, con importe libre.');

alter table public.modulos alter column descripcion set not null;
