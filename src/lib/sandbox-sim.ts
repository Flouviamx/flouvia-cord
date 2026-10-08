// Simulación del modo prueba (test helpers de la API v1). Todo aquí exige una
// organización sandbox y recorre el mismo código que producción: lo único
// simulado es lo que un tercero respondería (el PAC, el paso del tiempo, el
// cliente abriendo el link).
import { sql, withOrgTx } from './db';
import { markViewed } from './queries';
import { registrarVencimiento } from './quote-expiry';
import { dispatchQuoteEvent, dispatchInvoiceEvent, deliverTestEvent } from './webhooks';
import { WEBHOOK_EVENT_OBJECTS, type CordWebhookEventType } from '../../packages/elements/src/contract/webhook-events';
import type { FiscalDocumentResponse } from './fiscal/index';

export const RESULTADOS_FISCALES = ['exito', 'pac_caido', 'receptor_invalido', 'certificado_vencido', 'timbre_duplicado'] as const;
export type ResultadoFiscal = (typeof RESULTADOS_FISCALES)[number];

export class NotSandboxError extends Error {}

export async function assertSandbox(orgId: string): Promise<void> {
    const [[row]] = await withOrgTx(orgId, sql`select (sandbox_of is not null) as sandbox from orgs where id = ${orgId}`);
    if (!row?.sandbox) throw new NotSandboxError('Los simuladores solo existen en el entorno de prueba.');
}

export async function setNextFiscalOutcome(orgId: string, resultado: ResultadoFiscal): Promise<void> {
    await assertSandbox(orgId);
    await withOrgTx(orgId,
        sql`delete from sandbox_simulaciones where org_id = ${orgId} and tipo = 'fiscal_emision' and consumido_at is null`,
        sql`insert into sandbox_simulaciones (org_id, tipo, resultado) values (${orgId}, 'fiscal_emision', ${resultado})`,
    );
}

/** Toma (y consume) el resultado forzado pendiente; sin uno, la emisión simulada tiene éxito. */
export async function consumeFiscalOutcome(orgId: string): Promise<ResultadoFiscal> {
    try {
        const [rows] = await withOrgTx(orgId, sql`
            update sandbox_simulaciones set consumido_at = now()
             where org_id = ${orgId} and tipo = 'fiscal_emision' and consumido_at is null
            returning resultado`);
        const r = rows[0]?.resultado as ResultadoFiscal | undefined;
        return r && (RESULTADOS_FISCALES as readonly string[]).includes(r) ? r : 'exito';
    } catch {
        return 'exito';
    }
}

const FALLAS: Record<Exclude<ResultadoFiscal, 'exito'>, { error: string; uncertain?: boolean }> = {
    pac_caido: { error: 'El servicio de timbrado no respondió. La factura quedó en borrador: reintenta en unos minutos.', uncertain: true },
    receptor_invalido: { error: 'Los datos fiscales del cliente no coinciden con el registro del SAT (nombre, RFC, régimen o código postal).' },
    certificado_vencido: { error: 'Tu certificado de sello digital venció. Sube uno vigente en Ajustes › Fiscal para volver a timbrar.' },
    timbre_duplicado: { error: 'Este documento ya se había timbrado. Revisa la factura original antes de reintentar.' },
};

export function simulatedFiscalResponse(
    resultado: ResultadoFiscal,
    documentId: string,
    opts: { regulatory: boolean; country: string },
): FiscalDocumentResponse {
    const stamped = opts.regulatory && opts.country === 'MX';
    if (resultado === 'exito') {
        return {
            success: true,
            provider: 'cord-sandbox',
            documentId,
            fiscalId: stamped ? `SIM-${documentId.slice(0, 8).toUpperCase()}` : undefined,
            pdfUrl: `/api/fiscal/documents/${documentId}/pdf`,
            rawProviderData: { simulado: true, modo_prueba: true, regulatory_status: stamped ? 'not_stamped' : 'commercial_only' },
        };
    }
    const falla = FALLAS[resultado];
    return {
        success: false,
        provider: 'cord-sandbox',
        documentId,
        error: falla.error,
        rawProviderData: { simulado: true, modo_prueba: true, simulacion: resultado, ...(falla.uncertain ? { delivery_uncertain: true } : {}) },
    };
}

/** Vence una cotización por el mismo camino que el cron (que nunca toca la sandbox). */
export async function expireQuoteForTest(orgId: string, cotizacionId: string): Promise<boolean> {
    await assertSandbox(orgId);
    const [rows] = await withOrgTx(orgId, sql`
        update cotizaciones set status = 'expired'
         where id = ${cotizacionId} and org_id = ${orgId} and status in ('sent', 'viewed')
        returning id, org_id, folio, total, base_currency, sent_at`);
    if (!rows.length) return false;
    await registrarVencimiento(rows[0] as any, { isSandbox: true, isDemo: false });
    return true;
}

