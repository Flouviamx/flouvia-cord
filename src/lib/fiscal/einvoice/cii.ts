// UN/CEFACT Cross Industry Invoice (CII D16B) para dos perfiles:
//
//   - Factur-X / ZUGFeRD, perfil EN 16931 (el XML `factur-x.xml` que va dentro
//     del PDF/A-3). Identificador BT-24 `urn:cen.eu:en16931:2017`
//     (Factur-X 1.07.2, tabla del BT-24).
//   - XRechnung 3.0 en sintaxis CII. Identificador
//     `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0`
//     (el que reconoce el escenario CII de la configuración oficial del
//     validador KoSIT, XRechnung 3.0.2).
//
// El ORDEN de los elementos es el de las <xs:sequence> del esquema D16B, no el
// del modelo semántico: las líneas van ANTES de los acuerdos de cabecera, y en
// `ApplicableTradeTax` el importe calculado va antes que la base. Un elemento
// fuera de sitio rompe el XSD. `scripts/einvoice-check.mjs` valida cada
// variante contra el XSD y los schematron oficiales.

import { amount, cii102, decimal, el, group, percent } from './xml';
import type { En16931Invoice, EnParty, VatCategory } from './model';

export type CiiProfile = 'facturx-en16931' | 'xrechnung';

export const CII_GUIDELINE: Record<CiiProfile, string> = {
    'facturx-en16931': 'urn:cen.eu:en16931:2017',
    xrechnung: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
};
/** BT-23. Peppol billing 01, el proceso que declara XRechnung. */
const BUSINESS_PROCESS = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

const NS = [
    'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
    'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
    'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
    'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"',
].join(' ');

const date102 = (tag: string, isoDay: string | undefined, ns: 'udt' | 'qdt' = 'udt') =>
    isoDay ? `<${tag}><${ns}:DateTimeString format="102">${cii102(isoDay)}</${ns}:DateTimeString></${tag}>` : '';

/** BT-34 / BT-49. XRechnung admite el correo (EAS "EM") cuando no hay otra. */
export function endpointOf(party: EnParty, allowEmail: boolean): { scheme: string; id: string } | undefined {
    if (party.electronicAddress) return party.electronicAddress;
    if (allowEmail && party.contact?.email) return { scheme: 'EM', id: party.contact.email };
    return undefined;
}

function tradeParty(tag: string, party: EnParty, allowEmail: boolean, withContact: boolean): string {
    const a = party.address;
    const endpoint = endpointOf(party, allowEmail);
    const c = party.contact;
    return group(tag, [
        el('ram:Name', party.name),
        party.legalId ? group('ram:SpecifiedLegalOrganization', [el('ram:ID', party.legalId.id, { schemeID: party.legalId.scheme })]) : '',
        withContact && c ? group('ram:DefinedTradeContact', [
            el('ram:PersonName', c.name),
            c.phone ? group('ram:TelephoneUniversalCommunication', [el('ram:CompleteNumber', c.phone)]) : '',
            c.email ? group('ram:EmailURIUniversalCommunication', [el('ram:URIID', c.email)]) : '',
        ]) : '',
        group('ram:PostalTradeAddress', [
            el('ram:PostcodeCode', a.postalCode),
            el('ram:LineOne', a.line1),
            el('ram:LineTwo', a.line2),
            el('ram:CityName', a.city),
            el('ram:CountryID', a.country),
            el('ram:CountrySubDivisionName', a.region),
        ]),
        endpoint ? group('ram:URIUniversalCommunication', [el('ram:URIID', endpoint.id, { schemeID: endpoint.scheme })]) : '',
        party.vatId ? group('ram:SpecifiedTaxRegistration', [el('ram:ID', party.vatId, { schemeID: 'VA' })]) : '',
        party.taxRegistrationId ? group('ram:SpecifiedTaxRegistration', [el('ram:ID', party.taxRegistrationId, { schemeID: 'FC' })]) : '',
    ]);
}

/** BT-152 / BT-96: la categoría O no lleva tasa (BR-O-05, BR-O-06). */
const rateEl = (category: VatCategory, rate: number) => (category === 'O' ? '' : el('ram:RateApplicablePercent', percent(rate / 100)));

