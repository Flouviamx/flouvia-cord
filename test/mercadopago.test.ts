import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { isMpCheckoutUrl, MP_INVOICE_REF, mpSignatureValid, parseMpRefunds } from '../src/lib/mercadopago';

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

describe('reembolsos leídos del pago', () => {
    it('traduce el estado del proveedor al del ledger', () => {
        expect(parseMpRefunds({ refunds: [
            { id: 1, amount: 10, status: 'approved' },
            { id: 2, amount: 5, status: 'in_process' },
            { id: 3, amount: 7, status: 'rejected' },
            { id: 4, amount: 9, status: 'cancelled' },
        ] })).toEqual([
            { id: '1', monto: 10, status: 'succeeded' },
            { id: '2', monto: 5, status: 'pending' },
            { id: '3', monto: 7, status: 'failed' },
            { id: '4', monto: 9, status: 'failed' },
        ]);
    });

    it('un estado desconocido no cuenta como dinero devuelto', () => {
        expect(parseMpRefunds({ refunds: [{ id: 9, amount: 3, status: 'algo_nuevo' }] }))
            .toEqual([{ id: '9', monto: 3, status: 'pending' }]);
    });

    it('descarta reembolsos sin id o sin importe', () => {
        expect(parseMpRefunds({ refunds: [{ amount: 10, status: 'approved' }, { id: 5, amount: 0, status: 'approved' }] })).toEqual([]);
        expect(parseMpRefunds({})).toEqual([]);
        expect(parseMpRefunds(null)).toEqual([]);
    });

    it('un id 0 sigue siendo un reembolso', () => {
        expect(parseMpRefunds({ refunds: [{ id: 0, amount: 4, status: 'approved' }] }))
            .toEqual([{ id: '0', monto: 4, status: 'succeeded' }]);
    });
});

describe('referencia del cobro', () => {
    it('la factura lleva prefijo y la cotización no: son dos ledgers', () => {
        const documentoId = '8f4c6f0e-7a1b-4c2d-9e3f-1a2b3c4d5e6f';
        expect(`${MP_INVOICE_REF}${documentoId}`.startsWith(MP_INVOICE_REF)).toBe(true);
        expect(`${MP_INVOICE_REF}${documentoId}`.slice(MP_INVOICE_REF.length)).toBe(documentoId);
        expect(documentoId.startsWith(MP_INVOICE_REF)).toBe(false);
    });
});