/** El cliente abre el link: misma función que el heartbeat del link público. */
export async function viewQuoteForTest(orgId: string, cotizacionId: string): Promise<void> {
    await assertSandbox(orgId);
    await markViewed(orgId, cotizacionId, { rol: 'client', actorKey: 'v:simulador', nombre: null, ipHash: null, userAgent: 'cord-test-helper' });
}

// Datos de ejemplo por objeto: misma forma que el contrato del SDK, ids con
// prefijo test_ para que nadie los confunda con objetos reales.
function fixture(type: CordWebhookEventType): Record<string, unknown> {
    const quote = {
        id: 'test_quote', folio: 'COT-PRUEBA', status: 'sent', moneda: 'MXN', total: 11600,
        cliente: 'Cliente de prueba', cliente_id: 'test_client', link_publico: 'https://cordhq.app/q/demo',
    };
    const ref = { cotizacion_id: 'test_quote', folio: 'COT-PRUEBA', cliente: 'Cliente de prueba', referencia: 'test_ref' };
    const byObject: Record<string, Record<string, unknown>> = {
        quote,
        invoice: {
            id: 'test_invoice', object: 'invoice', numero: 'F-PRUEBA', folio_fiscal: null, estado: 'open', estado_fiscal: 'issued',
            pais: 'MX', tipo: 'invoice', moneda: 'MXN', total: 11600, pagado: 0, saldo: 11600, vence: null,
            cliente: 'Cliente de prueba', cotizacion_id: 'test_quote', link_publico: null,
        },
        client: { id: 'test_client', object: 'client', empresa: 'Cliente de prueba', contacto: null, email: 'compras@ejemplo.com', telefono: null, rfc: null, terminos: 'contado', country_code: 'MX' },
        product: { id: 'test_product', object: 'product', sku: 'SKU-PRUEBA', nombre: 'Producto de prueba', unidad: 'pieza', precio_lista: 100, activo: true },
        task: { id: 'test_task', object: 'task', titulo: 'Tarea de prueba', due_date: null, done: false, cotizacion_id: 'test_quote', factura_id: null },
        promise: { id: 'test_promise', object: 'promise', cotizacion_id: 'test_quote', fecha_promesa: null, monto: 5000, moneda: 'MXN', estado: 'pendiente' },
        dispute: { id: 'test_dispute', object: 'dispute', monto: 11600, moneda: 'MXN', motivo: 'fraudulent', estado: 'needs_response', fecha_limite: null, ...ref },
        refund: { object: 'refund', monto: 11600, moneda: 'MXN', motivo: null, ...ref },
        payout: { id: 'test_payout', object: 'payout', monto: 11600, moneda: 'MXN', llegada: null, metodo: 'standard', referencia: 'test_ref' },
        account: { object: 'account', puede_cobrar: true, puede_depositar: true, motivo_bloqueo: null, pendientes: 0 },
    };
    const data = { ...byObject[WEBHOOK_EVENT_OBJECTS[type]] };
    if (type === 'payment.partial') Object.assign(data, { tipo: 'anticipo', monto: 5800, numero_cuota: 0, saldo_pendiente: 5800, payment_method: 'card' });
    if (type === 'quote.approval_requested') Object.assign(data, { motivo: 'Descuento mayor al permitido' });
    if (type === 'quote.approval_decided') Object.assign(data, { decision: 'approved' });
    if (type === 'quote.comment_added') Object.assign(data, { autor: 'cliente', mensaje: 'Mensaje de prueba' });
    if (type.endsWith('.failed')) Object.assign(data, { motivo_falla: 'Simulación del modo prueba' });
    return data;
}

/**
 * Dispara un evento a los endpoints de la sandbox. Con `objetoId` real usa los
 * datos verdaderos de esa cotización o factura; sin él, datos de ejemplo.
 */
export async function triggerTestEvent(orgId: string, type: CordWebhookEventType, objetoId?: string): Promise<'real' | 'ejemplo'> {
    await assertSandbox(orgId);
    const object = WEBHOOK_EVENT_OBJECTS[type];
    if (objetoId && object === 'quote') {
        const extra = type === 'payment.partial' ? { tipo: 'anticipo', monto: 0, numero_cuota: 0, saldo_pendiente: 0, payment_method: null } : undefined;
        await dispatchQuoteEvent(orgId, objetoId, type, extra);
        return 'real';
    }
    if (objetoId && object === 'invoice') {
        await dispatchInvoiceEvent(orgId, objetoId, type);
        return 'real';
    }
    await deliverTestEvent(orgId, type, fixture(type));
    return 'ejemplo';
}
