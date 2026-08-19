// Correos transaccionales vía Resend (REST, sin SDK). Mismo patrón que el cron
// de recordatorios. TODO está gated por RESEND_API_KEY: si no está configurada,
// no se manda nada y se devuelve { sent:false, skipped:'sin RESEND_API_KEY' }
// (la app sigue funcionando — el link se genera igual).
import { sql, withOrgTx } from './db';
import { currentLocale } from './context';
import { t } from '../i18n/app';
import { trackExternalUsage } from './external-usage';
import { getEntitlementContext } from './org-entitlements';
import { planIncludes } from './entitlements';
import { currencyDecimals, normalizeCurrency } from './currency';
import { buildInvoicePdfAttachment } from './fiscal/invoice-attachment';

const RESEND_KEY = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Cord <cotizaciones@flouvia.com>';

// Origen público fijo para links dentro de correos disparados por CRON (sin un
// request de navegador real detrás). `new URL(request.url).origin` en ese
// contexto resuelve a la URL interna del deployment de Vercel (algo tipo
// https://flouvia-cord-xxxx.vercel.app), NO a cordhq.app — el link salía roto/
// feo en los correos de recordatorios y cobranza. Los endpoints disparados por
// el navegador del vendedor (enviar cotización, etc.) SÍ siguen usando su
// propio origin real, que ya resuelve bien.
export function siteOrigin(): string {
    return (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://cordhq.app').replace(/\/$/, '');
}

// Idioma del correo: se resuelve del request que dispara el envío (el
// VENDEDOR enviando la cotización desde su sesión) — no existe hoy una señal
// fiable del idioma del CLIENTE receptor (no hay locale por cliente en el
// schema). Es el mismo criterio "sin toggle" del resto de la app.
// El correo que recibe el CLIENTE lleva la divisa de la cotización. Antes decía
// "$1,000.00" a secas: el cliente de un negocio en Londres leía dólares donde
// había libras, y el importe del correo no cuadraba con el del link.
const moneyFmt = (n: number, locale: 'es' | 'en', currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-MX', {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Number(n ?? 0));
};
const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');

// `messageId` = el id que devuelve Resend. Lo consume la cobranza con IA para
// sembrar `cobranza_conversaciones.message_id`: el día que se active el correo
// entrante (ver api/webhooks/inbound-email.ts) el threading ya tiene con qué
// emparejar la respuesta del cliente contra su hilo.
export interface SendResult { sent: boolean; skipped?: string; error?: string; to?: string; messageId?: string }

// "Remitente" de Resend: el dominio DEBE estar verificado en Resend, pero el
// NOMBRE visible sí es libre. Combina el nombre custom de la org con la dirección
// del dominio verificado (extraída de RESEND_FROM).
function fromWith(name?: string | null): string {
    if (!name) return RESEND_FROM;
    const m = /<([^>]+)>/.exec(RESEND_FROM);
    const addr = m ? m[1] : RESEND_FROM.replace(/^.*\s/, '');
    return `${String(name).replace(/[<>"]/g, '').slice(0, 80)} <${addr}>`;
}

/** Envía un correo crudo. Devuelve el resultado sin lanzar. */
export interface EmailAttachment {
    filename: string;
    /** Contenido binario. Se codifica a base64 aquí, no en el llamador. */
    content: Uint8Array;
}

export async function sendEmail(opts: { to: string; subject: string; html: string; fromName?: string | null; replyTo?: string | null; orgId?: string | null; operation?: string; attachments?: EmailAttachment[] }): Promise<SendResult> {
    if (!RESEND_KEY) {
        await trackExternalUsage({ orgId: opts.orgId, provider: 'resend', category: 'email', operation: opts.operation || 'transactional_email', status: 'skipped' });
        return { sent: false, skipped: 'sin RESEND_API_KEY' };
    }
    if (!opts.to) return { sent: false, skipped: 'sin destinatario' };
    try {
        const payload: Record<string, unknown> = {
            from: fromWith(opts.fromName), to: opts.to, subject: opts.subject, html: opts.html,
        };
        if (opts.replyTo) payload.reply_to = opts.replyTo;
        // Un adjunto grande hace que Resend rechace el correo entero. Más vale
        // mandar la factura con su link que no mandarla: el PDF siempre se
        // puede descargar desde ahí.
        if (opts.attachments?.length) {
            const MAX_BYTES = 8 * 1024 * 1024;
            const cabe = opts.attachments.filter((a) => a.content.byteLength <= MAX_BYTES);
            if (cabe.length) {
                payload.attachments = cabe.map((a) => ({
                    filename: a.filename,
                    content: Buffer.from(a.content).toString('base64'),
                }));
            }
        }
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            await trackExternalUsage({ orgId: opts.orgId, provider: 'resend', category: 'email', operation: opts.operation || 'transactional_email', status: 'failure', metadata: { http_status: res.status } });
            return { sent: false, error: `Resend ${res.status}`, to: opts.to };
        }
        await trackExternalUsage({ orgId: opts.orgId, provider: 'resend', category: 'email', operation: opts.operation || 'transactional_email' });
        // El id de Resend es best-effort: si el cuerpo no viene o no parsea, el
        // correo YA se envió — no se degrada el resultado por eso.
        let messageId: string | undefined;
        try { messageId = (await res.json())?.id || undefined; } catch { /* sin id */ }
        return { sent: true, to: opts.to, messageId };
    } catch (err: any) {
        await trackExternalUsage({ orgId: opts.orgId, provider: 'resend', category: 'email', operation: opts.operation || 'transactional_email', status: 'failure' });
        return { sent: false, error: err?.message ?? 'fallo de red', to: opts.to };
    }
}

