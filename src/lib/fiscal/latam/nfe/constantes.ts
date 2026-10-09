// Constantes de la NF-e modelo 55 (Brasil, venta de mercancías), cada una con
// su fuente primaria. Nada de esto se escribió de memoria: si una cambia, se
// cambia aquí citando la versión nueva del documento, y scripts/nfe-check.mjs
// lo vuelve a probar contra la copia vendorizada (scripts/fixtures/nfe/, con
// el SHA-256 de cada original en fuentes.json).
//
// Fuentes (descargadas el 2026-10-09 de https://www.nfe.fazenda.gov.br/portal):
//   [MOC]   Manual de Orientação do Contribuinte 7.00, Visão Geral (nov/2020):
//           chave de acceso y su DV (2.2.6), padrones de comunicación, firma y
//           certificado (4.2), servicios síncronos/asíncronos (4.3), web services
//           (5.1–5.10).
//   [AI]    MOC 7.0 Anexo I – Leiaute e Regras de Validação (reglas y cStat).
//   [AII]   MOC 7.0 Anexo II – Especificações Técnicas do DANFE e Código de Barras.
//   [AIII]  MOC 7.0 Anexo III – Manual de Contingência NF-e (SVC-AN / SVC-RS).
//   [XSD]   Pacote de Liberação 010f v1.04 (NT 2025.002 v1.50 + NT 2026.007,
//           31/08/2026) para el leiaute de la NF-e; 010d v1.03 (consulta,
//           inutilização y eventos, CNPJ alfanumérico); 009q (raíces que los
//           paquetes 010 no republican: enviNFe, retEnviNFe, consReciNFe…) y los
//           esquemas específicos de cancelación (e110111) y CC-e (e110110).
//   [WS]    "Relação de Serviços Web" del Portal Nacional (producción y
//           homologación): URL de cada servicio por autorizador y qué UF usa
//           SVAN, SVRS, SVC-AN y SVC-RS.
//   [WSDL]  WSDL de los seis servicios 4.00 publicados por la SEFAZ-MT (las demás
//           SEFAZ exigen certificado de cliente incluso para el WSDL): namespace,
//           operación y soapAction de cada servicio, iguales en todo el país.
//   [NT2025.001] v1.03: lote de UNA NF-e exige respuesta síncrona (indSinc=1;
//           rechazo 452 desde 13/10/2025), plazo de emisión y pagamento posterior.
//   [NT2025.002] RTC v1.52: grupo IBSCBS. Para CRT 3 es OBLIGATORIO en
//           producción desde 03/08/2026 (RV UB12-10, rechazo 1115); para el
//           Simples Nacional (CRT 1, 2 y 4) recién desde 04/01/2027. En 2026:
//           pIBSUF 0,1 %, pIBSMun 0 %, pCBS 0,9 % (UB18-10, UB37-10, UB56-10) y
//           el IBS/CBS no suma al vNF (VB01-10, excepción 1).
//   [NT2018.005] v1.52: grupo del responsable técnico (infRespTec) y CSRT.
//   [NTC2025.001] Nota Técnica Conjunta 2025.001 + NT 2026.004: CNPJ
//           alfanumérico — DV de la chave con valores ASCII − 48 y código de barras
//           híbrido CODE-128 C/A.
//   [NT2026.010] DANFE de la Reforma Tributaria (producción 01/12/2026).
//
// Puro: lo cargan los scripts de contrato con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { EntornoRail } from '../rieles.ts';
import { UF_CODIGO } from '../nfse/municipios.ts';

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
export const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
export const NS_SOAP12 = 'http://www.w3.org/2003/05/soap-envelope';

/** Versión del leiaute de la NF-e y de sus mensajes de web service [XSD TVerNFe]. */
export const VERSAO_NFE = '4.00';
/** Versión del leiaute de eventos (envEvento/evento/detEvento) [XSD leiauteEvento]. */
export const VERSAO_EVENTO = '1.00';
export const MODELO_NFE = '55';
/** verProc (TString 1–20) [AI B27]. */
export const VERSAO_APLICATIVO = 'Cord 1.0';

