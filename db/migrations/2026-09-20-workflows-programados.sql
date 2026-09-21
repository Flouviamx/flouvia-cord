-- Disparador programado, paso de consulta y espera condicionada en Cord Workflows.
--
-- `workflows.next_run_at`: cuándo toca el siguiente tic de un workflow con
-- disparador programado. Lo calcula la publicación y lo AVANZA el cron ANTES de
-- emitir (mismo criterio que la recurrencia de facturas, regla 25: al revés, un
-- fallo a medio camino deja el tic elegible otra vez y el equipo recibe dos).
alter table workflows add column if not exists next_run_at timestamptz;
create index if not exists idx_workflows_programados on workflows(next_run_at)
  where estado = 'active' and next_run_at is not null;

-- `workflow_runs.datos`: valores que PRODUCE la ejecución (resultados de un paso
-- de consulta, vencimiento de una espera condicionada). Van en su propia columna
-- y no en el cursor: el cursor es la posición y se reescribe en cada paso.
alter table workflow_runs add column if not exists datos jsonb not null default '{}'::jsonb;
