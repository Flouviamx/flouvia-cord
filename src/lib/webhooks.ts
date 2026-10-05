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

import { sql, withOrgTx } from './db';
import { after } from './after';
import { publicDocumentUrl } from './public-links';
import { enqueueForSubscribers, flushNow, newEventId } from './webhook-delivery';
import { recordDomainEvent } from './domain-events';
import { BASELINE_API_VERSION, downgradeWebhookData, resolveApiVersion } from './api-versions';
import { INTEGRATION_WEBHOOK_LIMIT, webhookLimit } from './entitlements';
import { WEBHOOK_EVENT_TYPES, type CordWebhookEventType } from '../../packages/elements/src/contract/webhook-events';

// Catálogo de eventos públicos (lo consume la UI y la validación de la API).
// La lista y la forma de cada evento viven en el contrato del paquete; aquí solo
// las etiquetas. Un evento sin etiqueta, o una etiqueta sin evento, no compila.
const WEBHOOK_EVENT_LABELS: Record<CordWebhookEventType, string> = {
    'quote.sent': 'Cotización enviada',
    'quote.viewed': 'Cotización vista',
    'quote.approved': 'Cotización aprobada',
    'quote.rejected': 'Cotización rechazada',
    'quote.updated': 'Cotización modificada y reenviada',
    'quote.expired': 'Cotización vencida',
    'quote.deleted': 'Borrador eliminado',
    'quote.paid': 'Pago recibido',
    'payment.partial': 'Pago parcial recibido',
    'payment.failed': 'Cobro recurrente fallido',
    'invoice.issued': 'Factura comercial emitida',
    'invoice.stamped': 'CFDI timbrado',
    'invoice.finalized': 'Factura emitida',
    'invoice.sent': 'Factura enviada al cliente',
    'invoice.paid': 'Factura pagada',
    'invoice.payment_failed': 'Pago de factura fallido',
    'invoice.voided': 'Factura anulada',
    'invoice.marked_uncollectible': 'Factura marcada incobrable',
    'invoice.overdue': 'Factura vencida',
    'quote.created': 'Cotización creada',
    'quote.approval_requested': 'Aprobación interna solicitada',
    'quote.approval_decided': 'Aprobación interna decidida',
    'quote.comment_added': 'Mensaje en la cotización',
    'client.created': 'Cliente creado',
    'client.updated': 'Cliente actualizado',
    'client.deleted': 'Cliente eliminado',
    'product.created': 'Producto creado',
    'product.updated': 'Producto actualizado',
    'product.deleted': 'Producto eliminado',
    'task.created': 'Tarea creada',
    'task.completed': 'Tarea completada',
    'promise.created': 'Promesa de pago registrada',
    'promise.kept': 'Promesa de pago cumplida',
    'promise.broken': 'Promesa de pago incumplida',
    'dispute.created': 'Contracargo abierto',
    'dispute.closed': 'Contracargo cerrado',
    'refund.succeeded': 'Reembolso completado',
    'refund.failed': 'Reembolso fallido',
    'payout.paid': 'Depósito pagado',
    'payout.failed': 'Depósito fallido',
    'account.updated': 'Cuenta de cobros actualizada',
};

export const WEBHOOK_EVENTS = WEBHOOK_EVENT_TYPES.map((id) => ({ id, label: WEBHOOK_EVENT_LABELS[id] }));

export type WebhookEvent = CordWebhookEventType;
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
    base_currency?: string | null; cliente_id?: string | null;
}

/**
 * Notifica un evento de cotización a las webhooks suscritas de la org. Construye
 * el payload desde la cotización, lo ENCOLA (durable — sobrevive aunque esta
 * invocación muera) y dispara la entrega inmediata en segundo plano vía
 * after()/waitUntil. Si esa entrega inmediata falla o nunca corre, el cron de
 * sweep (/api/cron/webhooks) la recoge. Silencioso: cualquier error (incluida
 * tabla no migrada) se traga — nunca debe romper la operación que lo originó.
 */
