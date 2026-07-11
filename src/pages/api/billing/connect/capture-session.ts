export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';

// Crea una sesión efímera de verificación "continúa en tu teléfono" (estilo
// Stripe Identity): el escritorio pide una sesión, se la muestra al usuario
// como QR + link, y el celular la resuelve sin sesión de Clerk (el token
// aleatorio ES la credencial — ver identity_capture_sessions en schema.sql).
const TTL_MS = 10 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json().catch(() => ({}));
    const personId = typeof data.personId === 'string' && data.personId ? data.personId : null;
    const isCompanyDoc = !!data.isCompanyDoc;
    if (!isCompanyDoc && !personId) {
        return new Response(JSON.stringify({ error: 'Falta personId para el documento del representante' }), { status: 400 });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_MS);

    await sql`
        insert into identity_capture_sessions (token, org_id, stripe_account_id, person_id, is_company_doc, expires_at)
        values (${token}, ${orgId}, ${org.stripe_account_id}, ${personId}, ${isCompanyDoc}, ${expiresAt.toISOString()})
    `;

    const origin = new URL(request.url).origin;
    const url = `${origin}/verificar-identidad/${token}`;

    let qrSvg = '';
    try {
        qrSvg = await QRCode.toString(url, {
            type: 'svg',
            margin: 1,
            color: { dark: '#0a192f', light: '#0000' },
        });
    } catch {
        // El QR es decorativo — si falla, el link copiable sigue funcionando.
    }

    return new Response(JSON.stringify({ ok: true, token, url, qrSvg, expiresAt: expiresAt.toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
    });
};
