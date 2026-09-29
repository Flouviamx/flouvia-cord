// Pagos entre Cord y la contabilidad, en los dos sentidos.
//
//  - **Cord → contabilidad.** Cada cobro de una factura ya contabilizada se
//    registra como pago contra ESA factura, una sola vez. La llave de
//    idempotencia del proveedor es el id del pago de Cord (`requestid` en
//    QuickBooks, `Idempotency-Key` en Xero): cierra la ventana entre crear el
//    pago allá y guardar el vínculo aquí, que antes podía duplicarlo.
//  - **Contabilidad → Cord.** Un pago que el contador registra allá contra una
//    factura de Cord se aplica aquí, con el método del proveedor. Nunca se
//    devuelve: el camino de salida ignora los pagos que entraron por aquí.
//
// Xero cobra solo facturas aprobadas: mientras la factura siga en borrador, el
// pago espera a la siguiente pasada. Y pide la cuenta de banco donde entra el
// dinero, que elige el negocio en la tarjeta.

import { sql, withOrgTx } from '../../db';
import { log } from '../../log';
import { apiJson, ProveedorError } from '../proveedor-http';
import { applyPayment } from '../../fiscal/payments';
import { QBO_API, QBO_MINOR, XERO_API, type ProveedorConta } from './config';
import { leerConexionConta, type ConexionConta } from './service';

const EXT_PAGO: Record<ProveedorConta, string> = { quickbooks: 'qbo_payment', xero: 'xero_payment' };
const EXT_FACTURA: Record<ProveedorConta, string> = { quickbooks: 'qbo_invoice', xero: 'xero_invoice' };
export const PERMISO_PAGOS_XERO = 'accounting.payments';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const qbo = (realmId: string, recurso: string) =>
    `${QBO_API()}/v3/company/${encodeURIComponent(realmId)}/${recurso}${recurso.includes('?') ? '&' : '?'}minorversion=${QBO_MINOR}`;
const xh = (tenantId: string, extra: Record<string, string> = {}) => ({ 'Xero-tenant-id': tenantId, ...extra });

export interface PagoExterno { id: string; monto: number; fecha: string | null }
interface FacturaExterna { cobrable: boolean; clienteId: string | null; pagos: PagoExterno[] }

async function leerFacturaExterna(cx: ConexionConta, facturaId: string): Promise<FacturaExterna | null> {
    if (cx.proveedor === 'xero') {
        const r = await apiJson(`${XERO_API}/Invoices/${encodeURIComponent(facturaId)}`, { token: cx.token, headers: xh(cx.cuenta) });
        const inv = r?.Invoices?.[0];
        if (!inv) return null;
        return {
            cobrable: inv.Status === 'AUTHORISED' || inv.Status === 'PAID',
            clienteId: inv.Contact?.ContactID ? String(inv.Contact.ContactID) : null,
            pagos: (inv.Payments ?? []).map((p: any) => ({ id: String(p.PaymentID), monto: r2(Number(p.Amount) || 0), fecha: p.Date ?? null })),
        };
    }
    const q = `select * from Invoice where Id = '${facturaId.replace(/\D/g, '')}'`;
    const r = await apiJson(`${QBO_API()}/v3/company/${encodeURIComponent(cx.cuenta)}/query?minorversion=${QBO_MINOR}&query=${encodeURIComponent(q)}`, { token: cx.token });
    const inv = r?.QueryResponse?.Invoice?.[0];
    if (!inv) return null;
    const idsPago = (inv.LinkedTxn ?? []).filter((t: any) => t?.TxnType === 'Payment').map((t: any) => String(t.TxnId));
    const pagos: PagoExterno[] = [];
    for (const id of idsPago.slice(0, 20)) {
        const p = await apiJson(qbo(cx.cuenta, `payment/${encodeURIComponent(id)}`), { token: cx.token });
        const pago = p?.Payment;
        if (!pago) continue;
        // Un pago de QuickBooks puede repartirse entre varias facturas: cuenta
        // solo la parte aplicada a ESTA.
        const monto = (pago.Line ?? [])
            .filter((l: any) => (l.LinkedTxn ?? []).some((t: any) => t?.TxnType === 'Invoice' && String(t.TxnId) === String(inv.Id)))
            .reduce((s: number, l: any) => s + (Number(l.Amount) || 0), 0);
        if (monto > 0) pagos.push({ id: String(pago.Id), monto: r2(monto), fecha: pago.TxnDate ?? null });
    }
    return { cobrable: true, clienteId: inv.CustomerRef?.value ? String(inv.CustomerRef.value) : null, pagos };
}

