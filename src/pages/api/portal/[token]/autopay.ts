// /api/portal/[token]/autopay — el cliente activa, confirma o apaga su cobro
// automático desde el portal.
//
//   { accion: 'preparar', acepto: true } → SetupIntent para guardar el método.
//     El consentimiento lo registra el SERVIDOR (fecha, IP, navegador) y queda
//     pendiente hasta que el proveedor confirme el método.
//   { accion: 'confirmar', setup_intent } → al volver del formulario: activa si
//     el proveedor ya confirmó el método; el webhook `setup_intent.succeeded`
//     es el respaldo (una cuenta bancaria verificada con micro-depósitos tarda
//     días).
//   { accion: 'desactivar' } → lo apaga y da de baja el método guardado.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePortal, withOrgTx } from '../../../../lib/db';
import { stripe } from '../../../../lib/billing';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { trustedIp } from '../../../../lib/ip';
import { payerError } from '../../../../lib/pay-errors';
import { log } from '../../../../lib/log';
import {
    activarAutopayDesdeIntent, consentimientoAutopay, crearSetupAutopay, desactivarAutopay,
    metodosDelCobro, registrarConsentimientoPendiente, type OrgParaCobro,
} from '../../../../lib/cobros/agrupados';
import { asegurarCustomer } from '../../../../lib/cobros/stripe-cliente';
import { normalizeCurrency } from '../../../../lib/currency';
import type { MetodoCobro } from '../../../../lib/cobros/metodos';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
const PUBLISHABLE = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'portal-autopay', token, 10);
    if (limited) return limited;
    const identidad = await resolvePortal(token);
    if (!identidad) return json({ error: 'Portal no encontrado.' }, 404);
    const { orgId, clienteId } = identidad;
    const body = await request.json().catch(() => ({} as any));
    const accion = String(body?.accion || '');

    if (accion === 'desactivar') {
        await desactivarAutopay(orgId, clienteId, { por: 'cliente' });
        return json({ ok: true });
    }

    if (!STRIPE_KEY) return json({ error: 'El pago en línea aún no está disponible.' }, 503);
    const [[o]] = await withOrgTx(orgId, sql`
        select o.nombre, o.stripe_account_id, o.stripe_charges_enabled, (o.sandbox_of is not null) as es_prueba, o.is_demo,
               o.acepta_tarjeta, o.acepta_domiciliacion, o.stripe_capacidades, o.fee_enabled, o.fee_terms_version,
               o.cobro_automatico_permitido, o.moneda,
               (select array_agg(distinct d.currency) from documentos_fiscales d
                 where d.org_id = o.id and d.cliente_id = ${clienteId} and d.status = 'issued') as divisas
          from orgs o where o.id = ${orgId}`);
    if (!o) return json({ error: 'Portal no encontrado.' }, 404);
    if (o.es_prueba || o.is_demo) return json({ error: 'Este portal es de prueba. El cobro automático está deshabilitado.' }, 409);
    if (!o.stripe_account_id || !o.stripe_charges_enabled || o.cobro_automatico_permitido === false) {
        return json({ error: 'Este negocio no ofrece cobro automático.' }, 403);
    }
    const account = String(o.stripe_account_id);

    try {
        if (accion === 'preparar') {
            if (body?.acepto !== true) return json({ error: 'Para activar el cobro automático acepta la autorización.' }, 400);
            const org: OrgParaCobro = {
                nombre: String(o.nombre || ''), stripeAccountId: account,
                aceptaTarjeta: !!o.acepta_tarjeta, aceptaDomiciliacion: !!o.acepta_domiciliacion,
                capacidades: o.stripe_capacidades, feeEnabled: o.fee_enabled, feeTermsVersion: o.fee_terms_version,
            };
            // La tarjeta cubre cualquier divisa; la domiciliación, la suya.
            const divisas = new Set<string>([normalizeCurrency(o.moneda), ...((o.divisas ?? []) as string[]).map((d) => normalizeCurrency(d))]);
            const metodos = new Set<MetodoCobro>();
            for (const d of divisas) for (const m of metodosDelCobro(org, d)) metodos.add(m);
            if (!metodos.size) return json({ error: 'Este negocio no tiene métodos de pago en línea disponibles.' }, 409);
            const lista = [...metodos].sort((a, b) => (a === 'card' ? -1 : b === 'card' ? 1 : a.localeCompare(b)));
            const customerId = await asegurarCustomer(orgId, clienteId, account);
            const si = await crearSetupAutopay(orgId, { clienteId, customerId, account, metodos: lista });
            await registrarConsentimientoPendiente(orgId, clienteId,
                consentimientoAutopay(trustedIp(request), request.headers.get('user-agent'), String(si.id)));
            return json({ clientSecret: si.client_secret, publishableKey: PUBLISHABLE, accountId: account, metodos: lista });
        }

        if (accion === 'confirmar') {
            const id = String(body?.setup_intent || '');
            if (!/^seti_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Solicitud inválida.' }, 400);
            const si = await stripe(`/v1/setup_intents/${encodeURIComponent(id)}`, undefined, 'GET', { stripeAccount: account });
            if (si?.metadata?.cliente_id !== clienteId || si?.metadata?.cord_flow !== 'autopay') {
                return json({ error: 'Solicitud inválida.' }, 400);
            }
            if (si.status === 'succeeded') {
                const activo = await activarAutopayDesdeIntent(orgId, si, account);
                return json(activo ? { ok: true, activo: true } : { error: 'No pudimos activar el cobro automático. Intenta de nuevo.' }, activo ? 200 : 409);
            }
            // Cuenta bancaria por verificar (micro-depósitos): el webhook la activa.
            if (['processing', 'requires_action'].includes(String(si.status))) return json({ ok: true, pendiente: true });
            return json({ error: 'No se guardó el método. Intenta de nuevo.' }, 409);
        }

        return json({ error: 'Acción no reconocida.' }, 400);
    } catch (error: unknown) {
        const safe = payerError(error);
        log.error('no se pudo preparar el cobro automático', { route: 'cobros-portal', reference: safe.reference, err: error });
        return json({ error: `${safe.message} Ref: ${safe.reference}` }, 502);
    }
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
}
