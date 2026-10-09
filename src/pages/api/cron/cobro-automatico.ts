// GET /api/cron/cobro-automatico — cobra las facturas vencidas de los clientes
// con cobro automático activo, y concilia los cobros que quedaron sin cerrar.
//
// Carril de sistema SOLO para el barrido (qué clientes y qué cobros tocar,
// entre organizaciones); el trabajo de cada cliente vuelve a withOrgTx con su
// org_id (regla 30). Corre una vez al día: la política de reintentos fija
// fechas, no horas, y un cargo por día es lo que un cliente espera ver.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { cobrarCliente, conciliarPendiente, type ResultadoCliente } from '../../../lib/cobros/automatico';

const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    if (!STRIPE_KEY) return json({ ok: true, omitido: 'sin proveedor de pagos' });

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        const ahora = new Date();
        const hoy = ahora.toISOString().slice(0, 10);

        // 1. Cobros que quedaron abiertos: sin webhook, sin respuesta del
        //    proveedor, o un débito que lleva días en proceso.
        const [pendientes] = await withSystemTx(sql`
            select id, org_id from pagos_agrupados
             where origen = 'automatico'
               and ((estado = 'creado' and created_at < now() - interval '1 hour')
                 or (estado = 'procesando' and updated_at < now() - interval '3 days'))
             order by created_at
             limit 200`);
        let conciliados = 0;
        for (const p of pendientes) {
            try { await conciliarPendiente(String(p.org_id), String(p.id), ahora); conciliados++; }
            catch (err) { log.error('cobro automático: no se pudo conciliar', { route: 'cron/cobro-automatico', orgId: p.org_id, pago: p.id, err }); }
        }

        // 2. Clientes con cobro automático y alguna factura vencida, por divisa.
        const [candidatos] = await withSystemTx(sql`
            select distinct c.org_id, c.id as cliente_id, d.currency
              from clientes c
              join orgs o on o.id = c.org_id
              join documentos_fiscales d on d.org_id = c.org_id and d.cliente_id = c.id
             where c.autopay_activo and c.autopay_payment_method_id is not null
               and o.sandbox_of is null and coalesce(o.is_demo, false) = false
               and o.stripe_account_id is not null and o.stripe_charges_enabled
               and o.cobro_automatico_permitido
               and d.status = 'issued' and d.lifecycle = 'open' and d.amount_remaining > 0
               and d.credit_note_of is null and d.document_type not in ('credit_note', 'cfdi_egreso')
               and d.pago_en_proceso_pi is null
               and coalesce(d.due_date, d.issued_at::date) <= ${hoy}::date
             order by c.org_id, c.id
             limit 1000`);
        const conteo: Partial<Record<ResultadoCliente, number>> = {};
        for (const c of candidatos) {
            const r = await cobrarCliente(String(c.org_id), String(c.cliente_id), String(c.currency), ahora);
            conteo[r] = (conteo[r] ?? 0) + 1;
        }
        log.info('cobro automático', { route: 'cron/cobro-automatico', candidatos: candidatos.length, conciliados, ...conteo });
        return json({ ok: true, candidatos: candidatos.length, conciliados, resultados: conteo });
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
