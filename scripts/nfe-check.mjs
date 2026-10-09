// Contrato de la NF-e modelo 55 (Brasil) — corre en `npm run test:payments`
// (security:nfe). Sin red: todo contra fuentes oficiales vendorizadas en
// scripts/fixtures/nfe/ (fuentes.json trae la URL y el SHA-256 de cada
// original, descargados del Portal Nacional de la NF-e el 2026-10-09).
//
// Capas, de la más dura a la más blanda:
//   1. Fuentes y tablas: las URL de cada autorizador y qué UF usa SVAN, SVRS,
//      SVC-AN y SVC-RS salen de la "Relação de Serviços Web" (producción y
//      homologación); namespace y soapAction de los WSDL; los cStat que Cord
//      interpreta, la clasificación del IBS/CBS (cClassTrib y CST), el CFOP,
//      el medio de pago, las condiciones de uso de la CC-e, las UF que no
//      admiten contribuyente exento de IE y las que exigen responsable técnico,
//      y las raíces de la ICP-Brasil con su huella.
//   2. Vectores oficiales: DV de la chave (MOC 2.2.6.2), hashCSRT (NT 2018.005
//      §2.4), CODE-128 (Anexo II §2.2: la secuencia de anchos impresa en el
//      manual; NTC 2025.001 §6: el DV del modelo híbrido) y la lista de cNF
//      prohibidos (Anexo I B03-10).
//   3. Esquema: cada NF-e que Cord sabe armar (Régimen Normal con IPI, FCP y
//      descuento; Simples entre estados; contingencia SVC con responsable
//      técnico y CSRT), el lote, las consultas, los eventos, la inutilização,
//      los retornos de la SEFAZ simulada y los "proc" que Cord archiva se
//      validan con xmllint contra los XSD oficiales (PL_010f, PL_010d, 9q y
//      los de cada evento). Controles negativos prueban que xmllint valida de
//      verdad. Sin xmllint se avisa y se omite (NFE_XSD_REQUIRED=1 la vuelve
//      obligatoria).
//   4. Firma: la forma canónica de infNFe, infEvento e infInut se recalcula con
//      un canonicalizador independiente (lxml, C14N 1.0), también DENTRO del
//      lote y del sobre SOAP, y la firma se verifica con openssl. Sin python3 +
//      lxml u openssl se avisa y se omite (NFE_FIRMA_REQUIRED=1).
//   5. Reglas que Cord aplica antes de numerar (con controles negativos), el
//      cuadre al centavo, el DANFE y los mensajes de error.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import forge from 'node-forge';
import {
    AUTORIZADOR_UF, CCE_COND_USO, CCLASSTRIB_SOPORTADAS, CFOP_INTERESTADUAL, CFOP_INTERNO, IBSCBS_2026, NS_NFE, SERVICOS,
    TPAG_OUTROS, TPAG_POSTERIOR, UFS, UF_EXIGE_RESP_TEC, UF_SEM_ISENTO_IE, URL_SERVICO, autorizadorContingencia,
} from '../src/lib/fiscal/latam/nfe/constantes.ts';
import { CNF_PROHIBIDOS, chaveValida, dvChave, gerarCnf, montarChave, partesDaChave } from '../src/lib/fiscal/latam/nfe/chave.ts';
import { PATRONES, code128, digitoVerificador } from '../src/lib/fiscal/latam/nfe/code128.ts';
import { armarNfe, comXmlAssinado, conNumero, hashCsrt, textoNfe, aplicar } from '../src/lib/fiscal/latam/nfe/nfe.ts';
import {
    consReciNFe, consSitNFe, consStatServ, envEvento, enviNFe, eventoAssinado, inutilizacaoAssinada, lerRetConsSit, lerRetEnvEvento, lerRetInut,
    lerRetornoLote, nfeProc, pedidoCancelamento, pedidoCce, pedidoInutilizacao, procEvento, procInut,
} from '../src/lib/fiscal/latam/nfe/mensagens.ts';
import { aplicarCambio, faltantesAjustes } from '../src/lib/fiscal/latam/nfe/ajustes.ts';
import { clienteNfeDe, gtinValido, produtoNfeDe } from '../src/lib/fiscal/latam/nfe/produto.ts';
import { AUTORIZADO, CERTIFICADO, CODIGOS_CON_MENSAJE, DENEGADO, DUPLICIDADE_OUTRA, mensajeCstat } from '../src/lib/fiscal/latam/nfe/erros.ts';
import { RAICES_ICP_BRASIL } from '../src/lib/fiscal/latam/nfe/icp-raizes.ts';
import { sobre } from '../src/lib/fiscal/latam/nfe/soap.ts';
import { canonicoDoElemento } from '../src/lib/fiscal/latam/nfse/xml.ts';
import { RailDatosError, RailNoDisponibleError } from '../src/lib/fiscal/latam/errores.ts';
import { createDanfePdf, danfeDe } from '../src/lib/fiscal/latam/nfe/danfe.ts';
import { sefazSimulada } from './lib/nfe-simulada.mjs';

const FIX = fileURLToPath(new URL('./fixtures/nfe/', import.meta.url));
const leer = (f) => readFileSync(join(FIX, f), 'utf8');
const tsv = (f) => leer(f).trim().split('\n').map((l) => l.split('\t'));
const rechaza = (fn, re, msg, Clase = RailDatosError) => assert.throws(fn, (e) => e instanceof Clase && re.test(e.message), msg);

