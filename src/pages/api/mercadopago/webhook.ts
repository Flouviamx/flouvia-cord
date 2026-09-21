// /api/mercadopago/webhook — notificaciones de pago de Mercado Pago.
//
// Tres cosas que sostienen que esto sea seguro y no duplique dinero:
//
//  - **La firma se verifica y falla CERRADA.** Sin `MP_WEBHOOK_SECRET` no se
//    procesa nada: un webhook de dinero sin verificar deja que cualquiera
//    declare un pago que no ocurrió.
//  - **El cuerpo no se cree.** Trae un id; el pago se LEE del proveedor con el
//    token del vendedor, y de ahí salen importe, divisa y estado.
//  - **La idempotencia es un índice, no un `if`.** `mp_payment_id` es único por
//    organización: Mercado Pago reenvía la misma notificación por diseño, y el
//    segundo intento choca contra la base en vez de pagar dos veces.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { fetchMpPayment, mpSignatureValid, mpWebhookSecret } from '../../../lib/mercadopago';
import { settleQuoteCobro } from '../../../lib/cobros-settle';

export const POST: APIRoute = async ({ request, url }) => {
    const secret = mpWebhookSecret();
    if (!secret) {
        log.error('webhook de Mercado Pago sin secreto configurado', { route: 'mercadopago/webhook' });
        return json({ error: 'not_configured' }, 503);
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* algunas notificaciones llegan solo con query */ }

    const dataId = String(body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
    const tipo = String(body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '');
    if (!dataId) return json({ ok: true, ignorado: 'sin_id' });

    if (!mpSignatureValid(request.headers.get('x-signature'), request.headers.get('x-request-id'), dataId, secret)) {
        return json({ error: 'bad_signature' }, 401);
    }
    // Solo los pagos mueven dinero. El resto se acusa recibido para que el
    // proveedor deje de reintentar.
    if (tipo && tipo !== 'payment') return json({ ok: true, ignorado: tipo });

    // Barrido cross-org SOLO para descubrir de quién es el cobro: el trabajo
    // vuelve al carril de la organización (regla 30). `external_reference` es
    // el id del cobro, que es lo único que el proveedor nos devuelve.
    const cobro = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select cc.id, cc.org_id, cc.cotizacion_id, cc.mp_payment_id
              from cotizacion_cobros cc
              join orgs o on o.id = cc.org_id
             where cc.mp_preference_id is not null and o.mp_charges_enabled
               and cc.id::text = ${dataId}`);
        return rows[0] ?? null;
    });

    // Lo normal es que el id del webhook sea el del PAGO, no el del cobro: se
    // resuelve leyendo el pago con el token de cada organización candidata.
    const orgId = cobro?.org_id as string | undefined;
    if (!orgId) return await porReferencia(dataId);

    return (await liquidar(orgId, dataId)) ?? json({ ok: true, ignorado: 'no_legible' });
};

/**
 * Sin dueño conocido todavía: se busca la organización por la preferencia que
 * abrió el cobro. Mercado Pago no dice de quién es el pago, así que el vínculo
 * lo pone Cord cuando creó la preferencia.
 */
async function porReferencia(paymentId: string): Promise<Response> {
    const candidatas = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select distinct cc.org_id
              from cotizacion_cobros cc
              join orgs o on o.id = cc.org_id
             where cc.status = 'pendiente' and cc.mp_preference_id is not null
               and o.mp_charges_enabled
               and cc.updated_at > now() - interval '30 days'
             limit 25`);
        return rows.map((r) => String(r.org_id));
    });

    for (const orgId of candidatas) {
        const res = await liquidar(orgId, paymentId, true);
        if (res) return res;
    }
    // Se acusa recibido: reintentar no va a encontrar dueño y Mercado Pago
    // seguiría reenviando para siempre.
    return json({ ok: true, ignorado: 'sin_dueno' });
}

async function liquidar(orgId: string, paymentId: string, silencioso = false): Promise<Response | null> {
    const pago = await fetchMpPayment(orgId, paymentId);
    if (!pago) return silencioso ? null : json({ ok: true, ignorado: 'no_legible' });
    if (pago.status !== 'approved') return json({ ok: true, estado: pago.status });
    if (!pago.referencia) return json({ ok: true, ignorado: 'sin_referencia' });

    return await reqContext.run({ userId: null, orgId, actor: 'system' }, async () => {
        // El índice único hace el trabajo: si esta notificación ya se procesó,
        // no hay fila que actualizar y no se liquida dos veces.
        const [reclamado] = await withOrgTx(orgId, sql`
            update cotizacion_cobros
               set mp_payment_id = ${pago.id}
             where id = ${pago.referencia} and org_id = ${orgId} and mp_payment_id is null
            returning id, cotizacion_id`);
        if (!reclamado.length) return json({ ok: true, repetida: true });

        const resultado = await settleQuoteCobro(orgId, {
            cotizacionId: String(reclamado[0].cotizacion_id),
            cobroId: String(reclamado[0].id),
            monto: pago.monto,
            moneda: pago.moneda,
            metodo: 'mercadopago',
            pagoId: pago.id,
            proveedor: 'Mercado Pago',
        });
        return json({ ok: true, resultado });
    });
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
