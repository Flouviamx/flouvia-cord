// src/lib/cotizaciones.ts
// FUENTE ÚNICA de la creación de cotizaciones. La consumen tanto la ruta interna
// (/api/cotizaciones, sesión Auth) como la API pública (/api/v1/cotizaciones,
// API key). Aquí vive el cálculo server-side de subtotal/IVA, el folio, el flujo
// de aprobación por umbrales y los eventos/auditoría — para no divergir.

import { sql, logAudit, withOrgTx, type DbQuery } from './db';
import { notifyQuoteSent } from './email';
import { dispatchEvent, dispatchQuoteEvent } from './webhooks';
import { clientEventData } from './event-payloads';
import { FXService, FXUnavailableError } from './fx/FXService';
import { currentUserId } from './context';
import { assertResourceCapacity, checkEntitlement, parsedResourceLimit, ResourceLimitReachedError } from './org-entitlements';
import { after } from './after';
import { trackServer } from './posthog-server';

import { sanitizeItem, calculateDocumentTotals } from '../../packages/elements/src/engine';
import { listOfferedCurrencies, normalizeCurrency } from './currency';
import { taxCatalogFor, TaxCatalogUnavailableError } from './impuestos-db';
import { unknownTaxRate, unknownTaxRateMessage } from './impuestos';
import { approvalMotivo, evaluateApproval, policyFromOrg, totalInPolicyCurrency } from './quote-approval';
import { cancelUsage, reserveUsage } from './billing';
import { validateFiscalReceptor, type FiscalReceptor, type FiscalReceptorInput } from '../../packages/elements/src/fiscal/receptor';

// Máximo de líneas por cotización — evita que un POST con miles de items dispare
// miles de INSERT secuenciales (DoS + latencia).
export const MAX_ITEMS = 200;


export interface NewQuoteItem {
    producto_id?: string | null;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    precio_negociado?: number | null;
    costo_unitario?: number | null;
    /** Fracción 0–1 (0.16), no porcentaje. Ausente = tasa default de la org. */
    tax_rate?: number | null;
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
}

export interface CreateQuoteResult {
    id: string;
    folio: string;
    token: string;
    needsApproval: boolean;
    motivo: string | null;
    email?: { sent: boolean; skipped?: string };
}

/**
 * Días de vigencia acotados a [1, 365]. Sin tope, un valor negativo creaba una
 * cotización ya vencida y uno enorme hacía reventar `toISOString()` con un 500.
 */
