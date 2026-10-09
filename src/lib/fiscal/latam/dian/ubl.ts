// XML UBL 2.1 con las extensiones de la DIAN [AT 6.1 Invoice, 6.2
// CreditNote, 6.3 DebitNote, 6.4 AttachedDocument], a partir de una
// SolicitudDian ya validada (comprobante.ts).
//
// El orden de cada elemento es el de la <xsd:sequence> de los esquemas
// OFICIALES (scripts/fixtures/dian/xsd/, Caja de herramientas v1.9);
// scripts/dian-check.mjs valida con xmllint cada documento que este archivo
// sabe armar. Los atributos y literales salen del Anexo (ver constantes.ts).
//
// El documento sale SIN firmar, con el segundo UBLExtension vacío: firma.ts
// lo resume en ese estado (transformación enveloped) y después inserta ahí la
// ds:Signature.
//
// Puro.

import { E, opcional, cdata, type Nodo } from './xml.ts';
import {
    AGENCIA_DIAN, CUSTOMIZATION_ID, INVOICE_SOURCE, MEDIO_PAGO_NO_DEFINIDO, NIT_DIAN, NS, PROFILE_ID,
    RAZON_DESCUENTO_LINEA, TIPO_DOCUMENTO, TRIBUTO, TRIBUTOS_PARTE, UBL_VERSION, UNIDAD,
} from './constantes.ts';
import { importe, ubicacion, type AdquirienteDian, type EmisorDian, type LineaDian, type SolicitudDian, type SubtotalDian } from './comprobante.ts';

/** Declaraciones de namespace de la raíz. firma.ts las necesita para la forma canónica de los subárboles firmados. */
export function namespacesRaiz(clase: SolicitudDian['clase'] | 'contenedor'): Record<string, string> {
    const def = clase === 'factura' ? NS.invoice : clase === 'nota_credito' ? NS.creditNote : clase === 'nota_debito' ? NS.debitNote : NS.attached;
    return {
        xmlns: def,
        'xmlns:cac': NS.cac,
        'xmlns:cbc': NS.cbc,
        'xmlns:ds': NS.ds,
        'xmlns:ext': NS.ext,
        ...(clase === 'contenedor' ? {} : { 'xmlns:sts': NS.sts }),
        'xmlns:xades': NS.xades,
        'xmlns:xades141': NS.xades141,
    };
}

const dian = (schemeID?: string | null, schemeName?: string | null) => ({
    schemeAgencyID: AGENCIA_DIAN.id,
    schemeAgencyName: AGENCIA_DIAN.nombre,
    schemeID: schemeID ?? undefined,
    schemeName: schemeName ?? undefined,
});

const monto = (moneda: string, nombre: string, valor: string) => E(nombre, { currencyID: moneda }, valor);

// ── Extensiones de la DIAN [AT FAB01–FAB36] ──────────────────────────────────

function dianExtensions(s: SolicitudDian): Nodo {
    const r = s.resolucion;
    return E('sts:DianExtensions', null,
        r && E('sts:InvoiceControl', null,
            E('sts:InvoiceAuthorization', null, r.numero),
            E('sts:AuthorizationPeriod', null, E('cbc:StartDate', null, r.vigenteDesde), E('cbc:EndDate', null, r.vigenteHasta)),
            E('sts:AuthorizedInvoices', null,
                opcional('sts:Prefix', r.prefijo),
                E('sts:From', null, r.desde),
                E('sts:To', null, r.hasta))),
        E('sts:InvoiceSource', null,
            E('cbc:IdentificationCode', {
                listAgencyID: INVOICE_SOURCE.listAgencyID,
                listAgencyName: INVOICE_SOURCE.listAgencyName,
                listSchemeURI: INVOICE_SOURCE.listSchemeURI,
            }, INVOICE_SOURCE.pais)),
        // Software propio: el proveedor del software es el propio facturador.
        E('sts:SoftwareProvider', null,
            E('sts:ProviderID', dian(s.emisor.dv, '31'), s.emisor.nit),
            E('sts:SoftwareID', { schemeAgencyID: AGENCIA_DIAN.id, schemeAgencyName: AGENCIA_DIAN.nombre }, s.softwareId)),
        E('sts:SoftwareSecurityCode', { schemeAgencyID: AGENCIA_DIAN.id, schemeAgencyName: AGENCIA_DIAN.nombre }, s.codigoSeguridad),
        E('sts:AuthorizationProvider', null,
            E('sts:AuthorizationProviderID', dian(NIT_DIAN.dv, '31'), NIT_DIAN.nit)),
        E('sts:QRCode', null, s.qrUrl));
}

