import { sql, withOrgTx, type DbQuery } from '../db';
import { normalizeTerm } from '../payment-terms';
import { notifyQuoteSent } from '../email';
import { invalidateMoneyCaches } from '../queries';
import { dispatchQuoteEvent, dispatchQuoteEventFrom, type WebhookEvent } from '../webhooks';
import { after } from '../after';
import { cancelUsage, reserveUsage } from '../billing';
import { requireEntitlement } from '../org-entitlements';
import { emitFiscalDocument } from '../fiscal/emit';
import { MAX_ITEMS, NEGATIVE_LINE_ERROR, QuoteError, assertClienteDeOrg, hasNegativeLine, productosDeOrg } from '../cotizaciones';
import { materializeAnticipoCobros } from '../cobros';
import { sanitizeItem, calculateDocumentTotals } from '../../../packages/elements/src/engine';
import { taxCatalogFor, TaxCatalogUnavailableError } from '../impuestos-db';
import { taxRoundingFor } from '../countries';
import { exemptionReasonFor } from '../fiscal/exemption';
import { lineSatKeyError, lineSatKeysFrom } from '../fiscal/sat-claves';
import { trackServer } from '../posthog-server';
import { currencyDecimals, normalizeCurrency } from '../currency';
import { FXService, FXUnavailableError } from '../fx/FXService';
import { descuentoDesdeJson, descuentoParaMotor, leerDescuentoBody, type DescuentoDef } from '../descuentos';
import { DescuentoError, liberarCupon, resolverDescuento } from '../cupones';
import { prepareUsTaxForDocument } from '../us-tax/calculo';
import { UsTaxError } from '../us-tax/core';
import { type ActionContext, type ActionOutcome, auditAction, done, fromResponse } from './outcome';

export type { ActionContext, ActionOutcome };

export type QuotePermission = 'cotizar' | 'aprobar';

const WH_MAP: Record<string, WebhookEvent> = {
    sent: 'quote.sent', approved: 'quote.approved', rejected: 'quote.rejected',
    paid: 'quote.paid', invoiced: 'invoice.stamped', updated: 'quote.updated',
    expired: 'quote.expired',
};

const APROBAR_ACTIONS = new Set(['approve', 'reject', 'approve_request', 'reject_request']);

const ACTIONS: Record<string, { from: string[]; to: string; evento: string; detalle: string }> = {
    send:         { from: ['draft'],                      to: 'sent',     evento: 'sent',     detalle: 'Cotización enviada — link generado' },
    resend:       { from: ['sent', 'viewed', 'expired'],  to: 'sent',     evento: 'updated',  detalle: 'Cotización reenviada al cliente' },
    update_draft: { from: ['draft'],                      to: 'draft',    evento: 'comment',  detalle: 'Borrador actualizado' },
    approve:      { from: ['sent', 'viewed'],             to: 'approved', evento: 'approved', detalle: 'Cotización marcada como aprobada' },
    reject:       { from: ['sent', 'viewed'],             to: 'rejected', evento: 'rejected', detalle: 'Cotización marcada como rechazada' },
    paid:         { from: ['approved', 'invoiced'],       to: 'paid',     evento: 'paid',     detalle: 'Pago registrado' },
    invoiced:     { from: ['approved', 'paid'],           to: 'invoiced', evento: 'invoiced', detalle: 'CFDI emitido' },
    // Caducar es lo que el cron hace cada noche por fecha; como acción existe
    // para que un workflow pueda cerrar la cotización antes, sin inventar un
    // rechazo que el cliente nunca dio.
    expire:       { from: ['sent', 'viewed'],             to: 'expired',  evento: 'expired',  detalle: 'Cotización vencida por un workflow' },
};

export function quoteActionPermission(action: string): QuotePermission {
    return APROBAR_ACTIONS.has(action) ? 'aprobar' : 'cotizar';
}

