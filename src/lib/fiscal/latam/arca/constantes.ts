// Constantes de ARCA (Argentina, ex AFIP), cada una con su fuente primaria.
// Nada de esto se escribió de memoria: si una cambia, se cambia aquí citando
// la versión nueva del documento, y scripts/arca-check.mjs lo vuelve a probar.
//
// Fuentes (descargadas el 2026-10-08):
//   [WSDL]  https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL y
//           https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL — idénticos
//           salvo el host; copia en scripts/fixtures/arca/.
//   [MAN]   "Manual para el desarrollador — Facturación, RG 4291, Proyecto FE
//           v4.7", revisión del 1 de septiembre de 2026:
//           https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
//   [WSAA]  "WSAA — Manual del Desarrollador", publicación 20.2.19, y
//           "Especificación Técnica del WSAA" 1.2.2:
//           https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf ·
//           https://www.afip.gob.ar/ws/WSAA/Especificacion_Tecnica_WSAA_1.2.2.pdf
//   [TAB]   "Tablas del sistema" de factura electrónica (Operación/Condición
//           IVA, Documento receptor, Tipos de comprobantes, Monedas):
//           https://www.arca.gob.ar/fe/ayuda/tablas.asp
//   [QR]    "Especificaciones del QR incluido en las facturas electrónicas":
//           https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
//   [RG5700] RG 5700/2025, art. 1° (BO 27/05/2025): identificación del
//           consumidor final "si el importe de la operación es igual o
//           superior a PESOS DIEZ MILLONES".
//
// Puro: lo cargan los scripts de contrato con Node plano.

import type { EntornoRail } from '../rieles.ts';

/** <soap:address location> de cada WSDL [WSDL] [MAN §Dirección URL] [WSAA §10.1]. */
export const ARCA_ENDPOINTS: Record<EntornoRail, { wsaa: string; wsfe: string }> = {
    homologacion: {
        wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
        wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
    },
    produccion: {
        wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
        wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    },
};

/** targetNamespace del WSDL de WSFEv1; el soapAction de cada operación es este + el nombre [WSDL]. */
export const NS_WSFE = 'http://ar.gov.afip.dif.FEV1/';
/** Namespace de los elementos loginCms/in0 del WSDL del WSAA [WSAA, WSDL]. */
export const NS_WSAA = 'http://wsaa.view.sua.dvadac.desein.afip.gov';
/** Identificador del servicio de negocio en el TRA: "wsfe" [MAN §Autenticación]. */
export const SERVICIO_WSFE = 'wsfe';

/** URL base del QR: "{URL}=https://www.arca.gob.ar/fe/qr/" [QR]. */
export const ARCA_QR_URL = 'https://www.arca.gob.ar/fe/qr/';

export type ClaseComprobante = 'A' | 'B' | 'C';

/**
 * Códigos de tipo de comprobante [TAB "Tipos de Comprobantes"] [MAN 10007].
 * Cord emite factura y nota de crédito de las clases A, B y C. Quedan FUERA,
 * a propósito: "A con leyenda operación sujeta a retención" (51–54), Factura
 * de Crédito Electrónica MiPyME (201…213) y Factura E de exportación (otro
 * web service, WSFEXv1).
 */
export const TIPO_COMPROBANTE: Record<ClaseComprobante, { factura: number; notaCredito: number }> = {
    A: { factura: 1, notaCredito: 3 },
    B: { factura: 6, notaCredito: 8 },
    C: { factura: 11, notaCredito: 13 },
};

/** Descripción oficial de cada tipo que Cord emite [TAB]. */
export const DESCRIPCION_COMPROBANTE: Record<number, { titulo: string; clase: ClaseComprobante; notaCredito: boolean }> = {
    1: { titulo: 'FACTURA', clase: 'A', notaCredito: false },
    3: { titulo: 'NOTA DE CRÉDITO', clase: 'A', notaCredito: true },
    6: { titulo: 'FACTURA', clase: 'B', notaCredito: false },
    8: { titulo: 'NOTA DE CRÉDITO', clase: 'B', notaCredito: true },
    11: { titulo: 'FACTURA', clase: 'C', notaCredito: false },
    13: { titulo: 'NOTA DE CRÉDITO', clase: 'C', notaCredito: true },
};

/**
 * Alícuotas de IVA → Id de AlicIva [TAB "Operación / Condición IVA"]:
 * 3 = 0 %, 4 = 10,5 %, 5 = 21 %, 6 = 27 %, 8 = 5 %, 9 = 2,5 %. Los códigos 1
 * (No gravado), 2 (Exento) y 7 (solo controladores fiscales) no van en
 * AlicIva: lo exento se informa en ImpOpEx [MAN ImpOpEx]. El ejemplo 1 del
 * manual confirma 5 = 21 % y 4 = 10,5 %.
 */
export const ALICUOTAS_IVA: readonly { tasa: number; id: number }[] = [
    { tasa: 0.27, id: 6 },
    { tasa: 0.21, id: 5 },
    { tasa: 0.105, id: 4 },
    { tasa: 0.05, id: 8 },
    { tasa: 0.025, id: 9 },
];

/** Tipos de documento del receptor [TAB "Documento receptor"]. */
export const DOC_TIPO = { CUIT: 80, CUIL: 86, CDI: 87, DNI: 96, SIN_IDENTIFICAR: 99 } as const;

