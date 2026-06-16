// src/lib/webhooks.ts
// Webhooks SALIENTES: cuando algo le pasa a una cotización (enviada, vista,
// aprobada, rechazada, pagada, facturada), notificamos a las URLs que la org
// registró en Ajustes › Developers. La entrega es POST JSON firmado con
// HMAC-sha256 para que el receptor verifique el origen.
//
// REGLA DE ORO: dispatchQuoteEvent NUNCA lanza. Un fallo de webhook jamás debe
// romper la operación de negocio que lo originó (enviar, aprobar, cobrar…).

import { createHmac } from 'node:crypto';
import { sql } from './db';
import { postToSlack } from './slack';

// Catálogo de eventos públicos (lo consume la UI y la validación de la API).
export const WEBHOOK_EVENTS = [
    { id: 'quote.sent', label: 'Cotización enviada' },
    { id: 'quote.viewed', label: 'Cotización vista' },
    { id: 'quote.approved', label: 'Cotización aprobada' },
    { id: 'quote.rejected', label: 'Cotización rechazada' },
    { id: 'quote.paid', label: 'Pago recibido' },
    { id: 'invoice.stamped', label: 'CFDI timbrado' },
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number]['id'];
export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENTS.map((e) => e.id) as string[];

const TIMEOUT_MS = 5000;
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');
const truncate = (s: string, max = 4000) => (s.length > max ? s.slice(0, max) + '…' : s);

// Registra el intento en webhook_deliveries (best-effort: jamás lanza).
async function logDelivery(hook: any, evento: string, body: string, r: {
    status: number; ok: boolean; error: string | null; intento: number; ms: number; response: string; prueba: boolean;
}): Promise<void> {
    try {
        await sql`
            insert into webhook_deliveries
                (org_id, webhook_id, evento, status, ok, error, intento, es_prueba, duracion_ms, request_body, response_body)
            values
                (${hook.org_id}, ${hook.id}, ${evento}, ${r.status || null}, ${r.ok}, ${r.error},
                 ${r.intento}, ${r.prueba}, ${r.ms}, ${truncate(body)}, ${truncate(r.response)})`;
    } catch { /* tabla no migrada → no-op */ }
}

/**
 * Entrega individual con un reintento. Registra CADA intento en
 * webhook_deliveries y actualiza el resumen (last_status/error) en webhooks.
 */
async function deliver(hook: any, evento: string, body: string, prueba = false): Promise<void> {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Cord-Webhooks/1.0',
        'X-Cord-Event': evento,
        'X-Cord-Signature': `sha256=${sign(hook.secret as string, body)}`,
    };

    let status = 0;
    let error: string | null = null;
    let ok = false;

    for (let intento = 0; intento < 2; intento++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const t0 = Date.now();
        let response = '';
        try {
            const res = await fetch(hook.url as string, { method: 'POST', headers, body, signal: ctrl.signal });
            clearTimeout(t);
            status = res.status;
            ok = res.ok;
            try { response = await res.text(); } catch { /* sin cuerpo */ }
            error = res.ok ? null : `HTTP ${res.status}`;
        } catch (e: any) {
            clearTimeout(t);
            status = 0; ok = false;
            error = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error de red');
        }
        await logDelivery(hook, evento, body, { status, ok, error, intento: intento + 1, ms: Date.now() - t0, response, prueba });
        if (ok) break;
        // backoff mínimo antes del reintento
        if (intento === 0) await new Promise((r) => setTimeout(r, 300));
    }

    // Resumen de la última entrega en la fila del webhook (best-effort).
    sql`update webhooks set last_status = ${status || null}, last_error = ${error}, last_delivery_at = now() where id = ${hook.id}`
        .catch(() => {});
}

/**
 * Notifica un evento de cotización a las webhooks suscritas de la org. Construye
 * el payload desde la cotización y lo entrega a cada URL en paralelo. Silencioso:
 * cualquier error (incluida tabla no migrada) se traga.
 */
