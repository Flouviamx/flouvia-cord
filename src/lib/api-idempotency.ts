import { createHash } from 'node:crypto';
import { sql, withOrgTx } from './db';
import { log } from './log';

export interface IdempotencyOwner {
    orgId: string;
    keyId: string;
}

export interface StoredResult {
    status: number;
    body: string;
}

export type IdempotentOutcome =
    | { kind: 'executed'; result: StoredResult }
    | { kind: 'replayed'; result: StoredResult }
    | { kind: 'rejected'; status: number; code: string; error: string };

const KEY_RE = /^[\x21-\x7e]{1,255}$/;
const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MAX_STORED_BODY = 256_000;

export const isValidIdempotencyKey = (key: string) => KEY_RE.test(key);

const rejected = (status: number, code: string, error: string): IdempotentOutcome => ({ kind: 'rejected', status, code, error });

export async function withIdempotency(
    owner: IdempotencyOwner,
    request: { key: string; method: string; path: string; payload: string },
    execute: () => Promise<StoredResult>,
): Promise<IdempotentOutcome> {
    const { key, method, path } = request;
    if (!KEY_RE.test(key)) return rejected(400, 'invalid_idempotency_key', 'La clave de idempotencia debe tener entre 1 y 255 caracteres visibles.');
    const hash = createHash('sha256').update(`${method} ${path}\n${request.payload}`).digest('hex');

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
        log.error('no se pudo reservar la clave de idempotencia', { route: 'api-idempotency', err });
        return rejected(503, 'idempotency_unavailable', 'No pudimos garantizar la idempotencia de esta petición. Intenta de nuevo.');
    }

    if (!claimed.length) {
        if (existing && (existing.request_hash !== hash || existing.method !== method || existing.path !== path)) {
            return rejected(422, 'idempotency_key_reused', 'Esta clave de idempotencia ya se usó con otra petición.');
        }
        if (!existing?.completed_at) {
            return rejected(409, 'idempotency_in_progress', 'La operación con esta clave de idempotencia sigue en proceso.');
        }
        return { kind: 'replayed', result: { status: Number(existing.status), body: existing.response_body as string } };
    }

    const claimId = claimed[0].id as string;
    let result: StoredResult;
    try {
        result = await execute();
    } catch (err) {
        await release(owner, claimId);
        throw err;
    }

    if (result.status >= 500 || result.status === 429 || result.body.length > MAX_STORED_BODY) {
        await release(owner, claimId);
        return { kind: 'executed', result };
    }
    try {
        await withOrgTx(owner.orgId, sql`
            update api_idempotency
               set status = ${result.status}, response_body = ${result.body}, completed_at = now()
             where id = ${claimId}`);
    } catch (err) {
        log.error('no se pudo guardar la respuesta idempotente', { route: 'api-idempotency', err });
    }
    return { kind: 'executed', result };
}

export async function runIdempotent(
    owner: IdempotencyOwner,
    request: Request,
    execute: () => Promise<Response>,
): Promise<Response> {
    const method = request.method.toUpperCase();
    const key = request.headers.get('idempotency-key');
    if (!MUTATIONS.has(method) || key === null) return execute();

    let response: Response | null = null;
    const outcome = await withIdempotency(owner, {
        key, method, path: new URL(request.url).pathname, payload: await request.clone().text(),
    }, async () => {
        response = await execute();
        return { status: response.status, body: await response.clone().text() };
    });

    if (outcome.kind === 'rejected') {
        return new Response(JSON.stringify({ error: outcome.error, code: outcome.code }), {
            status: outcome.status, headers: { 'Content-Type': 'application/json' },
        });
    }
    if (outcome.kind === 'replayed') {
        return new Response(outcome.result.body, {
            status: outcome.result.status,
            headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
        });
    }
    return response!;
}

async function release(owner: IdempotencyOwner, claimId: string) {
    try {
        await withOrgTx(owner.orgId, sql`delete from api_idempotency where id = ${claimId} and completed_at is null`);
    } catch (err) {
        log.error('no se pudo liberar la clave de idempotencia', { route: 'api-idempotency', err });
    }
}
