// Eventos del proveedor para el cobro agrupado, la domiciliación y el cobro
// automático. Viven aquí y no en el webhook para que ese archivo solo despache:
// cada función resuelve la organización por la cuenta conectada del evento
// (nunca por la metadata, que viaja con el intento) y vuelve a withOrgTx.
//
// Eventos que el endpoint de Stripe debe tener seleccionados en el scope de
// cuentas conectadas, además de los que ya usaba: payment_intent.processing,
// payment_intent.canceled, setup_intent.succeeded y mandate.updated.

import { sql } from '../db';
import { after } from '../after';
import { log } from '../log';
import { sendOpsAlert } from '../ops-alert';
import { dispatchInvoiceEvent } from '../webhooks';
import { reconcileInvoiceCommission } from '../invoice-payment-fees';
import { trackPaymentReceived } from '../posthog-server';
import { fromMinorUnits, normalizeCurrency } from '../currency';
import { withOrgTx } from '../db';
import {
    activarAutopayDesdeIntent, asentarPagoAgrupado, desactivarPorMandato, falloDeIntent, fallarPagoAgrupado,
    leerPagoAgrupado, liberarPagoEnProceso, marcarPagoEnProceso,
} from './agrupados';
import { esDomiciliacion, metodoAnalitica } from './metodos';
import { avisarFalloCobro } from './avisos';

const UUID = /^[0-9a-f-]{36}$/i;

async function orgDeCuenta(account: string | undefined): Promise<string | null> {
    if (!account) return null;
    const [row] = await sql`select cord_resolve_org_for_connected_account(${account}) as id`;
    return (row?.id as string | undefined) ?? null;
}

async function banderas(orgId: string): Promise<{ isSandbox: boolean; isDemo: boolean }> {
    const [[row]] = await withOrgTx(orgId, sql`
        select (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
    return { isSandbox: !!row?.is_sandbox, isDemo: !!row?.is_demo };
}

const esAgrupado = (intent: any) => UUID.test(String(intent?.metadata?.pago_agrupado_id || ''));
/** Un intento que admitía un débito bancario pudo quedar "en proceso" días. */
const admiteDebito = (intent: any) => Array.isArray(intent?.payment_method_types)
    && intent.payment_method_types.some((t: unknown) => esDomiciliacion(String(t)));

/** payment_intent.succeeded */
export async function cobroConfirmado(intent: any, account: string | undefined): Promise<void> {
    if (!esAgrupado(intent)) {
        // El pago de una sola factura (/i) lo asienta settleInvoiceFromIntent;
        // aquí solo se suelta la marca de "en proceso" del débito.
        if (admiteDebito(intent) && UUID.test(String(intent?.metadata?.documento_id || ''))) {
            const orgId = await orgDeCuenta(account);
            if (orgId) await liberarPagoEnProceso(orgId, String(intent?.id || ''));
        }
        return;
    }
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    let asiento;
    try {
        asiento = await asentarPagoAgrupado(orgId, intent, account);
    } catch (error) {
        await sendOpsAlert('Cobro agrupado sin aplicar',
            `Organización ${orgId}; cobro ${intent?.metadata?.pago_agrupado_id}; PI ${intent?.id}; ${error instanceof Error ? error.message : 'error'}`);
        throw error;
    }
    if (!asiento) return;
    for (const docId of asiento.saldadas) after(dispatchInvoiceEvent(orgId, docId, 'invoice.paid'));
    // Una sola comisión por cobro: el PaymentIntent es la llave de `comisiones`.
    const primera = asiento.pago.asignaciones[0]?.documentoId;
    if (primera && account) {
        const estado = await reconcileInvoiceCommission(orgId, primera, intent, account);
        if (estado === 'needs_review') {
            after(sendOpsAlert('Comisión de cobro agrupado pendiente de revisión',
                `Organización ${orgId}; cobro ${asiento.pago.id}; pago ${intent.id}.`));
        }
    }
    if (intent?.metadata?.cord_autopay_alta === '1' && account) {
        await activarAutopayDesdeIntent(orgId, intent, account).catch((err) =>
            log.error('no se pudo activar el cobro automático tras el pago', { route: 'cobros', orgId, err }));
    }
    const currency = normalizeCurrency(String(intent?.currency || ''));
    const monto = fromMinorUnits(Number(intent?.amount_received ?? intent?.amount ?? 0), currency);
    after((async () => {
        const flags = await banderas(orgId);
        await trackPaymentReceived(orgId, monto, currency, metodoAnalitica(asiento.metodo), false, undefined,
            flags.isSandbox, flags.isDemo, {
                payment_id: String(intent?.id || ''),
                payment_kind: asiento.pago.origen === 'automatico' ? 'autopay' : 'grouped',
                ...(asiento.pago.asignaciones.length === 1 ? { invoice_id: asiento.pago.asignaciones[0].documentoId } : {}),
            });
    })());
}

/** payment_intent.processing — un débito bancario tarda días en confirmarse. */
export async function cobroEnProceso(intent: any, account: string | undefined): Promise<void> {
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    await marcarPagoEnProceso(orgId, intent);
    // El método queda guardado desde que el débito sale: el alta del cobro
    // automático no espera los días de confirmación.
    if (intent?.metadata?.cord_autopay_alta === '1' && account) {
        await activarAutopayDesdeIntent(orgId, intent, account).catch(() => {});
    }
}

/** payment_intent.payment_failed */
export async function cobroFallido(intent: any, account: string | undefined): Promise<void> {
    const pi = String(intent?.id || '');
    if (!esAgrupado(intent)) {
        if (!admiteDebito(intent)) return;
        const orgId = await orgDeCuenta(account);
        if (orgId) await liberarPagoEnProceso(orgId, pi);
        return;
    }
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    const r = await fallarPagoAgrupado(orgId, String(intent.metadata.pago_agrupado_id), falloDeIntent(intent));
    if (!r) return;
    for (const a of r.pago.asignaciones) after(dispatchInvoiceEvent(orgId, a.documentoId, 'invoice.payment_failed'));
    if (r.decision) after(avisarFalloCobro(orgId, r.pago, r.decision));
}

/** payment_intent.canceled — un cobro del portal que nadie confirmó. */
export async function cobroCancelado(intent: any, account: string | undefined): Promise<void> {
    if (!esAgrupado(intent)) return;
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    const pago = await leerPagoAgrupado(orgId, String(intent.metadata.pago_agrupado_id));
    if (!pago || (pago.pi && pago.pi !== intent.id)) return;
    await withOrgTx(orgId, sql`
        update pagos_agrupados set estado = 'cancelado', updated_at = now()
         where id = ${pago.id} and org_id = ${orgId} and estado = 'creado'`);
}

/** setup_intent.succeeded — el cliente guardó un método desde el portal. */
export async function metodoGuardado(setupIntent: any, account: string | undefined): Promise<void> {
    if (!account || setupIntent?.metadata?.cord_flow !== 'autopay') return;
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    await activarAutopayDesdeIntent(orgId, setupIntent, account);
}

/** mandate.updated — un mandato inactivo ya no autoriza cargos. */
export async function mandatoActualizado(mandate: any, account: string | undefined): Promise<void> {
    if (String(mandate?.status || '') !== 'inactive') return;
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    const pm = typeof mandate?.payment_method === 'string' ? mandate.payment_method : String(mandate?.payment_method?.id || '');
    const apagados = await desactivarPorMandato(orgId, pm);
    if (apagados) log.info('cobro automático apagado por mandato inactivo', { route: 'cobros', orgId, clientes: apagados });
}
