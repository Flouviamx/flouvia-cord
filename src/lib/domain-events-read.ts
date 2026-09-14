import { sql, withOrgTx } from './db';
import { isDomainEventType } from './domain-events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventsQuery {
    type: string | null;
    objectId: string | null;
    cursor: string | null;
    limit: number;
}

export class EventsQueryError extends Error {}

function encodeCursor(createdAt: string, id: string) {
    return Buffer.from(`${createdAt}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!id || !UUID_RE.test(id) || Number.isNaN(Date.parse(createdAt))) throw new EventsQueryError('cursor inválido');
    return { createdAt, id };
}

export async function listDomainEvents(orgId: string, q: EventsQuery) {
    if (q.type !== null && !isDomainEventType(q.type)) throw new EventsQueryError('type no es un evento conocido');
    if (q.objectId !== null && !UUID_RE.test(q.objectId)) throw new EventsQueryError('object_id debe ser un UUID');
    const after = q.cursor ? decodeCursor(q.cursor) : null;
    const [rows] = await withOrgTx(orgId, sql`
        select id, type, object, object_id, data, actor, created_at,
               to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_ts
          from domain_events
         where org_id = ${orgId}
           and (${q.type}::text is null or type = ${q.type})
           and (${q.objectId}::uuid is null or object_id = ${q.objectId}::uuid)
           and (${after?.createdAt ?? null}::timestamptz is null
                or (created_at, id) < (${after?.createdAt ?? null}::timestamptz, ${after?.id ?? null}::uuid))
         order by created_at desc, id desc
         limit ${q.limit + 1}`);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
        items: page.map((r) => ({
            id: r.id as string,
            type: r.type as string,
            object: r.object as string,
            object_id: (r.object_id as string) ?? null,
            data: r.data,
            actor: r.actor as string,
            created_at: new Date(r.created_at as string).toISOString(),
        })),
        nextCursor: rows.length > q.limit && last ? encodeCursor(last.cursor_ts as string, last.id as string) : null,
    };
}
