// src/lib/cotizaciones.ts
// FUENTE ÚNICA de la creación de cotizaciones. La consumen tanto la ruta interna
// (/api/cotizaciones, sesión Auth) como la API pública (/api/v1/cotizaciones,
// API key). Aquí vive el cálculo server-side de subtotal/IVA, el folio, el flujo
// de aprobación por umbrales y los eventos/auditoría — para no divergir.

import { sql, logAudit, withOrgTx } from './db';
import { notifyQuoteSent } from './email';
import { dispatchEvent, dispatchQuoteEvent } from './webhooks';
import { clientEventData } from './event-payloads';
import { FXService, FXUnavailableError } from './fx/FXService';
import { currentUserId } from './context';
import { assertResourceCapacity, checkEntitlement, parsedResourceLimit, ResourceLimitReachedError } from './org-entitlements';
import { after } from './after';
import { trackServer } from './posthog-server';

import { sanitizeItem, calculateDocumentTotals } from '../../packages/elements/src/engine';
import { currencyDecimals, listOfferedCurrencies, normalizeCurrency } from './currency';
import { taxCatalogFor, TaxCatalogUnavailableError } from './impuestos-db';
import { taxRoundingFor } from './countries';
import { exemptionReasonFor } from './fiscal/exemption';
import { lineSatKeyError, lineSatKeysFrom } from './fiscal/sat-claves';
import { intlLocale } from './fmt-server';
import { validateFiscalReceptor, type FiscalReceptor, type FiscalReceptorInput } from '../../packages/elements/src/fiscal/receptor';
import { validateTaxId } from './tax-id';
import { normalizeTerm } from './payment-terms';
import { descuentoParaMotor, leerDescuentoBody, type DescuentoDef } from './descuentos';
import { DescuentoError, resolverDescuento } from './cupones';

// El motivo de aprobación lo lee el aprobador: el tope y el total van con la
// divisa real de la cotización, no con un '$' que puede significar otra cosa.
const money0 = (n: number, currency: string) => {
    const code = normalizeCurrency(currency);
    // El locale sale del request: quien aprueba lee el motivo en el idioma de su
    // organización, con sus separadores. Un 'es-MX' fijo le escribía "1.000,00"
    // a un aprobador en Londres.
    const locale = intlLocale();
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency', currency: code, maximumFractionDigits: 0,
        }).format(Math.round(n));
    } catch {
        return new Intl.NumberFormat(locale).format(Math.round(n));
    }
};

// Máximo de líneas por cotización — evita que un POST con miles de items dispare
// miles de INSERT secuenciales (DoS + latencia).
export const MAX_ITEMS = 200;

// sanitizeItem convierte un negativo en 0 (o una cantidad negativa en 1): una
// línea de "Descuento −500" se guardaba a $0 sin aviso y el total salía 500
// más alto de lo que el vendedor escribió. Se rechaza con un motivo.
export const NEGATIVE_LINE_ERROR = 'Una línea no puede tener cantidad ni precio negativos. Para un descuento, baja el precio de la línea.';
export function hasNegativeLine(items: unknown[]): boolean {
    const negativo = (v: unknown) => v !== null && v !== undefined && v !== '' && Number(v) < 0;
    return items.some((it: any) => negativo(it?.cantidad) || negativo(it?.precio_unitario) || negativo(it?.precio_negociado));
}


export interface NewQuoteItem {
    producto_id?: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    precio_negociado?: number | null;
    costo_unitario?: number | null;
    /** Fracción 0–1 (0.16), no porcentaje. Ausente = tasa default de la org. */
    tax_rate?: number | null;
    /** España: causa de exención del concepto (fiscal/exemption.ts). */
    exemption_reason?: string | null;
    /** México: claves SAT propias de la línea (ganan sobre las del producto). */
    clave_sat?: string | null;
    clave_unidad_sat?: string | null;
}