export async function dispatchQuoteEvent(orgId: string, cotizacionId: string, evento: WebhookEvent): Promise<void> {
    try {
        // El resumen de la cotización lo comparten webhooks y Slack: lo cargamos una vez.
        const [q] = await sql`
            select c.id, c.folio, c.status, c.total, c.public_token, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
        if (!q) return;

        // ── Slack (best-effort, en paralelo a los webhooks) ──
        void dispatchSlack(orgId, evento, q);

        let hooks: any[] = [];
        try {
            hooks = await sql`select * from webhooks where org_id = ${orgId} and activo = true`;
        } catch { return; } // tabla aún no migrada → no-op
        const subs = hooks.filter((h) => {
            const evs = Array.isArray(h.eventos) ? h.eventos : [];
            return evs.length === 0 || evs.includes(evento);
        });
        if (!subs.length) return;

        const body = JSON.stringify({
            event: evento,
            created_at: new Date().toISOString(),
            data: {
                id: q.id,
                folio: q.folio,
                status: q.status,
                total: Number(q.total ?? 0),
                cliente: q.empresa ?? null,
                link_publico: `/q/${q.public_token}`,
            },
        });

        await Promise.all(subs.map((h) => deliver(h, evento, body)));
    } catch {
        /* nunca romper la operación principal por un webhook */
    }
}

// Postea el evento al Slack de la org si tiene un Incoming Webhook conectado.
// Silencioso ante cualquier error (columna/tabla faltante, red, etc.).
async function dispatchSlack(orgId: string, evento: string, q: any): Promise<void> {
    try {
        const [o] = await sql`select slack_webhook_url from orgs where id = ${orgId}`;
        const url = o?.slack_webhook_url as string | null;
        if (!url) return;
        const base = import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://cord.flouvia.com';
        await postToSlack(url, evento, {
            folio: q.folio as string,
            cliente: (q.empresa as string) ?? null,
            total: Number(q.total ?? 0),
            link: `${base}/q/${q.public_token}`,
        });
    } catch { /* no-op */ }
}

/**
 * Envía un evento de PRUEBA a un endpoint (ping con datos de ejemplo). Lo usa el
 * botón "Enviar prueba" de Ajustes › Developers para validar el endpoint sin
 * esperar a que pase algo real. Devuelve el resultado del primer intento.
 */
export async function sendTestEvent(orgId: string, webhookId: string): Promise<{ ok: boolean; status: number; error: string | null }> {
    const [hook] = await sql`select * from webhooks where id = ${webhookId} and org_id = ${orgId}`;
    if (!hook) return { ok: false, status: 0, error: 'Endpoint no encontrado' };
    const body = JSON.stringify({
        event: 'ping',
        created_at: new Date().toISOString(),
        data: {
            id: '00000000-0000-0000-0000-000000000000',
            folio: 'COT-PRUEBA',
            status: 'sent',
            total: 12500,
            cliente: 'Cliente de prueba S.A. de C.V.',
            link_publico: '/q/demo',
            mensaje: 'Esta es una entrega de prueba enviada desde Ajustes › Developers.',
        },
    });
    await deliver(hook, 'ping', body, true);
    const [last] = await sql`select status, ok, error from webhook_deliveries where webhook_id = ${webhookId} order by created_at desc limit 1`;
    return { ok: !!last?.ok, status: (last?.status as number) ?? 0, error: (last?.error as string) ?? null };
}

/**
 * Re-entrega (replay) una entrega pasada: re-firma y re-envía EXACTAMENTE el
 * mismo payload a la misma URL. Útil cuando el receptor estuvo caído.
 */
export async function redeliver(orgId: string, deliveryId: string): Promise<{ ok: boolean; status: number; error: string | null }> {
    const [d] = await sql`select * from webhook_deliveries where id = ${deliveryId} and org_id = ${orgId}`;
    if (!d) return { ok: false, status: 0, error: 'Entrega no encontrada' };
    const [hook] = await sql`select * from webhooks where id = ${d.webhook_id} and org_id = ${orgId}`;
    if (!hook) return { ok: false, status: 0, error: 'Endpoint no encontrado' };
    const body = (d.request_body as string) || '{}';
    await deliver(hook, d.evento as string, body, !!d.es_prueba);
    const [last] = await sql`select status, ok, error from webhook_deliveries where webhook_id = ${hook.id} order by created_at desc limit 1`;
    return { ok: !!last?.ok, status: (last?.status as number) ?? 0, error: (last?.error as string) ?? null };
}
