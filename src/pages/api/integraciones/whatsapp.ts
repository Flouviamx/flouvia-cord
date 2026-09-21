// /api/integraciones/whatsapp — conexión de WhatsApp Business (Cloud API).
//   PATCH { phone_id, token?, plantilla, idioma } → { ok }
//   POST  { telefono }                            → manda una prueba
//   DELETE                                        → desconecta
//
// El token se guarda CIFRADO y nunca se devuelve: la UI solo sabe si hay uno.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { encryptRequiredSecret } from '../../../lib/crypto-secret';
import { strictRateLimit, strictLimitResponse } from '../../../lib/ratelimit';
import { sendWhatsAppTemplate, toE164 } from '../../../lib/whatsapp';
import { currentLocale } from '../../../lib/context';
import { t } from '../../../i18n/app';

const ID_RE = /^[0-9]{5,25}$/;
const PLANTILLA_RE = /^[a-z0-9_]{1,512}$/;
const IDIOMA_RE = /^[a-z]{2}(_[A-Z]{2})?$/;

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    let body: any;
    try { body = await request.json(); } catch { return json({ error: t(L, 'wa.err.json') }, 400); }

    const phoneId = String(body?.phone_id ?? '').trim();
    const plantilla = String(body?.plantilla ?? '').trim().toLowerCase();
    const idioma = String(body?.idioma ?? '').trim() || 'es_MX';
    const token = typeof body?.token === 'string' ? body.token.trim() : '';

    if (!ID_RE.test(phoneId)) return json({ error: t(L, 'wa.err.phone_id') }, 400);
    if (!PLANTILLA_RE.test(plantilla)) return json({ error: t(L, 'wa.err.plantilla') }, 400);
    if (!IDIOMA_RE.test(idioma)) return json({ error: t(L, 'wa.err.idioma') }, 400);

    const orgId = await getActiveOrgId();
    const [[actual]] = await withOrgTx(orgId, sql`select whatsapp_token_enc from orgs where id = ${orgId}`);
    // Un PATCH sin token conserva el que ya había: la UI no lo recibe, así que
    // exigirlo en cada guardado obligaría a repegarlo para cambiar la plantilla.
    if (!token && !actual?.whatsapp_token_enc) return json({ error: t(L, 'wa.err.token') }, 400);
    const guardado = token ? encryptRequiredSecret(token) : (actual.whatsapp_token_enc as string);

    await withOrgTx(orgId, sql`
        update orgs set whatsapp_phone_id = ${phoneId}, whatsapp_token_enc = ${guardado},
               whatsapp_plantilla = ${plantilla}, whatsapp_plantilla_idioma = ${idioma}
         where id = ${orgId}`);
    await logAudit(orgId, {
        accion: 'integracion.whatsapp', entidad: 'org', entidad_id: orgId,
        detalle: token ? 'Conectó o rotó el token de WhatsApp' : 'Actualizó la plantilla de WhatsApp', ip: reqIp(request),
    });
    return json({ ok: true });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const L = currentLocale();
    const orgId = await getActiveOrgId();
    // Mandar un WhatsApp cuesta dinero en la cuenta de Meta del negocio: la
    // prueba lleva su propio tope, más estrecho que el del workflow.
    const limitado = strictLimitResponse(await strictRateLimit(`wa-test:${orgId}`, 5, 3600));
    if (limitado) return limitado;

    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const telefono = toE164(body?.telefono);
    if (!telefono) return json({ error: t(L, 'wa.err.numero') }, 400);

    const r = await sendWhatsAppTemplate(orgId, telefono, [t(L, 'wa.test.var')]);
    if (!r.ok) {
        const clave = r.reason === 'sin_config' ? 'wa.err.sin_config'
            : r.reason === 'plantilla' ? 'wa.err.plantilla_rechazo' : 'wa.err.envio';
        return json({ error: t(L, clave as any) }, 400);
    }
    return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    await withOrgTx(orgId, sql`
        update orgs set whatsapp_phone_id = null, whatsapp_token_enc = null,
               whatsapp_plantilla = null, whatsapp_plantilla_idioma = null
         where id = ${orgId}`);
    await logAudit(orgId, { accion: 'integracion.whatsapp_desconectada', entidad: 'org', entidad_id: orgId, detalle: 'Desconectó WhatsApp', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