// ── 0. Fuentes ───────────────────────────────────────────────────────────────
const FUENTES = JSON.parse(leer('fuentes.json'));
for (const f of FUENTES) {
    assert.ok(f.titulo && /^https?:\/\//.test(f.url), `fuente sin título o URL: ${JSON.stringify(f)}`);
    assert.match(f.sha256, /^[0-9a-f]{64}$/, `${f.titulo}: SHA-256 inválido`);
    for (const e of String(f.extracto).split(', ')) {
        const ruta = e.replace(/ \(.*\)$/, '');
        assert.ok(existsSync(join(FIX, ruta)), `${f.titulo}: falta el extracto ${ruta}`);
    }
}

// ── 1. Tablas oficiales ──────────────────────────────────────────────────────
{
    // 1a. Relação de Serviços Web: URL por autorizador y servicio, en los dos ambientes.
    const portal = (archivo) => {
        const html = leer(archivo);
        const tablas = {};
        for (const m of html.matchAll(/<caption>[^<]*\((\w+(?:-\w+)?)\)\s*<\/caption>([\s\S]*?)<\/table>/g)) {
            const filas = {};
            for (const r of m[2].matchAll(/<td class="altura21">([^<]+)<\/td><td class="altura21">([^<]+)<\/td><td class="altura21">([^<]+)<\/td>/g)) {
                filas[r[1].trim()] = { versao: r[2].trim(), url: r[3].trim().replace(/\?wsdl$/i, '') };
            }
            tablas[m[1]] = filas;
        }
        const span = (id) => (new RegExp(`id="ctl00_ContentPlaceHolder1_${id}">([^<]*)<`).exec(html)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean).sort();
        return { tablas, svan: span('lblUsuariosSVAN'), svrs: span('lblUsuarioSVRS_DemServ'), svcAn: span('lblUsuariosSVCAN'), svcRs: span('lblUsuariosSVCRS') };
    };
    for (const [entorno, archivo] of [['produccion', 'portal/servicos-web-producao.html'], ['homologacion', 'portal/servicos-web-homologacao.html']]) {
        const p = portal(archivo);
        const nuestros = URL_SERVICO[entorno];
        for (const [aut, servicios] of Object.entries(nuestros)) {
            assert.ok(p.tablas[aut], `${entorno}: el Portal no publica el autorizador ${aut}`);
            for (const [serv, url] of Object.entries(servicios)) {
                assert.equal(url, p.tablas[aut][serv]?.url, `${entorno} ${aut} ${serv}: la URL difiere de la del Portal`);
                assert.equal(p.tablas[aut][serv].versao, '4.00', `${entorno} ${aut} ${serv}: versión`);
            }
            for (const serv of Object.keys(SERVICOS)) {
                if (p.tablas[aut][serv]) assert.ok(servicios[serv], `${entorno} ${aut}: el Portal publica ${serv} y Cord no lo tiene`);
            }
        }
        for (const aut of Object.keys(p.tablas).filter((a) => a !== 'AN')) assert.ok(nuestros[aut], `${entorno}: falta el autorizador ${aut}`);
        // Qué UF usa cada autorizador virtual (igual en los dos ambientes para la autorización).
        assert.deepEqual(UFS.filter((u) => AUTORIZADOR_UF[u] === 'SVAN').sort(), p.svan, `${entorno}: UF de la SVAN`);
        assert.deepEqual(UFS.filter((u) => AUTORIZADOR_UF[u] === 'SVRS').sort(), p.svrs, `${entorno}: UF de la SVRS`);
        for (const u of UFS.filter((x) => !['SVAN', 'SVRS'].includes(AUTORIZADOR_UF[x]))) assert.equal(AUTORIZADOR_UF[u], u, `${u} tiene SEFAZ propia`);
        assert.deepEqual(UFS.filter((u) => autorizadorContingencia(u, entorno) === 'SVC-AN').sort(), p.svcAn, `${entorno}: UF de la SVC-AN`);
        assert.deepEqual(UFS.filter((u) => autorizadorContingencia(u, entorno) === 'SVC-RS').sort(), p.svcRs, `${entorno}: UF de la SVC-RS`);
    }

    // 1b. WSDL 4.00: namespace, operación y soapAction; SOAP 1.2 y sin cabecera.
    for (const [serv, def] of Object.entries(SERVICOS)) {
        const wsdl = leer(`wsdl/prod-MT-${serv}.wsdl`);
        assert.ok(wsdl.includes(`targetNamespace="${def.ns}"`), `${serv}: namespace del WSDL`);
        assert.ok(wsdl.includes(`soapAction="${def.acao}"`), `${serv}: soapAction del WSDL`);
        assert.match(wsdl, /soap12:binding/, `${serv}: binding SOAP 1.2`);
        assert.ok(!wsdl.includes('nfeCabecMsg'), `${serv}: los WSDL 4.00 no declaran cabecera`);
    }

    // 1c. cStat que Cord interpreta.
    const cstat = Object.fromEntries(tsv('tabelas/cstat.tsv').map((r) => [r[0], r[1]]));
    const espera = { 100: /^Autorizado o uso da NF-e$/, 150: /fora de prazo/, 110: /^Uso Denegado$/, 301: /emitente/, 302: /destinatário/, 303: /não habilitado/,
        204: /Duplicidade de NF-e/, 539: /diferença na Chave de Acesso/, 562: /Código Numérico/, 217: /não consta/, 102: /Inutilização de número homologado/,
        107: /Serviço em Operação/, 108: /Paralisado Momentaneamente/, 109: /Paralisado sem Previsão/, 103: /Lote recebido/, 104: /Lote processado/,
        105: /Lote em processamento/, 135: /Evento registrado e vinculado/, 573: /Duplicidade de Evento/, 452: /resposta assíncrona/, 501: /Prazo de cancelamento/ };
    for (const [c, re] of Object.entries(espera)) assert.match(cstat[c] ?? '', re, `cStat ${c}`);
    for (const c of CODIGOS_CON_MENSAJE) assert.ok(cstat[c], `cStat ${c} con mensaje propio pero ausente de la tabla oficial`);
    for (const c of CERTIFICADO) assert.match(cstat[c], /Certificado|Assinatura|CNPJ-Base/, `cStat ${c} no es de certificado`);
    for (const c of DENEGADO) assert.match(cstat[c], /Denegado/, `cStat ${c} no es una denegación`);
    for (const c of AUTORIZADO) assert.match(cstat[c], /^Autorizado/, `cStat ${c}`);
    for (const c of DUPLICIDADE_OUTRA) assert.ok(cstat[c], `cStat ${c}`);

    // 1d. IBS/CBS: la clasificación que Cord declara es tributación integral, sin grupos especiales.
    const [cab, ...clases] = tsv('tabelas/cclasstrib.tsv');
    const col = (n) => cab.indexOf(n);
    for (const s of CCLASSTRIB_SOPORTADAS) {
        const fila = clases.find((r) => r[col('cClassTrib')] === s.id);
        assert.ok(fila, `cClassTrib ${s.id} no existe`);
        assert.equal(fila[col('CST-IBS/CBS')], s.cst);
        assert.equal(fila[col('Tipo de Alíquota')], 'Padrão');
        for (const k of ['pRedIBS', 'pRedCBS', 'ind_gTribRegular', 'ind_gCredPresOper', 'ind_gMonoPadrao', 'ind_gMonoReten', 'ind_gMonoRet', 'ind_gpBioDiferenca', 'ind_gEstornoCred']) {
            assert.equal(fila[col(k)], '0', `cClassTrib ${s.id}: ${k}`);
        }
        assert.equal(fila[col('indNFe')], '1', `cClassTrib ${s.id} habilitado para la NF-e`);
        assert.equal(fila[col('dFimVig')], '', `cClassTrib ${s.id} vigente`);
    }
    const [cabCst, ...csts] = tsv('tabelas/cst-ibscbs.tsv');
    const cst000 = csts.find((r) => r[0] === '000');
    assert.equal(cst000[cabCst.indexOf('ind_gIBSCBS')], '1', 'CST 000 exige gIBSCBS');
    for (const k of ['ind_gIBSCBSMono', 'ind_gRed', 'ind_gDif', 'ind_gTransfCred']) assert.equal(cst000[cabCst.indexOf(k)], '0', `CST 000: ${k}`);
    assert.match(leer('normas/nt2025002-rtc-ibs-cbs.txt'), /0,1% para documento com data de emissão no ano de 2025 e 2026/);
    assert.match(leer('normas/nt2026010-danfe-rtc.txt'), /0,1% para o IBS estadual e 0,9% para a CBS/);
    assert.deepEqual(IBSCBS_2026, { pIBSUF: '0.1000', pIBSMun: '0.0000', pCBS: '0.9000' });

    // 1e. CFOP de venta.
    const [cabCfop, ...cfops] = tsv('tabelas/cfop.tsv');
    const cfop = (c) => cfops.find((r) => r[0] === c);
    for (const c of [...CFOP_INTERNO, ...Object.values(CFOP_INTERESTADUAL)]) {
        const r = cfop(c);
        assert.ok(r, `CFOP ${c}`);
        assert.equal(r[cabCfop.indexOf('Fim de vigência')], '', `CFOP ${c} vigente`);
        assert.equal(r[cabCfop.indexOf('indNFe')], '1', `CFOP ${c} admitido en la NF-e`);
        for (const k of ['indDevol', 'indRetor', 'indComb', 'indRemes']) assert.equal(r[cabCfop.indexOf(k)], '0', `CFOP ${c}: ${k}`);
        assert.match(r[cabCfop.indexOf('Título do CFOP')], /^Venda de/, `CFOP ${c} es una venta`);
    }
    for (const [i, e] of Object.entries(CFOP_INTERESTADUAL)) assert.equal(e, `6${i.slice(1)}`, 'el par interestatal es el mismo CFOP con 6');

    // 1f. Medio de pago.
    const meios = Object.fromEntries(tsv('tabelas/meios-pagamento.tsv').map((r) => [r[0], r]));
    assert.equal(meios[TPAG_POSTERIOR][1], 'Pagamento Posterior');
    assert.equal(meios[TPAG_OUTROS][1], 'Outros');

    // 1g. CC-e: condiciones de uso literales del esquema.
    const enumeraciones = [...leer('xsd/Evento_CCe_PL_v1.01/e110110_v1.00.xsd').matchAll(/<xs:enumeration value="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(enumeraciones.includes(CCE_COND_USO), 'xCondUso no es una de las enumeraciones del e110110');

    // 1h. UF sin "contribuyente exento" (NT 2025.001 E16a-30) y con responsable técnico obligatorio (NT 2018.005 ZD01-10).
    // La lista cruza una columna de la tabla ("Inscrição Estadual"): se toman las siglas.
    const e16 = [.../conforme segue: ([\s\S]*?SP)\./.exec(leer('normas/nt2025001-sincrono-pagamento-ie.txt'))[1].matchAll(/\b[A-Z]{2}\b/g)].map((m) => m[0]).sort();
    assert.deepEqual([...UF_SEM_ISENTO_IE].sort(), e16, 'UF_SEM_ISENTO_IE');
    assert.match(leer('normas/nt2018005-responsavel-tecnico-csrt.txt'), new RegExp(`exceto as UF ${UF_EXIGE_RESP_TEC.slice(0, -1).join(', ')} e ${UF_EXIGE_RESP_TEC.at(-1)}`));

    // 1i. Raíces ICP-Brasil: los PEM embebidos son exactamente los certificados del ITI.
    for (const r of RAICES_ICP_BRASIL) {
        const x = new X509Certificate(r.pem);
        const archivo = readFileSync(join(FIX, `icp/icp-raiz-${r.version}.crt`));
        const vendorizado = new X509Certificate(archivo);
        assert.equal(createHash('sha256').update(x.raw).digest('hex'), r.sha256Der, `ICP ${r.version}: huella del PEM`);
        assert.equal(createHash('sha256').update(vendorizado.raw).digest('hex'), r.sha256Der, `ICP ${r.version}: el archivo vendorizado es el mismo certificado`);
        const sha = createHash('sha256').update(archivo).digest('hex');
        assert.ok(FUENTES.some((f) => f.sha256 === sha && f.extracto === `icp/icp-raiz-${r.version}.crt`), `ICP ${r.version}: el archivo vendorizado no es el de fuentes.json`);
        assert.ok(x.ca && x.verify(x.publicKey), `ICP ${r.version}: raíz autofirmada`);
        assert.match(x.subject, /O=ICP-Brasil/);
        assert.match(x.subject, new RegExp(`CN=Autoridade Certificadora Raiz Brasileira ${r.version}`));
    }
}

// ── 2. Vectores oficiales ────────────────────────────────────────────────────
{
    const moc = leer('normas/moc70-chave-de-acesso.txt');
    const digitos = /A\. CHAVE DE ACESSO\s+([\d ]+)\n/.exec(moc)[1].replace(/\s/g, '');
    assert.equal(digitos.length, 43);
    assert.match(moc, /DV da chave de acesso da NF-e é igual a "5"/);
    assert.equal(dvChave(digitos), '5', 'DV del ejemplo del MOC 2.2.6.2');
    assert.ok(chaveValida(`${digitos}5`));
    assert.ok(!chaveValida(`${digitos}4`), 'DV equivocado');
    // NTC 2025.001: las letras valen su ASCII − 48 (A = 17).
    const alfa = montarChave({ cUF: '35', aamm: '2610', cnpj: '12ABC34501DE35', serie: 1, numero: 77, tpEmis: '1', cNF: '12345670' });
    assert.ok(chaveValida(alfa));
    assert.deepEqual(partesDaChave(alfa), { cUF: '35', aamm: '2610', cnpj: '12ABC34501DE35', serie: 1, numero: 77, tpEmis: '1', cNF: '12345670', dv: alfa[43] });

    // hashCSRT [NT 2018.005 §2.4].
    const nt = leer('normas/nt2018005-responsavel-tecnico-csrt.txt');
    const chaveCsrt = /Chave de Acesso: (\d{44})/.exec(nt)[1];
    const csrt = /CSRT: ([0-9A-Z]+)/.exec(nt)[1];
    const esperado = /Resultado: ([A-Za-z0-9+/]{27}=)/.exec(nt)[1];
    assert.equal(hashCsrt(csrt, chaveCsrt), esperado, 'hashCSRT del ejemplo de la NT 2018.005');

    // CODE-128 [Anexo II §2.1–2.2]: DV 48 y la secuencia de anchos impresa.
    const anexo2 = leer('normas/moc70-anexo2-danfe-codigo-de-barras.txt');
    const ejemplo = code128('09758364');
    assert.deepEqual(ejemplo.simbolos, [105, 9, 75, 83, 64, 48, 106]);
    assert.match(anexo2, /assim o DV é 48/);
    const anchos = /\n(2 1 1 2 3 2[\d ]+)\n/.exec(anexo2)[1].trim().split(' ').map(Number);
    assert.deepEqual(ejemplo.anchos, anchos, 'anchos del ejemplo del Anexo II');
    // NTC 2025.001 §6: suma ponderada 1987 → DV 30 en el modelo híbrido.
    assert.equal(digitoVerificador(105, [52, 25, 101, 33, 34, 99, 83]), 30);
    assert.match(leer('normas/ntc2025001-cnpj-alfa-chave-code128.txt'), /1987 mod 103 = 30/);
    // Invariantes de la tabla estándar: 107 símbolos de 11 módulos (STOP 13), distintos.
    assert.equal(PATRONES.length, 107);
    assert.equal(new Set(PATRONES).size, 107);
    PATRONES.forEach((p, i) => assert.equal([...p].reduce((a, b) => a + Number(b), 0), i === 106 ? 13 : 11, `patrón ${i}`));
    // Ida y vuelta: decodificar los anchos con la tabla devuelve la chave (numérica y alfanumérica).
    const decodificar = (b) => {
        const porPatron = new Map(PATRONES.map((p, i) => [p, i]));
        const sims = [];
        for (let k = 0; k < b.anchos.length - 7; k += 6) sims.push(porPatron.get(b.anchos.slice(k, k + 6).join('')));
        assert.equal(sims.at(-1), digitoVerificador(sims[0], sims.slice(1, -1)), 'DV del símbolo');
        let out = '';
        let modo = sims[0] === 105 ? 'C' : 'A';
        for (const v of sims.slice(1, -1)) {
            // En C, 101 es CODE A y lo demás son pares; en A, 99 es CODE C.
            if (modo === 'C' && v === 101) { modo = 'A'; continue; }
            if (modo === 'A' && v === 99) { modo = 'C'; continue; }
            out += modo === 'C' ? String(v).padStart(2, '0') : String.fromCharCode(v + 32);
        }
        return out;
    };
    for (const chave of [`${digitos}5`, alfa]) assert.equal(decodificar(code128(chave)), chave);

    // cNF prohibidos [Anexo I B03-10].
    const b03 = /B03-10[\s\S]*?cNF não pode ser igual a ([\s\S]*?)\.\s*\n\s*cNF não pode ser igual a nNF/.exec(leer('normas/moc70-anexo1-regras.txt'))[1]
        .replace(/\s+/g, '').split(',').sort();
    assert.deepEqual([...CNF_PROHIBIDOS].sort(), b03, 'lista de cNF prohibidos');
    for (let i = 0; i < 200; i++) assert.ok(!CNF_PROHIBIDOS.includes(gerarCnf(12345678)) && gerarCnf(12345678) !== '12345678');

    // GTIN: dígito verificador GS1.
    assert.ok(gtinValido('7891000315507'));
    assert.ok(!gtinValido('7891000315508'));
}

// ── 3. Armado ────────────────────────────────────────────────────────────────
function certificado(cnpj) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0e';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: `EMPRESA:${cnpj}` }]);
    cert.setIssuer([{ name: 'commonName', value: 'AC Teste' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}
const CNPJ = '11222333000181';
const CERT = certificado(CNPJ);
const AJUSTES = {
    serie: 1, crt: 3, ie: '123456789012', logradouro: 'Av. Paulista', numero: '1000', complemento: 'Conj. 101', bairro: 'Bela Vista', municipio: '3550308',
    cep: '01310100', telefone: '1133334444', indPres: '2', modFrete: '9', pis: { cst: '01', aliquota: 1.65 }, cofins: { cst: '01', aliquota: 7.6 },
    infCpl: 'Pedido 4521 – via Cord “link”',
};
const RECEPTOR = {
    taxId: '04.252.011/0001-10', nome: 'Cliente Comprador Ltda', email: 'compras@cliente.com.br', pais: 'BR', logradouro: 'Rua das Flores', complemento: 'Sala 2',
    cep: '04538-133', telefone: '+55 11 98888-7777', nfe: { numero: '45', bairro: 'Itaim Bibi', municipio: '3550308', indIEDest: '1', ie: '987654321', consumidorFinal: false },
};
const PRODUTO = { ncm: '73181500', cfop: '5102', origem: '0', unidade: 'UN', aliquotaIcms: 18, aliquotaIpi: 5, aliquotaFcp: 2, cClassTrib: '000001', codigo: 'PAR-M8', gtin: '7891000315507' };
const linea = (o = {}) => ({ description: 'Parafuso sextavado M8 x 40 mm', quantity: 3, unitPrice: 30, taxRate: 0.05, subtotal: 90, taxAmount: 4.5, total: 94.5, discount: 10, nfe: PRODUTO, ...o });
const RT = { cnpj: '61198164000160', contato: 'Equipe Cord', email: 'soporte@flouvia.com', fone: '5511999999999', csrt: { PR: { id: '01', codigo: 'G8063VRTNDMO886SFNK5LDUDEI24XJ22YIPO' } } };
const INSTANTE = new Date('2026-10-09T15:00:00Z');
const entrada = (o = {}) => ({
    entorno: 'homologacion', cnpjEmissor: CNPJ, razaoSocial: 'Loja Exemplo Comércio de Peças Ltda', ajustes: AJUSTES, receptor: RECEPTOR,
    lineas: [linea(), linea({ description: 'Arruela lisa 8 mm', quantity: 1.5, unitPrice: 20, taxRate: 0, subtotal: 30, taxAmount: 0, total: 30, discount: undefined, nfe: { ...PRODUTO, cfop: '5101', origem: '1', unidade: 'KG', aliquotaIcms: 12, aliquotaIpi: undefined, aliquotaFcp: undefined, gtin: undefined, codigo: 'ARR-8' } })],
    totales: { subtotal: 120, taxes: 4.5, total: 124.5, currency: 'BRL', discountTotal: 10 },
    instante: INSTANTE, ...o,
});
const firmar = (s, n, o = {}) => comXmlAssinado(conNumero(s, n, { cNF: '12345670', ...o }), CERT.certPem, CERT.keyPem);

const NORMAL = firmar(armarNfe(entrada()), 1001);
// Totales al centavo: vNF = vProd − vDesc + vIPI = total de Cord.
assert.deepEqual(
    [NORMAL.total.vProd, NORMAL.total.vDesc, NORMAL.total.vIPI, NORMAL.total.vNF, NORMAL.total.vBC, NORMAL.total.vICMS, NORMAL.total.vFCP],
    ['130.00', '10.00', '4.50', '124.50', '120.00', '19.80', '1.80'],
);
// vUnCom reproduce vProd (Anexo I I11-10, tolerancia 0,01).
for (const i of NORMAL.itens) assert.ok(Math.abs(Math.round(Number(i.prod.qCom) * Number(i.prod.vUnCom) * 100) - Math.round(Number(i.prod.vProd) * 100)) <= 1);
// IBS/CBS [UB16-10]: base = vProd − vDesc − vPIS − vCOFINS − vICMS − vFCP.
{
    const i = NORMAL.itens[0];
    const base = Math.round((100 - 10) * 100) - Math.round(Number(i.pis.v) * 100) - Math.round(Number(i.cofins.v) * 100) - Math.round(Number(i.icms.vICMS) * 100) - Math.round(Number(i.icms.vFCP) * 100);
    assert.equal(i.ibscbs.vBC, (base / 100).toFixed(2));
    assert.equal(i.ibscbs.vIBSUF, (aplicar(base, 0.1) / 100).toFixed(2));
    assert.equal(i.ibscbs.vCBS, (aplicar(base, 0.9) / 100).toFixed(2));
    assert.equal(i.vItem, '94.50');
}
assert.equal(aplicar(12345, 18), 2222, 'redondeo a la mitad hacia arriba: 22,221 → 22,22');
assert.equal(aplicar(250, 1), 3, '2,50 × 1 % = 0,025 → 0,03');
assert.equal(textoNfe('  Fábrica — “Ação”\n• ok € ✓ ', 60), 'Fábrica - "Ação" - ok EUR', 'texto Latin-1 de la NF-e');

const SIMPLES = firmar(armarNfe(entrada({
    ajustes: { ...AJUSTES, crt: 1, pCredSN: 2.56, pis: { cst: '99' }, cofins: { cst: '99' } },
    receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '3304557', ie: '86123456' } },
    lineas: [linea({ taxRate: 0, taxAmount: 0, total: 90, nfe: { ...PRODUTO, csosn: '101' } }), linea({ quantity: 2, unitPrice: 15, subtotal: 30, discount: undefined, taxRate: 0, taxAmount: 0, total: 30, nfe: { ...PRODUTO, csosn: '102', cfop: '5101' } })],
    totales: { subtotal: 120, taxes: 0, total: 120, currency: 'BRL', discountTotal: 10 },
})), 1002);
assert.equal(SIMPLES.idDest, '2');
assert.deepEqual(SIMPLES.itens.map((i) => i.prod.CFOP), ['6102', '6101']);
assert.equal(SIMPLES.total.ibscbs, undefined, 'el Simples no informa IBS/CBS en 2026');
assert.equal(SIMPLES.itens[0].icms.vCredICMSSN, '2.30');

const CONTINGENCIA = firmar(armarNfe(entrada({ ajustes: { ...AJUSTES, municipio: '4106902' }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '4106902' } }, respTec: RT })), 1003, {
    tpEmis: '7', contingencia: { dhCont: '2026-10-09T11:50:00-03:00', xJust: 'SEFAZ autorizadora indisponivel: emissao pela Sefaz Virtual de Contingencia' }, csrt: RT.csrt.PR,
});
assert.equal(CONTINGENCIA.chave[34], '7');
assert.equal(CONTINGENCIA.respTec.hashCSRT, hashCsrt(RT.csrt.PR.codigo, CONTINGENCIA.chave));

// Mensajes de los servicios, firmados.
const ENVI = enviNFe('202610091500001', NORMAL.xml);
const PED_CANC = pedidoCancelamento({ entorno: 'homologacion', cUF: '35', cnpj: CNPJ, chave: NORMAL.chave, nProt: '135260000000001', xJust: 'Venda desfeita a pedido do cliente', dhEvento: '2026-10-09T12:30:00-03:00' });
const EVENTO_CANC = eventoAssinado(PED_CANC, CERT.certPem, CERT.keyPem);
const PED_CCE = pedidoCce({ entorno: 'homologacion', cUF: '35', cnpj: CNPJ, chave: NORMAL.chave, nSeq: 1, xCorrecao: 'Corrigir o complemento do endereço: Sala 2', dhEvento: '2026-10-09T12:31:00-03:00' });
const EVENTO_CCE = eventoAssinado(PED_CCE, CERT.certPem, CERT.keyPem);
const PED_INUT = pedidoInutilizacao({ entorno: 'homologacion', cUF: '35', ano: '26', cnpj: CNPJ, serie: 1, nNFIni: 10, nNFFin: 12, xJust: 'Numeracao reservada e nao utilizada' });
const INUT = inutilizacaoAssinada(PED_INUT, CERT.certPem, CERT.keyPem);
// La SEFAZ simulada responde; con sus retornos se arman los "proc".
const sim = sefazSimulada();
const RET_ENVI = sim.autorizacao(ENVI);
const LOTE = lerRetornoLote(RET_ENVI);
assert.equal(LOTE.cStat, '104');
assert.equal(LOTE.prot.cStat, '100');
assert.equal(LOTE.prot.digVal, NORMAL.digVal, 'digVal del protocolo = DigestValue de la firma');
const PROC = nfeProc(NORMAL.xml, LOTE.prot.xml);
const RET_CANC = sim.evento(envEvento('1', EVENTO_CANC));
const RCANC = lerRetEnvEvento(RET_CANC);
assert.equal(RCANC.cStat, '135');
const PROC_EVENTO = procEvento(EVENTO_CANC, RCANC.xml);
const RET_SIT = sim.consulta(consSitNFe('homologacion', NORMAL.chave));
assert.equal(lerRetConsSit(RET_SIT).cStat, '101');
assert.deepEqual(lerRetConsSit(RET_SIT).eventos.map((e) => [e.tpEvento, e.cStat]), [['110111', '135']]);
const RET_INUT = sim.inutilizacao(INUT);
const RINUT = lerRetInut(RET_INUT);
assert.equal(RINUT.cStat, '102');
const PROC_INUT = procInut(INUT, RINUT.xml);
const RET_STATUS = sim.status(consStatServ('homologacion', '35'));
const SOBRE = sobre('NFeAutorizacao', ENVI);

// ── 3. Esquema: xmllint contra los XSD oficiales ─────────────────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (!xmllint) {
        if (process.env.NFE_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y NFE_XSD_REQUIRED=1');
        process.stdout.write('security:nfe: AVISO — xmllint no está instalado; se omite la validación contra los esquemas oficiales.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'nfe-check-'));
        try {
            // Juegos de esquemas: el leiaute vigente (PL_010f / PL_010d) con las raíces
            // que esos paquetes no republican (9q), en un mismo directorio.
            const juego = (nombre, base, raices = []) => {
                const d = join(dir, nombre);
                mkdirSync(d, { recursive: true });
                cpSync(join(FIX, base), d, { recursive: true });
                for (const r of raices) cpSync(join(FIX, 'xsd/PL_009q_NT2025_001_v1.00', r), join(d, r));
                return d;
            };
            const nfe = juego('nfe', 'xsd/PL_010f_v1.04', ['enviNFe_v4.00.xsd', 'retEnviNFe_v4.00.xsd', 'procNFe_v4.00.xsd', 'consReciNFe_v4.00.xsd', 'retConsReciNFe_v4.00.xsd',
                'consStatServ_v4.00.xsd', 'retConsStatServ_v4.00.xsd', 'leiauteConsStatServ_v4.00.xsd']);
            const nfe010d = juego('nfe010d', 'xsd/PL_010d_v1.03/NFe', ['inutNFe_v4.00.xsd', 'retInutNFe_v4.00.xsd']);
            const evento = juego('evento', 'xsd/PL_010d_v1.03/Evento');
            const canc = juego('canc', 'xsd/Evento_Canc_PL_v1.01');
            const cce = juego('cce', 'xsd/Evento_CCe_PL_v1.01');
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
            const ok = (nombre, xml, xsd) => assert.equal(validar(nombre, xml, xsd), null, `${nombre} no cumple el esquema oficial`);
            const det = (xml) => /<detEvento[\s\S]*<\/detEvento>/.exec(xml)[0].replace('<detEvento ', `<detEvento xmlns="${NS_NFE}" `);

            ok('nfe-normal', NORMAL.xml, join(nfe, 'nfe_v4.00.xsd'));
            ok('nfe-simples', SIMPLES.xml, join(nfe, 'nfe_v4.00.xsd'));
            ok('nfe-contingencia', CONTINGENCIA.xml, join(nfe, 'nfe_v4.00.xsd'));
            ok('enviNFe', ENVI, join(nfe, 'enviNFe_v4.00.xsd'));
            ok('retEnviNFe', RET_ENVI, join(nfe, 'retEnviNFe_v4.00.xsd'));
            ok('nfeProc', PROC, join(nfe, 'procNFe_v4.00.xsd'));
            ok('consReciNFe', consReciNFe('homologacion', '351234567890123'), join(nfe, 'consReciNFe_v4.00.xsd'));
            ok('consStatServ', consStatServ('homologacion', '35'), join(nfe, 'consStatServ_v4.00.xsd'));
            ok('retConsStatServ', RET_STATUS, join(nfe, 'retConsStatServ_v4.00.xsd'));
            ok('consSitNFe', consSitNFe('homologacion', NORMAL.chave), join(nfe010d, 'consSitNFe_v4.00.xsd'));
            ok('retConsSitNFe', RET_SIT, join(nfe010d, 'retConsSitNFe_v4.00.xsd'));
            ok('inutNFe', INUT, join(nfe010d, 'inutNFe_v4.00.xsd'));
            ok('retInutNFe', RET_INUT, join(nfe010d, 'retInutNFe_v4.00.xsd'));
            ok('procInutNFe', PROC_INUT, join(nfe010d, 'procInutNFe_v4.00.xsd'));
            ok('envEvento-canc', envEvento('1', EVENTO_CANC), join(evento, 'envEvento_v1.00.xsd'));
            ok('envEvento-cce', envEvento('2', EVENTO_CCE), join(evento, 'envEvento_v1.00.xsd'));
            ok('retEnvEvento', RET_CANC, join(evento, 'retEnvEvento_v1.00.xsd'));
            ok('procEventoNFe', PROC_EVENTO, join(evento, 'procEventoNFe_v1.00.xsd'));
            ok('detEvento-110111', det(EVENTO_CANC), join(canc, 'e110111_v1.00.xsd'));
            ok('detEvento-110110', det(EVENTO_CCE), join(cce, 'e110110_v1.00.xsd'));

            // Controles negativos: prueban que xmllint valida de verdad.
            const xsdNfe = join(nfe, 'nfe_v4.00.xsd');
            assert.notEqual(validar('neg-orden', NORMAL.xml.replace(/(<serie>[^<]*<\/serie>)(<nNF>[^<]*<\/nNF>)/, '$2$1'), xsdNfe), null, 'nNF antes de serie debe romper el esquema');
            assert.notEqual(validar('neg-falta', NORMAL.xml.replace(/<cMunFG>\d+<\/cMunFG>/, ''), xsdNfe), null, 'sin cMunFG debe romper el esquema');
            assert.notEqual(validar('neg-decimal', NORMAL.xml.replace('<vNF>124.50</vNF>', '<vNF>124.5</vNF>'), xsdNfe), null, 'vNF sin dos decimales debe romper el esquema');
            assert.notEqual(validar('neg-texto', NORMAL.xml.replace('<natOp>Venda de mercadoria</natOp>', '<natOp> Venda</natOp>'), xsdNfe), null, 'un TString con espacio al borde debe romper el esquema');
            assert.notEqual(validar('neg-ibs', NORMAL.xml.replace('<cClassTrib>000001</cClassTrib>', '<cClassTrib>1</cClassTrib>'), xsdNfe), null, 'cClassTrib sin 6 dígitos debe romper el esquema');
            assert.notEqual(validar('neg-cce', det(EVENTO_CCE).replace('A Carta de Correcao e', 'A carta de correcao e'), join(cce, 'e110110_v1.00.xsd')), null, 'xCondUso distinto debe romper el esquema');
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
        if (process.env.NFE_FIRMA_REQUIRED === '1') throw new Error('python3 con lxml u openssl no están disponibles y NFE_FIRMA_REQUIRED=1');
        process.stdout.write('security:nfe: AVISO — falta python3 con lxml u openssl; se omite la verificación independiente de la firma.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'nfe-firma-'));
        try {
            // C14N 1.0 inclusivo del elemento firmado, copiado como raíz (lleva
            // los namespaces en alcance) y comparado con el exclusivo del
            // subárbol, igual que en scripts/nfse-check.mjs. Se calcula también
            // DENTRO del lote y del sobre SOAP: lo que la SEFAZ canonicaliza.
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
                'si = alvo.getparent().xpath("ds:Signature/ds:SignedInfo", namespaces=ns)[0]',
                'print(c14n(alvo))',
                'print(c14n(si))',
            ].join('\n'));
            const verificar = (nombre, xml, firmado, tag, id, atributos = '') => {
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, xml);
                const [alvoB64, siB64] = execFileSync('python3', ['-I', py, file, id]).toString().trim().split('\n');
                assert.equal(Buffer.from(alvoB64, 'base64').toString('utf8'), canonicoDoElemento(firmado, tag, id, NS_NFE, atributos), `${nombre}: la forma canónica de Cord difiere de la de lxml`);
                const firma = firmado.slice(firmado.lastIndexOf('<Signature xmlns='));
                const digest = /<DigestValue>([^<]+)<\/DigestValue>/.exec(firma)[1];
                const sha1 = execFileSync('openssl', ['dgst', '-sha1', '-binary'], { input: Buffer.from(alvoB64, 'base64') }).toString('base64');
                assert.equal(sha1, digest, `${nombre}: DigestValue = SHA-1 de la forma canónica`);
                writeFileSync(join(dir, `${nombre}.si`), Buffer.from(siB64, 'base64'));
                writeFileSync(join(dir, `${nombre}.sig`), Buffer.from(/<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firma)[1], 'base64'));
                writeFileSync(join(dir, `${nombre}.pub`), forge.pki.publicKeyToPem(forge.pki.certificateFromPem(CERT.certPem).publicKey));
                const salida = execFileSync('openssl', ['dgst', '-sha1', '-verify', join(dir, `${nombre}.pub`), '-signature', join(dir, `${nombre}.sig`), join(dir, `${nombre}.si`)]).toString();
                assert.match(salida, /Verified OK/, `${nombre}: la firma no verifica con openssl`);
            };
            const V = ' versao="4.00"';
            verificar('nfe', NORMAL.xml, NORMAL.xml, 'infNFe', `NFe${NORMAL.chave}`, V);
            verificar('nfe-en-lote', ENVI, NORMAL.xml, 'infNFe', `NFe${NORMAL.chave}`, V);
            verificar('nfe-en-sobre', SOBRE, NORMAL.xml, 'infNFe', `NFe${NORMAL.chave}`, V);
            verificar('nfe-en-proc', PROC, NORMAL.xml, 'infNFe', `NFe${NORMAL.chave}`, V);
            verificar('nfe-contingencia', CONTINGENCIA.xml, CONTINGENCIA.xml, 'infNFe', `NFe${CONTINGENCIA.chave}`, V);
            verificar('evento-canc', EVENTO_CANC, EVENTO_CANC, 'infEvento', PED_CANC.id);
            verificar('evento-cce', EVENTO_CCE, EVENTO_CCE, 'infEvento', PED_CCE.id);
            verificar('inut', INUT, INUT, 'infInut', PED_INUT.id);
            // Control negativo: un byte cambiado en lo firmado ya no verifica.
            const alterado = NORMAL.xml.replace('<vNF>124.50</vNF>', '<vNF>124.51</vNF>');
            assert.throws(() => verificar('alterado', alterado, alterado, 'infNFe', `NFe${NORMAL.chave}`, V), /DigestValue/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 5. Reglas, DANFE y mensajes ──────────────────────────────────────────────
{
    // Falla cerrado ANTES de numerar.
    const conLinea = (o, t = {}) => entrada({ lineas: [linea(o)], totales: { subtotal: 90, taxes: 4.5, total: 94.5, currency: 'BRL', discountTotal: 10, ...t } });
    rechaza(() => armarNfe(conLinea({ nfe: undefined })), /no es un producto del catálogo con datos de NF-e/, 'un servicio no va en la NF-e');
    rechaza(() => armarNfe(conLinea({}, { currency: 'USD' })), /reales/, 'solo BRL');
    rechaza(() => armarNfe(entrada({ receptor: { ...RECEPTOR, pais: 'US' } })), /exportación/, 'sin exportación');
    rechaza(() => armarNfe(entrada({ receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '3304557' } } })), /entre estados en el Régimen Normal/, 'CRT 3 interestatal');
    rechaza(() => armarNfe(entrada({ ajustes: { ...AJUSTES, crt: 1, pis: { cst: '99' }, cofins: { cst: '99' } }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '3304557', indIEDest: '9', ie: undefined } },
        lineas: [linea({ taxRate: 0, taxAmount: 0, total: 90, nfe: { ...PRODUTO, csosn: '102' } })], totales: { subtotal: 90, taxes: 0, total: 90, currency: 'BRL', discountTotal: 10 } })), /DIFAL/, 'DIFAL a no contribuyente');
    rechaza(() => armarNfe(conLinea({ taxRate: 0.18, taxAmount: 16.2, total: 106.2 }, { taxes: 16.2, total: 106.2 })), /único impuesto que se suma al precio es el IPI/, 'un impuesto sobre el precio que no es el IPI');
    rechaza(() => armarNfe(conLinea({}, { total: 94.51 })), /no cuadra/, 'el total debe cuadrar al centavo');
    rechaza(() => armarNfe(conLinea({}, { retenciones: [{ nombre: 'IR', tipo: 'x', tasa: 0.015, base: 90, monto: 1.35 }], retencionTotal: 1.35 })), /retenciones/, 'sin retenciones');
    rechaza(() => armarNfe(conLinea({ nfe: { ...PRODUTO, ncm: '27101259' } })), /NCM/, 'sin combustibles');
    rechaza(() => armarNfe(conLinea({ quantity: 1.23456 })), /cuatro decimales/, 'qCom con hasta 4 decimales');
    rechaza(() => armarNfe(entrada({ ajustes: { ...AJUSTES, crt: 1, pis: { cst: '99' }, cofins: { cst: '99' } }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, indIEDest: '9', ie: undefined } },
        lineas: [linea({ taxRate: 0, taxAmount: 0, total: 90, nfe: { ...PRODUTO, csosn: '101' } })], totales: { subtotal: 90, taxes: 0, total: 90, currency: 'BRL', discountTotal: 10 } })), /CSOSN 101/, 'CSOSN 101 con no contribuyente [N12a-70]');
    rechaza(() => armarNfe(entrada({ receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, indIEDest: '2', ie: undefined } } })), /exento de IE/, 'E16a-30: SP no admite exento de IE');
    rechaza(() => armarNfe(entrada({ instante: new Date('2027-02-01T12:00:00Z') })), /alícuotas de prueba de 2026/, 'CRT 3 fuera de 2026', RailNoDisponibleError);
    rechaza(() => armarNfe(entrada({ ajustes: { ...AJUSTES, municipio: '4106902' }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '4106902' } } })), /desarrollador del sistema emisor/, 'PR exige responsable técnico', RailNoDisponibleError);
    rechaza(() => armarNfe(entrada({ ajustes: { ...AJUSTES, municipio: '4106902' }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, municipio: '4106902' } }, respTec: { ...RT, csrt: undefined } })), /código de seguridad/, 'PR exige CSRT', RailNoDisponibleError);
    // Y lo correcto pasa: Simples con CSOSN 400 a un exento de IE en SP (exención 4 de E16a-30).
    armarNfe(entrada({ ajustes: { ...AJUSTES, crt: 1, pis: { cst: '99' }, cofins: { cst: '99' } }, receptor: { ...RECEPTOR, nfe: { ...RECEPTOR.nfe, indIEDest: '2', ie: undefined } },
        lineas: [linea({ taxRate: 0, taxAmount: 0, total: 90, nfe: { ...PRODUTO, csosn: '400' } })], totales: { subtotal: 90, taxes: 0, total: 90, currency: 'BRL', discountTotal: 10 } }));

    // Datos del catálogo y de Ajustes.
    assert.equal(produtoNfeDe({ ncm: '7318.15.00', cfop: '5102', unidade: 'un' }).valor.ncm, '73181500');
    assert.match(produtoNfeDe({ ncm: '27101259', cfop: '5102', unidade: 'L' }).error, /combustibles/);
    assert.match(produtoNfeDe({ ncm: '73181500', cfop: '5405', unidade: 'UN' }).error, /5101|5102/, 'sustitución tributaria (5405) no se emite');
    assert.match(produtoNfeDe({ ncm: '73181500', cfop: '5102', unidade: 'UN', csosn: '500' }).error, /CSOSN/);
    assert.match(clienteNfeDe({ numero: '1', bairro: 'Centro', municipio: '3550308', indIEDest: '1' }).error, /Inscrição Estadual/);
    assert.equal(clienteNfeDe({ numero: '1', bairro: 'Centro', municipio: '3550308', indIEDest: '9' }).valor.consumidorFinal, true, 'un no contribuyente es consumidor final [E16a-40]');
    assert.deepEqual(faltantesAjustes({}), ['serie', 'crt', 'ie', 'endereco', 'municipio', 'cep', 'pis_cofins']);
    assert.deepEqual(faltantesAjustes(AJUSTES), []);
    assert.equal(aplicarCambio({}, { serie: '890' }).ok, false, 'serie 0 a 889');
    assert.equal(aplicarCambio({}, { pis_cst: '01' }).ok, false, 'CST 01 exige alícuota');

    // DANFE: la chave en 11 bloques, el protocolo, "SEM VALOR FISCAL" en homologación.
    const pdf = createDanfePdf(danfeDe(NORMAL, { nProt: '135260000000001', dhRecbto: '2026-10-09T12:00:07-03:00' }, true));
    let contenido = '';
    for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        try { contenido += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { contenido += m[1]; }
    }
    for (const t of ['DANFE', 'SEM VALOR FISCAL', NORMAL.chave.replace(/(.{4})(?=.)/g, '$1 '), '135260000000001 09/10/2026 12:00:07', 'TOTAL DO IBS/CBS/IS', 'FOLHA 1/1']) {
        assert.ok(contenido.includes(`(${t}) Tj`), `el DANFE debe imprimir "${t}"`);
    }
    assert.match(contenido, /\(N.{1,4} 000\.001\.001\) Tj/, 'el DANFE imprime el número con la máscara 000.000.000');

    // Mensajes: nada de variables de entorno ni la descripción cruda de la SEFAZ (regla 14).
    for (const c of [...CODIGOS_CON_MENSAJE, '999', '123']) {
        const m = mensajeCstat(c);
        assert.ok(!/Rejeição|[A-Z]{3,}_[A-Z_]{3,}/.test(m), `mensaje del cStat ${c}: ${m}`);
    }
}

process.stdout.write('security:nfe: ok — fuentes, tablas, vectores oficiales, esquemas, firma, reglas y DANFE de la NF-e.\n');
