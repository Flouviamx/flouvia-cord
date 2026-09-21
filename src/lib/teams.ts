// src/lib/teams.ts
// Notificaciones SALIENTES a Microsoft Teams. Gemelo de slack.ts, con dos
// diferencias que no son cosméticas:
//
// 1. El destino NO es un webhook del canal. Los conectores O365 de Teams están
//    retirados, así que la URL que el usuario pega es la de un flujo de Power
//    Automate ("Workflows" dentro del canal), servido desde *.logic.azure.com.
//    Aceptamos también webhook.office.com para los tenants que aún lo tengan.
// 2. El cuerpo es una Adaptive Card, no texto plano: Teams no renderiza el
//    markdown de Slack y un mensaje sin tarjeta sale como una línea suelta.
//
// REGLA DE ORO (igual que slack/webhooks): nunca lanza.

import { currencyDecimals, normalizeCurrency } from './currency';
import { intlLocale } from './fmt-server';

type TeamsLang = 'es' | 'en';

const HOST_RE = /^https:\/\/([a-z0-9-]+\.)*(logic\.azure\.com|azure-api\.net|webhook\.office\.com)(:443)?\//i;

/** Valida la FORMA de la URL. El muro de red lo pone el propio fetch con redirect: 'error'. */
export const isTeamsWebhookUrl = (url: string) => HOST_RE.test(url.trim());

const money = (n: number, currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat(intlLocale(), {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Number(n ?? 0));
};

const EVENT_MSG: Record<string, Record<TeamsLang, string>> = {
    'notify.quote_viewed':    { es: 'vista por el cliente', en: 'viewed by the client' },
    'notify.quote_approved':  { es: 'APROBADA', en: 'APPROVED' },
    'notify.quote_rejected':  { es: 'rechazada', en: 'rejected' },
    'notify.quote_paid':      { es: 'PAGADA', en: 'PAID' },
    'notify.quote_expiring':  { es: 'está por vencer', en: 'is about to expire' },
    'notify.payment_overdue': { es: 'con pago vencido', en: 'is past due' },
    'ping': { es: 'de prueba', en: 'test' },
};

const LABELS: Record<TeamsLang, { cotizacion: string; cliente: string; total: string; ver: string }> = {
    es: { cotizacion: 'Cotización', cliente: 'Cliente', total: 'Total', ver: 'Ver cotización' },
    en: { cotizacion: 'Quote', cliente: 'Client', total: 'Total', ver: 'View quote' },
};

export interface TeamsPayload {
    folio: string;
    cliente: string | null;
    total: number;
    link?: string | null;
    moneda?: string;
    lang?: TeamsLang;
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number }> {
    if (!isTeamsWebhookUrl(url)) return { ok: false, status: 0 };
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body), signal: ctrl.signal, redirect: 'error',
        });
        clearTimeout(timer);
        return { ok: res.ok, status: res.status };
    } catch {
        return { ok: false, status: 0 };
    }
}

/** Envoltorio de Adaptive Card que Teams espera de un flujo de Power Automate. */
function card(blocks: unknown[], actions: unknown[] = []) {
    return {
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
                type: 'AdaptiveCard',
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                version: '1.4',
                body: blocks,
                ...(actions.length ? { actions } : {}),
            },
        }],
    };
}

/** Texto libre (acción de workflow). El autor escribe el mensaje; Cord no le agrega nada. */
export async function postTeamsText(webhookUrl: string, text: string): Promise<{ ok: boolean; status: number }> {
    return post(webhookUrl, card([{ type: 'TextBlock', text, wrap: true }]));
}

/** Aviso con forma fija de una cotización (matriz de Ajustes › Notificaciones). */
export async function postToTeams(webhookUrl: string, evento: string, data: TeamsPayload): Promise<{ ok: boolean; status: number }> {
    const lang: TeamsLang = data.lang === 'en' ? 'en' : 'es';
    const verbo = EVENT_MSG[evento]?.[lang] ?? evento;
    const l = LABELS[lang];
    const blocks: unknown[] = [
        { type: 'TextBlock', text: `${l.cotizacion} ${data.folio} ${verbo}`, weight: 'Bolder', size: 'Medium', wrap: true },
        {
            type: 'FactSet',
            facts: [
                { title: l.cliente, value: data.cliente || '—' },
                { title: l.total, value: money(data.total, data.moneda) },
            ],
        },
    ];
    const actions = data.link ? [{ type: 'Action.OpenUrl', title: l.ver, url: data.link }] : [];
    return post(webhookUrl, card(blocks, actions));
}
