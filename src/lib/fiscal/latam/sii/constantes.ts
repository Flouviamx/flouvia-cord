// Constantes del riel del SII (Chile): servidores, espacios de nombres, tipos de
// documento y reglas de folios. Cada valor sale de una fuente oficial
// vendorizada en scripts/fixtures/sii/ (lo coteja scripts/sii-check.mjs):
//
//   - endpoints y espacio de nombres SOAP: los WSDL vigentes descargados de
//     maullin.sii.cl (certificación) y palena.sii.cl (producción);
//   - estructura del DTE: DTE_v10.xsd y EnvioDTE_v10.xsd (actualización del
//     06/02/2026, schema_dte.zip de www.sii.cl/factura_electronica/factura_mercado);
//   - nombres impresos de cada documento: "Manual de muestras impresas" v4.0;
//   - vigencia de los folios: Resolución Exenta SII N° 58 de 2017.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import type { EntornoRail } from '../rieles.ts';

/** Servidor del SII por entorno: maullin es certificación (pruebas), palena producción. */
export const SII_HOSTS: Readonly<Record<EntornoRail, string>> = {
    homologacion: 'maullin.sii.cl',
    produccion: 'palena.sii.cl',
};

export interface EndpointsSii {
    semilla: string;
    token: string;
    estadoEnvio: string;
    estadoDte: string;
    upload: string;
}

export function siiEndpoints(entorno: EntornoRail): EndpointsSii {
    const host = SII_HOSTS[entorno];
    return {
        semilla: `https://${host}/DTEWS/CrSeed.jws`,
        token: `https://${host}/DTEWS/GetTokenFromSeed.jws`,
        estadoEnvio: `https://${host}/DTEWS/QueryEstUp.jws`,
        estadoDte: `https://${host}/DTEWS/QueryEstDte.jws`,
        // Manual "Envío automático de DTE" (OI2003_UPDTE_MDE): POST
        // /cgi_dte/UPL/DTEUpload en el mismo servidor.
        upload: `https://${host}/cgi_dte/UPL/DTEUpload`,
    };
}

/** Espacio de nombres de los DTE (targetNamespace de DTE_v10.xsd). */
export const NS_SII_DTE = 'http://www.sii.cl/SiiDte';
export const NS_XMLDSIG = 'http://www.w3.org/2000/09/xmldsig#';
export const NS_XSI = 'http://www.w3.org/2001/XMLSchema-instance';
/**
 * Espacio de nombres del cuerpo SOAP (rpc/encoded) en los WSDL vigentes. Los
 * manuales de 2004–2007 muestran el de la URL del servicio; el WSDL que hoy
 * publican maullin y palena declara este.
 */
export const NS_WS_SII = 'http://DefaultNamespace';

/** RUT del SII: receptor de la carátula de todo envío al SII (ejemplo oficial F60T33). */
export const RUT_SII = '60803000-K';

/**
 * El SII exige que la segunda línea del envío declare el schemaLocation
 * (instructivo técnico, Anexo 3, A 3.1).
 */
export const SCHEMA_LOCATION_ENVIO = `${NS_SII_DTE} EnvioDTE_v10.xsd`;

export type TipoDte = 33 | 34 | 56 | 61;

export interface DescripcionTipo {
    /** Nombre impreso, en mayúsculas y sin traducir (manual de muestras impresas, 1.1.4). */
    nombre: string;
    /** Nombre en palabras para una referencia impresa ("Factura electrónica"). */
    nombreCorto: string;
    /** Prefijo del número de documento en Cord. */
    prefijo: string;
    /** ¿Lleva copia cedible y acuse de recibo (Ley 19.983)? Las notas no (manual, 1.4). */
    cedible: boolean;
    notaCredito: boolean;
    /** Nota de crédito o de débito: modifica otro documento y lo referencia (CodRef obligatorio). */
    nota: boolean;
}

