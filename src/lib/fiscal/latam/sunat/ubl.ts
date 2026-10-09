// Serialización UBL 2.1 de la factura (Invoice) y la nota de crédito
// (CreditNote) según el Anexo N.° 9-A [RS 123-2022 anexo IV; RS 340-2017
// anexo VII-d], con los elementos en el orden de las <sequence> de los XSD
// OASIS UBL 2.1 (scripts/fixtures/sunat/ubl-2.1/, validados con xmllint por
// scripts/sunat-check.mjs).
//
// El XML se escribe YA en su forma canónica (Canonical XML 1.0, inclusiva):
// sin espacios entre elementos, declaraciones de namespace ordenadas en la
// raíz, atributos ordenados, etiquetas de apertura y cierre en elementos
// vacíos y el escape de texto de C14N. Así el valor resumen (DigestValue)
// se calcula sobre exactamente estos bytes (firma.ts) y sunat-check.mjs lo
// contrasta con el canonicalizador de libxml2 (`xmllint --c14n`).
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { AFECTACION, CARGO_RETENCION_IGV, CUSTOMIZATION_ID, DESCUENTO_AFECTA_BASE, FORMA_PAGO, LEYENDA_MONTO_LETRAS, NS_UBL, PRECIO_UNITARIO_CON_IGV, TIPO_DOC, TRIBUTO, UBL_VERSION } from './constantes.ts';
import { idComprobante, type LineaSunat, type SolicitudSunat } from './comprobante.ts';

/** Id de la firma (ds:Signature/@Id) y su referencia desde cac:Signature. */
export const ID_FIRMA = 'SignatureCord';

// Caracteres inválidos en XML 1.0: rompen el documento entero.
const XML_INVALID = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;

/** Escape de texto de C14N: &, <, > y el retorno de carro. Las comillas quedan literales. */
export function escTexto(value: unknown): string {
    return String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r/g, '&#xD;');
}

