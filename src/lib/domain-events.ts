import { sql, withOrgTx } from './db';
import { currentActor } from './context';
import { log } from './log';

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

export async function recordDomainEvent(orgId: string, type: string, data: Record<string, unknown>, actor?: string): Promise<string | null> {
    if (!isDomainEventType(type)) {
        log.error('evento de dominio fuera del catálogo', { route: 'domain-events', type, orgId });
        return null;
    }
    const objectId = typeof data.id === 'string' && UUID_RE.test(data.id) ? data.id : null;
    try {
        const [[row]] = await withOrgTx(orgId, sql`
            insert into domain_events (org_id, type, object, object_id, data, actor)
            values (${orgId}, ${type}, ${DOMAIN_EVENTS[type].object}, ${objectId}, ${JSON.stringify(storedEventData(data))}::jsonb, ${actor ?? currentActor()})
            returning id`);
        return (row?.id as string) ?? null;
    } catch (err) {
        log.error('no se pudo registrar el evento de dominio', { route: 'domain-events', type, orgId, err });
        return null;
    }
}
