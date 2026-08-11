export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { sendOpsAlert } from '../../../lib/ops-alert';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    return reqContext.run({ userId: null, cronScope: true }, async () => {
        const now = new Date();
        const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const period = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
        const [inserted] = await withSystemTx(sql`
            insert into comision_invoice_batches
                (org_id, periodo, currency, fee_base_cents, fee_iva_cents, total_cents, status)
            select org_id, ${period}, 'MXN',
                   coalesce(sum(fee_base_cents), 0)::bigint,
                   coalesce(sum(fee_iva_cents), 0)::bigint,
                   coalesce(sum(fee_total_cents), 0)::bigint,
                   'draft'
              from comisiones
             where created_at >= to_date(${period} || '-01', 'YYYY-MM-DD')
               and created_at <  to_date(${period} || '-01', 'YYYY-MM-DD') + interval '1 month'
               and status in ('settled', 'pending')
               and moneda = 'MXN'
             group by org_id
            having sum(fee_total_cents) > 0
            on conflict (org_id, periodo) where org_id is not null do nothing
            returning id, org_id, fee_base_cents, fee_iva_cents, total_cents`);
        const base = inserted.reduce((sum, row) => sum + Number(row.fee_base_cents || 0), 0);
        const iva = inserted.reduce((sum, row) => sum + Number(row.fee_iva_cents || 0), 0);
        const total = inserted.reduce((sum, row) => sum + Number(row.total_cents || 0), 0);
        if (inserted.length) {
            await sendOpsAlert(
                'Borradores mensuales de comisiones listos',
                `${period}: ${inserted.length} organización(es), ${(base / 100).toFixed(2)} MXN + IVA ${(iva / 100).toFixed(2)} MXN. Revisar cada receptor antes de timbrar.`,
            );
        }
        return json({ ok: true, period, created: inserted.length, feeBaseCents: base, feeIvaCents: iva, totalCents: total });
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
