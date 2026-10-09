// /api/portal/[token]/payment-intent — pagar VARIAS facturas a la vez desde el
// portal del cliente.
//
// Hermano de /api/i/[token]/payment-intent, con dos diferencias:
//   - el cliente elige QUÉ facturas, no cuánto: cada una se paga por su saldo
//     real leído de la base (el navegador nunca manda importes);
//   - un solo intento cubre todas, con el reparto guardado en
//     `pago_agrupado_documentos` (src/lib/cobros/agrupados.ts).
//
// Todas las facturas van en la misma divisa (regla 21). Con `guardar` y su
// consentimiento, el método queda para el cobro automático cuando el
// proveedor lo confirme (el consentimiento queda PENDIENTE hasta entonces).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePortal, withOrgTx } from '../../../../lib/db';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { trustedIp } from '../../../../lib/ip';
import { payerError } from '../../../../lib/pay-errors';
import { log } from '../../../../lib/log';
import { after } from '../../../../lib/after';
import { trackServer } from '../../../../lib/posthog-server';
import { toMinorUnits } from '../../../../lib/currency';
import {
    cancelarPagoAgrupado, consentimientoAutopay, crearIntentAgrupado, crearPagoAgrupado, facturasDelCliente,
    leerPagoAgrupado, metodosDelCobro, pisoCobro, registrarConsentimientoPendiente, type OrgParaCobro,
} from '../../../../lib/cobros/agrupados';
import { asegurarCustomer } from '../../../../lib/cobros/stripe-cliente';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const PUBLISHABLE = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está disponible.' }, 503);
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'portal', token, 10);
    if (limited) return limited;

    const identidad = await resolvePortal(token);
    if (!identidad) return json({ error: 'Portal no encontrado.' }, 404);
    const { orgId, clienteId } = identidad;

    const body = await request.json().catch(() => ({} as any));
    const pedidas: string[] = Array.isArray(body?.documentos) ? body.documentos.map(String).slice(0, 51) : [];
    if (!pedidas.length) return json({ error: 'Selecciona al menos una factura.' }, 400);

    const [[o]] = await withOrgTx(orgId, sql`
        select nombre, stripe_account_id, stripe_charges_enabled, (sandbox_of is not null) as es_prueba, is_demo,
               acepta_tarjeta, acepta_domiciliacion, stripe_capacidades, fee_enabled, fee_terms_version,
               cobro_automatico_permitido
          from orgs where id = ${orgId}`);
    if (!o) return json({ error: 'Portal no encontrado.' }, 404);
    if (o.es_prueba || o.is_demo) return json({ error: 'Este portal es de prueba. El pago en línea está deshabilitado.' }, 409);
    if (!o.stripe_account_id || !o.stripe_charges_enabled) {
        return json({ error: 'El negocio todavía no tiene configurada su cuenta para recibir pagos.' }, 403);
    }
    const org: OrgParaCobro = {
        nombre: String(o.nombre || ''), stripeAccountId: String(o.stripe_account_id),
        aceptaTarjeta: !!o.acepta_tarjeta, aceptaDomiciliacion: !!o.acepta_domiciliacion,
        capacidades: o.stripe_capacidades, feeEnabled: o.fee_enabled, feeTermsVersion: o.fee_terms_version,
    };

    // La divisa sale de las facturas, no del cuerpo: todas deben compartirla.
    const facturas = await facturasDelCliente(orgId, clienteId);
    const elegidas = facturas.filter((f) => pedidas.includes(f.id));
    if (elegidas.length !== new Set(pedidas).size || elegidas.some((f) => !f.cobrable)) {
        return json({ error: 'Alguna factura ya no se puede pagar en línea. Actualiza la página.', code: 'payment_changed' }, 409);
    }
    const currency = elegidas[0].currency;
    if (elegidas.some((f) => f.currency !== currency)) {
        return json({ error: 'Paga las facturas de una sola divisa a la vez.' }, 400);
    }
    const metodos = metodosDelCobro(org, currency);
    if (!metodos.length) return json({ error: 'El negocio no acepta pagos en línea en esta divisa.' }, 409);
    const total = elegidas.reduce((s, f) => s + f.saldo, 0);
    if (toMinorUnits(total, currency) < pisoCobro(currency)) {
        return json({ error: 'El monto es demasiado pequeño para cobrarse en línea.' }, 409);
    }
    const guardar = body?.guardar === true && body?.acepto === true && o.cobro_automatico_permitido !== false;

    try {
        // Un solo cobro del portal vivo por cliente: el anterior que nadie
        // confirmó se cancela. Si ya está en proceso, no se abre otro.
        const [abiertos] = await withOrgTx(orgId, sql`
            select id from pagos_agrupados
             where org_id = ${orgId} and cliente_id = ${clienteId} and origen = 'portal' and estado = 'creado'`);
        for (const row of abiertos) {
            const previo = await leerPagoAgrupado(orgId, String(row.id));
            if (previo && await cancelarPagoAgrupado(orgId, previo, org.stripeAccountId) === 'en_vuelo') {
                return json({ error: 'Hay un pago en proceso. Espera su confirmación antes de pagar otra vez.', code: 'payment_pending' }, 409);
            }
        }

        const creado = await crearPagoAgrupado(orgId, { clienteId, origen: 'portal', currency, documentos: elegidas.map((f) => f.id) });
        if (!creado.ok) return json({ error: creado.error, code: 'payment_changed' }, 409);
        const customerId = await asegurarCustomer(orgId, clienteId, org.stripeAccountId);
        const numeros = elegidas.map((f) => f.numero).filter(Boolean).slice(0, 6).join(', ');
        const intent = await crearIntentAgrupado(orgId, creado.pago, org, {
            customerId, clienteId, metodos,
            descripcion: `${elegidas.length === 1 ? 'Factura' : 'Facturas'} ${numeros} — ${org.nombre}`,
            guardarParaAutopay: guardar,
        });
        if (guardar) {
            await registrarConsentimientoPendiente(orgId, clienteId,
                consentimientoAutopay(trustedIp(request), request.headers.get('user-agent'), String(intent.id)));
        }

        after(trackServer('checkout_started', orgId, {
            event_id: String(intent.id), checkout_id: String(intent.id),
            amount: Number(intent.amount), currency, payment_method: metodos.join('+'),
            checkout_version: 2, source: 'public_link',
            ...(elegidas.length === 1 ? { invoice_id: elegidas[0].id } : {}),
        }, false, false));

        return json({
            clientSecret: intent.client_secret, publishableKey: PUBLISHABLE,
            accountId: org.stripeAccountId, amount: Number(intent.amount), currency, pagoId: creado.pago.id,
            metodos,
        });
    } catch (error: unknown) {
        const safe = payerError(error);
        log.error('no se pudo crear el cobro del portal', { route: 'cobros-portal', reference: safe.reference, err: error });
        return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
}
