// SPEI en la factura hospedada (/i/[token]): las instrucciones de pago, cuánto
// del intento ya está fondeado y los dos avisos del proveedor que NO mueven el
// ledger.
//
// Contrato (detalle y alternativas en docs/estado/cobros-facturacion.md,
// "SPEI con CLABE en facturas"):
//
//   - CLABE POR FACTURA. Cada factura tiene su propio Customer en la cuenta
//     conectada (`documentos_fiscales.stripe_spei_customer_id`) y, a lo más, UN
//     intento SPEI abierto a la vez. Todo lo que llega a esa CLABE solo puede
//     fondear un pago de ESA factura: la conciliación automática del proveedor
//     (referencia → importe exacto → el intento más antiguo) no tiene entre qué
//     equivocarse. Una CLABE por cliente la tendría.
//   - El ledger solo se mueve con `payment_intent.succeeded`
//     (`settleInvoiceFromIntent`, idempotente por el índice único
//     `(documento_id, stripe_payment_intent_id)` de `documento_pagos`). Un
//     intento fondeado en parte todavía no es dinero del negocio: el proveedor
//     no lo abona a su saldo hasta completarlo. Aquí solo se avisa.
//   - Lo que sobra queda en el saldo del Customer, a favor del cliente. Tampoco
//     es dinero del negocio. Aquí solo se avisa.
//
// Sin rutas del proveedor en este archivo, a propósito: lo que crea dinero vive
// en la ruta que cumple las cuatro garantías de la regla 33.
// https://docs.stripe.com/payments/bank-transfers/accept-a-payment?country=mx
// https://docs.stripe.com/payments/customer-balance/reconciliation

import { sql, withOrgTx } from '../db';
import { logInvoiceEvent } from '../fiscal/timeline';
import { sendOpsAlert } from '../ops-alert';
import { after } from '../after';
import { fromMinorUnits, normalizeCurrency } from '../currency';

const UUID = /^[0-9a-f-]{36}$/i;

const idDe = (value: unknown): string =>
    typeof value === 'string' ? value : String((value as { id?: unknown } | null)?.id || '');

export interface InstruccionesSpei {
    clabe: string;
    bankName: string;
    /** A nombre de quién se transfiere: el negocio. */
    beneficiary: string | null;
    reference: string;
    /** Lo que falta por transferir, en unidad mínima. */
    amountRemaining: number;
    /** Importe del pago, en unidad mínima. */
    amount: number;
    /** Lo que ya llegó y quedó aplicado a este pago, en unidad mínima. */
    received: number;
    currency: string;
    expiresAt: number | null;
}

/** Un intento que se paga por SPEI (`customer_balance`). */
export function esIntentSpei(intent: any): boolean {
    return Array.isArray(intent?.payment_method_types) && intent.payment_method_types.includes('customer_balance');
}

/**
 * Cuánto de un intento SPEI ya llegó, en unidad mínima. La fuente es
 * `amount_remaining` de las instrucciones: el proveedor la baja con cada
 * transferencia que aplica, también cuando no alcanza.
 */
export function fondeoSpei(intent: any): { monto: number; faltante: number; recibido: number } {
    const monto = Math.max(0, Math.round(Number(intent?.amount) || 0));
    if (intent?.status === 'succeeded') return { monto, faltante: 0, recibido: monto };
    const restante = intent?.next_action?.display_bank_transfer_instructions?.amount_remaining;
    const faltante = restante == null || !Number.isFinite(Number(restante))
        ? monto
        : Math.min(monto, Math.max(0, Math.round(Number(restante))));
    const recibidoReportado = Math.max(Number(intent?.amount_received) || 0, Number(intent?.amount_capturable) || 0);
    return { monto, faltante, recibido: Math.min(monto, Math.max(monto - faltante, recibidoReportado)) };
}

/** Las instrucciones que ve el cliente, o null si el intento todavía no las tiene. */
export function instruccionesSpei(intent: any, beneficiary: string | null | undefined): InstruccionesSpei | null {
    const display = intent?.next_action?.display_bank_transfer_instructions;
    const direcciones = Array.isArray(display?.financial_addresses) ? display.financial_addresses : [];
    const spei = direcciones.map((a: any) => a?.spei).find((v: any) => v?.clabe);
    if (!display || !spei?.clabe || !spei?.bank_name || !display?.reference) return null;
    const f = fondeoSpei(intent);
    return {
        clabe: String(spei.clabe),
        bankName: String(spei.bank_name),
        beneficiary: String(beneficiary || '').trim() || null,
        reference: String(display.reference),
        amountRemaining: f.faltante,
        amount: f.monto,
        received: f.recibido,
        currency: String(display.currency || intent.currency || 'mxn').toUpperCase(),
        expiresAt: Number(display.expires_at) || null,
    };
}

