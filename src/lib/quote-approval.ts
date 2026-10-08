// Aprobación interna de una cotización: ¿el descuento, el monto o el margen
// rebasan los topes que el negocio fijó en Ajustes › Aprobaciones?
//
// Vivía solo dentro de `createCotizacion`, así que la regla aplicaba al CREAR y
// a nada más: un borrador con 40% de descuento quedaba "pendiente", se reabría
// en el editor y el botón Enviar lo mandaba al cliente sin que nadie lo
// aprobara; una V2 reenviada con más descuento tampoco pasaba por aquí. Ahora
// crear, enviar un borrador y reenviar una versión evalúan con la misma función.

import { sql, withOrgTx } from './db';
import { checkEntitlement } from './org-entitlements';
import { normalizeCurrency } from './currency';
import { intlLocale } from './fmt-server';
import { FXService } from './fx/FXService';

export interface ApprovalPolicy {
    descuentoMax: number;
    montoMax: number;
    margenMin: number;
    /** Divisa en la que el negocio capturó el tope de monto: la suya (`orgs.moneda`). */
    currency: string;
}

export interface ApprovalLine {
    precio_unitario?: unknown;
    precio_negociado?: unknown;
    costo_unitario?: unknown;
}

export interface ApprovalReason {
    kind: 'descuento' | 'monto' | 'margen';
    actual: number;
    limite: number;
}

export interface ApprovalVerdict {
    needed: boolean;
    reasons: ApprovalReason[];
}

/** Topes de una fila de `orgs`, o `null` si no hay ninguno configurado. */
export function policyFromOrg(org: Record<string, unknown>): ApprovalPolicy | null {
    const policy = {
        descuentoMax: Number(org.aprob_descuento_max) || 0,
        montoMax: Number(org.aprob_monto_max) || 0,
        margenMin: Number(org.aprob_margen_min) || 0,
        currency: normalizeCurrency(org.moneda as string),
    };
    return policy.descuentoMax > 0 || policy.montoMax > 0 || policy.margenMin > 0 ? policy : null;
}

