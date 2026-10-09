#!/usr/bin/env node
// security:spfe — la factura electrónica entre empresarios por la solución
// pública de la AEAT (SPFE) contra la fuente primaria que SÍ está publicada.
//
//   npm run security:spfe
//   SPFE_XSD_REQUIRED=1 npm run security:spfe   (falla si no hay xmllint)
//
// Cuatro capas:
//
//   1. Artefactos fijados: los XSD runtime de OASIS UBL 2.5 (OASIS Standard,
//      12-08-2026; https://docs.oasis-open.org/ubl/os-UBL-2.5/xsdrt/),
//      vendorizados en scripts/fixtures/ubl25/ con el SHA-256 que publica el
//      propio manifiesto de OASIS (UBL-2.5-manifest.txt), copiado a
//      SHA256SUMS. Un hash distinto es un fallo: o el archivo cambió o no es el
//      que se revisó. UBL 2.5 es la "última versión aprobada" a la que remiten
//      las rutas de los Anexos I y II de la Orden HAC/1028/2026.
//   2. Esquema: cada muestra de factura (test/helpers/spfe-samples.ts) y cada
//      mensaje de estado (cobro, impago, sus cancelaciones y la baja) contra
//      UBL-Invoice-2.5.xsd y UBL-ApplicationResponse-2.5.xsd con xmllint.
//   3. Lo que el Anexo I fija literalmente: BT-23 y BT-24, el indicador de
//      copia, el tipo de factura (L1), la rectificativa (L2.A y L2.B), la clave
//      de régimen de cada línea con su impuesto (L3A/L3B/L3C), el NIF con
//      TaxScheme LOC y schemeID FC, y que lo que no entra en la SPFE falla
//      cerrado con su motivo.
//   4. Honestidad del riel: mientras queden PENDIENTES_AEAT (WSDL, schematron,
//      calificadores, retenciones, cabeceras, entorno de pruebas) no hay
//      transporte y el riel dice "Próximamente" aunque el interruptor esté
//      encendido.
//
// Y controles NEGATIVOS que xmllint debe rechazar: un elemento fuera de orden,
// un elemento inventado, un ApplicationResponse sin remitente, y la ruta
// literal del mensaje de anulación del Anexo I (cac:DocumentReference dentro
// de cac:Response), que no existe en UBL 2.5. Sin ellos, un xmllint mal
// invocado "pasaría" todo y el check no probaría nada.
//
// Lo que NO puede validar (no está publicado a 9-10-2026): el schematron de la
// EN 16931:2026 y de la AEAT, el XSD de sus extensiones y el WSDL del servicio.
//
// Se corre con Node plano: --experimental-strip-types y el gancho
// scripts/lib/ts-resolve.mjs (los módulos de src/ importan sin extensión).

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIX = join(ROOT, 'scripts/fixtures/ubl25');
const XSD_INVOICE = join(FIX, 'xsdrt/maindoc/UBL-Invoice-2.5.xsd');
const XSD_RESPONSE = join(FIX, 'xsdrt/maindoc/UBL-ApplicationResponse-2.5.xsd');
/** SHA-256 de SHA256SUMS: las 18 líneas del manifiesto de OASIS que fijan los XSD. */
const SHA256SUMS_SHA = 'bb49998950b848179b37ae1263345f9338854d7503ff1a55d2948b46fb6d17f5';

const { SPFE_SAMPLES, SPFE_FUERA } = await import('../test/helpers/spfe-samples.ts');
const { assessSpfe, claveCodigo } = await import('../src/lib/fiscal/spfe/factura.ts');
const { mensajeEstadoEmisor, mensajeBaja, estadoCobroDeseado, estadoComunicado, siguienteMensajeEstado } = await import('../src/lib/fiscal/spfe/estados.ts');
const normativa = await import('../src/lib/fiscal/spfe/normativa.ts');
const transporte = await import('../src/lib/fiscal/spfe/transporte.ts');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// ── 1. Artefactos fijados ────────────────────────────────────────────────────
const sums = readFileSync(join(FIX, 'SHA256SUMS'));
ok(sha256(sums) === SHA256SUMS_SHA, 'scripts/fixtures/ubl25/SHA256SUMS cambió: vuelve a copiarlo del manifiesto de OASIS UBL 2.5 y revisa los XSD');
const lineas = sums.toString('utf8').trim().split('\n');
ok(lineas.length === 18, `SHA256SUMS debe fijar 18 XSD (hay ${lineas.length})`);
for (const linea of lineas) {
    const [hash, ruta] = linea.split(/\s+/);
    ok(sha256(readFileSync(join(FIX, ruta))) === hash, `${ruta}: el SHA-256 no coincide con el manifiesto de OASIS`);
}

