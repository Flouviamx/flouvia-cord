// La Sefin Nacional simulada para las pruebas de la NFS-e: genera, a partir de
// la DPS firmada que Cord envió, la NFS-e que el sistema nacional devolvería —
// con el leiaute NFSe 1.01 completo (ANEXO_I "LEIAUTE DPS_NFS-e"), la DPS
// encapsulada byte a byte y una firma del "município". scripts/nfse-check.mjs
// valida esa NFS-e contra los XSD oficiales, de modo que lo que leen las
// pruebas tiene la forma real.
//
// Lo único inventado es lo que calcula el sistema nacional: el número de la
// NFS-e, el código numérico de la chave (aleatorio por definición) y su dígito
// verificador, que la documentación no especifica y que Cord nunca recalcula
// (lo recibe y lo guarda).
//
// La usan scripts/nfse-check.mjs (Node plano) y test/nfse-db.test.ts.
import { assinar, atributo, el, grupo, texto } from '../../src/lib/fiscal/latam/nfse/xml.ts';
import { NS_NFSE } from '../../src/lib/fiscal/latam/nfse/constantes.ts';

/** La DPS firmada tal como viaja (sin la declaración XML), para encapsularla. */
function dpsEncapsulada(dpsXml) {
    return dpsXml.replace(/^<\?xml[^>]*\?>/, '').replace(/^<DPS xmlns="[^"]*"/, '<DPS');
}

/**
 * NFS-e de la DPS `dpsXml`. `opts`: { nNFSe, dhProc, cNum, aliquota (% para el
 * cálculo del ISSQN), certPem, keyPem (del "município"), xLocEmi, uf }.
 */
export function nfseSimulada(dpsXml, opts) {
    const id = atributo(dpsXml, 'infDPS', 'Id');
    const cLocEmi = texto(dpsXml, 'cLocEmi');
    const doc = /<prest><(CNPJ|CPF)>([^<]+)</.exec(dpsXml);
    const tpInsc = doc[1] === 'CPF' ? '1' : '2';
    const tpAmb = texto(dpsXml, 'tpAmb');
    const nNFSe = String(opts.nNFSe ?? 1);
    const dhProc = opts.dhProc ?? '2026-10-09T12:00:05-03:00';
    const aamm = dhProc.slice(2, 4) + dhProc.slice(5, 7);
    const base = `${cLocEmi}2${tpInsc}${doc[2].padStart(14, '0')}${nNFSe.padStart(13, '0')}${aamm}${String(opts.cNum ?? 123456789).padStart(9, '0')}`;
    const dv = String([...base].reduce((s, c, i) => s + (Number.parseInt(c, 36) % 10) * ((i % 8) + 2), 0) % 10);
    const chave = base + dv;
    const vServ = Number(texto(dpsXml, 'vServ'));
    const desc = Number(texto(dpsXml, 'vDescIncond') || 0);
    const retido = texto(dpsXml, 'tpRetISSQN') === '2';
    const pAliqInf = texto(dpsXml, 'pAliq');
    const aliquota = pAliqInf ? Number(pAliqInf) : Number(opts.aliquota ?? 5);
    const vBC = vServ - desc;
    const vISS = Math.round(vBC * aliquota) / 100;
    const vLiq = vBC - (retido ? vISS : 0);
    const f = (n) => n.toFixed(2);
    const inf = `<infNFSe Id="NFS${chave}">`
        + el('xLocEmi', opts.xLocEmi ?? 'São Paulo')
        + el('xLocPrestacao', opts.xLocEmi ?? 'São Paulo')
        + el('nNFSe', nNFSe)
        + el('cLocIncid', cLocEmi)
        + el('xLocIncid', opts.xLocEmi ?? 'São Paulo')
        + el('xTribNac', 'Serviço da lista nacional')
        + el('verAplic', 'SefinNac_1.0')
        + el('ambGer', 2)
        + el('tpEmis', 1)
        + el('procEmi', 1)
        + el('cStat', 100)
        + el('dhProc', dhProc)
        + el('nDFSe', opts.nDFSe ?? nNFSe)
        + grupo('emit',
            el(doc[1], doc[2]),
            el('xNome', opts.xNome ?? 'Empresa de Teste Ltda'),
            grupo('enderNac', el('xLgr', 'Avenida Paulista'), el('nro', '1000'), el('xBairro', 'Bela Vista'), el('cMun', cLocEmi), el('UF', opts.uf ?? 'SP'), el('CEP', '01310100')),
        )
        + grupo('valores', el('vBC', f(vBC)), el('pAliqAplic', aliquota.toFixed(2)), el('vISSQN', f(vISS)), ...(retido ? [el('vTotalRet', f(vISS))] : []), el('vLiq', f(vLiq)))
        + dpsEncapsulada(dpsXml)
        + '</infNFSe>';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><NFSe xmlns="${NS_NFSE}" versao="1.01">${inf}</NFSe>`;
    return {
        chave,
        tpAmb,
        id,
        xml: assinar(xml, { raiz: 'NFSe', tag: 'infNFSe', id: `NFS${chave}`, ns: NS_NFSE, certPem: opts.certPem, keyPem: opts.keyPem }),
    };
}
