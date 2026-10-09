// Facturas de muestra de la factura electrónica de la solución pública de la
// AEAT (SPFE, Orden HAC/1028/2026, Anexo I). Las comparten el vitest
// (`test/spfe.test.ts`) y el check contra el XSD oficial de UBL 2.5
// (`scripts/spfe-check.mjs`): lo que uno da por bueno es lo que el otro valida.
//
// Salen de las muestras de Facturae (`einvoice-samples.ts`) —las mismas partes
// y el mismo motor de totales que usa Cord al emitir— cambiando solo lo que la
// SPFE necesita ver: sin retenciones (su correspondencia en UBL no está
// publicada), con cliente establecido en España, en otra divisa, pagada al
// expedirse, rectificativa, IGIC y periodo de prestación.

import { CANARIAS_SELLER, FACTURAE_SAMPLES, engineDocument } from './einvoice-samples';
import type { SpfeSource } from '../../src/lib/fiscal/spfe/factura';

const base = (id: string) => {
    const s = FACTURAE_SAMPLES.find((x) => x.id === id);
    if (!s) throw new Error(`spfe-samples: no existe la muestra ${id}`);
    return s.source;
};

const QR = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B28003218&numserie=DC-2026-0412&fecha=08-10-2026&importe=1013.94';

export interface SpfeSample {
    id: string;
    title: string;
    source: SpfeSource;
    /** Tipo de factura esperado (L1). */
    tipo: '380' | '384';
    /** Calificador de BT-ES-24 esperado en cada línea. */
    impuesto: 'IVA' | 'IGIC' | 'IPSI';
}

const mixto = base('fe-mixto');
const irpf = base('fe-irpf');
const igic = base('fe-igic-irpf');

export const SPFE_SAMPLES: SpfeSample[] = [
    {
        id: 'spfe-mixto', title: 'IVA 21 % y 10 %, línea exenta (art. 20), descuento del 10 % y QR de VERI*FACTU',
        tipo: '380', impuesto: 'IVA',
        source: { ...mixto, qrUrl: QR },
    },
    {
        id: 'spfe-ipsi', title: 'Ceuta: IPSI 4 % y 0 %',
        tipo: '380', impuesto: 'IPSI',
        source: base('fe-ipsi'),
    },
    {
        id: 'spfe-igic', title: 'Canarias: IGIC 7 % y 0 %, sin retención',
        tipo: '380', impuesto: 'IGIC',
        source: {
            ...igic, invoiceNumber: 'AD-2026-0044', issuer: CANARIAS_SELLER, retenciones: [], retencionTotal: 0,
            ...engineDocument([
                { description: 'Mantenimiento de la web de reservas', quantity: 3, unitPrice: 180, taxRate: 0.07, unitKey: 'MON' },
                { description: 'Copias impresas', quantity: 20, unitPrice: 3, taxRate: 0 },
            ]),
        },
    },
    {
        id: 'spfe-pagada', title: 'Pagada al expedirse: fecha efectiva de pago (BT-ES-2) y total a pagar cero',
        tipo: '380', impuesto: 'IVA',
        source: {
            ...irpf, invoiceNumber: 'LP-2026-0019', retenciones: [], retencionTotal: 0, pagadaEl: '2026-10-08',
            ...engineDocument([{ description: 'Sesión de fotografía de producto', quantity: 1, unitPrice: 600, taxRate: 0.21 }]),
        },
    },
    {
        id: 'spfe-rectificativa', title: 'Rectificativa por diferencias (384, R1, I) de una factura sin retención',
        tipo: '384', impuesto: 'IVA',
        source: {
            ...base('fe-rectificativa'), invoiceNumber: 'DC-2026-0415', issuer: mixto.issuer, recipient: irpf.recipient,
            creditNoteOf: { number: 'DC-2026-0412', issuedAt: '2026-10-08T10:00:00Z' },
            tipoRectificativa: 'R1', retenciones: [], retencionTotal: 0,
            ...engineDocument([{ description: 'Material de oficina devuelto', quantity: 2, unitPrice: 14.95, taxRate: 0.21, unitKey: 'C62' }]),
        },
    },
    {
        id: 'spfe-usd', title: 'En dólares: la cuota del IVA también en euros (BT-6 y BT-111)',
        tipo: '380', impuesto: 'IVA',
        source: {
            ...mixto, invoiceNumber: 'DC-2026-0416', currency: 'USD', ledgerCurrency: 'EUR', fxRate: 0.92, iban: null,
            ...engineDocument([{ description: 'Licencia anual de software', quantity: 1, unitPrice: 1200, taxRate: 0.21 }]),
        },
    },
    {
        id: 'spfe-inversion', title: 'Inversión del sujeto pasivo nacional (S2) y periodo de prestación',
        tipo: '380', impuesto: 'IVA',
        source: {
            ...mixto, invoiceNumber: 'DC-2026-0417', serviceDate: '2026-09-01', serviceDateEnd: '2026-09-30',
            ...engineDocument([{ description: 'Ejecución de obra: reforma de nave', quantity: 1, unitPrice: 8400, taxRate: 0, exemptionReason: 'S2' }]),
        },
    },
    {
        id: 'spfe-fecha-operacion', title: 'Fecha de la operación distinta de la expedición (BT-7)',
        tipo: '380', impuesto: 'IVA',
        source: {
            ...mixto, invoiceNumber: 'DC-2026-0418', serviceDate: '2026-10-01', serviceDateEnd: null,
            ...engineDocument([{ description: 'Formación presencial', quantity: 6, unitPrice: 75, taxRate: 0.21, unitKey: 'HUR' }]),
        },
    },
];

/** Facturas que NO van por la SPFE o a las que les falta algo, con el problema que deben dar. */
export const SPFE_FUERA: { id: string; source: SpfeSource; problema: string }[] = [
    { id: 'irpf', source: irpf, problema: 'spfe_retenciones' },
    { id: 'cliente-extranjero', source: base('fe-intra-ue'), problema: 'spfe_fuera_de_ambito' },
    { id: 'cliente-sin-nif', source: { ...mixto, recipient: { ...mixto.recipient, taxId: '' } }, problema: 'spfe_nif_cliente' },
    { id: 'cliente-sin-cp', source: { ...mixto, recipient: { ...mixto.recipient, address: { ...mixto.recipient.address!, countryCode: 'ES', postalCode: '' } } }, problema: 'spfe_direccion_cliente' },
    { id: 'foral', source: { ...mixto, issuer: { ...mixto.issuer, address: { ...mixto.issuer.address!, countryCode: 'ES', region: '48', city: 'Bilbao', postalCode: '48001' } } }, problema: 'spfe_foral' },
    { id: 'rectifica-simplificada', source: { ...base('fe-rectificativa'), retenciones: [], retencionTotal: 0, tipoRectificativa: 'R5', ...engineDocument([{ description: 'Devolución', quantity: 1, unitPrice: 10, taxRate: 0.21 }]) }, problema: 'spfe_simplificada' },
    { id: 'otra-divisa-sin-euros', source: { ...mixto, currency: 'USD', ledgerCurrency: 'USD', fxRate: null }, problema: 'spfe_divisa' },
];