export interface NewQuoteInput {
    cliente_id?: string | null;
    /**
     * Datos de un cliente NUEVO (sin `cliente_id`) — usado por Cord Elements
     * cuando el usuario escribe un cliente que no está en el datalist. Se
     * busca primero por empresa/email dentro de la org y, si no existe, se
     * CREA (ver resolveOrCreateCliente abajo) — nunca actualiza uno existente.
     */
    cliente?: {
        empresa: string;
        email?: string | null;
        contacto?: string | null;
        telefono?: string | null;
        rfc?: string | null;
        /** Datos fiscales del receptor; se validan con el mismo módulo que el Fiscal Element. */
        fiscal?: FiscalReceptorInput | null;
    } | null;
    terminos?: string;
    vigencia_dias?: number;
    notas?: string | null;
    send?: boolean;
    items: NewQuoteItem[];
    // Multi-divisa con cobertura (opcional). base = moneda que ve el cliente;
    // fiscal = moneda en la que se factura. Si difieren, se congela el FX.
    base_currency?: string | null;
    fiscal_currency?: string | null;
    fx_buffer_pct?: number | null;
    iva_incluido?: boolean;
    // % de anticipo requerido (1–99). Al aprobarse la cotización se materializan
    // dos cobros: anticipo (pagable ya) + saldo (vence según los términos).
    anticipo_pct?: number | null;
    // Iguala / retainer: se cobra el total automáticamente cada mes vía Stripe
    // Subscription (solo con términos de contado; excluyente con anticipo/cuotas).
    es_recurrente?: boolean;
    /**
     * Descuento de documento, antes de impuestos. El servidor calcula el
     * importe; nunca se confía en uno que mande el cliente. Con publishable key
     * solo se admite `cupon` (lo filtra publishableQuoteInput).
     */
    descuento?: { tipo: 'porcentaje' | 'monto'; valor: number } | null;
    /** Código de cupón del negocio. Si viene, manda sobre `descuento`. */
    cupon?: string | null;
}

export interface CreateQuoteResult {
    id: string;
    folio: string;
    token: string;
    needsApproval: boolean;
    motivo: string | null;
    email?: { sent: boolean; skipped?: string };
}

export class QuoteError extends Error {
    status: number;
    code?: string;
    details?: unknown;
    constructor(message: string, status = 400, code?: string, details?: unknown) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

// Un cliente nuevo puede llegar con una pk_ desde el navegador: el emisor no es
// de confianza. Todo campo se acota y el bloque fiscal se valida completo.
export function sanitizeNuevoCliente(input: NonNullable<NewQuoteInput['cliente']>) {
    const text = (v: unknown, max: number) => {
        const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
        if (s.length > max) throw new QuoteError(`Un dato del cliente excede ${max} caracteres.`, 400);
        return s || null;
    };
    let empresa = text(input.empresa, 200);
    const email = text(input.email, 254)?.toLowerCase() ?? null;
    if (email && !EMAIL_RE.test(email)) throw new QuoteError('El correo del cliente no es válido.', 400);
    let fiscal: FiscalReceptor | null = null;
    if (input.fiscal) {
        const r = validateFiscalReceptor({ ...input.fiscal, legal_name: input.fiscal.legal_name || empresa || '' });
        if (!r.ok) throw new QuoteError('Los datos fiscales del cliente no son válidos.', 400, 'invalid_fiscal_data', r.errors);
        fiscal = r.value;
        empresa = fiscal.legal_name;
    }
    return {
        empresa,
        email,
        contacto: text(input.contacto, 120),
        telefono: text(input.telefono, 40),
        rfc: fiscal?.tax_id ?? text(input.rfc, 20),
        fiscal,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assertClienteDeOrg(orgId: string, clienteId: string): Promise<void> {
    if (UUID_RE.test(clienteId)) {
        const [rows] = await withOrgTx(orgId, sql`select id from clientes where id = ${clienteId} and org_id = ${orgId}`);
        if (rows.length) return;
    }
    throw new QuoteError('Cliente no encontrado', 404);
}

export async function productosDeOrg(orgId: string, ids: unknown[]): Promise<Set<string>> {
    const candidatos = [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)))];
    if (!candidatos.length) return new Set();
    const [rows] = await withOrgTx(orgId, sql`select id from productos where org_id = ${orgId} and id = any(${candidatos}::uuid[])`);
    return new Set(rows.map((r: any) => String(r.id)));
}