/** tpAmb [AI B24]: 1 producción, 2 homologación. */
export const TIPO_AMBIENTE: Readonly<Record<EntornoRail, 1 | 2>> = { produccion: 1, homologacion: 2 };

/**
 * xNome del destinatario obligatorio en homologación [AI E04-20, rechazo 598].
 */
export const DEST_HOMOLOGACAO = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';

// ── Unidades de la federación y autorizadores ───────────────────────────────

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'] as const;
export type Uf = typeof UFS[number];

export const esUf = (v: unknown): v is Uf => typeof v === 'string' && (UFS as readonly string[]).includes(v);

/** Código IBGE de la UF (cUF) [MOC 8.1]: la misma tabla que usa la NFS-e. */
export function codigoUf(uf: Uf): string {
    return UF_CODIGO[uf];
}

export function ufDeCodigo(cUF: string): Uf | null {
    const e = Object.entries(UF_CODIGO).find(([, c]) => c === cUF);
    return e && esUf(e[0]) ? e[0] : null;
}

export type Autorizador = 'AM' | 'BA' | 'GO' | 'MG' | 'MS' | 'MT' | 'PE' | 'PR' | 'RS' | 'SP' | 'SVAN' | 'SVRS' | 'SVC-AN' | 'SVC-RS';
export type AutorizadorContingencia = 'SVC-AN' | 'SVC-RS';

/**
 * Autorizador normal de cada UF [WS, "UF que utilizam a SVAN/SVRS"]: las diez
 * con SEFAZ propia, MA en la SVAN y las demás en la SVRS. Igual en los dos
 * ambientes.
 */
export const AUTORIZADOR_UF: Readonly<Record<Uf, Autorizador>> = {
    AM: 'AM', BA: 'BA', GO: 'GO', MG: 'MG', MS: 'MS', MT: 'MT', PE: 'PE', PR: 'PR', RS: 'RS', SP: 'SP',
    MA: 'SVAN',
    AC: 'SVRS', AL: 'SVRS', AP: 'SVRS', CE: 'SVRS', DF: 'SVRS', ES: 'SVRS', PA: 'SVRS', PB: 'SVRS', PI: 'SVRS',
    RJ: 'SVRS', RN: 'SVRS', RO: 'SVRS', RR: 'SVRS', SC: 'SVRS', SE: 'SVRS', TO: 'SVRS',
};

/**
 * SEFAZ Virtual de Contingencia de cada UF [WS, "Autorizadores em
 * contingência"]. Los dos ambientes difieren en una sola UF: PI usa la SVC-AN
 * en producción y la SVC-RS en homologación (así lo publica el portal).
 */
const SVC_RS_PRODUCCION: readonly Uf[] = ['AM', 'BA', 'GO', 'MA', 'MS', 'MT', 'PE', 'PR'];
const SVC_RS_HOMOLOGACION: readonly Uf[] = ['AM', 'BA', 'GO', 'MA', 'MS', 'MT', 'PE', 'PI', 'PR'];
export function autorizadorContingencia(uf: Uf, entorno: EntornoRail): AutorizadorContingencia {
    return (entorno === 'produccion' ? SVC_RS_PRODUCCION : SVC_RS_HOMOLOGACION).includes(uf) ? 'SVC-RS' : 'SVC-AN';
}

/** tpEmis [AI B22, AIII 2.1.3.5]: 1 normal, 6 SVC-AN, 7 SVC-RS. */
export const TP_EMIS = { normal: '1', 'SVC-AN': '6', 'SVC-RS': '7' } as const;
export type TpEmis = typeof TP_EMIS[keyof typeof TP_EMIS];

// ── Web services 4.00 ────────────────────────────────────────────────────────

export type ServicoNfe = 'NFeAutorizacao' | 'NFeRetAutorizacao' | 'NfeConsultaProtocolo' | 'NfeStatusServico' | 'RecepcaoEvento' | 'NfeInutilizacao';

/**
 * Namespace del mensaje (nfeDadosMsg / nfeResultMsg) y soapAction de cada
 * servicio [WSDL]. Sin cabecera SOAP: los WSDL 4.00 no declaran nfeCabecMsg.
 */