async function crearPagoExterno(
    cx: ConexionConta, factura: { id: string; clienteId: string | null }, pago: { id: string; monto: number; fecha: string; referencia: string }, cuentaXero: string | null,
): Promise<string> {
    if (cx.proveedor === 'xero') {
        if (!cuentaXero) throw new ProveedorError('permiso', 'sin cuenta de banco');
        const r = await apiJson(`${XERO_API}/Payments`, {
            token: cx.token, method: 'PUT',
            headers: xh(cx.cuenta, { 'Idempotency-Key': `cord-pago-${pago.id}` }),
            body: JSON.stringify({ Payments: [{
                Invoice: { InvoiceID: factura.id }, Account: { AccountID: cuentaXero },
                Amount: pago.monto, Date: pago.fecha, Reference: pago.referencia.slice(0, 255),
            }] }),
        });
        const id = r?.Payments?.[0]?.PaymentID;
        if (!id) throw new ProveedorError('proveedor', 'no se creó el pago');
        return String(id);
    }
    if (!factura.clienteId) throw new ProveedorError('proveedor', 'factura sin cliente');
    const r = await apiJson(qbo(cx.cuenta, `payment?requestid=${encodeURIComponent(`cord-pago-${pago.id}`)}`), {
        token: cx.token, method: 'POST',
        body: JSON.stringify({
            CustomerRef: { value: factura.clienteId },
            TotalAmt: pago.monto,
            TxnDate: pago.fecha,
            PaymentRefNum: pago.referencia.slice(0, 21),
            Line: [{ Amount: pago.monto, LinkedTxn: [{ TxnId: factura.id, TxnType: 'Invoice' }] }],
        }),
    });
    const id = r?.Payment?.Id;
    if (!id) throw new ProveedorError('proveedor', 'no se creó el pago');
    return String(id);
}

export async function cuentaDePagosXero(orgId: string): Promise<string | null> {
    const [[row]] = await withOrgTx(orgId, sql`
        select ajustes->>'cuentaPagos' as cuenta from integracion_conexiones
         where org_id = ${orgId} and proveedor = 'xero' and estado <> 'desconectada'`);
    return row?.cuenta ? String(row.cuenta) : null;
}

export async function tienePermisoPagos(orgId: string, proveedor: ProveedorConta): Promise<boolean> {
    if (proveedor === 'quickbooks') return true;
    const [[row]] = await withOrgTx(orgId, sql`
        select scopes from integracion_conexiones where org_id = ${orgId} and proveedor = 'xero' and estado <> 'desconectada'`);
    return Array.isArray(row?.scopes) && (row.scopes as string[]).includes(PERMISO_PAGOS_XERO);
}

export interface ResultadoPagos { enviados: number; recibidos: number; esperando: number }

/**
 * Las dos direcciones para las facturas ya contabilizadas (una, o todas las
 * recientes). Nunca lanza por una factura: registra y sigue con la siguiente.
 */
