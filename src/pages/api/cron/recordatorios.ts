// GET /api/cron/recordatorios — recordatorios de cobro automáticos.
// Busca cuentas por cobrar cuyo vencimiento cae en los próximos 3 días y, si hay
// RESEND_API_KEY, envía un correo con la marca de Cord vía Resend (mismo helper y
// plantilla que notifyQuoteSent/cron de cobranza). Pensado para correr como cron
// de Vercel (ver vercel.json). Protegido con CRON_SECRET: Vercel manda
// Authorization: Bearer ${CRON_SECRET}.
//
// ⚠️ Fix jul 2026: antes usaba getActiveOrgId() — que sin sesión (contexto cron)
// SIEMPRE resolvía la org demo, así que ningún negocio real recibía recordatorios.
// Ahora itera TODAS las orgs con cartera viva (excluyendo sandboxes de prueba),
// igual que el cron de intereses.
//
// ⚠️ Fix jul 2026 (bis): el link del correo se armaba con `new URL(request.url)
// .origin` — en un request disparado por el cron de Vercel (no por un navegador)
// eso resuelve a la URL interna del deployment (tipo https://flouvia-cord-xxxx
// .vercel.app), no a cordhq.app. El correo salía con un link roto/feo. Ahora usa
// `siteOrigin()` (mismo helper que ya usa dispatchQuoteEvent para webhooks), y el
// HTML se armó igual al resto de correos transaccionales (logo, color de marca,
// botón pill) en vez de texto plano sin estilo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, logAudit } from '../../../lib/db';
import { sendEmail, siteOrigin } from '../../../lib/email';
import { notify } from '../../../lib/notify';

const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n);

export const GET: APIRoute = async ({ request }) => {
    // Auth del cron (si está configurado el secreto).
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // Cartera viva de TODAS las orgs reales (una sola query; el volumen es bajo:
    // solo approved/invoiced con email y vencimiento próximo). Las orgs sandbox
    // (entorno de prueba) y la demo quedan fuera.
    const rows = await sql`
        select c.id, c.folio, c.total, c.terminos, c.public_token,
               coalesce(c.approved_at, c.created_at) as base,
               cl.empresa, cl.email,
               o.id as org_id, o.nombre as org_nombre, coalesce(o.color_marca, '#0a192f') as color,
               (o.portal_powered = false and cord_effective_plan(o.id) <> 'free') as powered_off
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.status in ('approved', 'invoiced')
          and c.es_recurrente is not true
          and cl.email is not null and cl.email <> ''
          and o.sandbox_of is null
          and o.owner_id::text <> '00000000-0000-0000-0000-000000000000'`;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;
    const todas = rows.map((r) => {
        const due = new Date(r.base as string); due.setDate(due.getDate() + (DAYS[r.terminos as string] ?? 0));
        const dias = Math.round((due.getTime() - today.getTime()) / MS);
        return {
            id: r.id as string, folio: r.folio as string, total: num(r.total),
            token: r.public_token as string, empresa: r.empresa as string, email: r.email as string,
            orgId: r.org_id as string, orgNombre: (r.org_nombre as string) || 'Cord',
            color: /^#[0-9a-fA-F]{6}$/.test(r.color as string) ? (r.color as string) : '#0a192f',
            poweredOff: r.powered_off === true,
            vence: due, dias,
        };
    });
    const candidatos = todas.filter((c) => c.dias >= 0 && c.dias <= 3); // vence en los próximos 3 días
    // Owner: aviso de "pago vencido" (evento payment_overdue) exactamente el
    // primer día tras el vencimiento — coincidencia exacta de fecha, el cron
    // corre una vez al día, así se dispara una sola vez por cotización sin
    // necesitar una tabla de dedup.
    const vencidasHoy = todas.filter((c) => c.dias === -1);

    const origin = siteOrigin();
    let enviados = 0;
    for (const c of candidatos) {
        const link = `${origin}/q/${c.token}`;
        const venceTxt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(c.vence);
        const poweredLine = c.poweredOff ? esc(c.orgNombre) : `${esc(c.orgNombre)} · enviado con Cord`;
        const html = `<div style="background-color:#ffffff;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="max-width:540px;margin:0 auto;">
                <div style="margin-bottom:32px;">
                    <img src="https://cordhq.app/imgs/logo-cord-navy.png" width="90" height="auto" alt="Cord Logo" style="display:block;">
                </div>

                <p style="font-size:16px;color:#111827;margin-top:0;font-weight:500;">Hola, equipo de ${esc(c.empresa)}</p>
                <p style="font-size:16px;line-height:1.6;color:#374151;margin-bottom:32px;font-weight:400;">Les recordamos que la cotización <b>${esc(c.folio)}</b> por <b>${money(c.total)}</b> vence el <b>${venceTxt}</b>.</p>

                <div style="margin:40px 0;">
                    <a href="${link}" style="display:inline-block;background-color:${c.color};color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 24px;border-radius:8px;">Ver y pagar ${esc(c.folio)}</a>
                </div>

                <p style="font-size:14px;color:#6B7280;line-height:1.5;word-break:break-all;">O copia y pega este enlace en tu navegador:<br><a href="${link}" style="color:#2563EB;text-decoration:none;">${link}</a></p>

                <div style="margin-top:48px;padding-top:24px;border-top:1px solid #E5E7EB;">
                    <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.5;">${poweredLine}</p>
                </div>
            </div>
        </div>`;
        const res = await sendEmail({
            orgId: c.orgId,
            operation: 'payment_reminder',
            to: c.email,
            subject: `Recordatorio de pago — ${c.folio}`,
            html,
            fromName: c.orgNombre,
        });
        if (res.sent) { enviados++; await logAudit(c.orgId, { accion: 'recordatorio.enviado', entidad: 'cotizacion', entidad_id: c.id, detalle: `${c.folio} → ${c.email}` }); }
    }

    for (const c of vencidasHoy) {
        await notify(c.orgId, 'payment_overdue', {
            folio: c.folio, cliente: c.empresa, total: c.total,
            link: `${origin}/app/cobranza`,
        });
    }

    return json({ enviados, candidatos: candidatos.length, vencidasHoy: vencidasHoy.length });
};

const num = (v: unknown) => Number(v ?? 0);
const esc = (s: string) => String(s).replace(/</g, '&lt;');
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
