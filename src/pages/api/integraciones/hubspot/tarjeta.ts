// GET /api/integraciones/hubspot/tarjeta?objeto=deal|company|contact&id=<id>&lang=es|en
// Lo llama la tarjeta de Cord dentro de HubSpot con `hubspot.fetch`. Sin sesión:
// la credencial es la firma v3 con el secreto de la app, y HubSpot agrega el
// `portalId` que resuelve la organización.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import { rateLimit, tooMany } from '../../../../lib/ratelimit';
import { hubspotCredentials } from '../../../../lib/integraciones/hubspot/config';
import { verifyHubSpotSignature } from '../../../../lib/integraciones/hubspot/webhook';
import { armarTarjeta, type ObjetoHubSpot } from '../../../../lib/integraciones/hubspot/tarjeta';
import { siteOrigin } from '../../../../lib/email';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const OBJETOS = new Set<ObjetoHubSpot>(['deal', 'company', 'contact']);

export const GET: APIRoute = async ({ request }) => {
    const creds = hubspotCredentials();
    if (!creds) return json({ error: 'unavailable' }, 503);

    const url = new URL(request.url);
    const site = String(import.meta.env.SITE ?? '').trim().replace(/\/+$/, '');
    const valid = verifyHubSpotSignature({
        secret: creds.clientSecret,
        method: 'GET',
        uris: [request.url, ...(site ? [`${site}${url.pathname}${url.search}`] : [])],
        body: '',
        signature: request.headers.get('x-hubspot-signature-v3'),
        timestamp: request.headers.get('x-hubspot-request-timestamp'),
    });
    if (!valid) return json({ error: 'invalid_signature' }, 401);

    const portalId = url.searchParams.get('portalId') ?? '';
    const objeto = url.searchParams.get('objeto') as ObjetoHubSpot;
    const externoId = url.searchParams.get('id') ?? '';
    const idioma = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
    if (!/^\d{1,20}$/.test(portalId) || !OBJETOS.has(objeto) || !/^\d{1,20}$/.test(externoId)) {
        return json({ error: 'invalid_request' }, 400);
    }

    const rl = await rateLimit(`hubspot-tarjeta:${portalId}`, 240, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const [cx] = await sql`select org_id, conexion_id from cord_resolve_integracion('hubspot', ${portalId})`;
    if (!cx) return json({ conectado: false });

    try {
        const tarjeta = await armarTarjeta({
            orgId: String(cx.org_id), conexionId: String(cx.conexion_id), objeto, externoId, idioma, origen: siteOrigin(),
        });
        return json({ conectado: true, ...tarjeta });
    } catch (err) {
        log.error('no se pudo armar la tarjeta de HubSpot', { route: 'hubspot-tarjeta', portalId, err });
        return json({ error: 'server_error' }, 500);
    }
};
