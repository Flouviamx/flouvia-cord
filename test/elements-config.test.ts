import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TERM_CODES } from '../src/lib/payment-terms';

const m = vi.hoisted(() => ({ fail: false, org: {} as Record<string, unknown>, impuestos: [] as Record<string, unknown>[] }));

vi.mock('../src/lib/db', () => ({
    sql: (strings: TemplateStringsArray) => strings.join('?'),
    withOrgTx: async () => {
        if (m.fail) throw new Error('neon caído');
        return [[m.org], m.impuestos];
    },
}));

const { buildElementsConfig } = await import('../src/lib/elements-config');
const { TaxCatalogUnavailableError } = await import('../src/lib/impuestos-db');

describe('buildElementsConfig', () => {
    beforeEach(() => {
        m.fail = false;
        m.org = { nombre: 'Taller Ruiz', country_code: 'ES', idioma: 'es-ES', moneda: 'EUR', iva_pct: 21, iva_incluido_defecto: false, color_marca: '#123456', logo_url: null, vigencia_default_dias: 15, terminos_default: 'net30' };
        m.impuestos = [
            { id: 'i1', nombre: 'IVA 21%', kind: 'consumo', tipo: 'iva', tasa: 21, es_default: true, activo: true },
            { id: 'i2', nombre: 'IVA 10%', kind: 'consumo', tipo: 'iva', tasa: 10, es_default: false, activo: true },
            { id: 'i3', nombre: 'IRPF 15%', kind: 'retencion', tipo: 'ret_isr', tasa: 15, es_default: true, activo: true, retencion_base: 'subtotal' },
        ];
    });

    it('describe la organización con su divisa, impuestos por línea y retenciones', async () => {
        const c = await buildElementsConfig('org-a');
        expect(c.org).toMatchObject({ pais: 'ES', locale: 'es', moneda: 'EUR' });
        expect(c.monedas).toContain('EUR');
        expect(c.impuestos.etiqueta).toBe('IVA');
        expect(c.impuestos.opciones.map((o) => o.rate)).toEqual([0, 0.1, 0.21]);
        expect(c.impuestos.tasa_default).toBe(0.21);
        expect(c.impuestos.retenciones).toEqual([{ nombre: 'IRPF 15%', tasa: 0.15, base: 'subtotal' }]);
        expect(c.terminos_default).toBe('net30');
        expect(c.vigencia_dias_default).toBe(15);
        expect(c.fiscal).toEqual({ pais: 'ES', reglas_propias: true });
    });

    it('no expone costos ni datos del CRM', async () => {
        const json = JSON.stringify(await buildElementsConfig('org-a'));
        expect(json).not.toMatch(/costo|email|rfc|cliente/i);
    });

    it('falla cerrado si no puede leer el catálogo', async () => {
        m.fail = true;
        await expect(buildElementsConfig('org-a')).rejects.toBeInstanceOf(TaxCatalogUnavailableError);
    });

    it('nunca inventa un término que el servidor no acepta', async () => {
        m.org.terminos_default = 'net120';
        expect((await buildElementsConfig('org-a')).terminos_default).toBe('contado');
    });

    it('ofrece todos los plazos de payment-terms.ts y respeta el default de la org', async () => {
        m.org.terminos_default = 'net90';
        const config = await buildElementsConfig('org-a');
        expect(config.terminos_default).toBe('net90');
        expect(config.terminos).toEqual([...TERM_CODES]);
    });
});
