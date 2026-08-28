import { describe, it, expect } from 'vitest';
import {
    documentosPara, documentoSugerido, llevaReverso, exigePasaporte, relacionDeAspecto,
} from '../src/lib/identity-documents';

const MERCADOS = ['MX', 'US', 'CA', 'BR', 'ES', 'GB', 'DE', 'FR'] as const;

describe('catálogo por país', () => {
    it('cubre los ocho mercados con cobro en línea', () => {
        for (const pais of MERCADOS) {
            const docs = documentosPara(pais);
            expect(docs.length, pais).toBeGreaterThan(0);
            // El pasaporte es la única categoría universal: siempre debe estar,
            // porque es lo único que sirve en el caso transfronterizo.
            expect(docs.some((d) => d.tipo === 'pasaporte'), pais).toBe(true);
        }
    });

    it('usa el nombre local del documento, no uno genérico', () => {
        expect(documentoSugerido('MX').nombre).toMatch(/INE/);
        expect(documentoSugerido('ES').nombre).toMatch(/DNI/);
        expect(documentoSugerido('DE').nombre).toMatch(/Personalausweis/);
        expect(documentoSugerido('BR').nombre).toMatch(/CNH/);
        expect(documentoSugerido('FR').nombre).toMatch(/identité/);
    });

    it('cae a las tres categorías confirmadas fuera del catálogo', () => {
        const docs = documentosPara('JP');
        expect(docs.map((d) => d.tipo).sort()).toEqual(['id_nacional', 'licencia', 'pasaporte']);
    });
});

describe('reverso', () => {
    it('el pasaporte nunca lleva reverso', () => {
        for (const pais of MERCADOS) expect(llevaReverso(pais, 'pasaporte'), pais).toBe(false);
    });

    it('las tarjetas de identidad y licencias sí', () => {
        expect(llevaReverso('MX', 'id_nacional')).toBe(true);
        expect(llevaReverso('US', 'licencia')).toBe(true);
        expect(llevaReverso('ES', 'residencia')).toBe(true);
    });
});

describe('regla transfronteriza', () => {
    // Verificada literal en la doc del proveedor: "Si el país de residencia
    // difiere del país de la cuenta, se requerirá un pasaporte".
    it('exige pasaporte cuando la residencia no es el país de la cuenta', () => {
        expect(exigePasaporte('MX', 'US')).toBe(true);
        expect(exigePasaporte('ES', 'AR')).toBe(true);
    });

    it('no lo exige cuando coinciden', () => {
        expect(exigePasaporte('MX', 'MX')).toBe(false);
        expect(exigePasaporte('DE', 'DE')).toBe(false);
    });

    it('no lo exige cuando falta el dato — Cord no persiste el domicilio', () => {
        expect(exigePasaporte('MX', null)).toBe(false);
        expect(exigePasaporte('MX', '')).toBe(false);
    });

    it('cuando aplica, ofrece SÓLO pasaporte', () => {
        // Ofrecer una INE aquí lleva a un rechazo garantizado del proveedor.
        const docs = documentosPara('MX', { soloPasaporte: true });
        expect(docs).toHaveLength(1);
        expect(docs[0].tipo).toBe('pasaporte');
    });
});

describe('marco guía', () => {
    it('usa la relación real de cada familia, no una inventada', () => {
        // El marco medía 1.23:1, que no corresponde a ningún documento.
        expect(relacionDeAspecto('id_nacional')).toBeCloseTo(85.6 / 54, 2);
        expect(relacionDeAspecto('licencia')).toBeCloseTo(1.586, 2);
        expect(relacionDeAspecto('pasaporte')).toBeCloseTo(1.42, 2);
    });
});
