import { sql, withOrgTx } from './db';
import { currentActor, currentWorkflowDepth } from './context';
import { log } from './log';
import { after } from './after';
import { enqueueWorkflowRuns } from './workflows/queue';
import { integrationQueueStatement } from './integraciones/queue';

export const DOMAIN_EVENTS = {
    'quote.sent': { object: 'quote', public: true },
    'quote.viewed': { object: 'quote', public: true },
    'quote.approved': { object: 'quote', public: true },
    'quote.rejected': { object: 'quote', public: true },
    'quote.updated': { object: 'quote', public: true },
    'quote.expired': { object: 'quote', public: true },
    'quote.deleted': { object: 'quote', public: true },
    'quote.paid': { object: 'quote', public: true },
    'payment.partial': { object: 'quote', public: true },
    'payment.failed': { object: 'quote', public: true },
    'invoice.issued': { object: 'quote', public: true },
    'invoice.stamped': { object: 'quote', public: true },
    'invoice.finalized': { object: 'invoice', public: true },
    'invoice.sent': { object: 'invoice', public: true },
    'invoice.paid': { object: 'invoice', public: true },
    'invoice.payment_failed': { object: 'invoice', public: true },
    'invoice.voided': { object: 'invoice', public: true },
    'invoice.marked_uncollectible': { object: 'invoice', public: true },
    'invoice.overdue': { object: 'invoice', public: true },
    'quote.created': { object: 'quote', public: true },
    'quote.approval_requested': { object: 'quote', public: true },
    'quote.approval_decided': { object: 'quote', public: true },
    'quote.comment_added': { object: 'quote', public: true },
    'client.created': { object: 'client', public: true },
    'client.updated': { object: 'client', public: true },
    'client.deleted': { object: 'client', public: true },
    'product.created': { object: 'product', public: true },
    'product.updated': { object: 'product', public: true },
    'product.deleted': { object: 'product', public: true },
    'task.created': { object: 'task', public: true },
    'task.completed': { object: 'task', public: true },
    'promise.created': { object: 'promise', public: true },
    'promise.kept': { object: 'promise', public: true },
    'promise.broken': { object: 'promise', public: true },
    'dispute.created': { object: 'dispute', public: true },
    'dispute.closed': { object: 'dispute', public: true },
    'refund.succeeded': { object: 'refund', public: true },
    'refund.failed': { object: 'refund', public: true },
    'payout.paid': { object: 'payout', public: true },
    'payout.failed': { object: 'payout', public: true },
    'account.updated': { object: 'account', public: true },
    // Anclas de tiempo (sep 2026). Las emite /api/cron/anclas-tiempo una vez al
    // día para que un workflow pueda actuar ANTES de la fecha límite, no solo
    // cuando ya se cruzó. No son públicas: un suscriptor de webhooks recibiría
    // el mismo aviso todos los días, y el ciclo de vida ya lo cubren
    // `quote.expired` e `invoice.overdue`.
    'quote.expiring': { object: 'quote', public: false },
    'invoice.due_soon': { object: 'invoice', public: false },
    'invoice.past_due': { object: 'invoice', public: false },
    // Tic de un workflow programado. Lo emite el cron SOLO para el workflow que
    // le toca, no para todos los que escuchan el tipo: cada uno tiene su propio
    // horario, así que un tic compartido dispararía a los demás fuera de hora.
    'schedule.tick': { object: 'schedule', public: false },
} as const;

export type DomainEventType = keyof typeof DOMAIN_EVENTS;

const SIN_CREDENCIALES = new Set(['link_publico', 'public_token', 'token']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDomainEventType(type: string): type is DomainEventType {
    return Object.prototype.hasOwnProperty.call(DOMAIN_EVENTS, type);
}

export function storedEventData(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([key]) => !SIN_CREDENCIALES.has(key)));
}

async function queueIntegrations(orgId: string, type: string, data: Record<string, unknown>, actor: string) {
    const statement = integrationQueueStatement(orgId, type, data, actor);
    if (!statement) return;
    try {
        const [rows] = await withOrgTx(orgId, statement);
        if (rows.some((r) => r.id)) after(import('./integraciones/sync').then((m) => m.processOrgSync(orgId)));
    } catch (err) {
        log.error('no se pudo encolar la sincronización de integraciones', { route: 'domain-events', type, orgId, err });
    }
}

export async function recordDomainEvent(orgId: string, type: string, data: Record<string, unknown>, actor?: string): Promise<string | null> {
    if (!isDomainEventType(type)) {
        log.error('evento de dominio fuera del catálogo', { route: 'domain-events', type, orgId });
        return null;
    }
    const objectId = typeof data.id === 'string' && UUID_RE.test(data.id) ? data.id : null;
    const who = actor ?? currentActor();
    const depth = currentWorkflowDepth();
    try {
        const [[row]] = await withOrgTx(orgId, sql`
            insert into domain_events (org_id, type, object, object_id, data, actor, depth)
            values (${orgId}, ${type}, ${DOMAIN_EVENTS[type].object}, ${objectId}, ${JSON.stringify(storedEventData(data))}::jsonb, ${who}, ${depth})
            returning id`);
        const id = (row?.id as string) ?? null;
        if (id && await enqueueWorkflowRuns(orgId, { id, type, depth, actor: who })) {
            after(import('./workflows/engine').then((m) => m.processOrgRuns(orgId)));
        }
        if (id) await queueIntegrations(orgId, type, data, who);
        // Shopify tiene su propio carril: su disparador lo elige el comerciante
        // y nace apagado, así que esto casi siempre es una consulta y nada más.
        if (id && objectId && (type === 'quote.approved' || type === 'quote.paid')) {
            after(import('./integraciones/shopify/orders').then((m) => m.onQuoteEvent(orgId, type, objectId)));
        }
        return id;
    } catch (err) {
        log.error('no se pudo registrar el evento de dominio', { route: 'domain-events', type, orgId, err });
        return null;
    }
}
