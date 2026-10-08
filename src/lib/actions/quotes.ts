import { sql, withOrgTx, type DbQuery } from '../db';
import { normalizeTerm } from '../payment-terms';
import { notifyQuoteSent } from '../email';
import { invalidateMoneyCaches } from '../queries';
import { dispatchQuoteEvent, dispatchQuoteEventFrom, type WebhookEvent } from '../webhooks';
import { after } from '../after';
import { cancelUsage, reserveUsage } from '../billing';
import { requireEntitlement } from '../org-entitlements';
import { emitFiscalDocument } from '../fiscal/emit';
import { MAX_ITEMS, QuoteError, assertClienteDeOrg, productosDeOrg, vigenciaDias } from '../cotizaciones';
import { materializeAnticipoCobros } from '../cobros';
import { sanitizeItem, calculateDocumentTotals } from '../../../packages/elements/src/engine';
import { taxCatalogFor, TaxCatalogUnavailableError } from '../impuestos-db';
import { unknownTaxRate, unknownTaxRateMessage, withStoredRates } from '../impuestos';
import { trackServer } from '../posthog-server';
import { normalizeCurrency } from '../currency';
import { FXService, FXUnavailableError } from '../fx/FXService';
import {
    approvalMotivo, approvalPolicyFor, evaluateApproval, notWorseThanApproved, totalForPolicy,
} from '../quote-approval';
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
            // Aprobar la solicitud ENVÍA la cotización: consume el envío como
            // cualquier otro y manda el correo. Antes la marcaba "enviada",
            // escribía el evento y el webhook, y el cliente nunca recibía nada.
            const envioUsage = await reserveUsage(orgId, 'envios', 1);
            if (!envioUsage.ok) {
                const unavailable = /verificar|registrar/i.test(envioUsage.reason || '');
                return done(unavailable ? 503 : 402, { error: envioUsage.reason, code: unavailable ? 'usage_verification_unavailable' : 'plan_limit_reached' });
            }
            const [decided] = await withOrgTx(orgId, sql`
                with upd as (
                    update cotizaciones set aprob_estado = 'aprobada', status = 'sent', sent_at = coalesce(sent_at, ${now})
                     where id = ${id} and org_id = ${orgId} and aprob_estado = 'pendiente'
                    returning id
                )
                insert into eventos (org_id, cotizacion_id, tipo, detalle)
                select ${orgId}, id, 'sent', 'Aprobada por gerencia y enviada al cliente' from upd
                returning cotizacion_id`);
            if (!decided.length) {
                if (envioUsage.id) await cancelUsage(orgId, envioUsage.id);
                return done(409, { error: 'No hay una solicitud de aprobación pendiente' });
            }
            await audit('cotizacion.aprobacion_aprobada', rows[0].folio as string);
            const email = await notifyQuoteSent(orgId, id, ctx.origin);
            if (email.sent) {
                await withOrgTx(orgId, sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                          values (${orgId}, ${id}, 'email', 'Correo enviado al cliente')`);
            }
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
            return done(200, { ok: true, status: 'sent', email });
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

    const [rows] = await withOrgTx(orgId, sql`select id, status, version, base_currency, fiscal_currency, fx_rate, total, aprob_estado
                             from cotizaciones where id = ${id} and org_id = ${orgId}`);
    if (!rows.length) return done(404, { error: 'Cotización no encontrada' });

    const actual = rows[0].status as string;
    if (!action.from.includes(actual)) {
        return done(409, { error: `No se puede pasar de "${actual}" con esta acción` });
    }

    const lostRace = () => done(409, { error: 'La cotización cambió mientras se procesaba. Recarga e intenta de nuevo.' });

    // Aprobación interna (lib/quote-approval.ts): la misma evaluación que al
    // crear. Sin esto, un borrador "pendiente de aprobación" se reabría en el
    // editor y Enviar lo mandaba al cliente; una V2 tampoco se revisaba.
    const sending = input.action === 'send' || input.action === 'resend';
    const policy = sending ? await approvalPolicyFor(orgId) : null;
    const aprobEstado = (rows[0].aprob_estado as string | null) ?? null;
    let sale = {
        baseCurrency: String(rows[0].base_currency || ''),
        fiscalCurrency: String(rows[0].fiscal_currency || rows[0].base_currency || ''),
        fxRate: Number(rows[0].fx_rate),
    };
    const storedVerdict = async () => {
        const [stored] = await withOrgTx(orgId, sql`
            select ci.precio_unitario, ci.precio_negociado, ci.costo_unitario
              from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id
             where ci.cotizacion_id = ${id} and c.org_id = ${orgId}`);
        return evaluateApproval(stored, await totalForPolicy(Number(rows[0].total) || 0, policy, sale), policy);
    };
    // El estado se revalida DENTRO de la transacción que reescribe la
    // cotización: entre la lectura de arriba y la escritura, el cliente pudo
    // aprobarla y el vendedor habría pisado líneas y totales de una
    // cotización ya aprobada. Si el estado cambió, la división entre cero
    // aborta la transacción completa.
    const stateGuard: DbQuery[] = [];
    stateGuard.push(
        sql`select id from cotizaciones where id = ${id} and org_id = ${orgId} for update`,
        sql`select 1 / (select count(*)::int from cotizaciones
                         where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[])) as guard`,
    );
    const isStale = (error: unknown) => String((error as any)?.code) === '22012' || /division by zero/i.test(String((error as any)?.message));
    const requestApproval = async (motivo: string, extraWrites: DbQuery[] = []) => {
        try {
            await withOrgTx(orgId, ...stateGuard, ...extraWrites,
                sql`update cotizaciones set aprob_estado = 'pendiente', aprob_motivo = ${motivo}
                     where id = ${id} and org_id = ${orgId}`,
                sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
                    values (${orgId}, ${id}, 'comment', ${'Solicitud de aprobación: ' + motivo})`);
        } catch (error) {
            if (isStale(error)) return lostRace();
            throw error;
        }
        await audit('cotizacion.aprobacion_solicitada', motivo);
        after(dispatchQuoteEvent(orgId, id, 'quote.approval_requested', { motivo }));
        return done(200, { ok: true, status: 'draft', needsApproval: true, motivo });
    };

    if (['resend', 'update_draft', 'send'].includes(input.action) && Array.isArray(input.items)) {
        if (input.items.length > MAX_ITEMS) return done(400, { error: `Demasiadas líneas (máximo ${MAX_ITEMS}).` });
        const rawItems = input.items;
        const iva_incluido = Boolean(input.iva_incluido);

        let catalogo;
        try {
            const [storedRates] = await withOrgTx(orgId, sql`
                select distinct ci.tax_rate from cotizacion_items ci join cotizaciones c on c.id = ci.cotizacion_id
                 where ci.cotizacion_id = ${id} and c.org_id = ${orgId} and ci.tax_rate is not null`);
            catalogo = withStoredRates(await taxCatalogFor(orgId), storedRates.map((r: any) => r.tax_rate));
        } catch (error) {
            if (error instanceof TaxCatalogUnavailableError) return done(503, { error: error.message, code: 'tax_catalog_unavailable' });
            throw error;
        }
        const tasaDesconocida = unknownTaxRate(catalogo, rawItems.map((raw: any) => raw?.tax_rate));
        if (tasaDesconocida !== null) return done(400, { error: unknownTaxRateMessage(tasaDesconocida), code: 'unknown_tax_rate' });
        const items = rawItems.map((raw: any, i: number) => ({
            ...sanitizeItem(raw),
            tax_rate: catalogo.resolve(rawItems[i]?.tax_rate, catalogo.defaultRate),
        }));
        const totals = calculateDocumentTotals(items as any[], {
            ivaIncluido: iva_incluido,
            retenciones: catalogo.retenciones,
        });
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
            // Mismas reglas que al crear: términos de una lista cerrada y
            // vigencia acotada. Antes cualquier texto se guardaba como término
            // y una vigencia negativa dejaba la cotización ya vencida.
            const vigDias = vigenciaDias(input.vigencia_dias);
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
            sale = { baseCurrency, fiscalCurrency, fxRate };

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
                        version = ${nextVersion}, iva_incluido = ${iva_incluido},
                        anticipo_pct = ${anticipoPct}, es_recurrente = ${esRecurrente}
                      where id = ${id} and org_id = ${orgId}`);
        } else {
            // Una versión nueva es una propuesta nueva: su vigencia vuelve a
            // correr con la MISMA duración con la que se envió la primera
            // (vigencia − fecha de creación). Sin esto, reenviar una
            // cotización vencida la dejaba "enviada" con la fecha vieja y el
            // cron la volvía a marcar vencida esa misma noche.
            const renew = input.action === 'resend';
            writes.push(sql`update cotizaciones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total},
                        retencion_total = ${retencionTotal}, retenciones_snapshot = ${retencionesSnapshot}::jsonb,
                        version = ${nextVersion}, iva_incluido = ${iva_incluido},
                        vigencia = case when ${renew}
                            then (current_date + (greatest(1, coalesce(vigencia - created_at::date, 30)) * interval '1 day'))::date
                            else vigencia end
                      where id = ${id} and org_id = ${orgId}`);
        }

        const productosPropios = await productosDeOrg(orgId, items.map((it: any) => it.producto_id));
        writes.push(sql`delete from cotizacion_items where cotizacion_id = ${id}`);
        items.forEach((it: any, orden: number) => {
            writes.push(sql`insert into cotizacion_items (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, costo_unitario, orden, tax_rate)
                      values (${id}, ${it.producto_id && productosPropios.has(it.producto_id) ? it.producto_id : null}, ${it.descripcion}, ${Number(it.cantidad) || 1}, ${Number(it.precio_unitario) || 0}, ${it.precio_negociado === null || it.precio_negociado === undefined ? null : Number(it.precio_negociado)}, ${Number(it.costo_unitario) || 0}, ${orden}, ${it.tax_rate})`);
        });

        if (input.action === 'resend') {
            writes.push(sql`insert into cotizacion_versiones (cotizacion_id, org_id, version, subtotal, iva, total, items, notas, iva_incluido)
                      values (${id}, ${orgId}, ${nextVersion}, ${realSubtotal}, ${iva}, ${total}, ${JSON.stringify(items)}, null, ${iva_incluido})`);
            writes.push(sql`insert into eventos (org_id, cotizacion_id, tipo, detalle) values (${orgId}, ${id}, 'comment', ${'Versión ' + nextVersion + ' creada'})`);
        } else {
            writes.push(sql`update cotizacion_versiones set subtotal = ${realSubtotal}, iva = ${iva}, total = ${total}, items = ${JSON.stringify(items)}, iva_incluido = ${iva_incluido} where cotizacion_id = ${id} and version = ${nextVersion}`);
        }
        if (policy) {
            const verdict = evaluateApproval(items, await totalForPolicy(total, policy, sale), policy);
            if (verdict.needed && input.action === 'send') {
                // El borrador se guarda con lo que el vendedor capturó y queda
                // esperando a gerencia, igual que al crear con "Enviar".
                return requestApproval(approvalMotivo(verdict, policy.currency), writes);
            }
            if (verdict.needed && input.action === 'resend'
                && !(aprobEstado === 'aprobada' && notWorseThanApproved(verdict, await storedVerdict()))) {
                return done(409, {
                    error: `Esta versión necesita aprobación: ${approvalMotivo(verdict, policy.currency)}. Ajústala o pide a quien aprueba que la revise.`,
                    code: 'approval_required',
                });
            }
        }
        if (input.action === 'send' && aprobEstado === 'pendiente') {
            // Ya no rebasa ningún tope (o el plan dejó de incluir aprobaciones):
            // la solicitud anterior deja de aplicar.
            writes.push(sql`update cotizaciones set aprob_estado = null, aprob_motivo = null where id = ${id} and org_id = ${orgId}`);
        }
        try {
            await withOrgTx(orgId, ...stateGuard, ...writes);
        } catch (error) {
            if (isStale(error)) return lostRace();
            throw error;
        }
    } else if (input.action === 'send') {
        // Envío sin líneas nuevas (API, MCP, Slack): se evalúa lo guardado.
        if (aprobEstado === 'pendiente' && policy) {
            return done(409, { error: 'Esta cotización espera aprobación. Quien aprueba la enviará al decidir.', code: 'approval_pending' });
        }
        if (policy) {
            const verdict = await storedVerdict();
            if (verdict.needed) return requestApproval(approvalMotivo(verdict, policy.currency));
        }
        if (aprobEstado === 'pendiente') {
            // Sin topes vigentes (el plan dejó de incluir aprobaciones o se
            // pusieron en 0): la solicitud ya no aplica. Si se quedara pendiente,
            // aprobarla después mandaría un segundo correo al cliente.
            await withOrgTx(orgId, sql`update cotizaciones set aprob_estado = null, aprob_motivo = null
                                        where id = ${id} and org_id = ${orgId} and status = 'draft'`);
        }
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
        const [moved] = await withOrgTx(orgId, sql`update cotizaciones set status = 'approved', approved_at = ${now} where id = ${id} and org_id = ${orgId} and status = any(${action.from}::text[]) returning id`);
        if (!moved.length) return lostRace();
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
