// Muestras de la emisión por plataforma autorizada en Francia: un documento de
// cada tratamiento de la reforma (B2B transmitido, B2BINT y B2C reportados),
// derivados de las muestras de factura electrónica (einvoice-samples.ts) para
// no tener dos juegos de datos que diverjan. Las usan `npm run security:fr-pa`
// (cuerpos contra la OpenAPI fijada de Iopole) y test/fr-pa-db.test.ts.

import type { EInvoiceSource } from '../../src/lib/fiscal/einvoice/model';
import type { FiscalParty } from '../../src/lib/fiscal/index';
import { EINVOICE_SAMPLES, sampleLine } from './einvoice-samples';

const base = (id: string): EInvoiceSource => structuredClone(EINVOICE_SAMPLES.find((s) => s.id === id)!.source);
const r2 = (n: number) => Math.round(n * 100) / 100;

function totales(src: EInvoiceSource): EInvoiceSource {
    const subtotal = r2(src.lines.reduce((s, l) => s + l.subtotal, 0));
    const taxTotal = r2(src.lines.reduce((s, l) => s + l.taxAmount, 0));
    return { ...src, subtotal, taxTotal, total: r2(subtotal + taxTotal) };
}

export const PARTICULIER: FiscalParty = {
    legalName: 'Mme Camille Durand', email: 'camille.durand@example.fr',
    address: { line1: '2 rue Basse', city: 'Lyon', postalCode: '69002', countryCode: 'FR' },
};

export interface FrPaSample {
    id: string;
    tratamiento: 'B2B' | 'B2BINT' | 'B2C';
    source: EInvoiceSource;
}

/** Servicios con TVA al cobro (sin la opción por los débitos), entre empresas francesas. */
function b2bServicios(): EInvoiceSource {
    const s = base('fr-ctc-services');
    s.issuer = { ...s.issuer!, vatOnDebits: false };
    return s;
}

export const FR_PA_SAMPLES: FrPaSample[] = [
    { id: 'b2b-servicios', tratamiento: 'B2B', source: b2bServicios() },
    { id: 'b2b-mixte-debits', tratamiento: 'B2B', source: base('fr-ctc-mixte') },
    { id: 'b2b-biens', tratamiento: 'B2B', source: { ...base('fr-ctc-biens-usd') } },
    {
        id: 'b2bint-biens-ue', tratamiento: 'B2BINT', source: (() => {
            const s = base('intra-eu-k');
            s.lines = s.lines.map((l) => ({ ...l, nature: 'goods' as const }));
            return s;
        })(),
    },
    {
        id: 'b2bint-services-hors-ue', tratamiento: 'B2BINT', source: (() => {
            const s = base('export-g');
            s.lines = s.lines.map((l) => ({ ...l, nature: 'services' as const }));
            return s;
        })(),
    },
    {
        id: 'b2c-services', tratamiento: 'B2C', source: totales({
            ...b2bServicios(), invoiceNumber: 'F-2026-000301', recipient: PARTICULIER, buyerReference: null, purchaseOrder: null,
            lines: [sampleLine('Cours particulier (heures)', 3, 45, 0.2, { unitKey: 'HUR', nature: 'services' })],
        }),
    },
    {
        id: 'b2c-mixte', tratamiento: 'B2C', source: totales({
            ...b2bServicios(), invoiceNumber: 'F-2026-000302', recipient: PARTICULIER, buyerReference: null, purchaseOrder: null,
            lines: [
                sampleLine('Lampe de chevet', 2, 89, 0.2, { nature: 'goods' }),
                sampleLine('Livre « Lumières »', 1, 32, 0.055, { nature: 'goods' }),
                sampleLine('Installation à domicile', 1, 60, 0.1, { nature: 'services' }),
            ],
        }),
    },
];

export const frPaSample = (id: string) => structuredClone(FR_PA_SAMPLES.find((s) => s.id === id)!);
