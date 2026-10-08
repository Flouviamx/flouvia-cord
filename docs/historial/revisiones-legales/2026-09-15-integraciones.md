# Revisión técnica de integraciones: HubSpot, Zapier, Make y Cord Workflows

Fecha de corte: **15 de septiembre de 2026**, rama `feat/plataforma-integraciones`.

Evidencia para revisión jurídica; no es una opinión legal ni autoriza publicar. No se
modificaron los cuatro artefactos legales publicados: el Aviso vigente conserva su
hash. Los cambios viven en borradores y en la revisión pendiente del Aviso.

## Hechos observados en código

| ID | Evidencia | Tratamiento |
|---|---|---|
| INT-01 | HubSpot se conecta con OAuth desde Ajustes › Integraciones. Tokens cifrados con `encryptRequiredSecret`; una cuenta de HubSpot sólo puede estar ligada a una organización. | Integración dirigida por el Cliente en subencargados, DPA y revisión del Aviso. |
| INT-02 | Salen a HubSpot: nombre de empresa, contacto, correo y teléfono del cliente; folio, cliente, monto, divisa y etapa de cotizaciones enviadas. Regresan nombre, contacto, correo y teléfono sólo de registros ya vinculados. Mover un Deal en HubSpot no cambia Cord. | Descrito en subencargados y en la revisión del Aviso (`dpa`). |
| INT-03 | Desconectar intenta revocar el refresh token, borra tokens y la cola pendiente. No borra datos en HubSpot. | Descrito en DPA y retención. |
| INT-04 | Cola `integracion_sync`: trabajos terminados o fallidos se borran a los 14 días por cron diario. Estados OAuth de 10 minutos. Vínculos de ids sin plazo propio. | Filas nuevas en retención; vínculos en "sin calendario". |
| INT-05 | Zapier y Make operan con llaves de API del Cliente; sus suscripciones de webhook tienen cupo propio de 100 por organización. | Integraciones dirigidas en subencargados y DPA. |
| INT-06 | Cord Workflows crea tareas, correo sólo a miembros activos o al dueño y Slack sólo a la URL de la organización. No escribe a clientes finales ni mueve dinero. | Descrito en subencargados. |
| INT-07 | `domain_events`, `workflow_runs` y vínculos no tienen purga; `api_idempotency` vence a 24 h pero sólo se borra al reutilizar la llave. | Declarado sin plazo inventado. |

`src/lib/legal-providers.ts` no se modificó: alimenta el Aviso publicado y su hash de
insumos (`sourceInputsSha256`). Renombrar la entrada `customer-integrations` para
nombrar HubSpot y las plataformas por API debe ir junto con la publicación de la
siguiente versión revisada del Aviso.

## Pendientes para asesoría

- Base legal y aviso a terceros cuando el Cliente sincroniza contactos de sus clientes con su CRM.
- Plazo de retención para `domain_events`, `workflow_runs`, vínculos de integración y llaves de idempotencia.
- Si la revisión del Aviso debe publicarse antes de activar HubSpot en producción o basta la cláusula vigente de integraciones configuradas por el Cliente.
