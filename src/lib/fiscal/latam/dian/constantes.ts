// Constantes del riel DIAN (Colombia): factura electrónica de venta con
// validación previa, Anexo Técnico versión 1.9 (Resolución DIAN 000165 del
// 1 de noviembre de 2023).
//
// Fuentes primarias, vendorizadas en scripts/fixtures/dian/:
//   [AT]   Anexo Técnico de Factura Electrónica de Venta v1.9
//          https://www.dian.gov.co/impuestos/factura-electronica/Documents/Anexo-Tecnico-Factura-Electronica-de-Venta-vr-1-9.pdf
//          (SHA-256 1b4022ac…7ded; la misma copia trae la Caja de herramientas)
//   [CAJA] Caja de herramientas FE v1.9 (2026), tablas referenciadas (.xlsx)
//          https://www.dian.gov.co/impuestos/factura-electronica/Documents/Caja-de-herramientas-FE_V19_v2026.zip
//   [WSDL] WcfDianCustomerServices.svc?wsdl de habilitación y producción
//   [POL]  Política de firma v2 (https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf)
//
// scripts/dian-check.mjs compara cada lista de este archivo con su tabla
// oficial: un código mal copiado aquí es un rechazo de la DIAN en producción.
//
// Puro (solo importa tipos): lo cargan los scripts de contrato con Node plano.

import type { EntornoRail } from '../rieles.ts';

/** Web service de validación previa [WSDL: soap12:address]. */
export const DIAN_ENDPOINTS: Readonly<Record<EntornoRail, string>> = {
    homologacion: 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
    produccion: 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
};

/** Consulta pública del documento por CUFE/CUDE [AT 11.7.1 URL QRCode]. */
export const DIAN_QR_BASE: Readonly<Record<EntornoRail, string>> = {
    homologacion: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=',
    produccion: 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=',
};

/** cbc:ProfileExecutionID y cbc:UUID/@schemeID [AT 13.1.1]: 1 producción, 2 pruebas. */
export const TIPO_AMBIENTE: Readonly<Record<EntornoRail, '1' | '2'>> = { produccion: '1', homologacion: '2' };

// ── Namespaces [AT 5.3.1 y ejemplos de la Caja] ──────────────────────────────
export const NS = {
    invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    creditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    debitNote: 'urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2',
    attached: 'urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2',
    cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    sts: 'dian:gov:co:facturaelectronica:Structures-2-1',
    ds: 'http://www.w3.org/2000/09/xmldsig#',
    xades: 'http://uri.etsi.org/01903/v1.3.2#',
    xades141: 'http://uri.etsi.org/01903/v1.4.1#',
} as const;

// ── Literales del Anexo ──────────────────────────────────────────────────────
export const UBL_VERSION = 'UBL 2.1';
/** cbc:ProfileID [AT FAD03, CAD03, DAD03]. */
export const PROFILE_ID = {
    factura: 'DIAN 2.1: Factura Electrónica de Venta',
    notaCredito: 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta',
    notaDebito: 'DIAN 2.1: Nota Débito de Factura Electrónica de Venta',
} as const;
/**
 * cbc:CustomizationID [CAJA 13.1.5.1 "10 Estándar"; 13.1.5.2 "20 Nota Crédito
 * que referencia una factura electrónica"; 13.1.5.3 "30 Nota Débito que
 * referencia una factura electrónica"].
 */
export const CUSTOMIZATION_ID = { factura: '10', notaCredito: '20', notaDebito: '30' } as const;
/** cbc:InvoiceTypeCode / CreditNoteTypeCode [AT 13.1.3]. */
export const TIPO_DOCUMENTO = { factura: '01', notaCredito: '91', notaDebito: '92' } as const;
/** @schemeName de cbc:UUID [AT 13.2.2 y 13.2.3]. */
export const ALGORITMO = { cufe: 'CUFE-SHA384', cude: 'CUDE-SHA384' } as const;

export const AGENCIA_DIAN = { id: '195', nombre: 'CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)' } as const;
/** sts:AuthorizationProviderID: el NIT de la DIAN y su DV [AT FAB31, FAB34: "DV de DIAN es 4"]. */
export const NIT_DIAN = { nit: '800197268', dv: '4' } as const;
/** sts:InvoiceSource/cbc:IdentificationCode y sus atributos [AT FAB14–FAB17]. */
export const INVOICE_SOURCE = {
    pais: 'CO',
    listAgencyID: '6',
    listAgencyName: 'United Nations Economic Commission for Europe',
    listSchemeURI: 'urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1',
} as const;

