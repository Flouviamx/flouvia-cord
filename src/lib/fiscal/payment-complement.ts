// Complemento de pago (CFDI tipo P, "REP") de un cobro sobre un CFDI PPD.
//
// Un CFDI de ingreso que no se pagó al emitirse se timbra PPD / 99 (ver
// `cfdiPaymentTerms` en invoices.ts), y la ley obliga a emitir un complemento
// de pago por cada cobro que se reciba después —a más tardar el día 5 del mes
// siguiente—. Antes Cord timbraba todo como PUE ("pagado en una sola
// exhibición") aunque la factura fuera a 30 días, y no existía el complemento.
//
// El estado de cada complemento vive en `provider_data.reps[<pago_id>]` del
// documento de ingreso: es el mismo documento al que el SAT lo relaciona, y no
// necesita una tabla ni una migración para empezar a funcionar.
//
// Contrato:
//   · Idempotente por pago: el claim es un `jsonb_set` condicionado a que ese
//     pago todavía no tenga complemento; la llave de idempotencia del PAC se
//     deriva del id del pago, así que un reintento devuelve el MISMO CFDI.
//   · Consume una reserva de timbrado como cualquier emisión (regla 17), y solo
//     se cobra lo que de verdad se timbró.
//   · Nunca lanza: el pago ya quedó registrado y es lo que no se puede perder.
//     Un complemento que no salió queda visible en el historial de la factura.

import { sql, withOrgTx } from '../db';
import { decryptSecret } from '../crypto-secret';
import { reserveUsage, cancelUsage, commitInvoiceUsage, flushUsageReservation } from '../billing';
import { MexicoSatProvider } from './providers/MexicoSatProvider';
import { logInvoiceEvent } from './timeline';
import { log } from '../log';
import type { FiscalParty } from './index';

/** c_FormaPago del SAT a partir del método con que Cord registró el cobro. */
export function satFormFor(metodo: unknown): string {
  switch (String(metodo || '').toLowerCase()) {
    case 'efectivo': return '01';
    case 'cheque': return '02';
    case 'tarjeta': case 'stripe': case 'mercadopago': return '04';
    case 'spei': case 'transferencia': return '03';
    default: return '99';
  }
}

type RepState = 'pending' | 'issued' | 'error' | 'manual';

async function setRep(orgId: string, documentoId: string, pagoId: string, state: Record<string, unknown>): Promise<void> {
  await withOrgTx(orgId, sql`
    update documentos_fiscales
       set provider_data = jsonb_set(
             jsonb_set(coalesce(provider_data, '{}'::jsonb), '{reps}', coalesce(provider_data->'reps', '{}'::jsonb), true),
             array['reps', ${pagoId}::text], ${JSON.stringify(state)}::jsonb, true),
           updated_at = now()
     where id = ${documentoId} and org_id = ${orgId}`);
}