export const TIPOS_DTE: Readonly<Record<TipoDte, DescripcionTipo>> = {
    33: { nombre: 'FACTURA ELECTRÓNICA', nombreCorto: 'Factura electrónica', prefijo: 'FE', cedible: true, notaCredito: false, nota: false },
    34: { nombre: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA', nombreCorto: 'Factura no afecta o exenta electrónica', prefijo: 'FX', cedible: true, notaCredito: false, nota: false },
    56: { nombre: 'NOTA DE DÉBITO ELECTRÓNICA', nombreCorto: 'Nota de débito electrónica', prefijo: 'ND', cedible: false, notaCredito: false, nota: true },
    61: { nombre: 'NOTA DE CRÉDITO ELECTRÓNICA', nombreCorto: 'Nota de crédito electrónica', prefijo: 'NC', cedible: false, notaCredito: true, nota: true },
};

export const esTipoDte = (v: unknown): v is TipoDte => v === 33 || v === 34 || v === 56 || v === 61;

/**
 * Tipo de documento de referencia del set de pruebas: "En la primera línea de
 * referencia de cada DTE del set de prueba debe indicar el texto SET como Tipo
 * de Documento de Referencia y el texto CASO xxxxx-x en el campo Razón
 * referencia" (SII, "Instrucciones para la construcción de DTE con los datos
 * del set de pruebas", I.6). TpoDocRef alfabético: "no hay validación"
 * (formato DTE v2.2, área de referencias).
 */
export const TPO_DOC_REF_SET = 'SET';

/** IVA general de Chile (DL 825, art. 14): 19 %. Es la única tasa afecta que el riel acepta. */
export const TASA_IVA = 0.19;
export const TASA_IVA_PCT = 19;

/** Un DTE no puede exceder 60 líneas de detalle (formato DTE v2.2, §2.1; maxOccurs del XSD). */
export const MAX_LINEAS = 60;

/** Largos máximos de los campos de texto que Cord llena (formato DTE v2.2 y XSD; se usa el menor). */
export const LARGOS = {
    RznSoc: 100,
    GiroEmis: 80,
    DirOrigen: 60,
    CmnaOrigen: 20,
    CiudadOrigen: 20,
    Sucursal: 20,
    RznSocRecep: 100,
    GiroRecep: 40,
    DirRecep: 70,
    CmnaRecep: 20,
    CiudadRecep: 20,
    CorreoRecep: 80,
    NmbItem: 80,
    DscItem: 1000,
    RazonRef: 90,
    /** Razón social del receptor y primer ítem dentro del timbre (instructivo, Anexo 2). */
    TimbreTexto: 40,
} as const;

/**
 * Vigencia de los CAF (Res. Ex. SII N° 58/2017, resolutivo 1°): seis meses
 * desde su autorización para los documentos que dan derecho a crédito fiscal.
 * La factura exenta no lo da; las notas de crédito y de débito se tratan con la
 * misma vigencia (vencida, el SII rechaza el documento y el folio se pierde).
 */
export const VIGENCIA_CAF_MESES = 6;
/** La nota de débito también da derecho a crédito fiscal (aumenta el débito del emisor). */
export const TIPOS_CON_VIGENCIA: readonly TipoDte[] = [33, 56, 61];

/** Aviso de folios por agotarse: lo que ocurra primero. */
export const AVISO_FOLIOS_MINIMO = 20;
export const AVISO_FOLIOS_FRACCION = 0.1;

/** Servicio de la caché de accesos (fiscal_rail_accesos.servicio). */
export const SERVICIO_TOKEN = 'dte';
/**
 * El manual de autenticación no fija la vigencia del token; se usa como
 * máximo una hora y se renueva antes si el SII lo rechaza (estados 001–003 de
 * las consultas, STATUS 5 del upload).
 */
export const VIGENCIA_TOKEN_MS = 60 * 60_000;

/** Zona horaria de las fechas del DTE (FchEmis, TSTED, TmstFirma). */
export const ZONA_CL = 'America/Santiago';

// ── Intercambio entre contribuyentes y certificación ────────────────────────

/**
 * Casilla del SII que recibe las respuestas de intercambio durante la
 * certificación (manual "Ambiente de certificación", paso 3: "El postulante
 * deberá enviar un acuse de recibo del envío y la aceptación o rechazo de los
 * documentos … a la siguiente casilla: SII_dte_intercambio@sii.cl").
 */
export const CORREO_INTERCAMBIO_SII = 'SII_dte_intercambio@sii.cl';

/** schemaLocation de las respuestas (RespuestaEnvioDTE_v10.xsd, EnvioRecibos_v10.xsd de www.sii.cl). */
export const SCHEMA_LOCATION_RESPUESTA = `${NS_SII_DTE} RespuestaEnvioDTE_v10.xsd`;
export const SCHEMA_LOCATION_RECIBOS = `${NS_SII_DTE} EnvioRecibos_v10.xsd`;

/**
 * Declaración del recibo de mercaderías o servicios (Ley 19.983): el valor
 * FIJO del elemento <Declaracion> de Recibos_v10.xsd, carácter por carácter
 * (sin tildes: así lo fija el esquema; el formato en PDF la escribe con ellas).
 */
export const DECLARACION_RECIBO = 'El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).';

/**
 * Documentos que admiten recibo de mercaderías o servicios (formato del
 * recibo, Ley 19.983, campo 1) y de los que Cord sabe recibir: 33 y 34. La
 * guía (52), la liquidación-factura (43) y la factura de compra (46) quedan
 * fuera de lo que Cord recibe hoy.
 */
export const TIPOS_CON_RECIBO: readonly number[] = [33, 34];

/**
 * Registro de aceptación o reclamo de un DTE recibido (Ley 20.956): web
 * service del SII ("Web Service de Consulta y Registro de Aceptación/Reclamo a
 * DTE recibido", v1.2, 07/08/2017). WSDL vendorizados en scripts/fixtures/sii/.
 */
export function siiReclamoEndpoint(entorno: EntornoRail): string {
    return entorno === 'produccion'
        ? 'https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice'
        : 'https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice';
}
export const NS_WS_RECLAMO = 'http://ws.registroreclamodte.diii.sdi.sii.cl';
/** Tipos que el servicio de reclamo opera (manual, parámetro tipoDoc). */
export const TIPOS_CON_RECLAMO: readonly number[] = [33, 34, 43];
/** Acciones del servicio (manual, parámetro accionDoc). */
export type AccionReclamo = 'ACD' | 'RCD' | 'ERM' | 'RFP' | 'RFT';
export const ACCIONES_RECLAMO: readonly AccionReclamo[] = ['ACD', 'RCD', 'ERM', 'RFP', 'RFT'];
/** Plazo para aceptar o reclamar: "8 días corridos" desde la recepción en el SII (Ley 19.983 modificada por la Ley 20.956). */
export const DIAS_PARA_RECLAMAR = 8;
