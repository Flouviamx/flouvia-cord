// Sales tax de EE. UU.: la cuota mensual de ventas registradas.
//
// Lo que le cuesta a Cord es la VENTA registrada (Tax Transaction: USD 0.50 en
// el proveedor, solo en estados donde el negocio recauda: una venta cuyas
// líneas son todas "sin obligación de recaudar" no cuenta, ver
// `usTaxVentaCobrable` en core.ts). Decisión de André (oct
// 2026): se cobra como los timbres de CFDI, con su propio contador
// (`uso_periodo.us_tax`) y su propio precio — cuota incluida por plan
// (`INCLUDED.us_tax` en src/lib/billing.ts) y excedente medido (USD 0.75,
// MXN 15.00, EUR 0.70) cuando su meter existe. Sin meter configurado, lo
// incluido es tope duro: pasado eso, la operación se rechaza y lo dice
// (fallo cerrado; `overageBillable()`).
//
// Dos puntos de control, con trabajos distintos:
//
//   1. `assertUsTaxCuota()` — ANTES de guardar o enviar un documento con sales
//      tax automático (y en la vista previa del editor). No reserva nada: un
//      documento puede no venderse nunca. Le dice al dueño del negocio, cuando
//      todavía puede decidir, que llegó a su cuota: mejora el plan o captura la
//      tasa a mano.
//   2. `reservarUsoTransaccion()` — ANTES de registrar la venta con el
//      proveedor (`recordUsTaxTransaction`). Reserva 1 unidad con la reserva
//      diferida de Billing (`deferMeter`): si el registro falla se libera
//      (`liberarUsoTransaccion`), si sale bien se confirma y el excedente va al
//      meter por el outbox (`confirmarUsoTransaccion`). La reserva queda ligada
//      al cálculo (`us_tax_calculos.uso_id`): un reintento, o dos procesos a la
//      vez sobre la misma venta, la reusan en vez de contar dos veces.
//
// El reverso de una venta (factura anulada) NO devuelve la unidad: el
// proveedor ya cobró el registro original. Tampoco consume otra.

import { sql, withOrgTx } from '../db';
import { getEntitlementContext } from '../org-entitlements';
import { log } from '../log';
import {
    cancelUsage, commitUsTaxUsage, flushUsageReservation, reserveUsage, usageLimitFor,
} from '../billing';
import { UsTaxError } from './core';

export interface UsTaxCuota {
    /** Ventas incluidas al mes en el plan efectivo. */
    incluido: number;
    /** Ventas registradas (o en registro) este mes, UTC. */
    usado: number;
    /** A partir de cuántas se rechaza: lo incluido sin excedente, 10× con él. */
    techo: number;
    /** ¿Se cobra hoy el excedente? (contrato del plan + meter configurado). */
    excedente: boolean;
    agotada: boolean;
}

const periodoActual = () => new Date().toISOString().slice(0, 7);

/** Lectura sin reservar, para la pre-verificación y la UI. */
export async function usTaxCuota(orgId: string): Promise<UsTaxCuota> {
    const plan = (await getEntitlementContext(orgId)).effectivePlan;
    const limite = usageLimitFor(plan, 'us_tax');
    const [[row]] = await withOrgTx(orgId, sql`
        select us_tax from uso_periodo where org_id = ${orgId} and periodo = ${periodoActual()}`);
    const usado = Number(row?.us_tax ?? 0);
    const incluido = limite.included ?? 0;
    return { incluido, usado, techo: limite.ceiling, excedente: limite.overage, agotada: usado >= limite.ceiling };
}

/**
 * Falla cerrado si la organización ya no puede registrar otra venta este mes.
 * Sin poder leer la cuota tampoco se deja pasar: el documento no se guarda y
 * dice que reintente (`no_disponible`), nunca se asume que hay cupo.
 */
export async function assertUsTaxCuota(orgId: string, locale: string): Promise<void> {
    let cuota: UsTaxCuota;
    try {
        cuota = await usTaxCuota(orgId);
    } catch (error) {
        log.error('us-tax: no se pudo leer la cuota', { orgId, route: 'us-tax/cuota', err: error });
        throw new UsTaxError('no_disponible', locale, error);
    }
    if (!cuota.agotada) return;
    throw cuota.excedente
        ? new UsTaxError('cuota_techo', locale)
        : new UsTaxError('cuota', locale, undefined, { n: cuota.incluido });
}

export type ReservaTransaccion = { ok: true; id: string } | { ok: false; motivo: 'cuota' | 'no_disponible' };

