export const prerender = false;

import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentUserId } from '../../../../lib/context';
import { retrieveAccount, stripe } from '../../../../lib/billing';
import { exigePasaporte } from '../../../../lib/identity-documents';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { requireFreshAuth } from '../../../../lib/step-up';
import { resolvePersona } from '../../../../lib/connect-personas';

// Crea una sesión efímera de verificación "continúa en tu teléfono" (estilo
// Stripe Identity): el escritorio pide una sesión, se la muestra al usuario
// como QR + link, y el celular la resuelve sin sesión (el token
// aleatorio ES la credencial — ver identity_capture_sessions en schema.sql).
// Vida ABSOLUTA del enlace. Sube de 10 a 30 minutos porque el fallo real más
// frecuente no es el abuso: es "expiró mientras buscaba mi identificación". Lo
// que de verdad acota una filtración es el binding de dispositivo y el tope de
// intentos, no un TTL corto — que sólo castiga al usuario legítimo.
const TTL_MS = 30 * 60 * 1000;
/** Desde el PRIMER uso, la ventana se cierra mucho antes que el TTL absoluto. */
export const VENTANA_USO_MS = 15 * 60 * 1000;

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'capture-session', orgId, 8);
    if (limited) return limited;
    // Este endpoint ACUÑA una credencial portadora: quien tenga el token puede
    // subir imágenes de identidad a la cuenta conectada sin sesión. Emitirla
    // pide reautenticación reciente, igual que cambiar la cuenta de depósito.
    const stale = await requireFreshAuth();
    if (stale) return stale;
    const [orgRows] = await withOrgTx(orgId, sql`select stripe_account_id from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (!org?.stripe_account_id) return new Response(JSON.stringify({ error: 'No account' }), { status: 400 });

    const data = await request.json().catch(() => ({}));
    const personId = typeof data.personId === 'string' && data.personId ? data.personId : null;
    const isCompanyDoc = !!data.isCompanyDoc;
    if (!isCompanyDoc && !personId) {
        return new Response(JSON.stringify({ error: 'Falta personId para el documento del representante' }), { status: 400 });
    }

    // El `personId` llegaba del body como texto libre y se persistía sin
    // comprobar nada: una sesión de captura podía quedar apuntando a una persona
    // de OTRA organización, y el único freno era que el proveedor devolviera 404
    // al momento de adjuntar. Ahora se resuelve contra `connect_personas` dentro
    // del carril de la organización, y se guarda la FK — así el endpoint público
    // de captura deriva la persona de la FILA, nunca de lo que le manden.
    let personaId: string | null = null;
    if (personId) {
        const persona = await resolvePersona(orgId, personId);
        if (!persona) {
            return new Response(JSON.stringify({ error: 'Esa persona no existe en tu cuenta' }), { status: 404 });
        }
        personaId = persona.id;
    }

    // ── Regla transfronteriza, resuelta aquí y no persistida ────────────────
    //
    // El proveedor lo dice literal: «si el país de residencia difiere del país de
    // la cuenta, se requerirá un pasaporte». Ofrecerle una INE a quien vive fuera
    // de México lo manda a un rechazo garantizado.
    //
    // Ambos países se leen EN VIVO del proveedor y sólo se guarda la pista. Cord
    // no persiste el domicilio de nadie a propósito, y una pista de una palabra
    // en una fila que muere en 30 minutos no es persistir un domicilio.
    let docHint: string | null = null;
    try {
        const cuenta = await retrieveAccount(org.stripe_account_id as string);
        const paisCuenta = String(cuenta?.country || '').toUpperCase();
        let paisPersona = String(cuenta?.individual?.address?.country || '').toUpperCase();
        if (personId) {
            const persona = await stripe(`/v1/accounts/${org.stripe_account_id}/persons/${personId}`, undefined, 'GET');
            paisPersona = String(persona?.address?.country || paisPersona).toUpperCase();
        }
        if (exigePasaporte(paisCuenta, paisPersona)) docHint = 'pasaporte';
    } catch {
        // Sin la pista, la UI ofrece el catálogo normal del país. Es una guía, no
        // un gate: quién decide qué falta sigue siendo `requirements`.
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + TTL_MS);

    // `created_by` cierra la cadena de custodia: el POST público no tiene sesión,
    // así que su auditoría caía a `actor = 'system'` y nada enlazaba "quién pidió
    // el enlace" con "quién subió la foto".
    await withOrgTx(orgId, sql`
        insert into identity_capture_sessions
            (token_hash, org_id, stripe_account_id, person_id, persona_id, is_company_doc, expires_at, created_by, doc_hint)
        values (${tokenHash}, ${orgId}, ${org.stripe_account_id}, ${personId}, ${personaId}, ${isCompanyDoc}, ${expiresAt.toISOString()}, ${currentUserId()}, ${docHint})
    `);

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
