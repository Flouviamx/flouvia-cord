export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, withOrgTx } from '../../../../../lib/db';
import { requirePermAny } from '../../../../../lib/queries';
import { strictLimitResponse, strictRateLimit } from '../../../../../lib/ratelimit';
import { stripeUpload } from '../../../../../lib/billing';
import { merchantError } from '../../../../../lib/pay-errors';
import { createTextPdf } from '../../../../../lib/simple-pdf';
import { parseJsonBody } from '../../../../../lib/validation';

const fileId = z.string().regex(/^file_[A-Za-z0-9]+$/);
const schema = z.object({
    communication: z.string().trim().max(20_000).optional(),
    receiptId: fileId.optional(),
    forceCommunication: z.boolean().optional().default(false),
}).strict();

export const POST: APIRoute = async ({ request, params }) => {
    const denied = await requirePermAny(['cobranza', 'cobros_config']);
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const disputeId = params.disputeId || '';
    const limited = strictLimitResponse(await strictRateLimit(`dispute-auto-files:${orgId}`, 15, 3600));
    if (limited) return limited;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const [[row], items, comments] = await withOrgTx(orgId,
        sql`select d.id, d.status, d.evidence_draft, d.evidence_submitted_at, d.amount_cents, d.currency,
                   cc.stripe_charge_id, cc.paid_at, cc.metodo_pago, cc.payment_method,
                   c.id as cotizacion_id, c.folio, c.approved_at,
                   o.nombre as org_nombre, o.stripe_account_id,
                   cl.empresa as cliente_nombre, cl.email as cliente_email,
                   f.firmante_nombre, f.firmante_ip, f.firmado_en
              from cobro_disputas d
              left join cotizacion_cobros cc on cc.id = d.cobro_id and cc.org_id = d.org_id
              left join cotizaciones c on c.id = cc.cotizacion_id and c.org_id = d.org_id
              join orgs o on o.id = d.org_id
              left join clientes cl on cl.id = c.cliente_id and cl.org_id = d.org_id
              left join lateral (
                   select firmante_nombre, firmante_ip, firmado_en
                     from cotizacion_firmas
                    where org_id = d.org_id and cotizacion_id = c.id
                    order by firmado_en desc limit 1
              ) f on true
             where d.org_id = ${orgId} and d.stripe_dispute_id = ${disputeId}
             limit 1`,
        sql`select ci.cantidad, ci.descripcion, ci.precio_unitario, ci.precio_negociado
              from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id
             where c.org_id = ${orgId}
               and c.id = (select cc.cotizacion_id from cobro_disputas d
                            join cotizacion_cobros cc on cc.id = d.cobro_id
                           where d.org_id = ${orgId} and d.stripe_dispute_id = ${disputeId} limit 1)
             order by ci.orden`,
        sql`select autor_nombre, contenido, created_at
              from cotizacion_comentarios
             where org_id = ${orgId}
               and cotizacion_id = (select cc.cotizacion_id from cobro_disputas d
                                     join cotizacion_cobros cc on cc.id = d.cobro_id
                                    where d.org_id = ${orgId} and d.stripe_dispute_id = ${disputeId} limit 1)
             order by created_at`,
    );
    if (!row) return json({ error: 'Contracargo no encontrado' }, 404);
    if (['won', 'lost', 'warning_closed'].includes(String(row.status))) {
        return json({ error: 'Este contracargo ya está cerrado' }, 409);
    }
    if (row.evidence_submitted_at) {
        return json({ error: 'La evidencia ya fue enviada y no puede modificarse' }, 409);
    }
    if (!row.stripe_account_id) return json({ error: 'La cuenta de cobros no está disponible' }, 409);

    const existing = (row.evidence_draft || {}) as Record<string, unknown>;
    let receipt = parsed.data.receiptId || (typeof existing.receipt === 'string' ? existing.receipt : '');
    let communicationFile = typeof existing.customer_communication === 'string' ? existing.customer_communication : '';
    const communicationText = parsed.data.communication || comments.map((comment: any) =>
        `${new Date(comment.created_at).toISOString()} ${comment.autor_nombre || 'Cliente'}: ${comment.contenido || ''}`,
    ).join('\n');

    try {
        if (!receipt) {
            const amount = new Intl.NumberFormat('es-MX', {
                style: 'currency', currency: String(row.currency || 'MXN').toUpperCase(),
            }).format(Number(row.amount_cents || 0) / 100);
            const receiptPdf = createTextPdf('Cord Pagos - Comprobante de operacion', [
                `Negocio: ${row.org_nombre || ''}`,
                `Cotizacion: ${row.folio || ''}`,
                `Cliente: ${row.cliente_nombre || ''}`,
                `Correo: ${row.cliente_email || ''}`,
                `Monto: ${amount}`,
                `Metodo: ${row.metodo_pago || row.payment_method || 'tarjeta'}`,
                `Pagado: ${row.paid_at ? new Date(row.paid_at).toISOString() : ''}`,
                `Transaccion: ${row.stripe_charge_id || ''}`,
                '',
                'Conceptos:',
                ...items.map((item: any) => {
                    const unit = Number(item.precio_negociado ?? item.precio_unitario ?? 0);
                    return `${item.cantidad} x ${item.descripcion} - ${unit.toFixed(2)} ${String(row.currency || 'MXN').toUpperCase()}`;
                }),
                '',
                `Aprobado por: ${row.firmante_nombre || row.cliente_nombre || ''}`,
                `Fecha de aprobacion: ${row.firmado_en ? new Date(row.firmado_en).toISOString() : (row.approved_at ? new Date(row.approved_at).toISOString() : '')}`,
                `IP de aprobacion: ${row.firmante_ip || ''}`,
            ]);
            const uploaded = await stripeUpload(receiptPdf, `receipt-${row.id}.pdf`, 'application/pdf',
                'dispute_evidence', String(row.stripe_account_id));
            receipt = String(uploaded.id || '');
        }

        if (communicationText && (!communicationFile || parsed.data.forceCommunication)) {
            const communicationPdf = createTextPdf('Cord Pagos - Comunicacion con el cliente', [
                `Cotizacion: ${row.folio || ''}`,
                `Cliente: ${row.cliente_nombre || ''}`,
                '',
                communicationText,
            ]);
            const uploaded = await stripeUpload(communicationPdf, `communication-${row.id}.pdf`, 'application/pdf',
                'dispute_evidence', String(row.stripe_account_id));
            communicationFile = String(uploaded.id || '');
        }

        const generated = {
            ...(receipt ? { receipt } : {}),
            ...(communicationFile ? { customer_communication: communicationFile } : {}),
            ...(communicationText ? { customer_communication_text: communicationText } : {}),
        };
        await withOrgTx(orgId, sql`
            update cobro_disputas
               set evidence_draft = coalesce(evidence_draft, '{}'::jsonb) || ${JSON.stringify(generated)}::jsonb,
                   updated_at = now()
             where id = ${row.id} and org_id = ${orgId}`);
        return json({ ok: true, ...generated });
    } catch (error) {
        const safe = merchantError(error);
        console.error('[dispute-auto-files] no se pudo preparar evidencia', { orgId, disputeId, reference: safe.reference });
        return json({ error: safe.message, reference: safe.reference }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