function extensiones(contenido: Nodo | null): Nodo {
    return E('ext:UBLExtensions', null,
        contenido && E('ext:UBLExtension', null, E('ext:ExtensionContent', null, contenido)),
        // Aquí va la firma (firma.ts).
        E('ext:UBLExtension', null, E('ext:ExtensionContent', null)));
}

// ── Partes ───────────────────────────────────────────────────────────────────

function direccion(nombre: string, e: EmisorDian): Nodo {
    const u = ubicacion(e.direccion.municipio);
    return E(nombre, null,
        E('cbc:ID', null, u.codigo),
        E('cbc:CityName', null, u.ciudad),
        opcional('cbc:PostalZone', e.direccion.postal),
        E('cbc:CountrySubentity', null, u.departamento),
        E('cbc:CountrySubentityCode', null, u.codigoDepartamento),
        E('cac:AddressLine', null, E('cbc:Line', null, e.direccion.linea.trim().slice(0, 300))),
        E('cac:Country', null,
            E('cbc:IdentificationCode', null, 'CO'),
            E('cbc:Name', { languageID: 'es' }, 'Colombia')));
}

const tributoParte = (id: string) => TRIBUTOS_PARTE.find((t) => t.id === id) ?? { id, nombre: id };

export function emisorXml(s: Pick<SolicitudDian, 'emisor' | 'prefijo'>, contenedor = false): Nodo {
    const e = s.emisor;
    const t = tributoParte(e.tributo);
    if (contenedor) {
        return E('cac:PartyTaxScheme', null,
            E('cbc:RegistrationName', null, e.razonSocial),
            E('cbc:CompanyID', dian(e.dv, '31'), e.nit),
            E('cbc:TaxLevelCode', null, e.responsabilidades.join(';')),
            E('cac:TaxScheme', null, E('cbc:ID', null, t.id), E('cbc:Name', null, t.nombre)));
    }
    return E('cac:AccountingSupplierParty', null,
        E('cbc:AdditionalAccountID', null, e.tipoPersona),
        E('cac:Party', null,
            e.nombreComercial && E('cac:PartyName', null, E('cbc:Name', null, e.nombreComercial.slice(0, 450))),
            E('cac:PhysicalLocation', null, direccion('cac:Address', e)),
            E('cac:PartyTaxScheme', null,
                E('cbc:RegistrationName', null, e.razonSocial.slice(0, 450)),
                E('cbc:CompanyID', dian(e.dv, '31'), e.nit),
                E('cbc:TaxLevelCode', null, e.responsabilidades.join(';')),
                direccion('cac:RegistrationAddress', e),
                E('cac:TaxScheme', null, E('cbc:ID', null, t.id), E('cbc:Name', null, t.nombre))),
            E('cac:PartyLegalEntity', null,
                E('cbc:RegistrationName', null, e.razonSocial.slice(0, 450)),
                E('cbc:CompanyID', dian(e.dv, '31'), e.nit),
                (s.prefijo || e.matriculaMercantil) && E('cac:CorporateRegistrationScheme', null,
                    opcional('cbc:ID', s.prefijo),
                    opcional('cbc:Name', e.matriculaMercantil))),
            e.correo && E('cac:Contact', null, E('cbc:ElectronicMail', null, e.correo))));
}

