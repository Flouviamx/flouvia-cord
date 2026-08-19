// src/lib/cotizaciones.ts
// FUENTE ÚNICA de la creación de cotizaciones. La consumen tanto la ruta interna
// (/api/cotizaciones, sesión Auth) como la API pública (/api/v1/cotizaciones,
// API key). Aquí vive el cálculo server-side de subtotal/IVA, el folio, el flujo
// de aprobación por umbrales y los eventos/auditoría — para no divergir.

import { sql, logAudit } from './db';
import { notifyQuoteSent } from './email';
import { dispatchQuoteEvent } from './webhooks';
import { FXService, FXUnavailableError } from './fx/FXService';
import { currentUserId } from './context';
import { assertResourceCapacity, checkEntitlement, parsedResourceLimit, ResourceLimitReachedError } from './org-entitlements';
import { after } from './after';
import { trackServer } from './posthog-server';

import { sanitizeItem, calculateDocumentTotals } from '../../packages/elements/src/engine';
import { normalizeCurrency } from './currency';
import { taxCatalogFor } from './impuestos-db';
import { intlLocale } from './fmt-server';

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

export class QuoteError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
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
    if (input.cliente_id) return input.cliente_id;

    const empresa = input.cliente?.empresa?.trim();
    if (!empresa) return null;
    const email = input.cliente?.email?.trim() || null;

    const [existing] = email
        ? await sql`select id from clientes where org_id = ${orgId} and (lower(empresa) = lower(${empresa}) or email = ${email}) limit 1`
        : await sql`select id from clientes where org_id = ${orgId} and lower(empresa) = lower(${empresa}) limit 1`;
    if (existing) return existing.id as string;

    try {
        await assertResourceCapacity(orgId, 'clients');
    } catch (error) {
        if (error instanceof ResourceLimitReachedError) throw new QuoteError(error.message, 402);
        throw error;
    }

    try {
        const [created] = await sql`
            insert into clientes (org_id, empresa, email, contacto, telefono, rfc, origen)
            values (${orgId}, ${empresa}, ${email}, ${input.cliente?.contacto || null}, ${input.cliente?.telefono || null}, ${input.cliente?.rfc || null}, 'embed')
            returning id`;
        return created.id as string;
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) throw new QuoteError(`Tu plan permite ${limit.limit} clientes. Libera espacio o sube de plan para continuar.`, 402);
        throw error;
    }
}

/**
 * Crea una cotización (borrador o enviada) para `orgId`. NO valida permisos ni
 * parsea el request — eso lo hace cada ruta (Sesión vs API key). `opts.origin` se
 * usa para construir el link público en el correo; `opts.actor` etiqueta la
 * auditoría (ej. 'api:<keyId>').
 */
export async function createCotizacion(
    orgId: string,
    input: NewQuoteInput,
    opts: { origin: string; ip: string; actor?: string },
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
    const [org] = await sql`select * from orgs where id = ${orgId}`;
    const approvalsEnabled = (await checkEntitlement(orgId, 'approvals')).ok;
    const iva_incluido = Boolean(input.iva_incluido);

    // Impuesto POR LÍNEA. La tasa la manda el editor —que la eligió del catálogo
    // de la org— y el servidor la valida contra ese mismo catálogo: un cliente
    // no puede inventarse una tasa que el negocio no configuró. Sin tasa
    // explícita se cae al perfil predeterminado, que es lo que hacía la columna
    // plana orgs.iva_pct antes de que existiera el impuesto por línea.
    const catalogo = await taxCatalogFor(orgId);
    const fallbackRate = catalogo.defaultRate;
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

    const [{ maxn }] = await sql`
        select coalesce(max(nullif(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) as maxn
        from cotizaciones where org_id = ${orgId}`;
    const folio = `${org.quote_prefix}-${String(Number(maxn) + 1).padStart(4, '0')}`;

    // Flujo de aprobación: ¿el descuento, monto o margen rebasan los topes?
    let maxDescPct = 0;
    let minMargenPct = Infinity;
    let hayLineasConCosto = false;
    for (const it of items) {
        const lista = Number(it.precio_unitario) || 0;
        const nego = it.precio_negociado;
        if (nego !== null && nego !== undefined && lista > 0 && Number(nego) < lista) {
            maxDescPct = Math.max(maxDescPct, (1 - Number(nego) / lista) * 100);
        }
        const costo = Number(it.costo_unitario) || 0;
        const precioFinal = (nego !== null && nego !== undefined) ? Number(nego) : lista;
        if (costo > 0 && precioFinal > 0) {
            hayLineasConCosto = true;
            minMargenPct = Math.min(minMargenPct, (precioFinal - costo) / precioFinal * 100);
        }
    }
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
        : (['contado', 'net30', 'net60'].includes(input.terminos ?? '') ? input.terminos! : 'contado');
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

    let cot: any;
    try {
        [cot] = await sql`
            insert into cotizaciones
                (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas, sent_at, aprob_estado, aprob_motivo,
                 moneda, base_currency, fiscal_currency, fx_rate, fx_rate_source, fx_locked_until, iva_incluido, anticipo_pct, es_recurrente, creado_por,
                 retencion_total, retenciones_snapshot)
            values
                (${orgId}, ${clienteId}, ${folio}, ${status}, ${realSubtotal}, ${iva}, ${total},
                 ${terminos}, ${vigencia.toISOString()}, ${input.notas || null}, ${sentAt}, ${aprobEstado}, ${aprobMotivo},
                 ${baseCurrency}, ${baseCurrency}, ${fiscalCurrency}, ${fxRate}, ${fxSource}, ${fxLockedUntil}, ${iva_incluido}, ${anticipoPct}, ${esRecurrente}, ${creadoPor},
                 ${retencionTotal}, ${retencionesSnapshot}::jsonb)
            returning id, public_token`;
    } catch (error) {
        const limit = parsedResourceLimit(error);
        if (limit) throw new QuoteError(`Tu plan permite ${limit.limit} cotizaciones activas. Cierra una o sube de plan para continuar.`, 402);
        throw error;
    }

    let orden = 0;
    for (const it of itemsConImpuesto) {
        await sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden, tax_rate)
            values
                (${cot.id}, ${it.producto_id || null}, ${it.descripcion}, ${Number(it.cantidad) || 1},
                 ${Number(it.precio_unitario) || 0},
                 ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)},
                 ${Number(it.costo_unitario) || 0},
                 ${orden++}, ${it.tax_rate})`;
    }

    await sql`
        insert into cotizacion_versiones
            (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
        values
            (${cot.id}, ${orgId}, 1, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(itemsConImpuesto)}, ${input.notas || null}, ${iva_incluido})`;

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${cot.id}, 'created', 'Borrador creado')`;
    if (input.send && !needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'sent', 'Cotización enviada — link generado')`;
    }
    if (needsApproval) {
        await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${cot.id}, 'comment', ${'Solicitud de aprobación: ' + aprobMotivo})`;
    }
    await logAudit(orgId, {
        accion: needsApproval ? 'cotizacion.aprobacion_solicitada' : (input.send ? 'cotizacion.enviada' : 'cotizacion.creada'),
        entidad: 'cotizacion', entidad_id: cot.id as string,
        detalle: folio + (needsApproval ? ' — ' + aprobMotivo : ''), ip: opts.ip, actor: opts.actor,
    });

    let email: { sent: boolean; skipped?: string } | undefined;
    if (input.send && !needsApproval) {
        email = await notifyQuoteSent(orgId, cot.id as string, opts.origin);
        if (email.sent) {
            await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${cot.id}, 'email', 'Correo enviado al cliente')`;
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
        source,
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
