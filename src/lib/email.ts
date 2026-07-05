// Correos transaccionales vía Resend (REST, sin SDK). Mismo patrón que el cron
// de recordatorios. TODO está gated por RESEND_API_KEY: si no está configurada,
// no se manda nada y se devuelve { sent:false, skipped:'sin RESEND_API_KEY' }
// (la app sigue funcionando — el link se genera igual).
import { sql } from './db';

const RESEND_KEY = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Cord <cotizaciones@flouvia.com>';

const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(n ?? 0));
const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');

export interface SendResult { sent: boolean; skipped?: string; error?: string; to?: string }

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
export async function sendEmail(opts: { to: string; subject: string; html: string; fromName?: string | null; replyTo?: string | null }): Promise<SendResult> {
    if (!RESEND_KEY) return { sent: false, skipped: 'sin RESEND_API_KEY' };
    if (!opts.to) return { sent: false, skipped: 'sin destinatario' };
    try {
        const payload: Record<string, unknown> = {
            from: fromWith(opts.fromName), to: opts.to, subject: opts.subject, html: opts.html,
        };
        if (opts.replyTo) payload.reply_to = opts.replyTo;
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) return { sent: false, error: `Resend ${res.status}`, to: opts.to };
        return { sent: true, to: opts.to };
    } catch (err: any) {
        return { sent: false, error: err?.message ?? 'fallo de red', to: opts.to };
    }
}

/**
 * Notifica al cliente que tiene una cotización lista para revisar. Busca el
 * folio/total/token + correo del cliente + nombre/color de la org y arma el
 * correo. `origin` = base URL (https://cord.flouvia.com) para el link público.
 */
export async function notifyQuoteSent(orgId: string, cotizacionId: string, origin: string): Promise<SendResult> {
    const rows = await sql`
        select c.folio, c.total, c.public_token, cl.empresa, cl.email,
               o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               coalesce(o.pdf_mensaje, '') as mensaje,
               o.email_from_name, o.email_reply_to, o.email_intro, o.email_firma,
               o.email_contacto, o.portal_powered, o.sandbox_of
        from cotizaciones c
        join orgs o on o.id = c.org_id
        left join clientes cl on cl.id = c.cliente_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
    if (!rows.length) return { sent: false, skipped: 'cotización no encontrada' };
    const r = rows[0] as any;
    if (!r.email) return { sent: false, skipped: 'el cliente no tiene correo' };

    const link = `${origin}/q/${r.public_token}`;
    const color = /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#0a192f';
    // Variables disponibles en intro/firma: {cliente} {folio} {total} {negocio}.
    const fill = (t: string) => esc(t)
        .replace(/\{cliente\}/g, esc(r.empresa || 'cliente'))
        .replace(/\{folio\}/g, esc(r.folio))
        .replace(/\{total\}/g, money(r.total))
        .replace(/\{negocio\}/g, esc(r.org_nombre));
    const intro = (r.email_intro && r.email_intro.trim())
        ? fill(r.email_intro)
        : `${esc(r.org_nombre)} le comparte la cotización <b>${esc(r.folio)}</b> por <b>${money(r.total)}</b>. Puede revisarla, dejar comentarios y aprobarla en línea:`;
    const firma = (r.email_firma && r.email_firma.trim()) ? fill(r.email_firma) : '';
    const poweredLine = r.portal_powered === false ? esc(r.org_nombre) : `${esc(r.org_nombre)} · enviado con Cord`;
    const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>
            
            <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">Estimado equipo de ${esc(r.empresa || 'cliente')},</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">${intro}</p>
            
            <div style="margin:40px 0;">
                <a href="${link}" style="display:inline-block;background-color:${color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">Ver cotización ${esc(r.folio)}</a>
            </div>
            
            <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">O copie este enlace en su navegador:<br><a href="${link}" style="color:#2563EB;text-decoration:none;">${link}</a></p>
            
            ${r.mensaje ? `<div style="margin-top:40px;padding-top:32px;border-top:1px solid #F3F4F6;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">${esc(r.mensaje)}</p></div>` : ''}
            ${firma ? `<div style="margin-top:32px;"><p style="font-size:15px;color:#374151;line-height:1.6;margin:0;">Atentamente,<br>${firma}</p></div>` : ''}

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${poweredLine}</p>
            </div>
        </div>
    </div>`;
    // Entorno de PRUEBA: el correo sale marcado — que nadie confunda una
    // cotización de prueba con una real.
    const testPrefix = r.sandbox_of ? '[Prueba] ' : '';
    return sendEmail({
        to: r.email,
        subject: `${testPrefix}Cotización ${r.folio} — ${r.org_nombre}`,
        html,
        fromName: r.email_from_name || r.org_nombre,
        replyTo: r.email_reply_to || r.email_contacto || null,
    });
}