/**
 * Notifica al cliente que tiene una cotización lista para revisar. Busca el
 * folio/total/token + correo del cliente + nombre/color de la org y arma el
 * correo. `origin` = base URL (https://cordhq.app) para el link público.
 */
export async function notifyQuoteSent(orgId: string, cotizacionId: string, origin: string): Promise<SendResult> {
    const [rows] = await withOrgTx(orgId, sql`
        select c.folio, c.total, c.public_token, c.base_currency, cl.empresa, cl.email,
               o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               coalesce(o.pdf_mensaje, '') as mensaje,
               o.email_from_name, o.email_reply_to, o.email_intro, o.email_firma,
               o.email_contacto, o.portal_powered, o.sandbox_of, o.moneda
        from cotizaciones c
        join orgs o on o.id = c.org_id
        left join clientes cl on cl.id = c.cliente_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}`);
    if (!rows.length) return { sent: false, skipped: 'cotización no encontrada' };
    const r = rows[0] as any;
    if (!r.email) return { sent: false, skipped: 'el cliente no tiene correo' };
    const entitlement = await getEntitlementContext(orgId);
    const canRemoveBranding = planIncludes(entitlement.effectivePlan, 'remove_branding');
    const canCustomizeEmail = planIncludes(entitlement.effectivePlan, 'custom_email');

    const L = currentLocale();
    const quoteCurrency = normalizeCurrency((r.base_currency as string) || (r.moneda as string));
    const tf = (key: string, vars: Record<string, string> = {}) => {
        let s = t(L, key as any);
        for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
        return s;
    };

    const link = `${origin}/q/${r.public_token}`;
    const color = /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#0a192f';
    // Variables disponibles en intro/firma: {cliente} {folio} {total} {negocio}.
    // (Texto propio del vendedor, capturado en Ajustes › Correo — no se traduce.)
    const fill = (txt: string) => esc(txt)
        .replace(/\{cliente\}/g, esc(r.empresa || t(L, 'email.cliente_generico')))
        .replace(/\{folio\}/g, esc(r.folio))
        .replace(/\{total\}/g, moneyFmt(r.total, L, quoteCurrency))
        .replace(/\{negocio\}/g, esc(r.org_nombre));
    const intro = (canCustomizeEmail && r.email_intro && r.email_intro.trim())
        ? fill(r.email_intro)
        : tf('email.intro_default', { org: esc(r.org_nombre), folio: esc(r.folio), total: moneyFmt(r.total, L, quoteCurrency) });
    const firma = (canCustomizeEmail && r.email_firma && r.email_firma.trim()) ? fill(r.email_firma) : '';
    const poweredLine = canRemoveBranding && r.portal_powered === false ? esc(r.org_nombre) : `${esc(r.org_nombre)}${t(L, 'email.enviado_con_cord')}`;
    const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>

            <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${tf('email.saludo', { empresa: esc(r.empresa || t(L, 'email.cliente_generico')) })}</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">${intro}</p>

            <div style="margin:40px 0;">
                <a href="${link}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${tf('email.ver_cotizacion', { folio: esc(r.folio) })}</a>
            </div>

            <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">${t(L, 'email.copie_enlace')}<br><a href="${link}" style="color:#2563EB;text-decoration:none;">${link}</a></p>

            ${r.mensaje ? `<div style="margin-top:40px;padding-top:32px;border-top:1px solid #F3F4F6;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${esc(r.mensaje)}</p></div>` : ''}
            ${firma ? `<div style="margin-top:32px;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${t(L, 'email.atentamente')}<br>${firma}</p></div>` : ''}

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${poweredLine}</p>
            </div>
        </div>
    </div>`;
    // Entorno de PRUEBA: el correo sale marcado — que nadie confunda una
    // cotización de prueba con una real.
    const testPrefix = r.sandbox_of ? t(L, 'email.prueba_prefix') : '';
    return sendEmail({
        orgId,
        operation: 'quote_sent',
        to: r.email,
        subject: `${testPrefix}${tf('email.asunto', { folio: r.folio, org: r.org_nombre })}`,
        html,
        fromName: canCustomizeEmail ? (r.email_from_name || r.org_nombre) : r.org_nombre,
        replyTo: canCustomizeEmail ? (r.email_reply_to || r.email_contacto || null) : (r.email_contacto || null),
    });
}

// ── Correos de factura ──────────────────────────────────────────────────────
// Antes el cliente NUNCA recibía su factura: `email.ts` solo sabía notificar
// cotizaciones. El vendedor timbraba y después mandaba el PDF a mano por su
// cuenta, fuera de Cord — que es exactamente el punto donde el ciclo "de la
// propuesta al pago" se rompía.

/** t() con sustitución de {vars}, como el `tf` de notifyQuoteSent. */
function tv(locale: 'es' | 'en', key: string, vars: Record<string, string> = {}): string {
    let out = t(locale, key as any);
    for (const k in vars) out = out.split(`{${k}}`).join(vars[k]);
    return out;
}

interface InvoiceEmailRow {
    invoice_number: string | null;
    total: number;
    currency: string | null;
    amount_remaining: number | null;
    due_date: string | null;
    public_token: string | null;
    lifecycle: string;
    email: string | null;
    empresa: string | null;
    org_nombre: string;
    color: string;
    email_from_name: string | null;
    email_reply_to: string | null;
    email_contacto: string | null;
    portal_powered: boolean | null;
    sandbox_of: string | null;
    moneda: string | null;
    email_intro: string | null;
    email_firma: string | null;
    pdf_mensaje: string | null;
}

async function loadInvoiceEmail(orgId: string, documentoId: string): Promise<InvoiceEmailRow | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select d.invoice_number, d.total, d.currency, d.amount_remaining, d.due_date,
               d.public_token, d.lifecycle,
               coalesce(cl.email, cq.email) as email,
               coalesce(cl.empresa, cq.empresa) as empresa,
               o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               o.email_from_name, o.email_reply_to, o.email_contacto,
               o.portal_powered, o.sandbox_of, o.moneda,
               o.email_intro, o.email_firma, o.pdf_mensaje
          from documentos_fiscales d
          join orgs o on o.id = d.org_id
          left join clientes cl on cl.id = d.cliente_id
          left join cotizaciones c on c.id = d.cotizacion_id
          left join clientes cq on cq.id = c.cliente_id
         where d.id = ${documentoId} and d.org_id = ${orgId}`);
    return (rows[0] as unknown as InvoiceEmailRow) || null;
}

