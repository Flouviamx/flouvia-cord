// GET  /api/billing/factura — estado fiscal de los cobros de suscripción.
// POST /api/billing/factura — timbra el CFDI de uno de ellos.
//
// Cord factura su propia plataforma con el mismo motor con el que el negocio
// factura a sus clientes. Solo México: el CFDI es un riel mexicano y fuera de ahí
// el comprobante del cobro ya ES el documento (regla 24).
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, withOrgTx, logAudit, reqIp } from '../../../lib/db';
import { emitSubscriptionInvoice } from '../../../lib/fiscal/emit';
import { billingContext, fetchOwned, json } from '../../../lib/billing-surface';
import { fromMinorUnits } from '../../../lib/currency';

const Body = z.object({ invoiceId: z.string().trim().min(1).max(120) });

/** ¿Puede este negocio pedir CFDI, y si no, qué le falta? */
async function fiscalState(orgId: string) {
    const [[o]] = await withOrgTx(orgId, sql`
        select country_code, rfc, regimen_fiscal, cp_fiscal from orgs where id = ${orgId} limit 1`);
    const isMx = String(o?.country_code || 'MX').toUpperCase() === 'MX';
    const complete = Boolean(o?.rfc && o?.regimen_fiscal && o?.cp_fiscal);
    return { disponible: isMx, datosCompletos: complete };
}

export const GET: APIRoute = async () => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId } = gate.ctx;

    const estado = await fiscalState(orgId);
    const [rows] = await withOrgTx(orgId, sql`
        select stripe_invoice_id, status, fiscal_uuid, invoice_number, invoice_error
          from suscripcion_facturas where org_id = ${orgId}`);

    return json({
        ...estado,
        facturas: Object.fromEntries(rows.map((r: any) => [r.stripe_invoice_id, {
            status: r.status,
            uuid: r.fiscal_uuid,
            numero: r.invoice_number,
            error: r.status === 'error' ? r.invoice_error : null,
        }])),
    });
};

export const POST: APIRoute = async ({ request }) => {
    const gate = await billingContext();
    if ('denied' in gate) return gate.denied;
    const { orgId, customer } = gate.ctx;

    let body: unknown = {};
    try { body = await request.json(); } catch { /* sin body */ }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return json({ error: 'Falta el cobro a facturar.' }, 400);

    // Autorización ANTES que reglas de negocio: el id lo manda el cliente, y
    // responder "te faltan datos fiscales" sobre una factura ajena ya sería
    // contestar una pregunta que no le toca.
    const owned = await fetchOwned(`/v1/invoices/${parsed.data.invoiceId}`, customer);
    if ('denied' in owned) return owned.denied;
    const inv = owned.object;

    const estado = await fiscalState(orgId);
    if (!estado.disponible) {
        return json({ error: 'El CFDI aplica solo a negocios en México. Tu comprobante de pago es tu documento.', code: 'not_mx' }, 409);
    }
    if (!estado.datosCompletos) {
        return json({
            error: 'Faltan tus datos fiscales: RFC, régimen fiscal y código postal.',
            code: 'datos_fiscales_incompletos',
        }, 409);
    }

    // Un CFDI declara un pago recibido. Timbrar un cobro que no se liquidó sería
    // declarar ingreso inexistente.
    if (inv.status !== 'paid') {
        return json({ error: 'Ese cobro todavía no está pagado.', code: 'not_paid' }, 409);
    }

    // Un cobro de cero no es ingreso: pasa con un descuento del 100% o un crédito
    // que cubre el periodo completo. No hay nada que declarar y el SAT no timbra
    // un comprobante sin importe.
    const total = fromMinorUnits(Number(inv.total || 0), String(inv.currency || 'mxn'));
    if (total <= 0) {
        return json({ error: 'Ese cobro fue de cero, así que no hay nada que facturar.', code: 'zero_total' }, 409);
    }

    const result = await emitSubscriptionInvoice(orgId, {
        id: String(inv.id),
        total,
        currency: String(inv.currency || 'mxn'),
        number: inv.number ?? null,
        created: Number(inv.created || 0),
    });

    if (!result.emitted) return json({ error: result.error || 'No pudimos emitir tu factura.' }, 422);

    await logAudit(orgId, {
        accion: 'billing.factura_suscripcion',
        entidad: 'org', entidad_id: orgId,
        detalle: `${inv.id} → ${result.fiscalId || result.documentId}`,
        ip: reqIp(request),
    });
    return json({ ok: true, uuid: result.fiscalId ?? null, numero: result.invoiceNumber ?? null, reused: Boolean(result.reused) });
};
