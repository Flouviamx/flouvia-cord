// Lectura de la NFS-e que genera la Sefin Nacional (leiaute NFSe 1.01,
// ANEXO_I "LEIAUTE DPS_NFS-e") y su cotejo con la DPS que Cord envió.
//
// La NFS-e encapsula la DPS firmada por el emisor: con el Id de esa DPS y sus
// valores se reconoce que una NFS-e es la de ESTE intento (por ejemplo, al
// recuperarla después de un corte de red), y con los valores que calculó la
// Sefin (base del ISSQN, alícuota, valor líquido) se detecta una diferencia con
// el total del documento de Cord.
//
// Puro: lo cargan el proveedor, las pruebas y los scripts.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import { atributo, bloco, texto } from './xml.ts';
import type { SolicitudNfse } from './dps.ts';

export interface NfseLida {
    /** Chave de acceso (50 posiciones): el Id de infNFSe sin el prefijo "NFS". */
    chave: string;
    nNFSe: string;
    cStat: string;
    dhProc: string;
    ambGer: string;
    xLocEmi: string;
    xLocPrestacao: string;
    cLocIncid: string;
    xLocIncid: string;
    xTribNac: string;
    emit: { documento: string; im: string; nome: string; uf: string };
    valores: { vBC: string; pAliqAplic: string; vISSQN: string; vTotalRet: string; vLiq: string };
    dps: { id: string; tpAmb: string; serie: string; nDPS: string; vServ: string; vDescIncond: string; tpRetISSQN: string; tomador: string };
}

/** Lee una NFS-e. Null si el XML no es una NFS-e con chave. */
export function lerNfse(xml: string): NfseLida | null {
    const id = atributo(xml, 'infNFSe', 'Id');
    if (!/^NFS[0-9A-Z]{50}$/.test(id)) return null;
    const inf = bloco(xml, 'infNFSe') ?? '';
    // Lo que es de la NFS-e (antes de la DPS encapsulada) y lo que es de la DPS.
    const corte = inf.search(/<(?:[\w.-]+:)?DPS[\s>]/);
    const propio = corte >= 0 ? inf.slice(0, corte) : inf;
    const dpsXml = corte >= 0 ? inf.slice(corte) : '';
    const emit = bloco(propio, 'emit') ?? '';
    const valores = bloco(propio, 'valores') ?? '';
    const toma = bloco(dpsXml, 'toma') ?? '';
    return {
        chave: id.slice(3),
        nNFSe: texto(propio, 'nNFSe'),
        cStat: texto(propio, 'cStat'),
        dhProc: texto(propio, 'dhProc'),
        ambGer: texto(propio, 'ambGer'),
        xLocEmi: texto(propio, 'xLocEmi'),
        xLocPrestacao: texto(propio, 'xLocPrestacao'),
        cLocIncid: texto(propio, 'cLocIncid'),
        xLocIncid: texto(propio, 'xLocIncid'),
        xTribNac: texto(propio, 'xTribNac'),
        emit: {
            documento: texto(emit, 'CNPJ') || texto(emit, 'CPF'),
            im: texto(emit, 'IM'),
            nome: texto(emit, 'xNome'),
            uf: texto(bloco(emit, 'enderNac'), 'UF'),
        },
        valores: {
            vBC: texto(valores, 'vBC'),
            pAliqAplic: texto(valores, 'pAliqAplic'),
            vISSQN: texto(valores, 'vISSQN'),
            vTotalRet: texto(valores, 'vTotalRet'),
            vLiq: texto(valores, 'vLiq'),
        },
        dps: {
            id: atributo(dpsXml, 'infDPS', 'Id'),
            tpAmb: texto(dpsXml, 'tpAmb'),
            serie: texto(dpsXml, 'serie'),
            nDPS: texto(dpsXml, 'nDPS'),
            vServ: texto(bloco(dpsXml, 'vServPrest'), 'vServ'),
            vDescIncond: texto(dpsXml, 'vDescIncond'),
            tpRetISSQN: texto(dpsXml, 'tpRetISSQN'),
            tomador: texto(toma, 'CNPJ') || texto(toma, 'CPF'),
        },
    };
}

const mesmoValor = (a: string, b: string | undefined) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

/** ¿Esta NFS-e es la de la DPS que Cord envió? (mismo Id, ambiente, tomador y valores). */
export function nfseCorresponde(n: NfseLida, s: SolicitudNfse): boolean {
    return n.dps.id === s.id
        && n.dps.tpAmb === String(s.tpAmb)
        && n.dps.tomador === (s.toma?.numero ?? '')
        && mesmoValor(n.dps.vServ, s.valores.vServ)
        && mesmoValor(n.dps.vDescIncond || '0', s.valores.vDescIncond ?? '0')
        && n.dps.tpRetISSQN === String(s.valores.tpRetISSQN);
}

/**
 * Diferencia entre el valor líquido que calculó la Sefin y el total del
 * documento de Cord (solo puede ocurrir con ISS retenido, cuando la alícuota
 * municipal difiere de la del perfil de retención). Null si cuadran.
 */
export function diferencaValorLiquido(n: NfseLida, s: SolicitudNfse): { nfse: string; cord: string } | null {
    if (!n.valores.vLiq) return null;
    return mesmoValor(n.valores.vLiq, s.esperado.vLiq) ? null : { nfse: n.valores.vLiq, cord: s.esperado.vLiq };
}
