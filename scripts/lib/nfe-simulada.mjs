// La SEFAZ autorizadora simulada para las pruebas de la NF-e: recibe los
// mensajes que Cord pone dentro de nfeDadosMsg (enviNFe, consReciNFe,
// consSitNFe, consStatServ, envEvento, inutNFe) y devuelve los retornos con
// el leiaute real (retEnviNFe, retConsSitNFe, retEnvEvento, retInutNFe…).
// scripts/nfe-check.mjs valida esos retornos —y los "proc" que Cord arma con
// ellos— contra los XSD oficiales, de modo que lo que leen las pruebas tiene
// la forma que devuelve una SEFAZ.
//
// Reglas que aplica, las mismas que harían fallar a Cord en producción: firma
// (resumen y valor contra el certificado del propio XML), chave con su DV,
// Id = "NFe" + chave, ambiente, duplicidad por chave (204) y por número con
// otra chave (539), eventos sobre una nota autorizada, secuencia de CC-e y
// duplicidad de evento (573).
//
// La usan scripts/nfe-check.mjs (Node plano) y las pruebas test/nfe-*.test.ts.
import { createHash, createVerify, X509Certificate } from 'node:crypto';
import { atributo, bloco, canonicoDoElemento, el, texto } from '../../src/lib/fiscal/latam/nfse/xml.ts';
import { NS_NFE } from '../../src/lib/fiscal/latam/nfe/constantes.ts';
import { dvChave } from '../../src/lib/fiscal/latam/nfe/chave.ts';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';

/** Verifica la firma enveloped de `tag` (con su Id) dentro de `xml`. Devuelve el DigestValue o lanza. */
export function verificarFirma(xml, tag, atributos = '') {
    const id = atributo(xml, tag, 'Id');
    if (!id) throw new Error(`firma: ${tag} sin Id`);
    const canonico = canonicoDoElemento(xml, tag, id, NS_NFE, atributos);
    const digest = createHash('sha1').update(canonico, 'utf8').digest('base64');
    const sig = /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">([\s\S]*?)<\/Signature>/.exec(xml);
    if (!sig) throw new Error('firma: sin Signature');
    const signedInfo = /<SignedInfo>[\s\S]*?<\/SignedInfo>/.exec(sig[1])[0].replace('<SignedInfo>', `<SignedInfo xmlns="${NS_DSIG}">`);
    if (!signedInfo.includes(`URI="#${id}"`)) throw new Error('firma: la referencia no apunta al elemento');
    const digestValue = /<DigestValue>([^<]+)<\/DigestValue>/.exec(signedInfo)[1];
    if (digestValue !== digest) throw new Error('firma: el resumen no coincide (297)');
    const valor = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(sig[1])[1];
    const der = Buffer.from(/<X509Certificate>([^<]+)<\/X509Certificate>/.exec(sig[1])[1], 'base64');
    const cert = new X509Certificate(der);
    if (!createVerify('RSA-SHA1').update(signedInfo, 'utf8').verify(cert.publicKey, valor, 'base64')) throw new Error('firma: valor inválido (297)');
    return digestValue;
}

const pad = (n, k) => String(n).padStart(k, '0');

