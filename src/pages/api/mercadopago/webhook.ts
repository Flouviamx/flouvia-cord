// /api/mercadopago/webhook — notificaciones de pago de Mercado Pago.
//
// Tres cosas que sostienen que esto sea seguro y no duplique dinero:
//
//  - **La firma se verifica y falla CERRADA.** Sin `MP_WEBHOOK_SECRET` no se
//    procesa nada: un webhook de dinero sin verificar deja que cualquiera
//    declare un pago que no ocurrió.
//  - **El cuerpo no se cree.** Trae un id; el pago se LEE del proveedor con el
//    token del vendedor, y de ahí salen importe, divisa y estado.
//  - **La idempotencia es un índice, no un `if`.** `mp_payment_id` es único por
//    organización: Mercado Pago reenvía la misma notificación por diseño, y el
//    segundo intento choca contra la base en vez de pagar dos veces.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, withOrgTx, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { log } from '../../../lib/log';
import { fetchMpPayment, MP_INVOICE_REF, mpSignatureValid, mpWebhookSecret, type MpPayment } from '../../../lib/mercadopago';
import { applyPayment } from '../../../lib/fiscal/payments';
import { recordMpInvoiceRefund } from '../../../lib/fiscal/reconciliation';
import { dispatchInvoiceEvent } from '../../../lib/webhooks';
import { trackPaymentReceived } from '../../../lib/posthog-server';
import { after } from '../../../lib/after';
import { toMinorUnits } from '../../../lib/currency';
import { settleQuoteCobro } from '../../../lib/cobros-settle';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { logAudit } from '../../../lib/db';

