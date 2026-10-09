// Constantes de la NFS-e de Padrão Nacional (Brasil, Sistema Nacional NFS-e),
// cada una con su fuente primaria. Nada de esto se escribió de memoria: si una
// cambia, se cambia aquí citando la versión nueva del documento, y
// scripts/nfse-check.mjs lo vuelve a probar.
//
// Fuentes (descargadas el 2026-10-09 de
// https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica):
//   [XSD]   NFSe-ESQUEMAS_XSD-v1.01-20260209 (producción) y
//           NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727 (producción restringida);
//           copia en scripts/fixtures/nfse/producao{,-restrita}/.
//   [AI]    ANEXO_I-SEFIN_ADN-DPS_NFSe-SNNFSe-v1.01-20260209: leiaute de la DPS
//           y de la NFS-e, reglas de negocio (RN DPS_NFS-e, RN_RECEPCAO_DPS) y
//           la lista de servicios con su incidencia (MUN.INCID_INFO.SERV.).
//   [AII]   ANEXO_II-SEFIN_ADN-PEDREGEVT_EVT-SNNFSe-v1.01-20260122: pedido de
//           registro de evento (cancelación e101101) y sus reglas.
//   [MAN]   "Manual dos Contribuintes — Guia para utilização das APIs do Emissor
//           Público Nacional" v1.2 (out/2025): POST /nfse, GET /nfse/{chave},
//           GET|HEAD /dps/{id}, POST /nfse/{chave}/eventos.
//   [API]   Swagger "API NFS-e - Sefin Nacional v1" de producción restringida
//           (host sefin.producaorestrita.nfse.gov.br, basePath /SefinNacional).
//           La documentación pide certificado ICP-Brasil para abrirse (403 sin
//           él); la copia de scripts/fixtures/nfse/sefin-nacional.swagger.json
//           es la captura publicada en github.com/Fm-s/open-nfse
//           (specs/sefin-nacional.openapi.json).
//   [NT004] Nota Técnica SE/CGNFS-e nº 004 v2.00 (10/12/2025), §1.1: los
//           grupos IBSCBS son FACULTATIVOS; la regla de obligatoriedad está
//           suspendida en producción restringida y producción.
//   [NT008] Nota Técnica SE/CGNFS-e nº 008 v1.02 (14/07/2026): DANFSe, QR de
//           consulta pública y leyendas.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import type { EntornoRail } from '../rieles.ts';

/** URL base de la Sefin Nacional por entorno [API host + basePath] [MAN]. */
export const SEFIN_URL: Readonly<Record<EntornoRail, string>> = {
    homologacion: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
    produccion: 'https://sefin.nfse.gov.br/SefinNacional',
};

/** targetNamespace de todos los esquemas de la NFS-e [XSD]. Sin prefijo: E1228 rechaza prefijos [AI RN_RECEPCAO_DPS]. */
export const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';
export const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';

/** Versión del leiaute que Cord envía (TVerNFSe = 1.00|1.01) [XSD]. */
export const VERSAO_LEIAUTE = '1.01';

/** verAplic de la DPS y del pedido de evento (TSVerAplic, 1–20) [XSD]. */
export const VERSAO_APLICATIVO = 'Cord-1.0';

/** tpAmb [AI]: 1 producción, 2 homologación (producción restringida). */
export const TIPO_AMBIENTE: Readonly<Record<EntornoRail, 1 | 2>> = { produccion: 1, homologacion: 2 };

/**
 * Faixas de la serie de la DPS [AI, LEIAUTE serie]: 00001 a 49999 es
 * "Emissão com aplicativo próprio" — el único rango que puede usar Cord. Las
 * demás son del emisor móvil, web y la transcripción manual (E0010).
 */
export const SERIE_MIN = 1;
export const SERIE_MAX = 49999;
/** nDPS: 1 a 999999999999999 [AI] (TSNumDPS = [1-9][0-9]{0,14}). */
export const NUMERO_DPS_MAX = 999_999_999_999_999;

/** Situación ante el Simples Nacional del prestador (opSimpNac) [XSD TSOpSimpNac]. */
export const OP_SIMPLES = [
    { id: 1, es: 'No optante del Simples Nacional', en: 'Not opted into Simples Nacional' },
    { id: 2, es: 'Microemprendedor individual (MEI)', en: 'Individual microentrepreneur (MEI)' },
    { id: 3, es: 'Microempresa o empresa de pequeño porte (ME/EPP)', en: 'Micro or small business (ME/EPP)' },
] as const;
export type OpSimples = typeof OP_SIMPLES[number]['id'];

