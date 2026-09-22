// /api/q/[token]/mp-preference — abre el cobro de una cotización con Mercado Pago.
//   POST { cobro_id? } → { url }  (el cliente se va al checkout de Mercado Pago)
//
// Es el carril PÚBLICO de dinero: el token es la credencial y aquí vive el
// fraude de prueba de tarjetas. Las cuatro garantías de la regla 33:
//   1. carril de tenencia — `resolvePublicQuote` + `withOrgTx`;
//   2. rate limit estricto con componente de IP — `limitPublicPayment`;
//   3. `X-Idempotency-Key` determinística por cobro — la pone `createMpPreference`;
//   4. ningún mensaje del proveedor hacia el pagador.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, resolvePublicQuote, withOrgTx } from '../../../../lib/db';
import { dueDateFor, isoDay, materializeAnticipoCobros } from '../../../../lib/cobros';
import { normalizeCurrency } from '../../../../lib/currency';
import { limitPublicPayment } from '../../../../lib/connect-security';
import { createMpPreference } from '../../../../lib/mercadopago';
import { supportsMercadoPago } from '../../../../lib/countries';
import { publicDocumentUrl } from '../../../../lib/public-links';
import { siteOrigin } from '../../../../lib/email';

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token ?? '';
    const limited = await limitPublicPayment(request, 'mp', token, 10);
    if (limited) return limited;

    let requestedCobroId = '';
    try {
        const body = await request.json();
        if (body && typeof body.cobro_id === 'string') requestedCobroId = body.cobro_id;
    } catch { /* sin body = el siguiente cobro pendiente */ }

    const identity = await resolvePublicQuote(token);
    if (!identity) return json({ error: 'Cotización no encontrada' }, 404);

    const [rows] = await withOrgTx(identity.orgId, sql`
        select c.id, c.org_id, c.folio, c.total, c.status, c.anticipo_pct, c.base_currency, c.public_token,
               coalesce(c.terminos, cl.terminos_default) as terminos,
               coalesce(c.approved_at, c.created_at) as base_date,
               cl.email as cliente_email,
               o.sandbox_of, o.mp_charges_enabled, o.moneda, o.nombre as org_nombre,
               upper(coalesce(o.country_code, 'MX')) as pais
          from cotizaciones c
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
          join orgs o on o.id = c.org_id
         where c.id = ${identity.id} and c.org_id = ${identity.orgId}`);
    if (!rows.length) return json({ error: 'Cotización no encontrada' }, 404);
    const c = rows[0];
    const orgId = c.org_id as string;

    if (c.status === 'paid') return json({ alreadyPaid: true });
    if (!['approved', 'invoiced'].includes(c.status as string)) {
        return json({ error: 'Esta cotización no está lista para pago' }, 409);
    }
    if (c.sandbox_of) {
        return json({ error: 'Esta cotización es de prueba — el pago en línea está deshabilitado.' }, 409);
    }
    if (!c.mp_charges_enabled) {
        return json({ error: 'El vendedor no tiene configurada su cuenta para recibir pagos' }, 403);
    }
    if (!supportsMercadoPago(String(c.pais))) {
        return json({ error: 'El pago con Mercado Pago no está disponible para este negocio.' }, 409);
    }

    const currency = normalizeCurrency((c.base_currency as string) || (c.moneda as string));

    // ── Qué cobro se paga ──────────────────────────────────────────────────
    // Mismas "rebanadas" que el resto de Cord Payments (anticipo, saldo,
    // cuotas o una fila 'total'): el riel cambia, el desglose no.
    let [cobros] = await withOrgTx(orgId, sql`
        select id, tipo, numero_cuota, monto, status, vence
          from cotizacion_cobros where org_id = ${orgId} and cotizacion_id = ${c.id}
         order by vence asc nulls first, created_at asc`);

    if (!cobros.length) {
        const pct = Number(c.anticipo_pct);
        if (pct > 0 && pct < 100) {
            await materializeAnticipoCobros(c.id as string, orgId);
        } else {
            const venceTotal = isoDay(dueDateFor(c.base_date as string, c.terminos as string));
            await withOrgTx(orgId, sql`
                insert into cotizacion_cobros (org_id, cotizacion_id, tipo, monto, vence)
                select org_id, id, 'total', total, ${venceTotal}
                  from cotizaciones where id = ${c.id}
                on conflict (cotizacion_id, tipo, numero_cuota) do nothing`);
        }
        [cobros] = await withOrgTx(orgId, sql`
            select id, tipo, numero_cuota, monto, status, vence
              from cotizacion_cobros where org_id = ${orgId} and cotizacion_id = ${c.id}
             order by vence asc nulls first, created_at asc`);
        if (!cobros.length) return json({ error: 'No se pudo preparar el cobro' }, 500);
    }

    let cobro: any;
    if (requestedCobroId) {
        cobro = cobros.find((co: any) => co.id === requestedCobroId) || null;
        if (!cobro) return json({ error: 'Cobro no encontrado' }, 404);
        if (cobro.status === 'pagado') return json({ alreadyPaid: true });
        if (cobro.status === 'cancelado') return json({ error: 'Este cobro ya no está vigente' }, 409);
    } else {
        const pendientes = cobros.filter((co: any) => co.status === 'pendiente');
        if (!pendientes.length) return json({ alreadyPaid: true });
        cobro = pendientes[0];
    }

    const etiqueta = cobro.tipo === 'anticipo' ? 'Anticipo'
        : cobro.tipo === 'saldo' ? 'Saldo'
            : cobro.tipo === 'cuota' ? `Cuota ${cobro.numero_cuota}` : 'Pago';
    const link = await publicDocumentUrl(orgId, 'q', String(c.public_token));

    const preferencia = await createMpPreference(orgId, {
        // Determinística por COBRO: un reintento del navegador no acuña una
        // segunda preferencia para el mismo dinero (regla 33).
        idempotencyKey: `cord-cobro-${cobro.id}`,
        titulo: `${etiqueta} ${c.folio} · ${c.org_nombre}`,
        monto: Number(cobro.monto),
        moneda: currency,
        referencia: String(cobro.id),
        emailPagador: (c.cliente_email as string) || null,
        notificationUrl: `${siteOrigin()}/api/mercadopago/webhook`,
        backUrl: link,
    });

    if (!preferencia.ok) {
        // Nada del proveedor viaja al pagador: se le dice el ESTADO (regla 14).
        const status = preferencia.reason === 'sin_credenciales' ? 403 : 502;
        return json({ error: 'El pago en línea no está disponible en este momento. Intenta más tarde o escríbele al vendedor.' }, status);
    }

    await withOrgTx(orgId, sql`
        update cotizacion_cobros set mp_preference_id = ${preferencia.id}, mp_preference_at = now()
         where id = ${cobro.id} and org_id = ${orgId}`);

    return json({ url: preferencia.initPoint, cobro_id: cobro.id });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
