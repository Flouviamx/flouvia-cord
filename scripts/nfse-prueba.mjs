#!/usr/bin/env node
// Prueba de la NFS-e de Padrão Nacional contra PRODUCCIÓN RESTRINGIDA
// (homologación) del Sistema Nacional NFS-e.
//
//   npm run nfse:prueba
//       Sin certificado: abre TLS con la Sefin de producción restringida y
//       muestra qué responde sin certificado de cliente (comprueba red y TLS).
//
//   NFSE_PRUEBA_PASSWORD='…' npm run nfse:prueba -- --p12 ruta/certificado.pfx \
//       [--municipio 3550308] [--serie 900] [--servico 010101] [--op-simples 1]
//       [--reg-ap 1 --aliquota-sn 6] [--im 12345] [--tomador 52998224725]
//       [--valor 1.00] [--numero N] [--emitir] [--cancelar]
//       (o --cert ruta/cert.crt --key ruta/llave.key en lugar de --p12)
//
//       Con el certificado ICP-Brasil (e-CNPJ/e-CPF A1) del contribuyente:
//       prueba el mTLS (HEAD /dps/{id} de una DPS que no existe). Con
//       --emitir arma, firma y envía una DPS de prueba (R$ 1,00 por defecto,
//       servicio --servico, sin retención) y vuelve a consultarla por su Id y
//       por la chave. Con --cancelar, además, registra el evento de
//       cancelación (e101101) de la NFS-e de prueba y lo consulta.
//
// Nunca toca la base de datos ni PRODUCCIÓN: el entorno está fijado a
// 'homologacion' y no hay opción para cambiarlo. Las NFS-e de producción
// restringida no tienen validez jurídica.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { parseArgs } from 'node:util';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado.ts';
import { titularDoCertificado } from '../src/lib/fiscal/latam/nfse/certificado.ts';
import { SEFIN_URL } from '../src/lib/fiscal/latam/nfse/constantes.ts';
import { armarDps, conNumero, dpsAssinada, idDps } from '../src/lib/fiscal/latam/nfse/dps.ts';
import { pedidoCancelamento, pedidoCancelamentoAssinado } from '../src/lib/fiscal/latam/nfse/evento.ts';
import { lerNfse, nfseCorresponde } from '../src/lib/fiscal/latam/nfse/nfse.ts';
import { chamarSefin, compactar, descompactar, mensagens } from '../src/lib/fiscal/latam/nfse/sefin.ts';
import { mensajeRechazo } from '../src/lib/fiscal/latam/nfse/erros.ts';

const ENTORNO = 'homologacion';

const { values: args } = parseArgs({
    options: {
        p12: { type: 'string' },
        cert: { type: 'string' },
        key: { type: 'string' },
        municipio: { type: 'string', default: '3550308' },
        serie: { type: 'string', default: '900' },
        servico: { type: 'string', default: '010101' },
        'op-simples': { type: 'string', default: '1' },
        'reg-ap': { type: 'string' },
        'aliquota-sn': { type: 'string' },
        im: { type: 'string' },
        tomador: { type: 'string' },
        valor: { type: 'string', default: '1.00' },
        numero: { type: 'string' },
        emitir: { type: 'boolean', default: false },
        cancelar: { type: 'boolean', default: false },
    },
});

const linea = (t = '') => process.stdout.write(`${t}\n`);
const fallar = (m) => { process.stderr.write(`nfse:prueba: ${m}\n`); process.exit(1); };

