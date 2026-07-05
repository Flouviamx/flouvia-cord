// GET /api/cron/intereses — aplica interés moratorio mensual.
// Corre el día 1 de cada mes (ver vercel.json). Para cada org con
// interes_moratorio_pct > 0, busca cotizaciones vencidas (approved|invoiced)
// y registra el cargo mensual en intereses_moratorios. Idempotente por
// (cotizacion_id, periodo): correr dos veces en el mismo mes no duplica.
// Protegido con CRON_SECRET igual que /api/cron/recordatorios.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit } from '../../../lib/db';

const CRON_SECRET = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
const RESEND_KEY  = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Cord <cobranza@flouvia.com>';

const DAYS: Record<string, number> = { contado: 0, net30: 30, net60: 60 };
const money = (n: number) => '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(n);

export const GET: APIRoute = async ({ request }) => {
    if (CRON_SECRET) {
        const auth = request.headers.get('authorization') || '';
        if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'No autorizado' }, 401);
    }

    const now = new Date();
    // Periodo = mes actual ('YYYY-MM'). El cron corre el día 1, así que el
    // interés corresponde al mes que recién arrancó (deuda sigue sin pagarse).
    const periodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const MS = 86400000;

    // Orgs con tasa de interés configurada (cualquier plan que lo habilite).
    const orgs = await sql`
        select id, nombre, interes_moratorio_pct,
               (select email from org_members where org_id = orgs.id and rol = 'owner' limit 1) as owner_email
        from orgs
        where interes_moratorio_pct > 0
          and sandbox_of is null`;

    let totalCargos = 0;
    let totalOrgs   = 0;

    for (const org of orgs) {
        const orgId = org.id as string;
        const tasa  = Number(org.interes_moratorio_pct);

        const rows = await sql`
            select c.id, c.folio, c.total, c.terminos,
                   coalesce(c.approved_at, c.created_at) as base_date,
                   cl.empresa
            from cotizaciones c
            left join clientes cl on cl.id = c.cliente_id
            where c.org_id = ${orgId}
              and c.status in ('approved', 'invoiced')`;

        const cargos: { folio: string; empresa: string; monto: number; diasVencido: number }[] = [];

        for (const r of rows) {
            const base = new Date(r.base_date as string);
            const due  = new Date(base);
            due.setDate(due.getDate() + (DAYS[r.terminos as string] ?? 0));

            const diasVencido = Math.floor((today.getTime() - due.getTime()) / MS);
            if (diasVencido <= 0) continue; // no vencida aún

            const saldo = Number(r.total);
            const monto = parseFloat((saldo * tasa / 100).toFixed(2));

            try {
                // ON CONFLICT DO NOTHING = idempotente
                await sql`
                    insert into intereses_moratorios
                        (org_id, cotizacion_id, periodo, tasa_pct, saldo_base, monto, dias_vencido)
                    values
                        (${orgId}, ${r.id as string}, ${periodo}, ${tasa}, ${saldo}, ${monto}, ${diasVencido})
                    on conflict (cotizacion_id, periodo) do nothing`;

                cargos.push({ folio: r.folio as string, empresa: (r.empresa as string) ?? '—', monto, diasVencido });
            } catch { /* continúa con el resto */ }
        }

        if (cargos.length === 0) continue;

        totalCargos += cargos.length;
        totalOrgs++;

        await logAudit(orgId, {
            accion: 'interes_moratorio.aplicado',
            entidad: 'org',
            entidad_id: orgId,
            detalle: `periodo ${periodo}: ${cargos.length} cargos`,
        });

        // Correo-resumen al owner de la org (opcional, requiere RESEND_API_KEY).
        const ownerEmail = org.owner_email as string | null;
        if (RESEND_KEY && ownerEmail) {
            const total = cargos.reduce((s, c) => s + c.monto, 0);
            const filas = cargos.map(c =>
                `<tr>
                    <td style="padding:6px 0;border-bottom:1px solid #e8eaed">${esc(c.folio)}</td>
                    <td style="padding:6px 0;border-bottom:1px solid #e8eaed">${esc(c.empresa)}</td>
                    <td style="padding:6px 0;border-bottom:1px solid #e8eaed;text-align:right">${c.diasVencido}d</td>
                    <td style="padding:6px 0;border-bottom:1px solid #e8eaed;text-align:right;font-weight:600">${money(c.monto)}</td>
                </tr>`).join('');

            const html = `<div style="font-family:system-ui,Arial,sans-serif;color:#0f1729;max-width:560px">
                <p style="margin-bottom:16px">Resumen de intereses moratorios aplicados en <b>${periodo}</b> (tasa ${tasa}% mensual):</p>
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <thead>
                        <tr style="color:#5b6472;font-size:12px;text-transform:uppercase;letter-spacing:.05em">
                            <th style="text-align:left;padding:0 0 6px;border-bottom:2px solid #e8eaed">Folio</th>
                            <th style="text-align:left;padding:0 0 6px;border-bottom:2px solid #e8eaed">Cliente</th>
                            <th style="text-align:right;padding:0 0 6px;border-bottom:2px solid #e8eaed">Días</th>
                            <th style="text-align:right;padding:0 0 6px;border-bottom:2px solid #e8eaed">Cargo</th>
                        </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" style="padding:10px 0 0;font-weight:600">Total cargado</td>
                            <td style="padding:10px 0 0;font-weight:700;text-align:right">${money(total)}</td>
                        </tr>
                    </tfoot>
                </table>
                <p style="color:#5b6472;font-size:13px;margin-top:20px">
                    Estos cargos quedan registrados en el historial de cobranza de tu cuenta Cord.
                    Los intereses no modifican el total original de cada cotización.
                </p>
            </div>`;

            try {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: RESEND_FROM,
                        to: ownerEmail,
                        subject: `Intereses moratorios ${periodo} — ${esc(org.nombre as string)}`,
                        html,
                    }),
                });
            } catch { /* no bloquea el cron si falla el correo */ }
        }
    }

    return json({ periodo, orgs: totalOrgs, cargos: totalCargos });
};

const esc = (s: string) => String(s ?? '').replace(/</g, '&lt;');
function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
