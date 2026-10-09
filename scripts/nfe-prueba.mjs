#!/usr/bin/env node
// Prueba de la NF-e modelo 55 contra el ambiente de HOMOLOGAÇÃO de la SEFAZ
// autorizadora de una UF (o su SVC).
//
//   npm run nfe:prueba -- [--uf SP]
//       Sin certificado: abre TLS con el autorizador de homologación de la UF
//       (verificando la cadena con las raíces estándar + ICP-Brasil) y muestra
//       qué responde sin certificado de cliente. Comprueba red y TLS.
//
//   NFE_PRUEBA_PASSWORD='…' npm run nfe:prueba -- --p12 ruta/certificado.pfx \
//       --uf SP [--svc] [--ie 123456789012] [--crt 1|3|4] [--municipio 3550308]
//       [--serie 890] [--numero N] [--emitir] [--cancelar] [--cce] [--inutilizar N]
//       (o --cert ruta/cert.crt --key ruta/llave.key en lugar de --p12)
//
//       Con el certificado ICP-Brasil (e-CNPJ A1) del contribuyente: consulta
//       el estado del servicio (NFeStatusServico4: prueba el mTLS). Con
//       --emitir arma, firma y envía una NF-e de prueba de R$ 1,00 (un
//       producto NCM 73181500, CFOP 5102, destinatario CNPJ de prueba de la
//       SEFAZ como no contribuyente) y la consulta por su chave; --cancelar
//       registra después la cancelación (110111) y --cce una Carta de
//       Correção (110110). --inutilizar N inutiliza el número N de la serie.
//       --svc envía a la SEFAZ Virtual de Contingencia de la UF (tpEmis 6/7).
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' y no hay opción para cambiarlo. En homologação el
// destinatario se llama, por regla, "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO -
// SEM VALOR FISCAL": las notas no tienen validez fiscal.
import { request } from 'node:https';
import { readFileSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { parseArgs } from 'node:util';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { titularDoCertificado } from '../src/lib/fiscal/latam/nfse/certificado.ts';
import { dataHoraBrasilia } from '../src/lib/fiscal/latam/nfse/dps.ts';
import { AUTORIZADOR_UF, TP_EMIS, XJUST_CONTINGENCIA, autorizadorContingencia, codigoUf, esUf } from '../src/lib/fiscal/latam/nfe/constantes.ts';
import { RAICES_ICP_BRASIL } from '../src/lib/fiscal/latam/nfe/icp-raizes.ts';
import { armarNfe, comXmlAssinado, conNumero } from '../src/lib/fiscal/latam/nfe/nfe.ts';
import {
    consSitNFe, consStatServ, envEvento, enviNFe, eventoAssinado, idLote, inutilizacaoAssinada, lerRetConsSit, lerRetConsStatServ,
    lerRetEnvEvento, lerRetInut, lerRetornoLote, pedidoCancelamento, pedidoCce, pedidoInutilizacao,
} from '../src/lib/fiscal/latam/nfe/mensagens.ts';
import { chamarSefaz, urlServico } from '../src/lib/fiscal/latam/nfe/soap.ts';
import { responsavelTecnico } from '../src/lib/fiscal/latam/nfe/resp-tec.ts';

const ENTORNO = 'homologacion';

const { values: args } = parseArgs({
    options: {
        p12: { type: 'string' },
        cert: { type: 'string' },
        key: { type: 'string' },
        uf: { type: 'string', default: 'SP' },
        svc: { type: 'boolean', default: false },
        ie: { type: 'string' },
        crt: { type: 'string', default: '1' },
        municipio: { type: 'string' },
        serie: { type: 'string', default: '890' },
        numero: { type: 'string' },
        emitir: { type: 'boolean', default: false },
        cancelar: { type: 'boolean', default: false },
        cce: { type: 'boolean', default: false },
        inutilizar: { type: 'string' },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`nfe:prueba: ${m}\n`); process.exit(1); };

const uf = String(args.uf).toUpperCase();
if (!esUf(uf)) fallar(`UF desconocida: ${args.uf}`);
const autorizador = args.svc ? autorizadorContingencia(uf, ENTORNO) : AUTORIZADOR_UF[uf];

function sinCertificado() {
    const url = new URL(urlServico(ENTORNO, autorizador, 'NfeStatusServico'));
    return new Promise((resolve) => {
        const req = request({ hostname: url.hostname, path: url.pathname, method: 'GET', timeout: 20_000, ca: [...rootCertificates, ...RAICES_ICP_BRASIL.map((r) => r.pem)] }, (res) => {
            resolve(`HTTP ${res.statusCode} (TLS verificado con las raíces estándar + ICP-Brasil; sin certificado de cliente la SEFAZ no atiende)`);
            res.resume();
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (e) => resolve(`sin respuesta: ${e.message}`));
        req.end();
    });
}

if (!args.p12 && !args.cert) {
    linea(`Autorizador ${autorizador} (homologação) de ${uf}: ${urlServico(ENTORNO, autorizador, 'NfeStatusServico')}`);
    linea(await sinCertificado());
    linea('Pasa --p12 (o --cert/--key) con el certificado ICP-Brasil del contribuyente para probar el mTLS y emitir.');
    process.exit(0);
}

const cert = args.p12
    ? parsearCertificado({ pkcs12: readFileSync(args.p12), pkcs12Password: process.env.NFE_PRUEBA_PASSWORD ?? '' })
    : parsearCertificado({ certificado: readFileSync(args.cert), llave: readFileSync(args.key), llavePassword: process.env.NFE_PRUEBA_PASSWORD ?? '' });
const titular = titularDoCertificado(cert.certPem);
if (titular.tipo !== 'cnpj') fallar('La NF-e se emite con el e-CNPJ: el certificado es de un CPF.');
const cnpj = titular.numero;
linea(`Certificado: ${cert.sujetoCN} — CNPJ ${cnpj}, vence ${cert.caduca.toISOString().slice(0, 10)}`);
const credencial = { certPem: cert.certPem, keyPem: cert.keyPem };
const llamar = async (servico, mensagem, aut = autorizador) => {
    const r = await chamarSefaz(ENTORNO, aut, servico, mensagem, credencial, { timeoutMs: 60_000 });
    if (!r.resultado) linea(`  (HTTP ${r.status}, sin nfeResultMsg) ${r.cuerpo.slice(0, 300)}`);
    return r.resultado;
};

// 1. Estado del servicio: prueba el mTLS.
const status = lerRetConsStatServ(await llamar('NfeStatusServico', consStatServ(ENTORNO, codigoUf(uf))));
linea(`NFeStatusServico4 (${autorizador}): ${status ? `${status.cStat} ${status.xMotivo}` : 'sin respuesta legible'}`);
if (!status || status.cStat !== '107') process.exit(status ? 0 : 1);

if (args.inutilizar) {
    const n = Number(args.inutilizar);
    const pedido = pedidoInutilizacao({ entorno: ENTORNO, cUF: codigoUf(uf), ano: dataHoraBrasilia(new Date()).slice(2, 4), cnpj, serie: Number(args.serie), nNFIni: n, nNFFin: n, xJust: 'Teste de inutilizacao em homologacao via Cord' });
    const ret = lerRetInut(await llamar('NfeInutilizacao', inutilizacaoAssinada(pedido, cert.certPem, cert.keyPem), AUTORIZADOR_UF[uf]));
    linea(`NFeInutilizacao4: ${ret ? `${ret.cStat} ${ret.xMotivo} ${ret.nProt}` : 'sin respuesta legible'}`);
}

if (!args.emitir) process.exit(0);
if (!args.ie) fallar('--emitir necesita --ie (Inscrição Estadual del emisor).');

// 2. Emisión de una NF-e de prueba.
const municipio = args.municipio || { SP: '3550308', RS: '4314902', PR: '4106902', MG: '3106200', RJ: '3304557' }[uf];
if (!municipio) fallar('Indica --municipio (código IBGE del establecimiento).');
const crt = Number(args.crt);
const base = armarNfe({
    entorno: ENTORNO,
    cnpjEmissor: cnpj,
    razaoSocial: cert.sujetoCN.split(':')[0] || 'Emitente de teste',
    ajustes: {
        serie: Number(args.serie), crt, ie: args.ie, logradouro: 'Rua de Teste', numero: '1', bairro: 'Centro', municipio, cep: '01001000',
        indPres: '2', modFrete: '9', pis: { cst: crt === 3 ? '07' : '99' }, cofins: { cst: crt === 3 ? '07' : '99' },
        infCpl: 'NF-e de teste emitida pelo Cord em homologacao',
    },
    receptor: {
        // CNPJ de teste aceito em homologação como não contribuinte.
        taxId: '99999999000191', nome: 'Teste', pais: 'BR', logradouro: 'Rua de Teste', cep: '01001000',
        nfe: { numero: '1', bairro: 'Centro', municipio, indIEDest: '9', consumidorFinal: true },
    },
    lineas: [{
        description: 'Produto de teste', quantity: 1, unitPrice: 1, taxRate: 0, subtotal: 1, taxAmount: 0, total: 1,
        nfe: { ncm: '73181500', cfop: '5102', origem: '0', unidade: 'UN', ...(crt === 3 ? { aliquotaIcms: 18, cClassTrib: '000001' } : { csosn: '102' }) },
    }],
    totales: { subtotal: 1, taxes: 0, total: 1, currency: 'BRL' },
    respTec: responsavelTecnico(),
    instante: new Date(Date.now() - 10_000),
});
const numero = Number(args.numero) || (Date.now() % 900_000) + 1;
const tpEmis = args.svc ? TP_EMIS[autorizador] : TP_EMIS.normal;
const sol = comXmlAssinado(conNumero(base, numero, {
    tpEmis,
    contingencia: args.svc ? { dhCont: dataHoraBrasilia(new Date(Date.now() - 60_000)), xJust: XJUST_CONTINGENCIA } : null,
    csrt: responsavelTecnico()?.csrt?.[uf] ?? null,
}), cert.certPem, cert.keyPem);
linea(`NF-e de prueba: serie ${sol.serie}, número ${sol.nNF}, chave ${sol.chave}`);
const lote = lerRetornoLote(await llamar('NFeAutorizacao', enviNFe(idLote(), sol.xml)));
linea(`NFeAutorizacao4: lote ${lote ? `${lote.cStat} ${lote.xMotivo}` : 'sin respuesta legible'}${lote?.prot ? ` — protocolo ${lote.prot.cStat} ${lote.prot.xMotivo} ${lote.prot.nProt}` : ''}`);
const sit = lerRetConsSit(await llamar('NfeConsultaProtocolo', consSitNFe(ENTORNO, sol.chave)));
linea(`NfeConsultaProtocolo4: ${sit ? `${sit.cStat} ${sit.xMotivo}` : 'sin respuesta legible'}`);
const nProt = lote?.prot?.nProt || sit?.prot?.nProt;
if (!nProt) process.exit(0);

if (args.cce) {
    const p = pedidoCce({ entorno: ENTORNO, cUF: codigoUf(uf), cnpj, chave: sol.chave, nSeq: 1, xCorrecao: 'Correcao de teste do endereco do destinatario', dhEvento: dataHoraBrasilia(new Date(Date.now() - 10_000)) });
    const r = lerRetEnvEvento(await llamar('RecepcaoEvento', envEvento(idLote(), eventoAssinado(p, cert.certPem, cert.keyPem)), AUTORIZADOR_UF[uf]));
    linea(`CC-e (110110): ${r ? `${r.cStat} ${r.xMotivo} ${r.nProt}` : 'sin respuesta legible'}`);
}
if (args.cancelar) {
    const p = pedidoCancelamento({ entorno: ENTORNO, cUF: codigoUf(uf), cnpj, chave: sol.chave, nProt, xJust: 'Cancelamento de NF-e de teste em homologacao', dhEvento: dataHoraBrasilia(new Date(Date.now() - 10_000)) });
    const r = lerRetEnvEvento(await llamar('RecepcaoEvento', envEvento(idLote(), eventoAssinado(p, cert.certPem, cert.keyPem))));
    linea(`Cancelamento (110111): ${r ? `${r.cStat} ${r.xMotivo} ${r.nProt}` : 'sin respuesta legible'}`);
    const fin = lerRetConsSit(await llamar('NfeConsultaProtocolo', consSitNFe(ENTORNO, sol.chave)));
    linea(`NfeConsultaProtocolo4 tras cancelar: ${fin ? `${fin.cStat} ${fin.xMotivo}` : 'sin respuesta legible'}`);
}
