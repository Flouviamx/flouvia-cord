import { describe, expect, it } from 'vitest';
import {
    DEMO_PRO_MENSUAL,
    DEMO_QUOTE_FOLIO,
    DEMO_USUARIO_ADICIONAL_MXN,
    getDemoQuote,
} from '../src/lib/demo-quote';
import { quoteSubtotal, quoteTaxBreakdown, quoteTotal } from '../src/lib/quote';
import { PLANES, precioAnualTotal } from '../src/lib/precios';
import { overagePriceLabel } from '../src/lib/plan-overage-pricing';
import { reqContext } from '../src/lib/context';

// La demo pública (/q/demo) cotiza el plan Profesional con los precios que
// Cord publica. Si alguien ajusta un precio en precios.ts o el excedente de
// usuarios, la demo no puede seguir mostrando el viejo.
describe('cotización demo', () => {
    it('usa los precios publicados del plan Profesional y del usuario adicional', () => {
        const pro = PLANES.find((p) => p.id === 'pro')!;
        expect(DEMO_PRO_MENSUAL).toBe(pro.precio.MXN);
        expect(overagePriceLabel('pro', 'usuario', 'MXN', 'es')).toContain(String(DEMO_USUARIO_ADICIONAL_MXN));

        const { quote } = getDemoQuote(new Date('2026-09-13T18:00:00Z'));
        const [anual, usuarios] = quote.items;
        expect(anual.precioLista).toBe(pro.precio.MXN * 12);
        expect(anual.precioNegociado).toBe(precioAnualTotal(pro.precio.MXN));
        expect(usuarios.precioLista).toBe(DEMO_USUARIO_ADICIONAL_MXN);
        expect(usuarios.cantidad).toBe(24);
    });

    it('desagrega el IVA de precios con impuesto incluido (regla 27)', () => {
        const { quote } = getDemoQuote(new Date('2026-09-13T18:00:00Z'));
        expect(quote.iva_incluido).toBe(true);
        expect(quote.folio).toBe(DEMO_QUOTE_FOLIO);
        expect(quoteTotal(quote)).toBeCloseTo(13_100, 6);
        expect(quote.total).toBe(13_100);
        expect(quoteSubtotal(quote)).toBeCloseTo(13_100 / 1.16, 6);
        const [iva] = quoteTaxBreakdown(quote);
        expect(iva.tasa).toBe(0.16);
        expect(iva.impuesto + quoteSubtotal(quote)).toBeCloseTo(13_100, 6);
    });

    it('no inventa identidad fiscal ni contacto de una empresa real', () => {
        const { org } = getDemoQuote();
        expect(org.rfc).toBe('');
        expect(org.telefono).toBe('');
        expect(org.whatsapp).toBe('');
        expect(org.portalPowered).toBe(false);
    });

    it('la vigencia se mide desde hoy: la demo nunca vence', () => {
        const { quote } = getDemoQuote(new Date('2030-01-01T12:00:00Z'));
        expect(quote.diasVigencia).toBeGreaterThan(7);
    });

    it('traduce al inglés con el idioma del request', () => {
        const { quote, conversacion } = reqContext.run({ userId: null, locale: 'en' }, () => getDemoQuote());
        expect(quote.items[0].descripcion).toBe('Cord Professional · annual plan');
        expect(conversacion.every((m) => m.detalle.length > 0)).toBe(true);
        expect(conversacion.map((m) => m.mine)).toEqual([false, true, false]);
    });
});