export async function emitPaymentComplement(orgId: string, documentoId: string, pagoId: string): Promise<RepState | 'skipped'> {
  try {
    const [[row]] = await withOrgTx(orgId, sql`
      select d.country_code, d.document_type, d.status, d.lifecycle, d.currency, d.issued_at,
             d.provider_data, d.recipient_snapshot,
             p.monto, p.currency as pago_currency, p.metodo, p.referencia, p.aplicado_at,
             o.facturapi_live_key, o.facturapi_live_key_enc, o.sandbox_of
        from documentos_fiscales d
        join documento_pagos p on p.documento_id = d.id and p.org_id = d.org_id and p.id = ${pagoId}
        join orgs o on o.id = d.org_id
       where d.id = ${documentoId} and d.org_id = ${orgId}
       limit 1`);
    if (!row) return 'skipped';
    const data = (row.provider_data || {}) as Record<string, any>;
    // Solo un CFDI de ingreso real, timbrado PPD, lleva complemento. Los
    // documentos de prueba, simulados o anteriores a este contrato (sin
    // `payment_method`, que se emitían PUE) no.
    if (String(row.country_code).toUpperCase() !== 'MX' || row.document_type !== 'cfdi_40'
      || row.status !== 'issued' || row.sandbox_of || data.simulado === true
      || !data.facturapi_id || data.payment_method !== 'PPD') return 'skipped';
    if (data.reps?.[pagoId]?.status === 'issued' || data.reps?.[pagoId]?.status === 'pending') return 'skipped';

    const paidAt = row.aplicado_at instanceof Date ? row.aplicado_at : new Date(String(row.aplicado_at));
    const issuedAt = row.issued_at instanceof Date ? row.issued_at : new Date(String(row.issued_at));
    // Casos que el complemento automático NO cubre y que se dejan dichos, no
    // inventados: un cobro en otra divisa necesita el tipo de cambio oficial
    // del día del pago (Cord no lo tiene), y un cobro anterior a la factura es
    // un anticipo, que el SAT documenta con otro procedimiento.
    const reason = String(row.currency || 'MXN').toUpperCase() !== 'MXN'
      ? 'El cobro está en otra divisa: el complemento necesita el tipo de cambio oficial del día del pago. Emítelo con tu contador.'
      : (Number.isFinite(paidAt.getTime()) && Number.isFinite(issuedAt.getTime()) && paidAt.getTime() < issuedAt.getTime())
        ? 'El cobro es anterior a la factura (anticipo): se documenta con el procedimiento de anticipos del SAT, no con un complemento de pago.'
        : null;
    if (reason) {
      await setRep(orgId, documentoId, pagoId, { status: 'manual', reason, at: new Date().toISOString() });
      await logInvoiceEvent(orgId, documentoId, 'payment', `Complemento de pago no automático: ${reason}`);
      return 'manual';
    }

    // Claim: solo uno de dos procesos concurrentes timbra este pago.
    const [claimed] = await withOrgTx(orgId, sql`
      update documentos_fiscales
         set provider_data = jsonb_set(
               jsonb_set(coalesce(provider_data, '{}'::jsonb), '{reps}', coalesce(provider_data->'reps', '{}'::jsonb), true),
               array['reps', ${pagoId}::text], ${JSON.stringify({ status: 'pending', at: new Date().toISOString() })}::jsonb, true),
             updated_at = now()
       where id = ${documentoId} and org_id = ${orgId}
         and coalesce(provider_data->'reps'->${pagoId}->>'status', '') not in ('pending', 'issued')
       returning id`);
    if (!claimed.length) return 'skipped';

    const usage = await reserveUsage(orgId, 'timbrado', 1, { deferMeter: true });
    if (!usage.ok || !usage.id) {
      const error = usage.reason || 'No se pudo reservar la cuota de timbrado.';
      await setRep(orgId, documentoId, pagoId, { status: 'error', error, at: new Date().toISOString() });
      await logInvoiceEvent(orgId, documentoId, 'payment', `Complemento de pago pendiente: ${error}`);
      return 'error';
    }

    const providerKey = data.credential_scope === 'platform'
      ? undefined
      : (decryptSecret(row.facturapi_live_key_enc as string) || (row.facturapi_live_key as string) || undefined);
    const response = await new MexicoSatProvider().issuePaymentComplement({
      facturapiInvoiceId: String(data.facturapi_id),
      providerApiKey: providerKey,
      recipient: row.recipient_snapshot as FiscalParty,
      amount: Number(row.monto),
      paymentForm: satFormFor(row.metodo) === '99' ? '03' : satFormFor(row.metodo),
      paidAt: paidAt.toISOString(),
      reference: (row.referencia as string) || null,
      idempotencyKey: `rep:${documentoId}:${pagoId}:v1`,
      externalId: pagoId,
    });

    if (response.success) {
      await setRep(orgId, documentoId, pagoId, {
        status: 'issued', uuid: response.fiscalId ?? null, facturapi_id: response.documentId,
        at: new Date().toISOString(), ...(response.rawProviderData || {}),
      });
      if (response.rawProviderData?.livemode !== false) {
        await commitInvoiceUsage(orgId, usage.id);
        await flushUsageReservation(orgId, usage.id);
      } else {
        await cancelUsage(orgId, usage.id);
      }
      await logInvoiceEvent(orgId, documentoId, 'payment', `Complemento de pago emitido${response.fiscalId ? ` (${response.fiscalId})` : ''}`);
      return 'issued';
    }

    const uncertain = response.rawProviderData?.delivery_uncertain === true;
    if (!uncertain) await cancelUsage(orgId, usage.id);
    await setRep(orgId, documentoId, pagoId, {
      status: 'error', error: response.error || 'No se pudo emitir el complemento de pago.',
      retry_safe: true, at: new Date().toISOString(), ...(response.rawProviderData || {}),
    });
    await logInvoiceEvent(orgId, documentoId, 'payment', `Complemento de pago pendiente: ${response.error || 'escríbenos para reintentarlo'}`);
    return 'error';
  } catch (err) {
    log.error('el complemento de pago falló', { route: 'fiscal/payment-complement', orgId, err });
    return 'error';
  }
}

/**
 * Reintenta los complementos de pago que no salieron (o que nunca se pidieron)
 * de una factura PPD. Lo dispara el vendedor desde la factura; el claim de
 * `emitPaymentComplement` impide timbrar dos veces el mismo pago.
 */
export async function retryPaymentComplements(orgId: string, documentoId: string): Promise<{ intentados: number; emitidos: number }> {
  const [pagos] = await withOrgTx(orgId, sql`
    select p.id from documento_pagos p
     where p.documento_id = ${documentoId} and p.org_id = ${orgId}
     order by p.aplicado_at asc`);
  let emitidos = 0;
  for (const pago of pagos) {
    const result = await emitPaymentComplement(orgId, documentoId, String(pago.id));
    if (result === 'issued') emitidos++;
  }
  return { intentados: pagos.length, emitidos };
}
