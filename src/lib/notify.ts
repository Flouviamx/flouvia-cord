// src/lib/notify.ts
// Notificaciones al DUEÑO del negocio (correo + Slack), filtradas por la
// matriz que la org configura en Ajustes › Notificaciones (orgs.notif_prefs).
// Antes de este archivo, notif_prefs se guardaba pero NINGÚN emisor lo
// consultaba — ver docs/historial-app-features.md. `notify()` es la única
// puerta de salida: reemplaza el disparo incondicional de Slack que vivía en
// webhooks.ts (dispatchSlack posteaba TODOS los eventos a TODAS las orgs con
// webhook conectado, sin mirar la matriz).
//
// REGLA DE ORO (igual que webhooks/slack): nunca lanza. Un fallo de
// notificación jamás rompe la operación de negocio que la originó.

import { sql } from './db';
import { sendEmail, siteOrigin } from './email';
import { postToSlack } from './slack';
import { currencyDecimals, normalizeCurrency } from './currency';

export type NotifyEvent =
    | 'quote_viewed' | 'quote_approved' | 'quote_rejected' | 'quote_paid'
    | 'quote_expiring' | 'payment_overdue' | 'team_join';

// Org que NUNCA guardó su matriz (nunca abrió Ajustes › Notificaciones, o
// nunca dio "Guardar") = no silenciar del todo — que el dueño se entere por
// lo menos de que su cliente decidió algo, la feature estrella del producto.
// Una vez que la org guarda UNA vez, la UI serializa las 7 filas completas
// (marcadas o no), así que a partir de ahí se respeta literalmente lo guardado.
const DEFAULTS: Partial<Record<NotifyEvent, { email?: boolean; slack?: boolean }>> = {
    quote_approved: { email: true },
    quote_rejected: { email: true },
    quote_paid: { email: true },
};

interface NotifyData {
    /** Folio de la cotización — si está presente, también habilita el post a Slack. */
    folio?: string;
    cliente?: string | null;
    total?: number;
    /** Link a mostrar en el correo/Slack (ya absoluto). */
    link?: string;
    /** Texto libre adicional para el cuerpo del correo (ej. nombre de quien se unió). */
    detalle?: string;
    /** Divisa ISO del monto. Sin ella se cae a la de la organización. */
    moneda?: string;
}

