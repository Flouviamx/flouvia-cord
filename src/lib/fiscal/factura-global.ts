// Factura global (CFDI 4.0) de las ventas al público en general (México).
//
// Un negocio que vende sin que el cliente pida factura tiene que documentar
// esas ventas en un CFDI global por periodo, a "PUBLICO EN GENERAL" con el RFC
// genérico XAXX010101000 (RMF regla 2.7.1.21; Anexo 20, nodo
// InformacionGlobal). Antes Cord no lo emitía: una cotización cobrada en su
// link sin factura individual quedaba sin ningún CFDI que la amparara.
//
// Contrato (SAT, "Guía de llenado del CFDI global", versión 4.0):
//   - Receptor XAXX010101000, nombre "PUBLICO EN GENERAL", régimen 616, uso
//     S01 y como DomicilioFiscalReceptor el mismo código postal del
//     LugarExpedicion (MexicoSatProvider lo arma).
//   - Un concepto por venta: ClaveProdServ 01010101, NoIdentificacion = folio
//     de la venta, Cantidad 1, ClaveUnidad ACT, Descripción "Venta",
//     ValorUnitario = subtotal de la venta, ObjetoImp 02 con sus traslados.
//     Una venta con conceptos a distintas tasas se parte en un concepto por
//     tasa con el mismo folio (Facturapi calcula cada traslado sobre el
//     importe del concepto).
//   - MetodoPago PUE; FormaPago la de la venta de mayor importe.
//   - Sin retenciones: "si se hacen retenciones no se puede aplicar la
//     facilidad ... y debe emitirse un CFDI por cada operación".
//   - Periodicidad / Meses / Año con las reglas de cfdi-catalogos.ts.
//
// Doble facturación: `factura_global_ventas` liga cada venta a su global con un
// índice ÚNICO por cotización mientras el vínculo esté vivo. La factura
// individual (emit.ts) se niega mientras la venta esté en una global viva, y
// la global excluye las ventas que ya tienen factura; las dos rutas toman el
// mismo candado por cotización. Cancelar la global (motivo 04 si un cliente
// pidió su factura) libera las ventas en la misma transacción.

import { sql, withOrgTx } from '../db';
import { calculateDocumentTotals } from '../../../packages/elements/src/engine';
import { documentTypeForOrg } from './document-kind';
import { partiesFrom } from './parties';
import { finalizeInvoice } from './invoices';
import { logInvoiceEvent } from './timeline';
import { satFormFor } from './payment-complement';
import {
    globalPeriodError, globalPeriodRange, isFormaPago, PUBLICO_EN_GENERAL, RFC_GENERICO_NACIONAL,
} from './cfdi-catalogos';
import { DEFAULT_PRODUCT_KEY } from './sat-claves';
import type { EmitResult } from './emit';
import type { FiscalLineItem } from './index';

/** Tope de ventas por global: Facturapi admite hasta 5 000 conceptos por factura. */
export const MAX_VENTAS_GLOBAL = 2000;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TASAS_CFDI = [0, 0.08, 0.16];

export type MotivoExclusion = 'en_global' | 'facturada' | 'divisa' | 'retenciones' | 'extranjero' | 'tasa';

export interface VentaGlobal {
    id: string;
    folio: string;
    cliente: string | null;
    clienteRfc: string | null;
    pagadaEn: string;
    total: number;
    subtotal: number;
    impuestos: number;
    formaPago: string;
    /** Conceptos que la venta aporta a la global (uno por tasa). */
    conceptos: FiscalLineItem[];
}

export interface VentaExcluida {
    id: string;
    folio: string;
    cliente: string | null;
    total: number;
    moneda: string;
    motivo: MotivoExclusion;
}

/** Zona del negocio para decidir en qué día cayó cada venta; inválida → la de México. */
export function zonaValida(zona: unknown): string {
    const z = String(zona || '');
    try {
        if (z) { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; }
    } catch { /* zona inválida */ }
    return 'America/Mexico_City';
}

/** Año en curso en México (el de la Fecha del CFDI que se va a emitir). */
export function anioEnMexico(now = new Date()): number {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', year: 'numeric' }).format(now)) || now.getUTCFullYear();
}

