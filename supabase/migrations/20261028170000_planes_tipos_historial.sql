-- Tipos de historial de planes, módulos y límite de fiado (spec de planes 2026-10-28, sección Datos).
-- Va sola en su archivo: un valor nuevo de enum no se puede usar en la misma transacción que lo crea.

alter type public.tipo_historial add value if not exists 'cambio_modulo';
alter type public.tipo_historial add value if not exists 'cambio_plan';
alter type public.tipo_historial add value if not exists 'excepcion_modulo';
alter type public.tipo_historial add value if not exists 'plan_definido';
alter type public.tipo_historial add value if not exists 'cambio_limite_fiado';
