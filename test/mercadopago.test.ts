import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { isMpCheckoutUrl, mpSignatureValid } from '../src/lib/mercadopago';

const firmar = (secret: string, manifest: string) => createHmac('sha256', secret).update(manifest).digest('hex');
const ahora = () => Math.floor(Date.now() / 1000);

describe('firma del webhook de Mercado Pago', () => {
    it('acepta la firma que cuadra con el manifiesto', () => {
        const ts = ahora();
        const v1 = firmar('s3cret', `id:123;request-id:req-1;ts:${ts};`);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-1', '123', 's3cret')).toBe(true);
    });

    it('rechaza otro secreto, otro id y otro request-id', () => {
        const ts = ahora();
        const v1 = firmar('s3cret', `id:123;request-id:req-1;ts:${ts};`);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-1', '123', 'otro')).toBe(false);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-1', '999', 's3cret')).toBe(false);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-2', '123', 's3cret')).toBe(false);
    });

    it('sin secreto, sin encabezado o sin id no hay firma válida: falla cerrada', () => {
        const ts = ahora();
        const v1 = firmar('s3cret', `id:123;request-id:req-1;ts:${ts};`);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-1', '123', '')).toBe(false);
        expect(mpSignatureValid(null, 'req-1', '123', 's3cret')).toBe(false);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, 'req-1', '', 's3cret')).toBe(false);
        expect(mpSignatureValid(`v1=${v1}`, 'req-1', '123', 's3cret')).toBe(false);
        expect(mpSignatureValid(`ts=${ts}`, 'req-1', '123', 's3cret')).toBe(false);
    });

    it('un reintento tardío con la firma original sigue siendo válido', () => {
        const viejo = ahora() - 3600 * 6;
        const v1 = firmar('s3cret', `id:123;request-id:req-1;ts:${viejo};`);
        expect(mpSignatureValid(`ts=${viejo},v1=${v1}`, 'req-1', '123', 's3cret')).toBe(true);
    });

    it('sin x-request-id el tramo se omite, como en el SDK oficial', () => {
        const ts = ahora();
        const v1 = firmar('s3cret', `id:123;ts:${ts};`);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, null, '123', 's3cret')).toBe(true);
        expect(mpSignatureValid(`ts=${ts},v1=${v1}`, '  ', '123', 's3cret')).toBe(true);
        expect(mpSignatureValid(`ts=${ts},v1=${firmar('s3cret', `id:123;request-id:;ts:${ts};`)}`, null, '123', 's3cret')).toBe(false);
    });

    it('acepta claves del encabezado en mayúsculas y rechaza un ts que no es número', () => {
        const ts = ahora();
        const v1 = firmar('s3cret', `id:123;request-id:req-1;ts:${ts};`);
        expect(mpSignatureValid(`TS=${ts}, V1=${v1}`, 'req-1', '123', 's3cret')).toBe(true);
        expect(mpSignatureValid(`ts=abc,v1=${v1}`, 'req-1', '123', 's3cret')).toBe(false);
    });
});

describe('isMpCheckoutUrl', () => {
    it('acepta los checkouts de Mercado Pago, incluido el sandbox', () => {
        expect(isMpCheckoutUrl('https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1')).toBe(true);
        expect(isMpCheckoutUrl('https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1')).toBe(true);
        expect(isMpCheckoutUrl('https://sandbox.mercadopago.com.co/checkout/v1/redirect?pref_id=1')).toBe(true);
        expect(isMpCheckoutUrl('https://mpago.la/abc')).toBe(false);
    });

    it('rechaza lo que no es Mercado Pago: es a donde se manda al pagador con su dinero', () => {
        expect(isMpCheckoutUrl('http://www.mercadopago.com.mx/checkout')).toBe(false);
        expect(isMpCheckoutUrl('https://mercadopago.com.evil.example/checkout')).toBe(false);
        expect(isMpCheckoutUrl('https://evil.example/mercadopago.com')).toBe(false);
        expect(isMpCheckoutUrl('https://notmercadopago.com/checkout')).toBe(false);
        expect(isMpCheckoutUrl('javascript:alert(1)')).toBe(false);
        expect(isMpCheckoutUrl('')).toBe(false);
    });
});
