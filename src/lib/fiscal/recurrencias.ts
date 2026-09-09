// Facturas recurrentes.
//
// La recurrencia solo existía como iguala DE COTIZACIÓN
// (`cotizacion_suscripciones`): el cliente autorizaba un cargo mensual sobre el
// link de la propuesta. Eso resuelve un retainer que se vende una vez; no
// resuelve un negocio que factura lo mismo cada mes a treinta clientes, que
// tenía que volver a capturar cada factura a mano.
//
// Una recurrencia describe QUÉ se factura. Cada emisión congela sus propios
// importes, impuestos y folio: cambiar un precio del catálogo no reescribe lo
// ya emitido.

import { sql, withOrgTx, withSystemTx } from '../db';
import { createInvoiceDraft, finalizeInvoice, type DraftLineInput } from './invoices';
import { notifyInvoiceIssued } from '../email';
import { logInvoiceEvent } from './timeline';
import { checkEntitlement } from '../org-entitlements';
import { venceDia } from '../cobros';

import { recurrenceDay, proximaEmision, type Cadencia } from './recurrence-calendar';
import { reserveUsage, cancelUsage, flushUsageReservation } from '../billing';
export { proximaEmision, type Cadencia } from './recurrence-calendar';

export interface RecurrenciaInput {
    clienteId: string;
    nombre: string;
    /** Misma forma que las líneas del editor de facturas: se guardan tal cual. */
    lineas: DraftLineInput[];
    currency: string;
    cadencia: Cadencia;
    diaMes: number;
    diasCredito: number;
    notas?: string | null;
    primeraEmision?: string | null;
    endDate?: string | null;
    autopay?: boolean;
}

