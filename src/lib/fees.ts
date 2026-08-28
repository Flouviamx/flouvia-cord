// La comisión de Cord Payments, POR DIVISA.
//
// Tarifas de México verificadas el 10-ago-2026 contra las páginas oficiales de
// Stripe MX (https://stripe.com/mx/pricing y .../pricing/local-payment-methods).
// Los precios publicados excluyen IVA; Cord cotiza una sola tarifa "+ IVA".
//
// ── Por qué esto es una tabla y no dos constantes ───────────────────────────
//
// La tarifa era un par de constantes globales más un `if (moneda !== 'MXN')
// return 0` dentro de `computeFee`. Funcionaba, pero escondía tres cosas que
// ahora son explícitas:
//
//   1. **El "+ IVA" del 16% es el impuesto MEXICANO**, no una constante
//      universal. Aplicárselo a una comisión cobrada en euros sería inventar un
//      impuesto español del 16% que no existe (el IVA de España es 21%).
//   2. **El costo de Stripe cambia por región.** El margen de Cord se calcula
//      restando ese costo, así que sin el costo de la región no hay margen que
//      calcular — y estimarlo sería exactamente lo que prohíbe la regla 22.
//   3. **Fuera de MXN, Cord no cobra comisión hoy.** Antes era un efecto
//      colateral de un `if`; ahora es un `enabled: false` que se lee, se explica
//      en la UI y se documenta.
//
// Activar una divisa NO es poner `enabled: true`: exige la tarifa negociada con
// el proveedor en esa región, su costo real, y el impuesto local que aplique
// sobre la comisión. `assertFeeMargin()` impide que se active sin números.

export type PaymentFeeMethod = 'card' | 'spei';

/** Divisas en las que Cord puede llegar a cobrar comisión de plataforma. */
export type FeeCurrency = 'MXN' | 'USD' | 'EUR' | 'GBP' | 'CAD' | 'BRL';

interface Rate { bps: number; fixedCents: number }

export interface RegionFeeSchedule {
    /** Costo publicado por el proveedor en esa región. Base del margen de Cord. */
    stripeCost: Partial<Record<PaymentFeeMethod, Rate>>;
    /** Lo que Cord le cobra al negocio, antes del impuesto local. */
    cordRate: Partial<Record<PaymentFeeMethod, Rate>>;
    /**
     * Impuesto local SOBRE LA COMISIÓN, en bps. En México es el IVA (16%).
     * `0` significa "sin impuesto sobre la comisión", no "no lo sabemos": una
     * divisa sin tarifa vigente lleva `enabled: false` y no llega a usarse.
     */
    taxBps: number;
    /** Tope del margen de Cord por operación y método, antes de impuesto. */
    marginCapCents: Partial<Record<PaymentFeeMethod, number>>;
    /** Comisión de igualas, en porcentaje del cobro y antes de impuesto. */
    subscriptionPercent: number;
    /** `false` = Cord no cobra comisión en esta divisa. La UI y los docs lo dicen. */
    enabled: boolean;
    /** Cuándo se verificaron estos números contra el proveedor. */
    verificado: string | null;
}

/**
 * Una divisa declarada pero SIN tarifa. No es lo mismo que "comisión cero por
 * generosidad": es "Cord todavía no negoció esta región". La distinción importa
 * porque el día que se negocie, lo único que cambia es esta entrada.
 */
const PENDIENTE: RegionFeeSchedule = {
    stripeCost: {},
    cordRate: {},
    taxBps: 0,
    marginCapCents: {},
    subscriptionPercent: 0,
    enabled: false,
    verificado: null,
};

export const FEE_SCHEDULES: Record<FeeCurrency, RegionFeeSchedule> = {
    MXN: {
        stripeCost: { card: { bps: 360, fixedCents: 300 }, spei: { bps: 0, fixedCents: 700 } },
        cordRate: { card: { bps: 400, fixedCents: 300 }, spei: { bps: 100, fixedCents: 700 } },
        taxBps: 1600, // IVA mexicano
        marginCapCents: { spei: 50_000 }, // MXN 500 de margen máximo por SPEI
        subscriptionPercent: 0.4,
        enabled: true,
        verificado: '2026-08-10',
    },
    // Cord opera en estos mercados y cobra en estas divisas, pero NO le cobra
    // comisión de plataforma al negocio todavía. Se declaran aquí para que el
    // hueco sea visible y para que activarlos sea llenar una entrada, no volver
    // a razonar la aritmética.
    USD: PENDIENTE,
    EUR: PENDIENTE,
    GBP: PENDIENTE,
    CAD: PENDIENTE,
    BRL: PENDIENTE,
};

/** La tabla de la divisa, o `null` si Cord no cobra comisión ahí. */
export function scheduleFor(moneda: string): RegionFeeSchedule | null {
    const key = String(moneda || '').toUpperCase() as FeeCurrency;
    const schedule = FEE_SCHEDULES[key];
    return schedule?.enabled ? schedule : null;
}

