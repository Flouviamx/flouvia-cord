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

export type TipoDte = 33 | 34 | 61;

export interface DescripcionTipo {
    /** Nombre impreso, en mayúsculas y sin traducir (manual de muestras impresas, 1.1.4). */
    nombre: string;
    /** Prefijo del número de documento en Cord. */
    prefijo: string;
    /** ¿Lleva copia cedible y acuse de recibo (Ley 19.983)? Las notas no (manual, 1.4). */
    cedible: boolean;
    notaCredito: boolean;
}

export const TIPOS_DTE: Readonly<Record<TipoDte, DescripcionTipo>> = {
    33: { nombre: 'FACTURA ELECTRÓNICA', prefijo: 'FE', cedible: true, notaCredito: false },
    34: { nombre: 'FACTURA NO AFECTA O EXENTA ELECTRÓNICA', prefijo: 'FX', cedible: true, notaCredito: false },
    61: { nombre: 'NOTA DE CRÉDITO ELECTRÓNICA', prefijo: 'NC', cedible: false, notaCredito: true },
};

export const esTipoDte = (v: unknown): v is TipoDte => v === 33 || v === 34 || v === 61;

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
 * La factura exenta no lo da; la nota de crédito se trata con la misma vigencia
 * por prudencia (vencida, el SII rechaza el documento y el folio se pierde).
 */
export const VIGENCIA_CAF_MESES = 6;
export const TIPOS_CON_VIGENCIA: readonly TipoDte[] = [33, 61];

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
