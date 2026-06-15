// Correos transaccionales vía Resend (REST, sin SDK). Mismo patrón que el cron
// de recordatorios. TODO está gated por RESEND_API_KEY: si no está configurada,
// no se manda nada y se devuelve { sent:false, skipped:'sin RESEND_API_KEY' }
// (la app sigue funcionando — el link se genera igual).
import { sql } from './db';

const RESEND_KEY = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Trato <cotizaciones@trato.flouvia.com>';

const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(Number(n ?? 0));
const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');

export interface SendResult { sent: boolean; skipped?: string; error?: string; to?: string }

/** Envía un correo crudo. Devuelve el resultado sin lanzar. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendResult> {
    if (!RESEND_KEY) return { sent: false, skipped: 'sin RESEND_API_KEY' };
    if (!opts.to) return { sent: false, skipped: 'sin destinatario' };
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: RESEND_FROM, to: opts.to, subject: opts.subject, html: opts.html }),
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
 * correo. `origin` = base URL (https://trato.flouvia.com) para el link público.
 */
export async function notifyQuoteSent(orgId: string, cotizacionId: string, origin: string): Promise<SendResult> {
    const rows = await sql`
        select c.folio, c.total, c.public_token, cl.empresa, cl.email,
               o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               coalesce(o.pdf_mensaje, '') as mensaje
        from cotizaciones c
        join orgs o on o.id = c.org_id
        left join clientes cl on cl.id = c.cliente_id
        where c.id = ${cotizacionId} and c.org_id = ${orgId}`;
    if (!rows.length) return { sent: false, skipped: 'cotización no encontrada' };
    const r = rows[0] as any;
    if (!r.email) return { sent: false, skipped: 'el cliente no tiene correo' };

    const link = `${origin}/q/${r.public_token}`;
    const color = /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : '#0a192f';
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f1729;max-width:480px;margin:0 auto">
        <p style="font-size:15px">Estimado equipo de <b>${esc(r.empresa || 'cliente')}</b>,</p>
        <p style="font-size:15px;line-height:1.5">${esc(r.org_nombre)} le comparte la cotización <b>${esc(r.folio)}</b> por <b>${money(r.total)}</b>. Puede revisarla, dejar comentarios y aprobarla en línea:</p>
        <p style="margin:24px 0">
            <a href="${link}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px">Ver cotización ${esc(r.folio)}</a>
        </p>
        <p style="font-size:13px;color:#5b6472">O copie este enlace: <br><a href="${link}" style="color:${color}">${link}</a></p>
        ${r.mensaje ? `<p style="font-size:13px;color:#5b6472;border-top:1px solid #eee;padding-top:12px;margin-top:20px">${esc(r.mensaje)}</p>` : ''}
        <p style="font-size:13px;color:#9aa1ad;margin-top:20px">${esc(r.org_nombre)} · enviado con Trato</p>
    </div>`;
    return sendEmail({ to: r.email, subject: `Cotización ${r.folio} — ${r.org_nombre}`, html });
}