/**
 * Resuelve el cliente de la cotización: si viene `cliente_id`, lo usa tal
 * cual. Si no, y viene un bloque `cliente` (Cord Elements con un cliente que
 * no está en el datalist), busca por empresa/email DENTRO de la org y, si no
 * hay match, lo CREA — marcado `origen='embed'` para cola de revisión.
 *
 * Regla de seguridad: esto SOLO puede crear, NUNCA actualizar una fila
 * existente — una publishable key (pk_) puede llegar hasta aquí vía
 * `POST /api/v1/cotizaciones` (scope permitido), y dejarla escribir sobre un
 * cliente ya dado de alta la volvería un vector de alteración del CRM.
 */
async function resolveOrCreateCliente(orgId: string, input: NewQuoteInput): Promise<string | null> {
    if (input.cliente_id) {
        await assertClienteDeOrg(orgId, String(input.cliente_id));
        return String(input.cliente_id);
    }

    if (!input.cliente) return null;
    const nuevo = sanitizeNuevoCliente(input.cliente);
    const { empresa, email } = nuevo;
    if (!empresa) return null;

    const [existingRows] = email
        ? await withOrgTx(orgId, sql`select id from clientes where org_id = ${orgId} and (lower(empresa) = lower(${empresa}) or lower(email) = ${email}) limit 1`)
        : await withOrgTx(orgId, sql`select id from clientes where org_id = ${orgId} and lower(empresa) = lower(${empresa}) limit 1`);
    const existing = existingRows[0];
    if (existing) return existing.id as string;

    // Un identificador suelto (sin bloque fiscal, que ya se validó completo)
    // se valida con el país de la organización: es el que hereda un cliente
    // sin `country_code` y contra el que se emitirá su factura.
    if (nuevo.rfc && !nuevo.fiscal) {
        const [[org]] = await withOrgTx(orgId, sql`select country_code from orgs where id = ${orgId}`);
        const checked = validateTaxId(String(org?.country_code || ''), nuevo.rfc);
        if (!checked.ok) throw new QuoteError(checked.reason, 400, 'invalid_tax_id');
        nuevo.rfc = checked.normalized;
    }

    try {
        await assertResourceCapacity(orgId, 'clients');
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) throw new QuoteError(error.message, 402);
        throw error;
    }

    try {
        const [createdRows] = await withOrgTx(orgId, sql`
            insert into clientes (org_id, empresa, email, contacto, telefono, rfc, regimen_fiscal, uso_cfdi, cp_fiscal, country_code, origen)
            values (${orgId}, ${empresa}, ${email}, ${nuevo.contacto}, ${nuevo.telefono}, ${nuevo.rfc},
                    ${nuevo.fiscal?.regimen_fiscal ?? null}, ${nuevo.fiscal?.uso_cfdi ?? null}, ${nuevo.fiscal?.cp_fiscal ?? null},
                    ${nuevo.fiscal?.country ?? null}, 'embed')
            returning *`);
        after(dispatchEvent(orgId, 'client.created', clientEventData(createdRows[0])));
        return createdRows[0].id as string;
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) throw new QuoteError(`Tu plan permite ${limit.limit} clientes. Libera espacio o sube de plan para continuar.`, 402);
        throw error;
    }
}

/**
 * Crea una cotización (borrador o enviada) para `orgId`. NO valida permisos ni
 * parsea el request — eso lo hace cada ruta (Sesión vs API key). `opts.origin`
 * se conserva por compatibilidad; el correo resuelve el dominio desde orgId.
 * `opts.actor` etiqueta la auditoría (ej. 'api:<keyId>').
 */
