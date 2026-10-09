// Constantes del riel SUNAT (Perú, SEE - Del contribuyente). Cada valor sale
// de una fuente primaria vendorizada o citada en scripts/fixtures/sunat/:
//
//   [MAN]   Manual del programador, SEE - Del contribuyente (RS 097-2012/SUNAT),
//           versión 2.1 de mayo de 2021: servicios web, WS-Security, nombres de
//           los archivos ZIP, CDR y rangos de códigos de error (§4.1).
//   [WSDL]  billService (beta y producción) y billConsultService (producción),
//           descargados de los propios servidores de SUNAT (fixtures/sunat/).
//   [9-A]   Anexo N.° 9-A "Estándar UBL 2.1" de la factura (RS 123-2022/SUNAT,
//           anexo IV) y de la nota de crédito (RS 340-2017/SUNAT, anexo VII-d).
//   [CAT]   Anexo N.° 8 "Catálogo de códigos" (RS 340-2017/SUNAT, anexo V;
//           catálogo 09 según RS 193-2020/SUNAT, anexo III).
//   [113]   Anexo N.° 6 "Aspectos técnicos" (RS 113-2018/SUNAT, anexo A): QR.
//   [MYPE]  Tasa del IGV para MYPE de restaurantes, hoteles y alojamientos
//           turísticos (Ley 31556 modificada por la Ley 32219), según la tabla
//           que publica SUNAT en orientacion.sunat.gob.pe.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import type { EntornoRail } from '../rieles.ts';

/** Servicios web [MAN §2.1, WSDL]. Beta no tiene servicio de consulta: usa getStatusAR del billService. */
export const SUNAT_ENDPOINTS: Readonly<Record<EntornoRail, { bill: string; consulta: string | null }>> = {
    homologacion: {
        bill: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
        consulta: null,
    },
    produccion: {
        bill: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
        consulta: 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService',
    },
};

/** Namespace de los mensajes de billService y billConsultService [WSDL]. */
export const NS_SERVICIO = 'http://service.sunat.gob.pe';
export const NS_WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';

/**
 * Credencial del servicio beta [MAN §2.3]: "Usuario = [RUC]MODDATOS,
 * Password: MODDATOS". Beta solo valida estructuras; no exige un certificado
 * registrado en SUNAT ni un usuario SOL real.
 */
export const USUARIO_BETA = 'MODDATOS';
export const CLAVE_BETA = 'MODDATOS';

// ── UBL 2.1 [9-A] ───────────────────────────────────────────────────────────
export const NS_UBL = {
    invoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    creditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    ds: 'http://www.w3.org/2000/09/xmldsig#',
    applicationResponse: 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2',
} as const;
export const UBL_VERSION = '2.1';
export const CUSTOMIZATION_ID = '2.0';

/** Catálogo 01 [CAT]: los dos tipos que emite Cord. */
export const TIPO_DOC = { FACTURA: '01', NOTA_CREDITO: '07' } as const;
export type TipoDocSunat = (typeof TIPO_DOC)[keyof typeof TIPO_DOC];

/** Catálogo 51 [CAT]: tipo de operación. */
export const TIPO_OPERACION = {
    VENTA_INTERNA: '0101',
    EXPORTACION_BIENES: '0200',
    EXPORTACION_SERVICIOS: '0201',
} as const;

/** Catálogo 06 [CAT]: tipo de documento de identidad. */
export const DOC_IDENTIDAD = {
    NO_DOMICILIADO: '0', // DOC.TRIB.NO.DOM.SIN.RUC
    DNI: '1',
    RUC: '6',
} as const;

/** Catálogo 07 [CAT]: afectación al IGV que Cord sabe declarar. */
export const AFECTACION = {
    GRAVADO: '10', // Gravado - Operación Onerosa
    EXONERADO: '20', // Exonerado - Operación Onerosa
    INAFECTO: '30', // Inafecto - Operación Onerosa
    EXPORTACION: '40', // Exportación
} as const;
export type AfectacionIgv = (typeof AFECTACION)[keyof typeof AFECTACION];

/**
 * Catálogo 05 [CAT]: tributo de cada afectación — código, nombre y código
 * internacional (UN/ECE 5153). 9995, 9997 y 9998 están marcados "vigente para
 * la versión UBL 2.1".
 */
