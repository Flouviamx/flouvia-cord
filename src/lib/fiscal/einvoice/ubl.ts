// OASIS UBL 2.1 Invoice / CreditNote para dos especificaciones:
//
//   - Peppol BIS Billing 3.0: CustomizationID
//     `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0`
//     y ProfileID `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0`
//     (PEPPOL-EN16931-R004 y R007 del schematron 3.0.21).
//   - XRechnung 3.0 en UBL: CustomizationID
//     `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`
//     (escenario UBL del validador KoSIT, XRechnung 3.0.2), con el mismo
//     ProfileID de Peppol que usan sus ejemplos oficiales.
//
// Orden de elementos: el de las <xs:sequence> de UBL-Invoice-2.1.xsd y
// UBL-CreditNote-2.1.xsd. No son iguales: la nota de crédito no tiene
// `cbc:DueDate` (BT-9 va en `cac:PaymentMeans/cbc:PaymentDueDate`) y su
// `cbc:TaxPointDate` va antes del tipo. Cada variante se valida contra el XSD
// y los schematron oficiales en `scripts/einvoice-check.mjs`.

import { amount, decimal, el, group, percent } from './xml';
import { endpointOf } from './cii';
import type { En16931Invoice, EnParty, VatCategory } from './model';

export type UblProfile = 'peppol' | 'xrechnung';

export const UBL_CUSTOMIZATION: Record<UblProfile, string> = {
    peppol: 'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0',
    xrechnung: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
};
export const UBL_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

function party(tag: string, p: EnParty, allowEmail: boolean): string {
    const a = p.address;
    const endpoint = endpointOf(p, allowEmail);
    const c = p.contact;
    return group(tag, [group('cac:Party', [
        endpoint ? el('cbc:EndpointID', endpoint.id, { schemeID: endpoint.scheme }) : '',
        group('cac:PostalAddress', [
            el('cbc:StreetName', a.line1),
            el('cbc:AdditionalStreetName', a.line2),
            el('cbc:CityName', a.city),
            el('cbc:PostalZone', a.postalCode),
            el('cbc:CountrySubentity', a.region),
            group('cac:Country', [el('cbc:IdentificationCode', a.country)]),
        ]),
        p.vatId ? group('cac:PartyTaxScheme', [el('cbc:CompanyID', p.vatId), group('cac:TaxScheme', [el('cbc:ID', 'VAT')])]) : '',
        // BT-32: registro fiscal local con un esquema distinto de VAT.
        p.taxRegistrationId ? group('cac:PartyTaxScheme', [el('cbc:CompanyID', p.taxRegistrationId), group('cac:TaxScheme', [el('cbc:ID', 'FC')])]) : '',
        group('cac:PartyLegalEntity', [
            el('cbc:RegistrationName', p.name),
            p.legalId ? el('cbc:CompanyID', p.legalId.id, { schemeID: p.legalId.scheme }) : '',
        ]),
        c ? group('cac:Contact', [el('cbc:Name', c.name), el('cbc:Telephone', c.phone), el('cbc:ElectronicMail', c.email)]) : '',
    ])]);
}

function taxCategory(tag: string, category: VatCategory, rate: number, extra: { code?: string; text?: string; breakdown?: boolean } = {}): string {
    return group(tag, [
        el('cbc:ID', category),
        // La categoría O no lleva tasa en línea ni en descuento (BR-O-05/06).
        // En el desglose sí, en 0: XRechnung la exige en todo grupo (BR-DE-14).
        category === 'O' && !extra.breakdown ? '' : el('cbc:Percent', percent(rate / 100)),
        el('cbc:TaxExemptionReasonCode', extra.code),
        el('cbc:TaxExemptionReason', extra.text),
        group('cac:TaxScheme', [el('cbc:ID', 'VAT')]),
    ]);
}

