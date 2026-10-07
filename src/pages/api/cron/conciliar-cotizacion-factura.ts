// GET /api/cron/conciliar-cotizacion-factura — repara las facturas que nacieron
// con un saldo que su cotización ya había cobrado.
//
// Hasta oct 2026 una factura emitida desde una cotización pagada nacía abierta
// con el total completo, y una factura pagada en `/i` no saldaba su cotización
// (src/lib/fiscal/quote-ledger.ts). Desde entonces la emisión hereda los pagos
// en su propia transacción; esta ruta aplica la MISMA herencia a lo que ya
// existía.
//
// No está en el calendario de vercel.json a propósito: toca dinero histórico y
// se corre a mano, primero en vista previa.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://cordhq.app/api/cron/conciliar-cotizacion-factura
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://cordhq.app/api/cron/conciliar-cotizacion-factura?aplicar=1"
//
// Sin `aplicar=1` no escribe nada: devuelve qué facturas cambiarían y por cuánto.
// Es idempotente: correrla dos veces no aplica un pago dos veces.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { reconcileInvoiceWithQuote } from '../../../lib/fiscal/quote-ledger';
import { log } from '../../../lib/log';

const LIMITE = 500;
/** Presupuesto de tiempo por corrida; es idempotente, así que se vuelve a correr. */
const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request, url }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const aplicar = url.searchParams.get('aplicar') === '1';

    // Descubrimiento cross-org por una función `security definer` estrecha: solo
    // devuelve pares (organización, factura). El trabajo de cada una vuelve al
    // carril de SU organización (regla 30).
    let candidatas: Array<{ org_id: string; documento_id: string }>;
    try {
        candidatas = await sql`select org_id, documento_id from cord_facturas_cotizacion_por_conciliar(${LIMITE})` as any;
    } catch (err) {
        log.error('no se pudieron listar las facturas por conciliar', { route: 'conciliar-cotizacion-factura', err });
        return json({ error: 'No se pudieron listar las facturas.' }, 500);
    }

    const resultados: Array<Record<string, unknown>> = [];
    let fallidas = 0;
    let revisadas = 0;
    const limiteTiempo = Date.now() + PRESUPUESTO_MS;
    for (const f of candidatas) {
        if (Date.now() > limiteTiempo) break;
        revisadas += 1;
        const orgId = String(f.org_id);
        const documentoId = String(f.documento_id);
        try {
            const r = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                reconcileInvoiceWithQuote(orgId, documentoId, { dryRun: !aplicar }));
            const cambia = aplicar
                ? r.heredados > 0 || !!r.settled.quoteId || r.settled.cancelados.length > 0
                : (r.pendiente?.cobros ?? 0) > 0;
            if (cambia || r.skipped) {
                resultados.push({
                    org_id: orgId, documento_id: documentoId,
                    ...(r.skipped ? { omitida: r.skipped } : {}),
                    ...(aplicar
                        ? { pagos_aplicados: r.heredados, monto: r.monto, estado: r.lifecycle, cotizacion_saldada: !!r.settled.quoteId, cobros_cancelados: r.settled.cancelados.length }
                        : { pagos_por_aplicar: r.pendiente?.cobros ?? 0, monto: r.pendiente?.monto ?? 0 }),
                });
            }
        } catch (err) {
            fallidas += 1;
            log.error('no se pudo conciliar una factura con su cotización', { route: 'conciliar-cotizacion-factura', orgId, documentoId, err });
            resultados.push({ org_id: orgId, documento_id: documentoId, error: true });
        }
    }

    return json({
        ok: fallidas === 0,
        modo: aplicar ? 'aplicado' : 'vista_previa',
        revisadas,
        sin_revisar: candidatas.length - revisadas,
        limite_alcanzado: candidatas.length >= LIMITE,
        cambios: resultados.length,
        fallidas,
        resultados,
    }, fallidas ? 500 : 200);
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