export const SERVICOS: Readonly<Record<ServicoNfe, { ns: string; acao: string }>> = {
    NFeAutorizacao: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote' },
    NFeRetAutorizacao: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4/nfeRetAutorizacaoLote' },
    NfeConsultaProtocolo: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF' },
    NfeStatusServico: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF' },
    RecepcaoEvento: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento' },
    NfeInutilizacao: { ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4', acao: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF' },
};

type Urls = Partial<Record<ServicoNfe, string>>;

/**
 * URL de cada servicio por autorizador y ambiente [WS], tal como las publica el
 * Portal Nacional (sin el sufijo ?wsdl que algunas filas traen). La SVC-RS no
 * ofrece inutilização y la SVC no debe usarse para ella [AIII 2.1.3.4 e].
 */
export const URL_SERVICO: Readonly<Record<EntornoRail, Readonly<Record<Autorizador, Urls>>>> = {
    produccion: {
        AM: {
            NfeInutilizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefaz.am.gov.br/services2/services/NfeConsulta4',
            NfeStatusServico: 'https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
        },
        BA: {
            NfeInutilizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        GO: {
            NfeInutilizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
        },
        MG: {
            NfeInutilizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
            RecepcaoEvento: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
        },
        MS: {
            NfeInutilizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
        },
        MT: {
            NfeInutilizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4',
            NfeStatusServico: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4',
        },
        PE: {
            NfeInutilizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4',
        },
        PR: {
            NfeInutilizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfe.sefa.pr.gov.br/nfe/NFeStatusServico4',
            RecepcaoEvento: 'https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4',
        },
        RS: {
            NfeInutilizacao: 'https://nfe.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
        SP: {
            NfeInutilizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
            NfeStatusServico: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
            RecepcaoEvento: 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
        },
        SVAN: {
            NfeInutilizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        SVRS: {
            NfeInutilizacao: 'https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
        'SVC-AN': {
            NfeInutilizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://www.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        'SVC-RS': {
            NfeConsultaProtocolo: 'https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
    },
    homologacion: {
        AM: {
            NfeInutilizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
            NfeConsultaProtocolo: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeConsulta4',
            NfeStatusServico: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeStatusServico4',
            RecepcaoEvento: 'https://homnfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
            NFeAutorizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
            NFeRetAutorizacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
        },
        BA: {
            NfeInutilizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        GO: {
            NfeInutilizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
            RecepcaoEvento: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
        },
        MG: {
            NfeInutilizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4',
            RecepcaoEvento: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
        },
        MS: {
            NfeInutilizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
            RecepcaoEvento: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
        },
        MT: {
            NfeInutilizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4',
            NfeConsultaProtocolo: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeConsulta4',
            NfeStatusServico: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4',
            RecepcaoEvento: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4',
            NFeAutorizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
            NFeRetAutorizacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4',
        },
        PE: {
            NfeInutilizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4',
            RecepcaoEvento: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4',
        },
        PR: {
            NfeInutilizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4',
            NfeConsultaProtocolo: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeConsultaProtocolo4',
            NfeStatusServico: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4',
            RecepcaoEvento: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4',
            NFeAutorizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4',
            NFeRetAutorizacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4',
        },
        RS: {
            NfeInutilizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
        SP: {
            NfeInutilizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
            NfeStatusServico: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
            RecepcaoEvento: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
            NFeAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
            NFeRetAutorizacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
        },
        SVAN: {
            NfeInutilizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        SVRS: {
            NfeInutilizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
        'SVC-AN': {
            NfeInutilizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
            NfeConsultaProtocolo: 'https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx',
            NfeStatusServico: 'https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx',
            RecepcaoEvento: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
            NFeAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        },
        'SVC-RS': {
            NfeConsultaProtocolo: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx',
            NfeStatusServico: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx',
            RecepcaoEvento: 'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
            NFeAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
            NFeRetAutorizacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        },
    },
};

// ── Numeración ───────────────────────────────────────────────────────────────

/** Serie de la NF-e de un emisor CNPJ con aplicativo propio: 0 a 889 [MOC 2.2.8, tabla 2-4]. */
export const SERIE_MIN = 0;
export const SERIE_MAX = 889;
/** nNF: 1 a 999999999 [XSD TNF]. */
export const NUMERO_MAX = 999_999_999;
/** Una inutilização cubre como mucho 10.000 números [MOC 5.3.4 I04, rechazo 201]. */
export const INUTILIZACAO_MAX = 10_000;

// ── Régimen y tributos que Cord declara ──────────────────────────────────────

/** CRT [AI C21]: 1 Simples Nacional, 2 Simples con exceso de sublímite, 3 Régimen Normal, 4 MEI. */
export const CRT = [
    { id: 1, es: 'Simples Nacional', en: 'Simples Nacional' },
    { id: 3, es: 'Régimen Normal', en: 'Regular regime (Regime Normal)' },
    { id: 4, es: 'Simples Nacional · MEI', en: 'Simples Nacional · MEI' },
] as const;
export type Crt = typeof CRT[number]['id'];

/**
 * CSOSN que Cord declara [XSD ICMSSN101/ICMSSN102]: 101 con crédito (solo
 * CRT 1: el MEI no transfiere crédito), 102, 103, 300 y 400. Los de
 * sustitución tributaria (201, 202, 203, 500) y el 900 fallan cerrado.
 */
export const CSOSN = [
    { id: '101', es: 'Tributada por el Simples, con permiso de crédito', en: 'Taxed under Simples, with credit' },
    { id: '102', es: 'Tributada por el Simples, sin permiso de crédito', en: 'Taxed under Simples, without credit' },
    { id: '103', es: 'Exención del ICMS en el Simples por faja de ingresos', en: 'ICMS exempt under Simples revenue bracket' },
    { id: '300', es: 'Inmune', en: 'Immune' },
    { id: '400', es: 'No tributada por el Simples', en: 'Not taxed under Simples' },
] as const;
/** CST del ICMS del Régimen Normal que Cord declara: solo 00 (tributada integralmente) [XSD ICMS00]. */
export const CST_ICMS = [{ id: '00', es: 'Tributada integralmente', en: 'Fully taxed' }] as const;

/** Sustitución tributaria y demás CST/CSOSN que Cord no declara (fallan cerrado antes de numerar). */
export const CSOSN_ST = ['201', '202', '203', '500'];
export const CST_ICMS_NO_SOPORTADOS = ['02', '10', '15', '20', '30', '40', '41', '50', '51', '53', '60', '61', '70', '90'];

/**
 * Origen de la mercancía [XSD Torig, AI N11]. 0 nacional; 1 a 8 importada o
 * con contenido importado.
 */
export const ORIGEM = [
    { id: '0', es: 'Nacional', en: 'Domestic' },
    { id: '1', es: 'Extranjera, importación directa', en: 'Foreign, direct import' },
    { id: '2', es: 'Extranjera, adquirida en el mercado interno', en: 'Foreign, bought in the domestic market' },
    { id: '3', es: 'Nacional con más de 40 % de contenido importado', en: 'Domestic, over 40% imported content' },
    { id: '4', es: 'Nacional producida según procesos productivos básicos', en: 'Domestic, basic production processes' },
    { id: '5', es: 'Nacional con hasta 40 % de contenido importado', en: 'Domestic, up to 40% imported content' },
    { id: '6', es: 'Extranjera, importación directa sin similar nacional (CAMEX)', en: 'Foreign, direct import without domestic equivalent' },
    { id: '7', es: 'Extranjera, mercado interno sin similar nacional (CAMEX)', en: 'Foreign, domestic market without domestic equivalent' },
    { id: '8', es: 'Nacional con más de 70 % de contenido importado', en: 'Domestic, over 70% imported content' },
] as const;

/**
 * CFOP de venta que Cord emite: 5.101/5.102 dentro del estado y su par
 * 6.101/6.102 entre estados (Tabela de CFOP del Portal, scripts/fixtures/nfe/).
 * El producto declara el de dentro del estado; para una venta interestatal Cord
 * usa el par 6.xxx. Combustibles, sustitución tributaria, exportación y los
 * demás CFOP no se emiten.
 */
export const CFOP_INTERNO = ['5101', '5102'] as const;
export const CFOP_INTERESTADUAL: Readonly<Record<string, string>> = { 5101: '6101', 5102: '6102' };

/** IPI que Cord declara [XSD TIpi/IPITrib]: CST 50 (saída tributada) con cEnq 999 [MOC 8.9]. */
export const IPI_CST_TRIBUTADA = '50';
export const IPI_CENQ_OUTROS = '999';

/**
 * CST de PIS/COFINS que Cord declara [XSD PISAliq / PISNT / PISOutr]: 01 y 02
 * con la alícuota que declara el negocio; 04, 05, 06, 07, 08 y 09 sin
 * tributo (grupo NT); 49 y 99 con base y valor cero (grupo Outr).
 */
export const CST_PIS_COFINS = [
    { id: '01', grupo: 'Aliq', es: 'Operación tributable, alícuota básica', en: 'Taxable, basic rate' },
    { id: '02', grupo: 'Aliq', es: 'Operación tributable, alícuota diferenciada', en: 'Taxable, differentiated rate' },
    { id: '04', grupo: 'NT', es: 'Tributable monofásica, reventa a alícuota cero', en: 'Single-phase, resale at zero rate' },
    { id: '05', grupo: 'NT', es: 'Tributable por sustitución tributaria', en: 'Taxed by tax substitution' },
    { id: '06', grupo: 'NT', es: 'Tributable a alícuota cero', en: 'Taxable at zero rate' },
    { id: '07', grupo: 'NT', es: 'Exenta de la contribución', en: 'Exempt' },
    { id: '08', grupo: 'NT', es: 'Sin incidencia de la contribución', en: 'Not levied' },
    { id: '09', grupo: 'NT', es: 'Con suspensión de la contribución', en: 'Suspended' },
    { id: '49', grupo: 'Outr', es: 'Otras operaciones de salida', en: 'Other outgoing operations' },
    { id: '99', grupo: 'Outr', es: 'Otras operaciones', en: 'Other operations' },
] as const;
export type CstPisCofins = typeof CST_PIS_COFINS[number]['id'];

/**
 * IBS/CBS en 2026 [NT2025.002 UB18-10, UB37-10, UB56-10]: alícuotas fijas de la
 * fase de prueba (arts. 343 y 346 de la LC 214/2025). Para otros años Cord no
 * tiene la alícuota de referencia y falla cerrado.
 */
export const IBSCBS_2026 = { pIBSUF: '0.1000', pIBSMun: '0.0000', pCBS: '0.9000' } as const;
/** Desde esta fecha el grupo IBSCBS es obligatorio en producción para CRT 3 [NT2025.002 UB12-10 obs. 2]. */
export const IBSCBS_OBRIGATORIO_CRT3 = '2026-08-03';
/** Desde esta fecha también para el Simples Nacional (CRT 1, 2, 4) [UB12-10 obs. 3]: sin reglas publicadas, Cord no emite. */
export const IBSCBS_OBRIGATORIO_SIMPLES = '2027-01-04';
/**
 * Clasificaciones tributarias (cClassTrib) del IBS/CBS que Cord declara: las
 * de CST 000 (tributación integral), alícuota "Padrão", sin reducción ni grupos
 * especiales y habilitadas para la NF-e (indNFe = 1) en la Tabela de
 * Classificação Tributária del 01/10/2026 (scripts/fixtures/nfe/). Las demás
 * exigen grupos (reducción, diferimiento, monofasia…) que Cord no arma.
 */
export const CCLASSTRIB_SOPORTADAS = [
    { id: '000001', cst: '000', es: 'Tributación integral por IBS y CBS', en: 'Fully taxed by IBS and CBS' },
] as const;

// ── Eventos ──────────────────────────────────────────────────────────────────

export const EVENTO_CANCELAMENTO = { tpEvento: '110111', descEvento: 'Cancelamento', nSeq: 1 } as const;
export const EVENTO_CCE = { tpEvento: '110110', descEvento: 'Carta de Correcao', nSeqMax: 20 } as const;
/** Un evento de cancelación procede dentro de las 24 horas de la autorización [MOC 5.9.3 2P12-14, rechazo 501]. */
export const CANCELAMENTO_PRAZO_HORAS = 24;
/**
 * Condiciones de uso de la Carta de Correção: texto literal obligatorio, la
 * variante sin acentos de la enumeración del esquema e110110_v1.00.xsd
 * [MOC 5.10.1 HP20a]. scripts/nfe-check.mjs lo compara con el XSD.
 */
export const CCE_COND_USO = 'A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.';

// ── Pagamento ────────────────────────────────────────────────────────────────

/**
 * tPag [Tabela de Meios de Pagamento, Portal, 06/03/2026]: 91 "Pagamento
 * Posterior" (vigente desde 03/11/2025) cuando el cobro ocurre después de la
 * emisión, con vPag = 0 [NT2025.001 YA03-30]; 99 "Outros" con su descripción
 * cuando el documento ya está cobrado al emitirse.
 */
export const TPAG_POSTERIOR = '91';
export const TPAG_OUTROS = '99';

/** indPres [AI B25b]: lo declara el negocio en sus ajustes. */
export const IND_PRES = [
    { id: '1', es: 'Operación presencial', en: 'In person' },
    { id: '2', es: 'No presencial, por internet', en: 'Not in person, online' },
    { id: '3', es: 'No presencial, por teléfono', en: 'Not in person, by phone' },
    { id: '9', es: 'No presencial, otros', en: 'Not in person, other' },
] as const;

/** modFrete [AI X02, AII 3.1.10]. */
export const MOD_FRETE = [
    { id: '9', es: 'Sin transporte', en: 'No transport' },
    { id: '0', es: 'Por cuenta del remitente (CIF)', en: 'Paid by the sender (CIF)' },
    { id: '1', es: 'Por cuenta del destinatario (FOB)', en: 'Paid by the recipient (FOB)' },
    { id: '2', es: 'Por cuenta de terceros', en: 'Paid by third parties' },
    { id: '3', es: 'Transporte propio del remitente', en: "Sender's own transport" },
    { id: '4', es: 'Transporte propio del destinatario', en: "Recipient's own transport" },
] as const;

/**
 * UF que no admiten destinatario "contribuyente exento de inscripción"
 * (indIEDest = 2) en operaciones internas e interestatales [NT2025.001
 * E16a-30, rechazo 805], salvo ítems exentos, inmunes o no tributados.
 */
export const UF_SEM_ISENTO_IE: readonly Uf[] = ['AL', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MG', 'MS', 'MT', 'PB', 'PE', 'RJ', 'RN', 'RS', 'SE', 'SP'];

/**
 * UF que exigen el grupo del responsable técnico (infRespTec) [NT2018.005
 * ZD01-10: AM, MS, PE, PR, SC y TO en producción; las demás, a criterio de
 * cada UF]. PR exige además el CSRT desde 23/02/2026 [ZD07-10 obs. 1].
 */
export const UF_EXIGE_RESP_TEC: readonly Uf[] = ['AM', 'MS', 'PE', 'PR', 'SC', 'TO'];
export const UF_EXIGE_CSRT: readonly Uf[] = ['PR'];

/**
 * NCM de combustibles y lubricantes (capítulo 27, etanol 2207 y biodiésel
 * 3826): exigen el grupo de combustible y, desde la RTC, la monofasia
 * [AI LA01-20, NT2025.002 UB12-10 exc. 2]. Cord no los emite.
 */
export const NCM_COMBUSTIVEL = /^(27|2207|3826)/;

// ── Leyendas ─────────────────────────────────────────────────────────────────

/** Leyenda del DANFE de homologación [AII 3, "SEM VALOR FISCAL"]. */
export const LEYENDA_SEM_VALOR = 'SEM VALOR FISCAL';
/** Texto del campo 1 de conteúdo variável en emisión normal o SVC [AII 3.9.1]. */
export const LEYENDA_CONSULTA = 'Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora';
/** Motivo de la contingencia (xJust, 15–256) que Cord declara al entrar en la SVC [AIII 2.1.3.5]. */
export const XJUST_CONTINGENCIA = 'SEFAZ autorizadora indisponivel: emissao pela Sefaz Virtual de Contingencia';