export function adquirienteXml(a: AdquirienteDian, contenedor = false): Nodo {
    const id = E('cbc:CompanyID', dian(a.dv, a.tipoDocumento), a.numero);
    if (contenedor) {
        return E('cac:PartyTaxScheme', null,
            E('cbc:RegistrationName', null, a.nombre),
            id,
            E('cbc:TaxLevelCode', null, a.responsabilidades.length ? a.responsabilidades.join(';') : 'R-99-PN'),
            E('cac:TaxScheme', null, E('cbc:ID', null, a.tributo.id), E('cbc:Name', null, a.tributo.nombre)));
    }
    return E('cac:AccountingCustomerParty', null,
        E('cbc:AdditionalAccountID', null, a.tipoPersona),
        E('cac:Party', null,
            E('cac:PartyIdentification', null, E('cbc:ID', { schemeID: a.dv ?? undefined, schemeName: a.tipoDocumento }, a.numero)),
            E('cac:PartyName', null, E('cbc:Name', null, a.nombre)),
            E('cac:PartyTaxScheme', null,
                E('cbc:RegistrationName', null, a.nombre),
                id,
                a.responsabilidades.length ? E('cbc:TaxLevelCode', null, a.responsabilidades.join(';')) : null,
                E('cac:TaxScheme', null, E('cbc:ID', null, a.tributo.id), E('cbc:Name', null, a.tributo.nombre))),
            // Opcional para el consumidor final [AT FAK42].
            !a.consumidorFinal && E('cac:PartyLegalEntity', null,
                E('cbc:RegistrationName', null, a.nombre),
                E('cbc:CompanyID', dian(a.dv, a.tipoDocumento), a.numero)),
            a.correo && E('cac:Contact', null, E('cbc:ElectronicMail', null, a.correo))));
}

// ── Importes ─────────────────────────────────────────────────────────────────

function subtotalXml(moneda: string, st: SubtotalDian, tributo: { id: string; nombre: string }): Nodo {
    return E('cac:TaxSubtotal', null,
        monto(moneda, 'cbc:TaxableAmount', st.base),
        monto(moneda, 'cbc:TaxAmount', st.valor),
        E('cac:TaxCategory', null,
            E('cbc:Percent', null, st.tarifa),
            E('cac:TaxScheme', null, E('cbc:ID', null, tributo.id), E('cbc:Name', null, tributo.nombre))));
}

function totalesXml(s: SolicitudDian, nombre: 'cac:LegalMonetaryTotal' | 'cac:RequestedMonetaryTotal'): Nodo {
    return E(nombre, null,
        monto(s.moneda, 'cbc:LineExtensionAmount', s.totales.bruto),
        monto(s.moneda, 'cbc:TaxExclusiveAmount', s.totales.baseGravable),
        monto(s.moneda, 'cbc:TaxInclusiveAmount', s.totales.conImpuestos),
        monto(s.moneda, 'cbc:PayableAmount', s.totales.pagar));
}

