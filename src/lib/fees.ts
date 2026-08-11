// Tarifas verificadas el 10-ago-2026 contra las páginas oficiales de Stripe MX:
// https://stripe.com/mx/pricing
// https://stripe.com/mx/pricing/local-payment-methods
// Los precios publicados excluyen IVA. Cord cotiza una sola tarifa "+ IVA".

export type PaymentFeeMethod = 'card' | 'spei';

interface Rate { bps: number; fixedCents: number }

export const STRIPE_MX_COST: Record<PaymentFeeMethod, Rate> = {
    card: { bps: 360, fixedCents: 300 },
    spei: { bps: 0, fixedCents: 700 },
};

export const FEE_SCHEDULE: Record<PaymentFeeMethod, Rate> = {
    card: { bps: 400, fixedCents: 300 },
    spei: { bps: 100, fixedCents: 700 },
};

export const FEE_IVA_BPS = 1600;
export const MARGIN_MINIMUM_BPS = 25;
/** Tope de margen Cord por SPEI, antes de IVA. MXN 500. */
export const SPEI_MARGIN_CAP_CENTS = 50_000;
export const SUBSCRIPTION_FEE_PERCENT = 0.4;
export const SUBSCRIPTION_APPLICATION_FEE_PERCENT = SUBSCRIPTION_FEE_PERCENT * (1 + FEE_IVA_BPS / 10_000);
export const FEE_TERMS_VERSION = 'cord-pagos-2026-08-11';

/** Solo cobra la tabla vigente cuando la organización aceptó esta versión exacta. */
export function isFeeScheduleActive(enabled: unknown, acceptedVersion: unknown): boolean {
    return enabled === true && acceptedVersion === FEE_TERMS_VERSION;
}

export interface FeeResult {
    blendedTotalCents: number;
    applicationFeeCents: number;
    feeBaseCents: number;
    feeIvaCents: number;
    stripeCostEstimateCents: number;
}

const percent = (amount: number, bps: number) => Math.round(amount * bps / 10_000);
const withIva = (base: number) => base + Math.round(base * FEE_IVA_BPS / 10_000);

export function computeFee(input: {
    amountCents: number;
    metodo: PaymentFeeMethod;
    moneda: string;
    enabled?: boolean;
}): FeeResult {
    const amount = Math.round(input.amountCents);
    if (!Number.isSafeInteger(amount) || amount <= 0 || input.moneda.toUpperCase() !== 'MXN' || input.enabled === false) {
        return { blendedTotalCents: 0, applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0, stripeCostEstimateCents: 0 };
    }
    const stripeRate = STRIPE_MX_COST[input.metodo];
    const cordRate = FEE_SCHEDULE[input.metodo];
    const stripeBase = percent(amount, stripeRate.bps) + stripeRate.fixedCents;
    const blendedBaseUncapped = percent(amount, cordRate.bps) + cordRate.fixedCents;
    const stripeCostEstimateCents = withIva(stripeBase);
    const marginBaseUncapped = Math.max(0, blendedBaseUncapped - stripeBase);
    const rawBase = input.metodo === 'spei'
        ? Math.min(marginBaseUncapped, SPEI_MARGIN_CAP_CENTS)
        : marginBaseUncapped;
    const rawIva = Math.max(0, Math.round(rawBase * FEE_IVA_BPS / 10_000));
    const rawApplicationFee = rawBase + rawIva;
    const maxFee = Math.max(0, amount - stripeCostEstimateCents);
    const applicationFeeCents = Math.min(rawApplicationFee, maxFee);
    const blendedTotalCents = stripeCostEstimateCents + applicationFeeCents;
    if (applicationFeeCents !== rawApplicationFee) {
        return { blendedTotalCents, applicationFeeCents, feeBaseCents: applicationFeeCents, feeIvaCents: 0, stripeCostEstimateCents };
    }
    return {
        blendedTotalCents,
        applicationFeeCents,
        feeBaseCents: rawBase,
        feeIvaCents: rawIva,
        stripeCostEstimateCents,
    };
}

export function describeFee(metodo: PaymentFeeMethod): string {
    const rate = FEE_SCHEDULE[metodo];
    const pct = (rate.bps / 100).toLocaleString('es-MX', { maximumFractionDigits: 2 });
    const fixed = (rate.fixedCents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
    const base = `${pct}% + ${fixed} + IVA`;
    if (metodo !== 'spei') return base;
    const maximum = (withIva(SPEI_MARGIN_CAP_CENTS + STRIPE_MX_COST.spei.fixedCents) / 100)
        .toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${base} (máximo ${maximum})`;
}

export function describeSubscriptionFee(): string {
    return describeFee('card');
}

export function computeSubscriptionFee(amountCents: number, enabled = true): Pick<FeeResult, 'applicationFeeCents' | 'feeBaseCents' | 'feeIvaCents'> {
    const amount = Math.round(amountCents);
    if (!enabled || !Number.isSafeInteger(amount) || amount <= 0) {
        return { applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0 };
    }
    const feeBaseCents = Math.round(amount * SUBSCRIPTION_FEE_PERCENT / 100);
    const feeIvaCents = Math.round(feeBaseCents * FEE_IVA_BPS / 10_000);
    return { applicationFeeCents: feeBaseCents + feeIvaCents, feeBaseCents, feeIvaCents };
}

export function assertFeeMargin(): void {
    for (const method of ['card', 'spei'] as const) {
        const delta = FEE_SCHEDULE[method].bps - STRIPE_MX_COST[method].bps;
        if (delta < MARGIN_MINIMUM_BPS || FEE_SCHEDULE[method].fixedCents < STRIPE_MX_COST[method].fixedCents) {
            throw new Error(`La tarifa ${method} viola el margen mínimo`);
        }
    }
}
