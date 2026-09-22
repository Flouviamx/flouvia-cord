// /api/i/[token]/mp-preference — abre el cobro del SALDO de una factura con
// Mercado Pago desde su hosted invoice page.
//   POST { monto? } → { url }  (el cliente se va al checkout de Mercado Pago)
//
// Hermano de /api/q/[token]/mp-preference, con el mismo sujeto que
// /api/i/[token]/payment-intent: el saldo vivo de UN documento fiscal, no las
// rebanadas de una cotización. Admite ABONO PARCIAL, y el monto lo propone el
// cliente, así que se acota contra el saldo real leído de la base.
//
// Las cuatro garantías de la regla 33:
//   1. carril de tenencia — `resolvePublicInvoice` + `withOrgTx`;
//   2. rate limit estricto con componente de IP — `limitPublicPayment`;
//   3. `X-Idempotency-Key` determinística — la pone `createMpPreference`;
//   4. ningún mensaje del proveedor hacia el pagador.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicInvoice, withOrgTx } from '../../../../lib/db';
import { normalizeCurrency } from '../../../../lib/currency';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { createMpPreference, MP_INVOICE_REF } from '../../../../lib/mercadopago';
import { supportsMercadoPago } from '../../../../lib/countries';
import { publicDocumentUrl } from '../../../../lib/public-links';
import { siteOrigin } from '../../../../lib/email';

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'imp', token, 10);
    if (limited) return limited;

    const identity = await resolvePublicInvoice(token);
    if (!identity) return json({ error: 'Factura no encontrada' }, 404);

    const [rows] = await withOrgTx(identity.orgId, sql`
        select d.id, d.org_id, d.invoice_number, d.lifecycle, d.currency, d.total, d.amount_remaining,
               d.credit_note_of, d.document_type, d.provider_data, d.public_token,
               c.email as cliente_email,
               o.sandbox_of, o.mp_charges_enabled, o.moneda, o.nombre as org_nombre,
               upper(coalesce(o.country_code, 'MX')) as pais
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
          left join clientes c on c.id = d.cliente_id and c.org_id = d.org_id
         where d.id = ${identity.id} and d.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Factura no encontrada' }, 404);
    const d = rows[0];
    const orgId = d.org_id as string;

    if (d.credit_note_of || ['cfdi_egreso', 'credit_note'].includes(String(d.document_type))) {
        return json({ error: 'Una nota de crédito no admite cobros.' }, 409);
    }
    if (d.lifecycle === 'paid') return json({ alreadyPaid: true });
    if (d.lifecycle !== 'open') return json({ error: 'Esta factura no está abierta a pago.' }, 409);
    if (d.sandbox_of) {
        return json({ error: 'Esta factura es de prueba. El pago en línea está deshabilitado.' }, 409);
    }
    if (d.provider_data?.simulado === true || d.provider_data?.livemode === false) {
        return json({ error: 'Este documento no tiene una emisión fiscal activa. El pago en línea está deshabilitado.' }, 409);
    }
    if (!d.mp_charges_enabled) {
        return json({ error: 'El negocio todavía no tiene configurada su cuenta para recibir pagos.' }, 403);
    }
    if (!supportsMercadoPago(String(d.pais))) {
        return json({ error: 'El pago con Mercado Pago no está disponible para este negocio.' }, 409);
    }

    // Regla 21: la divisa del cobro es la de la FACTURA, no la de la org.
    const currency = normalizeCurrency((d.currency as string) || (d.moneda as string));
    const saldo = Number(d.amount_remaining ?? d.total ?? 0);
    if (!(saldo > 0)) return json({ alreadyPaid: true });

    let cobrar = saldo;
    const body = await request.json().catch(() => ({} as any));
    if (body?.monto !== undefined && body?.monto !== null && body.monto !== '') {
        const pedido = Number(body.monto);
        if (!Number.isFinite(pedido) || pedido <= 0) {
            return json({ error: 'El monto a pagar no es válido.' }, 400);
        }
        cobrar = Math.min(pedido, saldo);
    }
    // Mercado Pago cobra en unidades mayores y rechaza un importe de cero.
    cobrar = Math.round((cobrar + Number.EPSILON) * 100) / 100;
    if (!(cobrar > 0)) return json({ error: 'El monto es demasiado pequeño para cobrarse en línea.' }, 409);

    const link = await publicDocumentUrl(orgId, 'i', String(d.public_token || ''));

    const preferencia = await createMpPreference(orgId, {
        // Por documento y por importe: reintentar el mismo abono reusa la
        // preferencia, y cambiar de importe abre una nueva (regla 33).
        idempotencyKey: `cord-factura-${d.id}-${Math.round(cobrar * 100)}`,
        titulo: `Factura ${d.invoice_number || ''} · ${d.org_nombre}`.replace(/\s+/g, ' ').trim(),
        monto: cobrar,
        moneda: currency,
        referencia: `${MP_INVOICE_REF}${d.id}`,
        emailPagador: (d.cliente_email as string) || null,
        notificationUrl: `${siteOrigin()}/api/mercadopago/webhook`,
        backUrl: link,
    });

    if (!preferencia.ok) {
        // Nada del proveedor viaja al pagador: se le dice el ESTADO (regla 14).
        const status = preferencia.reason === 'sin_credenciales' ? 403 : 502;
        return json({ error: 'El pago en línea no está disponible en este momento. Intenta más tarde o escríbele al negocio.' }, status);
    }

    // El webhook no recibe la organización: la deduce de quién tiene una
    // preferencia abierta. Sin esta marca, el aviso del pago no encuentra dueño.
    await withOrgTx(orgId, sql`
        update documentos_fiscales set mp_preference_id = ${preferencia.id}, mp_preference_at = now()
         where id = ${d.id} and org_id = ${orgId}`);

    return json({ url: preferencia.initPoint });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
