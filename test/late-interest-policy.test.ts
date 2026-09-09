import { describe, expect, it } from 'vitest';
import { lateInterestPolicy, validateLateInterestRate } from '../src/lib/late-interest-policy';

describe('política de interés moratorio automático', () => {
    it('permanece cerrada para todo país hasta una revisión explícita', () => {
        for (const country of ['MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR', '', null]) {
            expect(lateInterestPolicy(country)).toEqual({
                enabled: false,
                maxMonthlyPct: 0,
                reason: 'jurisdiction_review_required',
            });
        }
    });

    it('permite apagar la tasa y rechaza cualquier activación', () => {
        expect(validateLateInterestRate('MX', 0)).toEqual({ ok: true, rate: 0 });
        expect(validateLateInterestRate('MX', 1).ok).toBe(false);
        expect(validateLateInterestRate('US', 0.5).ok).toBe(false);
    });

    it('rechaza valores negativos o no numéricos', () => {
        expect(validateLateInterestRate('MX', -1).ok).toBe(false);
        expect(validateLateInterestRate('MX', 'no-es-tasa').ok).toBe(false);
    });
});