/** ¿Cord cobra comisión de plataforma en esta divisa? */
export function feesApplyTo(moneda: string): boolean {
    return scheduleFor(moneda) !== null;
}

// ── Compatibilidad ──────────────────────────────────────────────────────────
// Los consumidores que hoy hablan sólo de México siguen leyendo estas
// constantes. Salen de la tabla, no de un literal duplicado: si un día cambia
// la tarifa mexicana, cambia en un solo lugar.
export const STRIPE_MX_COST = FEE_SCHEDULES.MXN.stripeCost as Record<PaymentFeeMethod, Rate>;
export const FEE_SCHEDULE = FEE_SCHEDULES.MXN.cordRate as Record<PaymentFeeMethod, Rate>;
export const FEE_IVA_BPS = FEE_SCHEDULES.MXN.taxBps;
export const MARGIN_MINIMUM_BPS = 25;
/** Tope de margen Cord por SPEI, antes de IVA. MXN 500. */
export const SPEI_MARGIN_CAP_CENTS = FEE_SCHEDULES.MXN.marginCapCents.spei as number;
export const SUBSCRIPTION_FEE_PERCENT = FEE_SCHEDULES.MXN.subscriptionPercent;
/**
 * Porcentaje que viaja en `application_fee_percent` de una Subscription.
 *
 * Stripe acepta este parámetro con **dos decimales como máximo**, así que el
 * redondeo NO es cosmético: sin él la constante valía
 * `0.4 * 1.16 = 0.46399999999999997` (el clásico error de punto flotante de
 * IEEE-754), y eso rompía la iguala por dos caminos a la vez —
 *
 *   1. `String(0.46399999999999997)` se manda literal en el form-encoded, y
 *      Stripe lo rechaza por exceso de decimales o lo trunca a `0.46`;
 *   2. si lo trunca, las dos comparaciones de reutilización de este repo
 *      (`existingFee === applicationFeePercent` en subscription-intent.ts)
 *      comparan el `0.46` que devuelve Stripe contra el float largo, **nunca
 *      empatan**, y cada visita del cliente a una iguala incompleta cancelaba
 *      la suscripción y creaba otra.
 *
 * Se redondea aquí, en la fuente, para que el valor que se compara y el que se
 * envía sean el MISMO número. Redondear en el punto de envío dejaría vivo el
 * bug de comparación.
 */
export const SUBSCRIPTION_APPLICATION_FEE_PERCENT = Math.round(
    SUBSCRIPTION_FEE_PERCENT * (1 + FEE_IVA_BPS / 10_000) * 100,
) / 100;

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
    const schedule = scheduleFor(input.moneda);
    // Sin tabla vigente para esa divisa no hay comisión: es la misma respuesta
    // que antes daba `moneda !== 'MXN'`, pero ahora dice POR QUÉ.
    if (!Number.isSafeInteger(amount) || amount <= 0 || !schedule || input.enabled === false) {
        return { blendedTotalCents: 0, applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0, stripeCostEstimateCents: 0 };
    }
    const stripeRate = schedule.stripeCost[input.metodo];
    const cordRate = schedule.cordRate[input.metodo];
    // Un método que esa región no ofrece (SPEI fuera de México) no tiene tarifa
    // que aplicar. Antes esto no podía ocurrir porque sólo existía México.
    if (!stripeRate || !cordRate) {
        return { blendedTotalCents: 0, applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0, stripeCostEstimateCents: 0 };
    }
    const conImpuesto = (base: number) => base + Math.round(base * schedule.taxBps / 10_000);
    const stripeBase = percent(amount, stripeRate.bps) + stripeRate.fixedCents;
    const blendedBaseUncapped = percent(amount, cordRate.bps) + cordRate.fixedCents;
    const stripeCostEstimateCents = conImpuesto(stripeBase);
    const marginBaseUncapped = Math.max(0, blendedBaseUncapped - stripeBase);
    const cap = schedule.marginCapCents[input.metodo];
    const rawBase = cap != null ? Math.min(marginBaseUncapped, cap) : marginBaseUncapped;
    const rawIva = Math.max(0, Math.round(rawBase * schedule.taxBps / 10_000));
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

/**
 * La tarifa, escrita para el dueño del negocio.
 *
 * Devuelve `null` cuando Cord no cobra comisión en esa divisa. Un `null` NO es
 * un error: es la respuesta correcta hoy fuera de México, y la UI lo dice con
 * palabras en vez de mostrar una tabla mexicana a un negocio en Madrid.
 */