export async function createRecurrencia(orgId: string, input: RecurrenciaInput, createdBy?: string | null) {
    const gate = await checkEntitlement(orgId, 'recurring_invoices');
    if (!gate.ok) return { ok: false as const, error: 'Tu plan no incluye facturas recurrentes.' };

    const lineas = (input.lineas || []).filter((l) => l && String(l.descripcion || '').trim());
    if (!lineas.length) return { ok: false as const, error: 'La recurrencia necesita al menos un concepto.' };
    if (!input.clienteId) return { ok: false as const, error: 'La recurrencia necesita un cliente.' };

    const dia = Math.min(28, Math.max(1, Math.round(input.diaMes) || 1));
    let primera: string;
    let endDate: string | null;
    try {
        primera = input.primeraEmision ? recurrenceDay(input.primeraEmision) : recurrenceDay(proximaEmision(new Date(), input.cadencia, dia));
        endDate = input.endDate ? recurrenceDay(input.endDate) : null;
        if (endDate && endDate < primera) return { ok: false as const, error: 'La fecha final no puede ser anterior a la primera emisión.' };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Fecha inválida.' }; }
    if (lineas.some(l => !Number.isFinite(l.cantidad) || l.cantidad <= 0 || !Number.isFinite(l.precioUnitario) || l.precioUnitario < 0)) {
        return { ok: false as const, error: 'Los conceptos necesitan cantidad y precio válidos.' };
    }

    const [[row]] = await withOrgTx(orgId, sql`
        insert into documento_recurrencias
            (org_id, cliente_id, nombre, lineas_snapshot, currency, notas,
             cadencia, dia_mes, dias_credito, next_run_at, end_date, autopay, created_by)
        select
            ${orgId}, ${input.clienteId}, ${input.nombre.slice(0, 120)},
             ${JSON.stringify(lineas)}::jsonb, ${input.currency}, ${input.notas || null},
             ${input.cadencia}, ${dia}, ${Math.max(0, Math.round(input.diasCredito) || 0)},
             ${primera}, ${endDate},
             ${!!input.autopay}, ${createdBy || null}
        from clientes where id = ${input.clienteId} and org_id = ${orgId}
        returning id`);

    return row ? { ok: true as const, id: String(row.id) } : { ok: false as const, error: 'No se pudo crear la recurrencia.' };
}

export interface RunResult {
    revisadas: number;
    emitidas: number;
    enviadas: number;
    fallidas: number;
    detalle: Array<{ recurrenciaId: string; ok: boolean; error?: string }>;
}

/**
 * Emite las recurrencias que ya tocan.
 *
 * Contrato de seguridad y de dinero:
 *   · El gate de plan se evalúa POR ORGANIZACIÓN en cada corrida, no al crear.
 *     Un downgrade deja la recurrencia inoperante sin borrarla (regla 17).
 *   · `next_run_at` avanza aunque la emisión falle. Sin eso, una recurrencia
 *     rota se reintenta cada hora para siempre y llena la bandeja del cliente
 *     con el mismo error; el error queda en `ultimo_error` para que se vea.
 *   · Las sandbox no emiten: son espejo de datos, no de dinero.
 */
export async function runRecurrencias(opts: { limit?: number } = {}): Promise<RunResult> {
    const out: RunResult = { revisadas: 0, emitidas: 0, enviadas: 0, fallidas: 0, detalle: [] };
    const limite = Math.min(500, Math.max(1, Math.floor(opts.limit || 200)));

    const pendientes = await withSystemTx(sql`
        select r.id, r.org_id, r.cliente_id, r.lineas_snapshot, r.currency, r.notas,
               r.cadencia, r.dia_mes, r.dias_credito, r.next_run_at, r.end_date, r.autopay,
               r.updated_at::text as updated_at, o.country_code as org_country_code
          from documento_recurrencias r
          join orgs o on o.id = r.org_id
         where r.activa
           and r.next_run_at <= current_date
           and (r.end_date is null or r.end_date >= current_date)
           and o.sandbox_of is null
         order by r.next_run_at asc
         limit ${limite}`);

    for (const r of pendientes[0] ?? []) {
        out.revisadas++;
        const orgId = String(r.org_id);
        const recId = String(r.id);

        let usageId: string | null = null;
        let emissionConfirmed = false;
        try {
            const period = recurrenceDay(venceDia(r.next_run_at));
            const siguiente = proximaEmision(new Date(`${period}T00:00:00Z`), String(r.cadencia) as Cadencia, Number(r.dia_mes));
            // Solo quien cambia esta fecha puede emitir este periodo. Una pausa o
            // edición posterior al barrido invalida el claim y se respeta.
            const [claimed] = await withOrgTx(orgId, sql`
                update documento_recurrencias r
                   set next_run_at = ${recurrenceDay(siguiente)}, updated_at = now()
                 where r.id = ${recId} and r.org_id = ${orgId} and r.activa
                   and r.next_run_at = ${period}::date and r.next_run_at <= current_date
                   and r.updated_at = ${r.updated_at}::timestamptz
                   and (r.end_date is null or r.end_date >= current_date)
                   and exists (select 1 from orgs o where o.id = r.org_id and o.sandbox_of is null)
                 returning r.id`);
            if (!claimed.length) continue;
            const gate = await checkEntitlement(orgId, 'recurring_invoices');
            if (!gate.ok) throw new Error('Plan sin facturas recurrentes');
            const vence = new Date(`${period}T00:00:00Z`);
            vence.setUTCDate(vence.getUTCDate() + (Number(r.dias_credito) || 0));

            const draft = await createInvoiceDraft(orgId, {
                clienteId: String(r.cliente_id),
                items: (Array.isArray(r.lineas_snapshot) ? r.lineas_snapshot : []) as DraftLineInput[],
                currency: String(r.currency),
                dueDate: vence.toISOString().slice(0, 10),
                notes: (r.notas as string) || null,
            });

            if (!draft.ok || !draft.documentId) {
                await marcarError(orgId, recId, draft.error || 'No se pudo crear el borrador');
                out.fallidas++;
                out.detalle.push({ recurrenciaId: recId, ok: false, error: draft.error });
                continue;
            }

            await withOrgTx(orgId, sql`
                update documentos_fiscales set recurrencia_id = ${recId}
                 where id = ${draft.documentId} and org_id = ${orgId}`);

            if (String(r.org_country_code).toUpperCase() === 'MX') {
                const usage = await reserveUsage(orgId, 'timbrado', 1);
                if (!usage.ok || !usage.id) throw new Error(usage.reason || 'No se pudo reservar el timbrado.');
                usageId = usage.id;
            }
            const emitida = await finalizeInvoice(orgId, draft.documentId);
            if (!emitida.emitted) {
                if (usageId) { await cancelUsage(orgId, usageId); usageId = null; }
                await marcarError(orgId, recId, emitida.error || 'No se pudo emitir');
                out.fallidas++;
                out.detalle.push({ recurrenciaId: recId, ok: false, error: emitida.error });
                continue;
            }

            emissionConfirmed = true;
            if (usageId) {
                if (emitida.reused || emitida.billable === false) await cancelUsage(orgId, usageId);
                else await flushUsageReservation(orgId, usageId);
                usageId = null;
            }
            out.emitidas++;
            await logInvoiceEvent(orgId, draft.documentId, 'issued', 'Emitida por recurrencia');

            // El envío es best-effort: la factura YA existe y es válida. Que el
            // correo no salga no puede revertir una emisión con folio fiscal.
            const enviada = await notifyInvoiceIssued(orgId, draft.documentId);
            if (enviada) {
                out.enviadas++;
                await withOrgTx(orgId, sql`
                    update documentos_fiscales set sent_at = now() where id = ${draft.documentId} and org_id = ${orgId}`);
                await logInvoiceEvent(orgId, draft.documentId, 'sent', 'Enviada automáticamente');
            }

            await withOrgTx(orgId, sql`
                update documento_recurrencias set ultimo_error = ${enviada ? null : 'Factura emitida; falta reenviar el correo desde su detalle.'}, ultima_emision_at = now(), updated_at = now()
                 where id = ${recId} and org_id = ${orgId}`);
            out.detalle.push({ recurrenciaId: recId, ok: true, ...(!enviada ? { error: 'correo_no_enviado' } : {}) });
        } catch (error: any) {
            if (usageId && !emissionConfirmed) await cancelUsage(orgId, usageId).catch(() => {});
            await marcarError(orgId, recId, error?.message || 'Error inesperado');
            out.fallidas++;
            out.detalle.push({ recurrenciaId: recId, ok: false, error: error?.message });
        }
    }

    return out;
}

async function marcarError(orgId: string, recId: string, mensaje: string): Promise<void> {
    try {
        await withOrgTx(orgId, sql`
            update documento_recurrencias
               set ultimo_error = ${String(mensaje).slice(0, 300)}, updated_at = now()
             where id = ${recId} and org_id = ${orgId}`);
    } catch { /* informativo */ }
}
