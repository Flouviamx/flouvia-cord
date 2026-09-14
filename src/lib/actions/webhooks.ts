import { randomBytes } from 'node:crypto';
import { sql, withOrgTx } from '../db';
import { webhookLimit, planLabel } from '../permissions';
import { WEBHOOK_EVENT_IDS } from '../webhooks';
import { validateWebhookUrl } from '../ssrf';
import { encryptRequiredSecret } from '../crypto-secret';
import { getEntitlementContext } from '../org-entitlements';
import { type ActionContext, type ActionOutcome, auditAction, done, isUuid } from './outcome';

export function cleanWebhookEvents(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return [...new Set(v.map(String).filter((e) => WEBHOOK_EVENT_IDS.includes(e)))];
}

export async function createWebhookEndpoint(
    ctx: ActionContext,
    input: { url?: unknown; eventos?: unknown },
    createdByKey: string | null = null,
): Promise<ActionOutcome> {
    const url = String(input.url ?? '').trim();
    const urlCheck = validateWebhookUrl(url);
    if (!urlCheck.ok) return done(400, { error: urlCheck.error, code: 'invalid_url' });
    if (input.eventos !== undefined && !Array.isArray(input.eventos)) {
        return done(400, { error: 'eventos debe ser una lista', code: 'invalid_request' });
    }

    const plan = (await getEntitlementContext(ctx.orgId)).effectivePlan;
    const limite = webhookLimit(plan as string);
    const eventos = cleanWebhookEvents(input.eventos);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    let secretEnc: string;
    try {
        secretEnc = encryptRequiredSecret(secret);
    } catch {
        return done(503, { error: 'El servicio de cifrado no está disponible', code: 'unavailable' });
    }

    let row: any;
    try {
        const [, inserted] = await withOrgTx(
            ctx.orgId,
            sql`select pg_advisory_xact_lock(hashtextextended(${'webhooks:' + ctx.orgId}, 0))`,
            sql`
                insert into webhooks (org_id, url, eventos, secret, secret_enc, created_by_key)
                select ${ctx.orgId}, ${url}, ${JSON.stringify(eventos)}::jsonb, null, ${secretEnc}, ${createdByKey}
                 where (select count(*) from webhooks where org_id = ${ctx.orgId}) < ${limite}
                returning id`,
        );
        [row] = inserted;
    } catch {
        return done(500, { error: 'No se pudo crear el webhook.', code: 'server_error' });
    }
    if (!row) {
        return done(403, {
            error: `Tu plan ${planLabel(plan as string)} permite ${limite} webhook${limite === 1 ? '' : 's'}. Elimina uno o sube de plan para agregar más.`,
            code: 'plan_limit_reached',
        });
    }
    await auditAction(ctx, 'webhook.creado', 'webhook', row.id as string, url);
    return done(200, { id: row.id, url, eventos, secret });
}

export async function listApiWebhooks(ctx: ActionContext, keyId: string) {
    const [rows] = await withOrgTx(ctx.orgId, sql`
        select id, url, eventos, activo, created_at
          from webhooks
         where org_id = ${ctx.orgId} and created_by_key = ${keyId}
         order by created_at desc`);
    return rows.map((w) => ({
        id: w.id as string,
        url: w.url as string,
        eventos: Array.isArray(w.eventos) ? w.eventos : [],
        activo: w.activo === true,
        created_at: new Date(w.created_at as string).toISOString(),
    }));
}

export async function deleteWebhookEndpoint(ctx: ActionContext, id: string, onlyKey: string | null = null): Promise<ActionOutcome> {
    const noEncontrado = done(404, { error: 'Webhook no encontrado', code: 'not_found' });
    if (!isUuid(id)) return noEncontrado;
    const [rows] = onlyKey
        ? await withOrgTx(ctx.orgId, sql`delete from webhooks where id = ${id} and org_id = ${ctx.orgId} and created_by_key = ${onlyKey} returning url`)
        : await withOrgTx(ctx.orgId, sql`delete from webhooks where id = ${id} and org_id = ${ctx.orgId} returning url`);
    if (!rows.length) return noEncontrado;
    await auditAction(ctx, 'webhook.eliminado', 'webhook', id, rows[0].url as string);
    return done(200, { ok: true });
}
