// /api/integraciones/shopify/webhook — eventos de la tienda.
//
// Tres cosas sostienen esto:
//  - **La firma se verifica sobre el cuerpo CRUDO y falla cerrada.** Shopify
//    exige responder 401 cuando no cuadra, y sin secreto no se procesa nada.
//  - **El dominio identifica, no autoriza** (regla 30): resuelve la
//    organización con `cord_resolve_integracion` y el trabajo vuelve a
//    `withOrgTx` con ese id.
//  - **Los webhooks obligatorios de privacidad se contestan siempre**, aunque
//    la tienda ya no esté conectada: Shopify los exige para revisar la app.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOrgTx } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import { after } from '../../../../lib/after';
import { reqContext } from '../../../../lib/context';
import { rateLimit } from '../../../../lib/ratelimit';
import { isShopDomain, shopifyCredentials } from '../../../../lib/integraciones/shopify/config';
import { verifyWebhookHmac } from '../../../../lib/integraciones/shopify/oauth';
import { aplicarWebhook, marcarDesinstalada } from '../../../../lib/integraciones/shopify/service';

const COMPLIANCE = new Set(['customers/data_request', 'customers/redact', 'shop/redact']);

export const POST: APIRoute = async ({ request }) => {
    const creds = shopifyCredentials();
    if (!creds) return json({ error: 'not_configured' }, 503);

    const raw = await request.text();
    const firma = request.headers.get('x-shopify-hmac-sha256');
    if (!verifyWebhookHmac(raw, firma, creds.clientSecret)) return json({ error: 'bad_signature' }, 401);

    const shop = String(request.headers.get('x-shopify-shop-domain') ?? '').toLowerCase();
    const topic = String(request.headers.get('x-shopify-topic') ?? '');
    if (!isShopDomain(shop)) return json({ ok: true, ignorado: 'sin_tienda' });

    // Con la firma ya verificada, el límite solo acota el trabajo por tienda.
    const rl = await rateLimit(`shopify-wh:${shop}`, 600, 60);
    if (!rl.ok) return json({ ok: true, ignorado: 'limite' }, 429);

    const [dueno] = await sql`select org_id from cord_resolve_integracion('shopify', ${shop})`;
    const orgId = (dueno?.org_id as string | undefined) ?? null;

    if (COMPLIANCE.has(topic)) {
        // Cord no guarda datos de compradores de la tienda: su catálogo y sus
        // clientes se copian al espacio del negocio, que es quien responde por
        // ellos. Se deja constancia y se acusa recibo, como Shopify pide.
        log.info('webhook de privacidad de Shopify', { route: 'shopify-webhook', topic, shop, org: orgId ?? 'sin_conexion' });
        if (orgId) {
            await withOrgTx(orgId, sql`
                insert into audit_log (org_id, actor, accion, entidad, entidad_id, detalle)
                values (${orgId}, 'shopify', 'integracion.shopify_privacidad', 'org', ${orgId}, ${topic})`);
        }
        return json({ ok: true });
    }

    if (!orgId) return json({ ok: true, ignorado: 'sin_conexion' });

    let payload: any = null;
    try { payload = JSON.parse(raw); } catch { return json({ ok: true, ignorado: 'cuerpo' }); }

    if (topic === 'app/uninstalled') {
        await reqContext.run({ userId: null, orgId, actor: 'shopify' }, () => marcarDesinstalada(orgId));
        return json({ ok: true });
    }

    // Shopify corta a los 5 segundos y reintenta: se acusa recibo y el trabajo
    // sigue después, igual que el resto de los webhooks de Cord.
    after(reqContext.run({ userId: null, orgId, actor: 'shopify' }, () => aplicarWebhook(orgId, topic, payload)));
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