/** Escape de atributo de C14N. */
export function escAtributo(value: unknown): string {
    return String(value ?? '')
        .replace(XML_INVALID, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;')
        .replace(/\t/g, '&#x9;')
        .replace(/\n/g, '&#xA;')
        .replace(/\r/g, '&#xD;');
}

/** Elemento con texto y atributos sin prefijo (C14N: ordenados por nombre). */
function el(nombre: string, valor: string | number, attrs: Record<string, string> = {}): string {
    const a = Object.keys(attrs).sort().map((k) => ` ${k}="${escAtributo(attrs[k])}"`).join('');
    return `<${nombre}${a}>${escTexto(valor)}</${nombre}>`;
}

/** Elemento opcional: sin valor no se escribe (nunca como etiqueta vacía). */
function opt(nombre: string, valor: string | number | undefined | null, attrs: Record<string, string> = {}): string {
    return valor === undefined || valor === null || valor === '' ? '' : el(nombre, valor, attrs);
}

const monto = (moneda: string) => (nombre: string, valor: string) => el(nombre, valor, { currencyID: moneda });

/** Declaraciones de namespace de la raíz, en el orden de C14N (la por defecto primero, luego por prefijo). */
export function nsRaiz(tipo: SolicitudSunat['tipo']): string {
    const defecto = tipo === TIPO_DOC.NOTA_CREDITO ? NS_UBL.creditNote : NS_UBL.invoice;
    return `xmlns="${defecto}" xmlns:cac="${NS_UBL.cac}" xmlns:cbc="${NS_UBL.cbc}" xmlns:ds="${NS_UBL.ds}" xmlns:ext="${NS_UBL.ext}"`;
}

function firmante(s: SolicitudSunat): string {
    return '<cac:Signature>'
        + el('cbc:ID', `ID${ID_FIRMA}`)
        + `<cac:SignatoryParty><cac:PartyIdentification>${el('cbc:ID', s.ruc)}</cac:PartyIdentification>`
        + `<cac:PartyName>${el('cbc:Name', s.razonSocial)}</cac:PartyName></cac:SignatoryParty>`
        + `<cac:DigitalSignatureAttachment><cac:ExternalReference>${el('cbc:URI', `#${ID_FIRMA}`)}</cac:ExternalReference></cac:DigitalSignatureAttachment>`
        + '</cac:Signature>';
}

function partes(s: SolicitudSunat): string {
    const emisor = '<cac:AccountingSupplierParty><cac:Party>'
        + `<cac:PartyIdentification>${el('cbc:ID', s.ruc, { schemeID: '6' })}</cac:PartyIdentification>`
        + (s.nombreComercial ? `<cac:PartyName>${el('cbc:Name', s.nombreComercial)}</cac:PartyName>` : '')
        + '<cac:PartyLegalEntity>'
        + el('cbc:RegistrationName', s.razonSocial)
        + `<cac:RegistrationAddress>${el('cbc:AddressTypeCode', s.establecimiento)}</cac:RegistrationAddress>`
        + '</cac:PartyLegalEntity>'
        + '</cac:Party></cac:AccountingSupplierParty>';
    const receptor = '<cac:AccountingCustomerParty><cac:Party>'
        + `<cac:PartyIdentification>${el('cbc:ID', s.receptor.numDoc, { schemeID: s.receptor.tipoDoc })}</cac:PartyIdentification>`
        + `<cac:PartyLegalEntity>${el('cbc:RegistrationName', s.receptor.nombre)}</cac:PartyLegalEntity>`
        + '</cac:Party></cac:AccountingCustomerParty>';
    return emisor + receptor;
}

function tributo(afectacion: LineaSunat['afectacion']): string {
    const t = TRIBUTO[afectacion];
    return `<cac:TaxScheme>${el('cbc:ID', t.id)}${el('cbc:Name', t.nombre)}${el('cbc:TaxTypeCode', t.codigo)}</cac:TaxScheme>`;
}

/** TaxTotal del documento: un TaxSubtotal por afectación presente. */
function totalTributos(s: SolicitudSunat): string {
    const m = monto(s.moneda);
    const t = s.totales;
    const grupos: [LineaSunat['afectacion'], string][] = [
        [AFECTACION.GRAVADO, t.gravadas],
        [AFECTACION.EXONERADO, t.exoneradas],
        [AFECTACION.INAFECTO, t.inafectas],
        [AFECTACION.EXPORTACION, t.exportacion],
    ];
    const presentes = grupos.filter(([af]) => s.lineas.some((l) => l.afectacion === af));
    return '<cac:TaxTotal>'
        + m('cbc:TaxAmount', t.igv)
        + presentes.map(([af, base]) => '<cac:TaxSubtotal>'
            + m('cbc:TaxableAmount', base)
            + m('cbc:TaxAmount', af === AFECTACION.GRAVADO ? t.igv : '0.00')
            + `<cac:TaxCategory>${tributo(af)}</cac:TaxCategory>`
            + '</cac:TaxSubtotal>').join('')
        + '</cac:TaxTotal>';
}

function totalesMonetarios(s: SolicitudSunat): string {
    const m = monto(s.moneda);
    return '<cac:LegalMonetaryTotal>'
        + m('cbc:LineExtensionAmount', s.totales.valorVenta)
        + m('cbc:TaxInclusiveAmount', s.totales.precioVenta)
        + m('cbc:PayableAmount', s.totales.importeTotal)
        + '</cac:LegalMonetaryTotal>';
}

function linea(s: SolicitudSunat, l: LineaSunat, nc: boolean): string {
    const m = monto(s.moneda);
    const tag = nc ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
    const cantidad = nc ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
    const descuento = l.descuento
        ? '<cac:AllowanceCharge>'
            + el('cbc:ChargeIndicator', 'false')
            + el('cbc:AllowanceChargeReasonCode', DESCUENTO_AFECTA_BASE)
            + el('cbc:MultiplierFactorNumeric', l.descuento.factor)
            + m('cbc:Amount', l.descuento.monto)
            + m('cbc:BaseAmount', l.descuento.base)
            + '</cac:AllowanceCharge>'
        : '';
    return `<${tag}>`
        + el('cbc:ID', l.id)
        + el(cantidad, l.cantidad, { unitCode: l.unidad })
        + m('cbc:LineExtensionAmount', l.valorVenta)
        + '<cac:PricingReference><cac:AlternativeConditionPrice>'
        + m('cbc:PriceAmount', l.precioUnitario)
        + el('cbc:PriceTypeCode', PRECIO_UNITARIO_CON_IGV)
        + '</cac:AlternativeConditionPrice></cac:PricingReference>'
        + descuento
        + '<cac:TaxTotal>'
        + m('cbc:TaxAmount', l.igv)
        + '<cac:TaxSubtotal>'
        + m('cbc:TaxableAmount', l.valorVenta)
        + m('cbc:TaxAmount', l.igv)
        + '<cac:TaxCategory>'
        + el('cbc:Percent', l.porcentaje)
        + el('cbc:TaxExemptionReasonCode', l.afectacion)
        + tributo(l.afectacion)
        + '</cac:TaxCategory>'
        + '</cac:TaxSubtotal>'
        + '</cac:TaxTotal>'
        + `<cac:Item>${el('cbc:Description', l.descripcion)}</cac:Item>`
        + `<cac:Price>${m('cbc:PriceAmount', l.valorUnitario)}</cac:Price>`
        + `</${tag}>`;
}

function formaDePago(s: SolicitudSunat): string {
    const f = s.formaPago;
    if (!f) return '';
    const m = monto(s.moneda);
    if (f.tipo === FORMA_PAGO.CONTADO) {
        return `<cac:PaymentTerms>${el('cbc:ID', 'FormaPago')}${el('cbc:PaymentMeansID', FORMA_PAGO.CONTADO)}</cac:PaymentTerms>`;
    }
    return `<cac:PaymentTerms>${el('cbc:ID', 'FormaPago')}${el('cbc:PaymentMeansID', FORMA_PAGO.CREDITO)}${m('cbc:Amount', f.montoNeto)}</cac:PaymentTerms>`
        + f.cuotas.map((c, i) => '<cac:PaymentTerms>'
            + el('cbc:ID', 'FormaPago')
            + el('cbc:PaymentMeansID', `Cuota${String(i + 1).padStart(3, '0')}`)
            + m('cbc:Amount', c.monto)
            + el('cbc:PaymentDueDate', c.vence)
            + '</cac:PaymentTerms>').join('');
}

function retencion(s: SolicitudSunat): string {
    if (!s.retencion) return '';
    const m = monto(s.moneda);
    return '<cac:AllowanceCharge>'
        + el('cbc:ChargeIndicator', 'false')
        + el('cbc:AllowanceChargeReasonCode', CARGO_RETENCION_IGV)
        + el('cbc:MultiplierFactorNumeric', s.retencion.factor)
        + m('cbc:Amount', s.retencion.monto)
        + m('cbc:BaseAmount', s.retencion.base)
        + '</cac:AllowanceCharge>';
}

/**
 * El comprobante en forma canónica, sin declaración XML. `extension` es el
 * contenido de ext:ExtensionContent: vacío para calcular el valor resumen
 * (la transformación enveloped-signature retira la firma) y la firma al
 * final.
 */
export function xmlComprobante(s: SolicitudSunat, extension = ''): string {
    if (!s.numero) throw new Error('sunat: el comprobante no tiene número');
    const nc = s.tipo === TIPO_DOC.NOTA_CREDITO;
    const raiz = nc ? 'CreditNote' : 'Invoice';
    const cabecera = '<ext:UBLExtensions><ext:UBLExtension>'
        + `<ext:ExtensionContent>${extension}</ext:ExtensionContent>`
        + '</ext:UBLExtension></ext:UBLExtensions>'
        + el('cbc:UBLVersionID', UBL_VERSION)
        + el('cbc:CustomizationID', CUSTOMIZATION_ID)
        + el('cbc:ID', idComprobante(s))
        + el('cbc:IssueDate', s.fecha)
        + el('cbc:IssueTime', s.hora);
    const leyenda = el('cbc:Note', s.leyendaLetras, { languageLocaleID: LEYENDA_MONTO_LETRAS });
    const lineas = s.lineas.map((l) => linea(s, l, nc)).join('');

    if (nc) {
        const ref = s.notaCredito!.referencia;
        const refId = `${ref.serie}-${ref.numero}`;
        return `<${raiz} ${nsRaiz(s.tipo)}>`
            + cabecera
            + leyenda
            + el('cbc:DocumentCurrencyCode', s.moneda)
            + el('cbc:LineCountNumeric', s.lineas.length)
            + '<cac:DiscrepancyResponse>'
            + el('cbc:ReferenceID', refId)
            + el('cbc:ResponseCode', s.notaCredito!.tipoNota)
            + el('cbc:Description', s.notaCredito!.motivo)
            + '</cac:DiscrepancyResponse>'
            + `<cac:BillingReference><cac:InvoiceDocumentReference>${el('cbc:ID', refId)}${el('cbc:DocumentTypeCode', ref.tipo)}</cac:InvoiceDocumentReference></cac:BillingReference>`
            + firmante(s)
            + partes(s)
            + totalTributos(s)
            + totalesMonetarios(s)
            + lineas
            + `</${raiz}>`;
    }

    const entrega = s.paisServicio
        ? `<cac:Delivery><cac:DeliveryLocation><cac:Address><cac:Country>${el('cbc:IdentificationCode', s.paisServicio)}</cac:Country></cac:Address></cac:DeliveryLocation></cac:Delivery>`
        : '';
    return `<${raiz} ${nsRaiz(s.tipo)}>`
        + cabecera
        + opt('cbc:DueDate', s.vencimiento)
        + el('cbc:InvoiceTypeCode', s.tipo, { listID: s.tipoOperacion ?? '' })
        + leyenda
        + el('cbc:DocumentCurrencyCode', s.moneda)
        + el('cbc:LineCountNumeric', s.lineas.length)
        + firmante(s)
        + partes(s)
        + entrega
        + formaDePago(s)
        + retencion(s)
        + totalTributos(s)
        + totalesMonetarios(s)
        + lineas
        + `</${raiz}>`;
}
