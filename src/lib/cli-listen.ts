// Sesiones de `cord listen` (solo sandbox). Un endpoint efímero recibe los
// eventos por el outbox real; no sale por HTTP y el CLI los recoge firmados.
import { randomBytes } from 'node:crypto';
import { sql, withOrgTx } from './db';
import { encryptRequiredSecret } from './crypto-secret';
import { LATEST_API_VERSION } from './api-versions';
import { assertSandbox } from './sandbox-sim';
import { isWebhookEventType } from '../../packages/elements/src/contract/webhook-events';

export const CLI_SESSION_HOURS = 24;
export const MAX_CLI_SESSIONS_PER_KEY = 3;
const CLI_URL = 'https://cli.cordhq.app/listen';

export async function openCliSession(orgId: string, keyId: string, eventos: unknown) {
    await assertSandbox(orgId);
    const lista = Array.isArray(eventos) ? [...new Set(eventos.filter((e): e is string => typeof e === 'string' && isWebhookEventType(e)))] : [];
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const [, , inserted] = await withOrgTx(orgId,
        sql`select pg_advisory_xact_lock(hashtextextended(${'cli-listen:' + keyId}, 0))`,
        sql`delete from webhooks where org_id = ${orgId} and created_by_key = ${keyId} and cli_hasta is not null and cli_hasta < now()`,
        sql`
            insert into webhooks (org_id, url, eventos, secret, secret_enc, created_by_key, api_version, cli_hasta)
            select ${orgId}, ${CLI_URL}, ${JSON.stringify(lista)}::jsonb, null, ${encryptRequiredSecret(secret)}, ${keyId}, ${LATEST_API_VERSION},
                   now() + make_interval(hours => ${CLI_SESSION_HOURS})
             where (select count(*) from webhooks where org_id = ${orgId} and created_by_key = ${keyId} and cli_hasta > now()) < ${MAX_CLI_SESSIONS_PER_KEY}
            returning id, cli_hasta`,
    );
    const row = inserted[0];
    if (!row) return null;
    return { id: row.id as string, secret, eventos: lista, expira: row.cli_hasta as string };
}

export async function closeCliSession(orgId: string, keyId: string, id: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        delete from webhooks where id = ${id} and org_id = ${orgId} and created_by_key = ${keyId} and cli_hasta is not null returning id`);
    return rows.length > 0;
}

export async function ownsCliSession(orgId: string, keyId: string, id: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        select id from webhooks where id = ${id} and org_id = ${orgId} and created_by_key = ${keyId} and cli_hasta > now()`);
    return rows.length > 0;
}