export function vigenciaDias(raw: unknown): number {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return 30;
    return Math.min(n, 365);
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
    const tasaDesconocida = unknownTaxRate(catalogo, rawItems.map((it) => it?.tax_rate));
    if (tasaDesconocida !== null) throw new QuoteError(unknownTaxRateMessage(tasaDesconocida), 400, 'unknown_tax_rate');
    const itemsConImpuesto = items.map((it, i) => ({
        ...it,
        tax_rate: catalogo.resolve(rawItems[i]?.tax_rate, fallbackRate),
    }));

    const totals = calculateDocumentTotals(itemsConImpuesto as any[], {
        ivaIncluido: iva_incluido,
        retenciones: catalogo.retenciones,
    });
    const realSubtotal = totals.subtotal;
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

    // Iguala recurrente: solo tiene sentido con términos de contado (se autoriza y
    // cobra desde el alta) y es EXCLUYENTE con anticipo/cuotas (modelos de pago único).
    const esRecurrente = !!input.es_recurrente;
    const terminos = esRecurrente
        ? 'contado'
        : (['contado', 'net30', 'net60'].includes(input.terminos ?? '') ? input.terminos! : 'contado');
    // Anticipo: % válido entre 1 y 99; cualquier otro valor = sin anticipo.
    const anticipoPctRaw = Number(input.anticipo_pct);
    const anticipoPct = esRecurrente ? null
        : (Number.isFinite(anticipoPctRaw) && anticipoPctRaw >= 1 && anticipoPctRaw <= 99
            ? Math.round(anticipoPctRaw * 100) / 100 : null);
    const dias = vigenciaDias(input.vigencia_dias);
    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + dias);

    // Multi-divisa con cobertura: si la moneda en que se vende difiere de la
    // contable, se congela la tasa (spot + buffer) por 30 días para proteger el
    // margen entre la aprobación y la facturación. Esa tasa NO es decorativa:
    // la factura la declara como tipo de cambio (ver lib/fiscal/emit.ts).
    //
    // Si no hay tasa real, la cotización NO se crea: guardar un fx_rate = 1
    // inventado significaba facturar meses después con el número equivocado.
    // Va ANTES de la aprobación: el tope de monto está en la divisa del negocio
    // y el total se compara convertido con esta misma tasa.
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

    // Flujo de aprobación: ¿el descuento, monto o margen rebasan los topes?
    // Misma evaluación que enviar un borrador o reenviar una versión
    // (lib/quote-approval.ts): antes solo existía aquí y se saltaba al enviar.
    const policy = approvalsEnabled ? policyFromOrg(org) : null;
    const verdict = evaluateApproval(
        items,
        policy ? totalInPolicyCurrency(total, policy.currency, { baseCurrency, fiscalCurrency, fxRate }) : null,
        policy,
    );
    const needsApproval = !!input.send && verdict.needed;
    const aprobEstado: string | null = needsApproval ? 'pendiente' : null;
    const aprobMotivo: string | null = needsApproval && policy
        ? approvalMotivo(verdict, policy.currency)
        : null;

    const clienteId = await resolveOrCreateCliente(orgId, input);
    const status = needsApproval ? 'draft' : (input.send ? 'sent' : 'draft');
    const sentAt = (!needsApproval && input.send) ? new Date().toISOString() : null;
    const sendNow = !!input.send && !needsApproval;

    // Regla 17: un envío consume el medidor ANTES del efecto. Crear con
    // "Enviar" no lo reservaba (solo lo hacía la acción `send`), así que el plan
    // Gratis enviaba sin tope desde el editor y desde /api/v1.
    let envioReservation: string | undefined;
    if (sendNow) {
        const usage = await reserveUsage(orgId, 'envios', 1);
        if (!usage.ok) {
            const unavailable = /verificar|registrar/i.test(usage.reason || '');
            throw new QuoteError(
                usage.reason || 'Tu plan no tiene envíos disponibles este mes.',
                unavailable ? 503 : 402,
                unavailable ? 'usage_verification_unavailable' : 'plan_limit_reached',
            );
        }
        envioReservation = usage.id;
    }

    // Quién la creó (user_id de la sesión) — null en creación vía API key
    // (M2M, sin sesión de usuario); ver "Desempeño por vendedor" en historial.md.
    const creadoPor = currentUserId();
    const productosPropios = await productosDeOrg(orgId, itemsConImpuesto.map((it: any) => it.producto_id));
    const cotId = crypto.randomUUID();
    const prefix = String(org.quote_prefix || 'COT');

    // Encabezado, líneas, versión y eventos en UNA transacción. Antes eran una
    // transacción por línea: si fallaba la línea 7 quedaba una cotización a
    // medias que contaba contra el límite del plan, y el reintento creaba otra.
    //
    // El folio se calcula DENTRO de esa transacción, detrás de un advisory lock
    // por organización: con `max()+1` en una consulta aparte, dos altas
    // simultáneas (dos pestañas, la API y la UI) obtenían el mismo folio. El
    // número se toma de los dígitos FINALES tras el guion, no de todos los
    // dígitos del folio: con un prefijo como "Q2026" el folio siguiente a
    // "Q2026-0001" salía "Q2026-20260002".
    const writes: DbQuery[] = [];
    writes.push(sql`select pg_advisory_xact_lock(hashtextextended(${`quote-folio:${orgId}`}, 0))`);
    writes.push(sql`
            insert into cotizaciones
                (id, org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at, aprob_estado, aprob_motivo,
                 moneda, base_currency, fiscal_currency, fx_rate, fx_rate_source, fx_locked_until, iva_incluido, anticipo_pct, es_recurrente, creado_por,
                 retencion_total, retenciones_snapshot)
            values
                (${cotId}, ${orgId}, ${clienteId},
                 ${prefix} || '-' || lpad((
                     select coalesce(max(substring(folio from '-([0-9]{1,9})$')::bigint), 0) + 1
                       from cotizaciones where org_id = ${orgId}
                 )::text, 4, '0'),
                 ${status}, ${realSubtotal}, ${iva}, ${total},
                 ${terminos}, ${vigencia.toISOString()}, ${input.notas || null}, ${sentAt}, ${aprobEstado}, ${aprobMotivo},
                 ${baseCurrency}, ${baseCurrency}, ${fiscalCurrency}, ${fxRate}, ${fxSource}, ${fxLockedUntil}, ${iva_incluido}, ${anticipoPct}, ${esRecurrente}, ${creadoPor},
                 ${retencionTotal}, ${retencionesSnapshot}::jsonb)
            returning id, public_token, folio`);
    itemsConImpuesto.forEach((it: any, orden: number) => writes.push(sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden, tax_rate)
            values
                (${cotId}, ${it.producto_id && productosPropios.has(it.producto_id) ? it.producto_id : null}, ${it.descripcion}, ${Number(it.cantidad) || 1},
                 ${Number(it.precio_unitario) || 0},
                 ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)},
                 ${Number(it.costo_unitario) || 0},
                 ${orden}, ${it.tax_rate})`));
    writes.push(sql`
            insert into cotizacion_versiones
                (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
            values
                (${cotId}, ${orgId}, 1, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(itemsConImpuesto)}, ${input.notas || null}, ${iva_incluido})`);
    writes.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cotId}, 'created', ${opts.duplicateOf ? 'Duplicada de ' + opts.duplicateOf.folio : 'Borrador creado'})`);
    if (sendNow) {
        writes.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cotId}, 'sent', 'Cotización enviada — link generado')`);
    }
    if (needsApproval) {
        writes.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
            values (${orgId}, ${cotId}, 'comment', ${'Solicitud de aprobación: ' + aprobMotivo})`);
    }

    let cot: any;
    try {
        const results = await withOrgTx(orgId, ...writes);
        cot = results[1][0];
    } catch (error) {
        if (envioReservation) await cancelUsage(orgId, envioReservation);
        const limit = parsedResourceLimit(error);
        if (limit) throw new QuoteError(`Tu plan permite ${limit.limit} cotizaciones activas. Cierra una o sube de plan para continuar.`, 402);
        throw error;
    }
    const folio = String(cot.folio);

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

    const source = opts.duplicateOf ? 'duplicate'
        : opts.actor?.startsWith('api:') ? 'api'
        : opts.actor?.startsWith('mcp:') ? 'mcp'
        : 'manual';
    after(trackServer('quote_created', orgId, {
        event_id: cot.id,
        quote_id: cot.id,
        total,
        currency: baseCurrency,
        source,
        status,
        item_count: items.length,
        sent_on_create: !!input.send && !needsApproval,
        ...(opts.duplicateOf ? { source_quote_id: opts.duplicateOf.id } : {}),
    }, !!org.sandbox_of, !!org.is_demo));
    if (input.send && !needsApproval) {
        after(trackServer('quote_sent', orgId, {
            event_id: `${cot.id}:initial`,
            quote_id: cot.id,
            total,
            currency: baseCurrency,
            // Un duplicado nace en borrador: este evento nunca lleva 'duplicate'.
            source: source === 'duplicate' ? 'manual' : source,
            send_type: 'initial',
        }, !!org.sandbox_of, !!org.is_demo));
    }

    return { id: cot.id as string, folio, token: cot.public_token as string, needsApproval, motivo: aprobMotivo, email };
}
