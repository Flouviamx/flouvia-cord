// Contrato de la factura electrónica con el SII (Chile) — corre en
// `npm run test:payments` (security:sii). Sin red: todo contra fuentes
// oficiales vendorizadas en scripts/fixtures/sii/.
//
// Capas, de la más dura a la más blanda:
//
//   1. Ejemplo oficial F60T33 (schema_dte.zip de www.sii.cl): el timbre (DD
//      aplanado) se reproduce byte a byte y su FRMT verifica con la llave del
//      CAF del ejemplo; el DigestValue del <Documento> se reproduce
//      canonicalizándolo SUELTO (sin espacios de nombres) y el del <SetDTE> en
//      el contexto del sobre (xmlns + xmlns:xsi). Es la evidencia de la
//      convención de firma del SII que sigue envio.ts. El RUT del firmante sale
//      del certificado del ejemplo.
//   2. Esquema: envíos que Cord sabe armar (factura 33 con exento y
//      descuento, exenta 34, nota de crédito 61, sobre de intercambio al
//      cliente) se validan con xmllint contra EnvioDTE_v10.xsd / DTE_v10.xsd
//      (actualización 06/02/2026). Controles negativos prueban que valida.
//      Sin xmllint se avisa y se omite (SII_XSD_REQUIRED=1 la vuelve obligatoria).
//   3. Firmas: cada firma (DTE, SetDTE, semilla) verifica con la verificación
//      propia y, si hay JDK, con javax.xml.crypto (scripts/sii-firmas.java),
//      un verificador independiente. El timbre de cada DTE verifica con la
//      llave pública del CAF; el PDF417 del timbre tiene síndromes nulos y
//      cabe en las medidas del SII.
//   4. Transporte: endpoints, espacio de nombres SOAP y parámetros (en orden)
//      de cada operación iguales a los de los WSDL oficiales de maullin
//      (certificación) y palena (producción).
//   5. Reglas: CLP enteros, IVA 19 % del neto, retención de honorarios
//      rechazada antes de enviar, boleta y exportación dichas, receptor
//      completo, CAF (RUT, tipo, llaves, vigencia de seis meses).
//   6. Respuestas reales del SII (fixtures de certificación): semilla, token
//      con firma válida de un certificado no registrado (10) frente a firma
//      alterada (11), consultas sin token, upload sin autenticar.
//   7. Certificación (ronda 3): nota de débito 56 (CodRef 3 y 1); el set de
//      pruebas leído del archivo del SII (ISO-8859-1, CRLF) y armado en un
//      envío con la línea SET/CASO, descuentos por línea y global y notas de
//      monto cero, validado contra EnvioDTE_v10.xsd; la recepción de un envío
//      de proveedor (firma, RUT, DTD, CRLF) y las tres respuestas
//      (RespuestaDTE de recepción y de resultado, EnvioRecibos) contra
//      RespuestaEnvioDTE_v10.xsd y EnvioRecibos_v10.xsd de www.sii.cl, con
//      controles negativos y verificación de firmas en la JDK; el registro de
//      reclamos contra sus WSDL de ws2 (certificación) y ws1 (producción).
//   8. Libros del set (ronda 4): el set de libro de compras leído del archivo
//      del SII (observación → IVA recuperable, de uso común, no recuperable o
//      retenido) y los dos libros armados con la aritmética del formato IECV
//      v3.0, validados contra LibroCV_v10.xsd (schema_iecv.zip de www.sii.cl)
//      con xmllint y con la JDK, con controles negativos, y sus firmas
//      verificadas en la JDK. xmllint no representa una faceta decimal de 34
//      dígitos de LceSiiTypes_v10.xsd (tipo de los libros contables, que el
//      libro de compras y ventas no usa): se valida con una copia temporal
//      que recorta SOLO esa faceta; la JDK valida contra el esquema intacto.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { cafDePrueba, llavesCaf } from './fixtures/sii/caf-prueba.mjs';
import { c14n, buscar, parsearFragmento, serializar, aplanar, textoDe } from '../src/lib/fiscal/latam/sii/xml.ts';
import { ddAplanado, nodoDD, verificarDD } from '../src/lib/fiscal/latam/sii/ted.ts';
import { digestSha1, verificarFirma } from '../src/lib/fiscal/latam/sii/firma.ts';
import { armarEnvio, archivoDte, semillaFirmada, DECLARACION_XML } from '../src/lib/fiscal/latam/sii/envio.ts';
import { armarBorrador, numeroDocumento } from '../src/lib/fiscal/latam/sii/dte.ts';
import { emitirDocumento } from '../src/lib/fiscal/latam/sii/emision.ts';
import { cafVigente, parsearCaf, venceCaf } from '../src/lib/fiscal/latam/sii/caf.ts';
import { codificarPdf417, evaluar, medidasTimbre } from '../src/lib/fiscal/latam/sii/pdf417.ts';
import { rutDelCertificado } from '../src/lib/fiscal/latam/sii/certificado.ts';
import { DECLARACION_RECIBO, NS_SII_DTE, NS_WS_RECLAMO, NS_WS_SII, NS_XSI, RUT_SII, siiEndpoints, siiReclamoEndpoint } from '../src/lib/fiscal/latam/sii/constantes.ts';
import { armarDocumentosDelSet, codRefDeCaso, parsearSetDePruebas } from '../src/lib/fiscal/latam/sii/set-pruebas.ts';
import { armarLibro, detalleCompra, detalleVenta, resumenPeriodo } from '../src/lib/fiscal/latam/sii/iecv.ts';
import { envioRecibos, leerEnvioRecibido, respuestaRecepcion, respuestaResultado, verificarFirmaRecibida } from '../src/lib/fiscal/latam/sii/respuesta-intercambio.ts';
import { mensajeReclamo, parsearRespuestaReclamo, sobreReclamo } from '../src/lib/fiscal/latam/sii/reclamo.ts';
import { representacionSii } from '../src/lib/fiscal/latam/sii/representacion.ts';
import { fechaHoraChile, rutValido } from '../src/lib/fiscal/latam/sii/texto.ts';
import {
    ESTADOS_TOKEN, parsearRecepcion, parsearRespuesta, sobreEstadoDte, sobreEstadoEnvio, sobreSemilla, sobreToken,
} from '../src/lib/fiscal/latam/sii/ws.ts';
import { faseDte, faseEnvio, mensajeToken, mensajeUpload, tokenTransitorio } from '../src/lib/fiscal/latam/sii/errores.ts';
import { RailDatosError } from '../src/lib/fiscal/latam/errores.ts';
import { calculateDocumentTotals } from '../packages/elements/src/engine.ts';
import { taxRoundingFor } from '../src/lib/countries.ts';

const FIX = fileURLToPath(new URL('./fixtures/sii/', import.meta.url));
const leer = (f, enc = 'utf8') => readFileSync(join(FIX, f), enc);
const NS_ENVIO = { '': NS_SII_DTE, xsi: NS_XSI };

// ── 1. Ejemplo oficial F60T33 ────────────────────────────────────────────────
const ejemplo = leer('ejemplo-F60T33.xml', 'latin1').replace(/\r\n/g, '\n');
const certPemDe = (firma) => `-----BEGIN CERTIFICATE-----\n${textoDe(buscar(firma, 'X509Certificate')).replace(/\s+/g, '')}\n-----END CERTIFICATE-----\n`;
{
    const env = parsearFragmento(ejemplo);
    const dte = buscar(env, 'DTE');
    const dd = buscar(dte, 'DD');
    const ddOficial = serializar(aplanar(dd));
    const campos = Object.fromEntries((dd.c ?? []).filter((h) => h.n && h.n !== 'CAF').map((h) => [h.n, textoDe(h)]));
    const caf = serializar(aplanar(buscar(dd, 'CAF')));
    const propio = ddAplanado(nodoDD({
        rutEmisor: campos.RE, tipo: Number(campos.TD), folio: Number(campos.F), fechaEmision: campos.FE, rutReceptor: campos.RR,
        razonSocialReceptor: campos.RSR, montoTotal: Number(campos.MNT), primerItem: campos.IT1, cafXml: caf, timestamp: campos.TSTED,
    }));
    assert.equal(propio, ddOficial, 'el DD aplanado del ejemplo oficial se reproduce byte a byte');
    assert.match(campos.RSR, / {2}/, 'el ejemplo conserva el doble espacio de "EMPRESA  LTDA" (campo() no colapsa espacios internos)');
    const da = buscar(dd, 'DA');
    const frmt = textoDe(buscar(buscar(dte, 'TED'), 'FRMT'));
    assert.ok(verificarDD(propio, frmt, textoDe(buscar(da, 'M')), textoDe(buscar(da, 'E'))), 'el FRMT oficial verifica con la llave pública del CAF del ejemplo');

    const firmaDte = (dte.c ?? []).find((h) => h.n === 'Signature');
    const documento = buscar(dte, 'Documento');
    const dvDte = textoDe(buscar(firmaDte, 'DigestValue'));
    assert.equal(dvDte, 'hlmQtu/AyjUjTDhM3852wvRCr8w=', 'DigestValue del Documento del ejemplo');
    assert.equal(digestSha1(c14n(documento, {})), dvDte, 'el Documento se canonicaliza SUELTO: así reproduce el digest oficial');
    assert.notEqual(digestSha1(c14n(documento, NS_ENVIO)), dvDte, 'en el contexto del sobre el digest sería otro');
    const set = buscar(env, 'SetDTE');
    const firmaSet = (env.c ?? []).find((h) => h.n === 'Signature');
    assert.equal(digestSha1(c14n(set, NS_ENVIO)), textoDe(buscar(firmaSet, 'DigestValue')), 'el SetDTE se canonicaliza con xmlns y xmlns:xsi del sobre');
    // El SignatureValue del ejemplo no verifica: el SII reindentó el archivo
    // después de firmarlo (los digest de arriba sí cuadran). La verificación
    // de valores corre sobre los documentos que arma Cord (capa 3).
    assert.equal(rutDelCertificado(certPemDe(firmaDte)), '7880442-4', 'RUT del titular en el subjectAltName (OID 1.3.6.1.4.1.8321.1)');
}