const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');
// La divisa viaja SIEMPRE con el monto. Un '$' pegado al número le decía
// "dólares" al dueño de un negocio en Bogotá que cobró en pesos colombianos.
const money = (n: number, en: boolean, currency: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat(en ? 'en-US' : 'es-MX', {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Number(n ?? 0));
};

const COPY: Record<NotifyEvent, { es: { asunto: string; linea: string; cta: string }; en: { asunto: string; linea: string; cta: string } }> = {
    quote_viewed: {
        es: { asunto: '{cliente} vio tu cotización {folio}', linea: '{cliente} acaba de abrir el link de la cotización {folio}.', cta: 'Ver cotización' },
        en: { asunto: '{cliente} viewed your quote {folio}', linea: '{cliente} just opened the link for quote {folio}.', cta: 'View quote' },
    },
    quote_approved: {
        es: { asunto: '{cliente} aprobó tu cotización {folio}', linea: '{cliente} aprobó la cotización {folio} por {total}.', cta: 'Ver cotización' },
        en: { asunto: '{cliente} approved your quote {folio}', linea: '{cliente} approved quote {folio} for {total}.', cta: 'View quote' },
    },
    quote_rejected: {
        es: { asunto: '{cliente} rechazó tu cotización {folio}', linea: '{cliente} rechazó la cotización {folio}.', cta: 'Ver cotización' },
        en: { asunto: '{cliente} rejected your quote {folio}', linea: '{cliente} rejected quote {folio}.', cta: 'View quote' },
    },
    quote_paid: {
        es: { asunto: '{cliente} pagó tu cotización {folio}', linea: '{cliente} pagó la cotización {folio} — {total} ya están en camino.', cta: 'Ver cotización' },
        en: { asunto: '{cliente} paid your quote {folio}', linea: '{cliente} paid quote {folio} — {total} is on its way.', cta: 'View quote' },
    },
    quote_expiring: {
        es: { asunto: 'La cotización {folio} está por vencer', linea: 'La cotización {folio} de {cliente} vence pronto y sigue sin respuesta.', cta: 'Ver cotización' },
        en: { asunto: 'Quote {folio} is about to expire', linea: "{cliente}'s quote {folio} expires soon and is still awaiting a response.", cta: 'View quote' },
    },
    payment_overdue: {
        es: { asunto: 'El pago de {folio} venció sin cobrarse', linea: 'La cotización {folio} de {cliente} venció sin que se registrara el pago.', cta: 'Ver cobranza' },
        en: { asunto: 'Payment for {folio} is overdue', linea: "{cliente}'s quote {folio} is past due and hasn't been paid.", cta: 'View collections' },
    },
    team_join: {
        es: { asunto: 'Alguien se unió a tu equipo en Cord', linea: '{detalle} se unió a tu cuenta de Cord.', cta: 'Ver equipo' },
        en: { asunto: 'Someone joined your team on Cord', linea: '{detalle} joined your Cord account.', cta: 'View team' },
    },
};

function fill(txt: string, vars: Record<string, string>): string {
    let s = txt;
    for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
    return s;
}

function renderEmail(evento: NotifyEvent, en: boolean, orgNombre: string, color: string, data: NotifyData, link: string, currency: string): { subject: string; html: string } {
    const c = en ? COPY[evento].en : COPY[evento].es;
    const vars: Record<string, string> = {
        cliente: esc(data.cliente || (en ? 'Your client' : 'Tu cliente')),
        folio: esc(data.folio || ''),
        total: data.total != null ? money(data.total, en, currency) : '',
        detalle: esc(data.detalle || ''),
    };
    const subject = fill(c.asunto, vars);
    const linea = fill(c.linea, vars);
    const brand = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#0a192f';
    const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;">
            </div>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin:0 0 32px;font-weight:400;">${linea}</p>
            <div style="margin:0 0 40px;">
                <a href="${link}" style="display:inline-block;background-color:${brand};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${c.cta}</a>
            </div>
            <div style="margin-top:16px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${esc(orgNombre)} · ${en ? 'sent by' : 'enviado por'} Cord</p>
            </div>
        </div>
    </div>`;
    return { subject, html };
}

/**
 * Emisor de bajo nivel: consulta la matriz `notif_prefs` de la org y, si el
 * evento está marcado, manda correo al dueño y/o postea a Slack. Nunca lanza.
 */
export async function notify(orgId: string, evento: NotifyEvent, data: NotifyData = {}): Promise<void> {
    try {
        const [org] = await sql`
            select o.notif_prefs, o.slack_webhook_url, o.sandbox_of, o.is_demo,
                   o.nombre, o.moneda, coalesce(o.idioma, 'es-MX') as idioma,
                   coalesce(o.color_marca, '#0a192f') as color,
                   u.email as owner_email
            from orgs o
            left join users u on u.id = o.owner_id
            where o.id = ${orgId}`;
        // Entorno de PRUEBA / org demo: nunca mandar notificaciones reales por
        // datos que no son reales — mismo criterio que crons/otros emisores.
        if (!org || org.sandbox_of || org.is_demo) return;

        const P = (org.notif_prefs || {}) as Record<string, { email?: boolean; slack?: boolean }>;
        const usaDefaults = Object.keys(P).length === 0;
        const pref = usaDefaults ? (DEFAULTS[evento] || {}) : (P[evento] || {});

        const en = String(org.idioma).toLowerCase().startsWith('en');
        const link = data.link || siteOrigin();
        // La divisa del dato manda (una cotización puede estar en otra divisa
        // que la default del negocio); la de la org es el respaldo.
        const currency = normalizeCurrency(data.moneda || (org.moneda as string));

        if (pref.email && org.owner_email) {
            const { subject, html } = renderEmail(evento, en, org.nombre as string, org.color as string, data, link, currency);
            await sendEmail({ orgId, operation: `notify_${evento}`, to: org.owner_email as string, subject, html });
        }
        if (pref.slack && org.slack_webhook_url && data.folio) {
            await postToSlack(org.slack_webhook_url as string, `notify.${evento}`, {
                folio: data.folio, cliente: data.cliente ?? null, total: data.total ?? 0, link, moneda: currency,
            });
        }
    } catch { /* nunca romper la operación que originó el evento */ }
}

/**
 * Conveniencia para los 4 eventos de tiempo real de una cotización (vista,
 * aprobada, rechazada, pagada): resuelve folio/cliente/total/link con una
 * query mínima y llama a `notify()`. Espejo de `dispatchQuoteEvent` en
 * webhooks.ts, pero para el canal dueño-de-negocio en vez de integraciones.
 */
export async function notifyQuoteEvent(orgId: string, cotizacionId: string, evento: 'quote_viewed' | 'quote_approved' | 'quote_rejected' | 'quote_paid'): Promise<void> {
    try {
        const [q] = await sql`
            select c.id, c.folio, c.total, c.base_currency, cl.empresa
            from cotizaciones c left join clientes cl on cl.id = c.cliente_id
            where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
        if (!q) return;
        await notify(orgId, evento, {
            folio: q.folio as string,
            cliente: (q.empresa as string) ?? null,
            total: Number(q.total ?? 0),
            moneda: (q.base_currency as string) || undefined,
            link: `${siteOrigin()}/app/cotizaciones/${q.id}`,
        });
    } catch { /* nunca romper la operación que originó el evento */ }
}