/** Topes vigentes, o `null` si el plan no incluye aprobaciones (regla 17). */
export async function approvalPolicyFor(orgId: string): Promise<ApprovalPolicy | null> {
    if (!(await checkEntitlement(orgId, 'approvals')).ok) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select aprob_descuento_max, aprob_monto_max, aprob_margen_min, moneda
          from orgs where id = ${orgId} limit 1`);
    return rows[0] ? policyFromOrg(rows[0]) : null;
}

/**
 * Total de la cotización expresado en la divisa del tope.
 *
 * El tope se captura en la divisa del negocio y la cotización puede venderse en
 * otra: comparar USD 3,000 contra un tope de MXN 50,000 dejaba pasar ventas de
 * un millón de pesos. Se convierte con la tasa congelada de la propia
 * cotización (venta → contable, multiplica). Si no hay forma de expresarlo en
 * la divisa del tope, devuelve `null` y el llamador falla cerrado: pide
 * aprobación en vez de inventar una tasa (regla 22).
 */
export function totalInPolicyCurrency(
    total: number,
    policyCurrency: string,
    sale: { baseCurrency: string; fiscalCurrency: string; fxRate: number },
): number | null {
    const policy = normalizeCurrency(policyCurrency);
    if (normalizeCurrency(sale.baseCurrency) === policy) return total;
    if (normalizeCurrency(sale.fiscalCurrency) === policy && Number.isFinite(sale.fxRate) && sale.fxRate > 0) {
        return total * sale.fxRate;
    }
    return null;
}

/**
 * `totalInPolicyCurrency`, y si la cotización no trae una tasa que llegue a la
 * divisa del tope (una venta en USD cuya divisa contable también es USD, como
 * las crea la API), se pide la tasa de hoy. Sin tasa se devuelve `null` y la
 * evaluación pide aprobación: fallar cerrado, pero solo cuando de verdad no
 * hay con qué comparar.
 */
export async function totalForPolicy(
    total: number,
    policy: ApprovalPolicy | null,
    sale: { baseCurrency: string; fiscalCurrency: string; fxRate: number },
): Promise<number | null> {
    if (!policy) return null;
    const direct = totalInPolicyCurrency(total, policy.currency, sale);
    if (direct !== null || policy.montoMax <= 0) return direct;
    try {
        const fx = await FXService.getExchangeRate({
            baseCurrency: normalizeCurrency(sale.baseCurrency), fiscalCurrency: policy.currency, amount: total, bufferPct: 0,
        });
        const rate = Number(fx?.appliedRate);
        return Number.isFinite(rate) && rate > 0 ? total * rate : null;
    } catch {
        return null;
    }
}

export function evaluateApproval(
    items: ApprovalLine[],
    totalInPolicy: number | null,
    policy: ApprovalPolicy | null,
): ApprovalVerdict {
    if (!policy) return { needed: false, reasons: [] };

    let maxDescPct = 0;
    let minMargenPct = Infinity;
    for (const it of items) {
        const lista = Number(it.precio_unitario) || 0;
        const negoRaw = it.precio_negociado;
        const nego = negoRaw === null || negoRaw === undefined || negoRaw === '' ? null : Number(negoRaw);
        if (nego !== null && Number.isFinite(nego) && lista > 0 && nego < lista) {
            maxDescPct = Math.max(maxDescPct, (1 - nego / lista) * 100);
        }
        const costo = Number(it.costo_unitario) || 0;
        const precioFinal = nego !== null && Number.isFinite(nego) ? nego : lista;
        if (costo > 0 && precioFinal > 0) {
            minMargenPct = Math.min(minMargenPct, (precioFinal - costo) / precioFinal * 100);
        }
    }

    const reasons: ApprovalReason[] = [];
    if (policy.descuentoMax > 0 && maxDescPct > policy.descuentoMax) {
        reasons.push({ kind: 'descuento', actual: maxDescPct, limite: policy.descuentoMax });
    }
    if (policy.montoMax > 0 && (totalInPolicy === null || totalInPolicy > policy.montoMax)) {
        reasons.push({ kind: 'monto', actual: totalInPolicy ?? NaN, limite: policy.montoMax });
    }
    if (policy.margenMin > 0 && Number.isFinite(minMargenPct) && minMargenPct < policy.margenMin) {
        reasons.push({ kind: 'margen', actual: minMargenPct, limite: policy.margenMin });
    }
    return { needed: reasons.length > 0, reasons };
}

// El motivo lo lee el aprobador: tope y total con la divisa del tope, no con
// un '$' que puede significar otra cosa, y con los separadores de su idioma
// (el locale sale del request; un 'es-MX' fijo le escribía "1.000,00" a un
// aprobador en Londres).
function amount(n: number, currency: string): string {
    const locale = intlLocale();
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: normalizeCurrency(currency), maximumFractionDigits: 0 })
            .format(Math.round(n));
    } catch {
        return new Intl.NumberFormat(locale).format(Math.round(n));
    }
}

/** Motivo legible para quien aprueba. */
export function approvalMotivo(verdict: ApprovalVerdict, currency: string): string {
    return verdict.reasons.map((r) => {
        if (r.kind === 'descuento') return `descuento ${Math.round(r.actual)}% supera el ${r.limite}% permitido`;
        if (r.kind === 'margen') return `margen bruto ${Math.round(r.actual)}% está por debajo del mínimo de ${r.limite}%`;
        return Number.isFinite(r.actual)
            ? `total ${amount(r.actual, currency)} supera el tope de ${amount(r.limite, currency)}`
            : `el total no se puede comparar con el tope de ${amount(r.limite, currency)} porque está en otra divisa`;
    }).join(' y ');
}

/**
 * ¿La versión nueva es igual o menos riesgosa que la ya aprobada?
 *
 * Reenviar una versión de una cotización que gerencia ya aprobó no vuelve a
 * pedir permiso si no empeora nada de lo que se aprobó: mismo descuento o
 * menor, mismo total o menor, mismo margen o mejor. Lo que sí empeora —o un
 * tope que la versión aprobada ni siquiera rebasaba— necesita aprobación nueva.
 */
export function notWorseThanApproved(next: ApprovalVerdict, approved: ApprovalVerdict): boolean {
    const tol = 1e-6;
    return next.reasons.every((r) => {
        const prev = approved.reasons.find((a) => a.kind === r.kind);
        if (!prev || !Number.isFinite(r.actual) || !Number.isFinite(prev.actual)) return false;
        return r.kind === 'margen' ? r.actual >= prev.actual - tol : r.actual <= prev.actual + tol;
    });
}