export const POST: APIRoute = async ({ request, url }) => {
    const secret = mpWebhookSecret();
    if (!secret) {
        log.error('webhook de Mercado Pago sin secreto configurado', { route: 'mercadopago/webhook' });
        return json({ error: 'not_configured' }, 503);
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* algunas notificaciones llegan solo con query */ }

    // Mercado Pago firma el `data.id` de la URL, en minúsculas.
    const dataId = String(url.searchParams.get('data.id') ?? body?.data?.id ?? url.searchParams.get('id') ?? '').toLowerCase();
    const tipo = String(body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '');
    if (!dataId) return json({ ok: true, ignorado: 'sin_id' });

    if (!mpSignatureValid(request.headers.get('x-signature'), request.headers.get('x-request-id'), dataId, secret)) {
        return json({ error: 'bad_signature' }, 401);
    }
    // Solo los pagos mueven dinero. El resto se acusa recibido para que el
    // proveedor deje de reintentar.
    if (tipo && tipo !== 'payment') return json({ ok: true, ignorado: tipo });

    // Barrido cross-org SOLO para descubrir de quién es el cobro: el trabajo
    // vuelve al carril de la organización (regla 30). `external_reference` es
    // el id del cobro, que es lo único que el proveedor nos devuelve.
    const cobro = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select cc.id, cc.org_id, cc.cotizacion_id, cc.mp_payment_id
              from cotizacion_cobros cc
              join orgs o on o.id = cc.org_id
             where cc.mp_preference_id is not null and o.mp_charges_enabled
               and cc.id::text = ${dataId}`);
        return rows[0] ?? null;
    });

    // Lo normal es que el id del webhook sea el del PAGO, no el del cobro: se
    // resuelve leyendo el pago con el token de cada organización candidata.
    const orgId = cobro?.org_id as string | undefined;
    if (!orgId) return await porReferencia(dataId);

    return (await liquidar(orgId, dataId)) ?? json({ ok: true, ignorado: 'no_legible' });
};

/**
 * Sin dueño conocido todavía: se busca la organización por la preferencia que
 * abrió el cobro. Mercado Pago no dice de quién es el pago, así que el vínculo
 * lo pone Cord cuando creó la preferencia.
 */
async function porReferencia(paymentId: string): Promise<Response> {
    const candidatas = await reqContext.run({ userId: null, cronScope: true }, async () => {
        const [rows] = await withSystemTx(sql`
            select org_id from (
                select cc.org_id, coalesce(cc.mp_preference_at, cc.created_at) as abierta
                  from cotizacion_cobros cc
                  join orgs o on o.id = cc.org_id
                 where cc.status = 'pendiente' and cc.mp_preference_id is not null
                   and o.mp_charges_enabled
                union all
                select d.org_id, d.mp_preference_at as abierta
                  from documentos_fiscales d
                  join orgs o on o.id = d.org_id
                 where d.mp_preference_at is not null and d.lifecycle = 'open'
                   and o.mp_charges_enabled
            ) candidatas
             where abierta > now() - interval '30 days'
             group by org_id
             order by max(abierta) desc
             limit 25`);
        return rows.map((r) => String(r.org_id));
    });

    for (const orgId of candidatas) {
        const res = await liquidar(orgId, paymentId, true);
        if (res) return res;
    }
    // Se acusa recibido: reintentar no va a encontrar dueño y Mercado Pago
    // seguiría reenviando para siempre.
    return json({ ok: true, ignorado: 'sin_dueno' });
}

async function liquidar(orgId: string, paymentId: string, silencioso = false): Promise<Response | null> {
    const pago = await fetchMpPayment(orgId, paymentId);
    if (!pago) return silencioso ? null : json({ ok: true, ignorado: 'no_legible' });
    if (!pago.referencia) return json({ ok: true, ignorado: 'sin_referencia' });

    // Una factura lleva su propio ledger: el prefijo dice cuál de los dos cobra.
    if (pago.referencia.startsWith(MP_INVOICE_REF)) {
        return await liquidarFactura(orgId, pago, silencioso);
    }

    // Un reembolso llega como una notificación más del mismo pago. Se registra
    // antes de mirar el estado: un pago devuelto por completo deja de estar
    // `approved` y saldría por la puerta de abajo sin que nadie lo anotara.
    const devuelto = await registrarReembolsosDeCobro(orgId, pago);
    if (pago.status !== 'approved') return json({ ok: true, estado: pago.status, reembolsos: devuelto });

    return await reqContext.run({ userId: null, orgId, actor: 'system' }, async () => {
        // El índice único hace el trabajo: si esta notificación ya se procesó,
        // no hay fila que actualizar y no se liquida dos veces.
        const [reclamado] = await withOrgTx(orgId, sql`
            update cotizacion_cobros
               set mp_payment_id = ${pago.id}
             where id = ${pago.referencia} and org_id = ${orgId} and mp_payment_id is null
            returning id, cotizacion_id`);
        if (!reclamado.length) {
            // Dos casos que se ven igual y NO lo son. Mercado Pago reenvía la misma
            // notificación por diseño (mismo pago: no hay nada que hacer), pero un
            // SEGUNDO pago distinto contra el mismo cobro es dinero que llegó dos
            // veces y nadie lo iba a notar.
            const [[actual]] = await withOrgTx(orgId, sql`
                select mp_payment_id, cotizacion_id from cotizacion_cobros
                 where id = ${pago.referencia} and org_id = ${orgId}`);
            if (actual && actual.mp_payment_id && String(actual.mp_payment_id) !== pago.id) {
                await avisarDobleCobro(orgId, String(actual.cotizacion_id), pago.id, pago.monto, pago.moneda);
                return json({ ok: true, duplicado: true });
            }
            return json({ ok: true, repetida: true });
        }

        const resultado = await settleQuoteCobro(orgId, {
            cotizacionId: String(reclamado[0].cotizacion_id),
            cobroId: String(reclamado[0].id),
            monto: pago.monto,
            moneda: pago.moneda,
            metodo: 'mercadopago',
            pagoId: pago.id,
            proveedor: 'Mercado Pago',
        });
        // El cobro ya estaba pagado por OTRO riel (Cord Payments): el dinero de
        // Mercado Pago llegó igual y hay que devolverlo.
        if (resultado === 'repetida') {
            await avisarDobleCobro(orgId, String(reclamado[0].cotizacion_id), pago.id, pago.monto, pago.moneda);
            return json({ ok: true, duplicado: true });
        }
        return json({ ok: true, resultado });
    });
}

/**
 * Pago de una FACTURA desde su hosted invoice page. El ledger del documento es
 * otro que el de la cotización, y `applyPayment` es idempotente por el id del
 * pago de Mercado Pago (índice único), así que un reenvío no abona dos veces.
 */
async function liquidarFactura(orgId: string, pago: MpPayment, silencioso: boolean): Promise<Response | null> {
    const documentoId = pago.referencia!.slice(MP_INVOICE_REF.length);
    if (!/^[0-9a-f-]{36}$/i.test(documentoId)) return json({ ok: true, ignorado: 'referencia_invalida' });

    const [dueno] = await withOrgTx(orgId, sql`
        select id from documentos_fiscales where id = ${documentoId} and org_id = ${orgId}`);
    // En el barrido por candidatas, una factura de otra organización no es un
    // error: es que todavía no encontramos a su dueño.
    if (!dueno.length) return silencioso ? null : json({ ok: true, ignorado: 'sin_dueno' });

    return await reqContext.run({ userId: null, orgId, actor: 'system' }, async () => {
        const devuelto = await registrarReembolsosDeFactura(orgId, pago);
        if (pago.status !== 'approved') return json({ ok: true, estado: pago.status, reembolsos: devuelto });

        const resultado = await applyPayment(orgId, documentoId, {
            monto: pago.monto,
            currency: pago.moneda,
            metodo: 'mercadopago',
            mpPaymentId: pago.id,
            referencia: pago.id,
        });
        if (!resultado.ok) {
            await sendOpsAlert('Pago de Mercado Pago sin aplicar a factura',
                `Organización ${orgId}; documento ${documentoId}; pago ${pago.id}; ${resultado.error}`);
            throw new Error('No se pudo conciliar el pago de la factura.');
        }
        if (resultado.justPaid) after(dispatchInvoiceEvent(orgId, documentoId, 'invoice.paid'));
        if (!resultado.duplicate) {
            after((async () => {
                const flags = await orgAnalyticsFlags(orgId);
                await trackPaymentReceived(
                    orgId, pago.monto, pago.moneda, 'mercadopago', false, undefined,
                    flags.isSandbox, flags.isDemo,
                    { payment_id: pago.id, invoice_id: documentoId, payment_kind: 'invoice' },
                );
            })());
        }
        return json({ ok: true, factura: resultado.lifecycle, repetida: resultado.duplicate ?? false });
    });
}

/** Banderas sandbox/demo de la org: datos ficticios no entran a los tableros. */
async function orgAnalyticsFlags(orgId: string): Promise<{ isSandbox: boolean; isDemo: boolean }> {
    const [[row]] = await withOrgTx(orgId, sql`
        select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    return { isSandbox: !!row?.is_sandbox, isDemo: !!row?.is_demo };
}

