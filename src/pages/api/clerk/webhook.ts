// POST /api/clerk/webhook
// Recibe eventos de Clerk (user.created, user.deleted) verificados con HMAC-SHA256
// vía la cabecera Svix. Requiere CLERK_WEBHOOK_SECRET en las env vars.
//
// Configurar en: Clerk Dashboard → Webhooks → Add endpoint
//   URL: https://trato.flouvia.com/api/clerk/webhook
//   Eventos: user.created, user.deleted

export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

async function verifyClerkWebhook(request: Request, secret: string): Promise<any> {
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Faltan cabeceras svix');
    }

    // Svix rechaza timestamps con >5 min de diferencia (anti-replay)
    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
        throw new Error('Timestamp expirado');
    }

    const body = await request.text();
    const toSign = `${svixId}.${svixTimestamp}.${body}`;

    // El secret tiene el prefijo "whsec_" seguido de la clave en base64
    const keyBytes = Uint8Array.from(atob(secret.replace('whsec_', '')), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
        'raw', keyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['verify'],
    );
    const msgBuffer = new TextEncoder().encode(toSign);

    // svix-signature puede contener múltiples firmas: "v1,sig1 v1,sig2"
    for (const sig of svixSignature.split(' ')) {
        const [version, b64] = sig.split(',');
        if (version !== 'v1' || !b64) continue;
        const sigBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, msgBuffer);
        if (valid) return JSON.parse(body);
    }
    throw new Error('Firma inválida');
}

export const POST: APIRoute = async ({ request }) => {
    const secret = import.meta.env.CLERK_WEBHOOK_SECRET || process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        return new Response('CLERK_WEBHOOK_SECRET no configurada', { status: 500 });
    }

    let event: { type: string; data: Record<string, any> };
    try {
        event = await verifyClerkWebhook(request.clone(), secret);
    } catch (e: any) {
        console.error('[clerk/webhook] verificación fallida:', e.message);
        return new Response('Firma inválida', { status: 401 });
    }

    const { type, data } = event;

    // ── user.created: pre-crear la org en Neon ───────────────────────────────
    // getActiveOrgId() ya lo hace en el primer login, pero hacerlo aquí acelera
    // la primera carga del dashboard (la org ya existe cuando llegan a /app).
    if (type === 'user.created') {
        const userId = data.id as string;
        await sql`
            insert into orgs (clerk_user_id, nombre)
            values (${userId}, ${'Mi negocio'})
            on conflict (clerk_user_id) do nothing`;
    }

    // ── user.deleted: anonimizar datos (no borrar — compliance) ─────────────
    if (type === 'user.deleted') {
        const userId = data.id as string;
        await sql`
            update orgs
            set nombre = '[cuenta eliminada]', rfc = null, logo_url = null
            where clerk_user_id = ${userId}`;
    }

    return new Response('ok', { status: 200 });
};
