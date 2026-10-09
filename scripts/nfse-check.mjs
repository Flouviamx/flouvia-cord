// Contrato de la NFS-e de Padrão Nacional (Brasil) — corre en
// `npm run test:payments` (security:nfse). Sin red: todo contra fuentes
// oficiales vendorizadas en scripts/fixtures/nfse/.
//
// Fuentes (https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica,
// descargadas el 2026-10-09):
//   producao/           NFSe-ESQUEMAS_XSD-v1.01-20260209 (Schemas/1.01) + el
//                       xmldsig restringido de Schemas/1.00.
//   producao-restrita/  NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727.
//   municipios-ibge.tsv ANEXO_A-MUNICIPIO_IBGE-PAISES_ISO2-v1.00-SNNFSe-20251210,
//                       hoja TAB.MUN_IBGE (la UF de Maranhão, vacía en el anexo,
//                       sale del código IBGE).
//   lista-servicos.tsv  ANEXO_I-SEFIN_ADN-DPS_NFSe-SNNFSe-v1.01-20260209, hoja
//                       MUN.INCID_INFO.SERV.
//   sefin-nacional.swagger.json  Swagger "API NFS-e - Sefin Nacional v1" de
//                       producción restringida (su página pide certificado
//                       ICP-Brasil; captura publicada en github.com/Fm-s/open-nfse).
//
// Capas, de la más dura a la más blanda:
//   1. Tablas: municipios.ts y servicos.ts reproducen fila por fila los anexos.
//   2. Contrato de la API: host, rutas y nombres de campo que usa sefin.ts
//      existen en el Swagger.
//   3. Esquema: cada DPS que Cord sabe armar, el pedido de cancelación y una
//      NFS-e simulada se validan con xmllint contra los XSD de PRODUCCIÓN y de
//      PRODUCCIÓN RESTRINGIDA, y la firma contra el xmldsig RESTRINGIDO 1.00
//      (algoritmos fijos). Controles negativos prueban que xmllint valida de
//      verdad. Sin xmllint se avisa y se omite (NFSE_XSD_REQUIRED=1 la vuelve
//      obligatoria).
//   4. Firma: la forma canónica del elemento firmado se recalcula con un
//      canonicalizador independiente (lxml, C14N 1.0) y la firma se verifica con
//      openssl. Sin python3+lxml u openssl se avisa y se omite
//      (NFSE_FIRMA_REQUIRED=1 la vuelve obligatoria).
//   5. Reglas del ANEXO_I que Cord aplica antes de enviar (con controles
//      negativos), el descuento calculado por el motor real de Cord, la lectura
//      de la NFS-e, la representación impresa (NT 008) y los mensajes de error.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { todosLosMunicipios, municipio } from '../src/lib/fiscal/latam/nfse/municipios.ts';
import { SERVICOS_NACIONAIS, servicoNacional } from '../src/lib/fiscal/latam/nfse/servicos.ts';
import {
    DSIG, IBSCBS_FACULTATIVO, LEYENDA_QR, LEYENDA_SEM_VALIDADE, NS_NFSE, SEFIN_URL, SERIE_MAX, URL_CONSULTA_PUBLICA,
} from '../src/lib/fiscal/latam/nfse/constantes.ts';
import { aplicarCambio, faltantesAjustes, servicoSuportado } from '../src/lib/fiscal/latam/nfse/ajustes.ts';
import { armarDps, conNumero, dataHoraBrasilia, descricaoServico, dpsAssinada, idDps, numeroDocumento, xmlDps } from '../src/lib/fiscal/latam/nfse/dps.ts';
import { pedidoCancelamento, pedidoCancelamentoAssinado, motivoCancelamento } from '../src/lib/fiscal/latam/nfse/evento.ts';
import { diferencaValorLiquido, lerNfse, nfseCorresponde } from '../src/lib/fiscal/latam/nfse/nfse.ts';
import { representacionNfse, urlConsultaPublica } from '../src/lib/fiscal/latam/nfse/representacao.ts';
import { ambienteCoincide, chaveValida, compactar, descompactar, mensagens } from '../src/lib/fiscal/latam/nfse/sefin.ts';
import { mensajeRechazo, normalizarCodigo } from '../src/lib/fiscal/latam/nfse/erros.ts';
import { certificadoCobreDocumento, otherNames, titularDoCertificado, OID_ICP_CNPJ, OID_ICP_PF } from '../src/lib/fiscal/latam/nfse/certificado.ts';
import { canonicoDoElemento } from '../src/lib/fiscal/latam/nfse/xml.ts';
import { RailDatosError } from '../src/lib/fiscal/latam/errores.ts';
import { calculateDocumentTotals } from '../packages/elements/src/engine.ts';
import { nfseSimulada } from './lib/nfse-simulada.mjs';

const FIX = fileURLToPath(new URL('./fixtures/nfse/', import.meta.url));
const leer = (f) => readFileSync(join(FIX, f), 'utf8');
const rechaza = (fn, re, msg) => assert.throws(fn, (e) => e instanceof RailDatosError && re.test(e.message), msg);