// ── Firma XAdES-EPES [AT 10, POL] ────────────────────────────────────────────
export const POLITICA_FIRMA = {
    identificador: 'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf',
    descripcion: 'Política de firma para facturas electrónicas de la República de Colombia.',
    /** SHA-256 (base64) del PDF de la política; scripts/dian-check.mjs lo recalcula del PDF vendorizado. */
    hashSha256: 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=',
} as const;
export const ALG = {
    c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    excC14n: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    rsaSha256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
    enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    signedProps: 'http://uri.etsi.org/01903#SignedProperties',
} as const;

// ── Tablas de códigos ────────────────────────────────────────────────────────

/** Tipo de documento de identificación, @schemeName [CAJA 13.2.1]. */
export const TIPOS_DOCUMENTO: readonly { id: string; nombre: string; nombreEn: string }[] = [
    { id: '13', nombre: 'Cédula de ciudadanía', nombreEn: 'Citizenship ID (cédula)' },
    { id: '31', nombre: 'NIT', nombreEn: 'NIT (tax ID)' },
    { id: '22', nombre: 'Cédula de extranjería', nombreEn: 'Foreigner ID (cédula de extranjería)' },
    { id: '41', nombre: 'Pasaporte', nombreEn: 'Passport' },
    { id: '42', nombre: 'Documento de identificación extranjero', nombreEn: 'Foreign ID document' },
    { id: '50', nombre: 'NIT de otro país', nombreEn: 'Foreign tax ID' },
    { id: '21', nombre: 'Tarjeta de extranjería', nombreEn: 'Foreigner card' },
    { id: '12', nombre: 'Tarjeta de identidad', nombreEn: 'Identity card (minors)' },
    { id: '11', nombre: 'Registro civil', nombreEn: 'Civil registry' },
    { id: '47', nombre: 'PEP (Permiso Especial de Permanencia)', nombreEn: 'PEP (special stay permit)' },
    { id: '48', nombre: 'PPT (Permiso Protección Temporal)', nombreEn: 'PPT (temporary protection permit)' },
    { id: '91', nombre: 'NUIP', nombreEn: 'NUIP' },
];
export const DOC_NIT = '31';
export const DOC_CEDULA = '13';
export const DOC_NIT_EXTRANJERO = '50';

/** Tipo de organización, cbc:AdditionalAccountID [AT 13.2.7.3]. */
export const TIPO_PERSONA = { juridica: '1', natural: '2' } as const;
export type TipoPersona = typeof TIPO_PERSONA[keyof typeof TIPO_PERSONA];

/** Responsabilidades fiscales, cbc:TaxLevelCode [CAJA 13.2.6.1]. */
export const RESPONSABILIDADES: readonly { id: string; nombre: string; nombreEn: string }[] = [
    { id: 'O-13', nombre: 'Gran contribuyente', nombreEn: 'Large taxpayer' },
    { id: 'O-15', nombre: 'Autorretenedor', nombreEn: 'Self-withholder' },
    { id: 'O-23', nombre: 'Agente de retención IVA', nombreEn: 'VAT withholding agent' },
    { id: 'O-47', nombre: 'Régimen simple de tributación', nombreEn: 'Simple tax regime' },
    { id: 'R-99-PN', nombre: 'No aplica – Otros', nombreEn: 'Not applicable – other' },
];

/** Tributo de la parte, PartyTaxScheme/cac:TaxScheme [CAJA 13.2.6.2]. */
export const TRIBUTOS_PARTE: readonly { id: string; nombre: string; etiqueta: string; etiquetaEn: string }[] = [
    { id: '01', nombre: 'IVA', etiqueta: 'Responsable de IVA', etiquetaEn: 'VAT registered' },
    { id: '04', nombre: 'INC', etiqueta: 'Responsable del impuesto nacional al consumo', etiquetaEn: 'National consumption tax registered' },
    { id: 'ZA', nombre: 'IVA e INC', etiqueta: 'Responsable de IVA e INC', etiquetaEn: 'VAT and consumption tax registered' },
    { id: 'ZZ', nombre: 'No aplica', etiqueta: 'No responsable de IVA', etiquetaEn: 'Not VAT registered' },
];

