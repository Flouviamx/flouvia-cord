import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn(), resolvePublicQuote: vi.fn(), resolveIntegracion: vi.fn() }));
vi.mock('../src/lib/actions/quotes', () => ({ runQuoteAction: vi.fn() }));
const { firmaSlackValida, tokenDeLink, bloquesCotizacion, dinero } = await import('../src/lib/integraciones/slack-app');

const firmar = (secret: string, ts: string, body: string) => 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');

describe('app de Slack', () => {
    it('acepta solo lo firmado con el signing secret y reciente', () => {
        const ahora = 1_790_000_000_000;
        const ts = String(Math.floor(ahora / 1000));
        const body = 'token=x&team_id=T0C3JUM5NJY&text=COT-1';
        expect(firmaSlackValida('s3cr3t', ts, body, firmar('s3cr3t', ts, body), ahora)).toBe(true);
        expect(firmaSlackValida('s3cr3t', ts, body + '&x=1', firmar('s3cr3t', ts, body), ahora)).toBe(false);
        expect(firmaSlackValida('otro', ts, body, firmar('s3cr3t', ts, body), ahora)).toBe(false);
        const viejo = String(Math.floor(ahora / 1000) - 600);
        expect(firmaSlackValida('s3cr3t', viejo, body, firmar('s3cr3t', viejo, body), ahora)).toBe(false);
        expect(firmaSlackValida('', ts, body, firmar('', ts, body), ahora)).toBe(false);
    });

    it('reconoce el token de un link de cotización en cualquier dominio', () => {
        expect(tokenDeLink('https://cordhq.app/q/abcDEF123456')).toBe('abcDEF123456');
        expect(tokenDeLink('https://cotiza.minegocio.com/q/abcDEF123456/')).toBe('abcDEF123456');
        expect(tokenDeLink('https://cordhq.app/app/cotizaciones/abc')).toBeNull();
        expect(tokenDeLink('no es url')).toBeNull();
    });

    it('la tarjeta escapa lo que escribe el cliente y lleva la divisa', () => {
        const blocks = bloquesCotizacion({ id: 'q1', folio: 'COT-1', empresa: '<https://evil|Da clic>', status: 'viewed', total: 1500, base_currency: 'USD' }, 'es');
        const texto = JSON.stringify(blocks);
        expect(texto).toContain('&lt;https://evil|Da clic&gt;');
        expect(texto).toContain('USD');
        expect(dinero(1000, 'JPY', 'en')).not.toContain('.00');
    });
});