function lineaXml(s: SolicitudDian, l: LineaDian): Nodo {
    const etiqueta = s.clase === 'factura' ? 'cac:InvoiceLine' : s.clase === 'nota_credito' ? 'cac:CreditNoteLine' : 'cac:DebitNoteLine';
    const cantidadTag = s.clase === 'factura' ? 'cbc:InvoicedQuantity' : s.clase === 'nota_credito' ? 'cbc:CreditedQuantity' : 'cbc:DebitedQuantity';
    const descuento = l.descuento && E('cac:AllowanceCharge', null,
        E('cbc:ID', null, '1'),
        E('cbc:ChargeIndicator', null, 'false'),
        E('cbc:AllowanceChargeReason', null, RAZON_DESCUENTO_LINEA),
        E('cbc:MultiplierFactorNumeric', null, l.descuentoPct),
        monto(s.moneda, 'cbc:Amount', l.descuento),
        monto(s.moneda, 'cbc:BaseAmount', l.bruto));
    const iva = l.iva && E('cac:TaxTotal', null,
        monto(s.moneda, 'cbc:TaxAmount', l.iva.valor),
        subtotalXml(s.moneda, { tarifa: l.iva.tarifa, base: l.iva.base, valor: l.iva.valor }, TRIBUTO.iva));
    // InvoiceLine: AllowanceCharge antes de TaxTotal; Credit/DebitNoteLine: al revés (XSD de UBL 2.1).
    const cargos = s.clase === 'factura' ? [descuento, iva] : [iva, descuento];
    return E(etiqueta, null,
        E('cbc:ID', null, l.numero),
        E(cantidadTag, { unitCode: UNIDAD }, l.cantidad),
        monto(s.moneda, 'cbc:LineExtensionAmount', l.neto),
        ...cargos,
        E('cac:Item', null, E('cbc:Description', null, l.descripcion)),
        E('cac:Price', null,
            monto(s.moneda, 'cbc:PriceAmount', l.precio),
            E('cbc:BaseQuantity', { unitCode: UNIDAD }, l.cantidad)));
}

function pagoXml(s: SolicitudDian): Nodo {
    return E('cac:PaymentMeans', null,
        E('cbc:ID', null, s.formaPago),
        E('cbc:PaymentMeansCode', null, MEDIO_PAGO_NO_DEFINIDO),
        s.formaPago === '2' ? E('cbc:PaymentDueDate', null, s.vencimiento) : null);
}

function tasaXml(s: SolicitudDian): Nodo | null {
    if (!s.tasaCambio) return null;
    // [AT FAR01–FAR07, reglas de la sección 8.2]: de la divisa del documento a COP.
    return E('cac:PaymentExchangeRate', null,
        E('cbc:SourceCurrencyCode', null, s.moneda),
        E('cbc:SourceCurrencyBaseRate', null, '1.00'),
        E('cbc:TargetCurrencyCode', null, 'COP'),
        E('cbc:TargetCurrencyBaseRate', null, '1.00'),
        E('cbc:CalculationRate', null, s.tasaCambio.tasa),
        E('cbc:Date', null, s.tasaCambio.fecha));
}

function ivaXml(s: SolicitudDian): Nodo | null {
    if (!s.iva.length) return null;
    return E('cac:TaxTotal', null,
        monto(s.moneda, 'cbc:TaxAmount', s.totales.iva),
        s.iva.map((st) => subtotalXml(s.moneda, st, TRIBUTO.iva)));
}

function retencionesXml(s: SolicitudDian): Nodo[] {
    return s.retenciones.map((r) => E('cac:WithholdingTaxTotal', null,
        monto(s.moneda, 'cbc:TaxAmount', r.total),
        r.subtotales.map((st) => subtotalXml(s.moneda, st, r.tributo))));
}

function referenciaXml(s: SolicitudDian): Nodo[] {
    const r = s.referencia;
    if (!r) return [];
    return [
        E('cac:DiscrepancyResponse', null,
            E('cbc:ReferenceID', null, r.id),
            E('cbc:ResponseCode', null, r.concepto),
            E('cbc:Description', null, r.descripcion)),
        E('cac:BillingReference', null,
            E('cac:InvoiceDocumentReference', null,
                E('cbc:ID', null, r.id),
                E('cbc:UUID', { schemeName: 'CUFE-SHA384' }, r.cufe),
                E('cbc:IssueDate', null, r.fecha))),
    ];
}