// ── 3 y 4. Lo que fija el Anexo I y la honestidad del riel (sin xmllint) ─────
ok(normativa.SPFE_PROCESO === 'urn:aeat:names:specification:ubl:schema:profile:B2B', 'BT-23 literal del Anexo I');
ok(normativa.SPFE_ESPECIFICACION === 'urn:cen.eu:en16931:2026#conformant#urn:aeat.es:spfe:1.0.0:extended', 'BT-24 literal del Anexo I');
ok(JSON.stringify(normativa.SPFE_PLAZOS) === JSON.stringify({
    ordenEnVigor: '2026-10-06', granEmpresa: '2027-10-06', resto: '2028-10-06', estadosPersonasFisicas: '2029-10-06', plataformasPrivadas: '2027-10-06',
}), 'plazos de la disposición final cuarta y la transitoria tercera del RD 238/2026');
ok(!normativa.SPFE_CATEGORIAS.includes('K'), 'L4 no incluye K (entrega intracomunitaria)');
ok(normativa.PENDIENTES_AEAT.length > 0 ? transporte.transporteDisponible() === false : true, 'con puntos pendientes no hay transporte');
ok(transporte.transporteAeat('pruebas', { key: '', cert: '' }) === null, 'el adaptador real no existe hasta que la AEAT publique el WSDL');
process.env.SPFE_ENABLED = 'true';
ok(transporte.spfeEstadoRiel().estado === 'proximamente', 'encender el interruptor no activa un riel sin transporte');
process.env.SPFE_ENTORNO = 'sandbox';
ok(transporte.spfeEstadoRiel().estado === 'proximamente', 'un entorno desconocido apaga el riel');
delete process.env.SPFE_ENABLED;
delete process.env.SPFE_ENTORNO;

