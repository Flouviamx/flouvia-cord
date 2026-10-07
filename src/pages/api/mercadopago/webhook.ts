// /api/mercadopago/webhook — notificaciones de pago de Mercado Pago.
//
// Lo que sostiene que esto sea seguro y no pierda ni duplique dinero:
//
//  - **La firma se verifica y falla CERRADA.** Sin `MP_WEBHOOK_SECRET` no se
//    procesa nada: un webhook de dinero sin verificar deja que cualquiera
//    declare un pago que no ocurrió.
//  - **El cuerpo no se cree.** Trae un id; el pago se LEE del proveedor con la
//    credencial de la organización, y de ahí salen importe, divisa, estado y la
//    cuenta que cobró (src/lib/mercadopago-cobro.ts).
//  - **Se sabe de quién es el pago sin barrer organizaciones.** La preferencia
//    lleva `cord_org` en su `notification_url` y Mercado Pago manda el
//    `user_id` del vendedor en el cuerpo; los dos se resuelven con una función
//    estrecha (`cord_resolve_mp_orgs`). Antes se leía el pago con la credencial
//    de hasta 25 organizaciones en serie, filtradas por cobros PENDIENTES de
//    los últimos 30 días: con la organización 26, un reembolso sobre un cobro
//    ya pagado o un segundo pago, el dinero se quedaba sin registrar.
//  - **"No es mío" y "no pude saberlo" no son lo mismo.** Si el proveedor o la
//    base fallan, se responde 503 y Mercado Pago reintenta (lo hace durante
//    días). Antes se respondía 200 y el pago se perdía para siempre. Lo que de
//    verdad no es de Cord se acusa con 200 para que deje de reenviarlo.
//  - **La idempotencia es un índice, no un `if`.** Y la conciliación diaria
//    (`/api/cron/mercadopago-conciliar`) recoge lo que este camino no alcance.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { mpSignatureValid, mpWebhookSecret, readMpPayment } from '../../../lib/mercadopago';
import { processMpPayment } from '../../../lib/mercadopago-cobro';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { after } from '../../../lib/after';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, url }) => {
    const secret = mpWebhookSecret();
    if (!secret) {
        log.error('webhook de Mercado Pago sin secreto configurado', { route: 'mercadopago/webhook' });
        return json({ error: 'not_configured' }, 503);
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* algunas notificaciones llegan solo con query */ }

    // Mercado Pago firma el `data.id` de la URL, en minúsculas.
    const dataId = String(url.searchParams.get('data.id') ?? body?.data?.id ?? url.searchParams.get('id') ?? '').toLowerCase();
    const tipo = String(body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '');
    if (!dataId) return json({ ok: true, ignorado: 'sin_id' });

    if (!mpSignatureValid(request.headers.get('x-signature'), request.headers.get('x-request-id'), dataId, secret)) {
        return json({ error: 'bad_signature' }, 401);
    }
    // Solo los pagos mueven dinero. Un contracargo también llega como cambio de
    // estado del pago, y ese sí se procesa. El resto se acusa recibido para que
    // el proveedor deje de reintentar.
    if (tipo && tipo !== 'payment') return json({ ok: true, ignorado: tipo });
    if (!/^[0-9]{1,30}$/.test(dataId)) return json({ ok: true, ignorado: 'id_invalido' });

    // ── ¿De quién es? ─────────────────────────────────────────────────────────
    // Ninguna de las dos pistas es una credencial (la firma lo es): solo dicen
    // con qué organización LEER el pago, y processMpPayment verifica que el pago
    // sea de la cuenta conectada a esa organización.
    const cordOrg = url.searchParams.get('cord_org');
    const userId = body?.user_id !== undefined && body?.user_id !== null ? String(body.user_id) : '';
    let candidatas: Array<{ org_id: string; mp_user_id: string | null }>;
    try {
        candidatas = await sql`
            select org_id, mp_user_id from cord_resolve_mp_orgs(
                ${cordOrg && UUID.test(cordOrg) ? cordOrg : null}::uuid,
                ${/^[0-9]{1,30}$/.test(userId) ? userId : null})` as any;
    } catch (err) {
        log.error('no se pudo resolver la organización del pago', { route: 'mercadopago/webhook', err });
        return json({ error: 'temporal' }, 503);
    }
    if (!candidatas.length) {
        // Ninguna organización tiene (ya) esa cuenta conectada. Reintentar no
        // va a encontrar dueño; la conciliación diaria lo verá si se reconecta.
        log.warn('pago de Mercado Pago sin organización conectada', { route: 'mercadopago/webhook', paymentId: dataId, userId });
        return json({ ok: true, ignorado: 'sin_dueno' });
    }

    let temporal = false;
    let sinCredenciales: string | null = null;
    for (const c of candidatas) {
        const orgId = String(c.org_id);
        const leido = await reqContext.run({ userId: null, orgId, actor: 'system' }, () => readMpPayment(orgId, dataId));
        if (!leido.ok) {
            if (leido.reason === 'temporal') temporal = true;
            if (leido.reason === 'sin_credenciales') sinCredenciales = orgId;
            // Un 404 con la credencial de la MISMA cuenta que trae el aviso no es
            // "no es mío": es el proveedor que todavía no expone el pago. Se pide
            // reintento en vez de darlo por atendido.
            if (leido.reason === 'ajeno' && userId && c.mp_user_id && String(c.mp_user_id) === userId) temporal = true;
            continue;
        }
        let resultado;
        try {
            resultado = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                processMpPayment(orgId, c.mp_user_id ? String(c.mp_user_id) : null, leido.payment));
        } catch (err) {
            // Base de datos o proveedor: temporal. Mercado Pago reintenta.
            log.error('no se pudo procesar el pago de Mercado Pago', { route: 'mercadopago/webhook', orgId, paymentId: dataId, err });
            return json({ error: 'temporal' }, 503);
        }
        if (resultado.propio) return json({ ok: true, estado: resultado.estado });
    }

    if (temporal) return json({ error: 'temporal' }, 503);
    if (sinCredenciales) {
        // La organización dueña perdió su autorización: el pago existe y nadie
        // puede leerlo. Se avisa; al reconectar, la conciliación diaria lo aplica.
        after(sendOpsAlert('Pago de Mercado Pago sin credencial para leerlo',
            `Organización ${sinCredenciales}; pago ${dataId}. Pídele al negocio que reconecte Mercado Pago.`));
    }
    return json({ ok: true, ignorado: 'ajeno' });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