/**
 * Conceptos de UNA venta para la global. Con el mismo motor y el mismo
 * redondeo por línea que la factura individual (emit.ts); el impuesto de cada
 * concepto es base × tasa redondeado, que es lo que el PAC recalcula.
 */
export function conceptosDeVenta(
    folio: string,
    items: Array<{ cantidad: unknown; precio_unitario: unknown; precio_negociado: unknown; tax_rate: unknown; aprobado?: unknown }>,
    opts: { ivaIncluido: boolean; fallbackRate: number },
): FiscalLineItem[] | null {
    const aprobadas = items.filter((it) => it.aprobado !== false);
    if (!aprobadas.length) return null;
    let totals;
    try {
        totals = calculateDocumentTotals(aprobadas.map((it) => ({
            descripcion: 'Venta',
            cantidad: it.cantidad as number,
            precio_unitario: it.precio_unitario as number,
            precio_negociado: (it.precio_negociado ?? null) as number | null,
            tax_rate: it.tax_rate === null || it.tax_rate === undefined ? opts.fallbackRate : Number(it.tax_rate),
        })), { ivaIncluido: opts.ivaIncluido, roundLines: 2 });
    } catch {
        return null;
    }
    const conceptos: FiscalLineItem[] = [];
    for (const grupo of totals.porTasa) {
        const tasa = Math.round(grupo.tasa * 1e6) / 1e6;
        if (!TASAS_CFDI.includes(tasa)) return null;
        const base = round2(grupo.base);
        // El SAT exige ValorUnitario > 0 en un ingreso: un grupo en cero no aporta concepto.
        if (!(base > 0)) continue;
        const impuesto = round2(base * tasa);
        conceptos.push({
            description: 'Venta', quantity: 1, unitPrice: base, taxRate: tasa,
            subtotal: base, taxAmount: impuesto, total: round2(base + impuesto),
            productKey: DEFAULT_PRODUCT_KEY, unitKey: 'ACT', identification: folio,
        });
    }
    return conceptos.length ? conceptos : null;
}

/**
 * Ventas cobradas en el rango (fechas del negocio), separadas en las que la
 * global puede documentar y las que no, con el motivo. Todo bajo el carril de
 * la organización (regla 30).
 */