// ── 1. Tablas oficiales ──────────────────────────────────────────────────────
{
    const filas = leer('municipios-ibge.tsv').trim().split('\n').slice(1).map((l) => l.split('\t'));
    assert.equal(filas.length, 5570, 'el ANEXO_A trae 5570 municipios');
    const ts = todosLosMunicipios();
    assert.equal(ts.length, filas.length, 'municipios.ts tiene los mismos municipios que el anexo');
    for (const [codigo, uf, nome] of filas) {
        const m = municipio(codigo);
        assert.ok(m, `falta el municipio ${codigo}`);
        assert.deepEqual([m.uf, m.nome], [uf, nome], `municipio ${codigo}`);
    }
    assert.deepEqual(municipio('3550308'), { codigo: '3550308', uf: 'SP', nome: 'São Paulo' });
    assert.equal(municipio('3550309'), null, 'un código que no está en la tabla no existe');

    const servicos = leer('lista-servicos.tsv').trim().split('\n').slice(1).map((l) => l.split('\t'));
    assert.equal(SERVICOS_NACIONAIS.length, servicos.length, 'servicos.ts tiene los mismos códigos que el anexo');
    for (const [codigo, incidencia, grupo, descricao] of servicos) {
        assert.deepEqual(servicoNacional(codigo), { codigo, incidencia, grupo, descricao }, `servicio ${codigo}`);
    }
    // Lo que Cord puede declarar: incidencia en el establecimiento del prestador, sin obra ni evento.
    assert.ok(servicoSuportado('010101'), '01.01.01 análisis y desarrollo de sistemas');
    assert.ok(servicoSuportado('170101'), '17.01.01 consultoría');
    assert.ok(!servicoSuportado('070201'), '07.02.01 obra: incidencia en el lugar de la prestación');
    assert.ok(!servicoSuportado('120101'), '12.01.01 espectáculos: grupo atvEvento');
    assert.ok(!servicoSuportado('990101'), '99.01.01 sin incidencia');
}

// ── 2. Contrato de la API (Swagger) ──────────────────────────────────────────
{
    const sw = JSON.parse(leer('sefin-nacional.swagger.json'));
    assert.equal(`https://${sw.host}${sw.basePath}`, SEFIN_URL.homologacion, 'host + basePath de producción restringida');
    assert.equal(SEFIN_URL.produccion, 'https://sefin.nfse.gov.br/SefinNacional', 'producción [Manual dos Contribuintes, swagger de producción]');
    for (const [metodo, ruta] of [['post', '/nfse'], ['get', '/nfse/{chaveAcesso}'], ['get', '/dps/{id}'], ['head', '/dps/{id}'], ['post', '/nfse/{chaveAcesso}/eventos'], ['get', '/nfse/{chaveAcesso}/eventos/{tipoEvento}/{numSeqEvento}']]) {
        assert.ok(sw.paths[ruta]?.[metodo], `${metodo.toUpperCase()} ${ruta} en el Swagger`);
    }
    const d = sw.definitions;
    assert.deepEqual(d.NFSePostRequest.required, ['dpsXmlGZipB64']);
    assert.deepEqual(d.EventosPostRequest.required, ['pedidoRegistroEventoXmlGZipB64']);
    for (const campo of ['tipoAmbiente', 'chaveAcesso', 'idDps', 'nfseXmlGZipB64']) assert.ok(d.NFSePostResponseSucesso.properties[campo], campo);
    assert.ok(d.NFSePostResponseSucesso.properties.alertas, 'alertas');
    assert.ok(d.NFSePostResponseErro.properties.erros, 'erros[]');
    assert.ok(d.ResponseErro.properties.erro, 'erro');
    assert.deepEqual(Object.keys(d.MensagemProcessamento.properties).sort(), ['codigo', 'complemento', 'descricao']);
    assert.ok(d.DpsGetResponse.properties.chaveAcesso && d.NFSeGetResponseSucesso.properties.nfseXmlGZipB64);
    assert.ok(d.EventosPostResponseSucesso.properties.eventoXmlGZipB64);
    assert.deepEqual(sw.paths['/nfse'].post.responses['201'].schema, { $ref: '#/definitions/NFSePostResponseSucesso' });
    assert.deepEqual(Object.keys(sw.paths['/dps/{id}'].get.responses).sort(), ['200', '400', '404'], '404 = no se generó NFS-e para esa DPS');

    // Lo que sefin.ts lee de esos cuerpos.
    assert.deepEqual(mensagens({ erros: [{ codigo: 'E0014', descricao: 'x', complemento: 'y' }] }), [{ codigo: 'E0014', descricao: 'x', complemento: 'y' }]);
    assert.deepEqual(mensagens({ erro: { codigo: 'E1831' } }), [{ codigo: 'E1831' }]);
    assert.ok(ambienteCoincide({ tipoAmbiente: 2 }, 'homologacion') && !ambienteCoincide({ tipoAmbiente: 2 }, 'produccion'));
    assert.ok(ambienteCoincide({ tipoAmbiente: 1 }, 'produccion') && !ambienteCoincide({ tipoAmbiente: 1 }, 'homologacion'));
    const xml = '<?xml version="1.0" encoding="UTF-8"?><DPS>ação</DPS>';
    const b64 = compactar(xml);
    assert.equal(Buffer.from(b64, 'base64').subarray(0, 2).toString('hex'), '1f8b', 'GZip (magic 1f8b) en base64');
    assert.equal(descompactar(b64), xml);
}

