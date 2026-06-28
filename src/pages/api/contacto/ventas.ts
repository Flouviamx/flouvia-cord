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
    const internalHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f1729;max-width:560px;margin:0 auto">
        <p style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#9aa1ad;margin:0 0 4px">Nuevo lead de ventas · Cord</p>
        <h2 style="font-size:20px;margin:0 0 16px;color:#0a192f">${esc(fullName)} — ${esc(company)}</h2>
        <table style="font-size:14px;line-height:1.6;border-collapse:collapse;width:100%">
            <tr><td style="color:#5b6472;padding:4px 12px 4px 0;white-space:nowrap">Correo</td><td><a href="mailto:${esc(email)}" style="color:#0a192f">${esc(email)}</a></td></tr>
            <tr><td style="color:#5b6472;padding:4px 12px 4px 0">Cargo</td><td>${esc(role) || '—'}</td></tr>
            <tr><td style="color:#5b6472;padding:4px 12px 4px 0">Empresa</td><td>${esc(company)}</td></tr>
            <tr><td style="color:#5b6472;padding:4px 12px 4px 0">ERP actual</td><td>${esc(erp) || '—'}</td></tr>
            <tr><td style="color:#5b6472;padding:4px 12px 4px 0">Volumen B2B mensual</td><td>${esc(volumeLabel)}</td></tr>
        </table>
        ${message ? `<div style="margin-top:16px;border-top:1px solid #eee;padding-top:14px"><p style="color:#5b6472;font-size:13px;margin:0 0 6px">Retos principales</p><p style="font-size:14px;line-height:1.6;margin:0;white-space:pre-wrap">${esc(message)}</p></div>` : ''}
    </div>`;

    const internal = await sendEmail({
        to: SALES_TO,
        subject: `Lead de ventas: ${fullName} (${company})`,
        html: internalHtml,
        fromName: 'Cord · Leads',
        replyTo: email,
    });

    // (2) Auto-respuesta al prospecto.
    const ackHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f1729;max-width:480px;margin:0 auto">
        <p style="font-size:15px">Hola ${esc(firstName)},</p>
        <p style="font-size:15px;line-height:1.6">Gracias por contactar al equipo de <b>Cord</b>. Recibimos tu información y un especialista se pondrá en contacto contigo muy pronto para entender cómo podemos ayudar a ${esc(company)} a digitalizar sus cotizaciones y pedidos B2B.</p>
        <p style="font-size:15px;line-height:1.6">Mientras tanto, puedes explorar la plataforma en <a href="https://cord.flouvia.com" style="color:#0a192f">cord.flouvia.com</a>.</p>
        <p style="font-size:13px;color:#9aa1ad;margin-top:24px">Equipo Cord · Flouvia · Hecho en México</p>
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