export async function ventasParaGlobal(orgId: string, rango: { desde: string; hasta: string }): Promise<{
    elegibles: VentaGlobal[]; excluidas: VentaExcluida[]; formaPagoSugerida: string | null;
}> {
    const [[org]] = await withOrgTx(orgId, sql`
        select zona_horaria, iva_pct, moneda from orgs where id = ${orgId} limit 1`);
    const zona = zonaValida(org?.zona_horaria);
    const [ventas] = await withOrgTx(orgId, sql`
        select c.id, c.folio, c.total, c.paid_at, c.payment_method, c.iva_incluido,
               coalesce(c.base_currency, o.moneda, 'MXN') as moneda,
               coalesce(c.retencion_total, 0) as retencion_total,
               cl.empresa as cliente, cl.rfc as cliente_rfc, cl.country_code as cliente_pais,
               exists (select 1 from factura_global_ventas g
                        where g.cotizacion_id = c.id and g.org_id = c.org_id and g.liberada_at is null) as en_global,
               exists (select 1 from documentos_fiscales d
                        where d.cotizacion_id = c.id and d.org_id = c.org_id and d.credit_note_of is null
                          and d.lifecycle <> 'void' and d.informacion_global is null) as facturada
          from cotizaciones c
          join orgs o on o.id = c.org_id
          left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
         where c.org_id = ${orgId} and c.status = 'paid' and c.paid_at is not null
           and (c.paid_at at time zone ${zona})::date between ${rango.desde}::date and ${rango.hasta}::date
         order by c.paid_at asc
         limit ${MAX_VENTAS_GLOBAL + 1}`);
    const candidatas: any[] = [];
    const excluidas: VentaExcluida[] = [];
    const excluir = (v: any, motivo: MotivoExclusion) => excluidas.push({
        id: String(v.id), folio: String(v.folio || ''), cliente: (v.cliente as string) || null,
        total: Number(v.total) || 0, moneda: String(v.moneda || 'MXN').toUpperCase(), motivo,
    });
    for (const v of ventas) {
        if (v.en_global) excluir(v, 'en_global');
        else if (v.facturada) excluir(v, 'facturada');
        else if (String(v.moneda || 'MXN').toUpperCase() !== 'MXN') excluir(v, 'divisa');
        else if (Number(v.retencion_total) > 0) excluir(v, 'retenciones');
        else if (v.cliente_pais && String(v.cliente_pais).toUpperCase() !== 'MX') excluir(v, 'extranjero');
        else candidatas.push(v);
    }

    const elegibles: VentaGlobal[] = [];
    if (candidatas.length) {
        const ids = candidatas.map((v) => String(v.id));
        const [items] = await withOrgTx(orgId, sql`
            select ci.cotizacion_id, ci.cantidad, ci.precio_unitario, ci.precio_negociado, ci.tax_rate, ci.aprobado
              from cotizacion_items ci
              join cotizaciones c on c.id = ci.cotizacion_id
             where c.org_id = ${orgId} and ci.cotizacion_id = any(${ids}::uuid[])
             order by ci.cotizacion_id, ci.orden`);
        const porVenta = new Map<string, any[]>();
        for (const it of items) {
            const k = String(it.cotizacion_id);
            if (!porVenta.has(k)) porVenta.set(k, []);
            porVenta.get(k)!.push(it);
        }
        const fallbackRate = org?.iva_pct !== null && org?.iva_pct !== undefined ? Number(org.iva_pct) / 100 : 0.16;
        for (const v of candidatas) {
            const conceptos = conceptosDeVenta(String(v.folio || v.id), porVenta.get(String(v.id)) || [], {
                ivaIncluido: !!v.iva_incluido, fallbackRate,
            });
            if (!conceptos) { excluir(v, 'tasa'); continue; }
            const subtotal = round2(conceptos.reduce((s, c) => s + c.subtotal, 0));
            const impuestos = round2(conceptos.reduce((s, c) => s + c.taxAmount, 0));
            elegibles.push({
                id: String(v.id), folio: String(v.folio || ''), cliente: (v.cliente as string) || null,
                clienteRfc: (v.cliente_rfc as string) || null,
                pagadaEn: v.paid_at instanceof Date ? v.paid_at.toISOString() : String(v.paid_at),
                total: round2(subtotal + impuestos), subtotal, impuestos,
                formaPago: satFormFor(v.payment_method), conceptos,
            });
        }
    }
    return { elegibles, excluidas, formaPagoSugerida: formaDeMayorImporte(elegibles) };
}

/**
 * FormaPago de la global: la de la venta de mayor importe (Guía de llenado).
 * Una venta cuya forma Cord no conoce ("99") no puede declararse en un PUE; se
 * toma la siguiente. Sin ninguna conocida, el negocio la elige.
 */
export function formaDeMayorImporte(ventas: Array<{ total: number; formaPago: string }>): string | null {
    const conocidas = ventas.filter((v) => isFormaPago(v.formaPago)).sort((a, b) => b.total - a.total);
    return conocidas[0]?.formaPago ?? null;
}

export interface GlobalInput {
    periodicidad: string;
    meses: string;
    anio: number;
    desde?: string | null;
    hasta?: string | null;
    cotizacionIds: string[];
    formaPago?: string | null;
    createdBy?: string | null;
}

