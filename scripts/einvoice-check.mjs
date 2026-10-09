#!/usr/bin/env node
// security:einvoice — la factura electrónica europea contra los validadores
// OFICIALES, no contra lo que creemos que dice el estándar.
//
//   npm run security:einvoice
//   EINVOICE_VALIDATION_REQUIRED=1 npm run security:einvoice   (falla si no puede validar)
//
// Genera las muestras de `test/helpers/einvoice-samples.ts` (Francia B2B,
// Alemania con Leitweg-ID, servicio intracomunitario con inversión del sujeto
// pasivo, entrega intracomunitaria, exportación, tasas mezcladas con exención,
// nota de crédito, descuento de documento, redondeo con muchas líneas y
// franquicia francesa) en cada formato que admiten, y las pasa por:
//
//   XSD        UBL 2.1 y CII D16B (de la configuración KoSIT) y Factur-X 1.09
//   CEN        schematron EN 16931 v1.3.16 de CEN/TC 434 (UBL y CII)
//   KoSIT      validador 1.6.3 + configuración XRechnung 3.0.2 de 2026-08-31
//              (la que usa la administración alemana: XSD + CEN + BR-DE)
//   Peppol     Peppol BIS Billing 3.0, release mayo 2026 (3.0.21): reglas
//              PEPPOL-EN16931 y su copia de las reglas CEN
//   Factur-X   schematron Factur-X 1.09 EN16931 (FNFE-MPE)
//   veraPDF    PDF/A-3b del Factur-X, vía Mustang 2.26 (que además vuelve a
//              validar el XML incrustado)
//
// Y controles NEGATIVOS: copias deliberadamente rotas que cada validador debe
// rechazar. Sin ellos, un validador mal invocado (que no lee el archivo, que
// apunta a otro XSLT) "pasaría" todo y el check no probaría nada.
//
// Artefactos: URLs fijas con su SHA-256. Se descargan a `.cache/einvoice/`
// (ignorado por git) o se toman de EINVOICE_TOOLS_DIR si ya están ahí con el
// mismo nombre. Un SHA-256 distinto es un fallo, nunca un aviso: o el archivo
// cambió en origen o no es el que se revisó.
//
// Sin Java, sin xmllint o sin red el check se OMITE con un aviso, salvo con
// EINVOICE_VALIDATION_REQUIRED=1, que lo vuelve obligatorio.
//
// Se corre con Node plano: --experimental-strip-types y el gancho
// scripts/lib/ts-resolve.mjs (los módulos de src/ importan sin extensión).

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = process.env.EINVOICE_VALIDATION_REQUIRED === '1';
const CACHE = resolve(ROOT, process.env.EINVOICE_CACHE_DIR || '.cache/einvoice');
const TOOLS = process.env.EINVOICE_TOOLS_DIR ? resolve(process.env.EINVOICE_TOOLS_DIR) : null;

