import { describe, expect, it } from 'vitest';
import { DOCUMENTOS_DE_RIELES, RIELES, etiquetaDocumentoRiel } from '../src/lib/fiscal/latam/rieles';

describe('etiquetas de los documentos de riel', () => {
    it('todo document_type de un riel tiene nombre en los dos idiomas', () => {
        for (const type of DOCUMENTOS_DE_RIELES) {
            for (const locale of ['es', 'en'] as const) {
                const label = etiquetaDocumentoRiel(type, locale);
                expect(label, `${type} (${locale})`).toBeTruthy();
                expect(label).not.toContain('_');
            }
        }
    });

    it('nombra la factura con la etiqueta del riel y las notas con su autoridad', () => {
        expect(etiquetaDocumentoRiel(RIELES.dian.documentos.factura, 'es')).toBe('Factura electrónica DIAN');
        expect(etiquetaDocumentoRiel(RIELES.dian.documentos.factura, 'en')).toBe('DIAN e-invoice');
        expect(etiquetaDocumentoRiel('sii_debit_note', 'es')).toBe('Nota de débito SII');
        expect(etiquetaDocumentoRiel('arca_credit_note', 'en')).toBe('Credit note ARCA');
    });

    it('devuelve null fuera de los rieles', () => {
        expect(etiquetaDocumentoRiel('cfdi_40', 'es')).toBeNull();
        expect(etiquetaDocumentoRiel('proforma', 'en')).toBeNull();
    });
});
