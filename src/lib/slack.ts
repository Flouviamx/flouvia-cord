// src/lib/slack.ts
// Notificaciones SALIENTES a Slack vía Incoming Webhook. Cuando algo le pasa a una
// cotización (enviada, vista, aprobada, pagada…) posteamos un mensaje al canal que
// la org conectó en Ajustes › Integraciones (orgs.slack_webhook_url).
//
// REGLA DE ORO (igual que webhooks): nunca lanza. Un fallo de Slack jamás rompe la
// operación de negocio.

import { currencyDecimals, normalizeCurrency } from './currency';
import { intlLocale } from './fmt-server';

// El monto siempre se postea CON su divisa: el canal de Slack de un negocio
// que vende en varias monedas necesita distinguir 1,000 USD de 1,000 MXN.
const money = (n: number, currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    // El locale sale del request, no de 'es-MX': el separador decimal y el de
    // miles cambian, y un negocio en Londres no escribe 1.000,00.
    return new Intl.NumberFormat(intlLocale(), {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Number(n ?? 0));
};

// Texto por evento (sin emojis — Regla 1 de CLAUDE.md). `notify.*` son los
// eventos que dispara src/lib/notify.ts (matriz de Ajustes › Notificaciones);
// el resto queda por si algún día vuelve a haber un disparo de integraciones.
const EVENT_MSG: Record<string, { verbo: string }> = {
    'quote.sent':        { verbo: 'enviada' },
    'quote.viewed':      { verbo: 'vista por el cliente' },
    'quote.approved':    { verbo: '*APROBADA*' },
    'quote.rejected':    { verbo: 'rechazada' },
    'quote.paid':        { verbo: '*PAGADA*' },
    'invoice.issued':    { verbo: 'facturada' },
    'invoice.stamped':   { verbo: 'facturada (CFDI)' },
    'notify.quote_viewed':    { verbo: 'vista por el cliente' },
    'notify.quote_approved':  { verbo: '*APROBADA*' },
    'notify.quote_rejected':  { verbo: 'rechazada' },
    'notify.quote_paid':      { verbo: '*PAGADA*' },
    'notify.quote_expiring':  { verbo: 'está por vencer' },
    'notify.payment_overdue': { verbo: 'con pago vencido' },
    'ping': { verbo: 'de prueba' },
};

export interface SlackPayload {
    folio: string;
    cliente: string | null;
    total: number;
    link?: string | null;
    /** Divisa ISO del total (MXN si no se especifica). */
    moneda?: string;
}

/** Construye y envía el mensaje. Devuelve ok/status sin lanzar. */
export async function postToSlack(webhookUrl: string, evento: string, data: SlackPayload): Promise<{ ok: boolean; status: number }> {
    const meta = EVENT_MSG[evento] || { verbo: evento };
    const lineas = [
        `Cotización *${data.folio}* ${meta.verbo}`,
        `Cliente: ${data.cliente || '—'} · Total: *${money(data.total, data.moneda)}*`,
    ];
    if (data.link) lineas.push(`<${data.link}|Ver cotización>`);
    const body = JSON.stringify({ text: lineas.join('\n') });

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: ctrl.signal,
        });
        clearTimeout(t);
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}