// ── Artefactos fijados ───────────────────────────────────────────────────────
// Cada uno: de dónde sale, su huella y qué parte del archivo se usa.
const ARTEFACTS = {
    // Validador KoSIT y la configuración XRechnung vigente (2026-08-31: XRechnung
    // 3.0.2 sobre el schematron CEN 1.3.16). La configuración de 2024 traía una
    // lista VATEX anterior y rechazaba VATEX-EU-135-1, que hoy es válido.
    kosit: {
        url: 'https://repo1.maven.org/maven2/org/kosit/validator/1.6.3/validator-1.6.3-standalone.jar',
        sha256: '799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9',
        extract: false,
    },
    xrechnung: {
        url: 'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip',
        sha256: '2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8',
        extract: null,
    },
    cenUbl: {
        url: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-ubl-1.3.16.zip',
        sha256: 'bafada015efbc5248bf5e05ad2191e1d9833ef96e9dd5f4bce420a747342da85',
        extract: ['xslt/'],
    },
    cenCii: {
        url: 'https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/download/validation-1.3.16/en16931-cii-1.3.16.zip',
        sha256: '1cd53cb8a84d38aedc82c0caede217da983a7934dd663f793a092fd66443c561',
        extract: ['xslt/'],
    },
    // Las reglas de Peppol publicadas en docs.peppol.eu viven en una URL que se
    // sobrescribe con cada release. El mismo artefacto, ya compilado a XSLT y
    // versionado de forma inmutable, lo distribuye phive en Maven Central:
    // carpeta 2026.5 = release de mayo de 2026 (3.0.21).
    peppol: {
        url: 'https://repo1.maven.org/maven2/com/helger/phive/rules/phive-rules-peppol/4.6.3/phive-rules-peppol-4.6.3.jar',
        sha256: '8d746eed379b5e9e8cd58530e1b8a7931786d089fb94d785e99b9be142c0431b',
        extract: ['external/schematron/openpeppol/2026.5/xslt/PEPPOL-EN16931-UBL.xslt', 'external/schematron/openpeppol/2026.5/xslt/CEN-EN16931-UBL.xslt'],
    },
    // XSD y schematron Factur-X 1.09 EN16931 de FNFE-MPE, tal como los
    // empaqueta la librería de referencia factur-x (PyPI).
    facturx: {
        url: 'https://files.pythonhosted.org/packages/py3/f/factur-x/factur_x-7.4-py3-none-any.whl',
        sha256: 'f3ddd43abeb2ac59390f0c7de3ecf914967c19303b1435e79cc08bce31be9702',
        extract: ['facturx/xsd_and_schematron/facturx-en16931/'],
    },
    mustang: {
        url: 'https://repo1.maven.org/maven2/org/mustangproject/Mustang-CLI/2.26.0/Mustang-CLI-2.26.0.jar',
        sha256: '42d7868cb68264874a7b8cab4c3587b03b23ccc7cd72373da917f66758bb9736',
        extract: false,
    },
};

class Skip extends Error {}

function skip(reason) {
    if (REQUIRED) {
        console.error(`security:einvoice FALLÓ: ${reason} (EINVOICE_VALIDATION_REQUIRED=1).`);
        process.exit(1);
    }
    console.warn(`security:einvoice OMITIDO: ${reason}. Con EINVOICE_VALIDATION_REQUIRED=1 este aviso es un fallo.`);
    process.exit(0);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function fetchArtefact(id) {
    const a = ARTEFACTS[id];
    const name = basename(new URL(a.url).pathname);
    for (const dir of [TOOLS, CACHE].filter(Boolean)) {
        const path = join(dir, name);
        if (!existsSync(path)) continue;
        const got = sha256(readFileSync(path));
        if (got === a.sha256) return path;
        if (dir === TOOLS) throw new Error(`${path}: SHA-256 ${got}, se esperaba ${a.sha256}`);
    }
    let buf;
    try {
        const res = await fetch(a.url, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
    } catch (error) {
        throw new Skip(`no se pudo descargar ${a.url} (${error.message})`);
    }
    const got = sha256(buf);
    if (got !== a.sha256) throw new Error(`${a.url}: SHA-256 ${got}, se esperaba ${a.sha256}`);
    mkdirSync(CACHE, { recursive: true });
    const path = join(CACHE, name);
    writeFileSync(path, buf);
    return path;
}

// ── ZIP mínimo (directorio central, stored/deflate) ──────────────────────────
// Suficiente para los artefactos fijados; un formato que no entiende es un
// error explícito, no una extracción a medias.
function readZip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP sin directorio central');
    const count = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16);
    if (count === 0xffff || off === 0xffffffff) throw new Error('ZIP64 no soportado');
    const entries = [];
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('directorio central dañado');
        const method = buf.readUInt16LE(off + 10);
        const size = buf.readUInt32LE(off + 20);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const local = buf.readUInt32LE(off + 42);
        const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
        off += 46 + nameLen + extraLen + commentLen;
        entries.push({
            name,
            data() {
                if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`${name}: cabecera local dañada`);
                const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
                const raw = buf.subarray(start, start + size);
                if (method === 0) return raw;
                if (method === 8) return inflateRawSync(raw);
                throw new Error(`${name}: método de compresión ${method} no soportado`);
            },
        });
    }
    return entries;
}

