// Alta de una passkey de Cord Ops. Solo desde una sesión Ops recién
// autenticada (contraseña + TOTP o passkey de Ops): una sesión normal de la app
// nunca llega aquí, y la llave queda ligada al rpID `ops.cordhq.app`.
export const prerender = false;

import type { APIRoute } from 'astro';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { sql } from '../../../../lib/db';
import { log } from '../../../../lib/log';
import {
    OPS_PASSKEY_LIMIT,
    OPS_PASSKEY_REGISTER_COOKIE,
    OPS_RP_ID,
    createOpsPasskeyChallenge,
    opsChallengeCookieOptions,
    requireFreshOpsAuth,
} from '../../../../lib/ops-auth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ cookies, locals }) => {
    const operator = locals.opsOperator;
    if (!operator) return json({ error: 'No autenticado' }, 401);
    const stale = requireFreshOpsAuth(operator);
    if (stale) return stale;

    try {
        const existing = await sql`select id, transports from ops_passkeys where operator_id = ${operator.userId}`;
        if (existing.length >= OPS_PASSKEY_LIMIT) {
            return json({ error: `Ya tienes ${OPS_PASSKEY_LIMIT} passkeys de Ops. Elimina una antes de agregar otra.` }, 409);
        }
        const options = await generateRegistrationOptions({
            rpName: 'Cord Ops',
            rpID: OPS_RP_ID,
            userID: new TextEncoder().encode(operator.userId),
            userName: operator.email,
            userDisplayName: `${operator.email} (Cord Ops)`,
            attestationType: 'none',
            excludeCredentials: existing.map((row: any) => ({
                id: row.id as string,
                transports: Array.isArray(row.transports) && row.transports.length ? row.transports : undefined,
            })),
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'required',
            },
            timeout: 60_000,
        });
        await createOpsPasskeyChallenge(options.challenge, operator.userId, 'register');
        cookies.set(OPS_PASSKEY_REGISTER_COOKIE, options.challenge, opsChallengeCookieOptions());
        return json(options);
    } catch (error) {
        log.error('error no controlado', { route: 'ops/passkeys/register-options', err: error });
        return json({ error: 'No se pudo iniciar el registro de la passkey.' }, 500);
    }
};
