import { sql } from '../db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUOTE_EVENTS = new Set([
    'quote.created', 'quote.sent', 'quote.viewed', 'quote.approved', 'quote.rejected', 'quote.updated',
    'quote.expired', 'quote.paid', 'payment.partial', 'invoice.issued', 'invoice.stamped',
]);

export function integrationQueueStatement(orgId: string, type: string, data: Record<string, unknown>, actor: string) {
    const id = data?.id;
    if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
    if (type === 'client.deleted' || type === 'quote.deleted') {
        const objetos = type === 'client.deleted' ? ['client', 'client_contact'] : ['quote'];
        return sql`delete from integracion_vinculos where org_id = ${orgId} and local_id = ${id} and objeto = any(${objetos}::text[]) returning null as id`;
    }
    const objeto = type === 'client.created' || type === 'client.updated' ? 'client' : QUOTE_EVENTS.has(type) ? 'quote' : null;
    if (!objeto) return null;
    return sql`
        insert into integracion_sync (org_id, conexion_id, direccion, objeto, clave)
        select c.org_id, c.id, 'salida', ${objeto}, ${id}
          from integracion_conexiones c
         where c.org_id = ${orgId} and c.estado = 'activa' and ${actor} <> ('integration:hubspot:' || c.id::text)
        on conflict (conexion_id, direccion, objeto, clave) where status = 'queued' do nothing
        returning id`;
}
