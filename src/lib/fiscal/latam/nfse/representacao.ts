// Lo que el PDF de Cord imprime de una NFS-e autorizada, además de emisor,
// receptor, conceptos y totales:
//
//   - número de la NFS-e, competencia, fecha de emisión (dhProc), serie y
//     número de la DPS, municipio emisor, servicio de la lista nacional,
//     municipio de incidencia, base, alícuota y valor del ISSQN, retención y
//     valor líquido — tal como los calculó la Sefin (no los de Cord);
//   - la chave de acceso completa (50 posiciones) y el QR de la consulta
//     pública con su leyenda [NT 008 v1.02, §2.1.1 y §2.4.3];
//   - "NFS-e SEM VALIDADE JURÍDICA" en el ambiente de pruebas [NT 008 §2].
//
// El PDF de Cord no es el DANFSe: la NT 008 fija para él un modelo propio
// (DANFSe v2.0) en el que no puede figurar nada que no esté en el XML de la
// NFS-e. Por eso el pie lo dice tal cual: es el documento comercial que
// acompaña a la NFS-e, que se consulta por su chave.
//
// Se arma UNA vez al autorizar y se guarda en provider_data (latam/representacion.ts).
// Puro: lo prueba scripts/nfse-check.mjs con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { FilaRepresentacion, RepresentacionImpresa } from '../representacion.ts';
import { LEYENDA_QR, LEYENDA_SEM_VALIDADE, SITUACAO_NFSE, URL_CONSULTA_PUBLICA } from './constantes.ts';
import type { SolicitudNfse } from './dps.ts';
import type { NfseLida } from './nfse.ts';
import { servicoNacional } from './servicos.ts';

const fechaDma = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(String(iso ?? ''));
    if (!m) return '';
    return m[4] ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : `${m[3]}/${m[2]}/${m[1]}`;
};

const reais = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v !== undefined
        ? `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
        : '';
};

/** Chave en bloques de 4 para leerla impresa (el QR lleva la chave corrida). */
export const chaveAgrupada = (chave: string) => chave.replace(/(.{4})(?=.)/g, '$1 ');

export function urlConsultaPublica(chave: string): string {
    return `${URL_CONSULTA_PUBLICA}${chave}`;
}

export function representacionNfse(d: { nfse: NfseLida; solicitud: SolicitudNfse; homologacion: boolean }): RepresentacionImpresa {
    const n = d.nfse;
    const s = d.solicitud;
    const servico = servicoNacional(s.serv.cTribNac);
    const filas: FilaRepresentacion[] = [
        { k: 'Número da NFS-e', v: n.nNFSe },
        { k: 'Competência', v: fechaDma(s.dCompet) },
        { k: 'Emissão da NFS-e', v: fechaDma(n.dhProc) },
        { k: 'Série / número da DPS', v: `${s.serie} / ${s.nDPS}` },
        { k: 'Situação', v: SITUACAO_NFSE[n.cStat] ?? n.cStat },
        { k: 'Município emissor', v: n.xLocEmi || s.cLocEmi },
    ];
    if (s.prest.im) filas.push({ k: 'Inscrição municipal', v: s.prest.im });
    filas.push({ k: 'Serviço (cód. nacional)', v: `${s.serv.cTribNac.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3')}${servico ? ` ${servico.descricao}` : ''}` });
    if (n.xLocIncid) filas.push({ k: 'Incidência do ISSQN', v: n.xLocIncid });
    if (s.valores.vDescIncond) filas.push({ k: 'Desconto incondicionado', v: reais(s.valores.vDescIncond) });
    if (n.valores.vBC) filas.push({ k: 'Base de cálculo do ISSQN', v: reais(n.valores.vBC) });
    if (n.valores.pAliqAplic) filas.push({ k: 'Alíquota aplicada', v: `${n.valores.pAliqAplic.replace('.', ',')} %` });
    if (n.valores.vISSQN) filas.push({ k: 'ISSQN apurado', v: reais(n.valores.vISSQN) });
    filas.push({ k: 'Retenção do ISSQN', v: s.valores.tpRetISSQN === 2 ? 'Retido pelo tomador' : 'Não retido' });
    if (n.valores.vLiq) filas.push({ k: 'Valor líquido da NFS-e', v: reais(n.valores.vLiq) });

    const leyendas: string[] = [];
    if (d.homologacion) leyendas.push(`${LEYENDA_SEM_VALIDADE}: gerada no ambiente de produção restrita (testes) do Sistema Nacional NFS-e.`);
    leyendas.push(`Chave de acesso da NFS-e: ${chaveAgrupada(n.chave)}.`);

    return {
        rail: 'nfse',
        titulo: 'NFS-e',
        filas,
        qrUrl: urlConsultaPublica(n.chave),
        qrLeyenda: LEYENDA_QR,
        leyendas,
        pie: d.homologacion
            ? `${LEYENDA_SEM_VALIDADE}. NFS-e de teste nº ${n.nNFSe} gerada no ambiente de produção restrita do Sistema Nacional NFS-e.`
            : `Documento comercial que acompanha a NFS-e nº ${n.nNFSe}, gerada pelo Sistema Nacional NFS-e. A NFS-e é consultada pela chave de acesso no portal nacional.`,
        ...(d.homologacion ? { prueba: true } : {}),
    };
}