function unpack(id, archive) {
    const a = ARTEFACTS[id];
    const dest = join(CACHE, 'unpacked', `${id}-${a.sha256.slice(0, 12)}`);
    if (existsSync(join(dest, '.ok'))) return dest;
    rmSync(dest, { recursive: true, force: true });
    for (const entry of readZip(readFileSync(archive))) {
        if (entry.name.endsWith('/')) continue;
        if (a.extract && !a.extract.some((p) => entry.name === p || (p.endsWith('/') && entry.name.startsWith(p)))) continue;
        const out = resolve(dest, entry.name);
        // Zip-slip: ninguna entrada escribe fuera de su carpeta.
        if (!out.startsWith(dest + sep)) throw new Error(`${entry.name}: ruta fuera del destino`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, entry.data());
    }
    writeFileSync(join(dest, '.ok'), a.sha256);
    return dest;
}

// ── Procesos ─────────────────────────────────────────────────────────────────

function run(cmd, args, timeoutMs = 300_000) {
    return new Promise((resolveRun) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('error', (error) => { clearTimeout(timer); resolveRun({ code: -1, stdout, stderr: stderr + String(error) }); });
        child.on('close', (code) => { clearTimeout(timer); resolveRun({ code, stdout, stderr }); });
    });
}

async function pool(tasks, size) {
    const out = new Array(tasks.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, async () => {
        while (next < tasks.length) {
            const i = next++;
            out[i] = await tasks[i]();
        }
    }));
    return out;
}

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const oneLine = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** SVRL → errores y avisos. Sin `flag`, el schematron Factur-X declara un error. */
function parseSvrl(text) {
    const errors = [];
    const warnings = [];
    for (const m of text.matchAll(/<svrl:(failed-assert|successful-report)\b([^>]*)>([\s\S]*?)<\/svrl:\1>/g)) {
        const attrs = m[2];
        const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? '?';
        const flag = /\bflag="([^"]*)"/.exec(attrs)?.[1] ?? 'error';
        const msg = `${id}: ${oneLine(/<svrl:text>([\s\S]*?)<\/svrl:text>/.exec(m[3])?.[1] ?? '').slice(0, 240)}`;
        (flag === 'warning' || flag === 'information' ? warnings : errors).push(msg);
    }
    return { ok: errors.length === 0, errors, warnings };
}

// ── Validadores ──────────────────────────────────────────────────────────────

async function xsd(files, schemaFor) {
    const bySchema = new Map();
    for (const f of files) {
        const schema = schemaFor(f);
        bySchema.set(schema, [...(bySchema.get(schema) ?? []), f]);
    }
    const out = {};
    for (const [schema, list] of bySchema) {
        const r = await run('xmllint', ['--noout', '--nonet', '--schema', schema, ...list]);
        const text = r.stdout + r.stderr;
        for (const f of list) {
            const errors = text.split('\n').filter((l) => l.startsWith(`${f}:`)).map((l) => l.slice(f.length + 1).trim().slice(0, 240));
            const ok = text.includes(`${f} validates`) && !errors.length;
            out[f] = { ok, errors: ok ? [] : (errors.length ? errors : ['xmllint no confirmó la validación']), warnings: [] };
        }
    }
    return out;
}

async function schematron(saxonJar, xslt, dir, outDir) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const r = await run('java', ['-cp', saxonJar, 'net.sf.saxon.Transform', `-s:${dir}`, `-xsl:${xslt}`, `-o:${outDir}`]);
    const out = {};
    for (const name of readdirSync(dir)) {
        const svrl = join(outDir, name);
        out[join(dir, name)] = existsSync(svrl)
            ? parseSvrl(readFileSync(svrl, 'utf8'))
            : { ok: false, errors: [`Saxon no produjo informe (código ${r.code}): ${oneLine(r.stderr).slice(-300)}`], warnings: [] };
    }
    return out;
}

