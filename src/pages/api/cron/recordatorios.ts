// GET /api/cron/recordatorios — recordatorios de cobro automáticos.
// Busca cuentas por cobrar cuyo vencimiento cae en los próximos 3 días y, si hay
// RESEND_API_KEY, envía un correo amable (pero firme) al cliente vía Resend (REST,
// sin SDK). Pensado para correr como cron de Vercel (ver vercel.json).
// Protegido con CRON_SECRET: Vercel manda Authorization: Bearer ${CRON_SECRET}.
//
// ⚠️ Fix jul 2026: antes usaba getActiveOrgId() — que sin sesión (contexto cron)
// SIEMPRE resolvía la org demo, así que ningún negocio real recibía recordatorios.
// Ahora itera TODAS las orgs con cartera viva (excluyendo sandboxes de prueba),
// igual que el cron de intereses.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit } from '../../../lib/db';

const RESEND_KEY = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Cord <cobranza@flouvia.com>';
const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n);

export const GET: APIRoute = async ({ request }) => {
    // Auth del cron (si está configurado el secreto).
    if (CRON_SECRET) {
        const auth = request.headers.get('authorization') || '';
        if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'No autorizado' }, 401);
    }

    // Cartera viva de TODAS las orgs reales (una sola query; el volumen es bajo:
    // solo approved/invoiced con email y vencimiento próximo). Las orgs sandbox
    // (entorno de prueba) y la demo quedan fuera.
    const rows = await sql`
        select c.id, c.folio, c.total, c.terminos, c.public_token,
               coalesce(c.approved_at, c.created_at) as base,
               cl.empresa, cl.email,
               o.id as org_id, o.nombre as org_nombre
        from cotizaciones c
        join clientes cl on cl.id = c.cliente_id
        join orgs o on o.id = c.org_id
        where c.status in ('approved', 'invoiced')
          and c.es_recurrente is not true
          and cl.email is not null and cl.email <> ''
          and o.sandbox_of is null
          and coalesce(o.clerk_user_id, '') <> 'demo-user'`;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const MS = 86400000;
    const candidatos = rows.map((r) => {
        const due = new Date(r.base as string); due.setDate(due.getDate() + (DAYS[r.terminos as string] ?? 0));
        const dias = Math.round((due.getTime() - today.getTime()) / MS);
        return {
            id: r.id as string, folio: r.folio as string, total: num(r.total),
            token: r.public_token as string, empresa: r.empresa as string, email: r.email as string,
            orgId: r.org_id as string, orgNombre: (r.org_nombre as string) || 'Cord',
            vence: due, dias,
        };
    }).filter((c) => c.dias >= 0 && c.dias <= 3); // vence en los próximos 3 días

    if (!RESEND_KEY) {
        return json({ skipped: 'sin RESEND_API_KEY', candidatos: candidatos.length });
    }

    const origin = new URL(request.url).origin;
    let enviados = 0;
    for (const c of candidatos) {
        const link = `${origin}/q/${c.token}`;
        const venceTxt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' }).format(c.vence);
        const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#0f1729;max-width:480px">
            <p>Estimado equipo de <b>${esc(c.empresa)}</b>,</p>
            <p>Le recordamos amablemente que la cotización <b>${esc(c.folio)}</b> por <b>${money(c.total)}</b> vence el <b>${venceTxt}</b>.</p>
            <p>Puede revisarla y realizar su pago aquí:<br><a href="${link}" style="color:#0a192f;font-weight:600">${link}</a></p>
            <p style="color:#5b6472;font-size:14px">Gracias por su preferencia.<br>${esc(c.orgNombre)}</p>
        </div>`;
        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: RESEND_FROM, to: c.email, subject: `Recordatorio de pago — ${c.folio}`, html }),
            });
            if (res.ok) { enviados++; await logAudit(c.orgId, { accion: 'recordatorio.enviado', entidad: 'cotizacion', entidad_id: c.id, detalle: `${c.folio} → ${c.email}` }); }
        } catch { /* continúa con el resto */ }
    }
    return json({ enviados, candidatos: candidatos.length });
};

const num = (v: unknown) => Number(v ?? 0);
const esc = (s: string) => String(s).replace(/</g, '&lt;');
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
