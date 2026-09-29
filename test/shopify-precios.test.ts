import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/db', () => ({ sql: vi.fn(), withOrgTx: vi.fn() }));
vi.mock('../src/lib/integraciones/shopify/service', () => ({ accessToken: vi.fn() }));
const { primeraLista } = await import('../src/lib/integraciones/shopify/precios');

describe('lista de precios B2B del cliente', () => {
    it('toma la primera lista de las ubicaciones de su empresa', () => {
        const r = primeraLista({ companyContactProfiles: [{
            company: { name: 'Aceros del Norte' },
            roleAssignments: { nodes: [
                { companyLocation: { catalogs: { nodes: [{}] } } },
                { companyLocation: { catalogs: { nodes: [{ priceList: { currency: 'MXN', prices: { nodes: [] } } }] } } },
            ] },
        }] });
        expect(r?.empresa).toBe('Aceros del Norte');
        expect(r?.lista.currency).toBe('MXN');
    });

    it('sin empresa o sin lista no hay nada que aplicar', () => {
        expect(primeraLista(null)).toBeNull();
        expect(primeraLista({ companyContactProfiles: [] })).toBeNull();
        expect(primeraLista({ companyContactProfiles: [{ roleAssignments: { nodes: [{ companyLocation: { catalogs: { nodes: [] } } }] } }] })).toBeNull();
    });
});