export interface GlobalResult extends Partial<EmitResult> {
    ok: boolean;
    error?: string;
    httpStatus?: number;
    documentId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Arma la factura global con las ventas elegidas y la timbra. El documento
 * nace como borrador con sus ventas reservadas (una sola transacción, con el
 * candado de cada venta) y después pasa por `finalizeInvoice`, que es quien
 * reserva el folio, consume el timbre y habla con el PAC. Si el timbrado falla,
 * el borrador conserva sus ventas hasta que se reintente o se descarte.
 */
export async function createGlobalInvoice(orgId: string, input: GlobalInput): Promise<GlobalResult> {
    const ids = Array.from(new Set((input.cotizacionIds || []).map(String))).filter((id) => UUID_RE.test(id));
    if (!ids.length) return { ok: false, httpStatus: 400, error: 'Elige al menos una venta para la factura global.' };
    if (ids.length > MAX_VENTAS_GLOBAL) return { ok: false, httpStatus: 400, error: `Una factura global admite hasta ${MAX_VENTAS_GLOBAL} ventas.` };

    const [[head]] = await withOrgTx(orgId, sql`
        select o.nombre as org_nombre, o.razon_social as org_razon_social, o.rfc as org_tax_id,
               o.regimen_fiscal as org_tax_system, o.country_code, o.cp_fiscal as org_cp, o.email_contacto as org_email,
               o.direccion as org_direccion, o.moneda as org_moneda, o.fiscal_metadata
          from orgs o where o.id = ${orgId} limit 1`);
    if (!head) return { ok: false, httpStatus: 404, error: 'Organización no encontrada.' };
    if (String(head.country_code || 'MX').toUpperCase() !== 'MX') {
        return { ok: false, httpStatus: 409, error: 'La factura global es un comprobante de México.' };
    }
    if (String(head.org_moneda || 'MXN').toUpperCase() !== 'MXN') {
        return { ok: false, httpStatus: 409, error: `La factura global se emite en pesos y tu contabilidad está en ${String(head.org_moneda)}. Cambia la moneda contable a MXN en Ajustes.` };
    }
    const periodo = { periodicidad: String(input.periodicidad), meses: String(input.meses), anio: Number(input.anio) };
    const periodoError = globalPeriodError({ ...periodo, regimen: head.org_tax_system as string, anioEmision: anioEnMexico() });
    if (periodoError) return { ok: false, httpStatus: 400, error: periodoError };
    const rango = globalPeriodRange({ ...periodo, desde: input.desde, hasta: input.hasta });
    if ('error' in rango) return { ok: false, httpStatus: 400, error: rango.error };

    let docType: string;
    try { docType = await documentTypeForOrg(orgId, 'MX', 'fiscal'); }
    catch (error) { return { ok: false, httpStatus: 402, error: error instanceof Error ? error.message : 'La emisión fiscal no está disponible en tu plan.' }; }
    if (docType !== 'cfdi_40') return { ok: false, httpStatus: 409, error: 'La factura global es un CFDI: la emisión fiscal debe estar activa.' };

    const { elegibles } = await ventasParaGlobal(orgId, rango);
    const porId = new Map(elegibles.map((v) => [v.id, v]));
    const elegidas = ids.map((id) => porId.get(id));
    if (elegidas.some((v) => !v)) {
        return { ok: false, httpStatus: 409, error: 'Una de las ventas ya no está disponible para la factura global (ya se facturó, está en otra global o quedó fuera del periodo). Vuelve a cargar las ventas.' };
    }
    const ventas = elegidas as VentaGlobal[];
    const formaPago = isFormaPago(input.formaPago) ? String(input.formaPago) : formaDeMayorImporte(ventas);
    if (!formaPago) return { ok: false, httpStatus: 400, error: 'Elige la forma de pago de la factura global.' };

    const lines = ventas.flatMap((v) => v.conceptos);
    const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
    const taxes = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
    const total = round2(subtotal + taxes);
    const { issuer } = partiesFrom(head, 'MX');
    const recipient = {
        legalName: PUBLICO_EN_GENERAL, taxId: RFC_GENERICO_NACIONAL, taxSystem: '616',
        address: { countryCode: 'MX', postalCode: issuer.address?.postalCode },
    };
    const info = { ...periodo, forma_pago: formaPago, desde: rango.desde, hasta: rango.hasta };
    // Mismo candado que la factura individual de cada venta (emit.ts): las dos
    // rutas no pueden documentar la misma venta a la vez.
    const candados = ids.map((id) => `${orgId}:quote:${id}:invoice:v1`).sort();
    const folios = ventas.map((v) => v.folio);

    let created: any;
    try {
        const [, rows] = await withOrgTx(orgId,
            sql`select count(*) from (
                  select pg_advisory_xact_lock(hashtextextended(k, 0))
                    from (select unnest(${candados}::text[]) as k order by 1) llaves) bloqueadas`,
            sql`with libres as (
                  select count(*) as n from cotizaciones c
                   where c.org_id = ${orgId} and c.id = any(${ids}::uuid[]) and c.status = 'paid'
                     and not exists (select 1 from factura_global_ventas g
                                      where g.cotizacion_id = c.id and g.org_id = c.org_id and g.liberada_at is null)
                     and not exists (select 1 from documentos_fiscales d
                                      where d.cotizacion_id = c.id and d.org_id = c.org_id and d.credit_note_of is null
                                        and d.lifecycle <> 'void' and d.informacion_global is null)
                ), doc as (
                  insert into documentos_fiscales (
                    org_id, cotizacion_id, cliente_id, country_code, document_type, status, provider,
                    currency, ledger_currency, fx_rate, ledger_total, subtotal, tax_total, total,
                    retencion_total, retenciones_snapshot, lifecycle, due_date, amount_paid, amount_remaining,
                    public_token, created_by, issuer_snapshot, recipient_snapshot, line_items_snapshot,
                    schema_version, provider_data, informacion_global, updated_at
                  )
                  select ${orgId}, null, null, 'MX', 'cfdi_40', 'pending', 'facturapi',
                         'MXN', 'MXN', 1, ${total}, ${subtotal}, ${taxes}, ${total},
                         0, '[]'::jsonb, 'draft', null, 0, 0,
                         null, ${input.createdBy || null}, ${JSON.stringify(issuer)}, ${JSON.stringify(recipient)}, ${JSON.stringify(lines)},
                         'cord.invoice.v1', '{}'::jsonb, ${JSON.stringify(info)}::jsonb, now()
                    from libres where libres.n = ${ids.length}
                  returning id
                ), ventas as (
                  insert into factura_global_ventas (org_id, documento_id, cotizacion_id, folio)
                  select ${orgId}, doc.id, v.id, v.folio
                    from doc cross join unnest(${ids}::uuid[], ${folios}::text[]) as v(id, folio)
                  returning id
                )
                select doc.id, (select count(*) from ventas) as ligadas from doc`);
        created = rows[0];
    } catch (error: any) {
        // El índice único de ventas vivas cierra la carrera: otra global (o la
        // misma pestaña dos veces) ya tomó alguna de estas ventas.
        if (String(error?.message || '').includes('uq_factura_global_ventas_viva')) {
            return { ok: false, httpStatus: 409, error: 'Alguna de estas ventas acaba de entrar en otra factura global. Vuelve a cargar las ventas.' };
        }
        throw error;
    }
    if (!created?.id) {
        return { ok: false, httpStatus: 409, error: 'Una de las ventas ya no está disponible para la factura global. Vuelve a cargar las ventas.' };
    }
    const documentId = String(created.id);
    await logInvoiceEvent(orgId, documentId, 'created', `Factura global con ${ids.length} venta(s)`);
    const emitted = await finalizeInvoice(orgId, documentId);
    return { ...emitted, ok: emitted.emitted, documentId, ...(emitted.emitted ? {} : { httpStatus: emitted.httpStatus || 502 }) };
}

/** Ventas que documenta una global, para su detalle. */
export async function ventasDeGlobal(orgId: string, documentoId: string) {
    const [rows] = await withOrgTx(orgId, sql`
        select g.cotizacion_id, g.folio, g.liberada_at, c.total
          from factura_global_ventas g
          left join cotizaciones c on c.id = g.cotizacion_id and c.org_id = g.org_id
         where g.org_id = ${orgId} and g.documento_id = ${documentoId}
         order by g.created_at asc, g.folio asc`);
    return rows.map((r: any) => ({
        cotizacionId: String(r.cotizacion_id),
        folio: String(r.folio || ''),
        total: r.total === null || r.total === undefined ? null : Number(r.total),
        liberada: !!r.liberada_at,
    }));
}