export function serializeCii(inv: En16931Invoice, profile: CiiProfile): string {
    const xr = profile === 'xrechnung';
    const cur = inv.currency;

    const lines = inv.lines.map((l) => group('ram:IncludedSupplyChainTradeLineItem', [
        group('ram:AssociatedDocumentLineDocument', [el('ram:LineID', l.id)]),
        group('ram:SpecifiedTradeProduct', [el('ram:Name', l.name)]),
        group('ram:SpecifiedLineTradeAgreement', [
            group('ram:NetPriceProductTradePrice', [el('ram:ChargeAmount', decimal(l.netPrice, 10))]),
        ]),
        group('ram:SpecifiedLineTradeDelivery', [el('ram:BilledQuantity', decimal(l.quantity, 6), { unitCode: l.unitCode })]),
        group('ram:SpecifiedLineTradeSettlement', [
            group('ram:ApplicableTradeTax', [
                el('ram:TypeCode', 'VAT'),
                el('ram:CategoryCode', l.category),
                rateEl(l.category, l.rate),
            ]),
            group('ram:SpecifiedTradeSettlementLineMonetarySummation', [el('ram:LineTotalAmount', amount(l.netAmount))]),
        ]),
    ])).join('');

    const agreement = group('ram:ApplicableHeaderTradeAgreement', [
        el('ram:BuyerReference', inv.buyerReference),
        tradeParty('ram:SellerTradeParty', inv.seller, xr, true),
        tradeParty('ram:BuyerTradeParty', inv.buyer, xr, true),
        inv.purchaseOrder ? group('ram:BuyerOrderReferencedDocument', [el('ram:IssuerAssignedID', inv.purchaseOrder)]) : '',
    ]);

    // Vacía es válida: ApplicableHeaderTradeDelivery es obligatoria en CII
    // aunque la factura no declare entrega.
    const deliveryBody = [
        inv.delivery?.country ? group('ram:ShipToTradeParty', [group('ram:PostalTradeAddress', [el('ram:CountryID', inv.delivery.country)])]) : '',
        inv.delivery?.date ? group('ram:ActualDeliverySupplyChainEvent', [date102('ram:OccurrenceDateTime', inv.delivery.date)]) : '',
    ].join('');
    const delivery = deliveryBody ? `<ram:ApplicableHeaderTradeDelivery>${deliveryBody}</ram:ApplicableHeaderTradeDelivery>` : '<ram:ApplicableHeaderTradeDelivery/>';

    const pm = inv.paymentMeans;
    const settlement = group('ram:ApplicableHeaderTradeSettlement', [
        el('ram:PaymentReference', pm?.remittance),
        el('ram:TaxCurrencyCode', inv.taxCurrency),
        el('ram:InvoiceCurrencyCode', cur),
        pm ? group('ram:SpecifiedTradeSettlementPaymentMeans', [
            el('ram:TypeCode', pm.code),
            pm.iban ? group('ram:PayeePartyCreditorFinancialAccount', [el('ram:IBANID', pm.iban), el('ram:AccountName', pm.accountName)]) : '',
            pm.bic ? group('ram:PayeeSpecifiedCreditorFinancialInstitution', [el('ram:BICID', pm.bic)]) : '',
        ]) : '',
        ...inv.vat.map((v) => group('ram:ApplicableTradeTax', [
            el('ram:CalculatedAmount', amount(v.tax)),
            el('ram:TypeCode', 'VAT'),
            el('ram:ExemptionReason', v.exemptionText),
            el('ram:BasisAmount', amount(v.taxable)),
            el('ram:CategoryCode', v.category),
            el('ram:ExemptionReasonCode', v.exemptionCode),
            // En el DESGLOSE la tasa va siempre, también con O (0): BR-O-05/06
            // solo la prohíben en línea y descuento, y XRechnung la exige en
            // todo grupo (BR-DE-14).
            el('ram:RateApplicablePercent', percent(v.rate / 100)),
        ])),
        inv.period ? group('ram:BillingSpecifiedPeriod', [
            date102('ram:StartDateTime', inv.period.start),
            date102('ram:EndDateTime', inv.period.end),
        ]) : '',
        ...inv.allowances.map((a) => group('ram:SpecifiedTradeAllowanceCharge', [
            '<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>',
            el('ram:ActualAmount', amount(a.amount)),
            el('ram:ReasonCode', a.reasonCode),
            el('ram:Reason', a.reason),
            group('ram:CategoryTradeTax', [el('ram:TypeCode', 'VAT'), el('ram:CategoryCode', a.category), rateEl(a.category, a.rate)]),
        ])),
        inv.paymentTerms || inv.dueDate ? group('ram:SpecifiedTradePaymentTerms', [
            el('ram:Description', inv.paymentTerms),
            date102('ram:DueDateDateTime', inv.dueDate),
        ]) : '',
        group('ram:SpecifiedTradeSettlementHeaderMonetarySummation', [
            el('ram:LineTotalAmount', amount(inv.totals.lineNet)),
            inv.totals.allowances > 0 ? el('ram:AllowanceTotalAmount', amount(inv.totals.allowances)) : '',
            el('ram:TaxBasisTotalAmount', amount(inv.totals.taxExclusive)),
            el('ram:TaxTotalAmount', amount(inv.totals.tax), { currencyID: cur }),
            inv.taxCurrency && inv.totals.taxInAccounting !== undefined
                ? el('ram:TaxTotalAmount', amount(inv.totals.taxInAccounting), { currencyID: inv.taxCurrency }) : '',
            el('ram:GrandTotalAmount', amount(inv.totals.taxInclusive)),
            el('ram:DuePayableAmount', amount(inv.totals.payable)),
        ]),
        inv.preceding ? group('ram:InvoiceReferencedDocument', [
            el('ram:IssuerAssignedID', inv.preceding.number),
            date102('ram:FormattedIssueDateTime', inv.preceding.issueDate, 'qdt'),
        ]) : '',
    ]);

    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + `<rsm:CrossIndustryInvoice ${NS}>`
        + group('rsm:ExchangedDocumentContext', [
            xr ? group('ram:BusinessProcessSpecifiedDocumentContextParameter', [el('ram:ID', BUSINESS_PROCESS)]) : '',
            group('ram:GuidelineSpecifiedDocumentContextParameter', [el('ram:ID', CII_GUIDELINE[profile])]),
        ])
        + group('rsm:ExchangedDocument', [
            el('ram:ID', inv.number),
            el('ram:TypeCode', inv.typeCode),
            date102('ram:IssueDateTime', inv.issueDate),
            ...inv.notes.map((n) => group('ram:IncludedNote', [el('ram:Content', n.text), el('ram:SubjectCode', n.subject)])),
        ])
        + `<rsm:SupplyChainTradeTransaction>${lines}${agreement}${delivery}${settlement}</rsm:SupplyChainTradeTransaction>`
        + '</rsm:CrossIndustryInvoice>\n';
}
