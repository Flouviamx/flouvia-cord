// Regla 22: "Una tasa que no se puede demostrar no se inventa."
//
// Lo que se fija aquí:
//   1. sin tasa real → FXUnavailableError, NUNCA 1.0;
//   2. la conversión MULTIPLICA de la divisa de venta a la contable
//      (el corolario de dirección: si una capa divide y otra multiplica,
//      una de las dos miente);
//   3. una tasa cacheada y fechada SÍ es respaldo válido — es un dato real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Módulo fresco por test: FXService cachea por proceso. */
async function loadFX() {
    vi.resetModules();
    return import('../src/lib/fx/FXService');
}

function mockRate(rate: number, date = '2026-08-17') {
    return vi.fn(async () => new Response(
        JSON.stringify({ date, rates: { MXN: rate, EUR: rate, USD: rate } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
}

const fetchOriginal = globalThis.fetch;
beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-08-17T12:00:00Z') }); });
afterEach(() => { globalThis.fetch = fetchOriginal; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('misma divisa', () => {
    it('no consulta al proveedor y devuelve tasa 1', async () => {
        const { FXService } = await loadFX();
        const spy = vi.fn();
        globalThis.fetch = spy as unknown as typeof fetch;

        const r = await FXService.getExchangeRate({ baseCurrency: 'MXN', fiscalCurrency: 'MXN', amount: 1000 });

        expect(r.appliedRate).toBe(1);
        expect(r.source).toBe('same');
        expect(r.convertedAmount).toBe(1000);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('dirección de la conversión', () => {
    it('MULTIPLICA: de la divisa de venta a la contable', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = mockRate(20) as unknown as typeof fetch;

        // Vendo USD 1,000 y llevo libros en MXN, a 20 MXN por USD.
        const r = await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 });

        expect(r.spotRate).toBe(20);
        // 1000 × 20 = 20,000 MXN. Dividir daría 50 — el bug real que documenta
        // la regla: el panel de FX dividía y la base de datos multiplicaba.
        expect(r.convertedAmount).toBe(20_000);
        expect(r.convertedAmount).toBe(r.appliedRate * 1000);
    });

    it('el buffer encarece la tasa, no la abarata', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = mockRate(20) as unknown as typeof fetch;

        const r = await FXService.getExchangeRate({
            baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000, bufferPct: 2,
        });

        expect(r.appliedRate).toBeCloseTo(20.4, 10);
        expect(r.appliedRate).toBeGreaterThan(r.spotRate);
        expect(r.source).toBe('buffer');
    });

    it('el buffer tiene tope: un 999% no pasa', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = mockRate(20) as unknown as typeof fetch;

        const r = await FXService.getExchangeRate({
            baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000, bufferPct: 999,
        });

        expect(r.appliedRate).toBeCloseTo(25, 10);   // 20 × (1 + 25/100)
    });

    it('un buffer negativo o inválido se ignora, no invierte la tasa', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = mockRate(20) as unknown as typeof fetch;

        for (const bufferPct of [-5, Number.NaN, undefined]) {
            const r = await FXService.getExchangeRate({
                baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000, bufferPct: bufferPct as number,
            });
            expect(r.appliedRate).toBe(20);
            expect(r.source).toBe('spot');
        }
    });

    it('congela la tasa 30 días', async () => {
        const { FXService, FX_LOCK_DAYS } = await loadFX();
        globalThis.fetch = mockRate(20) as unknown as typeof fetch;

        const r = await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1 });

        expect(FX_LOCK_DAYS).toBe(30);
        const dias = Math.round((r.lockedUntil!.getTime() - Date.now()) / 86_400_000);
        expect(dias).toBe(30);
    });
});

describe('falla cerrado (nunca inventa una tasa)', () => {
    it('lanza si el proveedor responde error HTTP', async () => {
        const { FXService, FXUnavailableError } = await loadFX();
        globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof fetch;

        await expect(
            FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 }),
        ).rejects.toBeInstanceOf(FXUnavailableError);
    });

    it('lanza si la red está caída', async () => {
        const { FXService, FXUnavailableError } = await loadFX();
        globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;

        await expect(
            FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 }),
        ).rejects.toBeInstanceOf(FXUnavailableError);
    });

    it('lanza si el proveedor no cubre el par', async () => {
        const { FXService, FXUnavailableError } = await loadFX();
        globalThis.fetch = vi.fn(async () => new Response(
            JSON.stringify({ date: '2026-08-17', rates: {} }), { status: 200 },
        )) as unknown as typeof fetch;

        await expect(
            FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 }),
        ).rejects.toBeInstanceOf(FXUnavailableError);
    });

    it('lanza ante una divisa no reconocida', async () => {
        const { FXService, FXUnavailableError } = await loadFX();
        await expect(
            FXService.getExchangeRate({ baseCurrency: 'XYZ', fiscalCurrency: 'MXN', amount: 1000 }),
        ).rejects.toBeInstanceOf(FXUnavailableError);
    });

    it('lanza ante un monto inválido', async () => {
        const { FXService, FXUnavailableError } = await loadFX();
        for (const amount of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
            await expect(
                FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount }),
            ).rejects.toBeInstanceOf(FXUnavailableError);
        }
    });

    it('NUNCA devuelve 1.0 como tasa entre divisas distintas', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = vi.fn(async () => { throw new Error('red caída'); }) as unknown as typeof fetch;

        // El bug histórico: con la red caída se congelaba 1.0 durante 30 días.
        const r = await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 })
            .catch(() => null);
        expect(r).toBeNull();
    });
});

describe('respaldo con tasa cacheada', () => {
    it('una tasa vencida pero REAL sí sirve de respaldo', async () => {
        const { FXService } = await loadFX();
        globalThis.fetch = mockRate(20, '2026-08-17') as unknown as typeof fetch;

        // Primera llamada: siembra la caché con un dato real y fechado.
        const primera = await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 });
        expect(primera.spotRate).toBe(20);

        // Pasa el TTL y el proveedor se cae.
        vi.advanceTimersByTime(11 * 60 * 1000);
        globalThis.fetch = vi.fn(async () => { throw new Error('red caída'); }) as unknown as typeof fetch;

        const segunda = await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1000 });
        expect(segunda.spotRate).toBe(20);          // el dato real, no un 1.0
        expect(segunda.asOf).toBe('2026-08-17');    // y declara su fecha
    });

    it('dentro del TTL no vuelve a pedirle al proveedor', async () => {
        const { FXService } = await loadFX();
        const spy = mockRate(20);
        globalThis.fetch = spy as unknown as typeof fetch;

        await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 1 });
        await FXService.getExchangeRate({ baseCurrency: 'USD', fiscalCurrency: 'MXN', amount: 2 });

        expect(spy).toHaveBeenCalledTimes(1);
    });
});
