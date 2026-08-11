export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { sql, getActiveOrgId } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';

// Crea una sesión efímera de verificación "continúa en tu teléfono" (estilo
// Stripe Identity): el escritorio pide una sesión, se la muestra al usuario
// como QR + link, y el celular la resuelve sin sesión (el token
// aleatorio ES la credencial — ver identity_capture_sessions en schema.sql).
const TTL_MS = 10 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'capture-session', orgId, 8);
    if (limited) return limited;
    const [org] = await sql`select stripe_account_id from orgs where id = ${orgId}`;
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json().catch(() => ({}));
    const personId = typeof data.personId === 'string' && data.personId ? data.personId : null;
    const isCompanyDoc = !!data.isCompanyDoc;
    if (!isCompanyDoc && !personId) {
        return new Response(JSON.stringify({ error: 'Falta personId para el documento del representante' }), { status: 400 });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);

    await sql`
        insert into identity_capture_sessions (token_hash, org_id, stripe_account_id, person_id, is_company_doc, expires_at)
        values (${tokenHash}, ${orgId}, ${org.stripe_account_id}, ${personId}, ${isCompanyDoc}, ${expiresAt.toISOString()})
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

    await auditConnect(orgId, request, 'captura_movil_creada', { entity: 'identity_capture', detail: isCompanyDoc ? 'empresa' : 'persona' });

    return new Response(JSON.stringify({ ok: true, token, url, qrSvg, expiresAt: expiresAt.toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
    });
};
