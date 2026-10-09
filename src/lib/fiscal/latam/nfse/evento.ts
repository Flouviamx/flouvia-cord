// Pedido de registro del evento de cancelación de una NFS-e (e101101),
// leiaute pedRegEvento 1.01 [ANEXO_II-SEFIN_ADN-PEDREGEVT_EVT-SNNFSe-v1.01]:
//
//   pedRegEvento(versao) > infPedReg(Id = "PRE" + chave (50) + "101101"):
//     tpAmb, verAplic, dhEvento, CNPJAutor | CPFAutor, chNFSe,
//     e101101 { xDesc = "Cancelamento de NFS-e", cMotivo (1|2|9), xMotivo (15–255) }
//   + Signature (enveloped sobre infPedReg), obligatoria en la API [E1989].
//
// El autor es el emisor: su CNPJ/CPF debe ser el del certificado que firma
// (solo el CNPJ raíz se compara) [E0812/E0815].
//
// Puro: lo prueba scripts/nfse-check.mjs con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { EVENTO_CANCELAMENTO, NS_NFSE, TIPO_AMBIENTE, VERSAO_APLICATIVO, VERSAO_LEIAUTE } from './constantes.ts';
import type { DocumentoFederal } from './dps.ts';
import { dataHoraBrasilia } from './dps.ts';
import type { EntornoRail } from '../rieles.ts';
import { RailDatosError } from '../errores.ts';
import { assinar, el, limpar } from './xml.ts';

export interface PedidoCancelamento {
    id: string;
    entorno: EntornoRail;
    autor: DocumentoFederal;
    chave: string;
    dhEvento: string;
    cMotivo: 1 | 2 | 9;
    xMotivo: string;
}

const MOTIVO_PADRAO = 'Cancelamento solicitado pelo prestador do serviço.';

/** xMotivo (TSMotivo: texto Latin-1 de 15 a 255, sin espacios en los bordes). */
export function motivoCancelamento(razon: unknown): string {
    const t = limpar(razon).replace(/\s+/g, ' ').replace(/[^ -ÿ]/g, '').trim().slice(0, 255).trim();
    return t.length >= 15 ? t : MOTIVO_PADRAO;
}

export function pedidoCancelamento(p: { entorno: EntornoRail; autor: DocumentoFederal; chave: string; instante: Date; motivo?: string | null; cMotivo?: 1 | 2 | 9 }): PedidoCancelamento {
    if (!/^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$/.test(p.chave)) throw new RailDatosError('La NFS-e no tiene una chave de acceso válida.');
    return {
        id: `PRE${p.chave}${EVENTO_CANCELAMENTO.codigo}`,
        entorno: p.entorno,
        autor: p.autor,
        chave: p.chave,
        dhEvento: dataHoraBrasilia(p.instante),
        cMotivo: p.cMotivo ?? EVENTO_CANCELAMENTO.motivos.outros,
        xMotivo: motivoCancelamento(p.motivo),
    };
}

export function xmlPedidoCancelamento(p: PedidoCancelamento): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<pedRegEvento xmlns="${NS_NFSE}" versao="${VERSAO_LEIAUTE}">`
        + `<infPedReg Id="${p.id}">`
        + el('tpAmb', TIPO_AMBIENTE[p.entorno])
        + el('verAplic', VERSAO_APLICATIVO)
        + el('dhEvento', p.dhEvento)
        + el(p.autor.tipo === 'CNPJ' ? 'CNPJAutor' : 'CPFAutor', p.autor.numero)
        + el('chNFSe', p.chave)
        + `<e${EVENTO_CANCELAMENTO.codigo}>`
        + el('xDesc', EVENTO_CANCELAMENTO.xDesc)
        + el('cMotivo', p.cMotivo)
        + el('xMotivo', p.xMotivo)
        + `</e${EVENTO_CANCELAMENTO.codigo}>`
        + '</infPedReg>'
        + '</pedRegEvento>';
}

export function pedidoCancelamentoAssinado(p: PedidoCancelamento, certPem: string, keyPem: string): string {
    return assinar(xmlPedidoCancelamento(p), { raiz: 'pedRegEvento', tag: 'infPedReg', id: p.id, ns: NS_NFSE, certPem, keyPem });
}
