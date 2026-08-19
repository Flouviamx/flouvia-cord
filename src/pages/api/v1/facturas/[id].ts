// /api/v1/facturas/[id] — detalle y ciclo de vida por API pública.
//   GET                                   → { data: {...} }
//   POST { action: 'finalize' | 'send' | 'void' | 'payment' | 'credit_note' }
//
// Emitir (finalize) consume medidor y es irreversible: por eso es una acción
// explícita y con scope de escritura, nunca un efecto secundario de crear.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { getFacturaDetalle } from '../../../../lib/queries';
import { finalizeInvoice, voidInvoice, createCreditNote } from '../../../../lib/fiscal/invoices';
import { applyPayment } from '../../../../lib/fiscal/payments';
import { notifyInvoiceIssued } from '../../../../lib/email';
import { ok, fail, invoiceDetail } from '../../../../lib/apiv1';
import { requireEntitlement } from '../../../../lib/org-entitlements';
import { cancelUsage, flushUsageReservation, reserveUsage } from '../../../../lib/billing';
import { dispatchInvoiceEvent } from '../../../../lib/webhooks';
import { invoicingFeatureFor, orgCountry } from '../../../../lib/fiscal/gate';
import { after } from '../../../../lib/after';

export const GET = withApiAuth('read', async ({ params }) => {
    const f = await getFacturaDetalle(String(params.id ?? ''));
    if (!f) return fail('Factura no encontrada', 'not_found', 404);
    return ok(invoiceDetail(f));
});

export const POST = withApiAuth('write', async ({ params, request }, auth) => {
    const id = String(params.id ?? '');
    let body: any;
    try { body = await request.json(); } catch { return fail('JSON inválido', 'invalid_json', 400); }
    const action = String(body.action ?? '').trim();

    const orgId = await getActiveOrgId();
    const f = await getFacturaDetalle(id);
    if (!f) return fail('Factura no encontrada', 'not_found', 404);

    if (action === 'finalize') {
        const denied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
        if (denied) return denied;

        // Misma coreografía de medidor que la app: reservar antes del
        // proveedor, cancelar si falla o si la respuesta fue idempotente.
        const isMexico = (await orgCountry(orgId)) === 'MX';
        let usageId: string | null = null;
        if (isMexico) {
            const usage = await reserveUsage(orgId, 'timbrado', 1);
            if (!usage.ok || !usage.id) {
                const unavailable = /verificar|registrar/i.test(usage.reason || '');
                return fail(usage.reason!, unavailable ? 'usage_verification_unavailable' : 'plan_limit_reached', unavailable ? 503 : 429);
            }
            usageId = usage.id;
        }
        const result = await finalizeInvoice(orgId, id);
        if (!result.emitted) {
            if (usageId) await cancelUsage(orgId, usageId);
            return fail(result.error || 'No se pudo emitir la factura', 'provider_error', 502);
        }
        if (usageId) {
            if (result.reused || result.billable === false) await cancelUsage(orgId, usageId);
            else void flushUsageReservation(orgId, usageId);
        }
        await logAudit(orgId, {
            accion: 'factura.emitida', entidad: 'factura', entidad_id: id,
            detalle: `${result.invoiceNumber} (vía API)`, ip: reqIp(request), actor: `api:${auth.keyId}`,
        });
        after(dispatchInvoiceEvent(orgId, id, 'invoice.finalized'));
        return ok({ id, numero: result.invoiceNumber, folio_fiscal: result.fiscalId ?? null });
    }

    if (action === 'send') {
        if (f.estado === 'draft') return fail('Emite la factura antes de enviarla', 'invalid_state', 409);
        if (!f.clienteEmail) return fail('El cliente no tiene correo registrado', 'invalid_state', 400);
        const sent = await notifyInvoiceIssued(orgId, id);
        if (!sent) return fail('No se pudo enviar el correo', 'send_failed', 502);
        after(dispatchInvoiceEvent(orgId, id, 'invoice.sent'));
        return ok({ id, enviada: true });
    }

    if (action === 'payment') {
        const result = await applyPayment(orgId, id, {
            monto: Number(body.monto),
            currency: String(body.moneda ?? body.currency ?? ''),
            metodo: String(body.metodo ?? 'manual').slice(0, 40),
            referencia: String(body.referencia ?? '').slice(0, 120) || null,
        });
        if (!result.ok) return fail(result.error!, 'invalid_request', 400);
        await logAudit(orgId, {
            accion: 'factura.pago_registrado', entidad: 'factura', entidad_id: id,
            detalle: `${body.monto} (vía API)`, ip: reqIp(request), actor: `api:${auth.keyId}`,
        });
        if (result.justPaid) after(dispatchInvoiceEvent(orgId, id, 'invoice.paid'));
        return ok({ id, pagado: result.amountPaid, saldo: result.amountRemaining, estado: result.lifecycle });
    }

    if (action === 'void') {
        const result = await voidInvoice(orgId, id, String(body.motivo ?? '').trim() || undefined);
        if (!result.ok) {
            // Código propio: el integrador necesita distinguir "estado inválido"
            // de "aquí va una nota de crédito" para poder encadenar la acción.
            return fail(result.error!, result.requiresCreditNote ? 'credit_note_required' : 'invalid_state', 409);
        }
        await logAudit(orgId, {
            accion: 'factura.anulada', entidad: 'factura', entidad_id: id,
            detalle: 'vía API', ip: reqIp(request), actor: `api:${auth.keyId}`,
        });
        after(dispatchInvoiceEvent(orgId, id, 'invoice.voided'));
        return ok({ id, estado: 'void' });
    }

    if (action === 'credit_note') {
        const denied = await requireEntitlement(orgId, await invoicingFeatureFor(orgId));
        if (denied) return denied;
        const result = await createCreditNote(orgId, id, {
            monto: body.monto !== undefined && body.monto !== '' ? Number(body.monto) : undefined,
            motivo: String(body.motivo ?? '').trim().slice(0, 200) || undefined,
        });
        if (!result.ok) return fail(result.error!, 'invalid_request', 400);
        await logAudit(orgId, {
            accion: 'factura.nota_credito', entidad: 'factura',
            entidad_id: result.documentId as string,
            detalle: `Nota de crédito de ${id} (vía API)`, ip: reqIp(request), actor: `api:${auth.keyId}`,
        });
        return ok({ id: result.documentId });
    }

    return fail('action no reconocida', 'invalid_request', 400);
});
