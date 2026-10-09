// Factur-X (ZUGFeRD) perfil EN 16931: el PDF de la factura como PDF/A-3b con
// su XML CII incrustado.
//
// Contrato verificado contra la especificación Factur-X 1.07.2 (FNFE-MPE /
// FeRD, 15 nov 2024), capítulo 6:
//   - el XML se incrusta SIEMPRE como `factur-x.xml`, a nivel de documento
//     (arreglo /AF del catálogo), §6.2 y §6.2.1;
//   - relación de datos (AFRelationship) para el perfil EN 16931: Francia
//     admite Alternative, Source o Data y Alemania exige Alternative (tabla del
//     §6.2.2). El PDF y el XML de Cord salen del MISMO snapshot y dicen lo
//     mismo, que es exactamente lo que define Alternative, y vale en los dos;
//   - XMP con el esquema de extensión `urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`,
//     prefijo `fx`, y DocumentType INVOICE, DocumentFileName factur-x.xml,
//     Version 1.0 y ConformanceLevel "EN 16931" (§6.3.1, BR-HYBRID-03..10).
//
// Puro: recibe la entrada del PDF y las fuentes ya cargadas, no toca la base
// de datos. Lo usan la descarga, el correo y `scripts/einvoice-check.mjs`.

import { createInvoicePdf, type InvoicePdfInput } from '../invoice-pdf';
import { buildPdfA, xmlEscape, type loadArchivalFonts } from '../../pdf/pdfa';
import { serializeCii } from './cii';
import type { En16931Invoice } from './model';

export const FACTURX_FILENAME = 'factur-x.xml';
export const FACTURX_NS = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';
export const FACTURX_CONFORMANCE = 'EN 16931';

const prop = (name: string, description: string) =>
    '<rdf:li rdf:parseType="Resource">'
    + `<pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType>`
    + `<pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;

/** El esquema de extensión PDF/A de Factur-X y sus cuatro propiedades. */
export function facturXXmp(): string {
    return '<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" '
        + 'xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">'
        + '<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">'
        + '<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>'
        + `<pdfaSchema:namespaceURI>${FACTURX_NS}</pdfaSchema:namespaceURI>`
        + '<pdfaSchema:prefix>fx</pdfaSchema:prefix>'
        + '<pdfaSchema:property><rdf:Seq>'
        + prop('DocumentFileName', 'The name of the embedded XML document')
        + prop('DocumentType', 'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER')
        + prop('Version', 'The actual version of the standard applying to the embedded XML document')
        + prop('ConformanceLevel', 'The conformance level of the embedded XML document')
        + '</rdf:Seq></pdfaSchema:property></rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>\n'
        + `<rdf:Description rdf:about="" xmlns:fx="${FACTURX_NS}">`
        + '<fx:DocumentType>INVOICE</fx:DocumentType>'
        + `<fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>`
        + '<fx:Version>1.0</fx:Version>'
        + `<fx:ConformanceLevel>${xmlEscape(FACTURX_CONFORMANCE)}</fx:ConformanceLevel>`
        + '</rdf:Description>\n';
}

const LANG_TAG: Record<string, string> = { es: 'es-ES', en: 'en', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' };

/**
 * El Factur-X completo. `pdfInput` es la misma entrada que produce el PDF
 * normal (marca, condiciones, importes del snapshot); `invoice`, el modelo
 * EN 16931 del mismo documento.
 */
export function buildFacturX(
    pdfInput: InvoicePdfInput,
    invoice: En16931Invoice,
    fonts: Awaited<ReturnType<typeof loadArchivalFonts>>,
): { pdf: Buffer; xml: string } {
    const xml = serializeCii(invoice, 'facturx-en16931');
    // La fecha de los metadatos es la de expedición, no la de la descarga: el
    // mismo documento produce siempre el mismo archivo.
    const date = new Date(`${invoice.issueDate}T12:00:00Z`);
    const pdf = createInvoicePdf({
        ...pdfInput,
        assemble: (doc) => buildPdfA(doc, fonts, {
            title: `${invoice.typeCode === '381' ? 'Credit note' : 'Invoice'} ${invoice.number}`,
            author: invoice.seller.name,
            subject: `Factur-X ${FACTURX_CONFORMANCE}`,
            creator: 'Cord',
            producer: 'Cord',
            lang: LANG_TAG[invoice.lang] ?? 'en',
            date,
            attachments: [{
                name: FACTURX_FILENAME,
                mime: 'text/xml',
                data: Buffer.from(xml, 'utf8'),
                relationship: 'Alternative',
                description: `Factur-X ${FACTURX_CONFORMANCE}`,
            }],
            xmpExtra: facturXXmp(),
        }),
    });
    return { pdf, xml };
}