export function describeFee(metodo: PaymentFeeMethod, moneda: string = 'MXN', locale: 'es' | 'en' = 'es'): string | null {
    const schedule = scheduleFor(moneda);
    const rate = schedule?.cordRate[metodo];
    const costo = schedule?.stripeCost[metodo];
    if (!schedule || !rate || !costo) return null;

    const divisa = String(moneda).toUpperCase();
    const intl = locale === 'en' ? 'en-US' : 'es-MX';
    const impuesto = locale === 'en' ? 'tax' : 'IVA';
    const pct = (rate.bps / 100).toLocaleString(intl, { maximumFractionDigits: 2 });
    const fixed = (rate.fixedCents / 100).toLocaleString(intl, { style: 'currency', currency: divisa, maximumFractionDigits: 0 });
    const base = schedule.taxBps > 0 ? `${pct}% + ${fixed} + ${impuesto}` : `${pct}% + ${fixed}`;

    const cap = schedule.marginCapCents[metodo];
    if (cap == null) return base;
    const techoBase = cap + costo.fixedCents;
    const maximum = ((techoBase + Math.round(techoBase * schedule.taxBps / 10_000)) / 100)
        .toLocaleString(intl, { style: 'currency', currency: divisa, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return locale === 'en' ? `${base} (max ${maximum})` : `${base} (máximo ${maximum})`;
}

export function describeSubscriptionFee(moneda: string = 'MXN', locale: 'es' | 'en' = 'es'): string | null {
    return describeFee('card', moneda, locale);
}

// La comisión de Cord Payments es una tarifa mexicana pactada con Stripe MX
// ("+ IVA" son las siglas del impuesto mexicano, no un IVA genérico) — mismo
// gate que computeFee. Sin él, un cobro recurrente en USD/EUR le cobraba a la
// org el 0.4% + "IVA" del 16% aunque su cuenta nunca hubiera aceptado esa
// tarifa ni operara en México.
export function computeSubscriptionFee(amountCents: number, moneda: string, enabled = true): Pick<FeeResult, 'applicationFeeCents' | 'feeBaseCents' | 'feeIvaCents'> {
    const amount = Math.round(amountCents);
    const schedule = scheduleFor(moneda);
    if (!enabled || !schedule || !Number.isSafeInteger(amount) || amount <= 0) {
        return { applicationFeeCents: 0, feeBaseCents: 0, feeIvaCents: 0 };
    }
    const feeBaseCents = Math.round(amount * schedule.subscriptionPercent / 100);
    const feeIvaCents = Math.round(feeBaseCents * schedule.taxBps / 10_000);
    return { applicationFeeCents: feeBaseCents + feeIvaCents, feeBaseCents, feeIvaCents };
}

/**
 * `application_fee_percent` para una iguala en esa divisa, o `null` si Cord no
 * cobra comisión ahí. Redondeado a dos decimales por el límite de Stripe — ver
 * `SUBSCRIPTION_APPLICATION_FEE_PERCENT`.
 */
export function subscriptionFeePercentFor(moneda: string): number | null {
    const schedule = scheduleFor(moneda);
    if (!schedule || schedule.subscriptionPercent <= 0) return null;
    return Math.round(schedule.subscriptionPercent * (1 + schedule.taxBps / 10_000) * 100) / 100;
}

/**
 * Stripe rechaza `application_fee_percent` con más de dos decimales. Esto lo
 * afirma sobre el valor SERIALIZADO, que es lo que realmente viaja — un
 * `toFixed()` en el punto de envío pasaría esta prueba y aun así rompería la
 * comparación de reutilización.
 */
export function assertSubscriptionFeePrecision(): void {
    const serialized = String(SUBSCRIPTION_APPLICATION_FEE_PERCENT);
    const decimals = serialized.split('.')[1]?.length ?? 0;
    if (decimals > 2) {
        throw new Error(
            `application_fee_percent serializa como "${serialized}" (${decimals} decimales); Stripe acepta 2`,
        );
    }
}

/**
 * Ninguna divisa activa puede cobrar por debajo de lo que cuesta procesar.
 *
 * Recorre la tabla completa, no sólo México: activar una divisa nueva sin sus
 * números reales rompe aquí, que es exactamente el punto — `enabled: true` con
 * `stripeCost` vacío significaría que Cord no sabe cuánto le cuesta la
 * operación que está cobrando.
 */
export function assertFeeMargin(): void {
    for (const [moneda, schedule] of Object.entries(FEE_SCHEDULES)) {
        if (!schedule.enabled) continue;
        if (!schedule.verificado) {
            throw new Error(`La tarifa de ${moneda} está activa sin fecha de verificación`);
        }
        const metodos = Object.keys(schedule.cordRate) as PaymentFeeMethod[];
        if (metodos.length === 0) {
            throw new Error(`La tarifa de ${moneda} está activa y no declara ningún método`);
        }
        for (const method of metodos) {
            const cord = schedule.cordRate[method];
            const costo = schedule.stripeCost[method];
            if (!cord || !costo) {
                throw new Error(`La tarifa ${method} de ${moneda} no declara costo del proveedor`);
            }
            if (cord.bps - costo.bps < MARGIN_MINIMUM_BPS || cord.fixedCents < costo.fixedCents) {
                throw new Error(`La tarifa ${method} de ${moneda} viola el margen mínimo`);
            }
        }
    }
}
