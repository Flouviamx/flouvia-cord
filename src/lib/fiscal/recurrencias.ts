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

export type Cadencia = 'mensual' | 'trimestral' | 'anual';

const MESES_POR_CADENCIA: Record<Cadencia, number> = {
    mensual: 1, trimestral: 3, anual: 12,
};

/**
 * Siguiente fecha de emisión.
 *
 * `diaMes` está topado en 28 por el CHECK de la tabla, y no por casualidad: un
 * "31" se salta febrero, y una factura que no se emite no se cobra. Aquí se
 * vuelve a topar por si el dato llegó de una migración anterior.
 */
export function proximaEmision(desde: Date, cadencia: Cadencia, diaMes: number): Date {
    const meses = MESES_POR_CADENCIA[cadencia] ?? 1;
    const dia = Math.min(28, Math.max(1, Math.round(diaMes) || 1));
    // Se construye en UTC: `setMonth` sobre una fecha local cruza el cambio de
    // día según la zona del servidor, y eso movería la emisión un día entero.
    const next = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + meses, dia));
    return next;
}

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
    const primera = input.primeraEmision
        ? new Date(`${input.primeraEmision}T00:00:00Z`)
        : proximaEmision(new Date(), input.cadencia, dia);

    const [[row]] = await withOrgTx(orgId, sql`
        insert into documento_recurrencias
            (org_id, cliente_id, nombre, lineas_snapshot, currency, notas,
             cadencia, dia_mes, dias_credito, next_run_at, end_date, autopay, created_by)
        values
            (${orgId}, ${input.clienteId}, ${input.nombre.slice(0, 120)},
             ${JSON.stringify(lineas)}::jsonb, ${input.currency}, ${input.notas || null},
             ${input.cadencia}, ${dia}, ${Math.max(0, Math.round(input.diasCredito) || 0)},
             ${primera.toISOString().slice(0, 10)}, ${input.endDate || null},
             ${!!input.autopay}, ${createdBy || null})
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
    const limite = Math.min(opts.limit ?? 200, 500);

    const pendientes = await withSystemTx(sql`
        select r.id, r.org_id, r.cliente_id, r.lineas_snapshot, r.currency, r.notas,
               r.cadencia, r.dia_mes, r.dias_credito, r.next_run_at, r.end_date, r.autopay
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

        // Se avanza la fecha ANTES de emitir. Al revés, un fallo a medio camino
        // deja la recurrencia elegible otra vez en la siguiente corrida y el
        // cliente recibe la misma factura dos veces — que en cobranza es la
        // queja más cara que existe.
        const siguiente = proximaEmision(
            new Date(`${String(r.next_run_at).slice(0, 10)}T00:00:00Z`),
            String(r.cadencia) as Cadencia,
            Number(r.dia_mes),
        );
        await withOrgTx(orgId, sql`
            update documento_recurrencias
               set next_run_at = ${siguiente.toISOString().slice(0, 10)},
                   ultima_emision_at = now(), updated_at = now()
             where id = ${recId} and org_id = ${orgId}`);

        const gate = await checkEntitlement(orgId, 'recurring_invoices');
        if (!gate.ok) {
            await marcarError(orgId, recId, 'Plan sin facturas recurrentes');
            out.fallidas++;
            out.detalle.push({ recurrenciaId: recId, ok: false, error: 'plan' });
            continue;
        }

        try {
            const vence = new Date(`${String(r.next_run_at).slice(0, 10)}T00:00:00Z`);
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

            const emitida = await finalizeInvoice(orgId, draft.documentId);
            if (!emitida.emitted) {
                await marcarError(orgId, recId, emitida.error || 'No se pudo emitir');
                out.fallidas++;
                out.detalle.push({ recurrenciaId: recId, ok: false, error: emitida.error });
                continue;
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
                update documento_recurrencias set ultimo_error = null, updated_at = now()
                 where id = ${recId} and org_id = ${orgId}`);
            out.detalle.push({ recurrenciaId: recId, ok: true });
        } catch (error: any) {
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
