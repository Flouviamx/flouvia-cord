export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { sql, withCaptureToken } from '../../../../../lib/db';
import { stripeUpload, attachPersonDocument, attachPersonAdditionalDocument, retrieveAccount, updateConnectAccount, isAlreadyVerifiedError } from '../../../../../lib/billing';
import { translateStripeError } from '../../../../../lib/stripe-catalogs';
import { guardUpload } from '../../../../../lib/upload-guard';
import { auditConnect } from '../../../../../lib/connect-audit';
import { limitConnectMutation, limitConnectRead } from '../../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../../lib/connect-fields';

// Ruta PÚBLICA (sin sesión) — el celular la abre al escanear el QR
// generado en /api/billing/connect/capture-session. El token es la única
// credencial: aleatorio, expira a los 10 min, y deja de aceptar subidas una
// vez que el mínimo requerido (frente + selfie) ya se completó.
async function loadSession(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [[row]] = await withCaptureToken(token,
        sql`select * from identity_capture_sessions where token_hash = ${tokenHash}`,
    );
    if (!row) return { row: null, expired: false };
    const expired = new Date(row.expires_at as string).getTime() < Date.now();
    return { row, expired };
}

function publicState(row: any, org: any, expired: boolean) {
    return {
        ok: true,
        expired,
        status: row.status,
        captured: row.captured || {},
        org: { nombre: org?.nombre || 'tu proveedor', logoUrl: org?.logo_url || null, colorMarca: org?.color_marca || '#0a192f' },
    };
}

export const GET: APIRoute = async ({ params, request }) => {
    const token = params.token as string;
    const limited = await limitConnectRead(request, 'capture', token);
    if (limited) return limited;
    const { row, expired } = await loadSession(token);
    if (!row) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });

    const [org] = await sql`select nombre, logo_url, color_marca from orgs where id = ${row.org_id}`;
    return new Response(JSON.stringify(publicState(row, org, expired)), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ params, request }) => {
    const token = params.token as string;
    const limited = await limitConnectMutation(request, 'capture', token, 12);
    if (limited) return limited;
    const { row, expired } = await loadSession(token);
    if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    if (expired) return new Response(JSON.stringify({ error: 'expired' }), { status: 410 });
    if (row.status === 'completed') return new Response(JSON.stringify({ error: 'already_completed' }), { status: 409 });

    const formData = await request.formData();
    const part = formData.get('part') as string;
    const file = formData.get('file');
    if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    if (!['front', 'back', 'selfie'].includes(part)) return new Response(JSON.stringify({ error: 'Invalid part' }), { status: 400 });

    try {
        const guarded = await guardUpload(file, {
            maxBytes: 10 * 1024 * 1024,
            allowedMimes: ['image/jpeg', 'image/png'],
            prefix: part === 'selfie' ? 'selfie' : 'identity',
        });
        const stripeAccountId = row.stripe_account_id as string;
        const purpose = part === 'selfie' ? 'additional_verification' : 'identity_document';
        const uploaded = await stripeUpload(guarded.bytes, guarded.filename, guarded.mime, purpose, stripeAccountId);

        // La cuenta se retrieve-ea en vivo (no se confía en la columna local
        // stripe_business_type, que puede estar desactualizada) solo cuando el
        // doc va a nivel cuenta — y se reutiliza para el refresh de requisitos
        // de abajo en vez de pedirla dos veces.
        let account: any = null;
        try {
            if (row.is_company_doc) {
                account = await retrieveAccount(stripeAccountId);
                const prefix = account.business_type === 'individual' ? 'individual' : 'company';
                const field = part === 'selfie'
                    ? `${prefix}[verification][additional_document][front]`
                    : `${prefix}[verification][document][${part}]`;
                await updateConnectAccount(stripeAccountId, { [field]: uploaded.id });
            } else if (part === 'selfie') {
                await attachPersonAdditionalDocument(stripeAccountId, row.person_id as string, uploaded.id);
            } else {
                await attachPersonDocument(stripeAccountId, row.person_id as string, uploaded.id, part as 'front' | 'back');
            }
        } catch (attachErr: any) {
            if (!isAlreadyVerifiedError(attachErr?.message || '')) throw attachErr;
            // Ya estaba verificado en Stripe — no había nada que actualizar, se
            // acepta esta parte como completada de todas formas.
        }

        // Merge atómico en la BD (no read-modify-write en JS) — evita perder una
        // parte si dos subidas llegaran casi al mismo tiempo.
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const [[merged]] = await withCaptureToken(token, sql`
            update identity_capture_sessions
            set captured = captured || jsonb_build_object(${part}::text, true)
            where token_hash = ${tokenHash}
            returning captured
        `);
        const captured = merged.captured as { front?: boolean; back?: boolean; selfie?: boolean };
        // Completa con el mínimo requerido (frente + selfie); el reverso es
        // opcional (pasaporte) — igual que el flujo manual de escritorio.
        const status = captured.front && captured.selfie ? 'completed' : 'pending';
        await withCaptureToken(token,
            sql`update identity_capture_sessions set status = ${status} where token_hash = ${tokenHash}`,
        );

        const finalAccount = account || await retrieveAccount(stripeAccountId);
        await sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(finalAccount.requirements))} where id = ${row.org_id}`;
        await auditConnect(row.org_id as string, request, 'captura_movil_recibida', {
            entity: 'connect_document',
            entityId: uploaded.id,
            detail: part,
        });

        return new Response(JSON.stringify({ ok: true, captured, status }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: translateStripeError(e) || 'No se pudo subir el documento.' }), { status: 400 });
    }
};