export async function sincronizarPagos(orgId: string, proveedor: ProveedorConta, documentoId?: string): Promise<ResultadoPagos> {
    const res: ResultadoPagos = { enviados: 0, recibidos: 0, esperando: 0 };
    if (!(await tienePermisoPagos(orgId, proveedor))) return res;
    const cx = await leerConexionConta(orgId, proveedor);
    if (!cx || cx.estado !== 'activa') return res;
    const cuentaXero = proveedor === 'xero' ? await cuentaDePagosXero(orgId) : null;

    const [facturas] = await withOrgTx(orgId, sql`
        select v.local_id, v.externo_id, d.currency, d.lifecycle, d.amount_remaining
          from integracion_vinculos v
          join documentos_fiscales d on d.id = v.local_id and d.org_id = v.org_id
         where v.org_id = ${orgId} and v.conexion_id = ${cx.id}
           and v.objeto = 'invoice' and v.externo_tipo = ${EXT_FACTURA[proveedor]}
           and (${documentoId ?? null}::uuid is null or v.local_id = ${documentoId ?? null}::uuid)
           and d.lifecycle <> 'void'
         order by v.sincronizado_at desc nulls last
         limit ${documentoId ? 1 : 100}`);

    for (const f of facturas as any[]) {
        const docId = String(f.local_id);
        try {
            const externa = await leerFacturaExterna(cx, String(f.externo_id));
            if (!externa) continue;
            const [pagosCord, vinculos] = await withOrgTx(orgId,
                sql`select id, monto, metodo, referencia, aplicado_at from documento_pagos
                     where org_id = ${orgId} and documento_id = ${docId} order by aplicado_at asc`,
                sql`select local_id, externo_id from integracion_vinculos
                     where org_id = ${orgId} and conexion_id = ${cx.id} and objeto = 'payment'`);
            const localLigado = new Set((vinculos as any[]).map((v) => String(v.local_id)));
            const externoLigado = new Set((vinculos as any[]).map((v) => String(v.externo_id)));

            // Salida: cobros de Cord que aún no están allá. Los que entraron
            // desde esta contabilidad no se devuelven.
            for (const p of pagosCord as any[]) {
                if (localLigado.has(String(p.id)) || p.metodo === proveedor) continue;
                if (!externa.cobrable) { res.esperando += 1; continue; }
                const externoId = await crearPagoExterno(cx, { id: String(f.externo_id), clienteId: externa.clienteId }, {
                    id: String(p.id), monto: r2(Number(p.monto)), fecha: new Date(p.aplicado_at).toISOString().slice(0, 10),
                    referencia: `Cord ${p.referencia || p.metodo || ''}`.trim(),
                }, cuentaXero);
                await withOrgTx(orgId, sql`
                    insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
                    values (${orgId}, ${cx.id}, 'payment', ${String(p.id)}, ${EXT_PAGO[proveedor]}, ${externoId}, now())
                    on conflict (conexion_id, externo_tipo, externo_id) do nothing`);
                externoLigado.add(externoId);
                res.enviados += 1;
            }

            // Entrada: pagos registrados allá que Cord no conoce.
            for (const pe of externa.pagos) {
                if (externoLigado.has(pe.id)) continue;
                const referencia = `${proveedor === 'xero' ? 'Xero' : 'QuickBooks'} ${pe.id}`;
                if ((pagosCord as any[]).some((p) => p.metodo === proveedor && p.referencia === referencia)) continue;
                const aplicado = await applyPayment(orgId, docId, {
                    monto: pe.monto, currency: String(f.currency), metodo: proveedor, referencia,
                    nota: `Registrado en ${proveedor === 'xero' ? 'Xero' : 'QuickBooks'}`,
                });
                if (!aplicado.ok) {
                    log.warn('pago de la contabilidad no aplicado en Cord', { route: 'conta-pagos', orgId, proveedor, docId, detalle: aplicado.error });
                    continue;
                }
                const [[nuevo]] = await withOrgTx(orgId, sql`
                    select id from documento_pagos where org_id = ${orgId} and documento_id = ${docId}
                       and metodo = ${proveedor} and referencia = ${referencia} order by created_at desc limit 1`);
                if (nuevo) {
                    await withOrgTx(orgId, sql`
                        insert into integracion_vinculos (org_id, conexion_id, objeto, local_id, externo_tipo, externo_id, sincronizado_at)
                        values (${orgId}, ${cx.id}, 'payment', ${String(nuevo.id)}, ${EXT_PAGO[proveedor]}, ${pe.id}, now())
                        on conflict (conexion_id, externo_tipo, externo_id) do nothing`);
                }
                res.recibidos += 1;
            }
        } catch (err) {
            log.error('no se pudieron sincronizar los pagos', {
                route: 'conta-pagos', orgId, proveedor, docId,
                motivo: err instanceof ProveedorError ? err.motivo : 'desconocido',
                detalle: err instanceof ProveedorError ? err.detalle : undefined, err,
            });
        }
    }
    return res;
}

/** Lo llama `applyPayment` tras un cobro: lo manda a cada contabilidad conectada. */
export async function onPagoFactura(orgId: string, documentoId: string): Promise<void> {
    const [conexiones] = await withOrgTx(orgId, sql`
        select proveedor from integracion_conexiones
         where org_id = ${orgId} and proveedor in ('quickbooks', 'xero') and estado = 'activa'`);
    for (const c of conexiones as any[]) {
        await sincronizarPagos(orgId, c.proveedor as ProveedorConta, documentoId).catch((err) => {
            log.error('no se pudo mandar el pago a la contabilidad', { route: 'conta-pagos', orgId, err });
        });
    }
}

export async function cuentasBancoXero(orgId: string): Promise<{ id: string; nombre: string }[]> {
    const cx = await leerConexionConta(orgId, 'xero');
    if (!cx) return [];
    const r = await apiJson(`${XERO_API}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, { token: cx.token, headers: xh(cx.cuenta) });
    return (r?.Accounts ?? [])
        .filter((a: any) => a?.Status === 'ACTIVE' && a?.AccountID)
        .map((a: any) => ({ id: String(a.AccountID), nombre: [a.Name, a.BankAccountNumber].filter(Boolean).join(' · ') || String(a.AccountID) }));
}

export async function guardarCuentaPagosXero(orgId: string, codigo: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(codigo)) return false;
    const [rows] = await withOrgTx(orgId, sql`
        update integracion_conexiones
           set ajustes = jsonb_set(coalesce(ajustes, '{}'::jsonb), '{cuentaPagos}', to_jsonb(${codigo}::text), true),
               updated_at = now()
         where org_id = ${orgId} and proveedor = 'xero' and estado <> 'desconectada'
        returning id`);
    return rows.length === 1;
}