const facturas = [];
for (const s of SPFE_SAMPLES) {
    const a = assessSpfe(s.source);
    ok(a.xml && a.problems.length === 0, `${s.id}: debe generarse (${a.problems.map((p) => p.code).join(', ')})`);
    const x = a.xml;
    ok(x.includes(`<cbc:CustomizationID>${normativa.SPFE_ESPECIFICACION}</cbc:CustomizationID><cbc:ProfileID>${normativa.SPFE_PROCESO}</cbc:ProfileID>`), `${s.id}: BT-24 y BT-23`);
    ok(x.includes('<cbc:CopyIndicator>false</cbc:CopyIndicator>'), `${s.id}: original, no copia fiel`);
    ok(x.includes(`<cbc:InvoiceTypeCode>${s.tipo}</cbc:InvoiceTypeCode>`), `${s.id}: tipo ${s.tipo} (L1)`);
    const lineasXml = x.split('<cac:InvoiceLine>').length - 1;
    const regi = [...x.matchAll(/<cac:AdditionalItemProperty><cbc:Name>REGI<\/cbc:Name><cbc:Value>(\d\d)<\/cbc:Value><cbc:ValueQualifier>(IVA|IGIC|IPSI)<\/cbc:ValueQualifier><\/cac:AdditionalItemProperty>/g)];
    ok(regi.length === lineasXml && lineasXml > 0, `${s.id}: una clave de régimen REGI por línea (BG-32, 1..2)`);
    for (const [, clave, imp] of regi) {
        ok(imp === s.impuesto, `${s.id}: BT-ES-24 = ${s.impuesto}`);
        ok(normativa.SPFE_CLAVES_REGIMEN[imp].includes(clave), `${s.id}: clave ${clave} en la lista de ${imp}`);
    }
    ok(/<cac:AccountingCustomerParty><cac:Party>.*?<cac:PartyTaxScheme><cbc:CompanyID schemeID="FC">[0-9A-Z]{9}<\/cbc:CompanyID><cac:TaxScheme><cbc:ID>LOC<\/cbc:ID><\/cac:TaxScheme><\/cac:PartyTaxScheme>/.test(x), `${s.id}: NIF del cliente como BT-47 (LOC, FC)`);
    ok(/<cac:AccountingSupplierParty>.*?<cbc:CompanyID schemeID="FC">[0-9A-Z]{9}<\/cbc:CompanyID><cac:TaxScheme><cbc:ID>LOC<\/cbc:ID>.*?<cac:PartyLegalEntity><cbc:RegistrationName>[^<]+<\/cbc:RegistrationName><cbc:CompanyID>[0-9A-Z]{9}<\/cbc:CompanyID>/.test(x), `${s.id}: NIF del vendedor como BT-32 (LOC, FC) con BT-30`);
    for (const [, cat] of x.matchAll(/<cac:ClassifiedTaxCategory><cbc:ID>([A-Z]+)<\/cbc:ID>/g)) ok(normativa.SPFE_CATEGORIAS.includes(cat), `${s.id}: categoría ${cat} en L4`);
    if (s.tipo === '384') {
        ok(x.includes('<cbc:ID>RECT:TIPO</cbc:ID><cbc:DocumentTypeCode>R1</cbc:DocumentTypeCode>'), `${s.id}: RECT:TIPO R1 (L2.A)`);
        ok(x.includes('<cbc:ID>RECT:MODALIDAD</cbc:ID><cbc:DocumentTypeCode>I</cbc:DocumentTypeCode>'), `${s.id}: RECT:MODALIDAD I (L2.B)`);
        ok(/<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>[^<]+<\/cbc:ID><cbc:IssueDate>\d{4}-\d{2}-\d{2}<\/cbc:IssueDate>/.test(x), `${s.id}: factura rectificada (BT-25, BT-26)`);
        ok(/<cbc:PayableAmount currencyID="EUR">-\d/.test(x), `${s.id}: por diferencias, en negativo`);
    }
    if (s.source.pagadaEl) {
        ok(x.includes(`<cac:PrepaidPayment><cbc:PaidDate>${s.source.pagadaEl}</cbc:PaidDate></cac:PrepaidPayment>`), `${s.id}: BT-ES-2 en cac:PrepaidPayment/cbc:PaidDate`);
        ok(/<cbc:PayableAmount currencyID="EUR">0\.00<\/cbc:PayableAmount>/.test(x), `${s.id}: pagada en su totalidad, total a pagar cero (BT-115)`);
    }
    if (s.source.currency && s.source.currency !== 'EUR') {
        ok(x.includes('<cbc:TaxCurrencyCode>EUR</cbc:TaxCurrencyCode>') && /<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">/.test(x), `${s.id}: BT-6 = EUR y BT-111`);
    }
    if (s.source.qrUrl) ok(x.includes('<cbc:ID>QR</cbc:ID><cbc:UUID>') && x.includes('<cbc:DocumentDescription>VERIFACTU</cbc:DocumentDescription>'), `${s.id}: QR fiscal (BG-24)`);
    facturas.push({ id: s.id, xml: x, codigo: a.codigo, resumen: a.resumen });
}
for (const f of SPFE_FUERA) {
    const a = assessSpfe(f.source);
    ok(a.xml === null && a.problems.some((p) => p.code === f.problema), `${f.id}: debe fallar cerrado con ${f.problema} (dio ${a.problems.map((p) => p.code).join(', ')})`);
    for (const p of a.problems) ok(p.es && p.en && !/SPFE_|_ENABLED|xmllint|WSDL/.test(p.es + p.en), `${f.id}: ${p.code} con texto es/en apto para el negocio (regla 14)`);
}

// La derivación del cobro (estados.ts): sin parciales, cancelación antes de corregir.
const pagada = { lifecycle: 'paid', amountPaid: 100, amountRefunded: 0, vencimiento: '2026-11-07', esRectificativa: false };
ok(estadoCobroDeseado({ ...pagada, lifecycle: 'open', amountPaid: 50 }, ['2026-10-10']).tipo === 'sin_estado', 'un abono parcial no se comunica');
ok(JSON.stringify(siguienteMensajeEstado(estadoCobroDeseado(pagada, ['2026-10-09', '2026-10-12']), { tipo: 'sin_estado' }, '2026-11-07')) === JSON.stringify({ tipo: 'cobro', datos: { fechaCobro: '2026-10-12', vencimiento: '2026-11-07' } }), 'el cobro se comunica con la fecha del último pago');
ok(siguienteMensajeEstado({ tipo: 'cobrada', fecha: '2026-10-13' }, estadoComunicado(null, [{ tipo: 'cobro', estado: 'admitido', datos: { fechaCobro: '2026-10-12' } }]))?.tipo === 'anula_cobro', 'una fecha distinta primero cancela el cobro anterior');
ok(siguienteMensajeEstado({ tipo: 'cobrada', fecha: '2026-10-08' }, estadoComunicado('2026-10-08', [])) === null, 'el pago declarado en la factura (BT-ES-2) no se vuelve a comunicar');

// ── 2. Esquema (xmllint) ─────────────────────────────────────────────────────
let xmllint = true;
try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
if (!xmllint) {
    if (process.env.SPFE_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y SPFE_XSD_REQUIRED=1');
    process.stdout.write('security:spfe: AVISO — xmllint no está instalado; se omite la validación contra el XSD de UBL 2.5.\n');
} else {
    const dir = mkdtempSync(join(tmpdir(), 'spfe-check-'));
    const validar = (nombre, xml, xsd) => {
        const file = join(dir, `${nombre}.xml`);
        writeFileSync(file, xml);
        try {
            execFileSync('xmllint', ['--noout', '--nonet', '--schema', xsd, file], { stdio: 'pipe' });
            return null;
        } catch (error) {
            return String(error.stderr || error.message);
        }
    };
    try {
        for (const f of facturas) {
            const err = validar(f.id, f.xml, XSD_INVOICE);
            ok(err === null, `${f.id}: no valida contra UBL-Invoice-2.5.xsd\n${err}`);
        }
        const f = facturas[0];
        const factura = { ...f.codigo, nombreEmisor: f.resumen.nombreEmisor };
        const cabecera = { id: '00000000-0000-4000-8000-000000000001', fecha: '2026-10-20' };
        const mensajes = {
            SETTLEMENT: mensajeEstadoEmisor({ codigo: 'SETTLEMENT', factura, cabecera, fechaCobro: '2026-10-15', vencimiento: '2026-11-07' }),
            CANCELSETTLEMENT: mensajeEstadoEmisor({ codigo: 'CANCELSETTLEMENT', factura, cabecera }),
            DEFAULT: mensajeEstadoEmisor({ codigo: 'DEFAULT', factura, cabecera, vencimiento: '2026-11-07' }),
            CANCELDEFAULT: mensajeEstadoEmisor({ codigo: 'CANCELDEFAULT', factura, cabecera }),
            CANCELINVOICE: mensajeBaja({ factura, cabecera, fechaBaja: '2026-10-20' }),
        };
        for (const [codigo, xml] of Object.entries(mensajes)) {
            ok(xml.includes(`<cbc:ResponseCode>${codigo}</cbc:ResponseCode>`), `${codigo}: código del Anexo II`);
            ok(xml.includes(`<cac:DocumentReference><cbc:ID>${f.codigo.numero}</cbc:ID><cbc:IssueDate>${f.codigo.fecha}</cbc:IssueDate><cac:IssuerParty>`), `${codigo}: factura informada (número, fecha, emisor)`);
            const err = validar(`msg-${codigo}`, xml, XSD_RESPONSE);
            ok(err === null, `${codigo}: no valida contra UBL-ApplicationResponse-2.5.xsd\n${err}`);
        }
        ok(mensajes.SETTLEMENT.includes('<cbc:EffectiveDate>2026-10-15</cbc:EffectiveDate><cac:Status><cbc:ReferenceDate>2026-11-07</cbc:ReferenceDate><cac:Condition><cbc:AttributeID>DueDate</cbc:AttributeID></cac:Condition></cac:Status>'), 'SETTLEMENT: fecha del cobro y vencimiento (DueDate)');
        ok(mensajes.DEFAULT.includes('<cbc:EffectiveDate>2026-11-07</cbc:EffectiveDate>'), 'DEFAULT: el vencimiento del pago en EffectiveDate');

        // Controles negativos: si xmllint no los rechaza, no está validando.
        const neg = (nombre, xml, xsd) => ok(validar(`neg-${nombre}`, xml, xsd) !== null, `control negativo "${nombre}": xmllint debió rechazarlo`);
        neg('orden', f.xml.replace('<cbc:CopyIndicator>false</cbc:CopyIndicator><cbc:IssueDate>', '<cbc:IssueDate>').replace('</cbc:IssueDate>', '</cbc:IssueDate><cbc:CopyIndicator>false</cbc:CopyIndicator>'), XSD_INVOICE);
        neg('inventado', f.xml.replace('<cbc:CopyIndicator>', '<cbc:CodigoUnico>X</cbc:CodigoUnico><cbc:CopyIndicator>'), XSD_INVOICE);
        neg('sin-remitente', mensajes.SETTLEMENT.replace(/<cac:SenderParty>.*?<\/cac:SenderParty>/, ''), XSD_RESPONSE);
        // La ruta literal del Anexo I para la anulación (cac:Response/cac:DocumentReference)
        // no existe en UBL 2.5: por eso Cord usa la forma del Anexo II.
        neg('ruta-anexo-i', mensajes.CANCELINVOICE.replace('</cbc:EffectiveDate></cac:Response>', `</cbc:EffectiveDate><cac:DocumentReference><cbc:ID>${f.codigo.numero}</cbc:ID></cac:DocumentReference></cac:Response>`), XSD_RESPONSE);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

ok(claveCodigo({ nifEmisor: 'B28003218', numero: 'A-1', fecha: '2026-10-08' }) === 'B28003218|A-1|2026-10-08', 'llave del código único (art. 6)');
console.log(`security:spfe OK — ${checks} comprobaciones (${SPFE_SAMPLES.length} facturas y 5 mensajes contra UBL 2.5${xmllint ? '' : ', sin xmllint'}; ${normativa.PENDIENTES_AEAT.length} puntos pendientes de la AEAT, riel en "Próximamente")`);