function invoiceEmailHtml(r: InvoiceEmailRow, opts: {
    locale: 'es' | 'en';
    link: string;
    saldo: number;
    titulo: string;
    cuerpo: string;
    cta: string;
    poweredLine: string;
    /** Texto propio del vendedor (Ajustes › Correo), ya sustituido y escapado. */
    intro?: string;
    firma?: string;
    mensaje?: string;
}): string {
    const color = /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#0a192f';
    const currency = normalizeCurrency((r.currency as string) || (r.moneda as string));
    const L = opts.locale;
    const vence = r.due_date
        ? new Date(String(r.due_date)).toLocaleDateString(L === 'en' ? 'en-US' : 'es-MX', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        })
        : null;
    const filaVence = vence
        ? `<tr><td style="padding:6px 0;font-size:14px;color:#6B7280;">${t(L, 'fact.e_vence')}</td>
             <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;">${esc(vence)}</td></tr>`
        : '';
    return `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord" style="display:block;">
            </div>

            <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">${esc(r.empresa || t(L, 'fact.e_hola'))}</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">${opts.intro || opts.cuerpo}</p>

            <table style="width:100%;border-collapse:collapse;margin:32px 0;border-top:1px solid #F3F4F6;border-bottom:1px solid #F3F4F6;padding:8px 0;">
                <tr><td style="padding:6px 0;font-size:14px;color:#6B7280;">${t(L, 'fact.e_factura')}</td>
                    <td style="padding:6px 0;font-size:14px;color:#111827;text-align:right;">${esc(r.invoice_number || '—')}</td></tr>
                ${filaVence}
                <tr><td style="padding:6px 0;font-size:15px;color:#111827;font-weight:600;">${t(L, 'fact.e_saldo')}</td>
                    <td style="padding:6px 0;font-size:15px;color:#111827;text-align:right;font-weight:600;">${moneyFmt(opts.saldo, L, currency)}</td></tr>
            </table>

            <div style="margin:40px 0;">
                <a href="${opts.link}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">${esc(opts.cta)}</a>
            </div>

            <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">${t(L, 'email.copie_enlace')}<br><a href="${opts.link}" style="color:#2563EB;text-decoration:none;">${opts.link}</a></p>

            ${opts.mensaje ? `<div style="margin-top:40px;padding-top:32px;border-top:1px solid #F3F4F6;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${opts.mensaje}</p></div>` : ''}
            ${opts.firma ? `<div style="margin-top:32px;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${t(L, 'email.atentamente')}<br>${opts.firma}</p></div>` : ''}

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${opts.poweredLine}</p>
            </div>
        </div>
    </div>`;
}

/**
 * Manda la factura al cliente con su link de pago propio (`/i/[token]`), no el
 * de la cotización: el saldo que se cobra ahí es el de ESTA factura.
 */
export async function notifyInvoiceIssued(orgId: string, documentoId: string): Promise<boolean> {
    const r = await loadInvoiceEmail(orgId, documentoId);
    if (!r || !r.email || !r.public_token) return false;

    const entitlement = await getEntitlementContext(orgId);
    const canRemoveBranding = planIncludes(entitlement.effectivePlan, 'remove_branding');
    const canCustomizeEmail = planIncludes(entitlement.effectivePlan, 'custom_email');
    const L = currentLocale();
    const currency = normalizeCurrency((r.currency as string) || (r.moneda as string));
    const saldo = Number(r.amount_remaining ?? r.total ?? 0);
    const link = `${siteOrigin()}/i/${r.public_token}`;
    const poweredLine = canRemoveBranding && r.portal_powered === false
        ? esc(r.org_nombre)
        : `${esc(r.org_nombre)}${t(L, 'email.enviado_con_cord')}`;

    // El texto propio del vendedor (Ajustes › Correo) se ignoraba en las
    // facturas: solo lo honraba el correo de cotización. Un negocio que
    // personalizó su intro y su firma veía su copy en un correo y no en el otro,
    // sin nada que lo explicara.
    const fill = (txt: string) => esc(txt)
        .replace(/\{cliente\}/g, esc(r.empresa || t(L, 'email.cliente_generico')))
        .replace(/\{folio\}/g, esc(r.invoice_number || ''))
        .replace(/\{total\}/g, moneyFmt(Number(r.total || 0), L, currency))
        .replace(/\{negocio\}/g, esc(r.org_nombre));

    const html = invoiceEmailHtml(r, {
        locale: L, link, saldo, poweredLine,
        titulo: '',
        cuerpo: tv(L, 'fact.e_emitida', {
            org: esc(r.org_nombre),
            numero: esc(r.invoice_number || ''),
            total: moneyFmt(Number(r.total || 0), L, currency),
        }),
        cta: t(L, 'fact.e_cta_ver'),
        intro: (canCustomizeEmail && r.email_intro?.trim()) ? fill(r.email_intro) : undefined,
        firma: (canCustomizeEmail && r.email_firma?.trim()) ? fill(r.email_firma) : undefined,
        mensaje: r.pdf_mensaje?.trim() ? esc(r.pdf_mensaje) : undefined,
    });

    // El PDF va adjunto. Para un área de cuentas por pagar el archivo ES el
    // trámite: un correo con solo un botón obliga a entrar al link, descargar y
    // reenviar a mano. `buildInvoicePdfAttachment` nunca lanza — si el PDF
    // falla, el correo sale igual con su link.
    const pdf = await buildInvoicePdfAttachment(orgId, documentoId);

    const testPrefix = r.sandbox_of ? t(L, 'email.prueba_prefix') : '';
    const result = await sendEmail({
        orgId,
        operation: 'invoice_issued',
        to: r.email,
        subject: `${testPrefix}${tv(L, 'fact.e_asunto', { numero: r.invoice_number || '', org: r.org_nombre })}`.trim(),
        html,
        fromName: canCustomizeEmail ? (r.email_from_name || r.org_nombre) : r.org_nombre,
        replyTo: canCustomizeEmail ? (r.email_reply_to || r.email_contacto || null) : (r.email_contacto || null),
        attachments: pdf ? [pdf] : undefined,
    });
    return result.sent;
}

/** Recordatorio de una factura por vencer o vencida. */
export async function notifyInvoiceReminder(orgId: string, documentoId: string, vencida: boolean): Promise<boolean> {
    const r = await loadInvoiceEmail(orgId, documentoId);
    if (!r || !r.email || !r.public_token) return false;
    // Solo se recuerda lo que sigue abierto: una factura pagada o anulada que
    // recibe recordatorio es la queja más cara que puede generar un cobro.
    if (r.lifecycle !== 'open') return false;

    const entitlement = await getEntitlementContext(orgId);
    const canRemoveBranding = planIncludes(entitlement.effectivePlan, 'remove_branding');
    const canCustomizeEmail = planIncludes(entitlement.effectivePlan, 'custom_email');
    const L = currentLocale();
    const saldo = Number(r.amount_remaining ?? r.total ?? 0);
    const link = `${siteOrigin()}/i/${r.public_token}`;
    const poweredLine = canRemoveBranding && r.portal_powered === false
        ? esc(r.org_nombre)
        : `${esc(r.org_nombre)}${t(L, 'email.enviado_con_cord')}`;

    const cuerpo = tv(L, vencida ? 'fact.e_vencida_cuerpo' : 'fact.e_porvencer_cuerpo', {
        numero: esc(r.invoice_number || ''),
        org: esc(r.org_nombre),
    });

    const html = invoiceEmailHtml(r, {
        locale: L, link, saldo, poweredLine, titulo: '', cuerpo,
        cta: t(L, 'fact.e_cta_pagar'),
    });

    const testPrefix = r.sandbox_of ? t(L, 'email.prueba_prefix') : '';
    const asunto = tv(L, vencida ? 'fact.e_asunto_vencida' : 'fact.e_asunto_porvencer', {
        numero: r.invoice_number || '',
    });
    const result = await sendEmail({
        orgId,
        operation: 'invoice_reminder',
        to: r.email,
        subject: `${testPrefix}${asunto} — ${r.org_nombre}`,
        html,
        fromName: canCustomizeEmail ? (r.email_from_name || r.org_nombre) : r.org_nombre,
        replyTo: canCustomizeEmail ? (r.email_reply_to || r.email_contacto || null) : (r.email_contacto || null),
    });
    return result.sent;
}