// ── Certificados de prueba (ICP-Brasil simulado) ─────────────────────────────
const CNPJ = '16727230000197';
const CPF_TOMADOR = '11144477735';
const CNPJ_TOMADOR = '11222333000181';

/** Certificado con la extensión otherName de la ICP-Brasil (2.16.76.1.3.3 o .1). */
function certificado({ cnpj, cpf } = {}) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0b';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: `EMPRESA DE TESTE:${cnpj ?? cpf}` }]);
    cert.setIssuer([{ name: 'commonName', value: 'AC Teste' }]);
    const asn1 = forge.asn1;
    const otherName = (oid, valor) => asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, valor)]),
    ]);
    const nomes = cnpj
        ? [otherName(OID_ICP_CNPJ, cnpj), otherName('2.16.76.1.3.4', `01011980${'12345678909'}`)]
        : [otherName(OID_ICP_PF, `01011980${cpf}00000000000000000000000000000000`)];
    const san = asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, nomes)).getBytes();
    cert.setExtensions([{ id: '2.5.29.17', value: san }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

const CERT = certificado({ cnpj: CNPJ });
{
    assert.deepEqual(titularDoCertificado(CERT.certPem), { tipo: 'cnpj', numero: CNPJ }, 'e-CNPJ: OID 2.16.76.1.3.3');
    const pf = certificado({ cpf: CPF_TOMADOR });
    assert.deepEqual(titularDoCertificado(pf.certPem), { tipo: 'cpf', numero: CPF_TOMADOR }, 'e-CPF: posiciones 9–19 del OID 2.16.76.1.3.1');
    assert.equal(otherNames(CERT.certPem).length, 2);
    assert.ok(certificadoCobreDocumento({ tipo: 'cnpj', numero: CNPJ }, '16727230000278'), 'el e-CNPJ de la matriz cubre a la filial (mismo CNPJ raíz)');
    assert.ok(!certificadoCobreDocumento({ tipo: 'cnpj', numero: CNPJ }, CNPJ_TOMADOR));
    assert.ok(!certificadoCobreDocumento({ tipo: 'cpf', numero: CPF_TOMADOR }, '52998224725'));
    const sinIcp = forge.pki.createCertificate();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const k = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs8', format: 'pem' }));
    sinIcp.publicKey = forge.pki.setRsaPublicKey(k.n, k.e);
    sinIcp.serialNumber = '01';
    sinIcp.validity.notBefore = new Date(Date.now() - 1000);
    sinIcp.validity.notAfter = new Date(Date.now() + 86_400_000);
    sinIcp.setSubject([{ name: 'commonName', value: 'x' }]);
    sinIcp.setIssuer([{ name: 'commonName', value: 'x' }]);
    sinIcp.sign(k, forge.md.sha256.create());
    rechaza(() => titularDoCertificado(forge.pki.certificateToPem(sinIcp)), /ICP-Brasil/, 'un certificado sin otherName ICP-Brasil se rechaza [E1209]');
}

// ── 5. Reglas del ANEXO_I aplicadas antes de enviar ──────────────────────────
const INSTANTE = new Date('2026-10-09T15:00:00Z');
const linea = (subtotal, extra = {}) => ({
    description: 'Consultoria em tecnologia', quantity: 1, unitPrice: subtotal + (extra.discount ?? 0), taxRate: 0,
    subtotal, taxAmount: 0, total: subtotal, ...extra,
});
const totales = (lineas, extra = {}) => {
    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    const discount = lineas.reduce((s, l) => s + (l.discount ?? 0), 0);
    return { subtotal, taxes: 0, total: subtotal, currency: 'BRL', ...(discount ? { discountTotal: discount } : {}), ...extra };
};
const entrada = (over = {}) => {
    const lineas = over.lineas ?? [linea(1500)];
    return {
        entorno: 'homologacion', documentoEmisor: '16.727.230/0001-97', municipio: '3550308', serie: '900',
        opSimpNac: 1, regEspTrib: 0, servico: '010101', instante: INSTANTE, competencia: '2026-10-01',
        receptor: { taxId: '111.444.777-35', nome: 'João da Silva', pais: 'BR', email: 'joao@example.com' },
        lineas, totales: totales(lineas),
        ...over,
    };
};

const CASOS = {};
{
    assert.equal(dataHoraBrasilia(new Date('2026-10-09T02:30:00Z')), '2026-10-08T23:30:00-03:00', 'dhEmi en hora de Brasilia, con desplazamiento explícito');
    const ID_SIMPLES = ['DPS', '3550308', '2', CNPJ, '00900', '000000000000001'].join('');
    assert.equal(ID_SIMPLES.length, 45);
    assert.equal(idDps('3550308', { tipo: 'CNPJ', numero: CNPJ }, '900', '1'), ID_SIMPLES, 'Id = DPS + cMun + 2 + CNPJ + serie(5) + nDPS(15)');
    assert.equal(idDps('3550308', { tipo: 'CPF', numero: '52998224725' }, '1', '42'), ['DPS', '3550308', '1', '00052998224725', '00001', '000000000000042'].join(''), 'CPF: tpInsc 1 y 000 a la izquierda');
    assert.equal(numeroDocumento('000000000000123', false), 'NFSE-123');
    assert.equal(numeroDocumento('7', true), 'H-NFSE-7');

    // Caso base: no optante, tomador con CPF, un concepto.
    const a = conNumero(armarDps(entrada()), 1);
    assert.equal(a.id, ID_SIMPLES);
    assert.deepEqual([a.tpAmb, a.dhEmi, a.serie, a.nDPS, a.dCompet, a.cLocEmi], [2, '2026-10-09T12:00:00-03:00', '900', '1', '2026-10-01', '3550308']);
    assert.deepEqual(a.prest, { tipo: 'CNPJ', numero: CNPJ, opSimpNac: 1, regEspTrib: 0 }, 'el prestador emisor no informa nombre ni dirección [E0121]');
    assert.deepEqual(a.toma, { tipo: 'CPF', numero: CPF_TOMADOR, nome: 'João da Silva', email: 'joao@example.com' });
    assert.deepEqual(a.serv, { cLocPrestacao: '3550308', cTribNac: '010101', xDescServ: 'Consultoria em tecnologia' });
    assert.deepEqual(a.valores, { vServ: '1500.00', tribISSQN: 1, tpRetISSQN: 1, totTrib: { indTotTrib: '0' } }, 'sin pAliq: la pone el municipio [E0617]');
    assert.deepEqual(a.esperado, { vLiq: '1500.00' });
    CASOS.simples = a;

    // Descuento de documento calculado por el MOTOR de Cord: desconto
    // incondicionado; vServ es el bruto y vServ - vDescIncond, el subtotal neto.
    const motor = calculateDocumentTotals([
        { descripcion: 'Consultoria', cantidad: 3, precio_unitario: 333.33, tax_rate: 0 },
        { descripcion: 'Suporte mensal', cantidad: 1, precio_unitario: 250, tax_rate: 0 },
    ], { roundLines: 2, descuento: { tipo: 'porcentaje', valor: 12.5 } });
    const lineasMotor = motor.lineas.map((l) => ({
        description: l.descripcion, quantity: l.cantidad, unitPrice: l.cantidad ? (l.base + l.descuento) / l.cantidad : l.base, taxRate: 0,
        subtotal: l.base, taxAmount: l.impuesto, total: l.total, ...(l.descuento > 0 ? { discount: l.descuento } : {}),
    }));
    const d = conNumero(armarDps(entrada({
        lineas: lineasMotor,
        totales: { subtotal: motor.subtotal, taxes: motor.impuestos, total: motor.total, currency: 'BRL', discountTotal: motor.descuentoTotal },
    })), 2);
    assert.ok(motor.descuentoTotal > 0);
    assert.equal(Number(d.valores.vServ) - Number(d.valores.vDescIncond), Number(motor.subtotal.toFixed(2)), 'vServ - vDescIncond = subtotal neto del motor');
    assert.equal(d.valores.vDescIncond, motor.descuentoTotal.toFixed(2), 'vDescIncond = descuento del documento');
    assert.equal(d.esperado.vLiq, motor.total.toFixed(2), 'valor líquido = total del documento');
    assert.match(d.serv.xDescServ, /^Consultoria \(3 x R\$ 333,33\); Suporte mensal \(1 x R\$ 250,00\)$/, 'la descripción enumera los conceptos');
    CASOS.descuento = d;

    // ME/EPP con todo por el Simples y el ISS retenido por el tomador (CNPJ):
    // pAliq = tasa de la retención [E0621] y pTotTribSN (indTotTrib vedado [E0712]).
    const motorRet = calculateDocumentTotals([{ descripcion: 'Desenvolvimento', cantidad: 1, precio_unitario: 2000, tax_rate: 0 }],
        { roundLines: 2, retenciones: [{ nombre: 'ISS retido 2%', tasa: 0.02 }] });
    const lineasRet = [linea(2000, { description: 'Desenvolvimento' })];
    const r = conNumero(armarDps(entrada({
        opSimpNac: 3, regApTribSN: 1, aliquotaSimples: 6, retencaoIss: { nome: 'ISS retido 2%', tasa: 0.02 },
        receptor: { taxId: '11.222.333/0001-81', nome: 'Cliente Ltda', pais: 'BR' },
        lineas: lineasRet,
        totales: { ...totales(lineasRet), total: motorRet.total, retenciones: motorRet.retenciones, retencionTotal: motorRet.retencionTotal },
        inscricaoMunicipal: '12345678', servicoMunicipal: '001',
    })), 3);
    assert.deepEqual(r.prest, { tipo: 'CNPJ', numero: CNPJ, im: '12345678', opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 });
    assert.deepEqual(r.valores, { vServ: '2000.00', tribISSQN: 1, tpRetISSQN: 2, pAliq: '2.00', totTrib: { pTotTribSN: '6.00' } });
    assert.deepEqual(r.esperado, { vLiq: '1960.00', issRetido: '40.00' });
    assert.equal(r.serv.cTribMun, '001');
    CASOS.retencao = r;

    // MEI, consumidor sin identificar, competencia = día de emisión.
    const m = conNumero(armarDps(entrada({ opSimpNac: 2, receptor: { taxId: '', nome: '', pais: 'BR' }, competencia: null })), 4);
    assert.equal(m.toma, undefined, 'sin CPF/CNPJ no se informa tomador');
    assert.equal(m.dCompet, '2026-10-09');
    assert.deepEqual(m.valores.totTrib, { indTotTrib: '0' });
    CASOS.mei = m;

    // Controles negativos: lo que la Sefin rechazaría (o Cord no declara) no se envía.
    rechaza(() => armarDps(entrada({ lineas: [{ ...linea(100), taxRate: 0.05, taxAmount: 5, total: 105 }], totales: { subtotal: 100, taxes: 5, total: 105, currency: 'BRL' } })), /incluido en el precio/, 'ISS por fuera');
    rechaza(() => armarDps(entrada({ totales: { ...totales([linea(1500)]), currency: 'USD' } })), /reales/, 'moneda extranjera');
    rechaza(() => armarDps(entrada({ receptor: { taxId: '123', nome: 'X', pais: 'US' } })), /exportación/, 'tomador del exterior');
    rechaza(() => armarDps(entrada({ receptor: { taxId: '111.444.777-36', nome: 'X', pais: 'BR' } })), /no es válido/, 'CPF con dígito verificador inválido');
    rechaza(() => armarDps(entrada({ receptor: { taxId: CNPJ, nome: 'X', pais: 'BR' } })), /mismo CNPJ/, 'autofactura');
    rechaza(() => armarDps(entrada({ servico: '070201' })), /donde se presta/, 'obra');
    rechaza(() => armarDps(entrada({ serie: String(SERIE_MAX + 1) })), /serie/, 'serie fuera del rango del aplicativo propio [E0010]');
    rechaza(() => armarDps(entrada({ municipio: '3550309' })), /IBGE/, 'municipio inexistente');
    rechaza(() => armarDps(entrada({ competencia: '2026-10-10' })), /posterior a la emisión/, 'competencia futura [E0015]');
    rechaza(() => armarDps(entrada({ opSimpNac: 3 })), /régimen de apuración/, 'ME/EPP sin régimen');
    rechaza(() => armarDps(entrada({ opSimpNac: 2, regEspTrib: 5 })), /MEI/, 'MEI con régimen especial [E0174]');
    rechaza(() => armarDps(entrada({ totales: { ...totales([linea(1500)]), total: 1490, retenciones: [{ nombre: 'IRRF 1,5%', tipo: 'ret_iva', tasa: 0.015, base: 1500, monto: 22.5 }], retencionTotal: 22.5 } })), /retenciones federales/, 'retención federal');
    rechaza(() => armarDps(entrada({ opSimpNac: 2, retencaoIss: { nome: 'ISS 5%', tasa: 0.05 }, totales: { ...totales([linea(1500)]), total: 1425, retenciones: [{ nombre: 'ISS 5%', tipo: 'ret_iva', tasa: 0.05, base: 1500, monto: 75 }], retencionTotal: 75 } })), /MEI/, 'retención a un MEI [E0583]');
    rechaza(() => armarDps(entrada({ lineas: [linea(100, { discount: 100 })], totales: { subtotal: 90, taxes: 0, total: 90, currency: 'BRL', discountTotal: 100 } })), /cuadran/, 'subtotal que no cuadra');
    rechaza(() => armarDps(entrada({ lineas: [linea(0, { discount: 100 })], totales: { subtotal: 0, taxes: 0, total: 0, currency: 'BRL', discountTotal: 100 } })), /descuento no puede cubrir/, 'descuento del 100 % [E0431]');
    rechaza(() => armarDps(entrada({ totales: { ...totales([linea(1500)]), discountTotal: 10 } })), /descuento del documento/, 'descuento declarado distinto');
    rechaza(() => conNumero(CASOS.simples, 0), /fuera de rango/);

    // Ajustes: lo que se guarda pasa por las mismas reglas.
    assert.deepEqual(faltantesAjustes({}), ['municipio', 'serie', 'regime', 'servico']);
    assert.deepEqual(faltantesAjustes({ municipio: '3550308', serie: '1', opSimpNac: 3, servico: '010101' }), ['regime_sn', 'aliquota_simples']);
    const ok = aplicarCambio({}, { municipio: '3550308', serie: '00900', op_simples: 1, servico: '01.01.01', reg_especial: 0 });
    assert.ok(ok.ok && ok.ajustes.serie === '900' && ok.ajustes.servico === '010101');
    assert.ok(!aplicarCambio({}, { servico: '070201' }).ok, 'servicio no soportado');
    assert.ok(!aplicarCambio({}, { serie: '50000' }).ok, 'serie del emisor móvil');
    assert.ok(!aplicarCambio({ opSimpNac: 2 }, { reg_especial: 5 }).ok, 'MEI con régimen especial');
    assert.equal(descricaoServico([linea(10, { description: '  a\r\nb  ' })]), 'a b');
    assert.equal(descricaoServico(Array.from({ length: 200 }, () => linea(1, { description: 'x'.repeat(30) }))).length, 2000, 'xDescServ: hasta 2000');
}

// ── Documentos firmados ──────────────────────────────────────────────────────
const DPS = Object.fromEntries(Object.entries(CASOS).map(([k, s]) => [k, dpsAssinada(s, CERT.certPem, CERT.keyPem)]));
const MUNICIPIO = certificado({ cnpj: '46395000000139' });
const NFSE = nfseSimulada(DPS.retencao, { nNFSe: 42, aliquota: 2, certPem: MUNICIPIO.certPem, keyPem: MUNICIPIO.keyPem });
const CHAVE_PRUEBA = NFSE.chave;
const PEDIDO = pedidoCancelamento({ entorno: 'homologacion', autor: { tipo: 'CNPJ', numero: CNPJ }, chave: CHAVE_PRUEBA, instante: INSTANTE, motivo: 'Serviço faturado em duplicidade por engano' });
const CANCELAMENTO = pedidoCancelamentoAssinado(PEDIDO, CERT.certPem, CERT.keyPem);
{
    assert.equal(PEDIDO.id, `PRE${CHAVE_PRUEBA}101101`, 'Id = PRE + chave + código del evento [E1827]');
    assert.equal(motivoCancelamento('corto'), 'Cancelamento solicitado pelo prestador do serviço.', 'xMotivo: mínimo 15 caracteres');
    assert.ok(xmlDps(CASOS.simples).startsWith(`<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS_NFSE}" versao="1.01"><infDPS Id="`));
    assert.ok(!/<[a-zA-Z]+:/.test(DPS.simples), 'sin prefijos de namespace [E1228]');
    for (const xml of Object.values(DPS)) {
        assert.ok(xml.includes(`<SignatureMethod Algorithm="${DSIG.rsaSha1}"></SignatureMethod>`) && xml.includes(`<DigestMethod Algorithm="${DSIG.sha1}"></DigestMethod>`));
        assert.ok(xml.endsWith('</Signature></DPS>'), 'la firma es el último hijo de la raíz');
    }
}

// ── 3. Esquema: xmllint contra los XSD oficiales ─────────────────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    // Invariantes de los esquemas que Cord asume, leídos del XSD (sin xmllint).
    for (const amb of ['producao', 'producao-restrita']) {
        const tc = leer(`${amb}/tiposComplexos_v1.01.xsd`);
        assert.match(tc, /<xs:element name="IBSCBS" type="TCRTCInfoIBSCBS" minOccurs="0">/, `${amb}: el grupo IBSCBS de la DPS sigue siendo facultativo`);
    }
    assert.equal(IBSCBS_FACULTATIVO, true);
    // Defecto conocido del XSD de PRODUCCIÓN 20260209: TSSerieDPS usa ^ y $, que
    // en una expresión XSD son caracteres literales (xmllint rechaza toda serie).
    // El de producción restringida 20260727 lo corrigió. Si el oficial cambia,
    // este assert avisa para quitar el parche de abajo.
    const PATRON_SERIE_PROD = '<xs:pattern value="^0{0,4}\\d{1,5}$"/>';
    assert.ok(leer('producao/tiposSimples_v1.01.xsd').includes(PATRON_SERIE_PROD), 'el patrón de TSSerieDPS de producción cambió: revisa el parche');

    if (!xmllint) {
        if (process.env.NFSE_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y NFSE_XSD_REQUIRED=1');
        process.stdout.write('security:nfse: AVISO — xmllint no está instalado; se omite la validación contra los esquemas oficiales.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'nfse-check-'));
        try {
            const juego = (nombre, origen, transformar) => {
                const destino = join(dir, nombre);
                cpSync(join(FIX, origen), destino, { recursive: true });
                if (transformar) transformar(destino);
                return destino;
            };
            const prodRestrita = juego('prodrest', 'producao-restrita');
            const prod = juego('prod', 'producao', (d) => {
                const p = join(d, 'tiposSimples_v1.01.xsd');
                writeFileSync(p, readFileSync(p, 'utf8').replace(PATRON_SERIE_PROD, '<xs:pattern value="0{0,4}\\d{1,5}"/>'));
            });
            // El mismo esquema de producción con el xmldsig RESTRINGIDO 1.00: fija
            // C14N, RSA-SHA1, SHA-1, las dos transformaciones y X509Certificate.
            const prodFirma = juego('prodfirma', 'producao', (d) => {
                const p = join(d, 'tiposSimples_v1.01.xsd');
                writeFileSync(p, readFileSync(p, 'utf8').replace(PATRON_SERIE_PROD, '<xs:pattern value="0{0,4}\\d{1,5}"/>'));
                cpSync(join(d, 'xmldsig-core-schema-v1.00-restrito.xsd'), join(d, 'xmldsig-core-schema.xsd'));
            });
            const validar = (nombre, xml, xsd) => {
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, xml);
                try {
                    execFileSync('xmllint', ['--noout', '--nonet', '--schema', xsd, file], { stdio: 'pipe' });
                    return null;
                } catch (e) {
                    return String(e.stderr || e.message);
                }
            };
            const contra = (nombre, xml, raiz) => {
                for (const [etiqueta, base] of [['producción restringida', prodRestrita], ['producción', prod], ['xmldsig restringido 1.00', prodFirma]]) {
                    const error = validar(`${nombre}-${etiqueta.replace(/\W+/g, '_')}`, xml, join(base, raiz));
                    assert.equal(error, null, `${nombre} no cumple el esquema de ${etiqueta}:\n${error}`);
                }
            };
            for (const [nombre, xml] of Object.entries(DPS)) contra(`dps-${nombre}`, xml, 'DPS_v1.01.xsd');
            contra('pedRegEvento-cancelamento', CANCELAMENTO, 'pedRegEvento_v1.01.xsd');
            contra('nfse-simulada', NFSE.xml, 'NFSe_v1.01.xsd');

            // Controles negativos: prueban que xmllint valida de verdad.
            const xsdDps = join(prodRestrita, 'DPS_v1.01.xsd');
            const desordenado = DPS.simples.replace(/(<serie>[^<]*<\/serie>)(<nDPS>[^<]*<\/nDPS>)/, '$2$1');
            assert.notEqual(validar('neg-orden', desordenado, xsdDps), null, 'nDPS antes de serie debe romper el esquema');
            assert.notEqual(validar('neg-falta', DPS.simples.replace(/<cLocEmi>\d+<\/cLocEmi>/, ''), xsdDps), null, 'sin cLocEmi debe romper el esquema');
            assert.notEqual(validar('neg-valor', DPS.simples.replace('<vServ>1500.00</vServ>', '<vServ>1500.5</vServ>'), xsdDps), null, 'un valor sin dos decimales debe romper el esquema (TSDec15V2)');
            assert.notEqual(validar('neg-dh', DPS.simples.replace(/-03:00<\/dhEmi>/, 'Z</dhEmi>'), xsdDps), null, 'dhEmi en Z debe romper el esquema (TSDateTimeUTC)');
            assert.notEqual(validar('neg-sha256', DPS.simples.replace(DSIG.rsaSha1, 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'), join(prodFirma, 'DPS_v1.01.xsd')), null, 'otro algoritmo debe romper el xmldsig restringido');
            assert.notEqual(validar('neg-prod-sin-parche', DPS.simples, join(FIX, 'producao', 'DPS_v1.01.xsd')), null, 'el XSD de producción sin parchear rechaza toda serie (por eso el parche)');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 4. Firma: canonicalizador independiente + openssl ────────────────────────
{
    let herramientas = true;
    try {
        execFileSync('python3', ['-I', '-c', 'import lxml.etree'], { stdio: 'ignore' });
        execFileSync('openssl', ['version'], { stdio: 'ignore' });
    } catch { herramientas = false; }
    if (!herramientas) {
        if (process.env.NFSE_FIRMA_REQUIRED === '1') throw new Error('python3 con lxml u openssl no están disponibles y NFSE_FIRMA_REQUIRED=1');
        process.stdout.write('security:nfse: AVISO — falta python3 con lxml u openssl; se omite la verificación independiente de la firma.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'nfse-firma-'));
        try {
            // lxml: C14N 1.0 (sin comentarios) del elemento firmado y de SignedInfo.
            // El C14N inclusivo de un SUBÁRBOL en lxml/libxml2 emite xmlns=""
            // espurios en los nietos; por eso se calcula de dos formas que sí son
            // correctas y deben coincidir: el elemento copiado como raíz de un
            // documento propio (C14N inclusivo del documento) y el C14N
            // exclusivo del subárbol. En estos documentos (un solo namespace por
            // defecto, usado por todos los elementos) inclusivo y exclusivo dan
            // los mismos bytes, que son los que firma Cord.
            const py = join(dir, 'c14n.py');
            writeFileSync(py, [
                'import sys, base64, copy',
                'from lxml import etree',
                'doc = etree.parse(sys.argv[1], etree.XMLParser(resolve_entities=False, no_network=True))',
                'ns = {"ds": "http://www.w3.org/2000/09/xmldsig#"}',
                'def c14n(el):',
                '    raiz = etree.tostring(etree.ElementTree(copy.deepcopy(el)), method="c14n", with_comments=False)',
                '    exclusivo = etree.tostring(el, method="c14n", exclusive=True, with_comments=False)',
                '    assert raiz == exclusivo, "lxml: las dos formas canónicas difieren"',
                '    return base64.b64encode(raiz).decode()',
                'alvo = doc.xpath("//*[@Id=$id]", id=sys.argv[2])[0]',
                'si = doc.xpath("/*/ds:Signature/ds:SignedInfo", namespaces=ns)[0]',
                'print(c14n(alvo))',
                'print(c14n(si))',
            ].join('\n'));
            const verificar = (nombre, xml, tag, id, certPem) => {
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, xml);
                const [alvoB64, siB64] = execFileSync('python3', ['-I', py, file, id]).toString().trim().split('\n');
                const alvo = Buffer.from(alvoB64, 'base64').toString('utf8');
                assert.equal(alvo, canonicoDoElemento(xml, tag, id, NS_NFSE), `${nombre}: la forma canónica de Cord difiere de la de lxml`);
                // La firma de la RAÍZ es la última (la NFS-e encapsula la de la DPS).
                const firma = xml.slice(xml.lastIndexOf('<Signature xmlns='));
                const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(firma)[1];
                const sha1 = execFileSync('openssl', ['dgst', '-sha1', '-binary'], { input: Buffer.from(alvoB64, 'base64') }).toString('base64');
                assert.equal(sha1, digest, `${nombre}: DigestValue = SHA-1 de la forma canónica`);
                writeFileSync(join(dir, `${nombre}.si`), Buffer.from(siB64, 'base64'));
                writeFileSync(join(dir, `${nombre}.sig`), Buffer.from(/<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firma)[1], 'base64'));
                writeFileSync(join(dir, `${nombre}.pub`), forge.pki.publicKeyToPem(forge.pki.certificateFromPem(certPem).publicKey));
                const salida = execFileSync('openssl', ['dgst', '-sha1', '-verify', join(dir, `${nombre}.pub`), '-signature', join(dir, `${nombre}.sig`), join(dir, `${nombre}.si`)]).toString();
                assert.match(salida, /Verified OK/, `${nombre}: la firma no verifica con openssl`);
                const cert = /<X509Certificate>([^<]+)<\/X509Certificate>/.exec(firma)[1];
                assert.equal(cert, certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ''), `${nombre}: X509Certificate es el certificado del firmante`);
            };
            for (const [nombre, xml] of Object.entries(DPS)) verificar(`dps-${nombre}`, xml, 'infDPS', CASOS[nombre].id, CERT.certPem);
            verificar('cancelamento', CANCELAMENTO, 'infPedReg', PEDIDO.id, CERT.certPem);
            verificar('nfse', NFSE.xml, 'infNFSe', `NFS${NFSE.chave}`, MUNICIPIO.certPem);
            // Control negativo: un byte cambiado en lo firmado ya no verifica.
            const alterado = DPS.simples.replace('<vServ>1500.00</vServ>', '<vServ>1500.01</vServ>');
            assert.throws(() => verificar('alterado', alterado, 'infDPS', CASOS.simples.id, CERT.certPem), /DigestValue/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 5b. Lectura de la NFS-e, representación impresa y mensajes ───────────────
{
    const n = lerNfse(NFSE.xml);
    assert.ok(n && chaveValida(n.chave), 'chave de 50 posiciones');
    assert.equal(n.nNFSe, '42');
    assert.equal(n.dps.id, CASOS.retencao.id);
    assert.deepEqual(n.valores, { vBC: '2000.00', pAliqAplic: '2.00', vISSQN: '40.00', vTotalRet: '40.00', vLiq: '1960.00' });
    assert.equal(n.emit.documento, CNPJ);
    assert.ok(nfseCorresponde(n, CASOS.retencao), 'la NFS-e encapsula la DPS enviada');
    assert.ok(!nfseCorresponde(n, CASOS.simples), 'otra DPS no corresponde');
    assert.equal(diferencaValorLiquido(n, CASOS.retencao), null, 'el valor líquido cuadra con el total de Cord');
    const otraAliquota = lerNfse(nfseSimulada(DPS.simples, { nNFSe: 43, aliquota: 5, certPem: MUNICIPIO.certPem, keyPem: MUNICIPIO.keyPem }).xml);
    assert.equal(diferencaValorLiquido(otraAliquota, CASOS.simples), null, 'sin retención el líquido es el valor del servicio');
    assert.equal(lerNfse('<NFSe><infNFSe Id="x"></infNFSe></NFSe>'), null);

    const rep = representacionNfse({ nfse: n, solicitud: CASOS.retencao, homologacion: true });
    assert.equal(rep.qrUrl, `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${n.chave}`, 'QR de la consulta pública [NT 008 §2.4.3]');
    assert.equal(urlConsultaPublica(n.chave), URL_CONSULTA_PUBLICA + n.chave);
    assert.equal(rep.qrLeyenda, LEYENDA_QR);
    assert.equal(LEYENDA_QR, 'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e');
    assert.ok(rep.leyendas[0].startsWith(LEYENDA_SEM_VALIDADE) && rep.pie.startsWith(LEYENDA_SEM_VALIDADE) && rep.prueba, 'homologación: "NFS-e SEM VALIDADE JURÍDICA"');
    assert.ok(rep.leyendas.some((l) => l.replace(/\s/g, '').includes(n.chave)), 'la chave completa va impresa');
    assert.ok(rep.filas.some((f) => f.k === 'Retenção do ISSQN' && f.v === 'Retido pelo tomador'));
    const prod = representacionNfse({ nfse: n, solicitud: CASOS.retencao, homologacion: false });
    assert.ok(!prod.prueba && !prod.leyendas.some((l) => l.includes(LEYENDA_SEM_VALIDADE)) && /Sistema Nacional NFS-e/.test(prod.pie));

    assert.equal(normalizarCodigo('14'), 'E0014');
    assert.match(mensajeRechazo([{ codigo: 'E9999' }, { codigo: 'E0116' }]), /inscripción municipal/, 'el primer código conocido');
    assert.match(mensajeRechazo([{ codigo: 'E9999' }]), /E9999/, 'un código desconocido se muestra con su número');
    assert.ok(!/RESEND|FACTURAPI|ENABLED|ENTORNO/.test(mensajeRechazo([{ codigo: 'E1200' }])), 'regla 14');
}

process.stdout.write(`security:nfse: OK (${Object.keys(DPS).length} DPS, cancelación y NFS-e simulada contra producción y producción restringida; ${readdirSync(join(FIX, 'producao')).length + readdirSync(join(FIX, 'producao-restrita')).length} esquemas vendorizados)\n`);
