// Facturas de muestra de la factura electrónica europea (EN 16931).
//
// Las comparten el vitest rápido (`test/einvoice.test.ts`) y el check contra
// los validadores oficiales (`scripts/einvoice-check.mjs`): lo que el vitest da
// por bueno es exactamente lo que KoSIT, el schematron CEN, el de Peppol y
// veraPDF examinan.
//
// Los importes se arman como los arma Cord al emitir (`invoices.ts`): base de
// la línea = cantidad × precio redondeado; impuesto = base × tasa redondeado
// POR LÍNEA; totales = sumas. Las muestras con descuento de documento pasan por
// el MOTOR real (`calculateDocumentTotals`, el mismo reparto por mayor residuo
// que usa `buildLines`), no por una imitación: lo que se valida es lo que Cord
// guarda.
//
// Node las carga con `--experimental-strip-types` (el motor no tiene imports).

import { calculateDocumentTotals, type DescuentoInput } from '../../packages/elements/src/engine';
import type { FiscalLineItem, FiscalParty } from '../../src/lib/fiscal/index';
import type { EInvoiceFormat, EInvoiceSource } from '../../src/lib/fiscal/einvoice/model';
import type { InvoicePdfInput } from '../../src/lib/fiscal/invoice-pdf';

const cents = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100);
const round2 = (n: number) => cents(n) / 100;

interface LineOptions { discount?: number; unitKey?: string; exemptionReason?: string }

export function sampleLine(description: string, quantity: number, unitPrice: number, taxRate: number, opts: LineOptions = {}): FiscalLineItem {
    const gross = round2(quantity * unitPrice);
    const discount = round2(opts.discount ?? 0);
    const subtotal = round2(gross - discount);
    const taxAmount = round2(subtotal * taxRate);
    return {
        description, quantity, unitPrice, taxRate, subtotal, taxAmount, total: round2(subtotal + taxAmount),
        ...(discount ? { discount } : {}),
        ...(opts.unitKey ? { unitKey: opts.unitKey } : {}),
        ...(opts.exemptionReason ? { exemptionReason: opts.exemptionReason } : {}),
    };
}

/**
 * Líneas con descuento de documento por el motor, mapeadas al contrato fiscal
 * exactamente como `buildLines` (src/lib/fiscal/invoices.ts).
 */
export function engineLines(
    items: { description: string; quantity: number; unitPrice: number; taxRate: number; unitKey?: string; exemptionReason?: string }[],
    opts: { descuento: DescuentoInput; ivaIncluido?: boolean },
): FiscalLineItem[] {
    const totals = calculateDocumentTotals(
        items.map((i) => ({ descripcion: i.description, cantidad: i.quantity, precio_unitario: i.unitPrice, tax_rate: i.taxRate })),
        { ivaIncluido: !!opts.ivaIncluido, roundLines: 2, descuento: opts.descuento },
    );
    return totals.lineas.map((l, i) => ({
        description: items[i].description,
        quantity: l.cantidad,
        unitPrice: Math.round((l.cantidad ? l.base / l.cantidad : l.base) * 1e6) / 1e6,
        taxRate: l.tax_rate,
        subtotal: round2(l.base),
        taxAmount: round2(l.impuesto),
        total: round2(l.total),
        ...(l.descuento > 0 ? { discount: round2(l.descuento) } : {}),
        ...(items[i].unitKey ? { unitKey: items[i].unitKey } : {}),
        ...(items[i].exemptionReason ? { exemptionReason: items[i].exemptionReason } : {}),
    }));
}

function totals(lines: FiscalLineItem[]) {
    const subtotal = lines.reduce((s, l) => s + cents(l.subtotal), 0);
    const taxTotal = lines.reduce((s, l) => s + cents(l.taxAmount), 0);
    return { subtotal: subtotal / 100, taxTotal: taxTotal / 100, total: (subtotal + taxTotal) / 100 };
}

// ── Partes ─────────────────────────────────────────────────────────────────

