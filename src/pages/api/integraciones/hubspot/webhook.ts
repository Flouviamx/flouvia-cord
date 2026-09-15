// /api/integraciones/hubspot/webhook — cambios de Empresas y Contactos enviados por HubSpot, firmados con v3.
export const prerender = false;

import type { APIRoute } from 'astro';
import { resolveIntegracion } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import { after } from '../../../../lib/after';
import { hubspotCredentials } from '../../../../lib/integraciones/hubspot/config';
import { parseHubSpotEvents, verifyHubSpotSignature } from '../../../../lib/integraciones/hubspot/webhook';
import { enqueueInbound, processOrgSync } from '../../../../lib/integraciones/sync';

const MAX_BODY_BYTES = 512 * 1024;

export const POST: APIRoute = async ({ request }) => {
    const creds = hubspotCredentials();
    if (!creds) return new Response('Unavailable', { status: 503 });

    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 });

    const url = new URL(request.url);
    const site = String(import.meta.env.SITE ?? '').trim().replace(/\/+$/, '');
    const uris = [request.url, ...(site ? [`${site}${url.pathname}${url.search}`] : [])];
    const valid = verifyHubSpotSignature({
        secret: creds.clientSecret,
        method: request.method,
        uris,
        body,
        signature: request.headers.get('x-hubspot-signature-v3'),
        timestamp: request.headers.get('x-hubspot-request-timestamp'),
    });
    if (!valid) return new Response('Invalid signature', { status: 401 });

    let payload: unknown;
    try {
        payload = JSON.parse(body);
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    const changes = parseHubSpotEvents(payload);
    const orgs = new Set<string>();
    const cuentas = new Map<string, Awaited<ReturnType<typeof resolveIntegracion>>>();
    try {
        for (const change of changes) {
            if (!cuentas.has(change.portalId)) cuentas.set(change.portalId, await resolveIntegracion('hubspot', change.portalId));
            const destino = cuentas.get(change.portalId);
            if (!destino) continue;
            if (await enqueueInbound(destino.orgId, destino.conexionId, change.objeto, change.objectId)) orgs.add(destino.orgId);
        }
    } catch (err) {
        log.error('no se pudieron encolar los cambios de HubSpot', { route: 'integraciones/hubspot/webhook', err });
        return new Response('Retry later', { status: 500 });
    }
    for (const orgId of orgs) after(processOrgSync(orgId));
    return new Response(null, { status: 204 });
};