export async function dispatchQuoteEvent(orgId: string, cotizacionId: string, evento: WebhookEvent, extra?: Record<string, unknown>, actor?: string): Promise<void> {
    try {
        const [qRows] = await withOrgTx(orgId, sql`
            select c.id, c.folio, c.status, c.total, c.public_token, c.base_currency, c.cliente_id, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`);
        const q = qRows[0];
        if (!q) return;
        await dispatchToSubscribers(orgId, evento, q as QuoteSummary, extra, actor);
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

export async function dispatchEvent(orgId: string, evento: WebhookEvent, data: Record<string, unknown>, actor?: string): Promise<void> {
    try {
        await emitToSubscribers(orgId, evento, data, actor);
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
    return dispatchQuoteEvent(orgId, cotizacionId, 'payment.partial', extra);
}

// Arma el payload, resuelve suscriptores, dispara Slack en paralelo, encola
// (durable) y dispara la entrega inmediata en segundo plano. `extra` (si se
// pasa) se mezcla dentro de `data` junto al resumen de la cotización — así
// eventos como payment.partial pueden llevar campos propios sin que
// dispatchQuoteEvent tenga que conocerlos.
async function dispatchToSubscribers(orgId: string, evento: string, q: QuoteSummary, extra?: Record<string, unknown>, actor?: string): Promise<void> {
    return emitToSubscribers(orgId, evento, {
        id: q.id,
        folio: q.folio,
        status: q.status,
        moneda: q.base_currency ?? null,
        total: Number(q.total ?? 0),
        cliente: q.empresa ?? null,
        cliente_id: q.cliente_id ?? null,
        link_publico: await publicDocumentUrl(orgId, 'q', q.public_token),
        ...extra,
    }, actor);
}

/**
 * Notifica un evento de FACTURA. Payload propio: quien consume facturas
 * necesita folio fiscal, saldo y vencimiento, no el resumen de la cotización
 * que la originó (que además no existe cuando la factura es standalone).
 *
 * Mismo contrato de oro que dispatchQuoteEvent: nunca lanza.
 */
export async function dispatchInvoiceEvent(orgId: string, documentoId: string, evento: WebhookEvent): Promise<void> {
    try {
        const [dRows] = await withOrgTx(orgId, sql`
            select d.id, d.invoice_number, d.fiscal_id, d.lifecycle, d.status,
                   d.currency, d.total, d.amount_paid, d.amount_remaining, d.due_date,
                   d.public_token, d.country_code, d.document_type, d.cotizacion_id,
                   cl.empresa
              from documentos_fiscales d
              left join clientes cl on cl.id = d.cliente_id
             where d.id = ${documentoId} and d.org_id = ${orgId}`);
        const d = dRows[0];
        if (!d) return;
        await emitToSubscribers(orgId, evento, {
            id: d.id,
            object: 'invoice',
            numero: d.invoice_number ?? null,
            folio_fiscal: d.fiscal_id ?? null,
            estado: d.lifecycle,
            estado_fiscal: d.status,
            pais: d.country_code,
            tipo: d.document_type,
            // Regla 21: el importe viaja con su divisa, siempre.
            moneda: d.currency ?? null,
            total: Number(d.total ?? 0),
            pagado: Number(d.amount_paid ?? 0),
            saldo: Number(d.amount_remaining ?? 0),
            vence: d.due_date ?? null,
            cliente: d.empresa ?? null,
            cotizacion_id: d.cotizacion_id ?? null,
            link_publico: d.public_token ? await publicDocumentUrl(orgId, 'i', d.public_token as string) : null,
        });
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

async function emitToSubscribers(orgId: string, evento: string, data: Record<string, unknown>, actor?: string): Promise<void> {
    await recordDomainEvent(orgId, evento, data, actor);
    await deliverToSubscribers(orgId, evento, data);
}

/**
 * Entrega un evento de prueba a los endpoints de una org sandbox, con el mismo
 * outbox, firma y reintentos que uno real, pero SIN registrarlo como evento de
 * dominio: los workflows e integraciones no deben reaccionar a datos de ejemplo.
 */
export async function deliverTestEvent(orgId: string, evento: WebhookEvent, data: Record<string, unknown>): Promise<void> {
    await deliverToSubscribers(orgId, evento, data);
}

async function deliverToSubscribers(orgId: string, evento: string, data: Record<string, unknown>): Promise<void> {
    let hooks: any[] = [];
    try {
        // En downgrade conservamos la configuración, pero solo los endpoints
        // más antiguos cubiertos por el plan efectivo reciben eventos. El
        // ranking en el momento de uso impide que endpoints excedentes sigan
        // operando por haber sido creados antes del cambio de plan.
        const [[planRow]] = await withOrgTx(orgId, sql`select cord_effective_plan(${orgId}::uuid) as plan`);
        const allowance = webhookLimit(String(planRow?.plan || 'free'));
        [hooks] = await withOrgTx(orgId, sql`
            with ranked as (
                select id, eventos, created_by_key is not null as integracion,
                       row_number() over (partition by created_by_key is not null order by created_at asc, id asc)::int as position
                  from webhooks
                 where org_id = ${orgId} and activo = true
            )
            select ranked.id, ranked.eventos, w.api_version
              from ranked join webhooks w on w.id = ranked.id
             where (not integracion and position <= ${allowance})
                or (integracion and position <= ${INTEGRATION_WEBHOOK_LIMIT})`);
    } catch { return; } // tabla aún no migrada → no-op
    const subs = hooks.filter((h) => {
        const evs = Array.isArray(h.eventos) ? h.eventos : [];
        return evs.length === 0 || evs.includes(evento);
    });
    if (!subs.length) return;

    // El event_id se genera AQUÍ (antes de serializar) para poder incluirlo
    // como campo `id` dentro del JSON que se firma — así el receptor puede
    // deduplicar leyendo el body, sin depender solo del header. El MISMO
    // event_id se copia a la columna webhook_events.event_id de cada
    // suscriptor (enqueueForSubscribers) — nunca diverge.
    const eventId = newEventId();
    const createdAt = new Date().toISOString();

    // Cada endpoint recibe el payload en la versión de la API que fijó al
    // crearse. Mismo event_id para todos: es el mismo evento en distinta forma.
    const porVersion = new Map<string, string[]>();
    for (const h of subs) {
        const v = resolveApiVersion(null, h.api_version as string | null).ok ? (h.api_version as string | null) ?? BASELINE_API_VERSION : BASELINE_API_VERSION;
        porVersion.set(v, [...(porVersion.get(v) ?? []), h.id as string]);
    }

    // Encolar es DURABLE (se espera aquí — si esta invocación muere justo
    // después, el evento ya quedó a salvo en webhook_events). La entrega
    // inline es solo la optimización de latencia: nunca se espera, para no
    // demorar la operación de negocio que disparó el evento.
    const ids: string[] = [];
    for (const [version, hookIds] of porVersion) {
        const body = JSON.stringify({ id: eventId, event: evento, created_at: createdAt, data: downgradeWebhookData(evento, data, version) });
        ids.push(...await enqueueForSubscribers(orgId, hookIds, evento, body, eventId));
    }
    if (ids.length) after(flushNow(orgId, ids));
}