async function orgDeCuenta(account: string | undefined): Promise<string | null> {
    if (!account) return null;
    const [row] = await sql`select cord_resolve_org_for_connected_account(${account}) as id`;
    return (row?.id as string | undefined) ?? null;
}

const importe = (minor: number, currency: string) => `${fromMinorUnits(minor, currency).toFixed(2)} ${currency}`;

/**
 * payment_intent.partially_funded — llegó una transferencia que no alcanza.
 * No se registra pago: el proveedor retiene ese dinero en el intento hasta que
 * llegue el resto. El negocio lo ve en la historia de la factura (y en la
 * campana) y el cliente ve lo que falta al volver a abrir SPEI en la factura.
 */
export async function transferenciaParcial(intent: any, account: string | undefined): Promise<void> {
    if (!esIntentSpei(intent)) return;
    const docId = String(intent?.metadata?.documento_id || '');
    // Una cotización no registra fondeos parciales: su carril es otro.
    if (!UUID.test(docId)) return;
    const customer = idDe(intent?.customer);
    if (!customer) return;
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    // El intento tiene que ser de ESTA factura y de su CLABE: la metadata viaja
    // con el intento y no es la credencial.
    const [[doc]] = await withOrgTx(orgId, sql`
        select id from documentos_fiscales
         where id = ${docId} and org_id = ${orgId} and stripe_spei_customer_id = ${customer}`);
    if (!doc) return;
    const f = fondeoSpei(intent);
    if (!(f.recibido > 0) || !(f.faltante > 0)) return;
    const cur = normalizeCurrency(String(intent?.currency || 'MXN'));
    await logInvoiceEvent(orgId, docId, 'transferencia',
        `Transferencia SPEI incompleta: llegaron ${importe(f.recibido, cur)} de ${importe(f.monto, cur)}; faltan ${importe(f.faltante, cur)} a la misma CLABE. El pago se registra al completarse`);
}

/**
 * cash_balance.funds_available — quedó dinero en el saldo del cliente sin un
 * pago abierto que lo reciba: se transfirió de más, o a la CLABE de un pago que
 * ya no estaba abierto. No es dinero del negocio y no entra al ledger.
 *
 * Si la factura todavía tiene saldo, el proveedor lo aplica solo en cuanto el
 * cliente vuelve a elegir SPEI en la factura (al confirmar el pago se usa
 * primero el saldo). Si no, hay que devolverlo: una cuenta de Cord Payments no
 * tiene panel propio del proveedor, así que el aviso va también a Operaciones.
 */
export async function saldoSinAplicar(balance: any, account: string | undefined): Promise<void> {
    const customer = idDe(balance?.customer);
    if (!customer.startsWith('cus_')) return;
    const orgId = await orgDeCuenta(account);
    if (!orgId) return;
    const [[doc]] = await withOrgTx(orgId, sql`
        select id, lifecycle, amount_remaining from documentos_fiscales
         where org_id = ${orgId} and stripe_spei_customer_id = ${customer}
         limit 1`);
    // No es la CLABE de una factura (cotización, portal): no es de este carril.
    if (!doc) return;
    const disponible = balance?.available && typeof balance.available === 'object' ? balance.available as Record<string, unknown> : {};
    const saldos = Object.entries(disponible)
        .map(([cur, v]) => ({ cur: normalizeCurrency(cur), minor: Math.round(Number(v) || 0) }))
        .filter((s) => s.minor > 0);
    if (!saldos.length) return;
    const texto = saldos.map((s) => importe(s.minor, s.cur)).join(', ');
    const abierta = doc.lifecycle === 'open' && Number(doc.amount_remaining) > 0;
    await logInvoiceEvent(orgId, String(doc.id), 'transferencia', abierta
        ? `Transferencia SPEI sin pago abierto: ${texto} a favor del cliente. Se aplica cuando vuelva a elegir SPEI en la factura`
        : `Transferencia SPEI de más: ${texto} a favor del cliente, sin aplicar a la factura. Hay que devolvérselo`);
    if (!abierta) {
        after(sendOpsAlert('Saldo SPEI a favor del cliente',
            `Organización ${orgId}; factura ${doc.id}; Customer ${customer}; ${texto}. La factura no tiene saldo: coordinar la devolución.`));
    }
}