export const FR_SELLER: FiscalParty = {
    legalName: 'Atelier Lumière SAS', taxId: 'FR40303265045', email: 'compta@atelier-lumiere.fr',
    contactName: 'Claire Martin', phone: '+33 1 23 45 67 89',
    electronicAddress: { scheme: '0225', id: '303265045' },
    address: { line1: '12 rue de la Paix', city: 'Paris', postalCode: '75002', countryCode: 'FR' },
};
const FR_BUYER: FiscalParty = {
    legalName: 'Boulangerie Dupont SARL', taxId: 'FR83404833048', email: 'achats@dupont.fr', contactName: 'Paul Dupont',
    electronicAddress: { scheme: '0225', id: '404833048' },
    address: { line1: '3 avenue Foch', city: 'Lyon', postalCode: '69006', countryCode: 'FR' },
};
export const DE_SELLER: FiscalParty = {
    legalName: 'Muster Software GmbH', taxId: 'DE136695976', email: 'rechnung@muster-software.de',
    contactName: 'Anna Schmidt', phone: '+49 30 1234567',
    electronicAddress: { scheme: '9930', id: 'DE136695976' },
    legalRegistrationId: { id: 'HRB 123456 B' },
    address: { line1: 'Hauptstraße 5', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
};
const DE_AUTHORITY: FiscalParty = {
    legalName: 'Stadt Musterhausen', email: 'eingang@musterhausen.de', contactName: 'Herr Meyer',
    electronicAddress: { scheme: '0204', id: '04011000-1234512345-06' },
    address: { line1: 'Rathausplatz 1', city: 'Musterhausen', postalCode: '12345', countryCode: 'DE' },
};
const DE_BUYER: FiscalParty = {
    legalName: 'Kunde Handels AG', taxId: 'DE811569869', email: 'kreditoren@kunde-ag.de',
    electronicAddress: { scheme: '9930', id: 'DE811569869' },
    address: { line1: 'Ring 1', city: 'Köln', postalCode: '50667', countryCode: 'DE' },
};
const US_BUYER: FiscalParty = {
    legalName: 'Northwind Traders Inc.', taxId: '12-3456789', email: 'ap@northwind.example',
    electronicAddress: { scheme: '0060', id: '150483782' },
    address: { line1: '500 Market Street', city: 'San Francisco', postalCode: '94105', region: 'CA', countryCode: 'US' },
};

// España fuera del territorio del IVA: Canarias (IGIC, provincias 35 y 38) y
// Ceuta y Melilla (IPSI, 51 y 52). `region` es el código INE de la provincia,
// el mismo que guarda Ajustes › Perfil fiscal.
export const CANARIAS_SELLER: FiscalParty = {
    legalName: 'Atlántico Digital SL', taxId: 'B35001239', email: 'facturas@atlanticodigital.es',
    contactName: 'Nayra Santana', phone: '+34 928 123 456',
    electronicAddress: { scheme: '0088', id: '8437000000006' },
    address: { line1: 'Calle Triana 12', city: 'Las Palmas de Gran Canaria', postalCode: '35002', region: '35', countryCode: 'ES' },
};
const CANARIAS_BUYER: FiscalParty = {
    legalName: 'Hoteles Teide SA', taxId: 'A38007894', email: 'proveedores@hotelesteide.es',
    electronicAddress: { scheme: '0088', id: '8437000000013' },
    address: { line1: 'Avenida de Anaga 40', city: 'Santa Cruz de Tenerife', postalCode: '38001', region: '38', countryCode: 'ES' },
};
export const CEUTA_SELLER: FiscalParty = {
    legalName: 'Estrecho Servicios SL', taxId: 'B51004562', email: 'admin@estrechoservicios.es',
    contactName: 'Hamid Mohamed', phone: '+34 956 123 456',
    electronicAddress: { scheme: '0088', id: '8437000000020' },
    address: { line1: 'Paseo del Revellín 5', city: 'Ceuta', postalCode: '51001', region: '51', countryCode: 'ES' },
};
const MADRID_BUYER: FiscalParty = {
    legalName: 'Distribuciones Centro SL', taxId: 'B28003218', email: 'cuentas@dcentro.es',
    electronicAddress: { scheme: '9920', id: 'ESB28003218' },
    address: { line1: 'Calle de Alcalá 100', city: 'Madrid', postalCode: '28009', region: '28', countryCode: 'ES' },
};

const ISSUED = { status: 'issued', lifecycle: 'open', currency: 'EUR' } as const;

// ── Muestras ───────────────────────────────────────────────────────────────

export interface EInvoiceSample {
    id: string;
    title: string;
    source: EInvoiceSource;
    /** Formatos que la muestra DEBE poder generar. */
    formats: EInvoiceFormat[];
    /** Categorías UNTDID 5305 esperadas en el desglose, en orden. */
    categories: string[];
}

function sample(id: string, title: string, formats: EInvoiceFormat[], categories: string[], src: Omit<EInvoiceSource, 'subtotal' | 'taxTotal' | 'total'>): EInvoiceSample {
    return { id, title, formats, categories, source: { ...src, ...totals(src.lines) } };
}

const ALL: EInvoiceFormat[] = ['facturx', 'xrechnung', 'xrechnung-cii', 'peppol'];


export const EINVOICE_SAMPLES: EInvoiceSample[] = [
    sample('fr-b2b', 'Francia, B2B nacional con dos tasas', ALL, ['S', 'S', 'S'], {
        ...ISSUED, invoiceNumber: 'F-2026-000123', documentType: 'commercial_invoice', countryCode: 'FR',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Paris', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'DUP-ACH-2026', purchaseOrder: 'PO-7781', notes: 'Merci pour votre confiance.',
        issuer: FR_SELLER, recipient: FR_BUYER,
        lines: [
            sampleLine('Conseil stratégique (heures)', 10, 100, 0.2, { unitKey: 'HUR' }),
            sampleLine('Livre « Œuvres complètes »', 2, 50, 0.055),
            sampleLine('Transport', 1, 35, 0.1),
        ],
        iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP', accountName: 'Atelier Lumière SAS',
    }),
    sample('de-leitweg', 'Alemania, administración pública con Leitweg-ID', ALL, ['S'], {
        ...ISSUED, invoiceNumber: 'RE2026-000045', documentType: 'commercial_invoice', countryCode: 'DE',
        issuedAt: '2026-10-08T22:30:00Z', timeZone: 'Europe/Berlin', dueDate: '2026-11-08', paymentTermsCode: 'net30',
        buyerReference: '04011000-1234512345-06', serviceDate: '2026-09-01', serviceDateEnd: '2026-09-30',
        notes: 'Vielen Dank für Ihren Auftrag.',
        issuer: DE_SELLER, recipient: DE_AUTHORITY,
        lines: [
            sampleLine('Wartungsvertrag September', 1, 1000, 0.19, { unitKey: 'MON' }),
            sampleLine('Support', 5, 100, 0.19, { unitKey: 'HUR' }),
        ],
        iban: 'DE89370400440532013000', bic: 'COBADEFFXXX', accountName: 'Muster Software GmbH',
    }),
    sample('intra-eu-ae', 'Servicio intracomunitario, inversión del sujeto pasivo (DE → FR)', ALL, ['AE'], {
        ...ISSUED, invoiceNumber: 'RE2026-000046', documentType: 'commercial_invoice', countryCode: 'DE',
        issuedAt: '2026-10-08T09:00:00Z', timeZone: 'Europe/Berlin', dueDate: '2026-10-22', paymentTermsCode: 'net14',
        buyerReference: 'DUP-IT-55', purchaseOrder: 'PO-9921', serviceDate: '2026-10-01',
        issuer: DE_SELLER, recipient: FR_BUYER,
        lines: [
            sampleLine('Softwareentwicklung', 32, 95, 0, { unitKey: 'HUR' }),
            sampleLine('Projektleitung', 4, 120, 0, { unitKey: 'HUR' }),
        ],
        iban: 'DE89370400440532013000', bic: 'COBADEFFXXX',
    }),
    sample('intra-eu-k', 'Entrega intracomunitaria de bienes (FR → DE)', ALL, ['K'], {
        ...ISSUED, invoiceNumber: 'F-2026-000124', documentType: 'commercial_invoice', countryCode: 'FR',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Paris', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'KH-EK-2026-17', purchaseOrder: '4500012345',
        issuer: FR_SELLER, recipient: DE_BUYER,
        lines: [
            sampleLine('Luminaire suspendu, laiton', 12, 245.5, 0, { exemptionReason: 'VATEX-EU-IC' }),
            sampleLine('Ampoule LED E27', 48, 6.35, 0, { exemptionReason: 'VATEX-EU-IC' }),
        ],
        iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
    }),
    sample('export-g', 'Exportación fuera de la UE (FR → EE. UU.)', ALL, ['G'], {
        ...ISSUED, invoiceNumber: 'F-2026-000125', documentType: 'commercial_invoice', countryCode: 'FR',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Paris', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'NW-AP-0042', purchaseOrder: 'NW-PO-31337',
        issuer: FR_SELLER, recipient: US_BUYER,
        lines: [sampleLine('Licence logicielle annuelle', 1, 4800, 0)],
        iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
    }),
    sample('mixed-rates', 'Tasas mezcladas con una exenta (DE: 19 %, 7 % y exención art. 132)', ALL, ['E', 'S', 'S'], {
        ...ISSUED, invoiceNumber: 'RE2026-000047', documentType: 'commercial_invoice', countryCode: 'DE',
        issuedAt: '2026-10-08T09:00:00Z', timeZone: 'Europe/Berlin', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'KH-2026-0815',
        issuer: DE_SELLER, recipient: DE_BUYER,
        lines: [
            sampleLine('Beratung', 8, 125, 0.19, { unitKey: 'HUR' }),
            sampleLine('Fachbuch', 3, 49.9, 0.07),
            sampleLine('Schulung (Bildungsleistung)', 1, 600, 0, { exemptionReason: 'VATEX-EU-132' }),
        ],
        iban: 'DE89370400440532013000', bic: 'COBADEFFXXX',
    }),
    sample('credit-note', 'Nota de crédito de una factura alemana', ALL, ['S'], {
        ...ISSUED, invoiceNumber: 'RE2026-000048', documentType: 'commercial_credit_note', countryCode: 'DE',
        issuedAt: '2026-10-09T09:00:00Z', timeZone: 'Europe/Berlin',
        buyerReference: '04011000-1234512345-06', notes: 'Gutschrift wegen doppelt berechneter Supportstunden.',
        creditNoteOf: { number: 'RE2026-000045', issuedAt: '2026-10-08T22:30:00Z' },
        issuer: DE_SELLER, recipient: DE_AUTHORITY,
        lines: [sampleLine('Support (Korrektur)', 2, 100, 0.19, { unitKey: 'HUR' })],
    }),
    sample('discount', 'Descuento de documento del 10 % repartido en dos tasas (FR)', ALL, ['S', 'S'], {
        ...ISSUED, invoiceNumber: 'F-2026-000126', documentType: 'commercial_invoice', countryCode: 'FR',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Paris', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'DUP-FORM-2026',
        issuer: FR_SELLER, recipient: FR_BUYER,
        lines: engineLines([
            { description: 'Conseil stratégique', quantity: 6, unitPrice: 180, taxRate: 0.2, unitKey: 'DAY' },
            { description: 'Ouvrage « Méthodes »', quantity: 3, unitPrice: 39.9, taxRate: 0.055 },
            { description: 'Atelier collectif', quantity: 1, unitPrice: 450, taxRate: 0.2 },
        ], { descuento: { tipo: 'porcentaje', valor: 10 } }),
        iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
    }),
    sample('discount-ttc', 'Cupón de 50 € sobre precios con IVA incluido, alemán con tres tasas', ALL, ['E', 'S', 'S'], {
        ...ISSUED, invoiceNumber: 'RE2026-000050', documentType: 'commercial_invoice', countryCode: 'DE',
        issuedAt: '2026-10-08T09:00:00Z', timeZone: 'Europe/Berlin', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'KH-2026-0817', purchaseOrder: '4500012399',
        issuer: DE_SELLER, recipient: DE_BUYER,
        // La línea exenta también recibe su parte del cupón: el grupo E lleva su
        // propio descuento de documento (BG-20 con categoría E).
        lines: engineLines([
            { description: 'Schreibtischlampe', quantity: 3, unitPrice: 89.99, taxRate: 0.19 },
            { description: 'Fachbuch Lichtplanung', quantity: 2, unitPrice: 34.9, taxRate: 0.07 },
            { description: 'Montage vor Ort', quantity: 1.5, unitPrice: 76.5, taxRate: 0.19, unitKey: 'HUR' },
            { description: 'Versicherungsvermittlung', quantity: 1, unitPrice: 25, taxRate: 0, exemptionReason: 'VATEX-EU-135-1' },
        ], { descuento: { tipo: 'monto', valor: 50 }, ivaIncluido: true }),
        iban: 'DE89370400440532013000', bic: 'COBADEFFXXX',
    }),
    sample('rounding', 'Redondeo con muchas líneas y precios de tres o cuatro decimales (DE)', ALL, ['S', 'S'], {
        ...ISSUED, invoiceNumber: 'RE2026-000049', documentType: 'commercial_invoice', countryCode: 'DE',
        issuedAt: '2026-10-08T09:00:00Z', timeZone: 'Europe/Berlin', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'KH-2026-0816',
        issuer: DE_SELLER, recipient: DE_BUYER,
        lines: [
            sampleLine('Kleinteil A', 3, 33.333, 0.19),
            sampleLine('Kleinteil B', 7, 1.4286, 0.19),
            sampleLine('Kleinteil C', 12, 0.0833, 0.19),
            sampleLine('Kleinteil D', 1.25, 17.39, 0.19, { unitKey: 'KGM' }),
            sampleLine('Kleinteil E', 0.5, 99.99, 0.07, { unitKey: 'KGM' }),
            sampleLine('Kleinteil F', 13, 0.155, 0.07),
            sampleLine('Kleinteil G', 9, 2.225, 0.19),
            sampleLine('Kleinteil H', 11, 0.045, 0.19),
            sampleLine('Kleinteil I', 2.5, 3.333, 0.07, { unitKey: 'LTR' }),
            sampleLine('Kleinteil J', 17, 0.385, 0.19),
            sampleLine('Kleinteil K', 1000, 0.00125, 0.19),
            sampleLine('Kleinteil L', 6, 8.4175, 0.07),
        ],
        iban: 'DE89370400440532013000',
    }),
    sample('fr-franchise', 'Francia, franquicia en base (art. 293 B del CGI)', ['facturx', 'peppol'], ['E'], {
        ...ISSUED, invoiceNumber: 'F-2026-000007', documentType: 'commercial_invoice', countryCode: 'FR',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Paris', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        purchaseOrder: 'BC-2026-14',
        issuer: { ...FR_SELLER, legalName: 'Claire Martin EI', taxId: '303265045', vatRegime: 'small_business' },
        recipient: FR_BUYER,
        lines: [sampleLine('Création graphique', 1, 850, 0)],
        iban: 'FR7630006000011234567890189',
    }),
    sample('igic', 'Canarias: IGIC 7 % y 3 % (categoría L)', ALL, ['L', 'L'], {
        ...ISSUED, invoiceNumber: 'AD-2026-000311', documentType: 'commercial_invoice', countryCode: 'ES',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Atlantic/Canary', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'HT-COMPRAS-2026', purchaseOrder: 'PED-4471',
        issuer: CANARIAS_SELLER, recipient: CANARIAS_BUYER,
        lines: [
            sampleLine('Mantenimiento de la red wifi', 12, 85, 0.07, { unitKey: 'HUR' }),
            sampleLine('Guía impresa de uso', 40, 4.5, 0.03),
        ],
        iban: 'ES9121000418450200051332', bic: 'CAIXESBBXXX',
    }),
    sample('igic-zero', 'Canarias: IGIC 7 % con un concepto al 0 % (sin CII)', ['xrechnung', 'peppol'], ['L', 'L'], {
        ...ISSUED, invoiceNumber: 'AD-2026-000312', documentType: 'commercial_invoice', countryCode: 'ES',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Atlantic/Canary', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'HT-COMPRAS-2026',
        issuer: CANARIAS_SELLER, recipient: CANARIAS_BUYER,
        lines: [
            sampleLine('Licencia anual del software de reservas', 1, 1200, 0.07),
            sampleLine('Pan y bollería', 30, 1.2, 0),
        ],
        iban: 'ES9121000418450200051332', bic: 'CAIXESBBXXX',
    }),
    sample('ipsi', 'Ceuta: IPSI 4 %, 10 % y 0 % (categoría M)', ALL, ['M', 'M', 'M'], {
        ...ISSUED, invoiceNumber: 'ES-2026-000052', documentType: 'commercial_invoice', countryCode: 'ES',
        issuedAt: '2026-10-08T10:00:00Z', timeZone: 'Europe/Madrid', dueDate: '2026-11-07', paymentTermsCode: 'net30',
        buyerReference: 'DC-PROV-0193', purchaseOrder: 'OC-2026-77',
        issuer: CEUTA_SELLER, recipient: MADRID_BUYER,
        lines: [
            sampleLine('Asesoría logística', 6, 70, 0.04, { unitKey: 'HUR' }),
            sampleLine('Transporte marítimo de mercancía', 1, 320, 0.1),
            sampleLine('Material formativo', 10, 12.5, 0),
        ],
        iban: 'ES9121000418450200051332',
    }),
];

/** La entrada del PDF de siempre para una muestra, como la arma `invoicePdfInput`. */
export function samplePdfInput(src: EInvoiceSource): InvoicePdfInput {
    return {
        invoiceNumber: src.invoiceNumber, countryCode: src.countryCode, documentType: src.documentType,
        currency: src.currency, subtotal: src.subtotal, taxTotal: src.taxTotal, total: src.total,
        issuedAt: src.issuedAt, timeZone: src.timeZone ?? null,
        issuer: src.issuer, recipient: src.recipient, lines: src.lines,
        dueDate: src.dueDate ?? null, serviceDate: src.serviceDate ?? null, serviceDateEnd: src.serviceDateEnd ?? null,
        paymentTermsCode: src.paymentTermsCode ?? null,
        reference: [src.buyerReference, src.purchaseOrder].filter(Boolean).join(' · ') || null,
        creditNoteOfNumber: src.creditNoteOf?.number ?? null,
        documentNotes: src.notes ?? null,
        paymentInstructions: src.iban ? `IBAN ${src.iban}${src.bic ? ` · BIC ${src.bic}` : ''}` : null,
        brandColor: '#0a192f',
    };
}