/** El documento sin firmar (raíz Invoice, CreditNote o DebitNote). */
export function documentoXml(s: SolicitudDian): Nodo {
    const raiz = s.clase === 'factura' ? 'Invoice' : s.clase === 'nota_credito' ? 'CreditNote' : 'DebitNote';
    const tipo = s.clase === 'factura' ? TIPO_DOCUMENTO.factura : s.clase === 'nota_credito' ? TIPO_DOCUMENTO.notaCredito : TIPO_DOCUMENTO.notaDebito;
    const cabecera = [
        extensiones(dianExtensions(s)),
        E('cbc:UBLVersionID', null, UBL_VERSION),
        E('cbc:CustomizationID', null, s.clase === 'factura' ? CUSTOMIZATION_ID.factura : s.clase === 'nota_credito' ? CUSTOMIZATION_ID.notaCredito : CUSTOMIZATION_ID.notaDebito),
        E('cbc:ProfileID', null, s.clase === 'factura' ? PROFILE_ID.factura : s.clase === 'nota_credito' ? PROFILE_ID.notaCredito : PROFILE_ID.notaDebito),
        E('cbc:ProfileExecutionID', null, s.tipoAmbiente),
        E('cbc:ID', null, s.id),
        E('cbc:UUID', { schemeID: s.tipoAmbiente, schemeName: s.algoritmo }, s.cufe),
        E('cbc:IssueDate', null, s.fecha),
        E('cbc:IssueTime', null, s.hora),
    ];
    const lineas = s.lineas.map((l) => lineaXml(s, l));
    const periodo = s.periodo && E('cac:InvoicePeriod', null, E('cbc:StartDate', null, s.periodo.desde), E('cbc:EndDate', null, s.periodo.hasta));
    const partes = [emisorXml(s), adquirienteXml(s.adquiriente)];

    if (s.clase === 'factura') {
        return E('Invoice', namespacesRaiz(s.clase),
            ...cabecera,
            s.formaPago === '2' ? E('cbc:DueDate', null, s.vencimiento) : null,
            E('cbc:InvoiceTypeCode', null, tipo),
            E('cbc:DocumentCurrencyCode', null, s.moneda),
            E('cbc:LineCountNumeric', null, s.lineas.length),
            periodo,
            ...partes,
            pagoXml(s),
            tasaXml(s),
            ivaXml(s),
            ...retencionesXml(s),
            totalesXml(s, 'cac:LegalMonetaryTotal'),
            ...lineas);
    }
    if (s.clase === 'nota_credito') {
        return E('CreditNote', namespacesRaiz(s.clase),
            ...cabecera,
            E('cbc:CreditNoteTypeCode', null, tipo),
            E('cbc:DocumentCurrencyCode', null, s.moneda),
            E('cbc:LineCountNumeric', null, s.lineas.length),
            periodo,
            ...referenciaXml(s),
            ...partes,
            pagoXml(s),
            tasaXml(s),
            ivaXml(s),
            totalesXml(s, 'cac:LegalMonetaryTotal'),
            ...lineas);
    }
    return E('DebitNote', namespacesRaiz(s.clase),
        ...cabecera,
        E('cbc:DocumentCurrencyCode', null, s.moneda),
        E('cbc:LineCountNumeric', null, s.lineas.length),
        periodo,
        ...referenciaXml(s),
        ...partes,
        pagoXml(s),
        tasaXml(s),
        ivaXml(s),
        totalesXml(s, 'cac:RequestedMonetaryTotal'),
        ...lineas);
}

// ── Contenedor [AT 6.4] ──────────────────────────────────────────────────────

export interface DatosContenedor {
    solicitud: SolicitudDian;
    /** El documento firmado que se envió a la DIAN. */
    xmlDocumento: string;
    /** El ApplicationResponse con que la DIAN lo validó. */
    xmlRespuesta: string;
    /** Fecha y hora de la validación (del ApplicationResponse). */
    validadoFecha: string;
    validadoHora: string;
    /** Fecha y hora de generación del contenedor (hora de Colombia). */
    fecha: string;
    hora: string;
}

