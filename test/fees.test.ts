// Comisiones de Cord Pagos. Es dinero que se le descuenta al negocio en cada
// cobro, así que las invariantes importan más que los números concretos:
// nunca cobrar más de lo que entra, nunca vender por debajo del costo del PSP,
// y nunca cobrar sin que la organización haya aceptado la versión vigente.

import { describe, it, expect } from 'vitest';
import {
    FEE_IVA_BPS,
    FEE_SCHEDULE,
    FEE_TERMS_VERSION,
    MARGIN_MINIMUM_BPS,
    SPEI_MARGIN_CAP_CENTS,
    STRIPE_MX_COST,
    assertFeeMargin,
    computeFee,
    computeSubscriptionFee,
    isFeeScheduleActive,
} from '../src/lib/fees';

describe('consentimiento de la tarifa', () => {
    it('solo cobra si aceptó la versión EXACTA vigente', () => {
        expect(isFeeScheduleActive(true, FEE_TERMS_VERSION)).toBe(true);
    });

    it('no cobra con una versión vieja, ausente o el flag apagado', () => {
        expect(isFeeScheduleActive(true, 'cord-pagos-2025-01-01')).toBe(false);
        expect(isFeeScheduleActive(true, null)).toBe(false);
        expect(isFeeScheduleActive(false, FEE_TERMS_VERSION)).toBe(false);
        expect(isFeeScheduleActive('true', FEE_TERMS_VERSION)).toBe(false);
    });
});

describe('margen mínimo sobre el costo del proveedor', () => {
    it('la tabla vigente no vende por debajo del costo', () => {
        expect(() => assertFeeMargin()).not.toThrow();
    });

    it('cada método deja al menos el margen mínimo declarado', () => {
        for (const m of ['card', 'spei'] as const) {
            expect(FEE_SCHEDULE[m].bps - STRIPE_MX_COST[m].bps).toBeGreaterThanOrEqual(MARGIN_MINIMUM_BPS);
            expect(FEE_SCHEDULE[m].fixedCents).toBeGreaterThanOrEqual(STRIPE_MX_COST[m].fixedCents);
        }
    });
});

describe('computeFee', () => {
    it('no cobra comisión fuera de México (Cord Pagos es un riel MXN)', () => {
        for (const moneda of ['USD', 'EUR', 'JPY']) {
            const r = computeFee({ amountCents: 100_000, metodo: 'card', moneda });
            expect(r.applicationFeeCents).toBe(0);
            expect(r.blendedTotalCents).toBe(0);
        }
    });

    it('no cobra si la organización no habilitó la tarifa', () => {
        const r = computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'MXN', enabled: false });
        expect(r.applicationFeeCents).toBe(0);
    });

    it('no cobra sobre montos no positivos o inválidos', () => {
        for (const amountCents of [0, -100, Number.NaN, 1e18]) {
            expect(computeFee({ amountCents, metodo: 'card', moneda: 'MXN' }).applicationFeeCents).toBe(0);
        }
    });

    it('la comisión DE CORD jamás excede el monto cobrado', () => {
        // Ojo con la invariante correcta: `blendedTotalCents` incluye el costo
        // del procesador, que en un cobro diminuto (MXN 0.01) supera al propio
        // cobro por su cuota FIJA — eso es cierto en cualquier PSP y no es algo
        // que Cord decida. Lo que Cord no puede hacer nunca es cobrar de más:
        // `applicationFeeCents` se acota a lo que queda tras el costo del PSP.
        for (const amountCents of [1, 50, 100, 500, 1_000, 10_000, 1_000_000]) {
            for (const metodo of ['card', 'spei'] as const) {
                const r = computeFee({ amountCents, metodo, moneda: 'MXN' });
                const etiqueta = `${metodo} @ ${amountCents}`;
                expect(r.applicationFeeCents, etiqueta).toBeGreaterThanOrEqual(0);
                expect(r.applicationFeeCents, etiqueta).toBeLessThanOrEqual(amountCents);
                expect(r.applicationFeeCents, etiqueta)
                    .toBeLessThanOrEqual(Math.max(0, amountCents - r.stripeCostEstimateCents));
            }
        }
    });

    it('el IVA se calcula sobre la base, no sobre el total', () => {
        const r = computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'MXN' });
        expect(r.feeIvaCents).toBe(Math.round(r.feeBaseCents * FEE_IVA_BPS / 10_000));
        expect(r.applicationFeeCents).toBe(r.feeBaseCents + r.feeIvaCents);
    });

    it('SPEI tiene tope de margen: un cobro enorme no cobra un porcentaje infinito', () => {
        const r = computeFee({ amountCents: 100_000_000, metodo: 'spei', moneda: 'MXN' });
        expect(r.feeBaseCents).toBeLessThanOrEqual(SPEI_MARGIN_CAP_CENTS);
    });

    it('la comisión crece con el monto (monotonía)', () => {
        let previo = -1;
        for (const amountCents of [10_000, 50_000, 100_000, 500_000]) {
            const actual = computeFee({ amountCents, metodo: 'card', moneda: 'MXN' }).applicationFeeCents;
            expect(actual).toBeGreaterThanOrEqual(previo);
            previo = actual;
        }
    });

    it('acepta la divisa en minúsculas', () => {
        const a = computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'mxn' });
        const b = computeFee({ amountCents: 100_000, metodo: 'card', moneda: 'MXN' });
        expect(a).toEqual(b);
    });
});

describe('computeSubscriptionFee', () => {
    it('no cobra sobre montos inválidos ni con el flag apagado', () => {
        expect(computeSubscriptionFee(0).applicationFeeCents).toBe(0);
        expect(computeSubscriptionFee(-1).applicationFeeCents).toBe(0);
        expect(computeSubscriptionFee(100_000, false).applicationFeeCents).toBe(0);
    });

    it('cobra 0.4% + IVA', () => {
        const r = computeSubscriptionFee(100_000);   // MXN 1,000
        expect(r.feeBaseCents).toBe(400);            // 0.4%
        expect(r.feeIvaCents).toBe(64);              // 16% de 400
        expect(r.applicationFeeCents).toBe(464);
    });

    it('nunca excede el monto de la suscripción', () => {
        for (const amountCents of [1, 100, 10_000, 1_000_000]) {
            expect(computeSubscriptionFee(amountCents).applicationFeeCents).toBeLessThanOrEqual(amountCents);
        }
    });
});