/** Régimen de apuración del optante ME/EPP (regApTribSN) [XSD TSRegimeApuracaoSimpNac]. */
export const REG_AP_SIMPLES = [
    { id: 1, es: 'Tributos federales y municipal por el Simples Nacional', en: 'Federal and municipal taxes through Simples Nacional' },
    { id: 2, es: 'Federales por el Simples Nacional; ISS fuera de él', en: 'Federal taxes through Simples Nacional; ISS outside it' },
    { id: 3, es: 'Federales y municipal fuera del Simples Nacional', en: 'Federal and municipal taxes outside Simples Nacional' },
] as const;
export type RegApSimples = typeof REG_AP_SIMPLES[number]['id'];

/** Régimen especial de tributación municipal (regEspTrib) [XSD TSRegEspTrib]. */
export const REG_ESPECIAL = [
    { id: 0, es: 'Ninguno', en: 'None' },
    { id: 1, es: 'Acto cooperado (cooperativa)', en: 'Cooperative act' },
    { id: 2, es: 'Estimativa', en: 'Estimate' },
    { id: 3, es: 'Microempresa municipal', en: 'Municipal microbusiness' },
    { id: 4, es: 'Notario o registrador', en: 'Notary or registrar' },
    { id: 5, es: 'Profesional autónomo', en: 'Self-employed professional' },
    { id: 6, es: 'Sociedad de profesionales', en: 'Professional partnership' },
    { id: 9, es: 'Otros', en: 'Other' },
] as const;
export type RegEspecial = typeof REG_ESPECIAL[number]['id'];

/** tribISSQN [XSD TSTribISSQN]: Cord emite solo operaciones tributables. */
export const TRIB_ISSQN_TRIBUTAVEL = 1;
/** tpRetISSQN [XSD TSTipoRetISSQN]. */
export const RET_ISSQN = { naoRetido: 1, retidoTomador: 2 } as const;

/** Alícuota del ISSQN: nunca superior a 5 % [AI E0595]. */
export const ALIQUOTA_ISS_MAX = 5;

/**
 * Firma XMLDSig. Los esquemas 1.01 importan el xmldsig genérico (no fijan
 * algoritmos); el único documento oficial que los fija es el xmldsig
 * restringido de los esquemas 1.00, que sigue publicado en el paquete de
 * producción: C14N 2001, RSA-SHA1, SHA-1, transformaciones enveloped + C14N y
 * KeyInfo/X509Data/X509Certificate. Cord firma exactamente así, de modo que la
 * firma cumple el esquema más estricto y el genérico a la vez
 * (scripts/nfse-check.mjs valida contra los dos).
 */
export const DSIG = {
    c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    rsaSha1: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    sha1: 'http://www.w3.org/2000/09/xmldsig#sha1',
    enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
} as const;

/** Evento de cancelación (e101101) [AII]: código, descripción fija y motivos. */
export const EVENTO_CANCELAMENTO = {
    codigo: '101101',
    xDesc: 'Cancelamento de NFS-e',
    motivos: { erroEmissao: 1, servicoNaoPrestado: 2, outros: 9 },
    /** nSeqEvento del cancelamento: evento único, siempre 001 [AII infEvento/nSeqEvento]. */
    nSeq: 1,
} as const;

/** QR del DANFSe [NT008 §2.4.3]: la URL de consulta pública + la chave de acceso. */
export const URL_CONSULTA_PUBLICA = 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=';
/** Texto que acompaña al QR [NT008 §2.4.3]. */
export const LEYENDA_QR = 'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e';
/** Leyenda obligatoria de la NFS-e de pruebas (tpAmb = 2) [NT008 §2 y §2.4.3]. */
export const LEYENDA_SEM_VALIDADE = 'NFS-e SEM VALIDADE JURÍDICA';

/**
 * Grupo IBSCBS de la DPS (reforma tributaria, LC 214/2025). FACULTATIVO en
 * 2026 [NT004 §1.1]: Cord no lo envía porque llenarlo exige clasificar cada
 * operación (cIndOp, CST, cClassTrib) con datos que Cord no tiene, e
 * inventarlos sería declarar un dato fiscal falso. scripts/nfse-check.mjs
 * verifica que los esquemas vendorizados lo siguen teniendo minOccurs="0":
 * el día que un esquema nuevo lo vuelva obligatorio, el check falla.
 */
export const IBSCBS_FACULTATIVO = true;

/** Situación de la NFS-e generada (cStat) [AI LEIAUTE NFSe/infNFSe/cStat]. */
export const SITUACAO_NFSE: Readonly<Record<string, string>> = {
    100: 'NFS-e Gerada',
    102: 'NFS-e de Decisão Judicial ou Administrativa',
    103: 'NFS-e Avulsa',
    107: 'NFS-e MEI',
};