/**
 * AttachedDocument: el contenedor que el emisor entrega al adquiriente con el
 * documento validado y la respuesta de la DIAN [AT 6.4: "siempre que un
 * documento es validado, deberá ser transmitido para el adquiriente el
 * respectivo contenedor"]. Sin firmar: firma.ts lo firma como cualquier otro.
 */
export function contenedorXml(d: DatosContenedor): Nodo {
    const s = d.solicitud;
    return E('AttachedDocument', namespacesRaiz('contenedor'),
        extensiones(null),
        E('cbc:UBLVersionID', null, UBL_VERSION),
        E('cbc:CustomizationID', null, 'Documentos adjuntos'),
        E('cbc:ProfileID', null, 'Factura Electrónica de Venta'),
        E('cbc:ProfileExecutionID', null, s.tipoAmbiente),
        E('cbc:ID', null, s.id),
        E('cbc:IssueDate', null, d.fecha),
        E('cbc:IssueTime', null, d.hora),
        E('cbc:DocumentType', null, 'Contenedor de Factura Electrónica'),
        E('cbc:ParentDocumentID', null, s.id),
        E('cac:SenderParty', null, emisorXml(s, true)),
        E('cac:ReceiverParty', null, adquirienteXml(s.adquiriente, true)),
        E('cac:Attachment', null,
            E('cac:ExternalReference', null,
                E('cbc:MimeCode', null, 'text/xml'),
                E('cbc:EncodingCode', null, 'UTF-8'),
                E('cbc:Description', null, cdata(d.xmlDocumento)))),
        E('cac:ParentDocumentLineReference', null,
            E('cbc:LineID', null, '1'),
            E('cac:DocumentReference', null,
                E('cbc:ID', null, s.id),
                E('cbc:UUID', { schemeName: s.algoritmo }, s.cufe),
                E('cbc:IssueDate', null, s.fecha),
                E('cbc:DocumentType', null, 'ApplicationResponse'),
                E('cac:Attachment', null,
                    E('cac:ExternalReference', null,
                        E('cbc:MimeCode', null, 'text/xml'),
                        E('cbc:EncodingCode', null, 'UTF-8'),
                        E('cbc:Description', null, cdata(d.xmlRespuesta)))),
                E('cac:ResultOfVerification', null,
                    E('cbc:ValidatorID', null, 'Unidad Especial Dirección de Impuestos y Aduanas Nacionales'),
                    E('cbc:ValidationResultCode', null, '02'),
                    E('cbc:ValidationDate', null, d.validadoFecha),
                    E('cbc:ValidationTime', null, d.validadoHora)))));
}

/**
 * Nombres de los archivos que viajan a la DIAN [AT 6.5.7 y 6.5.8]:
 * `fv|nc|nd` + NIT sin DV a 10 dígitos + `000` (software propio) + los dos
 * últimos dígitos del año + un consecutivo de 8 dígitos hexadecimales; el zip
 * lleva `z` en lugar del tipo. El consecutivo de archivo es el propio número
 * del documento: no se repite dentro de su tipo ni de su año, y un reintento
 * del mismo documento lleva el mismo nombre.
 */
export function nombresArchivo(s: Pick<SolicitudDian, 'clase' | 'numero' | 'fecha' | 'emisor'>): { xml: string; zip: string } {
    const tipo = s.clase === 'factura' ? 'fv' : s.clase === 'nota_credito' ? 'nc' : 'nd';
    if (!Number.isSafeInteger(s.numero) || s.numero < 1 || s.numero > 0xffffffff) throw new Error('dian: consecutivo fuera del rango del nombre de archivo');
    const cuerpo = `${s.emisor.nit.padStart(10, '0')}000${s.fecha.slice(2, 4)}${s.numero.toString(16).toUpperCase().padStart(8, '0')}`;
    return { xml: `${tipo}${cuerpo}.xml`, zip: `z${cuerpo}.zip` };
}

export { importe };
