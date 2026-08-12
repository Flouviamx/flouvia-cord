// src/lib/webhooks.ts
// Webhooks SALIENTES: cuando algo le pasa a una cotización (enviada, vista,
// aprobada, rechazada, pagada, facturada), notificamos a las URLs que la org
// registró en Ajustes › Developers. La entrega real (firma, reintentos,
// durabilidad) vive en src/lib/webhook-delivery.ts — este archivo solo arma el
// payload desde la cotización, resuelve los suscriptores, encola, y dispara la
// entrega inmediata en segundo plano.
//
// REGLA DE ORO: dispatchQuoteEvent NUNCA lanza. Un fallo de webhook jamás debe
// romper la operación de negocio que lo originó (enviar, aprobar, cobrar…).

import { sql } from './db';
import { after } from './after';
import { enqueueForSubscribers, flushNow, newEventId } from './webhook-delivery';

// Catálogo de eventos públicos (lo consume la UI y la validación de la API).
export const WEBHOOK_EVENTS = [
    { id: 'quote.sent', label: 'Cotización enviada' },
    { id: 'quote.viewed', label: 'Cotización vista' },
    { id: 'quote.approved', label: 'Cotización aprobada' },
    { id: 'quote.rejected', label: 'Cotización rechazada' },
    { id: 'quote.updated', label: 'Cotización modificada y reenviada' },
    { id: 'quote.expired', label: 'Cotización vencida' },
    { id: 'quote.deleted', label: 'Borrador eliminado' },
    { id: 'quote.paid', label: 'Pago recibido' },
    { id: 'payment.partial', label: 'Pago parcial recibido' },
    { id: 'payment.failed', label: 'Cobro recurrente fallido' },
    { id: 'invoice.stamped', label: 'CFDI timbrado' },
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number]['id'];
export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENTS.map((e) => e.id) as string[];

// Re-exportados para no cambiar los imports existentes (api/webhooks.ts, etc.)
// — la implementación real vive en webhook-delivery.ts, que también maneja el
// motor de entrega/reintentos que usa dispatchQuoteEvent abajo.
export { sendTestEvent, redeliver, reenableAndRetryRecent, rotateSecret } from './webhook-delivery';

// Resumen mínimo de cotización que necesita el payload (y Slack). Compartido
// por el camino que re-consulta la fila y por el que ya trae los datos a mano
// (ej. quote.deleted, donde la fila ya no existe para cuando se dispara).
interface QuoteSummary {
    id: string; folio: string; status: string; total: unknown;
    public_token: string; empresa: string | null;
}

/**
 * Notifica un evento de cotización a las webhooks suscritas de la org. Construye
 * el payload desde la cotización, lo ENCOLA (durable — sobrevive aunque esta
 * invocación muera) y dispara la entrega inmediata en segundo plano vía
 * after()/waitUntil. Si esa entrega inmediata falla o nunca corre, el cron de
 * sweep (/api/cron/webhooks) la recoge. Silencioso: cualquier error (incluida
 * tabla no migrada) se traga — nunca debe romper la operación que lo originó.
 */
export async function dispatchQuoteEvent(orgId: string, cotizacionId: string, evento: WebhookEvent): Promise<void> {
    try {
        // El resumen de la cotización lo comparten webhooks y Slack: lo cargamos una vez.
        const [q] = await sql`
            select c.id, c.folio, c.status, c.total, c.public_token, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
        if (!q) return;
        await dispatchToSubscribers(orgId, evento, q as QuoteSummary);
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

/**
 * Igual que dispatchQuoteEvent, pero con un resumen de cotización YA EN MANO
 * (no re-consulta la fila). Necesario para `quote.deleted` — la fila ya no
 * existe cuando se dispara el evento — y en general para cualquier caller que
 * ya haya cargado los datos y quiera evitar una segunda consulta.
 */
export async function dispatchQuoteEventFrom(orgId: string, evento: WebhookEvent, q: QuoteSummary): Promise<void> {
    try {
        await dispatchToSubscribers(orgId, evento, q);
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

/**
 * `payment.partial`: un anticipo/saldo/cuota se cobró SIN completar el total
 * (si lo completara, la cotización ya habría pasado a 'paid' y ese es el
 * evento que se dispara en su lugar — ver markQuotePaid en stripe/webhook.ts).
 * `extra` se mezcla dentro de `data`, junto al resumen normal de la cotización.
 */
export async function dispatchPaymentPartial(orgId: string, cotizacionId: string, extra: {
    tipo: string; monto: number; numero_cuota: number; saldo_pendiente: number; payment_method: string | null;
}): Promise<void> {
    try {
        const [q] = await sql`
            select c.id, c.folio, c.status, c.total, c.public_token, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
        if (!q) return;
        await dispatchToSubscribers(orgId, 'payment.partial', q as QuoteSummary, extra);
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

// Arma el payload, resuelve suscriptores, dispara Slack en paralelo, encola
// (durable) y dispara la entrega inmediata en segundo plano. `extra` (si se
// pasa) se mezcla dentro de `data` junto al resumen de la cotización — así
// eventos como payment.partial pueden llevar campos propios sin que
// dispatchQuoteEvent tenga que conocerlos.
async function dispatchToSubscribers(orgId: string, evento: string, q: QuoteSummary, extra?: Record<string, unknown>): Promise<void> {
    let hooks: any[] = [];
    try {
        hooks = await sql`select id, eventos from webhooks where org_id = ${orgId} and activo = true`;
    } catch { return; } // tabla aún no migrada → no-op
    const subs = hooks.filter((h) => {
        const evs = Array.isArray(h.eventos) ? h.eventos : [];
        return evs.length === 0 || evs.includes(evento);
    });
    if (!subs.length) return;

    // Absoluto: dispatchQuoteEvent corre también desde crons/background sin
    // request en curso, así que no hay `origin` que leer — mismo fallback
    // que ya usa dispatchSlack() abajo. Un link relativo obligaba a quien
    // recibe el webhook a adivinar el dominio para armar el link real.
    const base = import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://cordhq.app';
    // El event_id se genera AQUÍ (antes de serializar) para poder incluirlo
    // como campo `id` dentro del JSON que se firma — así el receptor puede
    // deduplicar leyendo el body, sin depender solo del header. El MISMO
    // event_id se copia a la columna webhook_events.event_id de cada
    // suscriptor (enqueueForSubscribers) — nunca diverge.
    const eventId = newEventId();
    const body = JSON.stringify({
        id: eventId,
        event: evento,
        created_at: new Date().toISOString(),
        data: {
            id: q.id,
            folio: q.folio,
            status: q.status,
            total: Number(q.total ?? 0),
            cliente: q.empresa ?? null,
            link_publico: `${base}/q/${q.public_token}`,
            ...extra,
        },
    });

    // Encolar es DURABLE (se espera aquí — si esta invocación muere justo
    // después, el evento ya quedó a salvo en webhook_events). La entrega
    // inline es solo la optimización de latencia: nunca se espera, para no
    // demorar la operación de negocio que disparó el evento.
    const ids = await enqueueForSubscribers(orgId, subs.map((h) => h.id as string), evento, body, eventId);
    if (ids.length) after(flushNow(orgId, ids));
}