/**
 * Reembolsos de un cobro de COTIZACIÓN. Mismo ledger que Cord Payments
 * (`cobro_reembolsos`): el saldo devuelto se recalcula desde las filas, nunca
 * se incrementa. Devuelve cuántos quedaron registrados.
 */
async function registrarReembolsosDeCobro(orgId: string, pago: MpPayment): Promise<number> {
    if (!pago.reembolsos.length) return 0;
    const [[cobro]] = await withOrgTx(orgId, sql`
        select id, cotizacion_id from cotizacion_cobros
         where org_id = ${orgId} and mp_payment_id = ${pago.id}`);
    if (!cobro) return 0;

    for (const r of pago.reembolsos) {
        await withOrgTx(orgId,
            sql`insert into cobro_reembolsos
                  (org_id, cobro_id, mp_refund_id, amount_cents, currency, status, updated_at)
                values (${orgId}, ${cobro.id}, ${r.id}, ${toMinorUnits(r.monto, pago.moneda)},
                        ${pago.moneda}, ${r.status}, now())
                on conflict (mp_refund_id) where mp_refund_id is not null
                do update set status = excluded.status, updated_at = now()`,
            sql`update cotizacion_cobros c set
                  reembolsado_cents = coalesce((select sum(x.amount_cents) from cobro_reembolsos x
                                                where x.cobro_id = c.id and x.status in ('succeeded', 'pending')), 0),
                  reembolso_status = ${r.status},
                  refunded_at = case when ${r.status} = 'succeeded' then coalesce(c.refunded_at, now()) else c.refunded_at end
                where c.id = ${cobro.id} and c.org_id = ${orgId}`);
        await logAudit(orgId, {
            accion: 'cord_pagos.reembolso_actualizado', entidad: 'refund', entidad_id: String(r.id),
            detalle: `Mercado Pago ${r.monto} ${pago.moneda}; ${r.status}`,
        });
    }
    // El vendedor lo ve en la cotización, no solo en Mercado Pago.
    const total = pago.reembolsos.filter((r) => r.status === 'succeeded').reduce((a, r) => a + r.monto, 0);
    if (total > 0) {
        await withOrgTx(orgId, sql`
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cobro.cotizacion_id}, 'paid',
                    ${`Reembolso de ${total.toFixed(2)} ${pago.moneda} hecho en Mercado Pago`})`);
    }
    return pago.reembolsos.length;
}

/** Reembolsos de un pago de FACTURA: bajan el saldo pagado del documento. */
async function registrarReembolsosDeFactura(orgId: string, pago: MpPayment): Promise<number> {
    let registrados = 0;
    for (const r of pago.reembolsos) {
        try {
            await recordMpInvoiceRefund(orgId, {
                id: r.id, paymentId: pago.id, amount: r.monto, currency: pago.moneda, status: r.status,
            });
            registrados += 1;
        } catch (err) {
            log.error('no se pudo registrar el reembolso de Mercado Pago', { route: 'mercadopago/webhook', orgId, err });
        }
    }
    return registrados;
}

/** Un cobro recibió dinero por segunda vez: queda a la vista del vendedor y de operaciones. */
async function avisarDobleCobro(orgId: string, cotizacionId: string, pagoId: string, monto: number, moneda: string) {
    await withOrgTx(orgId, sql`
        insert into eventos (org_id, cotizacion_id, tipo, detalle)
        values (${orgId}, ${cotizacionId}, 'paid',
                ${`Se recibió un segundo pago de ${monto.toFixed(2)} ${moneda} por Mercado Pago para un cobro ya pagado; revisa si hay que reembolsarlo`})`);
    await logAudit(orgId, {
        accion: 'cotizacion.pago_duplicado', entidad: 'cotizacion', entidad_id: cotizacionId,
        detalle: `Mercado Pago ${pagoId}`,
    });
    await sendOpsAlert('Pago duplicado en Mercado Pago', `Organización ${orgId}; cotización ${cotizacionId}; pago ${pagoId}; ${monto} ${moneda}`);
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
