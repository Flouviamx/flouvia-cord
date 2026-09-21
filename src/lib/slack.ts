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
//
// El canal de Slack habla el idioma de la organización, igual que el correo
// que sale por el mismo evento (regla 36): una cuenta en inglés recibía el
// correo en inglés y el mensaje de Slack en español, del mismo aviso.
type SlackLang = 'es' | 'en';
const EVENT_MSG: Record<string, Record<SlackLang, string>> = {
    'quote.sent':        { es: 'enviada', en: 'sent' },
    'quote.viewed':      { es: 'vista por el cliente', en: 'viewed by the client' },
    'quote.approved':    { es: '*APROBADA*', en: '*APPROVED*' },
    'quote.rejected':    { es: 'rechazada', en: 'rejected' },
    'quote.paid':        { es: '*PAGADA*', en: '*PAID*' },
    'invoice.issued':    { es: 'facturada', en: 'invoiced' },
    'invoice.stamped':   { es: 'facturada (CFDI)', en: 'invoiced (CFDI)' },
    'notify.quote_viewed':    { es: 'vista por el cliente', en: 'viewed by the client' },
    'notify.quote_approved':  { es: '*APROBADA*', en: '*APPROVED*' },
    'notify.quote_rejected':  { es: 'rechazada', en: 'rejected' },
    'notify.quote_paid':      { es: '*PAGADA*', en: '*PAID*' },
    'notify.quote_expiring':  { es: 'está por vencer', en: 'is about to expire' },
    'notify.payment_overdue': { es: 'con pago vencido', en: 'is past due' },
    'ping': { es: 'de prueba', en: 'test' },
};
const LABELS: Record<SlackLang, { cotizacion: string; cliente: string; total: string; ver: string }> = {
    es: { cotizacion: 'Cotización', cliente: 'Cliente', total: 'Total', ver: 'Ver cotización' },
    en: { cotizacion: 'Quote', cliente: 'Client', total: 'Total', ver: 'View quote' },
};

export interface SlackPayload {
    folio: string;
    cliente: string | null;
    total: number;
    link?: string | null;
    /** Divisa ISO del total (MXN si no se especifica). */
    moneda?: string;
    /** Idioma de la organización. Sin él, español. */
    lang?: SlackLang;
}

export async function postSlackText(webhookUrl: string, text: string): Promise<{ ok: boolean; status: number }> {
    if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) return { ok: false, status: 0 };
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }), signal: ctrl.signal, redirect: 'error',
        });
        clearTimeout(t);
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

/** Construye y envía el mensaje. Devuelve ok/status sin lanzar. */
export async function postToSlack(webhookUrl: string, evento: string, data: SlackPayload): Promise<{ ok: boolean; status: number }> {
    const lang: SlackLang = data.lang === 'en' ? 'en' : 'es';
    const verbo = EVENT_MSG[evento]?.[lang] ?? evento;
    const l = LABELS[lang];
    const lineas = [
        `${l.cotizacion} *${data.folio}* ${verbo}`,
        `${l.cliente}: ${data.cliente || '—'} · ${l.total}: *${money(data.total, data.moneda)}*`,
    ];
    if (data.link) lineas.push(`<${data.link}|${l.ver}>`);
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
