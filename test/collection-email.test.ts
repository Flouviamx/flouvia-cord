import { describe, expect, it } from 'vitest';
import { renderCollectionEmail } from '../src/lib/agents/cobranza-run';

describe('correo de cobranza', () => {
    it('identifica acreedor, automatización, contacto y baja', () => {
        const html = renderCollectionEmail({
            cuerpo: 'Tu saldo está vencido.',
            payUrl: 'https://cordhq.app/q/token/pay',
            cobraOnline: true,
            montoBoton: 1200,
            idioma: 'es',
            creditorName: 'Comercial Ejemplo SA',
            creditorTaxId: 'EJE010101ABC',
            contactEmail: 'cobranza@example.com',
        });
        expect(html).toContain('Comercial Ejemplo SA');
        expect(html).toContain('EJE010101ABC');
        expect(html).toContain('mensaje automatizado de cobranza');
        expect(html).toContain('detengan los mensajes automáticos');
        expect(html).toContain('cobranza@example.com');
    });

    it('escapa la identidad del acreedor', () => {
        const html = renderCollectionEmail({
            cuerpo: 'Balance due', payUrl: 'https://cordhq.app/q/x', cobraOnline: false,
            montoBoton: 20, idioma: 'en', creditorName: '<script>alert(1)</script>',
        });
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
