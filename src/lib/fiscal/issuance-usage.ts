import { randomUUID } from 'node:crypto';
import { sql, withOrgTx } from '../db';
import { reserveUsage, cancelUsage, flushUsageReservation, commitInvoiceUsage } from '../billing';
import type { EmitResult } from './emit';
import { documentTypeFor, isFiscalDocument } from './document-kind';

/** Un documento, una reserva, todos los países. Un intento incierto se conserva
 * para revisión; nunca se libera por tiempo ni se vuelve a emitir a ciegas.
 */
export async function meterInvoiceEmission(
  orgId: string, documentId: string, emit: () => Promise<EmitResult>,
): Promise<EmitResult> {
  const fail = (error: string, httpStatus = 409): EmitResult => ({ emitted: false, status: 'error', documentId, error, httpStatus });
  const [[existing]] = await withOrgTx(orgId, sql`
    select status, document_type, country_code, provider
      from documentos_fiscales where id = ${documentId} and org_id = ${orgId} limit 1`);
  if (!existing) return fail('Factura no encontrada.');
  // La lectura de un documento emitido no necesita cupo ni plan fiscal vigente.
  if (existing.status === 'issued') return emit();

  const claimId = randomUUID();
  const [[claimed]] = await withOrgTx(orgId, sql`
    update documentos_fiscales
       set provider_data = coalesce(provider_data, '{}'::jsonb) ||
           jsonb_build_object('cord_issuance', jsonb_build_object('claim_id', ${claimId}::text)), updated_at = now()
     where id = ${documentId} and org_id = ${orgId} and lifecycle = 'draft' and status in ('pending', 'error')
       and provider_data->'cord_issuance' is null
       and coalesce(provider_data->>'delivery_uncertain', 'false') <> 'true'
     returning id`);
  if (!claimed) return fail('La emisión está en proceso o necesita confirmar su resultado. Consulta el documento antes de reintentar.');

  const release = () => withOrgTx(orgId, sql`
    update documentos_fiscales set provider_data = provider_data - 'cord_issuance', updated_at = now()
     where id = ${documentId} and org_id = ${orgId} and provider_data->'cord_issuance'->>'claim_id' = ${claimId}`);
  const country = String(existing.country_code || 'MX').toUpperCase();
  const docType = String(existing.document_type || documentTypeFor(country));
  const fiscal = isFiscalDocument(docType, country, String(existing.provider ?? ''));
  const usage = fiscal
    ? await reserveUsage(orgId, 'timbrado', 1, { deferMeter: true })
    : await reserveUsage(orgId, 'documento', 1);
  if (!usage.ok || !usage.id) { await release(); return fail(usage.reason || 'No se pudo reservar la cuota de facturación.', /límite/.test(usage.reason || '') ? 429 : 503); }
  await withOrgTx(orgId, sql`
    update documentos_fiscales set provider_data = jsonb_set(provider_data, '{cord_issuance,usage_id}', to_jsonb(${usage.id}::text))
     where id = ${documentId} and org_id = ${orgId} and provider_data->'cord_issuance'->>'claim_id' = ${claimId}`);

  // Si emit() lanza, conservamos claim y reserva: puede haber un documento real
  // en el proveedor cuyo resultado local no se alcanzó a guardar.
  const result = await emit();
  const [[doc]] = await withOrgTx(orgId, sql`
    select provider_data from documentos_fiscales where id = ${documentId} and org_id = ${orgId} limit 1`);
  const data = doc?.provider_data || {};
  if (!result.emitted || result.reused || data.simulado === true || data.livemode === false) {
    if (data.delivery_uncertain !== true && await cancelUsage(orgId, usage.id)) await release();
    return result;
  }
  if (!fiscal) return result;
  // El cron solo puede cobrar un excedente después de la emisión confirmada.
  await commitInvoiceUsage(orgId, usage.id);
  await flushUsageReservation(orgId, usage.id);
  return result;
}
