-- 2026-09-30: Cord Ops lee facturas, cobros, workflows, integraciones y la
-- actividad de las organizaciones (regla 30). Mismo contrato que `ops_payouts`:
-- una política PERMISIVA aparte, solo `for select` y solo con
-- `app.scope='ops'`, que únicamente enciende withOpsTx() tras validar la
-- sesión de operador. No amplía escritura: Ops observa estas filas, no las crea
-- ni las edita. Hoy el rol de conexión bypasea RLS; sin esto, las pantallas
-- nuevas de Ops quedarían en blanco el día que se active `cord_app`.
do $$
declare t text;
begin
  foreach t in array array[
    'documentos_fiscales', 'documento_pagos', 'cotizacion_cobros',
    'workflows', 'workflow_runs', 'integracion_conexiones', 'integracion_sync',
    'domain_events', 'api_requests', 'webhook_deliveries', 'external_usage_events', 'uso_periodo'
  ] loop
    continue when to_regclass(t) is null;
    execute format('drop policy if exists %I on %I', 'ops_' || t, t);
    execute format(
      'create policy %I on %I for select using (current_setting(''app.scope'', true) = ''ops'')',
      'ops_' || t, t);
  end loop;
end $$;