async function kosit(jar, config, files, outDir) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const r = await run('java', ['-jar', jar, '-s', join(config, 'scenarios.xml'), '-r', config, '-o', outDir, ...files]);
    const out = {};
    for (const f of files) {
        const report = join(outDir, `${basename(f).replace(/\.xml$/, '')}-report.xml`);
        if (!existsSync(report)) {
            out[f] = { ok: false, errors: [`KoSIT no produjo informe (código ${r.code}): ${oneLine(r.stdout + r.stderr).slice(-300)}`], warnings: [] };
            continue;
        }
        const text = readFileSync(report, 'utf8');
        const errors = [];
        const warnings = [];
        for (const m of text.matchAll(/<rep:message\b([^>]*)>([\s\S]*?)<\/rep:message>/g)) {
            const level = /\blevel="([^"]*)"/.exec(m[1])?.[1] ?? 'error';
            const code = /\bcode="([^"]*)"/.exec(m[1])?.[1] ?? '?';
            const msg = `${code}: ${oneLine(m[2]).slice(0, 240)}`;
            (level === 'error' ? errors : warnings).push(msg);
        }
        const accepted = /<rep:assessment>\s*<rep:accept>/.test(text);
        if (!accepted && !errors.length) errors.push('KoSIT recomienda rechazar el documento');
        out[f] = { ok: accepted, errors: accepted ? [] : errors, warnings };
    }
    return out;
}