function sinCertificado() {
    const url = new URL(`${SEFIN_URL[ENTORNO]}/dps/DPS${'0'.repeat(42)}`);
    return new Promise((resolve) => {
        const req = request({ hostname: url.hostname, path: url.pathname, method: 'HEAD', timeout: 20_000 }, (res) => {
            resolve(`HTTP ${res.statusCode} (TLS verificado; sin certificado de cliente la Sefin no atiende)`);
            res.resume();
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (e) => resolve(`sin respuesta: ${e.message}`));
        req.end();
    });
}

if (!args.p12 && !args.cert) {
    linea(`Sefin Nacional (producción restringida): ${SEFIN_URL[ENTORNO]}`);
    linea(await sinCertificado());
    linea('Pasa --p12 (o --cert/--key) con el certificado ICP-Brasil del contribuyente para probar el mTLS y emitir.');
    process.exit(0);
}

const password = process.env.NFSE_PRUEBA_PASSWORD ?? '';
let parsed;
try {
    parsed = args.p12
        ? parsearCertificado({ pkcs12: new Uint8Array(readFileSync(args.p12)), pkcs12Password: password })
        : parsearCertificado({ certificado: readFileSync(args.cert), llave: readFileSync(args.key), llavePassword: password });
} catch (e) {
    fallar(e instanceof Error ? e.message : String(e));
}
const titular = titularDoCertificado(parsed.certPem);
const documento = { tipo: titular.tipo === 'cpf' ? 'CPF' : 'CNPJ', numero: titular.numero };
const cred = { certPem: parsed.certPem, keyPem: parsed.keyPem };
linea(`Certificado: ${parsed.sujetoCN ?? '(sin CN)'} · ${documento.tipo} ${documento.numero} · vence ${parsed.caduca.toISOString().slice(0, 10)}`);

// 1) mTLS: HEAD de una DPS que no existe (la API lo admite a cualquier certificado válido).
const sonda = idDps(args.municipio, documento, '0', '1');
const head = await chamarSefin(ENTORNO, cred, 'HEAD', `/dps/${sonda}`, undefined, { timeoutMs: 30_000 }).catch((e) => fallar(`la Sefin no respondió: ${e.detalle ?? e.message}`));
linea(`HEAD /dps/{id}: HTTP ${head.status} ${head.status === 404 ? '(certificado aceptado; la DPS no existe, como se esperaba)' : head.status === 403 || head.status === 401 ? '(la Sefin NO acepta este certificado)' : ''}`);
if (!args.emitir) process.exit(0);

// 2) Emisión de una NFS-e de prueba.
const valor = Number(args.valor);
const op = Number(args['op-simples']);
const base = armarDps({
    entorno: ENTORNO, documentoEmisor: documento.numero, municipio: args.municipio, serie: args.serie,
    opSimpNac: op, regApTribSN: args['reg-ap'] ? Number(args['reg-ap']) : null, regEspTrib: 0,
    aliquotaSimples: args['aliquota-sn'] ? Number(args['aliquota-sn']) : null,
    inscricaoMunicipal: args.im ?? null, servico: args.servico,
    receptor: args.tomador ? { taxId: args.tomador, nome: 'Tomador de teste', pais: 'BR' } : { taxId: '', pais: 'BR' },
    lineas: [{ description: 'Serviço de teste (Cord, ambiente de produção restrita)', quantity: 1, unitPrice: valor, taxRate: 0, subtotal: valor, taxAmount: 0, total: valor }],
    totales: { subtotal: valor, taxes: 0, total: valor, currency: 'BRL' },
    instante: new Date(Date.now() - 10_000),
});
const numero = args.numero ? Number(args.numero) : Math.floor(Date.now() / 1000);
const sol = conNumero(base, numero);
const xml = dpsAssinada(sol, cred.certPem, cred.keyPem);
linea(`DPS ${sol.id} (serie ${sol.serie}, número ${sol.nDPS})`);
const post = await chamarSefin(ENTORNO, cred, 'POST', '/nfse', { dpsXmlGZipB64: compactar(xml) }).catch((e) => fallar(`POST /nfse sin respuesta: ${e.detalle ?? e.message}`));
linea(`POST /nfse: HTTP ${post.status}`);
if (post.status !== 201) {
    const erros = mensagens(post.json);
    for (const e of erros) linea(`  ${e.codigo}: ${e.descricao ?? ''}${e.complemento ? ` (${e.complemento})` : ''}`);
    linea(`  Cord mostraría: ${mensajeRechazo(erros)}`);
    process.exit(1);
}
const nfseXml = descompactar(post.json.nfseXmlGZipB64);
const nfse = lerNfse(nfseXml);
linea(`NFS-e nº ${nfse?.nNFSe} · chave ${post.json.chaveAcesso} · cStat ${nfse?.cStat} · vLiq ${nfse?.valores.vLiq}`);
linea(`  corresponde a la DPS enviada: ${nfse ? nfseCorresponde(nfse, sol) : false}`);

// 3) Consulta por el Id de la DPS y por la chave (lo que usa la recuperación).
const porDps = await chamarSefin(ENTORNO, cred, 'GET', `/dps/${sol.id}`);
linea(`GET /dps/{id}: HTTP ${porDps.status} · chave ${porDps.json?.chaveAcesso ?? '—'}`);
const porChave = await chamarSefin(ENTORNO, cred, 'GET', `/nfse/${post.json.chaveAcesso}`);
linea(`GET /nfse/{chave}: HTTP ${porChave.status}`);

if (args.cancelar) {
    const pedido = pedidoCancelamento({ entorno: ENTORNO, autor: documento, chave: post.json.chaveAcesso, instante: new Date(Date.now() - 10_000), motivo: 'Teste de cancelamento da Cord em produção restrita' });
    const ev = await chamarSefin(ENTORNO, cred, 'POST', `/nfse/${post.json.chaveAcesso}/eventos`, { pedidoRegistroEventoXmlGZipB64: compactar(pedidoCancelamentoAssinado(pedido, cred.certPem, cred.keyPem)) });
    linea(`POST /nfse/{chave}/eventos (e101101): HTTP ${ev.status}`);
    for (const e of mensagens(ev.json)) linea(`  ${e.codigo}: ${e.descricao ?? ''}`);
    const consulta = await chamarSefin(ENTORNO, cred, 'GET', `/nfse/${post.json.chaveAcesso}/eventos/101101/1`);
    linea(`GET /nfse/{chave}/eventos/101101/1: HTTP ${consulta.status}`);
}