export const TRIBUTO: Readonly<Record<AfectacionIgv, { id: string; nombre: string; codigo: string }>> = {
    '10': { id: '1000', nombre: 'IGV', codigo: 'VAT' },
    '20': { id: '9997', nombre: 'EXO', codigo: 'VAT' },
    '30': { id: '9998', nombre: 'INA', codigo: 'FRE' },
    '40': { id: '9995', nombre: 'EXP', codigo: 'FRE' },
};

/** Catálogo 53 [CAT]: descuento que afecta la base imponible del IGV (nivel global e ítem). */
export const DESCUENTO_AFECTA_BASE = '00';
/** Catálogo 16 [CAT]: precio unitario (incluye el IGV). */
export const PRECIO_UNITARIO_CON_IGV = '01';
/** Catálogo 52 [CAT]: leyenda "Monto en Letras". */
export const LEYENDA_MONTO_LETRAS = '1000';
/** Catálogo 03 (UN/ECE rec 20): unidad, para los conceptos que Cord no clasifica. */
export const UNIDAD_POR_DEFECTO = 'NIU';
export const UNIDAD_SERVICIO = 'ZZ';

/**
 * Catálogo 09 [CAT, RS 193-2020]: tipo de nota de crédito que Cord emite.
 *   01 Anulación de la operación — la nota acredita la factura completa.
 *   09 Disminución en el valor — la nota acredita una parte (Cord la reparte
 *      en proporción sobre los mismos conceptos, credit-note.ts).
 */
export const TIPO_NOTA_CREDITO = { ANULACION: '01', DISMINUCION_VALOR: '09' } as const;

/** Código del establecimiento anexo para el domicilio fiscal [9-A, campo 16 / Anexo 1 campo 50]. */
export const ESTABLECIMIENTO_DOMICILIO_FISCAL = '0000';

/**
 * IGV. La tasa general es 18 % (16 % IGV + 2 % IPM). Para MYPE de
 * restaurantes, hoteles y alojamientos turísticos que cumplen los requisitos
 * de la Ley 31556 (modificada por la Ley 32219), SUNAT publica: 2026 → 10,5 %
 * (8 % IGV + 2,5 % IPM); 2027 → 15 % (12 % IGV + 3 % IPM) [MYPE]. Fuera de ese
 * cronograma no hay tasa reducida que Cord pueda declarar.
 */
export const TASA_IGV_GENERAL = 0.18;
export const TASA_IGV_MYPE: Readonly<Record<number, number>> = { 2026: 0.105, 2027: 0.15 };

/** Tasa de la retención del IGV (RS 033-2014/SUNAT, desde el 1.3.2014) y umbral del régimen (> S/ 700). */
export const TASA_RETENCION_IGV = 0.03;
export const UMBRAL_RETENCION_PEN = 700;
/** Catálogo 53 (RS 123-2022, anexo 9-A ítems 174-176): retención del IGV informada en la factura. */
export const CARGO_RETENCION_IGV = '62';

/** Formas de pago [9-A ítems 170-173]. */
export const FORMA_PAGO = { CONTADO: 'Contado', CREDITO: 'Credito' } as const;

/**
 * Rangos de códigos de respuesta [MAN §4.1]:
 *   0100–0999 excepciones propias de SUNAT,
 *   1000–1999 excepciones (formato y estructura) del contribuyente,
 *   2000–3999 errores que generan rechazo,
 *   4000 en adelante, observaciones (el comprobante es válido).
 * Una excepción deja el documento "como no informado"; un rechazo de una
 * factura o nota "considera ya utilizada" la numeración.
 */
export function claseCodigo(code: number): 'excepcion_sunat' | 'excepcion' | 'rechazo' | 'observacion' | 'aceptado' {
    if (code === 0) return 'aceptado';
    if (code >= 4000) return 'observacion';
    if (code >= 2000) return 'rechazo';
    if (code >= 1000) return 'excepcion';
    return 'excepcion_sunat';
}

/**
 * Consulta del estado de un comprobante [MAN anexo 2, tabla de retorno de
 * billConsultService/getStatus]: 0001 aceptado, 0002 rechazado, 0003 de baja,
 * 0011 no existe. El resto (0004–0010, 0012) es un error de la consulta.
 */
export const ESTADO_CONSULTA = {
    ACEPTADO: '0001',
    RECHAZADO: '0002',
    BAJA: '0003',
    NO_EXISTE: '0011',
} as const;

/** Huso horario de la fecha y hora de emisión. */
export const ZONA_PE = 'America/Lima';

/** QR [113 §6.4.2]: nivel de corrección Q. */
export const QR_NIVEL = 'Q' as const;
