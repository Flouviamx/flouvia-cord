import { createHash } from 'node:crypto';
import { sql, withOrgTx } from './db';
import { log } from './log';

export interface IdempotencyOwner {
    orgId: string;
    keyId: string;
}

const KEY_RE = /^[\x21-\x7e]{1,255}$/;
const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MAX_STORED_BODY = 256_000;

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });

export async function runIdempotent(
    owner: IdempotencyOwner,
    request: Request,
    execute: () => Promise<Response>,
): Promise<Response> {
    const method = request.method.toUpperCase();
    const key = request.headers.get('idempotency-key');
    if (!MUTATIONS.has(method) || key === null) return execute();
    if (!KEY_RE.test(key)) {
        return json({ error: 'Idempotency-Key debe tener entre 1 y 255 caracteres visibles.', code: 'invalid_idempotency_key' }, 400);
    }

    const path = new URL(request.url).pathname;
    const raw = await request.clone().text();
    const hash = createHash('sha256').update(`${method} ${path}\n${raw}`).digest('hex');

    let claimed: Record<string, any>[];
    let existing: Record<string, any> | undefined;
    try {
        [, claimed] = await withOrgTx(owner.orgId,
            sql`delete from api_idempotency
                 where key_id = ${owner.keyId} and idempotency_key = ${key}
                   and (created_at < now() - interval '24 hours'
                        or (completed_at is null and created_at < now() - interval '10 minutes'))`,
            sql`insert into api_idempotency (org_id, key_id, idempotency_key, method, path, request_hash)
                values (${owner.orgId}, ${owner.keyId}, ${key}, ${method}, ${path}, ${hash})
                on conflict (key_id, idempotency_key) do nothing
                returning id`);
        if (!claimed.length) {
            [[existing]] = await withOrgTx(owner.orgId, sql`
                select method, path, request_hash, status, response_body, completed_at
                  from api_idempotency
                 where key_id = ${owner.keyId} and idempotency_key = ${key}`);
        }
    } catch (err) {
        log.error('no se pudo reservar la Idempotency-Key', { route: 'api-idempotency', err });
        return json({ error: 'No pudimos garantizar la idempotencia de esta petición. Intenta de nuevo.', code: 'idempotency_unavailable' }, 503);
    }

    if (!claimed.length) {
        if (!existing) return json({ error: 'La operación con esta Idempotency-Key sigue en proceso.', code: 'idempotency_in_progress' }, 409);
        if (existing.request_hash !== hash || existing.method !== method || existing.path !== path) {
            return json({ error: 'Esta Idempotency-Key ya se usó con otra petición.', code: 'idempotency_key_reused' }, 422);
        }
        if (!existing.completed_at) {
            return json({ error: 'La operación con esta Idempotency-Key sigue en proceso.', code: 'idempotency_in_progress' }, 409);
        }
        return new Response(existing.response_body as string, {
            status: Number(existing.status),
            headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
        });
    }

    const claimId = claimed[0].id as string;
    let response: Response;
    try {
        response = await execute();
    } catch (err) {
        await release(owner, claimId);
        throw err;
    }

    const body = await response.clone().text();
    if (response.status >= 500 || response.status === 429 || body.length > MAX_STORED_BODY) {
        await release(owner, claimId);
        return response;
    }
    try {
        await withOrgTx(owner.orgId, sql`
            update api_idempotency
               set status = ${response.status}, response_body = ${body}, completed_at = now()
             where id = ${claimId}`);
    } catch (err) {
        log.error('no se pudo guardar la respuesta idempotente', { route: 'api-idempotency', err });
    }
    return response;
}

async function release(owner: IdempotencyOwner, claimId: string) {
    try {
        await withOrgTx(owner.orgId, sql`delete from api_idempotency where id = ${claimId} and completed_at is null`);
    } catch (err) {
        log.error('no se pudo liberar la Idempotency-Key', { route: 'api-idempotency', err });
    }
}