export async function runQuoteAction(ctx: ActionContext, id: string, input: Record<string, any>): Promise<ActionOutcome> {
    const { orgId } = ctx;
    const audit = (accion: string, detalle: string) => auditAction(ctx, accion, 'cotizacion', id, detalle);

    if (input.action === 'reply') {
        const mensaje = String(input.mensaje ?? '').trim().slice(0, 800);
        if (!mensaje) return done(400, { error: 'Escribe una respuesta' });
        const [rows] = await withOrgTx(orgId, sql`select id from cotizaciones where id = ${id} and org_id = ${orgId}`);
        if (!rows.length) return done(404, { error: 'Cotización no encontrada' });
        await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                  values (${orgId}, ${id}, 'reply', ${mensaje})`);
        after(dispatchQuoteEvent(orgId, id, 'quote.comment_added', { autor: 'vendedor', mensaje }));
        return done(200, { ok: true });
    }

    if (input.action === 'item_reply') {
        const mensaje = String(input.mensaje ?? '').trim().slice(0, 800);
        const itemId = String(input.item_id ?? '').trim();
        if (!mensaje || !itemId) return done(400, { error: 'Datos incompletos' });
        const [itemRows] = await withOrgTx(orgId, sql`select ci.id from cotizacion_items ci
                  join cotizaciones c on c.id = ci.cotizacion_id
                  where ci.id = ${itemId} and c.id = ${id} and c.org_id = ${orgId}`);
        if (!itemRows[0]) return done(404, { error: 'Línea no encontrada' });
        await withOrgTx(orgId, sql`insert into cotizacion_comentarios (org_id, cotizacion_id, item_id, autor_tipo, autor_nombre, contenido)
                  values (${orgId}, ${id}, ${itemId}, 'usuario', 'Vendedor', ${mensaje})`);
        after(dispatchQuoteEvent(orgId, id, 'quote.comment_added', { autor: 'vendedor', item_id: itemId, mensaje }));
        return done(200, { ok: true });
    }

    if (input.action === 'approve_request' || input.action === 'reject_request') {
        const subscriptionDenied = await requireEntitlement(orgId, 'approvals');
        if (subscriptionDenied) return fromResponse(subscriptionDenied);
        const [rows] = await withOrgTx(orgId, sql`
            select c.id, c.folio, c.aprob_estado, c.total, c.base_currency,
                   (o.sandbox_of is not null) as is_sandbox, o.is_demo
            from cotizaciones c join orgs o on o.id = c.org_id
            where c.id = ${id} and c.org_id = ${orgId}`);
        if (!rows.length) return done(404, { error: 'Cotización no encontrada' });
        if (rows[0].aprob_estado !== 'pendiente') return done(409, { error: 'No hay una solicitud de aprobación pendiente' });
        const now = new Date().toISOString();
        if (input.action === 'approve_request') {
            const [decided] = await withOrgTx(orgId, sql`
                with upd as (
                    update cotizaciones set aprob_estado = 'aprobada', status = 'sent', sent_at = coalesce(sent_at, ${now})
                     where id = ${id} and org_id = ${orgId} and aprob_estado = 'pendiente'
                    returning id
                )
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                select ${orgId}, id, 'sent', 'Aprobada por gerencia y enviada al cliente' from upd
                returning cotizacion_id`);
            if (!decided.length) return done(409, { error: 'No hay una solicitud de aprobación pendiente' });
            await audit('cotizacion.aprobacion_aprobada', rows[0].folio as string);
            after(dispatchQuoteEvent(orgId, id, 'quote.approval_decided', { decision: 'approved' }));
            after(dispatchQuoteEvent(orgId, id, 'quote.sent'));
            after(trackServer('quote_sent', orgId, {
                event_id: `${id}:initial`,
                quote_id: id,
                total: Number(rows[0].total ?? 0),
                currency: (rows[0].base_currency as string) || 'MXN',
                source: 'approval_flow',
                send_type: 'initial',
            }, !!rows[0].is_sandbox, !!rows[0].is_demo));
            return done(200, { ok: true, status: 'sent' });
        }
        const [rejected] = await withOrgTx(orgId, sql`
            with upd as (
                update cotizaciones set aprob_estado = 'rechazada'
                 where id = ${id} and org_id = ${orgId} and aprob_estado = 'pendiente'
                returning id
            )
            insert into eventos (org_id, cotizacion_id, tipo, detalle)
            select ${orgId}, id, 'rejected', 'Solicitud de aprobación rechazada por gerencia' from upd
            returning cotizacion_id`);
        if (!rejected.length) return done(409, { error: 'No hay una solicitud de aprobación pendiente' });
        await audit('cotizacion.aprobacion_rechazada', rows[0].folio as string);
        after(dispatchQuoteEvent(orgId, id, 'quote.approval_decided', { decision: 'rejected' }));
        return done(200, { ok: true, status: 'draft' });
    }

    const action = ACTIONS[input.action];
    if (!action) return done(400, { error: 'Acción no válida' });

    const [rows] = await withOrgTx(orgId, sql`select id, status, version, base_currency, fiscal_currency, fx_rate, total,
                                    cliente_id, descuento, descuento_def
                             from cotizaciones where id = ${id} and org_id = ${orgId}`);
    if (!rows.length) return done(404, { error: 'Cotización no encontrada' });

    const actual = rows[0].status as string;
    if (!action.from.includes(actual)) {
        return done(409, { error: `No se puede pasar de "${actual}" con esta acción` });
    }

    if (['resend', 'update_draft', 'send'].includes(input.action) && Array.isArray(input.items)) {
        if (input.items.length > MAX_ITEMS) return done(400, { error: `Demasiadas líneas (máximo ${MAX_ITEMS}).` });
        if (hasNegativeLine(input.items)) return done(400, { error: NEGATIVE_LINE_ERROR, code: 'invalid_request' });
        const rawItems = input.items;
        const iva_incluido = Boolean(input.iva_incluido);

        let catalogo: Awaited<ReturnType<typeof taxCatalogFor>>;
        try {
            catalogo = await taxCatalogFor(orgId);
        } catch (error) {
            if (error instanceof TaxCatalogUnavailableError) return done(503, { error: error.message, code: 'tax_catalog_unavailable' });
            throw error;
        }
        const items = rawItems.map((raw: any, i: number) => {
            const tax_rate = catalogo.resolve(rawItems[i]?.tax_rate, catalogo.defaultRate);
            // La causa de exención solo se conserva en España y en una línea al 0 %.
            const exemption_reason = exemptionReasonFor(catalogo.country, rawItems[i]?.exemption_reason, tax_rate);
            // Claves SAT propias de la línea; solo México timbra CFDI.
            const sat = catalogo.country === 'MX' ? lineSatKeysFrom(rawItems[i]) : { productKey: null, unitKey: null };
            return { ...sanitizeItem(raw), tax_rate, exemption_reason, clave_sat: sat.productKey, clave_unidad_sat: sat.unitKey };
        });
        const satError = lineSatKeyError(items.map((it: any) => ({ descripcion: it.descripcion, productKey: it.clave_sat, unitKey: it.clave_unidad_sat })));
        if (satError) return done(400, { error: satError, code: 'invalid_request' });
        const monedaVenta = normalizeCurrency(input.base_currency, normalizeCurrency(rows[0].base_currency as string));

        // Descuento de documento. Sin `descuento` ni `cupon` en el body se
        // conserva el que la cotización ya tenía (una acción de la API que solo
        // cambia líneas no lo borra). Un cupón ya aplicado se conserva tal cual:
        // se validó al aplicarlo y el tope de usos se revisa al aprobarse.
        const pedido = leerDescuentoBody(input);
        if ('error' in pedido) return done(400, { error: pedido.error, code: 'invalid_discount' });
        const previo = descuentoDesdeJson(rows[0].descuento_def);
        // Un monto está en la divisa en la que se aplicó: si la cotización
        // cambia de divisa, ese número ya no significa lo mismo.
        const cambioDivisa = monedaVenta !== normalizeCurrency(rows[0].base_currency as string);
        let descuento: DescuentoDef | null = previo;
        if (!pedido.presente) {
            if (previo?.tipo === 'monto' && cambioDivisa) {
                return done(400, { error: 'El descuento está en otra divisa. Vuelve a aplicarlo.', code: 'discount_currency' });
            }
        } else {
            const mismoCupon = !!pedido.solicitud.cupon && previo?.codigo === pedido.solicitud.cupon && !!previo?.cupon_id
                && !(previo.tipo === 'monto' && cambioDivisa);
            if (!mismoCupon) {
                try {
                    descuento = await resolverDescuento(orgId, pedido.solicitud, {
                        moneda: monedaVenta,
                        clienteId: input.cliente_id ? String(input.cliente_id) : (rows[0].cliente_id as string | null),
                        cotizacionId: id,
                    });
                } catch (error) {
                    if (error instanceof DescuentoError) return done(error.status, { error: error.message, code: error.code });
                    throw error;
                }
            }
        }
        // Sales tax de EE. UU. por dirección (src/lib/us-tax/): con un cliente
        // en EE. UU., la tasa de cada línea sale de un cálculo real guardado
        // para ESTA venta; la del navegador se ignora. Sin cálculo posible no
        // se guarda y se dice qué falta (regla 22). Un borrador puede quedarse
        // sin cliente; enviar, no.
        const reescribeCliente = input.action === 'update_draft' || (input.action === 'send' && actual === 'draft');
        const clienteFinal = reescribeCliente ? (input.cliente_id ? String(input.cliente_id) : null) : ((rows[0].cliente_id as string | null) ?? null);
        let usTaxCalculoId: string | null = null;
        try {
            const usTax = await prepareUsTaxForDocument(orgId, {
                clienteId: clienteFinal, currency: monedaVenta, ivaIncluido: iva_incluido,
                descuento: descuentoParaMotor(descuento), items, calculoId: input.us_tax_calculo_id,
                requireClient: input.action !== 'update_draft', venta: `cotizacion:${id}`, orgCountry: catalogo.country,
            });
            if (usTax) {
                catalogo = await taxCatalogFor(orgId, { usTaxCalculoId: usTax.calculoId });
                usTaxCalculoId = usTax.calculoId;
                const conCalculo = catalogo;
                items.forEach((it: any, i: number) => {
                    it.tax_rate = conCalculo.resolve(null, conCalculo.defaultRate, i);
                    it.tax_breakdown = conCalculo.breakdown(i);
                    it.exemption_reason = null;
                });
            }
        } catch (error) {
            if (error instanceof UsTaxError) return done(error.status, { error: error.message, code: `us_tax_${error.code}` });
            if (error instanceof TaxCatalogUnavailableError) return done(503, { error: error.message, code: 'tax_catalog_unavailable' });
            throw error;
        }

        // Editar recalcula TODO con la regla vigente del país (CL: impuesto por
        // documento) y la guarda: desde aquí, los recálculos usan esta.
        const taxRounding = taxRoundingFor(catalogo.country);
        const totals = calculateDocumentTotals(items as any[], {
            ivaIncluido: iva_incluido,
            retenciones: catalogo.retenciones,
            // Redondeo en la divisa de venta: es lo que después timbra el CFDI,
            // registra Verifactu o envía el DTE, así que la cotización y su
            // factura cuadran al centavo (ver RoundingOptions en engine.ts).
            roundLines: currencyDecimals(monedaVenta),
            taxRounding,
            descuento: descuentoParaMotor(descuento),
        });
        const descuentoTotal = totals.descuentoTotal;
        const descuentoJson = descuento ? JSON.stringify(descuento) : null;
        const realSubtotal = totals.subtotal;
        const iva = totals.impuestos;
        const total = totals.total;
        const retencionTotal = totals.retencionTotal;
        const retencionesSnapshot = JSON.stringify(totals.retenciones);

        const nextVersion = input.action === 'resend' ? Number(rows[0].version || 1) + 1 : Number(rows[0].version || 1);
        const writes: DbQuery[] = [];

        if (input.action === 'update_draft' || (input.action === 'send' && actual === 'draft')) {
            if (input.cliente_id) {
                try {
                    await assertClienteDeOrg(orgId, String(input.cliente_id));
                } catch (error) {
                    if (error instanceof QuoteError) return done(error.status, { error: error.message });
                    throw error;
                }
            }
            const vigDias = Number(input.vigencia_dias) || 30;
            const esRecurrente = !!input.es_recurrente;
            const terminos = esRecurrente ? 'contado' : normalizeTerm(input.terminos);
            const antRaw = Number(input.anticipo_pct);
            const anticipoPct = esRecurrente ? null
                : (Number.isFinite(antRaw) && antRaw >= 1 && antRaw <= 99 ? Math.round(antRaw * 100) / 100 : null);

            const prevBase = normalizeCurrency(rows[0].base_currency as string);
            const baseCurrency = normalizeCurrency(input.base_currency, prevBase);
            const fiscalCurrency = normalizeCurrency(
                input.fiscal_currency,
                normalizeCurrency(rows[0].fiscal_currency as string, baseCurrency),
            );

            let fxRate = Number(rows[0].fx_rate);
            let fxSource: string | null = null;
            let fxLockedUntil: string | null = null;
            const parChanged = baseCurrency !== prevBase
                || fiscalCurrency !== normalizeCurrency(rows[0].fiscal_currency as string, prevBase);
            if (baseCurrency === fiscalCurrency) {
                fxRate = 1; fxSource = 'same'; fxLockedUntil = null;
            } else if (parChanged || !Number.isFinite(fxRate) || fxRate <= 0) {
                try {
                    const fx = await FXService.getExchangeRate({
                        baseCurrency, fiscalCurrency, amount: total,
                        bufferPct: Number(input.fx_buffer_pct) || 0,
                    });
                    fxRate = fx.appliedRate;
                    fxSource = fx.source;
                    fxLockedUntil = fx.lockedUntil ? fx.lockedUntil.toISOString() : null;
                } catch (error) {
                    if (error instanceof FXUnavailableError) return done(503, { error: error.message, code: 'fx_unavailable' });
                    throw error;
                }
            }

            writes.push(sql`update cotizaciones set
                        cliente_id = ${input.cliente_id || null},
                        terminos = ${terminos},
                        vigencia = (current_date + (${vigDias} * interval '1 day'))::date,
                        notas = ${input.notas || null},
                        base_currency = ${baseCurrency},
                        moneda = ${baseCurrency},
                        fiscal_currency = ${fiscalCurrency},
                        fx_rate = ${fxRate},
                        fx_rate_source = coalesce(${fxSource}, fx_rate_source),
                        fx_locked_until = case when ${fxSource !== null} then ${fxLockedUntil}
                                               else fx_locked_until end,
                        subtotal = ${realSubtotal}, iva = ${iva}, total = ${total},
                        retencion_total = ${retencionTotal},
                        retenciones_snapshot = ${retencionesSnapshot}::jsonb,
                        descuento = ${descuentoTotal}, descuento_def = ${descuentoJson}::jsonb,
                        version = ${nextVersion}, iva_incluido = ${iva_incluido}, tax_rounding = ${taxRounding},
                        anticipo_pct = ${anticipoPct}, es_recurrente = ${esRecurrente},
                        us_tax_calculo_id = ${usTaxCalculoId}::uuid
                      where id = ${id}`);
        } else {
            writes.push(sql`update cotizaciones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total},
                        retencion_total = ${retencionTotal}, retenciones_snapshot = ${retencionesSnapshot}::jsonb,
                        descuento = ${descuentoTotal}, descuento_def = ${descuentoJson}::jsonb,
                        version = ${nextVersion}, iva_incluido = ${iva_incluido}, tax_rounding = ${taxRounding},
                        us_tax_calculo_id = ${usTaxCalculoId}::uuid where id = ${id}`);
        }

        const productosPropios = await productosDeOrg(orgId, items.map((it: any) => it.producto_id));
        writes.push(sql`delete from cotizacion_items where cotizacion_id = ${id}`);
        items.forEach((it: any, orden: number) => {
            writes.push(sql`insert into cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden, tax_rate, exemption_reason, clave_sat, clave_unidad_sat, tax_breakdown)
                      values (${id}, ${it.producto_id && productosPropios.has(it.producto_id) ? it.producto_id : null}, ${it.descripcion}, ${Number(it.cantidad) || 1}, ${Number(it.precio_unitario) || 0}, ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)}, ${Number(it.costo_unitario) || 0}, ${orden}, ${it.tax_rate}, ${it.exemption_reason ?? null}, ${it.clave_sat ?? null}, ${it.clave_unidad_sat ?? null}, ${it.tax_breakdown ? JSON.stringify(it.tax_breakdown) : null}::jsonb)`);
        });

        if (input.action === 'resend') {
            writes.push(sql`insert into cotizacion_versiones (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
                      values (${id}, ${orgId}, ${nextVersion}, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(items)}, null, ${iva_incluido})`);
            writes.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle) values (${orgId}, ${id}, 'comment', ${'Versión ' + nextVersion + ' creada'})`);
        } else {
            writes.push(sql`update cotizacion_versiones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total}, items = ${JSON.stringify(items)}, iva_incluido = ${iva_incluido} where cotizacion_id = ${id} and version = ${nextVersion}`);
        }
        await withOrgTx(orgId, ...writes);
    }

    const now = new Date().toISOString();

    let fiscal: Awaited<ReturnType<typeof emitFiscalDocument>> | undefined;
    if (action.to === 'invoiced') {
        const [orgFiscalRows] = await withOrgTx(orgId, sql`
            select upper(coalesce(country_code, 'MX')) as country_code
              from orgs where id = ${orgId} limit 1`);
        const orgFiscal = orgFiscalRows[0];
        if (!orgFiscal) return done(404, { error: 'Organización no encontrada' });
        const isMexico = String(orgFiscal.country_code) === 'MX';
        const subscriptionDenied = await requireEntitlement(orgId, 'international_invoicing');
        if (subscriptionDenied) return fromResponse(subscriptionDenied);
        const [priorCountRows] = await withOrgTx(orgId, sql`
            select count(*)::int as n
              from documentos_fiscales
             where org_id = ${orgId} and country_code = 'MX' and status = 'issued'
               and coalesce((provider_data->>'simulado')::boolean, false) = false
               and coalesce((provider_data->>'livemode')::boolean, true) = true
               and provider_data->>'facturapi_id' is not null`);
        const priorCount = priorCountRows[0];
        fiscal = await emitFiscalDocument(orgId, id, input.document_mode);
        if (!fiscal.emitted) {
            return done(fiscal.httpStatus || 502, { error: fiscal.error || 'No se pudo emitir el documento fiscal', fiscal });
        }
        if (isMexico && fiscal.billable === true && (priorCount?.n ?? 0) === 0) {
            const [orgFlagsRows] = await withOrgTx(orgId, sql`select created_at, (sandbox_of is not null) as is_sandbox, is_demo from orgs where id = ${orgId}`);
            const orgFlags = orgFlagsRows[0];
            const timeSince = orgFlags?.created_at ? Math.max(0, Math.round((Date.now() - new Date(orgFlags.created_at as string).getTime()) / 86400000)) : null;
            await trackServer('cfdi_first_timbrado', orgId, { time_since_org_created_days: timeSince }, !!orgFlags?.is_sandbox, !!orgFlags?.is_demo);
        }
    }

    const lostRace = () => done(409, { error: 'La cotización cambió mientras se procesaba. Recarga e intenta de nuevo.' });

    if (action.to === 'sent') {
        let reservationId: string | undefined;
        if (input.action === 'send') {
            const envioUsage = await reserveUsage(orgId, 'envios', 1);
            if (!envioUsage.ok) {
                const unavailable = /verificar|registrar/i.test(envioUsage.reason || '');
                return done(unavailable ? 503 : 402, { error: envioUsage.reason, code: unavailable ? 'usage_verification_unavailable' : 'plan_limit_reached' });
            }
            reservationId = envioUsage.id;
        }
        const [moved] = await withOrgTx(orgId, sql`update cotizaciones set status = 'sent', sent_at = coalesce(sent_at, ${now}) where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[]) returning id`);
        if (!moved.length) {
            if (reservationId) await cancelUsage(orgId, reservationId);
            return lostRace();
        }
    } else if (action.to === 'approved') {
        // La aprobación vuelve vinculante la cotización: aquí se redime su
        // cupón. Si los usos se agotaron desde que se aplicó, no se aprueba con
        // un descuento que el negocio ya no puede dar.
        const descuentoQuote = descuentoDesdeJson(rows[0].descuento_def);
        if (descuentoQuote?.cupon_id) {
            // Redención y aprobación en UNA transacción, con la cotización
            // bloqueada: la aprobación solo avanza si el uso quedó registrado, y
            // una cotización que ya cambió de estado no redime nada.
            const [redRows, moved] = await withOrgTx(orgId,
                sql`select cord_cupon_redimir(${orgId}::uuid, ${descuentoQuote.cupon_id}::uuid, c.cliente_id, c.id, null::uuid,
                           coalesce(c.descuento, 0), c.base_currency) as r
                      from cotizaciones c
                     where c.id = ${id} and c.org_id = ${orgId} and c.status = any(${action.from}::text[])
                       for update`,
                sql`update cotizaciones set status = 'approved', approved_at = ${now}
                     where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[])
                       and exists (select 1 from cupon_redenciones r
                                    where r.org_id = ${orgId} and r.cupon_id = ${descuentoQuote.cupon_id}::uuid and r.cotizacion_id = ${id})
                    returning id`);
            const redencion = String(redRows[0]?.r || '');
            if (!redRows.length) return lostRace();
            if (redencion !== 'ok') {
                return done(409, {
                    error: redencion === 'no_existe'
                        ? `El cupón ${descuentoQuote.codigo || ''} ya no existe. Quítalo de la cotización y vuelve a enviarla.`
                        : `El cupón ${descuentoQuote.codigo || ''} ya no tiene usos disponibles${redencion === 'agotado_cliente' ? ' para este cliente' : ''}. Quítalo de la cotización y vuelve a enviarla.`,
                    code: `coupon_${redencion}`,
                });
            }
            if (!moved.length) return lostRace();
        } else {
            const [moved] = await withOrgTx(orgId, sql`update cotizaciones set status = 'approved', approved_at = ${now} where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[]) returning id`);
            if (!moved.length) return lostRace();
        }
        try { await materializeAnticipoCobros(id, orgId); } catch { /* fallback en payment-intent */ }
    } else if (action.to === 'paid') {
        const method = input.payment_method || 'transferencia';
        const [moved] = await withOrgTx(orgId, sql`update cotizaciones set status = 'paid', paid_at = coalesce(paid_at, ${now}), payment_method = coalesce(payment_method, ${method}) where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[]) returning id`);
        if (!moved.length) return lostRace();
        const stripeKey = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
        const [pendientesPI] = await withOrgTx(orgId, sql`
            select co.stripe_payment_intent_id, o.stripe_account_id
            from cotizacion_cobros co
            join cotizaciones c on c.id = co.cotizacion_id
            join orgs o on o.id = c.org_id
            where co.cotizacion_id = ${id} and co.status = 'pendiente'
              and co.stripe_payment_intent_id is not null`);
        if (stripeKey) {
            for (const p of pendientesPI) {
                try {
                    await fetch(`https://api.stripe.com/v1/payment_intents/${p.stripe_payment_intent_id}/cancel`, {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${stripeKey}`,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            ...(p.stripe_account_id ? { 'Stripe-Account': p.stripe_account_id as string } : {}),
                        },
                    });
                } catch { /* el webhook concilia si aun así se paga */ }
            }
        }
        await withOrgTx(orgId, sql`update cotizacion_cobros set status = 'cancelado' where cotizacion_id = ${id} and status = 'pendiente'`);
    } else {
        const [moved] = await withOrgTx(orgId, sql`update cotizaciones set status = ${action.to} where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[]) returning id`);
        if (!moved.length) return lostRace();
        // Una cotización rechazada o vencida no consume su cupón. Hoy solo se
        // redime al aprobar, así que normalmente no hay nada que devolver.
        if ((action.to === 'rejected' || action.to === 'expired') && descuentoDesdeJson(rows[0].descuento_def)?.cupon_id) {
            await liberarCupon(orgId, { cotizacionId: id });
        }
    }

    invalidateMoneyCaches(orgId);

    const eventDetail = action.evento === 'invoiced'
        ? (fiscal?.documentType === 'proforma' ? `Proforma ${fiscal.invoiceNumber || ''} emitida` : fiscal?.billable ? 'CFDI emitido' : `Factura ${fiscal?.invoiceNumber || ''} emitida`.trim())
        : action.detalle;
    await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${id}, ${action.evento}, ${eventDetail})`);
    await audit(`cotizacion.${input.action}`, `${actual} → ${action.to}`);

    const whev = action.evento === 'invoiced' && !fiscal?.billable
        ? 'invoice.issued'
        : WH_MAP[action.evento];
    // `quote.updated` lleva el total ANTERIOR: sin él, una automatización no
    // distingue "se reenvió igual" de "le bajaron 20% y se reenvió".
    if (whev === 'quote.updated') {
        after(dispatchQuoteEvent(orgId, id, whev, { total_anterior: Number(rows[0].total ?? 0) }));
    } else if (whev) {
        after(dispatchQuoteEvent(orgId, id, whev));
    }

    let email: { sent: boolean; skipped?: string } | undefined;
    if (action.to === 'sent') {
        email = await notifyQuoteSent(orgId, id, ctx.origin);
        if (email.sent) {
            await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                      values (${orgId}, ${id}, 'email', 'Correo enviado al cliente')`);
        }
    }

    const analyticsEvent = input.action === 'send' || input.action === 'resend'
        ? 'quote_sent'
        : input.action === 'approve'
            ? 'quote_approved'
            : input.action === 'paid'
                ? 'quote_marked_paid'
                : input.action === 'reject'
                    ? 'quote_rejected'
                    : null;
    if (analyticsEvent) {
        const [metricRows] = await withOrgTx(orgId, sql`
            select c.total, c.base_currency, c.version,
                   (o.sandbox_of is not null) as is_sandbox, o.is_demo
            from cotizaciones c join orgs o on o.id = c.org_id
            where c.id = ${id} and c.org_id = ${orgId}`);
        const metric = metricRows[0];
        if (metric) {
            after(trackServer(analyticsEvent, orgId, {
                event_id: analyticsEvent === 'quote_sent'
                    ? `${id}:${input.action === 'resend' ? `resend:${metric.version}` : 'initial'}`
                    : id,
                quote_id: id,
                total: Number(metric.total ?? 0),
                currency: (metric.base_currency as string) || 'MXN',
                source: ctx.source ?? 'manual',
                ...(analyticsEvent === 'quote_sent'
                    ? { send_type: input.action === 'resend' ? 'resend' as const : 'initial' as const }
                    : {}),
            }, !!metric.is_sandbox, !!metric.is_demo));
        }
    }

    // `quote_expired` no admite `source`, así que va aparte del bloque genérico
    // de arriba. Comparte `event_id` con el cron: la misma cotización vencida
    // no cuenta dos veces si ambos caminos la tocan.
    if (input.action === 'expire') {
        const [expiredRows] = await withOrgTx(orgId, sql`
            select c.total, c.base_currency, c.sent_at, (o.sandbox_of is not null) as is_sandbox, o.is_demo
              from cotizaciones c join orgs o on o.id = c.org_id
             where c.id = ${id} and c.org_id = ${orgId}`);
        const m = expiredRows[0];
        if (m) {
            after(trackServer('quote_expired', orgId, {
                event_id: id,
                quote_id: id,
                total: Number(m.total ?? 0),
                currency: (m.base_currency as string) || 'MXN',
                ...(m.sent_at ? { days_since_sent: Math.max(0, Math.round((Date.now() - new Date(m.sent_at as string).getTime()) / 86400000)) } : {}),
            }, !!m.is_sandbox, !!m.is_demo));
        }
    }

    return done(200, { ok: true, status: action.to, email, fiscal });
}

export async function deleteQuoteDraft(ctx: ActionContext, id: string): Promise<ActionOutcome> {
    const { orgId } = ctx;
    const [beforeRows] = await withOrgTx(orgId, sql`
        select c.id, c.folio, c.status, c.total, c.public_token, c.base_currency, c.cliente_id, cl.empresa
        from cotizaciones c left join clientes cl on cl.id = c.cliente_id and cl.org_id = c.org_id
        where c.id = ${id} and c.org_id = ${orgId} and c.status = 'draft'`);
    const before = beforeRows[0];
    const [rows] = await withOrgTx(orgId, sql`
        delete from cotizaciones
        where id = ${id} and org_id = ${orgId} and status = 'draft'
        returning id`);
    if (!rows.length) return done(409, { error: 'Solo se pueden eliminar borradores' });
    if (before) after(dispatchQuoteEventFrom(orgId, 'quote.deleted', before as any));
    return done(200, { ok: true });
}

type QuoteInput = Record<string, any>;

export const sendQuote = (ctx: ActionContext, id: string, input: QuoteInput = {}) => runQuoteAction(ctx, id, { ...input, action: 'send' });
export const resendQuote = (ctx: ActionContext, id: string, input: QuoteInput = {}) => runQuoteAction(ctx, id, { ...input, action: 'resend' });
export const updateQuoteDraft = (ctx: ActionContext, id: string, input: QuoteInput) => runQuoteAction(ctx, id, { ...input, action: 'update_draft' });
export const approveQuote = (ctx: ActionContext, id: string) => runQuoteAction(ctx, id, { action: 'approve' });
export const rejectQuote = (ctx: ActionContext, id: string) => runQuoteAction(ctx, id, { action: 'reject' });
export const expireQuote = (ctx: ActionContext, id: string) => runQuoteAction(ctx, id, { action: 'expire' });
export const markQuotePaid = (ctx: ActionContext, id: string, input: { payment_method?: string } = {}) => runQuoteAction(ctx, id, { ...input, action: 'paid' });
export const invoiceQuote = (ctx: ActionContext, id: string, input: { document_mode?: string } = {}) => runQuoteAction(ctx, id, { ...input, action: 'invoiced' });
export const decideApprovalRequest = (ctx: ActionContext, id: string, approve: boolean) => runQuoteAction(ctx, id, { action: approve ? 'approve_request' : 'reject_request' });
export const replyToQuote = (ctx: ActionContext, id: string, mensaje: string) => runQuoteAction(ctx, id, { action: 'reply', mensaje });
export const replyToQuoteItem = (ctx: ActionContext, id: string, itemId: string, mensaje: string) => runQuoteAction(ctx, id, { action: 'item_reply', item_id: itemId, mensaje });
