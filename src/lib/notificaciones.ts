// Bandeja de la campana (topbar): qué cuenta como notificación y cuántas faltan
// por leer. Una sola definición para la lista (/api/notificaciones) y para el
// contador que AppLayout pinta en el SSR.
//
// Solo lo que hizo el CLIENTE o el dinero que entró: vio, aprobó, rechazó,
// contraofertó, comentó, abonó, pagó. Antes salía todo el timeline, así que
// "Cotización enviada" o "Borrador actualizado" encendían la campana con las
// acciones del propio vendedor (regla 19). Cotizaciones y facturas juntas: la
// consulta hacía `join cotizaciones` y los eventos de una factura (que cuelgan de
// `documento_id`) no llegaban nunca.
//
// El autor sale de `eventos.actor` (db/schema.sql, "Autor de cada evento"). Se lee
// con `to_jsonb(e)->>'actor'` a propósito: así esta consulta funciona antes y
// después de que la migración agregue la columna. Sin columna —o en filas
// históricas— el autor es null y solo cuentan los tipos que únicamente puede
// generar el cliente o el pago.

import { sql, withOrgTx } from './db';

/** Lo que el cliente (o el pago) puede generar. */
const TIPOS_CLIENTE = ['viewed', 'approved', 'rejected', 'counter', 'comment', 'payment', 'paid'];
/** Sin autor registrado, solo estos son inequívocamente del cliente o del pago. */
const TIPOS_SIN_AUTOR = ['viewed', 'counter', 'payment', 'paid'];

export interface NotifRow {
    id: string;
    tipo: string;
    detalle: string | null;
    created_at: string;
    origen: 'cotizacion' | 'factura';
    ref_id: string;
    folio: string | null;
    cliente: string | null;
}

/** Últimas notificaciones de la organización, cotizaciones y facturas juntas. */
export async function listNotificaciones(orgId: string, limit = 15): Promise<NotifRow[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select e.id, e.tipo, e.detalle, e.created_at,
               case when c.id is not null then 'cotizacion' else 'factura' end as origen,
               coalesce(c.id, d.id) as ref_id,
               coalesce(c.folio, d.invoice_number) as folio,
               cl.empresa as cliente
          from eventos e
          left join cotizaciones c on c.id = e.cotizacion_id
          left join documentos_fiscales d on d.id = e.documento_id
          left join clientes cl on cl.id = coalesce(c.cliente_id, d.cliente_id)
         where e.org_id = ${orgId}
           and (c.id is not null or d.id is not null)
           and e.tipo = any(${TIPOS_CLIENTE})
           and ((to_jsonb(e)->>'actor') = 'externo'
                or ((to_jsonb(e)->>'actor') is null and e.tipo = any(${TIPOS_SIN_AUTOR})))
         order by e.created_at desc
         limit ${limit}`);
    return rows as NotifRow[];
}

/** Sin leer desde `seenMs` (ms epoch), con tope: la campana muestra "9+". */
export async function countNotificacionesSinLeer(orgId: string, seenMs: number, cap = 10): Promise<number> {
    const seen = new Date(Number.isFinite(seenMs) && seenMs > 0 ? seenMs : 0).toISOString();
    const [[row]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from (
            select 1
              from eventos e
              left join cotizaciones c on c.id = e.cotizacion_id
              left join documentos_fiscales d on d.id = e.documento_id
             where e.org_id = ${orgId}
               and e.created_at > ${seen}
               and (c.id is not null or d.id is not null)
               and e.tipo = any(${TIPOS_CLIENTE})
               and ((to_jsonb(e)->>'actor') = 'externo'
                    or ((to_jsonb(e)->>'actor') is null and e.tipo = any(${TIPOS_SIN_AUTOR})))
             limit ${cap}
        ) s`);
    return Number(row?.n ?? 0);
}

// ── "Leído" por miembro: org_members.widget_prefs[NOTIF_PREFS_KEY] ──
// Antes vivía en localStorage: lo leído en el celular volvía a salir en la
// computadora. Mismo almacén que los layouts de widgets y la sidebar.
export const NOTIF_PREFS_KEY = 'cord.notif.v1';

/** Marca de "visto hasta" guardada; 0 si no hay o es inválida. */
export function notifSeenFrom(prefs: unknown): number {
    const seen = Number((prefs as { seen?: unknown } | null | undefined)?.seen);
    return Number.isFinite(seen) && seen > 0 ? seen : 0;
}