/**
 * Reserva la unidad de ESTE registro, o reusa la que ya tiene (un intento
 * anterior que murió, o un proceso concurrente sobre la misma venta). Una
 * reserva cancelada (el intento anterior falló y la liberó) se reemplaza.
 */
export async function reservarUsoTransaccion(orgId: string, calculoId: string): Promise<ReservaTransaccion> {
    try {
        const previa = await usoVigente(orgId, calculoId);
        if (previa.vigente) return { ok: true, id: previa.vigente };

        const reserva = await reserveUsage(orgId, 'us_tax', 1, { deferMeter: true });
        if (!reserva.ok || !reserva.id) return { ok: false, motivo: reserva.code === 'limit' ? 'cuota' : 'no_disponible' };

        // La reserva se liga al cálculo solo si nadie se adelantó. Si otro
        // proceso ya ligó la suya, esta se libera y se usa aquella: una venta,
        // una unidad.
        const [ligada] = await withOrgTx(orgId, sql`
            update us_tax_calculos set uso_id = ${reserva.id}::uuid
             where id = ${calculoId}::uuid and org_id = ${orgId}
               and (uso_id is null or uso_id = ${previa.cancelada}::uuid)
            returning id`);
        if (ligada.length) return { ok: true, id: reserva.id };
        await cancelUsage(orgId, reserva.id);
        const otra = await usoVigente(orgId, calculoId);
        return otra.vigente ? { ok: true, id: otra.vigente } : { ok: false, motivo: 'no_disponible' };
    } catch (error) {
        log.error('us-tax: no se pudo reservar la cuota de la venta', { orgId, route: 'us-tax/cuota', err: error });
        return { ok: false, motivo: 'no_disponible' };
    }
}

async function usoVigente(orgId: string, calculoId: string): Promise<{ vigente: string | null; cancelada: string | null }> {
    const [[row]] = await withOrgTx(orgId, sql`
        select c.uso_id, u.status from us_tax_calculos c
          left join usage_reservations u on u.id = c.uso_id and u.org_id = c.org_id
         where c.id = ${calculoId}::uuid and c.org_id = ${orgId}`);
    if (!row?.uso_id) return { vigente: null, cancelada: null };
    const id = String(row.uso_id);
    return row.status && row.status !== 'canceled' ? { vigente: id, cancelada: null } : { vigente: null, cancelada: id };
}

/** El proveedor registró la venta: se confirma y el excedente sale al outbox. */
export async function confirmarUsoTransaccion(orgId: string, usoId: string): Promise<void> {
    try {
        await commitUsTaxUsage(orgId, usoId);
        await flushUsageReservation(orgId, usoId);
    } catch (error) {
        // La venta YA está registrada: no se deshace. La reconciliación de
        // Billing confirma la reserva que quedó pendiente (flushPendingUsage).
        log.error('us-tax: no se pudo confirmar la cuota de una venta registrada', { orgId, route: 'us-tax/cuota', err: error });
    }
}

/**
 * El registro falló: se libera la unidad, salvo que mientras tanto otro
 * proceso SÍ haya registrado la venta con esta misma reserva.
 */
export async function liberarUsoTransaccion(orgId: string, calculoId: string, usoId: string): Promise<void> {
    try {
        const [[row]] = await withOrgTx(orgId, sql`
            select transaccion_id from us_tax_calculos where id = ${calculoId}::uuid and org_id = ${orgId}`);
        if (row?.transaccion_id) return;
        await cancelUsage(orgId, usoId);
    } catch (error) {
        log.error('us-tax: no se pudo liberar la cuota de un registro fallido', { orgId, route: 'us-tax/cuota', err: error });
    }
}

/**
 * Ventas que esperan cupo para registrarse (la UI de Plan lo dice): un cálculo
 * sin registrar por falta de cuota que todavía respalda una factura emitida o
 * una cotización cobrada. El barrido de us-tax las registra solas en cuanto
 * hay cupo (mes nuevo, mejor plan o excedente habilitado).
 */
export async function usTaxVentasSinCuota(orgId: string): Promise<number> {
    const [[row]] = await withOrgTx(orgId, sql`
        select count(*)::int as n from us_tax_calculos c
         where c.org_id = ${orgId} and c.transaccion_id is null and c.transaccion_error = 'cuota'
           and (exists (select 1 from documentos_fiscales d
                         where d.org_id = c.org_id and d.us_tax_calculo_id = c.id
                           and d.status = 'issued' and d.lifecycle not in ('draft', 'void'))
                or exists (select 1 from cotizaciones q
                            where q.org_id = c.org_id and q.us_tax_calculo_id = c.id
                              and (q.status = 'paid' or q.paid_at is not null)))`);
    return Number(row?.n ?? 0);
}
