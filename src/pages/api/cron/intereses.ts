// GET /api/cron/intereses — aplica interés moratorio mensual.
// Corre el día 1 de cada mes (ver vercel.json). Para cada org con
// interes_moratorio_pct > 0, recorre la vista `cuentas_por_cobrar` —que une
// cotizaciones y facturas— y registra el cargo del mes. Idempotente por riel:
// (cotizacion_id, periodo) o (documento_id, periodo).
// Protegido con CRON_SECRET igual que /api/cron/recordatorios.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, logAudit } from '../../../lib/db';
import { currencyDecimals, normalizeCurrency } from '../../../lib/currency';

const RESEND_KEY  = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const RESEND_FROM = import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'Cord <cobranza@flouvia.com>';

// El resumen de intereses lo lee el DUEÑO: va en la divisa de su negocio.
const money = (n: number, currency?: string) => {
    const code = normalizeCurrency(currency);
    const decimals = currencyDecimals(code);
    return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: code,
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(n);
};

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    const now = new Date();
    // Periodo = mes actual ('YYYY-MM'). El cron corre el día 1, así que el
    // interés corresponde al mes que recién arrancó (deuda sigue sin pagarse).
    const periodo = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    // Orgs con tasa de interés configurada (cualquier plan que lo habilite).
    const orgs = await sql`
        select id, nombre, interes_moratorio_pct, moneda,
               (select email from org_members where org_id = orgs.id and rol = 'owner' limit 1) as owner_email
        from orgs
        where interes_moratorio_pct > 0
          and cord_effective_plan(id) in ('scale', 'developer')
          and sandbox_of is null`;

    let totalCargos = 0;
    let totalOrgs   = 0;

    for (const org of orgs) {
        const orgId = org.id as string;
        const tasa  = Number(org.interes_moratorio_pct);
        const orgCurrency = normalizeCurrency(org.moneda as string);

        // Cartera de los DOS rieles. Antes esta consulta hacía `from cotizaciones`
        // y una factura independiente —sin cotización detrás— nunca acumulaba
        // interés por más que se venciera. Además cobraba el interés sobre el
        // TOTAL y no sobre el saldo: un cliente que ya había abonado el 80%
        // seguía pagando interés sobre el 100%.
        const rows = await sql`
            select cxc.origen, cxc.ref_id, cxc.folio, cxc.saldo, cxc.dias_vencido,
                   cl.empresa
            from cuentas_por_cobrar cxc
            left join clientes cl on cl.id = cxc.cliente_id
            where cxc.org_id = ${orgId}
              and cxc.dias_vencido > 0
              and cxc.saldo > 0`;

        const cargos: { folio: string; empresa: string; monto: number; diasVencido: number }[] = [];

        for (const r of rows) {
            const diasVencido = Number(r.dias_vencido);
            if (diasVencido <= 0) continue;

            const saldo = Number(r.saldo);
            if (!(saldo > 0)) continue;
            const monto = parseFloat((saldo * tasa / 100).toFixed(2));
            if (!(monto > 0)) continue;

            const esFactura = r.origen === 'factura';
            const refId = r.ref_id as string;

            try {
                // ON CONFLICT DO NOTHING = idempotente, por riel.
                if (esFactura) {
                    await sql`
                        insert into intereses_moratorios
                            (org_id, documento_id, periodo, tasa_pct, saldo_base, monto, dias_vencido)
                        values
                            (${orgId}, ${refId}, ${periodo}, ${tasa}, ${saldo}, ${monto}, ${diasVencido})
                        on conflict (documento_id, periodo) where documento_id is not null do nothing`;
                } else {
                    await sql`
                        insert into intereses_moratorios
                            (org_id, cotizacion_id, periodo, tasa_pct, saldo_base, monto, dias_vencido)
                        values
                            (${orgId}, ${refId}, ${periodo}, ${tasa}, ${saldo}, ${monto}, ${diasVencido})
                        on conflict (cotizacion_id, periodo) do nothing`;
                }

                cargos.push({ folio: (r.folio as string) ?? '—', empresa: (r.empresa as string) ?? '—', monto, diasVencido });
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
                    <td style="padding:6px 0;border-bottom:1px solid #e8eaed;text-align:right;font-weight:600">${money(c.monto, orgCurrency)}</td>
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
                            <td style="padding:10px 0 0;font-weight:700;text-align:right">${money(total, orgCurrency)}</td>
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
