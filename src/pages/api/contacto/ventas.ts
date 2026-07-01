// /api/contacto/ventas — recibe el formulario rediseñado de "Contacto de ventas"
// Campos nuevos: teamSize, monthlyQuotes, currentTool, challenges, timeline, industry
// Manda DOS correos vía Resend: (1) lead interno al equipo, (2) auto-ack al prospecto.
// Gated por RESEND_API_KEY: sin llave responde ok igualmente (no rompe la UI).
// POST { email, firstName, lastName?, company, role?, industry?,
//        teamSize?, monthlyQuotes?, currentTool?,
//        challenges?, timeline?, message?, website? }
export const prerender = false;

import type { APIRoute } from 'astro';
import { sendEmail } from '../../../lib/email';

const SALES_TO = import.meta.env.SALES_EMAIL || process.env.SALES_EMAIL || 'hola@flouvia.com';

const esc   = (s: unknown) => String(s ?? '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const clean = (s: unknown, max = 500) => String(s ?? '').trim().slice(0, max);
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

const TEAM_LABELS: Record<string, string> = {
    solo: 'Solo yo',
    '2_10': '2 – 10 personas',
    '11_50': '11 – 50 personas',
    '50plus': '+50 personas',
};
const QUOTES_LABELS: Record<string, string> = {
    lt50: 'Menos de 50',
    '50_200': '50 – 200',
    '200_500': '200 – 500',
    '500plus': '+500',
};
const TOOL_LABELS: Record<string, string> = {
    excel: 'Excel / Word',
    erp: 'ERP (SAP, Oracle…)',
    sistema_propio: 'Sistema propio',
    sin_sistema: 'Sin sistema / Manual',
};
const CHALLENGE_LABELS: Record<string, string> = {
    portal: 'Portal del cliente',
    cfdi: 'CFDI automático',
    cobranza: 'Cobranza y cobro',
    aprobaciones: 'Aprobaciones de descuentos',
    integraciones: 'Integraciones / API',
    analitica: 'Analítica y márgenes',
};
const TIMELINE_LABELS: Record<string, string> = {
    urgente: 'Lo antes posible',
    '1_3meses': '1 – 3 meses',
    explorando: 'Solo explorando',
};
const INDUSTRY_LABELS: Record<string, string> = {
    distribucion: 'Distribución',
    manufactura: 'Manufactura',
    construccion: 'Construcción',
    servicios: 'Servicios B2B',
    saas: 'Software / SaaS',
    agencia: 'Agencia',
    mayorista: 'Comercio mayorista',
    otro: 'Otro',
};

function labelList(raw: string, map: Record<string, string>): string {
    if (!raw) return '—';
    return raw.split(',').map(v => map[v.trim()] || v.trim()).filter(Boolean).join(' · ') || '—';
}

function row(label: string, value: string, highlight = false) {
    return `<tr style="border-bottom:1px solid #F3F4F6;">
      <td style="color:#6B7280;padding:11px 0;width:150px;font-size:13px;vertical-align:top;">${esc(label)}</td>
      <td style="color:${highlight ? '#0a192f' : '#111827'};font-weight:${highlight ? '600' : '400'};font-size:13px;padding:11px 0 11px 12px;">${value}</td>
    </tr>`;
}

export const POST: APIRoute = async ({ request }) => {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch {
        return json({ error: 'Cuerpo inválido' }, 400);
    }

    const email        = clean(body.email, 160).toLowerCase();
    const firstName    = clean(body.firstName, 80);
    const lastName     = clean(body.lastName, 80);
    const company      = clean(body.company, 120);
    const role         = clean(body.role, 120);
    const industry     = clean(body.industry, 80);
    const teamSize     = clean(body.teamSize, 40);
    const monthlyQuotes = clean(body.monthlyQuotes, 40);
    const currentTool  = clean(body.currentTool, 80);
    const challenges   = clean(body.challenges, 300);
    const timeline     = clean(body.timeline, 40);
    const message      = clean(body.message, 2000);
    const trap         = clean((body as any).website, 100);

    if (!isEmail(email)) return json({ error: 'Correo inválido' }, 400);
    if (!firstName || !company) return json({ error: 'Faltan datos requeridos' }, 400);
    if (trap) return json({ ok: true, emailed: false });

    const fullName = `${firstName} ${lastName}`.trim();

    // Resolved human-readable labels
    const industryLabel  = INDUSTRY_LABELS[industry] || industry || '—';
    const teamLabel      = TEAM_LABELS[teamSize] || teamSize || '—';
    const quotesLabel    = QUOTES_LABELS[monthlyQuotes] || monthlyQuotes || '—';
    const toolLabel      = TOOL_LABELS[currentTool] || currentTool || '—';
    const challengeLabel = labelList(challenges, CHALLENGE_LABELS);
    const timelineLabel  = TIMELINE_LABELS[timeline] || timeline || '—';

    // ── Badge de urgencia para el asunto del correo ─────────────────────────
    const urgencyFlag = timeline === 'urgente' ? '🔴 URGENTE · ' : '';

    // ── Correo interno ───────────────────────────────────────────────────────
    const internalHtml = `
<div style="background:#fff;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;">

  <div style="margin-bottom:36px;">
    <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="86" height="auto" alt="Cord" style="display:block;" />
  </div>

  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9CA3AF;margin:0 0 6px;">Nuevo Lead de Ventas</p>
  <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 4px;letter-spacing:-0.5px;">${esc(fullName)}</h1>
  <p style="font-size:15px;color:#6B7280;margin:0 0 32px;">${esc(company)}${role ? ` · ${esc(role)}` : ''}</p>

  <!-- Contacto -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    ${row('Correo', `<a href="mailto:${email}" style="color:#2563EB;text-decoration:none;">${email}</a>`)}
    ${row('Empresa', esc(company))}
    ${role  ? row('Cargo', esc(role)) : ''}
    ${row('Industria', esc(industryLabel), true)}
  </table>

  <!-- Operación actual -->
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9CA3AF;margin:28px 0 0;">Operación actual</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    ${row('Equipo de ventas', esc(teamLabel))}
    ${row('Cotizaciones/mes', esc(quotesLabel), true)}
    ${row('Herramienta hoy', esc(toolLabel))}
  </table>

  <!-- Necesidades -->
  <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9CA3AF;margin:28px 0 0;">Necesidades</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    ${row('Retos principales', esc(challengeLabel), true)}
    ${row('¿Para cuándo?', esc(timelineLabel), timeline === 'urgente')}
  </table>

  ${message ? `
  <p style="font-size:13px;font-weight:600;color:#374151;margin:28px 0 8px;">Mensaje adicional</p>
  <div style="background:#F9FAFB;border-left:3px solid #D1D5DB;padding:16px 20px;border-radius:0 6px 6px 0;">
    <p style="font-size:14px;line-height:1.65;color:#4B5563;margin:0;white-space:pre-wrap;">${esc(message)}</p>
  </div>` : ''}

  <div style="margin-top:48px;padding-top:20px;border-top:1px solid #F3F4F6;">
    <p style="font-size:11px;color:#D1D5DB;margin:0;">Cord Internal · flouvia.com</p>
  </div>

</div>
</div>`;

    const internal = await sendEmail({
        to: SALES_TO,
        subject: `${urgencyFlag}Lead: ${fullName} · ${company} (${industryLabel})`,
        html: internalHtml,
        fromName: 'Cord · Leads',
        replyTo: email,
    });

    // ── Auto-ack al prospecto ────────────────────────────────────────────────
    const ackHtml = `
<div style="background:#fff;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;">

  <div style="margin-bottom:36px;">
    <img src="https://cord.flouvia.com/imgs/logo-cord-navy.png" width="86" height="auto" alt="Cord" style="display:block;" />
  </div>

  <p style="font-size:16px;color:#111827;font-weight:500;margin:0 0 16px;">Hola ${esc(firstName)},</p>
  <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 16px;">Recibimos tu solicitud de forma segura. Un especialista de Cord se pondrá en contacto contigo en menos de <strong>24 horas hábiles</strong> para preparar una demo personalizada para <strong>${esc(company)}</strong>.</p>
  <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 40px;">Mientras tanto, puedes explorar los planes en <a href="https://cord.flouvia.com/precios" style="color:#0a192f;font-weight:600;text-decoration:none;">cord.flouvia.com/precios</a>.</p>

  <div style="background:#F9FAFB;border-radius:12px;padding:24px 28px;margin-bottom:40px;">
    <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9CA3AF;margin:0 0 14px;">Resumen de tu solicitud</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${row('Empresa', esc(company))}
      ${row('Industria', esc(industryLabel))}
      ${row('Equipo', esc(teamLabel))}
      ${row('Volumen', esc(quotesLabel))}
    </table>
  </div>

  <div style="padding-top:24px;border-top:1px solid #F3F4F6;">
    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">Equipo Cord · Flouvia · Hecho en México</p>
  </div>

</div>
</div>`;

    await sendEmail({
        to: email,
        subject: 'Recibimos tu solicitud — Cord',
        html: ackHtml,
        fromName: 'Cord',
        replyTo: SALES_TO,
    });

    return json({ ok: true, emailed: internal.sent });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
