-- Tareas con dueño, prioridad y recordatorio real (oct 2026).
-- Aditiva e idempotente: corre en cada build (scripts/migrate-tareas.mjs) ANTES
-- de que el código nuevo sirva tráfico, y su espejo vive en db/schema.sql.
--
-- Antes la tabla solo sabía título, fecha y `done`: nadie era responsable de
-- nada, una tarea completada no dejaba rastro de quién ni cuándo, y el widget
-- se llamaba "Tareas y recordatorios" sin que existiera un solo recordatorio.
alter table tareas add column if not exists notas text;
alter table tareas add column if not exists prioridad text not null default 'normal';
alter table tareas add column if not exists asignado_a uuid references users(id) on delete set null;
alter table tareas add column if not exists creado_por uuid references users(id) on delete set null;
alter table tareas add column if not exists completed_at timestamptz;
alter table tareas add column if not exists completed_by uuid references users(id) on delete set null;
-- Día civil (zona del negocio) del último correo de recordatorio que incluyó la
-- tarea. Es la dedup del cron: dos ejecuciones el mismo día no repiten correo.
alter table tareas add column if not exists recordada_el date;
alter table tareas drop constraint if exists tareas_prioridad_check;
alter table tareas add constraint tareas_prioridad_check check (prioridad in ('normal', 'alta'));
create index if not exists idx_tareas_asignado on tareas(org_id, asignado_a, due_date) where done = false;
create index if not exists idx_tareas_completadas on tareas(org_id, completed_at desc) where done = true;