// ── Datos de prueba ──────────────────────────────────────────────────────────
const RUT_EMISOR = '76123456-0';
const RUT_FIRMANTE = '11111111-1';
const RUT_CLIENTE = '77777777-7';
assert.equal(rutValido('76.123.456-0'), RUT_EMISOR);
assert.equal(rutValido('07880442-4'), '7880442-4', 'los ceros a la izquierda no forman parte del RUT');
assert.equal(rutValido('76123456-1'), null, 'dígito verificador');
assert.equal(rutValido('60803000-k'), RUT_SII);

function certificadoDePrueba() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' });
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '0a';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 30 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'FIRMANTE DE PRUEBA' }]);
    cert.setIssuer([{ name: 'commonName', value: 'FIRMANTE DE PRUEBA' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}
const clave = certificadoDePrueba();
const emisor = {
    rut: RUT_EMISOR, razonSocial: 'Empresa de Prueba SpA', giro: 'Servicios de consultoría informática', acteco: [620200],
    direccion: 'Av. Providencia 1234, of. 56', comuna: 'Providencia', ciudad: 'Santiago',
};
const receptor = { rut: RUT_CLIENTE, razonSocial: "Cliente D'Ángelo & Cía. Ltda.", giro: 'Comercio al por menor', direccion: 'San Diego 2222', comuna: 'La Florida', ciudad: 'Santiago', pais: 'CL' };
const caratula = { rutEmisor: RUT_EMISOR, rutEnvia: RUT_FIRMANTE, resolucion: { numero: 0, fecha: '2026-10-01' } };
const ahora = new Date('2026-10-09T15:00:00Z');
const llaves = llavesCaf();
const cafs = Object.fromEntries([33, 34, 61].map((tipo) => [tipo, parsearCaf(cafDePrueba({ rut: RUT_EMISOR, tipo, desde: 1, hasta: 50, llaves }).bytes, RUT_EMISOR)]));
const folio = (tipo, n) => ({ folio: n, cafXml: cafs[tipo].cafXml, llavePrivadaPem: cafs[tipo].llavePrivadaPem, tipo, desde: 1, hasta: 50, fechaAutorizacion: '2026-10-01' });

const linea = (o) => ({ description: 'Concepto', quantity: 1, unitPrice: 0, taxRate: 0.19, subtotal: 0, taxAmount: 0, total: 0, ...o });
const b33 = armarBorrador({
    emisor, receptor, fechaEmision: '2026-10-09', vencimiento: '2026-11-08', servicio: { desde: '2026-10-01', hasta: '2026-10-31' },
    lineas: [
        linea({ description: 'Servicio de "consultoría" & soporte técnico — octubre', quantity: 2, unitPrice: 50000, subtotal: 90000, taxAmount: 17100, total: 107100, discount: 10000 }),
        linea({ description: 'Libro (exento)', quantity: 1, unitPrice: 15000, taxRate: 0, subtotal: 15000, taxAmount: 0, total: 15000 }),
    ],
    totales: { subtotal: 105000, taxes: 17100, total: 122100, currency: 'CLP', discountTotal: 10000 },
});
assert.deepEqual([b33.tipo, b33.neto, b33.exento, b33.iva, b33.total, b33.descuento, b33.formaPago], [33, 90000, 15000, 17100, 122100, 10000, 2]);
assert.deepEqual(b33.lineas.map((l) => [l.monto, l.descuento, l.exento, l.cantidad, l.precio]), [[90000, 10000, false, '2', '50000'], [15000, 0, true, '1', '15000']]);
const b34 = armarBorrador({
    emisor, receptor, fechaEmision: '2026-10-09',
    lineas: [linea({ description: 'Curso de capacitación', quantity: 3, unitPrice: 40000, taxRate: 0, subtotal: 120000, total: 120000 })],
    totales: { subtotal: 120000, taxes: 0, total: 120000, currency: 'CLP' },
});
assert.deepEqual([b34.tipo, b34.neto, b34.exento, b34.iva, b34.total, b34.formaPago], [34, 0, 120000, 0, 120000, 1]);
const d33 = emitirDocumento(b33, folio(33, 7), clave, caratula, ahora);
const d34 = emitirDocumento(b34, folio(34, 3), clave, caratula, ahora);
const b61 = armarBorrador({
    emisor, receptor: {}, fechaEmision: '2026-10-10', motivo: 'Descuento comercial posterior',
    notaCreditoDe: { tipo: 33, folio: 7, fechaEmision: '2026-10-09', total: b33.total, receptor: b33.receptor },
    lineas: [linea({ description: 'Ajuste de precio', quantity: 1, unitPrice: 10000, subtotal: 10000, taxAmount: 1900, total: 11900 })],
    totales: { subtotal: 10000, taxes: 1900, total: 11900, currency: 'CLP' },
});
assert.deepEqual([b61.tipo, b61.referencias?.[0]?.codigo, b61.referencias?.[0]?.folio, b61.receptor.rut], [61, 3, 7, RUT_CLIENTE], 'la nota corrige montos (CodRef 3) del folio 7 con el receptor de la factura');
const d61 = emitirDocumento(b61, folio(61, 1), clave, caratula, new Date('2026-10-10T15:00:00Z'));
assert.equal(numeroDocumento(33, 7, false), 'FE-7');
assert.equal(numeroDocumento(61, 1, true), 'C-NC-1', 'certificación se distingue en el número');

// Sobre de intercambio al cliente: el DTE guardado, releído y reenvuelto.
const dteReleido = parsearFragmento(d33.dteXml);
assert.equal(archivoDte(dteReleido), d33.dteXml, 'el DTE guardado se relee y se reescribe byte a byte (el intercambio no lo altera)');
const intercambio = armarEnvio([{ tipo: 33, nodo: dteReleido }], { ...caratula, rutReceptor: RUT_CLIENTE }, ahora, clave);
assert.match(intercambio, new RegExp(`<RutReceptor>${RUT_CLIENTE}</RutReceptor>`));
const semilla = semillaFirmada('169228255418', clave);

for (const d of [d33, d34, d61]) {
    const lineas = d.envioXml.split('\n');
    assert.equal(lineas[0], DECLARACION_XML, 'primera línea: la codificación');
    assert.match(lineas[1], /^<EnvioDTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" xmlns:xsi="[^"]+" xsi:schemaLocation="http:\/\/www\.sii\.cl\/SiiDte EnvioDTE_v10\.xsd" version="1\.0">$/, 'segunda línea: el schemaLocation (A 3.1)');
    assert.match(d.dteXml.split('\n')[1], /^<DTE version="1\.0">$/, 'el DTE suelto va sin xmlns (convención del SII)');
    assert.doesNotThrow(() => Buffer.from(d.envioXml, 'latin1'), 'ISO-8859-1');
    assert.ok(![...d.envioXml].some((ch) => ch.charCodeAt(0) > 0xff), 'nada fuera de ISO-8859-1');
}
assert.match(d33.envioXml, /Servicio de &quot;consultor\xeda&quot; &amp; soporte t\xe9cnico - octubre/, 'escape con las cinco entidades y raya convertida a ISO-8859-1');

// ── 2. Esquema: xmllint contra los XSD oficiales ─────────────────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (!xmllint) {
        if (process.env.SII_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y SII_XSD_REQUIRED=1');
        process.stdout.write('security:sii: AVISO — xmllint no está instalado; se omite la validación contra los esquemas oficiales.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'sii-xsd-'));
        try {
            const valida = (texto, xsd, nombre) => {
                const f = join(dir, nombre);
                writeFileSync(f, Buffer.from(texto, 'latin1'));
                execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(FIX, xsd), f], { stdio: 'pipe' });
            };
            const ok = (texto, xsd, nombre) => {
                try { valida(texto, xsd, nombre); } catch (e) { throw new Error(`${nombre} no valida contra ${xsd}:\n${e.stderr?.toString() ?? e}`); }
            };
            for (const [n, d] of [['33', d33], ['34', d34], ['61', d61]]) {
                ok(d.envioXml, 'EnvioDTE_v10.xsd', `envio-${n}.xml`);
                // El DTE suelto valida en el espacio de nombres del esquema.
                ok(d.dteXml.replace('<DTE version="1.0">', `<DTE xmlns="${NS_SII_DTE}" version="1.0">`), 'DTE_v10.xsd', `dte-${n}.xml`);
            }
            ok(intercambio, 'EnvioDTE_v10.xsd', 'intercambio.xml');
            ok(ejemplo, 'EnvioDTE_v10.xsd', 'ejemplo-oficial.xml');
            // Controles negativos: prueban que xmllint valida de verdad.
            assert.throws(() => valida(d33.envioXml.replace(/<TipoDTE>33<\/TipoDTE>/, '<TipoDTE>39</TipoDTE>'), 'EnvioDTE_v10.xsd', 'neg-tipo.xml'), 'la boleta (39) no es un DTE de este esquema');
            assert.throws(() => valida(d33.envioXml.replace(/(<Folio>7<\/Folio>\n)(<FchEmis>[^<]+<\/FchEmis>\n)/, '$2$1'), 'EnvioDTE_v10.xsd', 'neg-orden.xml'), 'un elemento fuera de orden');
            assert.throws(() => valida(d33.envioXml.replace('<MntNeto>90000</MntNeto>', '<MntNeto>90000.5</MntNeto>'), 'EnvioDTE_v10.xsd', 'neg-decimal.xml'), 'montos enteros');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 3. Firmas, timbre y PDF417 ───────────────────────────────────────────────
{
    const verificaDte = (archivo) => {
        const dte = parsearFragmento(archivo);
        const firma = (dte.c ?? []).find((h) => h.n === 'Signature');
        return verificarFirma(c14n(buscar(dte, 'Documento'), {}), firma, {}, clave.certPem);
    };
    const verificaSet = (archivo) => {
        const env = parsearFragmento(archivo);
        const firma = (env.c ?? []).find((h) => h.n === 'Signature');
        return verificarFirma(c14n(buscar(env, 'SetDTE'), NS_ENVIO), firma, NS_ENVIO, clave.certPem);
    };
    for (const d of [d33, d34, d61]) {
        assert.deepEqual(verificaDte(d.dteXml), { digest: true, valor: true }, `firma del DTE ${d.id}`);
        assert.deepEqual(verificaSet(d.envioXml), { digest: true, valor: true }, `firma del SetDTE con ${d.id}`);
        const dte = parsearFragmento(d.dteXml);
        const da = buscar(dte, 'DA');
        const dd = serializar(aplanar(buscar(dte, 'DD')));
        assert.ok(verificarDD(dd, textoDe(buscar(dte, 'FRMT')), textoDe(buscar(da, 'M')), textoDe(buscar(da, 'E'))), `timbre de ${d.id} con la llave del CAF`);
        assert.equal(serializar(aplanar(buscar(dte, 'TED'))), d.timbre, 'el PDF417 lleva el TED aplanado que viaja en el DTE');
        const bytes = Buffer.from(d.timbre, 'latin1');
        const m = medidasTimbre(bytes);
        const s = codificarPdf417(bytes, m.columnas);
        let r = 1;
        for (let i = 1; i <= 64; i++) { r = (r * 3) % 929; assert.equal(evaluar(s.palabras, r), 0, `síndrome ${i} del PDF417 (nivel 5)`); }
        const anchoMm = (17 * m.columnas + 69) * m.moduloMm;
        const altoMm = s.filas.length * m.altoFilaMm;
        assert.ok(m.moduloMm >= 6.7 * 0.0254 - 1e-9, 'X ≥ 6,7 mils');
        assert.ok(anchoMm >= 50 - 1e-6 && anchoMm <= 90 + 1e-6, `ancho del timbre ${anchoMm} mm entre 5 y 9 cm`);
        assert.ok(altoMm >= 20 - 1e-6 && altoMm <= 40 + 1e-6, `alto del timbre ${altoMm} mm entre 2 y 4 cm`);
        assert.ok(s.filas.every((f) => f.length === 17 * m.columnas + 69));
    }
    assert.deepEqual(verificaSet(intercambio), { digest: true, valor: true }, 'firma del sobre de intercambio');
    const sem = parsearFragmento(semilla.replace(/^<\?xml[^>]*\?>/, ''));
    const firmaSem = (sem.c ?? []).find((h) => h.n === 'Signature');
    const sinFirma = { ...sem, c: (sem.c ?? []).filter((h) => h.n !== 'Signature') };
    assert.deepEqual(verificarFirma(c14n(sinFirma), firmaSem, {}, clave.certPem), { digest: true, valor: true }, 'semilla firmada (enveloped)');
    // Una alteración de un solo carácter invalida el digest.
    assert.equal(verificaDte(d33.dteXml.replace('<MntTotal>122100</MntTotal>', '<MntTotal>122101</MntTotal>')).digest, false);

    // Verificador independiente: javax.xml.crypto de la JDK.
    let java = true;
    try { execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch { java = false; }
    if (!java) {
        if (process.env.SII_JDK_REQUIRED === '1') throw new Error('java no está disponible y SII_JDK_REQUIRED=1');
        process.stdout.write('security:sii: AVISO — sin JDK; se omite la verificación independiente de firmas (javax.xml.crypto).\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'sii-firmas-'));
        try {
            const JAVA = fileURLToPath(new URL('./sii-firmas.java', import.meta.url));
            const escribir = (pares) => pares.map(([n, t]) => { const f = join(dir, n); writeFileSync(f, Buffer.from(t, 'latin1')); return f; });
            const jdk = (args) => {
                try {
                    return execFileSync('java', [JAVA, ...args], { stdio: 'pipe' }).toString();
                } catch (e) {
                    throw new Error(`la JDK no verificó alguna firma:\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
                }
            };
            // Cada DTE suelto (como se guarda y como lo firma el SII) y la semilla.
            const sueltos = jdk(escribir([['dte-33.xml', d33.dteXml], ['dte-34.xml', d34.dteXml], ['dte-61.xml', d61.dteXml], ['semilla.xml', semilla]]));
            assert.equal((sueltos.match(/valida=true/g) ?? []).length, 4, `firmas sueltas verificadas por la JDK:\n${sueltos}`);
            // La firma de cada sobre (SetDTE), en su contexto.
            const sobres = jdk(['--sobre', ...escribir([['envio-33.xml', d33.envioXml], ['envio-34.xml', d34.envioXml], ['envio-61.xml', d61.envioXml], ['intercambio.xml', intercambio]])]);
            assert.equal((sobres.match(/firma en <EnvioDTE> ref=#SetDoc valida=true/g) ?? []).length, 4, `firmas de los sobres verificadas por la JDK:\n${sobres}`);
            const alterado = join(dir, 'alterado.xml');
            writeFileSync(alterado, Buffer.from(d33.dteXml.replace('<MntTotal>122100</MntTotal>', '<MntTotal>122101</MntTotal>'), 'latin1'));
            assert.throws(() => execFileSync('java', [JAVA, alterado], { stdio: 'pipe' }), 'la JDK rechaza un DTE alterado');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 4. Transporte: WSDL oficiales ────────────────────────────────────────────
{
    const wsdl = { semilla: 'crseed', token: 'gettoken', estadoEnvio: 'queryestup', estadoDte: 'queryestdte' };
    for (const [entorno, host] of [['homologacion', 'maullin'], ['produccion', 'palena']]) {
        const ep = siiEndpoints(entorno);
        for (const [k, archivo] of Object.entries(wsdl)) {
            const w = leer(`${archivo}-${host}.wsdl`);
            assert.equal(/location="([^"]+)"/.exec(w)?.[1], ep[k], `endpoint ${k} en ${entorno}`);
            assert.ok(w.includes(`namespace="${NS_WS_SII}"`), `espacio de nombres SOAP de ${archivo}`);
            assert.ok(/soapAction=""/.test(w), 'SOAPAction vacío');
        }
        assert.equal(ep.upload, `https://${host}.sii.cl/cgi_dte/UPL/DTEUpload`);
    }
    const partes = (archivo, mensaje) => {
        const m = new RegExp(`<wsdl:message name="${mensaje}">([\\s\\S]*?)</wsdl:message>`).exec(leer(archivo))
            ?? new RegExp(`<message name="${mensaje}">([\\s\\S]*?)</message>`).exec(leer(archivo));
        return [...(m?.[1] ?? '').matchAll(/part name="([^"]+)"/g)].map((x) => x[1]);
    };
    const params = (sobre) => [...sobre.matchAll(/<([A-Za-z]+) xsi:type="xsd:string">/g)].map((x) => x[1]);
    assert.deepEqual(params(sobreSemilla()), partes('crseed-maullin.wsdl', 'getSeedRequest'));
    assert.deepEqual(params(sobreToken('<x/>')), partes('gettoken-maullin.wsdl', 'getTokenRequest'));
    assert.deepEqual(params(sobreEstadoEnvio(RUT_EMISOR, '123', 'TOK')), partes('queryestup-maullin.wsdl', 'getEstUpRequest'));
    const consulta = sobreEstadoDte({ rutConsultante: RUT_FIRMANTE, rutEmisor: RUT_EMISOR, rutReceptor: RUT_CLIENTE, tipo: 33, folio: 7, fechaEmision: '2026-10-09', monto: 122100 }, 'TOK');
    assert.deepEqual(params(consulta), partes('queryestdte-maullin.wsdl', 'getEstDteRequest'));
    assert.match(consulta, /<FechaEmisionDte xsi:type="xsd:string">09102026<\/FechaEmisionDte>/, 'fecha DDMMAAAA');
    assert.match(sobreToken('<getToken>&</getToken>'), /&lt;getToken&gt;&amp;&lt;\/getToken&gt;/, 'la semilla firmada viaja escapada');
}

// ── 5. Reglas: lo que Cord rechaza ANTES de enviar ───────────────────────────
{
    const base = {
        emisor, receptor, fechaEmision: '2026-10-09',
        lineas: [linea({ quantity: 1, unitPrice: 100000, subtotal: 100000, taxAmount: 19000, total: 119000 })],
        totales: { subtotal: 100000, taxes: 19000, total: 119000, currency: 'CLP' },
    };
    const rechaza = (cambio, patron, msg) => assert.throws(() => armarBorrador({ ...base, ...cambio }), (e) => e instanceof RailDatosError && patron.test(e.message), msg);
    assert.equal(armarBorrador(base).iva, 19000);
    rechaza({ totales: { ...base.totales, currency: 'USD' } }, /pesos chilenos/, 'otra moneda');
    rechaza({ totales: { ...base.totales, retencionTotal: 15250, retenciones: [{ monto: 15250 }] } }, /honorarios/, 'retención de honorarios');
    rechaza({ totales: { ...base.totales, taxes: 19001, total: 119001 } }, /19 %/, 'IVA distinto del 19 % del neto');
    rechaza({ totales: { ...base.totales, subtotal: 100000.5 } }, /centavos/, 'centavos');
    rechaza({ receptor: { ...receptor, rut: undefined } }, /boleta/, 'consumidor final sin RUT');
    rechaza({ receptor: { razonSocial: 'Acme Inc.', pais: 'US' } }, /exportación/, 'cliente del exterior');
    rechaza({ receptor: { ...receptor, comuna: '' } }, /comuna/i, 'receptor sin comuna');
    rechaza({ lineas: Array.from({ length: 61 }, () => base.lineas[0]) }, /60 conceptos/, 'más de 60 líneas');
    rechaza({ receptor: { ...receptor, rut: RUT_EMISOR } }, /mismo RUT/, 'el cliente no es el emisor');
    // Redondeo: IVA del documento = round(neto × 0,19).
    const tres = armarBorrador({
        ...base,
        lineas: [linea({ subtotal: 1001, taxAmount: 190, total: 1191, quantity: 1, unitPrice: 1001 }), linea({ subtotal: 1001, taxAmount: 190, total: 1191, quantity: 1, unitPrice: 1001 })],
        totales: { subtotal: 2002, taxes: 380, total: 2382, currency: 'CLP' },
    });
    assert.equal(tres.iva, 380);
    assert.throws(() => armarBorrador({
        ...base,
        lineas: [linea({ subtotal: 1003, taxAmount: 191, total: 1194, quantity: 1, unitPrice: 1003 }), linea({ subtotal: 1003, taxAmount: 191, total: 1194, quantity: 1, unitPrice: 1003 })],
        totales: { subtotal: 2006, taxes: 382, total: 2388, currency: 'CLP' },
    }), /19 %/, 'IVA por línea (191+191) frente a round(2006 × 0,19) = 381: no se envía');
    // El mismo documento con la regla de Chile en el motor único (countries.ts,
    // taxRounding 'document'): el IVA es el del SII y el DTE lo lleva tal cual.
    assert.equal(taxRoundingFor('CL'), 'document', 'Chile redondea el IVA por documento');
    const motor = calculateDocumentTotals([1003, 1003].map((p) => ({ descripcion: 'x', cantidad: 1, precio_unitario: p, tax_rate: 0.19 })),
        { roundLines: 0, taxRounding: taxRoundingFor('CL') });
    assert.deepEqual([motor.impuestos, motor.lineas.map((l) => l.impuesto)], [381, [191, 190]], 'IVA del documento repartido entre las líneas');
    const conMotor = armarBorrador({
        ...base,
        lineas: motor.lineas.map((l) => linea({ subtotal: l.base, taxAmount: l.impuesto, total: l.total, quantity: 1, unitPrice: l.base })),
        totales: { subtotal: motor.subtotal, taxes: motor.impuestos, total: motor.total, currency: 'CLP' },
    });
    assert.deepEqual([conMotor.neto, conMotor.iva, conMotor.total], [2006, 381, 2387], 'el DTE lleva el IVA del documento');

    // CAF.
    assert.throws(() => parsearCaf(cafDePrueba({ rut: '96543210-8' }).bytes, RUT_EMISOR), /RUT/, 'un CAF de otro RUT');
    assert.throws(() => parsearCaf(cafDePrueba({ rut: RUT_EMISOR, tipo: 39 }).bytes, RUT_EMISOR), /tipo 39/, 'folios de boleta');
    const otras = llavesCaf();
    assert.throws(() => parsearCaf(cafDePrueba({ rut: RUT_EMISOR, llaves: { ...llaves, m: otras.m } }).bytes, RUT_EMISOR), RailDatosError, 'RSAPK que no es pareja de la privada');
    assert.equal(venceCaf(33, '2026-04-15'), '2026-10-14', 'seis meses desde la autorización (Res. Ex. 58/2017)');
    assert.equal(venceCaf(34, '2026-04-15'), null, 'la factura exenta no da crédito fiscal: sin vencimiento');
    assert.equal(cafVigente(33, '2026-04-15', '2026-10-14'), true);
    assert.equal(cafVigente(33, '2026-04-15', '2026-10-15'), false);
    assert.throws(() => emitirDocumento(b33, { ...folio(33, 8), fechaAutorizacion: '2026-01-01' }, clave, caratula, ahora), /vencieron/, 'folio vencido');
    assert.throws(() => emitirDocumento(b33, folio(33, 51), clave, caratula, ahora), /fuera del rango/, 'folio fuera del CAF');
    assert.equal(fechaHoraChile(new Date('2026-01-15T03:30:00Z')), '2026-01-15T00:30:00', 'hora de Chile en verano (UTC-3)');
    assert.equal(fechaHoraChile(new Date('2026-07-15T03:30:00Z')), '2026-07-14T23:30:00', 'hora de Chile en invierno (UTC-4)');
}

// ── 6. Respuestas reales del SII ─────────────────────────────────────────────
{
    const semillaR = await parsearRespuesta(leer('respuesta-semilla.xml'), 'getSeed');
    assert.equal(semillaR.estado, '00');
    assert.match(semillaR.campos.SEMILLA, /^\d+$/);
    const valida = await parsearRespuesta(leer('respuesta-token-firma-valida-cert-no-registrado.xml'), 'getToken');
    const alterada = await parsearRespuesta(leer('respuesta-token-firma-alterada.xml'), 'getToken');
    assert.equal(valida.estado, '10', 'firma de Cord aceptada por el SII; el certificado de prueba no está registrado');
    assert.equal(alterada.estado, '11', 'misma semilla con la firma alterada: el SII la rechaza como firma');
    for (const e of ['10', '11', '05', '21']) {
        assert.equal(tokenTransitorio(e), false, e);
        assert.doesNotMatch(mensajeToken(e), /GetTokenFromSeed|ESTADO|Error|\bTOKEN\b/, `mensaje para el usuario del estado ${e} (regla 14)`);
    }
    for (const [f, op] of [['respuesta-estup-token-no-existe.xml', 'getEstUp'], ['respuesta-estdte-token-no-existe.xml', 'getEstDte']]) {
        const r = await parsearRespuesta(leer(f), op);
        assert.ok(ESTADOS_TOKEN.has(r.estado), `${f}: ${r.estado} pide un token nuevo`);
    }
    const up = await parsearRecepcion(leer('respuesta-upload-no-autenticado.xml'));
    assert.deepEqual([up.status, up.trackId], [5, null]);
    assert.doesNotMatch(mensajeUpload(7), /esquema inv|RECEPCIONDTE/i, 'el mensaje del upload no expone la glosa cruda');
    assert.deepEqual(['EPR', 'RSC', 'RFR', 'RCT', 'SOK', 'CRT', 'FOK', 'PDR', 'PRD', 'XYZ'].map(faseEnvio),
        ['procesado', 'rechazado', 'rechazado', 'rechazado', 'en_proceso', 'en_proceso', 'en_proceso', 'en_proceso', 'en_proceso', 'desconocido']);
    assert.deepEqual(['DOK', 'TMD', 'MMD', 'DNK', 'FAU', 'FNA', 'FAN', 'EMP'].map(faseDte),
        ['recibido', 'recibido', 'recibido', 'datos_distintos', 'no_recibido', 'no_autorizado', 'no_autorizado', 'no_autorizado']);
}

// ── 7. Certificación: nota de débito, set de pruebas e intercambio ───────────
{
    const caf56 = parsearCaf(cafDePrueba({ rut: RUT_EMISOR, tipo: 56, desde: 1, hasta: 50, llaves }).bytes, RUT_EMISOR);
    const caf61 = cafs[61];
    const folioDe = (caf, tipo, n) => ({ folio: n, cafXml: caf.cafXml, llavePrivadaPem: caf.llavePrivadaPem, tipo, desde: 1, hasta: 50, fechaAutorizacion: '2026-10-01' });
    assert.equal(venceCaf(56, '2026-04-15'), '2026-10-14', 'la nota de débito da crédito fiscal: vence a los seis meses');

    // Nota de débito sobre la factura (CodRef 3) y sobre una nota de crédito que anula completa (CodRef 1).
    const nd3 = armarBorrador({
        emisor, receptor: {}, fechaEmision: '2026-10-11', motivo: 'Intereses por mora',
        notaDebitoDe: { tipo: 33, folio: 7, fechaEmision: '2026-10-09', total: b33.total, receptor: b33.receptor },
        lineas: [linea({ description: 'Intereses', quantity: 1, unitPrice: 5000, subtotal: 5000, taxAmount: 950, total: 5950 })],
        totales: { subtotal: 5000, taxes: 950, total: 5950, currency: 'CLP' },
    });
    assert.deepEqual([nd3.tipo, nd3.referencias[0].codigo, nd3.referencias[0].tipo, nd3.receptor.rut, nd3.formaPago], [56, 3, 33, RUT_CLIENTE, undefined], 'ND: corrige montos (CodRef 3) con el receptor del documento, sin FmaPago');
    const nd1 = armarBorrador({
        emisor, receptor: {}, fechaEmision: '2026-10-11',
        notaDebitoDe: { tipo: 61, folio: 1, fechaEmision: '2026-10-10', total: b61.total, receptor: b61.receptor },
        lineas: [linea({ description: 'Ajuste de precio', quantity: 1, unitPrice: 10000, subtotal: 10000, taxAmount: 1900, total: 11900 })],
        totales: { subtotal: 10000, taxes: 1900, total: 11900, currency: 'CLP' },
    });
    assert.deepEqual([nd1.referencias[0].codigo, nd1.referencias[0].razon], [1, 'Anula nota de crédito'], 'ND por el total de una NC: la anula (CodRef 1, caso c)');
    const d56 = emitirDocumento(nd3, folioDe(caf56, 56, 1), clave, caratula, new Date('2026-10-11T15:00:00Z'));
    assert.equal(numeroDocumento(56, 1, true), 'C-ND-1');
    assert.equal(representacionSii({ borrador: nd3, folio: 1, timbre: d56.timbre, unidadSii: 'X', resolucion: { numero: 0, fecha: '2026-10-01' }, certificacion: false }).cedible, undefined, 'la nota de débito no tiene copia cedible (manual de muestras, 1.4)');

    // Set de pruebas: el archivo del SII (ISO-8859-1, CRLF, tabuladores) → un envío con los ocho casos.
    const texto = leer('set-pruebas-basico.txt', 'latin1');
    const archivoSet = parsearSetDePruebas(texto);
    assert.deepEqual(archivoSet.sets.map((s) => [s.nombre, s.numeroAtencion, s.casos.map((c) => c.tipo).join(',')]), [['SET BASICO', '4352553', '33,33,33,33,61,61,61,56']]);
    assert.deepEqual(archivoSet.noSoportados.map((n) => n.motivo), ['guia', 'libro_guias', 'exportacion', 'compra'], 'guía y su libro, exportación y factura de compra se dicen, no se arman');
    assert.throws(() => parsearSetDePruebas(texto.replace('Cajón', 'Caj\uFFFDn')), RailDatosError, 'una tilde perdida no se adivina');
    assert.throws(() => parsearSetDePruebas(texto.replace('DESCUENTO GLOBAL ITEMES AFECTOS\t\t     22%', 'RECARGO GLOBAL\t\t 5%')), /no sabe armar/, 'una línea desconocida no se ignora');
    const set = archivoSet.sets[0];
    assert.deepEqual(set.casos.filter((c) => c.referencia).map(codRefDeCaso), [2, 3, 1, 1], 'CodRef: corrige giro 2, devolución 3, anula 1');
    const receptoresSet = Object.fromEntries(set.casos.filter((c) => c.tipo === 33).map((c, i) => [c.numero,
        { ...receptor, rut: ['77777777-7', '11222333-9', '12345678-5', '22333444-K'][i], razonSocial: `Cliente ${i + 1} Ltda.` }]));
    const foliosSet = Object.fromEntries(set.casos.map((c, i) => [c.numero, 10 + i]));
    const docsSet = armarDocumentosDelSet({ casos: set.casos, emisor, receptores: receptoresSet, fecha: '2026-10-09', folios: foliosSet });
    assert.deepEqual(docsSet.map((d) => d.borrador.total), [1188861, 7947392, 1679163, 3458370, 0, 3901508, 1679163, 0],
        'totales con la fórmula del SII: descuento por línea, global sobre afectos, IVA del neto, NC por devolución al precio original');
    assert.ok(docsSet.every((d, i) => d.borrador.referencias[0].tipo === 'SET' && d.borrador.referencias[0].razon === `CASO ${set.casos[i].numero}`), 'primera referencia: SET y CASO n');
    assert.throws(() => armarDocumentosDelSet({ casos: set.casos, emisor, receptores: { ...receptoresSet, '4352553-2': receptoresSet['4352553-1'] }, fecha: '2026-10-09', folios: foliosSet }), /RUT distinto/, 'RUT distintos por factura');
    const cafsSet = { 33: cafs[33], 56: caf56, 61: caf61 };
    const firmadosSet = docsSet.map((d) => emitirDocumento(d.borrador, folioDe(cafsSet[d.borrador.tipo], d.borrador.tipo, d.folio), clave, caratula, ahora));
    const envioSet = armarEnvio(firmadosSet.map((f) => ({ tipo: f.tipo, nodo: parsearFragmento(f.dteXml) })), caratula, ahora, clave);
    assert.match(envioSet, /<SubTotDTE>\n<TpoDTE>33<\/TpoDTE>\n<NroDTE>4<\/NroDTE>\n<\/SubTotDTE>\n<SubTotDTE>\n<TpoDTE>56<\/TpoDTE>\n<NroDTE>1<\/NroDTE>/);
    assert.match(envioSet, /<NmbItem>Caj\xf3n AFECTO<\/NmbItem>/, 'glosa exacta, con su tilde, en ISO-8859-1');

    // Intercambio: el negocio recibe un envío de un proveedor y responde.
    const proveedor = certificadoDePrueba();
    const RUT_PROV = '96543210-8';
    const cafProv = parsearCaf(cafDePrueba({ rut: RUT_PROV, tipo: 33, desde: 1, hasta: 50, llaves: llavesCaf() }).bytes, RUT_PROV);
    const bProv = armarBorrador({
        emisor: { ...emisor, rut: RUT_PROV, razonSocial: 'Proveedor del Sur SpA' }, receptor: { ...receptor, rut: RUT_EMISOR },
        fechaEmision: '2026-10-09',
        lineas: [linea({ description: 'Resmas de papel', quantity: 10, unitPrice: 10000, subtotal: 100000, taxAmount: 19000, total: 119000 })],
        totales: { subtotal: 100000, taxes: 19000, total: 119000, currency: 'CLP' },
    });
    const dProv = emitirDocumento(bProv, folioDe(cafProv, 33, 5), proveedor, { rutEmisor: RUT_PROV, rutEnvia: '9876543-3', resolucion: { numero: 80, fecha: '2014-08-22' } }, ahora);
    const envioProv = armarEnvio([{ tipo: 33, nodo: parsearFragmento(dProv.dteXml) }], { rutEmisor: RUT_PROV, rutEnvia: '9876543-3', rutReceptor: RUT_EMISOR, resolucion: { numero: 80, fecha: '2014-08-22' } }, ahora, proveedor);
    const recibido = leerEnvioRecibido(Buffer.from(envioProv, 'latin1'), RUT_EMISOR);
    assert.deepEqual([recibido.estado, recibido.documentos.map((d) => [d.estado, d.folio, d.montoTotal])], [0, [[0, 5, bProv.total]]]);
    // También con fines de línea CRLF (XML 1.0 los normaliza antes de firmar).
    assert.equal(leerEnvioRecibido(Buffer.from(envioProv.replace(/\n/g, '\r\n'), 'latin1'), RUT_EMISOR).estado, 0, 'CRLF');
    assert.equal(leerEnvioRecibido(Buffer.from(envioProv.replace(`<MntTotal>${bProv.total}</MntTotal>`, '<MntTotal>1</MntTotal>'), 'latin1'), RUT_EMISOR).estado, 2, 'sobre alterado: error de firma');
    assert.equal(leerEnvioRecibido(Buffer.from(envioProv, 'latin1'), '77777777-7').estado, 3, 'RUT receptor no corresponde');
    assert.equal(leerEnvioRecibido(Buffer.from('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><EnvioDTE>&e;</EnvioDTE>'), RUT_EMISOR).estado, 91, 'sin DTD ni entidades externas');
    const dteAlterado = parsearFragmento(dProv.dteXml.replace(`<MntTotal>${bProv.total}</MntTotal>`, '<MntTotal>1</MntTotal>'));
    const envioDteAlterado = armarEnvio([{ tipo: 33, nodo: dteAlterado }], { rutEmisor: RUT_PROV, rutEnvia: '9876543-3', rutReceptor: RUT_EMISOR, resolucion: { numero: 80, fecha: '2014-08-22' } }, ahora, proveedor);
    assert.equal(leerEnvioRecibido(Buffer.from(envioDteAlterado, 'latin1'), RUT_EMISOR).documentos[0].estado, 1, 'DTE alterado dentro de un sobre bien firmado');
    const car = { rutResponde: RUT_EMISOR, rutRecibe: RUT_PROV, idRespuesta: 41, contacto: { nombre: 'Empresa de Prueba SpA', mail: 'contacto@prueba.cl' } };
    const respRecepcion = respuestaRecepcion(car, { nombreArchivo: 'EnvioDTE.xml', recibidoEn: ahora, codEnvio: 9001, envio: recibido }, ahora, clave);
    const resultadoComun = { tipo: 33, folio: 5, fechaEmision: '2026-10-09', rutEmisor: RUT_PROV, rutReceptor: RUT_EMISOR, montoTotal: bProv.total, codEnvio: 9001 };
    const respResultado = respuestaResultado({ ...car, idRespuesta: 42 }, [{ ...resultadoComun, estado: 0 }, { ...resultadoComun, folio: 6, estado: 2, motivo: 'Mercadería no recibida' }], ahora, clave);
    assert.throws(() => respuestaResultado({ ...car, idRespuesta: 43 }, [{ ...resultadoComun, estado: 2 }], ahora, clave), /motivo/, 'un rechazo sin motivo no se firma (Ley 19.983)');
    const recibos = envioRecibos({ rutResponde: RUT_EMISOR, rutRecibe: RUT_PROV, idEnvio: 44 }, [{ ...resultadoComun, recinto: 'Bodega central', rutFirma: RUT_FIRMANTE }], ahora, clave);
    assert.match(recibos, new RegExp(`<Declaracion>${DECLARACION_RECIBO.replace(/[()]/g, '\\$&')}</Declaracion>`));
    const raizDe = (xml) => parsearFragmento(xml.replace(/^<\?xml[^>]*\?>\n/, ''));
    for (const [xml, id] of [[respRecepcion, 'Resultado'], [respResultado, 'Resultado'], [recibos, 'SetRecibos']]) {
        const raiz = raizDe(xml);
        const firma = (raiz.c ?? []).find((h) => h.n === 'Signature');
        assert.ok(verificarFirmaRecibida(buscar(raiz, id), [raiz], firma, [raiz]).ok, `firma de <${id}> en su contexto`);
    }
    const recibo = buscar(raizDe(recibos), 'Recibo');
    const firmaRecibo = (recibo.c ?? []).find((h) => h.n === 'Signature');
    assert.ok(verificarFirmaRecibida(buscar(recibo, 'DocumentoRecibo'), [], firmaRecibo, [recibo]).ok, 'el recibo se firma suelto, como el DTE');

    // Esquemas oficiales (xmllint) y firmas con la JDK, con controles negativos.
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (xmllint) {
        const dir = mkdtempSync(join(tmpdir(), 'sii-cert-'));
        try {
            const valida = (t, xsd, nombre) => {
                const f = join(dir, nombre);
                writeFileSync(f, Buffer.from(t, 'latin1'));
                execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(FIX, xsd), f], { stdio: 'pipe' });
            };
            const ok = (t, xsd, nombre) => {
                try { valida(t, xsd, nombre); } catch (e) { throw new Error(`${nombre} no valida contra ${xsd}:\n${e.stderr?.toString() ?? e}`); }
            };
            ok(d56.envioXml, 'EnvioDTE_v10.xsd', 'envio-56.xml');
            ok(envioSet, 'EnvioDTE_v10.xsd', 'envio-set.xml');
            ok(respRecepcion, 'RespuestaEnvioDTE_v10.xsd', 'respuesta-recepcion.xml');
            ok(respResultado, 'RespuestaEnvioDTE_v10.xsd', 'respuesta-resultado.xml');
            ok(recibos, 'EnvioRecibos_v10.xsd', 'envio-recibos.xml');
            assert.throws(() => valida(envioSet.replace('<TpoDocRef>SET</TpoDocRef>', '<TpoDocRef>SETX</TpoDocRef>'), 'EnvioDTE_v10.xsd', 'neg-set.xml'), 'TpoDocRef de más de 3 caracteres');
            assert.throws(() => valida(envioSet.replace('<CodRef>2</CodRef>', '<CodRef>4</CodRef>'), 'EnvioDTE_v10.xsd', 'neg-codref.xml'), 'CodRef fuera de 1–3');
            assert.throws(() => valida(envioSet.replace('<TpoMov>D</TpoMov>', '<TpoMov>X</TpoMov>'), 'EnvioDTE_v10.xsd', 'neg-dscrcg.xml'), 'TpoMov D o R');
            assert.throws(() => valida(respResultado.replace('<EstadoDTE>2</EstadoDTE>', '<EstadoDTE>3</EstadoDTE>'), 'RespuestaEnvioDTE_v10.xsd', 'neg-estado.xml'), 'EstadoDTE 0–2');
            const ambas = respResultado.replace('<ResultadoDTE>', respRecepcion.slice(respRecepcion.indexOf('<RecepcionEnvio>'), respRecepcion.indexOf('</RecepcionEnvio>') + 17) + '\n<ResultadoDTE>');
            assert.throws(() => valida(ambas, 'RespuestaEnvioDTE_v10.xsd', 'neg-ambas.xml'), 'RecepcionEnvio y ResultadoDTE son excluyentes');
            assert.throws(() => valida(recibos.replace('acredita que la entrega', 'acredita la entrega'), 'EnvioRecibos_v10.xsd', 'neg-declaracion.xml'), 'la declaración es el texto fijo del esquema');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    } else if (process.env.SII_XSD_REQUIRED === '1') {
        throw new Error('xmllint no está disponible y SII_XSD_REQUIRED=1');
    }
    let java = true;
    try { execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch { java = false; }
    if (java) {
        const dir = mkdtempSync(join(tmpdir(), 'sii-cert-firmas-'));
        try {
            const JAVA = fileURLToPath(new URL('./sii-firmas.java', import.meta.url));
            const escribir = (pares) => pares.map(([n, t]) => { const f = join(dir, n); writeFileSync(f, Buffer.from(t, 'latin1')); return f; });
            const reciboSuelto = `${DECLARACION_XML}\n${serializar(recibo)}\n`;
            const sueltos = execFileSync('java', [JAVA, ...escribir([['dte-56.xml', d56.dteXml], ['recibo.xml', reciboSuelto], ...firmadosSet.map((f, i) => [`set-${i}.xml`, f.dteXml])])], { stdio: 'pipe' }).toString();
            assert.equal((sueltos.match(/valida=true/g) ?? []).length, 2 + firmadosSet.length, `firmas sueltas (ND, recibo y casos del set) verificadas por la JDK:\n${sueltos}`);
            const sobres = execFileSync('java', [JAVA, '--sobre', ...escribir([['envio-set.xml', envioSet], ['resp-recepcion.xml', respRecepcion], ['resp-resultado.xml', respResultado], ['recibos.xml', recibos]])], { stdio: 'pipe' }).toString();
            assert.equal((sobres.match(/valida=true/g) ?? []).length, 4, `firmas de los sobres y respuestas verificadas por la JDK:\n${sobres}`);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    } else if (process.env.SII_JDK_REQUIRED === '1') {
        throw new Error('java no está disponible y SII_JDK_REQUIRED=1');
    }

    // Registro de aceptación o reclamo: endpoint, espacio de nombres y parámetros de los WSDL oficiales.
    for (const [entorno, archivo] of [['homologacion', 'registroreclamodte-cert.wsdl'], ['produccion', 'registroreclamodte-prod.wsdl']]) {
        const w = leer(archivo);
        assert.equal(/soap11:address location="([^"]+)"/.exec(w)?.[1], siiReclamoEndpoint(entorno), `endpoint del registro de reclamos en ${entorno}`);
        assert.ok(w.includes(`targetNamespace="${NS_WS_RECLAMO}"`));
        assert.ok(/style="rpc"/.test(w) && /use="literal"/.test(w), 'rpc/literal');
    }
    const orden = /operation name="ingresarAceptacionReclamoDoc" parameterOrder="([^"]+)"/.exec(leer('registroreclamodte-cert.wsdl'))[1].split(' ');
    const sobreR = sobreReclamo('ingresarAceptacionReclamoDoc', { rutEmisor: '45000065-5', tipo: 34, folio: 17 }, 'ACD');
    assert.deepEqual([...sobreR.matchAll(/<(\w+)>[^<]*<\/\1>/g)].map((x) => x[1]), orden, 'parámetros en el orden del WSDL');
    assert.match(sobreR, /<ws:ingresarAceptacionReclamoDoc><rutEmisor>45000065<\/rutEmisor><dvEmisor>5<\/dvEmisor><tipoDoc>34<\/tipoDoc><folio>17<\/folio><accionDoc>ACD<\/accionDoc><\/ws:ingresarAceptacionReclamoDoc>/,
        'el ejemplo del anexo del manual (v1.2)');
    assert.ok(/<xs:element name="codResp" type="xs:int"/.test(leer('registroreclamodte.xsd')), 'respuestaTo trae codResp');
    const resp = await parsearRespuestaReclamo('<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:ingresarAceptacionReclamoDocResponse xmlns:ns2="http://ws.registroreclamodte.diii.sdi.sii.cl"><return><codResp>0</codResp><descResp>Acción Completada OK</descResp></return></ns2:ingresarAceptacionReclamoDocResponse></S:Body></S:Envelope>', 'ingresarAceptacionReclamoDoc');
    assert.deepEqual([resp.codigo, resp.descripcion], [0, 'Acción Completada OK']);
    for (const c of [-1, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19]) {
        assert.doesNotMatch(mensajeReclamo(c), /codResp|descResp|accionDoc|\bRCD\b|\bACD\b|\bERM\b|SOAP|Completada/, `mensaje del código ${c} para el usuario (regla 14)`);
    }
}

// ── 8. Libros de ventas y de compras del set (IECV) ──────────────────────────
{
    const texto = leer('set-pruebas-basico.txt', 'latin1');
    const archivo = parsearSetDePruebas(texto);
    assert.deepEqual(archivo.libros.map((l) => [l.operacion, l.numeroAtencion, l.filas.length, l.factorProporcionalidad]),
        [['VENTA', '4352554', 0, null], ['COMPRA', '4352555', 7, 0.6]], 'el archivo pide los dos libros (instrucciones del set, III y IV)');
    const compras = archivo.libros[1];
    // Observación del set → cómo se registra el IVA (formato IECV v3.0, 3.4, campos 15 a 23).
    assert.deepEqual(compras.filas.map((f) => [f.tpoDoc, f.folio, f.tratamiento.tipo, f.tratamiento.codigo ?? null]), [
        [30, 234, 'credito', null], [33, 32, 'credito', null], [30, 781, 'uso_comun', null], [60, 451, 'credito', null],
        [33, 67, 'no_recuperable', 4], [46, 9, 'retencion_total', null], [60, 211, 'credito', null],
    ], 'factura en papel 30, nota de crédito en papel 60, factura de compra 46 (formato IECV, 4.2)');
    assert.throws(() => parsearSetDePruebas(texto.replace('ENTREGA GRATUITA DEL PROVEEDOR', 'COMPRA CON IVA DIFERIDO')), /no sabe registrar/, 'una observación desconocida no se adivina');
    assert.throws(() => parsearSetDePruebas(texto.replace('DEL IVA ES DE 0.60', 'DEL IVA ES DE')), /factor de proporcionalidad/, 'IVA de uso común sin factor');
    assert.throws(() => parsearSetDePruebas(texto.replace('FACTURA DE COMPRA ELECTRONICA\t\t  9', 'FACTURA ELECTRONICA\t\t\t  9')), /no sabe registrar/, 'el código 15 es de la factura de compra');
    assert.throws(() => parsearSetDePruebas(texto.replace('NOTA DE CREDITO\t\t\t\t451', 'BOLETA\t\t\t\t451')), /no sabe registrar/, 'un documento que el libro de compras no admite');

    // Libro de ventas: los documentos del set, uno por línea, y el resumen por tipo.
    const set = archivo.sets[0];
    const ruts = ['77777777-7', '11222333-9', '12345678-5', '22333444-K'];
    const receptores = Object.fromEntries(set.casos.filter((c) => c.tipo === 33).map((c, i) => [c.numero, { ...receptor, rut: ruts[i], razonSocial: `Cliente ${i + 1} Ltda.` }]));
    const folios = Object.fromEntries(set.casos.map((c, i) => [c.numero, 10 + i]));
    const docs = armarDocumentosDelSet({ casos: set.casos, emisor, receptores, fecha: '2026-10-09', folios });
    const dv = docs.map((d) => detalleVenta({ tipo: d.borrador.tipo, folio: d.folio, borrador: d.borrador }));
    const rv = resumenPeriodo(dv);
    assert.ok(dv.every((d) => d.mntExe + d.mntNeto + d.mntIva === d.mntTotal && d.tasaImp === 19), 'ventas: total = exento + neto + IVA, con la tasa (obligatoria)');
    assert.deepEqual(rv.map((t) => [t.tpoDoc, t.totDoc, t.totMntTotal]), [[33, 4, 14273786], [56, 1, 0], [61, 3, 5580671]], 'resumen del período por tipo de documento');
    assert.deepEqual(dv.filter((d) => d.tpoDocRef).map((d) => [d.tpoDoc, d.tpoDocRef, d.folioDocRef]), [[61, 33, 12]], 'solo la nota de crédito que anula un documento completo lo referencia (2.4, campos 16 y 17)');

    // Libro de compras: la aritmética del formato.
    const proveedores = ['78885550-8', '96543210-8', '12345678-5', '78885550-8', '11222333-9', '22333444-K', '96543210-8']
        .map((rut, i) => ({ rut, razonSocial: `Proveedor ${i + 1} Ltda.` }));
    const dc = compras.filas.map((f, i) => detalleCompra(f, proveedores[i], '2026-10-09', compras.factorProporcionalidad));
    for (const d of dc) {
        const retenido = (d.otrosImp ?? []).filter((o) => o.codigo === 15).reduce((x, o) => x + o.monto, 0);
        const noRec = (d.ivaNoRec ?? []).reduce((x, n) => x + n.monto, 0);
        assert.equal(d.mntIva + (d.ivaUsoComun ?? 0) + noRec, Math.round(d.mntNeto * 0.19), `tasa × neto = recuperable + uso común + no recuperable (3.4, campo 15): ${d.tpoDoc} ${d.nroDoc}`);
        assert.equal(d.mntTotal, d.mntNeto + d.mntExe + d.mntIva + (d.ivaUsoComun ?? 0) + noRec - retenido, `monto total (3.4, campo 25): ${d.tpoDoc} ${d.nroDoc}`);
    }
    const rc = resumenPeriodo(dc, compras.factorProporcionalidad);
    assert.deepEqual(rc.map((t) => [t.tpoDoc, t.totDoc, t.totMntExe, t.totMntNeto, t.totMntIva, t.totMntTotal]), [
        [30, 2, 0, 51083, 4047, 60789], [33, 2, 8844, 16553, 1240, 28542], [46, 1, 0, 9575, 1819, 9575], [60, 2, 0, 7184, 1365, 8549],
    ]);
    assert.deepEqual([rc[0].totOpIvaUsoComun, rc[0].totIvaUsoComun, rc[0].fctProp, rc[0].totCredIvaUsoComun], [1, 5659, 0.6, 3395], 'crédito del IVA de uso común = factor × total (3.3, campos 18 y 19)');
    assert.deepEqual(rc[1].totIvaNoRec, [{ codigo: 4, operaciones: 1, monto: 1905 }], 'entrega gratuita: IVA no recuperable código 4');
    assert.deepEqual(rc[2].totOtrosImp, [{ codigo: 15, monto: 1819 }], 'retención total: código 15');
    assert.throws(() => detalleCompra(compras.filas[1], { rut: '78885550-9' }, '2026-10-09', 0.6), /RUT válido/, 'proveedor con RUT válido (instrucciones del set, IV.3)');
    assert.throws(() => detalleCompra(compras.filas[0], { rut: '78885550-8' }, '2026-10-09', 0.6), /razón social/, 'razón social obligatoria en los documentos en papel (3.4, campo 12)');
    assert.doesNotThrow(() => detalleCompra(compras.filas[1], { rut: '96543210-8' }, '2026-10-09', 0.6), 'opcional en los electrónicos');

    const car = { rutEmisor: RUT_EMISOR, rutEnvia: RUT_FIRMANTE, periodo: '2026-10', resolucion: caratula.resolucion };
    const libroVentas = armarLibro({ ...car, operacion: 'VENTA' }, dv, rv, ahora, clave);
    const libroCompras = armarLibro({ ...car, operacion: 'COMPRA' }, dc, rc, ahora, clave);
    assert.equal(libroVentas.split('\n')[0], DECLARACION_XML);
    assert.match(libroVentas.split('\n')[1], /^<LibroCompraVenta xmlns="http:\/\/www\.sii\.cl\/SiiDte" xmlns:xsi="[^"]+" xsi:schemaLocation="http:\/\/www\.sii\.cl\/SiiDte LibroCV_v10\.xsd" version="1\.0">$/);
    assert.match(libroVentas, /<TipoOperacion>VENTA<\/TipoOperacion>\n<TipoLibro>ESPECIAL<\/TipoLibro>\n<TipoEnvio>TOTAL<\/TipoEnvio>\n<FolioNotificacion>1<\/FolioNotificacion>/, 'carátula del libro de ventas del set (III.1)');
    assert.match(libroCompras, /<TipoOperacion>COMPRA<\/TipoOperacion>\n<TipoLibro>ESPECIAL<\/TipoLibro>\n<TipoEnvio>TOTAL<\/TipoEnvio>\n<FolioNotificacion>2<\/FolioNotificacion>/, 'carátula del libro de compras del set (IV.1)');
    assert.ok(!/ResumenSegmento/.test(libroVentas + libroCompras), 'un envío TOTAL no lleva resumen de segmento (1.5 b)');
    assert.throws(() => armarLibro({ ...car, periodo: '2026-13', operacion: 'VENTA' }, dv, rv, ahora, clave), /período/);
    for (const xml of [libroVentas, libroCompras]) {
        const raiz = parsearFragmento(xml.replace(/^<\?xml[^>]*\?>\n/, ''));
        const firma = (raiz.c ?? []).find((h) => h.n === 'Signature');
        assert.ok(verificarFirmaRecibida(buscar(raiz, 'EnvioLibro'), [raiz], firma, [raiz]).ok, 'firma del <EnvioLibro> en el contexto del libro');
    }

    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    let java = true;
    try { execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch { java = false; }
    const dir = mkdtempSync(join(tmpdir(), 'sii-libros-'));
    try {
        const escribir = (nombre, t) => { const f = join(dir, nombre); writeFileSync(f, Buffer.from(t, 'latin1')); return f; };
        const negativos = [
            [libroVentas.replace('<TipoOperacion>VENTA</TipoOperacion>', '<TipoOperacion>VENTAS</TipoOperacion>'), 'TipoOperacion COMPRA o VENTA'],
            [libroVentas.replace('<TipoEnvio>TOTAL</TipoEnvio>', '<TipoEnvio>TOT</TipoEnvio>'), 'TipoEnvio PARCIAL, FINAL, TOTAL o AJUSTE'],
            [libroVentas.replace('<TotMntTotal>14273786</TotMntTotal>\n', ''), 'TotMntTotal obligatorio'],
            [libroCompras.replace('<CodIVANoRec>4</CodIVANoRec>', '<CodIVANoRec>5</CodIVANoRec>'), 'CodIVANoRec 1, 2, 3, 4 o 9'],
            [libroCompras.replace('<FctProp>0.6</FctProp>', '<FctProp>100</FctProp>'), 'FctProp hasta 99.999'],
            [libroCompras.replace(/<MntNeto>29785<\/MntNeto>\n<MntIVA>0<\/MntIVA>/, '<MntIVA>0</MntIVA>\n<MntNeto>29785</MntNeto>'), 'orden del detalle'],
        ];
        if (xmllint) {
            // Copia temporal del esquema: SOLO la faceta de 34 dígitos que libxml2 no representa (ver cabecera).
            const xsd = join(dir, 'xsd');
            mkdirSync(xsd);
            for (const f of ['LibroCV_v10.xsd', 'LceCoCertif_v10.xsd', 'LceCal_v10.xsd', 'xmldsignature_v10.xsd']) writeFileSync(join(xsd, f), readFileSync(join(FIX, f)));
            const tipos = leer('LceSiiTypes_v10.xsd', 'latin1');
            assert.ok(tipos.includes('<xs:maxInclusive value="999999999999999999999999999999.9999"/>'), 'la faceta que se recorta para libxml2 es la del esquema oficial');
            writeFileSync(join(xsd, 'LceSiiTypes_v10.xsd'), Buffer.from(tipos.replace('<xs:maxInclusive value="999999999999999999999999999999.9999"/>', '<xs:maxInclusive value="99999999999999999999.9999"/>'), 'latin1'));
            const valida = (f) => execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(xsd, 'LibroCV_v10.xsd'), f], { stdio: 'pipe' });
            for (const [nombre, t] of [['libro-ventas.xml', libroVentas], ['libro-compras.xml', libroCompras]]) {
                try { valida(escribir(nombre, t)); } catch (e) { throw new Error(`${nombre} no valida contra LibroCV_v10.xsd:\n${e.stderr?.toString() ?? e}`); }
            }
            negativos.forEach(([t, msg], i) => {
                assert.notEqual(t, libroVentas, msg);
                assert.notEqual(t, libroCompras, msg);
                assert.throws(() => valida(escribir(`neg-libro-${i}.xml`, t)), msg);
            });
        } else if (process.env.SII_XSD_REQUIRED === '1') {
            throw new Error('xmllint no está disponible y SII_XSD_REQUIRED=1');
        }
        if (java) {
            const ESQUEMA = fileURLToPath(new URL('./sii-esquema.java', import.meta.url));
            const FIRMAS = fileURLToPath(new URL('./sii-firmas.java', import.meta.url));
            const buenos = [escribir('jdk-ventas.xml', libroVentas), escribir('jdk-compras.xml', libroCompras)];
            const esquema = execFileSync('java', [ESQUEMA, join(FIX, 'LibroCV_v10.xsd'), ...buenos], { stdio: 'pipe' }).toString();
            assert.equal((esquema.match(/valida=true/g) ?? []).length, 2, `los dos libros validan en la JDK contra el esquema oficial intacto:\n${esquema}`);
            for (const [i, [t, msg]] of negativos.entries()) {
                assert.throws(() => execFileSync('java', [ESQUEMA, join(FIX, 'LibroCV_v10.xsd'), escribir(`jdk-neg-${i}.xml`, t)], { stdio: 'pipe' }), `JDK: ${msg}`);
            }
            const firmas = execFileSync('java', [FIRMAS, '--sobre', ...buenos], { stdio: 'pipe' }).toString();
            assert.equal((firmas.match(/valida=true/g) ?? []).length, 2, `firmas de los libros verificadas por la JDK:\n${firmas}`);
        } else if (process.env.SII_JDK_REQUIRED === '1') {
            throw new Error('java no está disponible y SII_JDK_REQUIRED=1');
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

process.stdout.write('security:sii (ejemplo oficial F60T33, esquemas DTE/EnvioDTE 2026, firmas XMLDSig y timbre, PDF417, WSDL de maullin y palena, reglas y respuestas reales del SII, nota de débito, set de pruebas, respuestas de intercambio, registro de reclamos y libros de compras y ventas contra LibroCV_v10.xsd) OK\n');