export function sefazSimulada(opts = {}) {
    const est = {
        notas: new Map(),
        porNumero: new Map(),
        nProt: 135260000000000,
        inutilizadas: [],
        lotes: new Map(),
        dhRecbto: opts.dhRecbto ?? '2026-10-09T12:00:05-03:00',
        cUF: opts.cUF ?? '35',
    };
    const proximoProt = () => String(++est.nProt);
    const cab = (tpAmb) => `${el('tpAmb', tpAmb)}${el('verAplic', 'SEFAZ-SIMULADA')}`;

    function protNFe(tpAmb, chave, cStat, xMotivo, digVal, nProt) {
        return `<protNFe versao="4.00"><infProt>${cab(tpAmb)}${el('chNFe', chave)}${el('dhRecbto', est.dhRecbto)}`
            + `${nProt ? el('nProt', nProt) : ''}${digVal ? el('digVal', digVal) : ''}${el('cStat', cStat)}${el('xMotivo', xMotivo)}</infProt></protNFe>`;
    }

    /** Procesa UNA NF-e y devuelve su protNFe (o un rechazo de lote). */
    function processar(nfe, tpAmbLote, forzado) {
        const chave = (atributo(nfe, 'infNFe', 'Id') || '').replace(/^NFe/, '');
        const tpAmb = texto(nfe, 'tpAmb');
        if (tpAmb !== tpAmbLote) return { lote: ['252', 'Rejeição: Ambiente informado diverge do Ambiente de recebimento'] };
        let digVal;
        try { digVal = verificarFirma(nfe, 'infNFe', ' versao="4.00"'); } catch (e) { return { prot: protNFe(tpAmb, chave, '297', 'Rejeição: Assinatura difere do calculado', null, null), erro: e.message }; }
        if (dvChave(chave.slice(0, 43)) !== chave[43]) return { prot: protNFe(tpAmb, chave, '253', 'Rejeição: Digito Verificador da chave de acesso composta inválida', null, null) };
        if (forzado?.cStat) return { prot: protNFe(tpAmb, chave, forzado.cStat, forzado.xMotivo ?? `Rejeição: código ${forzado.cStat}`, digVal, forzado.nProt ?? null), chave };
        if (est.notas.has(chave)) return { prot: protNFe(tpAmb, chave, '204', `Rejeição: Duplicidade de NF-e [nRec:${pad(0, 15)}]`, null, null) };
        const cnpj = texto(bloco(nfe, 'emit'), 'CNPJ');
        const numero = `${cnpj}|${texto(nfe, 'serie')}|${texto(nfe, 'nNF')}`;
        const outra = est.porNumero.get(numero);
        if (outra) return { prot: protNFe(tpAmb, chave, '539', `Rejeição: Duplicidade de NF-e com diferença na Chave de Acesso [chNFe: ${outra}][nRec:${pad(0, 15)}]`, null, null) };
        const nProt = proximoProt();
        const prot = protNFe(tpAmb, chave, '100', 'Autorizado o uso da NF-e', digVal, nProt);
        est.notas.set(chave, { xml: nfe, prot, nProt, cancelada: null, eventos: [] });
        est.porNumero.set(numero, chave);
        return { prot, chave };
    }

    function retEnviNFe(tpAmb, cStat, xMotivo, extra = '') {
        return `<retEnviNFe xmlns="${NS_NFE}" versao="4.00">${cab(tpAmb)}${el('cStat', cStat)}${el('xMotivo', xMotivo)}${el('cUF', est.cUF)}${el('dhRecbto', est.dhRecbto)}${extra}</retEnviNFe>`;
    }

    function procEvento(ev) {
        return `<procEventoNFe versao="1.00">${ev.evento.replace(` xmlns="${NS_NFE}"`, '')}${ev.ret}</procEventoNFe>`;
    }

    return {
        estado: est,

        /** Autorización (NFeAutorizacao4). `forzado`: { cStat, xMotivo } para un protocolo de rechazo/denegación; `lote`: [cStat, xMotivo] para rechazar el lote; `async`: devolver 103. */
        autorizacao(mensagem, plan = {}) {
            const nfe = /<NFe xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe">[\s\S]*<\/NFe>/.exec(mensagem)?.[0];
            const amb = /<tpAmb>(\d)<\/tpAmb>/.exec(nfe ?? '')?.[1] ?? '2';
            if (texto(mensagem, 'indSinc') !== '1') return retEnviNFe(amb, '452', 'Rejeição: Solicitada resposta assíncrona');
            if (plan.lote) return retEnviNFe(amb, plan.lote[0], plan.lote[1]);
            const r = processar(nfe, amb, plan.forzado);
            if (r.lote) return retEnviNFe(amb, r.lote[0], r.lote[1]);
            if (plan.async) {
                const nRec = `35${pad(est.lotes.size + 1, 13)}`;
                est.lotes.set(nRec, r.prot);
                return retEnviNFe(amb, '103', 'Lote recebido com sucesso', `<infRec>${el('nRec', nRec)}${el('tMed', '1')}</infRec>`);
            }
            return retEnviNFe(amb, '104', 'Lote processado', r.prot);
        },

        /** NFeRetAutorizacao4. */
        consReci(mensagem) {
            const nRec = texto(mensagem, 'nRec');
            const tpAmb = texto(mensagem, 'tpAmb');
            const prot = est.lotes.get(nRec);
            const corpo = prot ? `${el('cStat', '104')}${el('xMotivo', 'Lote processado')}${el('cUF', est.cUF)}${el('dhRecbto', est.dhRecbto)}${prot}`
                : `${el('cStat', '106')}${el('xMotivo', 'Lote não localizado')}${el('cUF', est.cUF)}${el('dhRecbto', est.dhRecbto)}`;
            return `<retConsReciNFe xmlns="${NS_NFE}" versao="4.00">${cab(tpAmb)}${el('nRec', nRec)}${corpo}</retConsReciNFe>`;
        },

        /** NFeConsultaProtocolo4. */
        consulta(mensagem, plan = {}) {
            const chave = texto(mensagem, 'chNFe');
            const tpAmb = texto(mensagem, 'tpAmb');
            const n = est.notas.get(chave);
            const ret = (cStat, xMotivo, extra = '') => `<retConsSitNFe xmlns="${NS_NFE}" versao="4.00">${cab(tpAmb)}${el('cStat', cStat)}${el('xMotivo', xMotivo)}${el('cUF', est.cUF)}${el('dhRecbto', est.dhRecbto)}${el('chNFe', chave)}${extra}</retConsSitNFe>`;
            if (plan.cStat) return ret(plan.cStat, plan.xMotivo ?? `Rejeição: código ${plan.cStat}`);
            if (!n) return ret('217', 'Rejeição: NF-e não consta na base de dados da SEFAZ');
            const eventos = n.eventos.map(procEvento).join('');
            return n.cancelada ? ret('101', 'Cancelamento de NF-e homologado', n.prot + eventos) : ret('100', 'Autorizado o uso da NF-e', n.prot + eventos);
        },

        /** NFeStatusServico4. */
        status(mensagem, cStat = '107') {
            const tpAmb = texto(mensagem, 'tpAmb');
            const xMotivo = { 107: 'Serviço em Operação', 108: 'Serviço Paralisado Momentaneamente (curto prazo)', 109: 'Serviço Paralisado sem Previsão', 114: 'SVC desabilitada pela SEFAZ Origem' }[cStat] ?? 'Status';
            return `<retConsStatServ xmlns="${NS_NFE}" versao="4.00">${cab(tpAmb)}${el('cStat', cStat)}${el('xMotivo', xMotivo)}${el('cUF', texto(mensagem, 'cUF'))}${el('dhRecbto', est.dhRecbto)}${el('tMed', '1')}</retConsStatServ>`;
        },

        /** NFeRecepcaoEvento4 (cancelación y CC-e). */
        evento(mensagem, plan = {}) {
            const idLote = texto(mensagem, 'idLote');
            const evento = /<evento xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe" versao="1\.00">[\s\S]*<\/evento>/.exec(mensagem)[0];
            const tpAmb = texto(evento, 'tpAmb');
            const chave = texto(evento, 'chNFe');
            const tpEvento = texto(evento, 'tpEvento');
            const nSeq = texto(evento, 'nSeqEvento');
            const cOrgao = texto(evento, 'cOrgao');
            const retEvento = (cStat, xMotivo, nProt) => `<retEvento versao="1.00"><infEvento>${cab(tpAmb)}${el('cOrgao', cOrgao)}${el('cStat', cStat)}${el('xMotivo', xMotivo)}`
                + `${el('chNFe', chave)}${el('tpEvento', tpEvento)}${el('xEvento', tpEvento === '110111' ? 'Cancelamento registrado' : 'Carta de Correção registrada')}${el('nSeqEvento', nSeq)}`
                + `${el('dhRegEvento', est.dhRecbto)}${nProt ? el('nProt', nProt) : ''}</infEvento></retEvento>`;
            const resp = (ret) => `<retEnvEvento xmlns="${NS_NFE}" versao="1.00">${el('idLote', idLote)}${cab(tpAmb)}${el('cOrgao', cOrgao)}${el('cStat', '128')}${el('xMotivo', 'Lote de Evento Processado')}${ret}</retEnvEvento>`;
            try { verificarFirma(evento, 'infEvento'); } catch { return resp(retEvento('297', 'Rejeição: Assinatura difere do calculado')); }
            if (plan.cStat) return resp(retEvento(plan.cStat, plan.xMotivo ?? `Rejeição: código ${plan.cStat}`));
            const n = est.notas.get(chave);
            if (!n) return resp(retEvento('580', 'Rejeição: O evento exige uma NF-e autorizada'));
            if (n.eventos.some((e) => e.tpEvento === tpEvento && e.nSeq === nSeq)) return resp(retEvento('573', 'Rejeição: Duplicidade de Evento'));
            if (n.cancelada) return resp(retEvento('218', 'Rejeição: NF-e já está cancelada na base de dados da SEFAZ'));
            const nProt = proximoProt();
            const ret = retEvento('135', 'Evento registrado e vinculado a NF-e', nProt);
            n.eventos.push({ tpEvento, nSeq, evento, ret });
            if (tpEvento === '110111') n.cancelada = nProt;
            return resp(ret);
        },

        /** NFeInutilizacao4. */
        inutilizacao(mensagem, plan = {}) {
            const inf = bloco(mensagem, 'infInut');
            const tpAmb = texto(inf, 'tpAmb');
            const campos = ['cUF', 'ano', 'CNPJ', 'mod', 'serie', 'nNFIni', 'nNFFin'].map((k) => el(k, texto(inf, k))).join('');
            const ret = (cStat, xMotivo, nProt) => `<retInutNFe xmlns="${NS_NFE}" versao="4.00"><infInut>${cab(tpAmb)}${el('cStat', cStat)}${el('xMotivo', xMotivo)}${campos}${el('dhRecbto', est.dhRecbto)}${nProt ? el('nProt', nProt) : ''}</infInut></retInutNFe>`;
            try { verificarFirma(mensagem, 'infInut'); } catch { return ret('297', 'Rejeição: Assinatura difere do calculado'); }
            if (plan.cStat) return ret(plan.cStat, plan.xMotivo ?? `Rejeição: código ${plan.cStat}`);
            const ini = Number(texto(inf, 'nNFIni'));
            const fin = Number(texto(inf, 'nNFFin'));
            const cnpj = texto(inf, 'CNPJ');
            const serie = texto(inf, 'serie');
            for (let k = ini; k <= fin; k++) {
                if (est.porNumero.has(`${cnpj}|${serie}|${k}`)) return ret('241', 'Rejeição: Um número da faixa já foi utilizado');
            }
            est.inutilizadas.push({ cnpj, serie, ini, fin });
            return ret('102', 'Inutilização de número homologado', proximoProt());
        },
    };
}