/** DocNro de "Sujeto No Categorizado": exige percepción de IVA (tributo 13) [MAN 10067]. */
export const CUIT_NO_CATEGORIZADO = '23000000000';

/** Concepto del comprobante [MAN FeDetReq.Concepto]. */
export const CONCEPTO = { productos: 1, servicios: 2, ambos: 3 } as const;
export type ConceptoArca = 1 | 2 | 3;

/** Condición frente al IVA del EMISOR, tal como la declara el negocio en Ajustes. */
export type CondicionEmisor = 'responsable_inscripto' | 'monotributo' | 'exento';

export const CONDICIONES_EMISOR: readonly { id: CondicionEmisor; nombre: string; nombreEn: string }[] = [
    { id: 'responsable_inscripto', nombre: 'IVA Responsable Inscripto', nombreEn: 'VAT registered (Responsable Inscripto)' },
    { id: 'monotributo', nombre: 'Responsable Monotributo', nombreEn: 'Monotributo (simplified regime)' },
    { id: 'exento', nombre: 'IVA Sujeto Exento', nombreEn: 'VAT exempt' },
];

/**
 * Condición frente al IVA del RECEPTOR (CondicionIVAReceptorId) y las clases
 * de comprobante en que se admite: tabla del anexo "Condición Frente al IVA
 * del receptor" del [MAN] (página 203, transcrita de la imagen de la tabla).
 * La columna "49" (bienes usados) no aplica a Cord.
 */
export const CONDICIONES_IVA_RECEPTOR: readonly { id: number; nombre: string; nombreEn: string; clases: readonly ClaseComprobante[] }[] = [
    { id: 1, nombre: 'IVA Responsable Inscripto', nombreEn: 'VAT registered (Responsable Inscripto)', clases: ['A', 'C'] },
    { id: 4, nombre: 'IVA Sujeto Exento', nombreEn: 'VAT exempt', clases: ['B', 'C'] },
    { id: 5, nombre: 'Consumidor Final', nombreEn: 'Final consumer', clases: ['B', 'C'] },
    { id: 6, nombre: 'Responsable Monotributo', nombreEn: 'Monotributo', clases: ['A', 'C'] },
    { id: 7, nombre: 'Sujeto No Categorizado', nombreEn: 'Not categorized', clases: ['B', 'C'] },
    { id: 8, nombre: 'Proveedor del Exterior', nombreEn: 'Foreign supplier', clases: ['B', 'C'] },
    { id: 9, nombre: 'Cliente del Exterior', nombreEn: 'Foreign customer', clases: ['B', 'C'] },
    { id: 10, nombre: 'IVA Liberado – Ley N° 19.640', nombreEn: 'VAT released (Law 19,640)', clases: ['B', 'C'] },
    { id: 13, nombre: 'Monotributista Social', nombreEn: 'Social monotributo', clases: ['A', 'C'] },
    { id: 15, nombre: 'IVA No Alcanzado', nombreEn: 'Outside the scope of VAT', clases: ['B', 'C'] },
    { id: 16, nombre: 'Monotributo Trabajador Independiente Promovido', nombreEn: 'Promoted independent worker monotributo', clases: ['A', 'C'] },
];

export const CONDICION_RECEPTOR_CONSUMIDOR_FINAL = 5;

/**
 * Importe desde el cual hay que identificar al consumidor final:
 * "igual o superior a PESOS DIEZ MILLONES" [RG5700, art. 1°]; según la prensa
 * especializada, la RG 5866/2026 conserva el monto. La validación del web
 * service lo compara contra ImpTotal × MonCotiz [MAN 10015, v2.11].
 */
export const UMBRAL_IDENTIFICACION_CF_ARS = 10_000_000;

/**
 * ISO 4217 → código de moneda de ARCA [TAB "Monedas"] para las divisas que
 * Cord ofrece (OFFERED_CURRENCIES). La lista vigente la da el método
 * FEParamGetTiposMonedas; `npm run arca:prueba -- --parametros` la imprime para
 * contrastarla con un certificado real. Una divisa fuera de esta tabla no se
 * adivina: la emisión falla cerrada con un mensaje.
 */
export const MONEDAS_ARCA: Readonly<Record<string, string>> = {
    ARS: 'PES',
    USD: 'DOL',
    EUR: '060',
    BRL: '012',
    GBP: '021',
    CAD: '018',
    JPY: '019',
    CHF: '009',
    MXN: '010',
    CLP: '033',
    COP: '032',
    PEN: '035',
    CNY: '064',
    AUD: '026',
};

/**
 * Margen de error de los cuadres de importes [MAN "Margen de error mediante
 * (Error Absoluto y Error Relativo)" y códigos 10023, 10048, 10051, 10061]:
 * se acepta si el error relativo es ≤ 0,01 % O el absoluto ≤ 0,01 (por
 * alícuota cuando el manual lo dice).
 */
export const MARGEN_RELATIVO = 0.0001;
export const MARGEN_ABSOLUTO = 0.01;

/**
 * Espera preventiva del WSAA antes de aceptar otro ticket para el mismo
 * servicio mientras el anterior sigue vigente: "10 MINUTOS EN EL WSAA DE
 * TESTING Y 2 MINUTOS EN EL WSAA DE PRODUCCION" [WSAA §10.6].
 */
export const ESPERA_TICKET_DUPLICADO_S: Record<EntornoRail, number> = { homologacion: 600, produccion: 120 };
