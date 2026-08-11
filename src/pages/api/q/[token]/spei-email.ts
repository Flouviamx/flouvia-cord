export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { parseJsonBody } from '../../../../lib/validation';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { stripe } from '../../../../lib/billing';
import { sendEmail } from '../../../../lib/email';

const schema = z.object({ cobro_id: z.string().uuid() }).strict();
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);

export const POST: APIRoute = async ({ request, params }) => {
    const token = params.token || '';
    const limited = await rateLimit(`spei-email:${token}`, 3, 600);
    if (!limited.ok) return tooMany(limited.retryAfter);
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cobro no encontrado' }, 404);
    const [[row]] = await withOrgTx(identity.orgId, sql`
        select co.org_id, co.stripe_payment_intent_id, co.metodo_pago, co.payment_method,
               c.folio, cl.email, o.nombre as org_nombre, o.stripe_account_id
          from cotizacion_cobros co
          join cotizaciones c on c.id = co.cotizacion_id
          join orgs o on o.id = co.org_id
          left join clientes cl on cl.id = c.cliente_id
         where c.id = ${identity.id} and c.org_id = ${identity.orgId}
           and co.org_id = ${identity.orgId} and co.id = ${parsed.data.cobro_id}
         limit 1`);
    if (!row) return json({ error: 'Cobro no encontrado' }, 404);
    if (!row.email) return json({ error: 'El vendedor no tiene un correo del cliente registrado' }, 409);
    if ((row.metodo_pago || row.payment_method) !== 'spei' || !row.stripe_payment_intent_id || !row.stripe_account_id) {
        return json({ error: 'Las instrucciones SPEI no están disponibles' }, 409);
    }
    try {
        const intent = await stripe(`/v1/payment_intents/${row.stripe_payment_intent_id}`, undefined, 'GET', { stripeAccount: row.stripe_account_id as string });
        const display = intent?.next_action?.display_bank_transfer_instructions;
        const spei = (display?.financial_addresses || []).map((address: any) => address?.spei).find((value: any) => value?.clabe);
        if (!spei?.clabe || !display?.reference) return json({ error: 'Las instrucciones SPEI no están disponibles' }, 409);
        const currency = String(display.currency || intent.currency || 'mxn').toUpperCase();
        const amount = new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(Number(display.amount_remaining || intent.amount || 0) / 100);
        const sent = await sendEmail({
            to: row.email as string,
            subject: `Instrucciones SPEI para ${String(row.folio)}`,
            fromName: row.org_nombre as string,
            orgId: row.org_id as string,
            operation: 'spei_instructions',
            html: `<p>Estas son tus instrucciones de pago para <strong>${esc(row.folio)}</strong>.</p>
              <p><strong>Monto:</strong> ${esc(amount)} ${esc(currency)}<br>
              <strong>CLABE:</strong> ${esc(spei.clabe)}<br>
              <strong>Banco:</strong> ${esc(spei.bank_name || '')}<br>
              <strong>Beneficiario:</strong> ${esc(row.org_nombre)}<br>
              <strong>Referencia:</strong> ${esc(display.reference)}</p>
              <p>Transfiere el monto exacto y conserva este correo como referencia.</p>`,
        });
        if (!sent.sent) return json({ error: 'No pudimos enviar las instrucciones en este momento' }, 502);
        return json({ ok: true });
    } catch (error) {
        console.error('[spei-email]', error);
        return json({ error: 'No pudimos enviar las instrucciones en este momento' }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
