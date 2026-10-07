export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import { trustedIp } from '../../../../lib/ip';
import { sendOpsPasskeyAddedEmail } from '../../../../lib/auth-email';
import {
    OPS_ORIGIN,
    OPS_PASSKEY_LIMIT,
    OPS_PASSKEY_REGISTER_COOKIE,
    OPS_RP_ID,
    consumeOpsPasskeyChallenge,
    opsCookieDeleteOptions,
    requireFreshOpsAuth,
} from '../../../../lib/ops-auth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const TRANSPORTS = new Set(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    const stale = requireFreshOpsAuth(operator);
    if (stale) return stale;

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 65_536) return json({ error: 'Solicitud inválida' }, 400);

    const expectedChallenge = cookies.get(OPS_PASSKEY_REGISTER_COOKIE)?.value;
    cookies.delete(OPS_PASSKEY_REGISTER_COOKIE, opsCookieDeleteOptions());
    let challengedOperatorId: string | null = null;
    try {
        challengedOperatorId = await consumeOpsPasskeyChallenge(expectedChallenge, 'register');
    } catch (error) {
        log.error('error no controlado', { route: 'ops/passkeys/register-challenge', err: error });
        return json({ error: 'No se pudo registrar la passkey.' }, 500);
    }
    if (!expectedChallenge || challengedOperatorId !== operator.userId) {
        return json({ error: 'El registro venció. Inténtalo de nuevo.' }, 400);
    }

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'Solicitud inválida' }, 400); }
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 80) : '';

    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response: body?.credential,
            expectedChallenge,
            expectedOrigin: OPS_ORIGIN,
            expectedRPID: OPS_RP_ID,
            requireUserVerification: true,
        });
    } catch {
        // El mensaje de la librería describe el mecanismo, no el estado (regla 14).
        return json({ error: 'El dispositivo no pudo confirmar la passkey. Inténtalo de nuevo.' }, 400);
    }
    if (!verification.verified || !verification.registrationInfo) {
        return json({ error: 'El dispositivo no pudo confirmar la passkey. Inténtalo de nuevo.' }, 400);
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const transports = (credential.transports || []).filter((t: string) => TRANSPORTS.has(t));
    const ip = trustedIp(request);
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    try {
        // El tope se revalida dentro del INSERT: dos altas simultáneas no lo
        // rebasan. La bitácora sale de la misma sentencia y solo si hubo alta.
        const inserted = await sql`
            with ins as (
                insert into ops_passkeys (id, operator_id, public_key, counter, transports, device_type, backed_up, nombre)
                select ${credential.id}, ${operator.userId}, ${Buffer.from(credential.publicKey).toString('base64url')},
                       ${credential.counter}, ${transports}::text[], ${credentialDeviceType}, ${credentialBackedUp},
                       ${nombre || null}
                where (select count(*) from ops_passkeys where operator_id = ${operator.userId}) < ${OPS_PASSKEY_LIMIT}
                on conflict (id) do nothing
                returning id
            ), audit as (
                insert into ops_audit_log (actor_operator_id, actor_email, action, target_type, target_id, result, metadata, ip, user_agent)
                select ${operator.userId}, ${operator.email}, 'ops.passkey_registered', 'ops_passkey', left(ins.id, 16), 'success',
                       ${JSON.stringify({ device_type: credentialDeviceType, backed_up: credentialBackedUp })}::jsonb,
                       ${ip}, ${userAgent}
                from ins
            )
            select id from ins
        `;
        if (!inserted.length) {
            return json({ error: 'No se pudo guardar la passkey: ya está registrada o llegaste al tope.' }, 409);
        }
        sendOpsPasskeyAddedEmail(operator.email, ip, userAgent).catch(() => null);
        return json({ success: true });
    } catch (error) {
        log.error('error no controlado', { route: 'ops/passkeys/register', err: error });
        return json({ error: 'No se pudo guardar la passkey.' }, 500);
    }
};
