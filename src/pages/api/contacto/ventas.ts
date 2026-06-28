// /api/contacto/ventas — recibe el formulario de "Contacto de ventas" de la landing
// y manda DOS correos vía Resend: (1) aviso al equipo de ventas con todos los datos
// del lead, (2) auto-respuesta al prospecto confirmando que lo contactaremos.
// Público (sin sesión). Gated por RESEND_API_KEY: sin la llave responde ok igual
// (no truena la UI) pero marca emailed:false. NUNCA expone errores internos.
//   POST { email, erp?, firstName, lastName, company, role?, volume?, message? }
//     → { ok, emailed } | { error }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';

const SALES_TO = import.meta.env.SALES_EMAIL || process.env.SALES_EMAIL || 'hola@flouvia.com';

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
const clean = (s: unknown, max = 500) => String(s ?? '').trim().slice(0, max);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const VOLUME_LABELS: Record<string, string> = {
    '1m_10m': '$1M - $10M MXN',
    '10m_50m': '$10M - $50M MXN',
    '50m_200m': '$50M - $200M MXN',
    'over_200m': 'Más de $200M MXN',
};

export const POST: APIRoute = async ({ request }) => {
    let body: Record<string, unknown> = {};
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Cuerpo inválido' }, 400);
    }

    const email = clean(body.email, 160).toLowerCase();
    const firstName = clean(body.firstName, 80);
    const lastName = clean(body.lastName, 80);
    const company = clean(body.company, 120);
    const role = clean(body.role, 120);
    const erp = clean(body.erp, 80);
    const volume = clean(body.volume, 40);
    const message = clean(body.message, 2000);
    // Honeypot opcional: si viene relleno, lo tratamos como spam (silenciosamente ok).
    const trap = clean((body as any).website, 100);

    if (!isEmail(email)) return json({ error: 'Correo inválido' }, 400);
    if (!firstName || !company) return json({ error: 'Faltan datos requeridos' }, 400);

    if (trap) return json({ ok: true, emailed: false });

    const fullName = `${firstName} ${lastName}`.trim();
    const volumeLabel = VOLUME_LABELS[volume] || volume || '—';

    // (1) Correo interno al equipo de ventas — con reply-to al prospecto para
    // responderle directo desde el cliente de correo.
    const internalHtml = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>
            
            <p style="font-size:13px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin:0 0 8px 0;">Nuevo Prospecto (Lead)</p>
            <h1 style="font-size:22px;color:#111827;margin-top:0;margin-bottom:32px;font-weight:600;letter-spacing:-0.5px;line-height:1.3;">${esc(fullName)} de ${esc(company)}</h1>
            
            <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5;text-align:left;margin-bottom:32px;">
                <tr style="border-bottom:1px solid #F3F4F6;"><td style="color:#6B7280;padding:12px 0;width:120px;">Nombre</td><td style="color:#111827;font-weight:500;">${esc(fullName)}</td></tr>
                <tr style="border-bottom:1px solid #F3F4F6;"><td style="color:#6B7280;padding:12px 0;">Correo</td><td><a href="mailto:${email}" style="color:#2563EB;text-decoration:none;">${email}</a></td></tr>
                <tr style="border-bottom:1px solid #F3F4F6;"><td style="color:#6B7280;padding:12px 0;">Cargo</td><td style="color:#111827;">${esc(role) || '—'}</td></tr>
                <tr style="border-bottom:1px solid #F3F4F6;"><td style="color:#6B7280;padding:12px 0;">Empresa</td><td style="color:#111827;">${esc(company)}</td></tr>
                <tr style="border-bottom:1px solid #F3F4F6;"><td style="color:#6B7280;padding:12px 0;">ERP actual</td><td style="color:#111827;">${esc(erp) || '—'}</td></tr>
                <tr><td style="color:#6B7280;padding:12px 0;">Volumen</td><td style="color:#111827;font-weight:500;">${esc(volumeLabel)}</td></tr>
            </table>
            
            ${message ? `<p style="font-size:14px;color:#111827;font-weight:600;margin:0 0 12px 0;">Mensaje / Retos</p>
            <p style="font-size:15px;line-height:1.6;color:#4B5563;margin:0;white-space:pre-wrap;background-color:#F9FAFB;padding:20px;border-left:3px solid #E5E7EB;">${esc(message)}</p>` : ''}

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Cord Internal System</p>
            </div>
        </div>
    </div>`;

    const internal = await sendEmail({
        to: SALES_TO,
        subject: `Lead de ventas: ${fullName} (${company})`,
        html: internalHtml,
        fromName: 'Cord · Leads',
        replyTo: email,
    });

    // (2) Auto-respuesta al prospecto.
    const ackHtml = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:540px;margin:0 auto;">
            <div style="margin-bottom:32px;">
                <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
            </div>
            
            <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">Hola ${esc(firstName)},</p>
            <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">Gracias por escribirnos. Hemos recibido tu información de forma segura. Un especialista se pondrá en contacto contigo muy pronto para descubrir cómo podemos ayudar a <strong>${esc(company)}</strong> a digitalizar sus cotizaciones y pedidos B2B.</p>
            
            <div style="margin-top:40px;padding-top:32px;border-top:1px solid #F3F4F6;">
                <p style="font-size:14px;line-height:1.6;color:#6B7280;margin:0;">Mientras tanto, te invitamos a explorar nuestra plataforma:<br><a href="https://cord.flouvia.com" style="color:#2563EB;text-decoration:none;">cord.flouvia.com</a></p>
            </div>

            <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Equipo Cord · Flouvia · Hecho en México</p>
            </div>
        </div>
    </div>`;

    // El ack es best-effort: no bloquea la respuesta si falla.
    await sendEmail({
        to: email,
        subject: 'Recibimos tu mensaje — Cord',
        html: ackHtml,
        fromName: 'Cord',
        replyTo: SALES_TO,
    });

    return json({ ok: true, emailed: internal.sent });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