export function serializeUbl(inv: En16931Invoice, profile: UblProfile): string {
    const credit = inv.typeCode === '381';
    const root = credit ? 'CreditNote' : 'Invoice';
    const xr = profile === 'xrechnung';
    const cur = inv.currency;
    const money = (n: number, currency = cur) => ({ currencyID: currency, v: amount(n) });
    const m = (tag: string, n: number, currency = cur) => { const x = money(n, currency); return el(tag, x.v, { currencyID: x.currencyID }); };

    // En UBL el código de asunto (BT-21) va al principio del texto entre
    // almohadillas: "#PMT#…" (vínculo sintáctico de EN 16931-3-2). Peppol
    // admite una sola nota salvo entre dos empresas alemanas
    // (PEPPOL-EN16931-R002): varias se unen en una, sin códigos.
    const bothDe = inv.seller.address.country === 'DE' && inv.buyer.address.country === 'DE';
    const notes = profile === 'peppol' && inv.notes.length > 1 && !bothDe
        ? [inv.notes.map((n) => n.text).join('\n')]
        : inv.notes.map((n) => (n.subject ? `#${n.subject}#${n.text}` : n.text));
    const pm = inv.paymentMeans;

    const head = [
        el('cbc:CustomizationID', UBL_CUSTOMIZATION[profile]),
        el('cbc:ProfileID', UBL_PROFILE_ID),
        el('cbc:ID', inv.number),
        el('cbc:IssueDate', inv.issueDate),
        !credit ? el('cbc:DueDate', inv.dueDate) : '',
        el(credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', inv.typeCode),
        ...notes.map((n) => el('cbc:Note', n)),
        el('cbc:DocumentCurrencyCode', cur),
        el('cbc:TaxCurrencyCode', inv.taxCurrency),
        el('cbc:BuyerReference', inv.buyerReference),
        inv.period ? group('cac:InvoicePeriod', [el('cbc:StartDate', inv.period.start), el('cbc:EndDate', inv.period.end)]) : '',
        inv.purchaseOrder ? group('cac:OrderReference', [el('cbc:ID', inv.purchaseOrder)]) : '',
        inv.preceding ? group('cac:BillingReference', [group('cac:InvoiceDocumentReference', [
            el('cbc:ID', inv.preceding.number),
            el('cbc:IssueDate', inv.preceding.issueDate),
        ])]) : '',
        party('cac:AccountingSupplierParty', inv.seller, xr),
        party('cac:AccountingCustomerParty', inv.buyer, xr),
        inv.delivery ? group('cac:Delivery', [
            el('cbc:ActualDeliveryDate', inv.delivery.date),
            inv.delivery.country ? group('cac:DeliveryLocation', [group('cac:Address', [group('cac:Country', [el('cbc:IdentificationCode', inv.delivery.country)])])]) : '',
        ]) : '',
        pm ? group('cac:PaymentMeans', [
            el('cbc:PaymentMeansCode', pm.code),
            el('cbc:PaymentID', pm.remittance),
            pm.iban ? group('cac:PayeeFinancialAccount', [
                el('cbc:ID', pm.iban),
                el('cbc:Name', pm.accountName),
                pm.bic ? group('cac:FinancialInstitutionBranch', [el('cbc:ID', pm.bic)]) : '',
            ]) : '',
        ]) : '',
        inv.paymentTerms ? group('cac:PaymentTerms', [el('cbc:Note', inv.paymentTerms)]) : '',
        ...inv.allowances.map((a) => group('cac:AllowanceCharge', [
            el('cbc:ChargeIndicator', 'false'),
            el('cbc:AllowanceChargeReasonCode', a.reasonCode),
            el('cbc:AllowanceChargeReason', a.reason),
            m('cbc:Amount', a.amount),
            taxCategory('cac:TaxCategory', a.category, a.rate),
        ])),
        group('cac:TaxTotal', [
            m('cbc:TaxAmount', inv.totals.tax),
            ...inv.vat.map((v) => group('cac:TaxSubtotal', [
                m('cbc:TaxableAmount', v.taxable),
                m('cbc:TaxAmount', v.tax),
                taxCategory('cac:TaxCategory', v.category, v.rate, { code: v.exemptionCode, text: v.exemptionText, breakdown: true }),
            ])),
        ]),
        // BT-111: el IVA en la divisa contable, en un TaxTotal sin desglose
        // (BR-53, PEPPOL-EN16931-R054).
        inv.taxCurrency && inv.totals.taxInAccounting !== undefined
            ? group('cac:TaxTotal', [m('cbc:TaxAmount', inv.totals.taxInAccounting, inv.taxCurrency)]) : '',
        group('cac:LegalMonetaryTotal', [
            m('cbc:LineExtensionAmount', inv.totals.lineNet),
            m('cbc:TaxExclusiveAmount', inv.totals.taxExclusive),
            m('cbc:TaxInclusiveAmount', inv.totals.taxInclusive),
            inv.totals.allowances > 0 ? m('cbc:AllowanceTotalAmount', inv.totals.allowances) : '',
            m('cbc:PayableAmount', inv.totals.payable),
        ]),
    ];

    const lines = inv.lines.map((l) => group(credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine', [
        el('cbc:ID', l.id),
        el(credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', decimal(l.quantity, 6), { unitCode: l.unitCode }),
        m('cbc:LineExtensionAmount', l.netAmount),
        group('cac:Item', [
            el('cbc:Name', l.name),
            taxCategory('cac:ClassifiedTaxCategory', l.category, l.rate),
        ]),
        group('cac:Price', [el('cbc:PriceAmount', decimal(l.netPrice, 10), { currencyID: cur })]),
    ]));

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + `<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="${NS_CAC}" xmlns:cbc="${NS_CBC}">`
        + head.join('') + lines.join('')
        + `</${root}>\n`;
}