/** Tributos (TaxScheme de impuestos y retenciones) [CAJA 13.2.2]. */
export const TRIBUTO = {
    iva: { id: '01', nombre: 'IVA' },
    ica: { id: '03', nombre: 'ICA' },
    inc: { id: '04', nombre: 'INC' },
    reteIva: { id: '05', nombre: 'ReteIVA' },
    reteRenta: { id: '06', nombre: 'ReteRenta' },
    reteIca: { id: '07', nombre: 'ReteICA' },
} as const;

/**
 * Tarifas de IVA que admite la tabla 13.3.11 [CAJA]. 0.00 = exento. Un bien o
 * servicio EXCLUIDO no lleva IVA y su línea no informa TaxTotal (misma tabla).
 */
export const TARIFAS_IVA: readonly number[] = [0, 5, 16, 19];
/** ReteIVA: 15 % del IVA (tabla 13.3.11; 100 % para casos especiales). */
export const TARIFAS_RETE_IVA: readonly number[] = [15, 100];

/** Concepto de corrección de la nota crédito, DiscrepancyResponse/ResponseCode [CAJA 13.2.4]. */
export const CONCEPTOS_NOTA_CREDITO: Readonly<Record<string, string>> = {
    '1': 'Devolución parcial de los bienes y/o no aceptación parcial del servicio',
    '2': 'Anulación de factura electrónica',
    '3': 'Rebaja  o descuento parcial o total',
    '4': 'Ajuste de precio',
    '5': 'Descuento comercial por pronto pago',
    '6': 'Descuento comercial por volumen de ventas',
};
/** Concepto de corrección de la nota débito [CAJA 13.2.5]. Solo lo usa el set de pruebas de habilitación. */
export const CONCEPTOS_NOTA_DEBITO: Readonly<Record<string, string>> = {
    '1': 'Intereses',
    '2': 'Gastos por cobrar',
    '3': 'Cambio del valor',
    '4': 'Otros',
};

/** Forma de pago, PaymentMeans/cbc:ID [AT 13.2.8.4]: 1 contado, 2 crédito. */
export const FORMA_PAGO = { contado: '1', credito: '2' } as const;
/** Medio de pago, PaymentMeansCode [CAJA 13.3.4.2]: "1 Instrumento no definido". */
export const MEDIO_PAGO_NO_DEFINIDO = '1';
/** Unidad de cantidad [CAJA 13.3.6]: "94 Unidad". */
export const UNIDAD = '94';
/** Código de descuento de la línea no se codifica [AT FBE01: "no es necesario codificarlos"]. */
export const RAZON_DESCUENTO_LINEA = 'Descuento comercial';

/** Consumidor final [AT FAK02, FAK20–FAK26, FAK40–FAK41]. */
export const CONSUMIDOR_FINAL = {
    id: '222222222222',
    schemeName: '13',
    nombre: 'consumidor final',
    responsabilidad: 'R-99-PN',
    tributo: { id: 'ZZ', nombre: 'No aplica' },
} as const;

/** Holgura de los valores monetarios [AT 5.2.1.1]: ± 2.00. */
export const HOLGURA = 2;

/** Colombia no tiene horario de verano: la hora legal es siempre UTC-05:00 [AT FAD10]. */
export const OFFSET_COLOMBIA = '-05:00';

/** Códigos de estado de los servicios [AT 7.10.3, 7.11.3]. */
export const ESTADO_DIAN = { procesado: ['0', '00'], nsuNoEncontrado: '66', noEncontrado: '90', conErrores: '99' } as const;

/** Acciones SOAP del contrato IWcfDianCustomerServices [WSDL wsdl0, soap12:operation]. */
export const SOAP_ACTION_BASE = 'http://wcf.dian.colombia/IWcfDianCustomerServices/';
export type OperacionDian = 'SendBillSync' | 'SendTestSetAsync' | 'GetStatus' | 'GetStatusZip' | 'GetNumberingRange';
export const NS_WCF = 'http://wcf.dian.colombia';