async function mustang(jar, pdf) {
    const r = await run('java', ['-Xmx1g', '-jar', jar, '--no-notices', '--action', 'validate', '--source', pdf], 600_000);
    const text = r.stdout;
    const pdfPart = /<pdf>([\s\S]*?)<\/pdf>/.exec(text)?.[1] ?? '';
    const pdfOk = /isCompliant=true/.test(pdfPart) && /<summary status="valid"\/>/.test(pdfPart);
    const statuses = [...text.matchAll(/<summary status="([^"]+)"\/>/g)].map((m) => m[1]);
    const overall = statuses.at(-1);
    const errors = [...text.matchAll(/<error\b[^>]*>([\s\S]*?)<\/error>/g)].map((m) => oneLine(m[1]).slice(0, 240));
    const warnings = [...text.matchAll(/<warning\b[^>]*>([\s\S]*?)<\/warning>/g)].map((m) => {
        const body = oneLine(m[1]);
        const id = /\[ID ([^\]]+)\]/.exec(body)?.[1] ?? '?';
        return `${id}: ${body.replace(/\s*\[ID [^\]]*\][\s\S]*$/, '').slice(0, 200)}`;
    });
    if (!pdfOk) errors.unshift(`veraPDF: no es PDF/A-3b conforme (${oneLine(pdfPart).slice(0, 200)})`);
    if (!overall) errors.unshift(`Mustang no produjo informe (código ${r.code}): ${oneLine(r.stderr).slice(-300)}`);
    const ok = pdfOk && overall === 'valid' && !errors.length;
    return { ok, errors, warnings };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    for (const [cmd, args] of [['java', ['-version']], ['xmllint', ['--version']]]) {
        const r = spawnSync(cmd, args, { encoding: 'utf8' });
        if (r.error || r.status !== 0) skip(`falta \`${cmd}\` en el sistema`);
    }

    const paths = {};
    try {
        for (const id of Object.keys(ARTEFACTS)) paths[id] = await fetchArtefact(id);
    } catch (error) {
        if (error instanceof Skip) skip(error.message);
        throw error;
    }
    const dirs = {};
    for (const [id, a] of Object.entries(ARTEFACTS)) dirs[id] = a.extract === false ? null : unpack(id, paths[id]);

    // El jar autónomo de KoSIT trae Saxon HE: sirve también para los schematron.
    const KOSIT_JAR = paths.kosit;
    const XR = dirs.xrechnung;
    const UBL_XSD = {
        Invoice: join(XR, 'resources/ubl/2.1/xsd/maindoc/UBL-Invoice-2.1.xsd'),
        CreditNote: join(XR, 'resources/ubl/2.1/xsd/maindoc/UBL-CreditNote-2.1.xsd'),
    };
    const CII_XSD = join(XR, 'resources/cii/16b/xsd/CrossIndustryInvoice_100pD16B.xsd');
    const FX = join(dirs.facturx, 'facturx/xsd_and_schematron/facturx-en16931');
    const PEPPOL = join(dirs.peppol, 'external/schematron/openpeppol/2026.5/xslt');
    const XSLT = {
        'cen-ubl': join(dirs.cenUbl, 'xslt/EN16931-UBL-validation.xslt'),
        'cen-cii': join(dirs.cenCii, 'xslt/EN16931-CII-validation.xslt'),
        peppol: join(PEPPOL, 'PEPPOL-EN16931-UBL.xslt'),
        'peppol-cen': join(PEPPOL, 'CEN-EN16931-UBL.xslt'),
        'facturx-sch': join(FX, 'FACTUR-X_EN16931.xslt'),
    };
    for (const f of [KOSIT_JAR, UBL_XSD.Invoice, UBL_XSD.CreditNote, CII_XSD, join(FX, 'Factur-X_EN16931.xsd'), ...Object.values(XSLT)]) {
        if (!existsSync(f)) throw new Error(`artefacto incompleto: falta ${f}`);
    }

    // ── Muestras ──
    const { EINVOICE_SAMPLES, samplePdfInput } = await import('../test/helpers/einvoice-samples.ts');
    const { assessEInvoice, formatProblems } = await import('../src/lib/fiscal/einvoice/model.ts');
    const { serializeUbl } = await import('../src/lib/fiscal/einvoice/ubl.ts');
    const { serializeCii } = await import('../src/lib/fiscal/einvoice/cii.ts');
    const { buildFacturX } = await import('../src/lib/fiscal/einvoice/facturx.ts');
    const { loadArchivalFonts } = await import('../src/lib/pdf/pdfa.ts');
    const fonts = await loadArchivalFonts();

    const RUN = join(CACHE, 'run');
    rmSync(RUN, { recursive: true, force: true });
    const D = { xrUbl: join(RUN, 'xrechnung-ubl'), xrCii: join(RUN, 'xrechnung-cii'), peppol: join(RUN, 'peppol'), fxXml: join(RUN, 'facturx-xml'), fxPdf: join(RUN, 'facturx-pdf') };
    for (const d of Object.values(D)) mkdirSync(d, { recursive: true });

    const generationErrors = [];
    const written = {}; // archivo → { sample, format }
    const put = (dir, name, content, meta) => { const f = join(dir, name); writeFileSync(f, content); written[f] = meta; return f; };
    for (const s of EINVOICE_SAMPLES) {
        const assessment = assessEInvoice(s.source);
        for (const format of s.formats) {
            const problems = formatProblems(format, assessment);
            if (problems.length || !assessment.invoice) {
                generationErrors.push(`${s.id} (${format}): ${problems.map((p) => p.code).join(', ')}`);
                continue;
            }
            const inv = assessment.invoice;
            const meta = { sample: s.id, format };
            if (format === 'xrechnung') put(D.xrUbl, `${s.id}.xml`, serializeUbl(inv, 'xrechnung'), meta);
            if (format === 'xrechnung-cii') put(D.xrCii, `${s.id}.xml`, serializeCii(inv, 'xrechnung'), meta);
            if (format === 'peppol') put(D.peppol, `${s.id}.xml`, serializeUbl(inv, 'peppol'), meta);
            if (format === 'facturx') {
                const { pdf, xml } = buildFacturX(samplePdfInput(s.source), inv, fonts);
                put(D.fxXml, `${s.id}.xml`, xml, meta);
                put(D.fxPdf, `${s.id}.pdf`, pdf, meta);
            }
        }
    }
    if (generationErrors.length) {
        console.error('security:einvoice FALLÓ: muestras que no se pudieron generar:');
        for (const e of generationErrors) console.error(`  - ${e}`);
        process.exit(1);
    }

    // ── Controles negativos: cada uno DEBE ser rechazado por `expect` ──
    const negatives = {};
    function negative(dir, base, name, mutate, expect, why) {
        const src = join(dir, base);
        const original = readFileSync(src);
        const mutated = mutate(original.toString('latin1'));
        if (mutated === original.toString('latin1')) throw new Error(`control negativo ${name}: la mutación no cambió nada`);
        const f = join(dir, name);
        writeFileSync(f, Buffer.from(mutated, 'latin1'));
        negatives[f] = { expect, why };
    }
    const once = (re, to) => (s) => s.replace(re, to);
    negative(D.xrUbl, 'de-leitweg.xml', 'neg-sin-leitweg.xml', once(/<cbc:BuyerReference>[^<]*<\/cbc:BuyerReference>/, ''), ['kosit'], 'sin referencia del comprador (BR-DE-15)');
    negative(D.xrCii, 'de-leitweg.xml', 'neg-total.xml', once(/<ram:GrandTotalAmount>1785\.00</, '<ram:GrandTotalAmount>1786.00<'), ['cen-cii', 'kosit'], 'total con IVA que no cuadra (BR-CO-15)');
    negative(D.peppol, 'fr-b2b.xml', 'neg-sin-endpoint.xml', (s) => {
        const at = s.indexOf('<cac:AccountingCustomerParty>');
        return s.slice(0, at) + s.slice(at).replace(/<cbc:EndpointID[^>]*>[^<]*<\/cbc:EndpointID>/, '');
    }, ['peppol'], 'comprador sin dirección electrónica (PEPPOL-EN16931-R010)');
    negative(D.peppol, 'fr-b2b.xml', 'neg-total.xml', once(/(<cbc:PayableAmount currencyID="EUR">)1344\.00</, (_m, open) => `${open}1345.00<`), ['cen-ubl', 'peppol-cen'], 'importe a pagar que no cuadra (BR-CO-16)');
    negative(D.fxXml, 'fr-b2b.xml', 'neg-xsd.xml', (s) => s.replace('<ram:SellerTradeParty>', '<ram:SellerTradePartyX>').replace('</ram:SellerTradeParty>', '</ram:SellerTradePartyX>'), ['xsd'], 'elemento fuera del esquema');
    negative(D.fxXml, 'fr-b2b.xml', 'neg-total.xml', once(/<ram:GrandTotalAmount>1344\.00</, '<ram:GrandTotalAmount>1345.00<'), ['facturx-sch', 'cen-cii'], 'total con IVA que no cuadra (BR-CO-15)');
    negative(D.fxPdf, 'fr-b2b.pdf', 'neg-pdfa.pdf', (s) => s.replace('/OutputIntents', '/OutputIntentX'), ['verapdf'], 'PDF sin OutputIntent (ISO 19005-3, 6.2.4.2)');

    const filesIn = (dir) => readdirSync(dir).map((n) => join(dir, n)).sort();
    const ublSchema = (f) => (readFileSync(f, 'utf8').includes('<CreditNote ') ? UBL_XSD.CreditNote : UBL_XSD.Invoice);

    // ── Validación ──
    const results = {}; // archivo → validador → resultado
    const record = (validator, map) => {
        for (const [f, r] of Object.entries(map)) (results[f] ??= {})[validator === 'mustang' ? 'verapdf' : validator] = r;
    };
    const SVRL = join(CACHE, 'svrl');
    const jobs = [
        async () => record('xsd', await xsd([...filesIn(D.xrUbl), ...filesIn(D.peppol)], ublSchema)),
        async () => record('xsd', await xsd(filesIn(D.xrCii), () => CII_XSD)),
        async () => record('xsd', await xsd(filesIn(D.fxXml), () => join(FX, 'Factur-X_EN16931.xsd'))),
        async () => record('cen-ubl', await schematron(KOSIT_JAR, XSLT['cen-ubl'], D.xrUbl, join(SVRL, 'cen-ubl-xr'))),
        async () => record('cen-ubl', await schematron(KOSIT_JAR, XSLT['cen-ubl'], D.peppol, join(SVRL, 'cen-ubl-peppol'))),
        async () => record('cen-cii', await schematron(KOSIT_JAR, XSLT['cen-cii'], D.xrCii, join(SVRL, 'cen-cii-xr'))),
        async () => record('cen-cii', await schematron(KOSIT_JAR, XSLT['cen-cii'], D.fxXml, join(SVRL, 'cen-cii-fx'))),
        async () => record('peppol', await schematron(KOSIT_JAR, XSLT.peppol, D.peppol, join(SVRL, 'peppol'))),
        async () => record('peppol-cen', await schematron(KOSIT_JAR, XSLT['peppol-cen'], D.peppol, join(SVRL, 'peppol-cen'))),
        async () => record('facturx-sch', await schematron(KOSIT_JAR, XSLT['facturx-sch'], D.fxXml, join(SVRL, 'facturx'))),
        // Una corrida por carpeta: el informe se nombra por el archivo y UBL y CII comparten nombres.
        async () => record('kosit', await kosit(KOSIT_JAR, XR, filesIn(D.xrUbl), join(CACHE, 'kosit', 'ubl'))),
        async () => record('kosit', await kosit(KOSIT_JAR, XR, filesIn(D.xrCii), join(CACHE, 'kosit', 'cii'))),
        ...filesIn(D.fxPdf).map((pdf) => async () => record('mustang', { [pdf]: await mustang(paths.mustang, pdf) })),
    ];
    const t0 = Date.now();
    await pool(jobs, Math.max(2, Math.min(4, Math.floor(availableParallelism() / 2))));

    // ── Veredicto ──
    const VALIDATORS = ['xsd', 'cen-ubl', 'cen-cii', 'kosit', 'peppol', 'peppol-cen', 'facturx-sch', 'verapdf'];
    const LABEL = { xsd: 'XSD', 'cen-ubl': 'CEN UBL', 'cen-cii': 'CEN CII', kosit: 'KoSIT XRechnung', peppol: 'Peppol', 'peppol-cen': 'Peppol CEN', 'facturx-sch': 'Factur-X', verapdf: 'veraPDF + Mustang' };
    const failures = [];
    const warningIds = new Map();
    const rel = (f) => f.slice(RUN.length + 1);
    console.log('\nsecurity:einvoice — muestras contra los validadores oficiales\n');
    for (const f of Object.keys(results).sort()) {
        const neg = negatives[f];
        const cells = [];
        for (const v of VALIDATORS) {
            const r = results[f][v];
            if (!r) continue;
            if (neg) {
                if (!neg.expect.includes(v)) continue;
                cells.push(`${LABEL[v]} ${r.ok ? 'ACEPTÓ' : 'rechazó'}`);
                if (r.ok) failures.push(`${rel(f)}: ${LABEL[v]} aceptó un documento roto (${neg.why})`);
                continue;
            }
            const w = r.warnings.length ? ` (${r.warnings.length} aviso${r.warnings.length === 1 ? '' : 's'})` : '';
            cells.push(`${LABEL[v]} ${r.ok ? 'ok' : 'FALLA'}${w}`);
            if (!r.ok) failures.push(`${rel(f)}: ${LABEL[v]}\n      ${r.errors.slice(0, 8).join('\n      ')}`);
            for (const msg of r.warnings) {
                const id = msg.split(':')[0];
                warningIds.set(`${LABEL[v]} ${id}`, msg);
            }
        }
        if (neg) for (const v of neg.expect) if (!results[f][v]) failures.push(`${rel(f)}: ${LABEL[v]} no examinó el control negativo`);
        console.log(`  ${rel(f).padEnd(34)} ${neg ? '[negativo] ' : ''}${cells.join(' · ')}`);
    }
    // Cada archivo positivo pasa por TODOS los validadores de su formato.
    const EXPECTED = {
        'xrechnung-ubl': ['xsd', 'cen-ubl', 'kosit'],
        'xrechnung-cii': ['xsd', 'cen-cii', 'kosit'],
        peppol: ['xsd', 'cen-ubl', 'peppol', 'peppol-cen'],
        'facturx-xml': ['xsd', 'cen-cii', 'facturx-sch'],
        'facturx-pdf': ['verapdf'],
    };
    for (const f of Object.keys(written)) {
        const group = basename(dirname(f));
        for (const v of EXPECTED[group]) if (!results[f]?.[v]) failures.push(`${rel(f)}: ${LABEL[v]} no lo examinó`);
    }
    if (warningIds.size) {
        console.log('\n  Avisos (no bloquean; documentados en docs/estado/cobros-facturacion.md):');
        for (const [key, msg] of [...warningIds].sort()) console.log(`    ${key.split(' ').slice(0, -1).join(' ')}: ${msg.slice(0, 160)}`);
    }
    console.log(`\n  ${Object.keys(written).length} archivos, ${Object.keys(negatives).length} controles negativos, ${Math.round((Date.now() - t0) / 1000)} s.`);
    if (failures.length) {
        console.error(`\nsecurity:einvoice FALLÓ (${failures.length}):`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log('security:einvoice OK');
}

main().catch((error) => {
    console.error(`security:einvoice FALLÓ: ${error?.stack || error}`);
    process.exit(1);
});
