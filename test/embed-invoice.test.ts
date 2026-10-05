// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { embedFramePolicy, parseEmbedDomains } from '../src/lib/embed-frame';
import { publicInvoicePayability } from '../src/lib/fiscal/public-invoice-state';
import { mountCotizador } from '../packages/elements/src/core';
import { defineCordElements } from '../packages/elements/src/element';
import { INITIAL_QUOTE_VIEW, reduceQuoteView } from '../packages/elements/src/headless/quote-view';

describe('política de enmarcado compartida', () => {
    it('sin dominios: cualquiera enmarca, pero en solo lectura y con eventos a "*"', () => {
        expect(embedFramePolicy('', 'https://tienda.com')).toEqual({ frameAncestors: 'frame-ancestors *', targetOrigin: '*', soloLectura: true });
    });

    it('con dominios: frame-ancestors acotado y origen exacto solo si el anfitrión está en la lista', () => {
        const p = embedFramePolicy('tienda.com, *.portal.mx', 'https://app.portal.mx');
        expect(p).toEqual({ frameAncestors: "frame-ancestors 'self' tienda.com *.portal.mx", targetOrigin: 'https://app.portal.mx', soloLectura: false });
        expect(embedFramePolicy('tienda.com', 'https://tienda.com.evil.io').targetOrigin).toBe('*');
        expect(embedFramePolicy('tienda.com', 'no-es-url').targetOrigin).toBe('*');
        expect(parseEmbedDomains(' a.com\nb.com ,, ')).toEqual(['a.com', 'b.com']);
    });
});

describe('qué rieles ofrece una factura pública', () => {
    const base = { esNotaCredito: false, esPrueba: false, simulado: false, testMode: false, pagoDisponible: true, aceptaTarjeta: true, mercadoPago: true };
    it('una nota de crédito o un documento de prueba nunca se cobra', () => {
        for (const k of ['esNotaCredito', 'esPrueba', 'simulado', 'testMode'] as const) {
            expect(publicInvoicePayability({ ...base, [k]: true }, true), k).toEqual({ puedePagar: false, puedePagarMp: false });
        }
    });
    it('Mercado Pago no depende de la llave de Stripe', () => {
        expect(publicInvoicePayability(base, false)).toEqual({ puedePagar: false, puedePagarMp: true });
    });
});

describe('<cord-invoice>', () => {
    it('monta /embed/i/{token} y releva cord:paid solo desde el origen de Cord', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const onPaid = vi.fn();
        const ctl = mountCotizador(host, { token: 'abc', document: 'invoice', baseUrl: 'https://cordhq.app', onPaid });
        const iframe = host.querySelector('iframe')!;
        expect(iframe.src).toMatch(/^https:\/\/cordhq\.app\/embed\/i\/abc\?/);
        expect(iframe.title).toBe('Factura');

        const paid = { source: 'cord', type: 'cord:paid', detail: { folio: 'F-1', moneda: 'MXN', saldo: 0 } };
        window.dispatchEvent(new MessageEvent('message', { data: paid, origin: 'https://evil.example', source: iframe.contentWindow }));
        expect(onPaid).not.toHaveBeenCalled();
        window.dispatchEvent(new MessageEvent('message', { data: paid, origin: 'https://cordhq.app', source: iframe.contentWindow }));
        expect(onPaid).toHaveBeenCalledWith({ folio: 'F-1', moneda: 'MXN', saldo: 0 });
        expect(ctl.state.get().paid).toBe(true);
        ctl.destroy();
    });

    it('se registra como elemento y la cotización sigue en /embed/{token}', async () => {
        defineCordElements();
        expect(customElements.get('cord-invoice')).toBeTruthy();
        document.body.innerHTML = '<cord-quote token="q1" base-url="https://cordhq.app"></cord-quote><cord-invoice token="i1" base-url="https://cordhq.app"></cord-invoice>';
        await Promise.resolve();
        const src = (tag: string) => document.querySelector(tag)!.shadowRoot!.querySelector('iframe')!.src;
        expect(src('cord-quote')).toMatch(/\/embed\/q1\?/);
        expect(src('cord-invoice')).toMatch(/\/embed\/i\/i1\?/);
    });

    it('cord:paid deja el estado en pagada', () => {
        expect(reduceQuoteView(INITIAL_QUOTE_VIEW, { type: 'cord:paid', detail: { folio: null, moneda: null, saldo: 0 } }).paid).toBe(true);
    });
});