export async function createCotizacion(
    orgId: string,
    input: NewQuoteInput,
    opts: { origin: string; ip: string; actor?: string; duplicateOf?: { id: string; folio: string } },
): Promise<CreateQuoteResult> {
    try {
        await assertResourceCapacity(orgId, 'active_quotes');
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) throw new QuoteError(error.message, 402);
        throw error;
    }
    const rawItems = Array.isArray(input.items) ? input.items : [];
    if (!rawItems.length) throw new QuoteError('Agrega al menos un producto', 400);
    if (rawItems.length > MAX_ITEMS) throw new QuoteError(`Demasiadas líneas (máximo ${MAX_ITEMS} por cotización).`, 400);
    if (hasNegativeLine(rawItems)) throw new QuoteError(NEGATIVE_LINE_ERROR, 400, 'invalid_request');
    // Saneado una sola vez → todo lo de abajo opera sobre montos finitos y no-negativos.
    const items = rawItems.map(sanitizeItem);

    // Totales server-side (no confiar en el cliente) con el motor compartido.
    const [orgRows] = await withOrgTx(orgId, sql`select * from orgs where id = ${orgId}`);
    const org = orgRows[0];
    const approvalsEnabled = (await checkEntitlement(orgId, 'approvals')).ok;
    const iva_incluido = Boolean(input.iva_incluido);

    // Impuesto POR LÍNEA. La tasa la manda el editor —que la eligió del catálogo
    // de la org— y el servidor la valida contra ese mismo catálogo: un cliente
    // no puede inventarse una tasa que el negocio no configuró. Sin tasa
    // explícita se cae al perfil predeterminado, que es lo que hacía la columna
    // plana orgs.iva_pct antes de que existiera el impuesto por línea.
    let catalogo;
    try {
        catalogo = await taxCatalogFor(orgId);
    } catch (error) {
        if (error instanceof TaxCatalogUnavailableError) throw new QuoteError(error.message, 503);
        throw error;
    }
    const fallbackRate = catalogo.defaultRate;
    const monedaVenta = normalizeCurrency(input.base_currency, normalizeCurrency(org.moneda));

    // Descuento de documento: manual o cupón. El cupón se valida aquí (vigencia,
    // divisa, usos) y se REDIME cuando la cotización se aprueba.
    const pedido = leerDescuentoBody(input as unknown as Record<string, unknown>);
    if ('error' in pedido) throw new QuoteError(pedido.error, 400, 'invalid_discount');
    let descuento: DescuentoDef | null = null;
    if (pedido.presente) {
        try {
            descuento = await resolverDescuento(orgId, pedido.solicitud, {
                moneda: monedaVenta,
                clienteId: input.cliente_id ? String(input.cliente_id) : null,
            });
        } catch (error) {
            if (error instanceof DescuentoError) throw new QuoteError(error.message, error.status, error.code);
            throw error;
        }
    }

    const itemsConImpuesto = items.map((it, i) => {
        const tax_rate = catalogo.resolve(rawItems[i]?.tax_rate, fallbackRate);
        // La causa de exención solo se conserva en España y en una línea al 0 %.
        const exemption_reason = exemptionReasonFor(catalogo.country, rawItems[i]?.exemption_reason, tax_rate);
        // Claves SAT de la línea: solo México timbra CFDI. Fuera se descartan
        // en vez de guardarse sin consumidor (regla 15).
        const sat = catalogo.country === 'MX' ? lineSatKeysFrom(rawItems[i]) : { productKey: null, unitKey: null };
        return { ...it, tax_rate, exemption_reason, clave_sat: sat.productKey, clave_unidad_sat: sat.unitKey };
    });
    const satError = lineSatKeyError(itemsConImpuesto.map((it) => ({ descripcion: it.descripcion, productKey: it.clave_sat, unitKey: it.clave_unidad_sat })));
    if (satError) throw new QuoteError(satError, 400, 'invalid_request');

    // Regla de redondeo del impuesto del país del emisor (CL: por documento).
    // Se guarda con la cotización: todo recálculo posterior usa la misma.
    const taxRounding = taxRoundingFor(catalogo.country);
    const totals = calculateDocumentTotals(itemsConImpuesto as any[], {
        ivaIncluido: iva_incluido,
        retenciones: catalogo.retenciones,
        // Redondeo en la divisa de venta (ver RoundingOptions).
        roundLines: currencyDecimals(monedaVenta),
        taxRounding,
        descuento: descuentoParaMotor(descuento),
    });
    const realSubtotal = totals.subtotal;
    const descuentoTotal = totals.descuentoTotal;
    const iva = totals.impuestos;
    const total = totals.total;
    const retencionTotal = totals.retencionTotal;
    const retencionesSnapshot = JSON.stringify(totals.retenciones);

    // Divisas de la cotización, resueltas temprano porque el motivo de aprobación
    // ya necesita formatear importes. `base` = en la que se le vende al cliente;
    // `fiscal` = en la que se factura y contabiliza (la del negocio por default).
    const baseCurrency = normalizeCurrency(input.base_currency, normalizeCurrency(org.moneda));
    const fiscalCurrency = normalizeCurrency(input.fiscal_currency, baseCurrency);
    const ofrecidas = listOfferedCurrencies(normalizeCurrency(org.moneda));
    if (!ofrecidas.includes(baseCurrency) || !ofrecidas.includes(fiscalCurrency)) {
        throw new QuoteError('Esa divisa no está disponible para cotizar.', 400, 'unsupported_currency');
    }

    // Flujo de aprobación: ¿el descuento, monto o margen rebasan los topes?
    // Un descuento MANUAL de documento cuenta como descuento de cada línea (si
    // no, bastaba con mover la rebaja al pie para esquivar el tope). Un cupón
    // no: lo creó quien administra Ajustes, y ya es una rebaja autorizada.
    let maxDescPct = 0;
    let minMargenPct = Infinity;
    let hayLineasConCosto = false;
    const cuentaDescuentoDoc = !!descuento && !descuento.cupon_id;
    items.forEach((it, i) => {
        const lista = Number(it.precio_unitario) || 0;
        const nego = it.precio_negociado;
        const linea = totals.lineas[i];
        const bruta = linea ? linea.base + linea.descuento : 0;
        // Fracción de la línea que se lleva el descuento de documento.
        const fraccionDoc = cuentaDescuentoDoc && linea && bruta > 0 ? linea.descuento / bruta : 0;
        const precioFinal = ((nego !== null && nego !== undefined) ? Number(nego) : lista) * (1 - fraccionDoc);
        if (lista > 0 && precioFinal < lista) {
            maxDescPct = Math.max(maxDescPct, (1 - precioFinal / lista) * 100);
        }
        const costo = Number(it.costo_unitario) || 0;
        if (costo > 0 && precioFinal > 0) {
            hayLineasConCosto = true;
            minMargenPct = Math.min(minMargenPct, (precioFinal - costo) / precioFinal * 100);
        }
    });
    if (!hayLineasConCosto) minMargenPct = Infinity;

    const aprobDesc = approvalsEnabled ? Number(org.aprob_descuento_max) || 0 : 0;
    const aprobMonto = approvalsEnabled ? Number(org.aprob_monto_max) || 0 : 0;
    const aprobMargen = approvalsEnabled ? Number(org.aprob_margen_min) || 0 : 0;
    const needsApproval = !!input.send && (
        (aprobDesc > 0 && maxDescPct > aprobDesc) ||
        (aprobMonto > 0 && total > aprobMonto) ||
        (aprobMargen > 0 && hayLineasConCosto && minMargenPct < aprobMargen)
    );
    let aprobEstado: string | null = null;
    let aprobMotivo: string | null = null;
    if (needsApproval) {
        const reasons: string[] = [];
        if (aprobDesc > 0 && maxDescPct > aprobDesc) reasons.push(`descuento ${Math.round(maxDescPct)}% supera el ${aprobDesc}% permitido`);
        if (aprobMonto > 0 && total > aprobMonto) reasons.push(`total ${money0(total, baseCurrency)} supera el tope de ${money0(aprobMonto, baseCurrency)}`);
        if (aprobMargen > 0 && hayLineasConCosto && minMargenPct < aprobMargen) reasons.push(`margen bruto ${Math.round(minMargenPct)}% está por debajo del mínimo de ${aprobMargen}%`);
        aprobEstado = 'pendiente';
        aprobMotivo = reasons.join(' y ');
    }

    // Iguala recurrente: solo tiene sentido con términos de contado (se autoriza y
    // cobra desde el alta) y es EXCLUYENTE con anticipo/cuotas (modelos de pago único).
    const esRecurrente = !!input.es_recurrente;
    const terminos = esRecurrente
        ? 'contado'
        : normalizeTerm(input.terminos);
    // Anticipo: % válido entre 1 y 99; cualquier otro valor = sin anticipo.
    const anticipoPctRaw = Number(input.anticipo_pct);
    const anticipoPct = esRecurrente ? null
        : (Number.isFinite(anticipoPctRaw) && anticipoPctRaw >= 1 && anticipoPctRaw <= 99
            ? Math.round(anticipoPctRaw * 100) / 100 : null);
    const dias = Number(input.vigencia_dias) || 30;
    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + dias);
    const clienteId = await resolveOrCreateCliente(orgId, input);
    const status = needsApproval ? 'draft' : (input.send ? 'sent' : 'draft');
    const sentAt = (!needsApproval && input.send) ? new Date().toISOString() : null;

    // Multi-divisa con cobertura: si la moneda en que se vende difiere de la
    // contable, se congela la tasa (spot + buffer) por 30 días para proteger el
    // margen entre la aprobación y la facturación. Esa tasa NO es decorativa:
    // la factura la declara como tipo de cambio (ver lib/fiscal/emit.ts).
    //
    // Si no hay tasa real, la cotización NO se crea: guardar un fx_rate = 1
    // inventado significaba facturar meses después con el número equivocado.
    let fxRate = 1;
    let fxSource = 'same';
    let fxLockedUntil: string | null = null;
    if (baseCurrency !== fiscalCurrency) {
        try {
            const fx = await FXService.getExchangeRate({
                baseCurrency, fiscalCurrency, amount: total,
                bufferPct: Number(input.fx_buffer_pct) || 0,
            });
            fxRate = fx.appliedRate;
            fxSource = fx.source;
            fxLockedUntil = fx.lockedUntil ? fx.lockedUntil.toISOString() : null;
        } catch (error) {
            if (error instanceof FXUnavailableError) throw new QuoteError(error.message, 503);
            throw error;
        }
    }

    // Quién la creó (user_id de la sesión) — null en creación vía API key
    // (M2M, sin sesión de usuario); ver "Desempeño por vendedor" en historial.md.
    const creadoPor = currentUserId();

    // El folio se calcula DENTRO del insert, con un candado de transacción por
    // organización: antes salía de un `select max(...)` en una llamada aparte y
    // dos altas simultáneas (doble clic, la API en paralelo) recibían el mismo
    // número. Y se lee solo el número final del folio: extraer TODOS los
    // dígitos sumaba los del prefijo ("F26-0001" → 260001) y la numeración se
    // disparaba con cada alta.
    const prefix = String(org.quote_prefix || 'COT');
    let cot: any;
    try {
        [, [cot]] = await withOrgTx(orgId, sql`select pg_advisory_xact_lock(hashtextextended(${'quote-folio:' + orgId}, 0))`, sql`
            insert into cotizaciones
                (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at, aprob_estado, aprob_motivo,
                 moneda, base_currency, fiscal_currency, fx_rate, fx_rate_source, fx_locked_until, iva_incluido, anticipo_pct, es_recurrente, creado_por,
                 retencion_total, retenciones_snapshot, descuento, descuento_def, tax_rounding)
            values
                (${orgId}, ${clienteId}, (select ${prefix} || '-' || case when n < 10000 then lpad(n::text, 4, '0') else n::text end
                   from (select coalesce(max(substring(folio from '(\\d+)$')::numeric), 0) + 1 as n
                           from cotizaciones where org_id = ${orgId}) s), ${status}, ${realSubtotal}, ${iva}, ${total},
                 ${terminos}, ${vigencia.toISOString()}, ${input.notas || null}, ${sentAt}, ${aprobEstado}, ${aprobMotivo},
                 ${baseCurrency}, ${baseCurrency}, ${fiscalCurrency}, ${fxRate}, ${fxSource}, ${fxLockedUntil}, ${iva_incluido}, ${anticipoPct}, ${esRecurrente}, ${creadoPor},
                 ${retencionTotal}, ${retencionesSnapshot}::jsonb, ${descuentoTotal}, ${descuento ? JSON.stringify(descuento) : null}::jsonb, ${taxRounding})
            returning id, public_token, folio`);
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) throw new QuoteError(`Tu plan permite ${limit.limit} cotizaciones activas. Cierra una o sube de plan para continuar.`, 402);
        throw error;
    }
    const folio = String(cot.folio);

    const productosPropios = await productosDeOrg(orgId, itemsConImpuesto.map((it: any) => it.producto_id));
    let orden = 0;
    for (const it of itemsConImpuesto) {
        await withOrgTx(orgId, sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden, tax_rate, exemption_reason,
                 clave_sat, clave_unidad_sat)
            values
                (${cot.id}, ${it.producto_id && productosPropios.has(it.producto_id) ? it.producto_id : null}, ${it.descripcion}, ${Number(it.cantidad) || 1},
                 ${Number(it.precio_unitario) || 0},
                 ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)},
                 ${Number(it.costo_unitario) || 0},
                 ${orden++}, ${it.tax_rate}, ${it.exemption_reason},
                 ${it.clave_sat ?? null}, ${it.clave_unidad_sat ?? null})`);
    }

    await withOrgTx(orgId, sql`
        insert into cotizacion_versiones
            (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
        values
            (${cot.id}, ${orgId}, 1, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(itemsConImpuesto)}, ${input.notas || null}, ${iva_incluido})`);

    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${cot.id}, 'created', ${opts.duplicateOf ? 'Duplicada de ' + opts.duplicateOf.folio : 'Borrador creado'})`);
    if (input.send && !needsApproval) {
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'sent', 'Cotización enviada — link generado')`);
    }
    if (needsApproval) {
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'comment', ${'Solicitud de aprobación: ' + aprobMotivo})`);
    }
    await logAudit(orgId, {
        accion: needsApproval ? 'cotizacion.aprobacion_solicitada' : (input.send ? 'cotizacion.enviada' : 'cotizacion.creada'),
        entidad: 'cotizacion', entidad_id: cot.id as string,
        detalle: folio + (needsApproval ? ' — ' + aprobMotivo : ''), ip: opts.ip, actor: opts.actor,
    });
    await dispatchQuoteEvent(orgId, cot.id as string, 'quote.created', undefined, opts.actor);
    if (needsApproval) after(dispatchQuoteEvent(orgId, cot.id as string, 'quote.approval_requested', { motivo: aprobMotivo }, opts.actor));

    let email: { sent: boolean; skipped?: string } | undefined;
    if (input.send && !needsApproval) {
        email = await notifyQuoteSent(orgId, cot.id as string);
        if (email.sent) {
            await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${cot.id}, 'email', 'Correo enviado al cliente')`);
        }
        await dispatchQuoteEvent(orgId, cot.id as string, 'quote.sent');
    }

    const source = opts.actor?.startsWith('api:') ? 'api'
        : opts.actor?.startsWith('mcp:') ? 'mcp'
        : 'manual';
    after(trackServer('quote_created', orgId, {
        event_id: cot.id,
        quote_id: cot.id,
        total,
        currency: baseCurrency,
        source: opts.duplicateOf ? 'duplicate' : source,
        ...(opts.duplicateOf ? { source_quote_id: opts.duplicateOf.id } : {}),
        status,
        item_count: items.length,
        sent_on_create: !!input.send && !needsApproval,
    }, !!org.sandbox_of, !!org.is_demo));
    if (input.send && !needsApproval) {
        after(trackServer('quote_sent', orgId, {
            event_id: `${cot.id}:initial`,
            quote_id: cot.id,
            total,
            currency: baseCurrency,
            source,
            send_type: 'initial',
        }, !!org.sandbox_of, !!org.is_demo));
    }

    return { id: cot.id as string, folio, token: cot.public_token as string, needsApproval, motivo: aprobMotivo, email };
}
