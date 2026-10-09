// Contrato de la factura electrónica con la DIAN (Colombia) — corre en
// `npm run test:payments` (security:dian). Sin red: todo contra fuentes
// oficiales vendorizadas en scripts/fixtures/dian/.
//
// Capas, de la más dura a la más blanda:
//
//   1. CUFE y CUDE: los ejemplos del Anexo Técnico 1.9 (numeral 11) se
//      reproducen byte a byte — factura (11.2), documento de transmisión
//      (11.4.1) y nota crédito (11.4.3). De la nota débito (11.4.5) se
//      reproduce la COMPOSICIÓN publicada; su hash impreso no corresponde a esa
//      composición (errata del Anexo: lo comprueba la sección 1).
//   2. Tablas: cada código que Cord informa existe, con ese texto, en la tabla
//      oficial de la Caja de herramientas (.xlsx vendorizados): tipos de
//      documento, tributos, responsabilidades, conceptos de nota, tarifas de
//      IVA, medio de pago, unidad, municipios y departamentos (DIVIPOLA).
//   3. Política de firma: el SHA-256 declarado es el del PDF oficial v2.
//   4. Web service: endpoints, acciones y la WS-Policy de los WSDL oficiales
//      (habilitación y producción) que soap.ts implementa.
//   5. Documentos: factura (descuentos, IVA 19/5/exento, ReteIVA y
//      ReteRenta), factura excluida, factura en USD con tasa a COP, consumidor
//      final, nota crédito, nota débito y contenedor, armados y firmados con
//      una cadena de prueba. Cuadres de la DIAN (FAV06, LegalMonetaryTotal,
//      holgura) y rechazos ANTES de enviar.
//   6. Respuestas: parsers contra las respuestas del Anexo (7.9.3, 7.10.3,
//      7.12.3) y el fault REAL de habilitación ante un certificado no avalado.
//   7. Esquema y firma (herramientas externas): xmllint valida cada documento
//      contra los XSD oficiales (UBL 2.1 + extensiones DIAN); xmllint --c14n
//      confirma que el serializador escribe en forma canónica; el validador
//      XMLDSig del JDK verifica la firma de cada documento y del sobre SOAP.
//      Controles negativos prueban que ambos validan de verdad. Sin xmllint o
//      sin java se avisa y se omite (DIAN_HERRAMIENTAS_REQUIRED=1 las vuelve
//      obligatorias).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { calculateDocumentTotals } from '../packages/elements/src/engine.ts';
import { RailDatosError } from '../src/lib/fiscal/latam/errores.ts';
import { cadenaCufe, codigoSeguridadSoftware, cufe, textoQr, urlQr, valorCufe } from '../src/lib/fiscal/latam/dian/cufe.ts';
import {
    ALG, CONCEPTOS_NOTA_CREDITO, CONCEPTOS_NOTA_DEBITO, CONSUMIDOR_FINAL, CUSTOMIZATION_ID, DIAN_ENDPOINTS, MEDIO_PAGO_NO_DEFINIDO,
    NIT_DIAN, POLITICA_FIRMA, RESPONSABILIDADES, SOAP_ACTION_BASE, TARIFAS_IVA, TIPO_DOCUMENTO, TIPOS_DOCUMENTO, TRIBUTO, TRIBUTOS_PARTE, UNIDAD,
} from '../src/lib/fiscal/latam/dian/constantes.ts';
import { DEPARTAMENTOS, MUNICIPIOS } from '../src/lib/fiscal/latam/dian/municipios.ts';
import {
    armarBase, avisoNumeracion, conNumero, conceptoNotaCredito, dvNit, fichaClienteDian, momentoColombia, nitValido, resolverAdquiriente,
} from '../src/lib/fiscal/latam/dian/comprobante.ts';
import { contenedorXml, documentoXml, nombresArchivo } from '../src/lib/fiscal/latam/dian/ubl.ts';
import { documento, serializar } from '../src/lib/fiscal/latam/dian/xml.ts';
import { firmarDocumento, nombreRfc2253 } from '../src/lib/fiscal/latam/dian/firma.ts';
import { cadenaDesde, certificadosDePkcs12, problemaDeUso } from '../src/lib/fiscal/latam/dian/cadena.ts';
import {
    cuerpoGetStatus, cuerpoSendBillSync, DianFaultError, parsearGetStatus, parsearGetStatusZip, parsearSendBillSync,
    parsearSendTestSetAsync, sobreDian, zipDocumento,
} from '../src/lib/fiscal/latam/dian/soap.ts';
import { esProcesadoAntes, interpretarMensaje, mensajeRechazo } from '../src/lib/fiscal/latam/dian/errores.ts';
import { representacionDian } from '../src/lib/fiscal/latam/dian/representacion.ts';
import { armarSetDePruebas, cantidadesValidas } from '../src/lib/fiscal/latam/dian/habilitacion.ts';
import { departamentosOficiales, leerXlsx, municipiosOficiales } from './dian-tablas.mjs';
import { cadenaDePrueba } from './dian-cadena-prueba.mjs';

const FIX = fileURLToPath(new URL('./fixtures/dian/', import.meta.url));
const leer = (f) => readFileSync(join(FIX, f), 'utf8');
const rechaza = (fn, re, msg) => assert.throws(fn, (e) => e instanceof RailDatosError && re.test(e.message), msg);
const avisos = [];

// ── 1. CUFE y CUDE: ejemplos oficiales del Anexo Técnico 1.9 ─────────────────
{
    const factura = {
        numero: '323200000129', fecha: '2019-01-16', hora: '10:53:10-05:00', valorBruto: '1500000.00', iva: '285000.00', inc: '0.00',
        ica: '0.00', total: '1785000.00', nitEmisor: '700085371', numAdquiriente: '800199436',
        clave: '693ff6f2a553c3646a063436fd4dd9ded0311471', tipoAmbiente: '1',
    };
    assert.equal(cadenaCufe(factura), '3232000001292019-01-1610:53:10-05:001500000.0001285000.00040.00030.001785000.00700085371800199436693ff6f2a553c3646a063436fd4dd9ded03114711', 'composición del CUFE [AT 11.2]');
    assert.equal(cufe(factura), '8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4', 'CUFE del ejemplo oficial [AT 11.2]');

    const transmision = {
        numero: '8110007871', fecha: '2019-02-20', hora: '16:46:55-05:00', valorBruto: '235.28', iva: '19.00', inc: '0.00', ica: '8.28',
        total: '262.56', nitEmisor: '900373076', numAdquiriente: '8355990', clave: '12345', tipoAmbiente: '2',
    };
    assert.equal(cadenaCufe(transmision), '81100078712019-02-2016:46:55-05:00235.280119.00040.00038.28262.569003730768355990123452', 'composición del CUDE [AT 11.4.1]');
    assert.equal(cufe(transmision), '955327eb55f8bdf16d069358a063d87e1577a292cb088ec186ed60bbc38e750b7b3980659b278ead789b95f9c51a9ef7', 'CUDE del documento de transmisión [AT 11.4.1]');

    const notaCredito = {
        numero: '8110007871', fecha: '2019-01-12', hora: '07:00:00-05:00', valorBruto: '5000.00', iva: '950.00', inc: '0.00', ica: '0.00',
        total: '5950.00', nitEmisor: '900373076', numAdquiriente: '8355990', clave: '12301', tipoAmbiente: '1',
    };
    assert.equal(cadenaCufe(notaCredito), '81100078712019-01-1207:00:00-05:005000.0001950.00040.00030.005950.009003730768355990123011', 'composición del CUDE de nota crédito [AT 11.4.3]');
    assert.equal(cufe(notaCredito), '907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168', 'CUDE de nota crédito [AT 11.4.3]');

    const notaDebito = {
        numero: 'ND1001', fecha: '2019-01-18', hora: '10:58:00-05:00', valorBruto: '30000.00', iva: '0.00', inc: '2400.00', ica: '0.00',
        total: '32400.00', nitEmisor: '900197264', numAdquiriente: '10254102', clave: '10201', tipoAmbiente: '2',
    };
    assert.equal(cadenaCufe(notaDebito), 'ND10012019-01-1810:58:00-05:0030000.00010.00042400.00030.0032400.0090019726410254102102012', 'composición del CUDE de nota débito [AT 11.4.5]');
    // Errata del Anexo: el hash impreso (b9483dc2…) no es el SHA-384 de su propia composición.
    assert.notEqual(cufe(notaDebito), 'b9483dc2a17167feedf37b6bd67c4204e7b601933e0e389cffbd545e4d0ec370b403cbb41ff656776cb6cb5d8348ecd4');

    // Decimales TRUNCADOS, no redondeados [AT 11.2: "decimales a dos (2) dígitos truncados"].
    assert.equal(valorCufe('10.999'), '10.99');
    assert.equal(valorCufe(5), '5.00');
    assert.equal(codigoSeguridadSoftware('a', 'b', 'c'), createHash('sha384').update('abc').digest('hex'), 'SoftwareSecurityCode = SHA-384(Id + PIN + número) [AT 11.8]');
    assert.equal(urlQr('x', 'homologacion'), 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=x');
    assert.equal(urlQr('x', 'produccion'), 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=x');

    // DV del NIT: el de la DIAN es 4 [AT FAB34].
    assert.equal(dvNit(NIT_DIAN.nit), NIT_DIAN.dv);
    assert.deepEqual(nitValido('800.197.268-4'), { nit: '800197268', dv: '4' });
    assert.equal(nitValido('800197268-5'), null, 'un DV equivocado no pasa');
}

// ── 2. Tablas oficiales de la Caja de herramientas ───────────────────────────
{
    const tabla = (archivo, col = 0, val = 1) => new Map(leerXlsx(archivo).slice(1).filter((f) => f[col] && f[val]).map((f) => [String(f[col]).trim(), String(f[val]).trim()]));
    const limpio = (s) => s.replace(/\s*\*+$/, '').trim();

    const docs = tabla('13.2.1-tipos-documento.xlsx');
    for (const t of TIPOS_DOCUMENTO) assert.ok(docs.has(t.id), `tipo de documento ${t.id} en la tabla 13.2.1`);
    assert.equal(limpio(docs.get('31')), 'NIT');
    assert.equal(limpio(docs.get('13')), 'Cédula de ciudadanía');
    assert.ok(docs.has(CONSUMIDOR_FINAL.schemeName), 'consumidor final: cédula (13)');

    const tributos = tabla('13.2.2-tributos.xlsx');
    for (const t of Object.values(TRIBUTO)) assert.equal(tributos.get(t.id), t.nombre, `tributo ${t.id} [13.2.2]`);

    const resp = tabla('13.2.6.1-responsabilidades.xlsx');
    for (const r of RESPONSABILIDADES) assert.equal(limpio(resp.get(r.id) ?? ''), r.nombre, `responsabilidad ${r.id} [13.2.6.1]`);

    const partes = tabla('13.2.6.2-tributos-partes.xlsx');
    for (const t of TRIBUTOS_PARTE) assert.equal(limpio(partes.get(t.id) ?? ''), t.nombre, `tributo de la parte ${t.id} [13.2.6.2]`);

    const nc = tabla('13.2.4-conceptos-nota-credito.xlsx');
    assert.deepEqual(Object.fromEntries(nc), CONCEPTOS_NOTA_CREDITO, 'conceptos de nota crédito [13.2.4], texto literal');
    const nd = tabla('13.2.5-conceptos-nota-debito.xlsx');
    assert.deepEqual(Object.fromEntries(nd), CONCEPTOS_NOTA_DEBITO, 'conceptos de nota débito [13.2.5]');

    const tiposDoc = tabla('13.1.3-tipos-documento-electronico.xlsx');
    assert.equal(tiposDoc.get(TIPO_DOCUMENTO.factura), 'Factura electrónica de Venta');
    assert.equal(tiposDoc.get(TIPO_DOCUMENTO.notaCredito), 'Nota Crédito');
    assert.equal(tiposDoc.get(TIPO_DOCUMENTO.notaDebito), 'Nota Débito');
    assert.match(tabla('13.1.5.1-tipos-operacion.xlsx').get(CUSTOMIZATION_ID.factura), /^Estándar/);
    assert.match(tabla('13.1.5.2-tipos-nota-credito.xlsx').get(CUSTOMIZATION_ID.notaCredito), /referencia una factura/);
    assert.match(tabla('13.1.5.3-tipos-nota-debito.xlsx').get(CUSTOMIZATION_ID.notaDebito), /referencia una factura/);

    // Tarifas de IVA: las filas "IVA" de la tabla 13.3.11 hasta el siguiente impuesto.
    const tarifas = leerXlsx('13.3.11-tarifas.xlsx');
    const ini = tarifas.findIndex((f) => String(f[0]).trim() === 'IVA');
    const fin = tarifas.findIndex((f, i) => i > ini && String(f[0]).trim() && String(f[0]).trim() !== 'IVA');
    const iva = tarifas.slice(ini + 1, fin).map((f) => String(f[4]).trim()).filter(Boolean).map(Number);
    assert.deepEqual([...iva].sort((a, b) => a - b), [...TARIFAS_IVA], 'tarifas de IVA [13.3.11]');
    assert.ok(tarifas.slice(ini + 1, fin).some((f) => /^Excluido/.test(String(f[1]).trim()) && /no se debe reportar/.test(String(f[6]))), 'excluido: sin TaxTotal [13.3.11]');

    const medios = leerXlsx('13.3.4.2-medios-pago.xlsx').flatMap((f) => [[f[0], f[1]], [f[2], f[3]]]);
    assert.ok(medios.some(([c, m]) => String(c).trim() === MEDIO_PAGO_NO_DEFINIDO && /Instrumento no definido/.test(String(m))), 'medio de pago 1 [13.3.4.2]');
    assert.ok(leerXlsx('13.3.6-unidades.xlsx').some((f) => f.some((c, i) => String(c).trim() === UNIDAD && String(f[i + 1]).trim() === 'Unidad')), 'unidad 94 [13.3.6]');

    assert.deepEqual({ ...MUNICIPIOS }, Object.fromEntries(municipiosOficiales().map((m) => [m.codigo, m.nombre])), 'municipios.ts es la tabla 13.4.3 (regenérala con node scripts/dian-tablas.mjs municipios)');
    assert.deepEqual({ ...DEPARTAMENTOS }, Object.fromEntries(departamentosOficiales().map((d) => [d.codigo, d.nombre])), 'departamentos [13.4.2]');
    assert.equal(MUNICIPIOS['11001'], 'BOGOTÁ, D.C.');
}

// ── 3. Política de firma ─────────────────────────────────────────────────────
assert.equal(createHash('sha256').update(readFileSync(join(FIX, 'politicadefirmav2.pdf'))).digest('base64'), POLITICA_FIRMA.hashSha256, 'hash de la política de firma v2');

// ── 4. Web service: WSDL y WS-Policy oficiales ───────────────────────────────
{
    for (const [entorno, dir] of [['homologacion', 'habilitacion'], ['produccion', 'produccion']]) {
        assert.ok(leer(`wsdl/${dir}/WcfDianCustomerServices.wsdl`).includes(`<soap12:address location="${DIAN_ENDPOINTS[entorno]}"/>`), `endpoint de ${entorno} [WSDL soap12:address]`);
        const wsdl = leer(`wsdl/${dir}/wsdl0.wsdl`);
        for (const op of ['SendBillSync', 'SendTestSetAsync', 'GetStatus', 'GetStatusZip', 'GetNumberingRange']) {
            assert.ok(wsdl.includes(`soapAction="${SOAP_ACTION_BASE}${op}"`), `acción ${op}`);
        }
        assert.ok(/<sp:HttpsToken RequireClientCertificate="false"\/>/.test(wsdl), 'sin TLS mutuo');
        assert.ok(wsdl.includes('<sp:Basic256Sha256Rsa15/>'), 'RSA-SHA256 y SHA-256');
        assert.ok(wsdl.includes('<sp:IncludeTimestamp/>'), 'Timestamp');
        assert.ok(/<sp:SignedParts><sp:Header Name="To" Namespace="http:\/\/www.w3.org\/2005\/08\/addressing"\/><\/sp:SignedParts>/.test(wsdl), 'se firma wsa:To');
        const xsd0 = leer(`wsdl/${dir}/xsd0.xsd`);
        assert.ok(/name="SendBillSync"[\s\S]*?name="fileName"[\s\S]*?name="contentFile"/.test(xsd0), 'SendBillSync(fileName, contentFile)');
        assert.ok(/name="SendTestSetAsync"[\s\S]*?name="fileName"[\s\S]*?name="contentFile"[\s\S]*?name="testSetId"/.test(xsd0), 'SendTestSetAsync(fileName, contentFile, testSetId)');
    }
}

// ── 5. Documentos ────────────────────────────────────────────────────────────
const cadena = cadenaDePrueba('900373076');
const FIRMANTE = { cadena: cadena.cadena, llavePem: cadena.llavePem };
const EMISOR = {
    nit: '900373076', dv: dvNit('900373076'), razonSocial: 'Negocio de Prueba S.A.S.', nombreComercial: 'Negocio', tipoPersona: '1',
    responsabilidades: ['O-13', 'O-23'], tributo: '01', direccion: { municipio: '11001', linea: 'Calle 100 # 10-20', postal: '110111' },
};
const RESOLUCION = { numero: '18760000001', prefijo: 'SETP', desde: 990000000, hasta: 995000000, vigenteDesde: '2019-01-19', vigenteHasta: '2030-01-19' };
const CLAVES = { claveTecnica: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c', pin: '12345' };
const SOFTWARE = '56f2ae4e-9812-4fad-9255-08fcfcd5ccb0';
const AHORA = new Date('2026-10-09T15:00:00Z');
const CLIENTE = resolverAdquiriente({ nombre: 'Cliente S.A.S.', identificacion: '800.197.268-4', pais: 'CO', correo: 'compras@cliente.co', ficha: { tipoPersona: '1', tributo: '01', responsabilidades: ['O-13'] } });

function lineasDe(items, opts = {}) {
    const t = calculateDocumentTotals(items, { roundLines: 2, ...opts });
    return {
        lineas: t.lineas.map((l) => ({ description: l.descripcion, quantity: l.cantidad, unitPrice: l.base / l.cantidad, taxRate: l.tax_rate, subtotal: l.base, taxAmount: l.impuesto, total: l.total, discount: l.descuento || undefined })),
        totales: { subtotal: t.subtotal, taxes: t.impuestos, total: t.total, currency: 'COP', retenciones: t.retenciones, retencionTotal: t.retencionTotal, discountTotal: t.descuentoTotal },
    };
}
const factura = (over = {}, items, opts) => {
    const d = lineasDe(items ?? [
        { descripcion: 'Consultoría', cantidad: 2, precio_unitario: 1_000_000, tax_rate: 0.19 },
        { descripcion: 'Libro técnico', cantidad: 1, precio_unitario: 50_000, tax_rate: 0 },
        { descripcion: 'Servicio de soporte', cantidad: 3, precio_unitario: 33_333.33, tax_rate: 0.05 },
    ], opts ?? { descuento: { tipo: 'porcentaje', valor: 10 }, retenciones: [
        { nombre: 'ReteIVA 15%', tipo: 'ret_iva', tasa: 0.15, base: 'impuesto' },
        { nombre: 'ReteFuente 2,5%', tipo: 'ret_isr', tasa: 0.025 },
    ] });
    return armarBase({
        clase: 'factura', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, lineas: d.lineas, totales: d.totales,
        tratamientoSinIva: 'exento', vencimiento: '2026-11-08', resolucion: RESOLUCION, softwareId: SOFTWARE, ...over,
    });
};

const DOCS = {};
{
    const base = factura();
    // FAV06: PriceAmount × BaseQuantity − descuento = LineExtensionAmount; LegalMonetaryTotal cuadra con las líneas.
    let bruto = 0;
    for (const l of base.lineas) {
        assert.equal(Math.round(Number(l.precio) * Number(l.cantidad) * 100) - Math.round(Number(l.descuento ?? 0) * 100), Math.round(Number(l.neto) * 100), `FAV06 línea ${l.numero}`);
        bruto += Math.round(Number(l.neto) * 100);
    }
    assert.equal(Math.round(Number(base.totales.bruto) * 100), bruto, 'LineExtensionAmount = suma de líneas');
    assert.equal(Math.round(Number(base.totales.conImpuestos) * 100), bruto + Math.round(Number(base.totales.iva) * 100), 'TaxInclusiveAmount = bruto + IVA');
    assert.equal(base.totales.pagar, base.totales.conImpuestos, 'PayableAmount sin retenciones [AT 11.9.1]');
    assert.deepEqual(base.iva.map((s) => s.tarifa).sort(), ['0.00', '19.00', '5.00'].sort(), 'IVA por tarifa, con la exenta en 0.00');
    assert.deepEqual(base.retenciones.map((r) => r.tributo.id), ['05', '06'], 'ReteIVA (05) y ReteRenta (06)');
    assert.ok(base.lineas.every((l) => l.descuento), 'el descuento de documento viaja por línea');

    const sol = conNumero(base, 990000001, AHORA, CLAVES);
    assert.equal(sol.id, 'SETP990000001');
    assert.equal(sol.fecha, '2026-10-09');
    assert.equal(sol.hora, '10:00:00-05:00', 'hora de Colombia');
    assert.equal(sol.firmadoAt, '2026-10-09T10:00:00-05:00', 'IssueDate = fecha de firma [FAD09e]');
    assert.equal(sol.formaPago, '2', 'vencimiento posterior: crédito');
    assert.equal(sol.cufe, cufe({
        numero: sol.id, fecha: sol.fecha, hora: sol.hora, valorBruto: sol.totales.bruto, iva: sol.totales.iva, inc: 0, ica: 0,
        total: sol.totales.pagar, nitEmisor: EMISOR.nit, numAdquiriente: CLIENTE.numero, clave: CLAVES.claveTecnica, tipoAmbiente: '2',
    }));
    assert.deepEqual(nombresArchivo(sol), { xml: 'fv0900373076000263B023381.xml', zip: 'z0900373076000263B023381.zip' }, 'nombres del Anexo 6.5.7/6.5.8');
    DOCS.factura = sol;

    // Excluido: sin TaxTotal en la línea al 0 % ni en el documento si no hay otro IVA.
    const excl = conNumero(factura({ tratamientoSinIva: 'excluido' }, [{ descripcion: 'Servicio educativo', cantidad: 1, precio_unitario: 100_000, tax_rate: 0 }], {}), 990000002, AHORA, CLAVES);
    assert.equal(excl.iva.length, 0);
    assert.equal(excl.lineas[0].iva, null);
    DOCS.excluido = excl;

    // USD con tasa a COP congelada (regla 22).
    const usd = lineasDe([{ descripcion: 'Licencia', cantidad: 1, precio_unitario: 1000, tax_rate: 0.19 }], {});
    DOCS.usd = conNumero(armarBase({
        clase: 'factura', entorno: 'homologacion', emisor: EMISOR, adquiriente: resolverAdquiriente({ nombre: 'Buyer Inc.', identificacion: 'US-12-3456789', pais: 'US', correo: null, ficha: { tipoPersona: '1' } }),
        lineas: usd.lineas, totales: { ...usd.totales, currency: 'USD', exchangeRate: 4012.55, ledgerCurrency: 'COP' }, fechaTasa: '2026-10-08',
        tratamientoSinIva: null, resolucion: RESOLUCION, softwareId: SOFTWARE,
    }), 990000003, AHORA, CLAVES);
    assert.deepEqual(DOCS.usd.tasaCambio, { tasa: '4012.55', fecha: '2026-10-08' });
    assert.equal(DOCS.usd.adquiriente.tipoDocumento, '50', 'cliente del exterior: NIT de otro país');

    const cf = resolverAdquiriente({ nombre: 'Juan', identificacion: '', pais: 'CO', correo: null, ficha: null });
    assert.equal(cf.numero, CONSUMIDOR_FINAL.id);
    assert.deepEqual(cf.responsabilidades, ['R-99-PN']);
    DOCS.consumidor = conNumero(factura({ adquiriente: cf }), 990000004, AHORA, CLAVES);

    // Nota crédito (anulación) y nota débito.
    const total = Number(sol.totales.pagar);
    assert.equal(conceptoNotaCredito(total, total), '2');
    assert.equal(conceptoNotaCredito(total / 2, total), '3');
    const ncL = lineasDe([{ descripcion: 'Devolución', cantidad: 1, precio_unitario: 100_000, tax_rate: 0.19 }], {});
    DOCS.notaCredito = conNumero(armarBase({
        clase: 'nota_credito', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, lineas: ncL.lineas, totales: ncL.totales,
        tratamientoSinIva: null, prefijoNotas: 'NC', referencia: { id: sol.id, cufe: sol.cufe, fecha: sol.fecha, concepto: '3' }, softwareId: SOFTWARE,
    }), 1, AHORA, CLAVES);
    assert.equal(DOCS.notaCredito.algoritmo, 'CUDE-SHA384');
    assert.equal(DOCS.notaCredito.referencia.descripcion, CONCEPTOS_NOTA_CREDITO['3']);
    DOCS.notaDebito = conNumero(armarBase({
        clase: 'nota_debito', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, lineas: ncL.lineas, totales: ncL.totales,
        tratamientoSinIva: null, prefijoNotas: 'ND', referencia: { id: sol.id, cufe: sol.cufe, fecha: sol.fecha, concepto: '1' }, softwareId: SOFTWARE,
    }), 1, AHORA, CLAVES);

    // Rechazos ANTES de enviar.
    rechaza(() => factura({ tratamientoSinIva: null }), /0 %|exent|exclu/i, 'una línea al 0 % sin decidir exento/excluido');
    rechaza(() => factura({}, [{ descripcion: 'X', cantidad: 1, precio_unitario: 100, tax_rate: 0.08 }], {}), /tarifa|IVA/i, 'una tarifa que no es de IVA');
    rechaza(() => armarBase({ clase: 'factura', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, ...lineasDe([{ descripcion: 'X', cantidad: 1, precio_unitario: 100, tax_rate: 0.19 }], {}), totales: { subtotal: 100, taxes: 19, total: 119, currency: 'USD' }, tratamientoSinIva: null, resolucion: RESOLUCION, softwareId: SOFTWARE }), /tipo de cambio|COP/i, 'moneda extranjera sin tasa a COP');
    rechaza(() => conNumero(factura(), 995000001, AHORA, CLAVES), /rango/i, 'fuera del rango de la resolución');
    rechaza(() => conNumero(factura({ resolucion: { ...RESOLUCION, vigenteHasta: '2026-01-01' } }), 990000001, AHORA, CLAVES), /venció/i, 'resolución vencida');
    rechaza(() => conNumero(factura(), 990000001, AHORA, { ...CLAVES, pin: '1' }), /PIN/i, 'sin PIN');
    rechaza(() => conNumero(factura(), 990000001, AHORA, { ...CLAVES, claveTecnica: '' }), /clave técnica/i, 'sin clave técnica');
    rechaza(() => resolverAdquiriente({ nombre: 'Empresa', identificacion: '900373076', pais: 'CO', correo: null, ficha: null }), /tipo de documento/i, 'NIT sin DV ni tipo de documento');
    rechaza(() => resolverAdquiriente({ nombre: 'Empresa', identificacion: '900373076-1', pais: 'CO', correo: null, ficha: null }), /dígito/i, 'DV equivocado');
    rechaza(() => resolverAdquiriente({ nombre: 'Empresa', identificacion: '800197268-4', pais: 'CO', correo: null, ficha: { tipoPersona: '1' } }), /IVA/i, 'NIT sin responsabilidad frente al IVA');
    rechaza(() => resolverAdquiriente({ nombre: 'Buyer', identificacion: '', pais: 'US', correo: null, ficha: null }), /exterior/i, 'cliente del exterior sin identificación');
    rechaza(() => factura({ emisor: { ...EMISOR, direccion: { municipio: '99999', linea: 'x' } } }), /Datos fiscales/i, 'municipio fuera de la tabla');
    assert.deepEqual(fichaClienteDian({ tipoDocumento: '31', tipoPersona: '3', tributo: 'XX', responsabilidades: ['O-13', 'O-99'] }), { tipoDocumento: '31', responsabilidades: ['O-13'] }, 'la ficha solo guarda códigos oficiales');

    const aviso = avisoNumeracion(RESOLUCION, 994999990, AHORA);
    assert.equal(aviso.quedan, 10);
    assert.equal(aviso.proximoAlFin, true);
    assert.equal(avisoNumeracion(RESOLUCION, 990000010, AHORA).proximoAlFin, false);

    // Set de pruebas: facturas numeradas en el rango de pruebas y notas que referencian una factura del set.
    rechaza(() => cantidadesValidas({ facturas: 0, notasCredito: 1, notasDebito: 1 }), /al menos una factura/);
    const set = armarSetDePruebas({ emisor: EMISOR, resolucion: RESOLUCION, prefijoNotas: 'NC', softwareId: SOFTWARE, claves: CLAVES, cantidades: { facturas: 2, notasCredito: 1, notasDebito: 1 }, numeroFactura: 990000010, numeroNota: 5, ahora: AHORA });
    assert.deepEqual(set.map((s) => s.id), ['SETP990000010', 'SETP990000011', 'NC5', 'NC6']);
    assert.ok(set.every((s) => s.entorno === 'homologacion' && s.adquiriente.consumidorFinal));
    assert.equal(set[2].referencia.cufe, set[0].cufe);
    DOCS.setFactura = set[0];

    // Representación gráfica: QR del numeral 11.7 en cada página y el CUFE en el pie.
    const rep = representacionDian({ solicitud: sol, validado: { fecha: sol.fecha, hora: sol.hora }, homologacion: true });
    assert.equal(rep.qrUrl, textoQr({ numero: sol.id, fecha: sol.fecha, hora: sol.hora, nitEmisor: EMISOR.nit, docAdquiriente: CLIENTE.numero, valorBruto: sol.totales.bruto, iva: sol.totales.iva, otrosImpuestos: 0, total: sol.totales.pagar, cufe: sol.cufe, url: sol.qrUrl }));
    assert.equal(rep.qrCadaPagina, true);
    assert.ok(rep.pie.includes(sol.cufe) && rep.prueba === true);
    assert.ok(rep.filas.some((f) => f.k === 'Autorización de numeración' && f.v.includes('18760000001')));
    assert.equal(momentoColombia(new Date('2026-01-01T04:59:59Z')).fecha, '2025-12-31', 'el día civil es el de Colombia');
}

// ── 6. Respuestas ────────────────────────────────────────────────────────────
{
    const sync = await parsearSendBillSync(leer('respuesta-sendbillsync-anexo.xml'));
    assert.equal(sync.isValid, false);
    assert.equal(sync.statusCode, '99');
    assert.equal(sync.mensajes.length, 4);
    const ms = sync.mensajes.map((m) => interpretarMensaje(m, !sync.isValid));
    assert.deepEqual(ms.map((m) => m.regla), ['AC38b', 'ZB01', 'AA08d', 'AA09']);
    assert.ok(ms.every((m) => m.tipo === 'rechazo'));
    assert.match(mensajeRechazo(ms), /regla AC38b/);

    const zip = await parsearGetStatusZip(leer('respuesta-getstatuszip-anexo.xml'));
    assert.equal(zip.length, 1);
    assert.equal(zip[0].isValid, true);
    assert.equal(zip[0].statusCode, '00');
    assert.deepEqual(zip[0].mensajes.map((m) => interpretarMensaje(m, false)).map((m) => [m.regla, m.tipo]), [['FAJ40', 'notificacion'], ['FAJ41', 'notificacion']]);

    const set = await parsearSendTestSetAsync(leer('respuesta-sendtestsetasync-anexo.xml'));
    assert.equal(set.zipKey, '358f9538-1f80-4ed5-a3f6-aaa1ef36bebd');
    assert.deepEqual(set.errores, []);

    // Fault REAL del ambiente de habilitación ante un certificado autofirmado (2026-10-09).
    await assert.rejects(parsearGetStatus(leer('respuesta-fault-certificado-no-confiable.xml')), (e) => e instanceof DianFaultError && e.noProcesado && e.codigo === 's:Client');

    assert.ok(esProcesadoAntes(interpretarMensaje('Regla: 90, Rechazo: Documento procesado anteriormente.', true)));
    assert.deepEqual(interpretarMensaje('Regla: FAJ71, Notificación: correo', true), { regla: 'FAJ71', tipo: 'notificacion', texto: 'correo' });
    assert.match(mensajeRechazo([interpretarMensaje('Regla: FAD06, Rechazo: CUFE', true)]), /clave técnica/);
    assert.match(mensajeRechazo([interpretarMensaje('Regla: FAK24, Rechazo: x', true)]), /datos del cliente/);
}

// ── 7. Esquema, forma canónica y firma ───────────────────────────────────────
const tiene = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const obligatorias = process.env.DIAN_HERRAMIENTAS_REQUIRED === '1';
const dir = mkdtempSync(join(tmpdir(), 'dian-check-'));
try {
    // La cadena: se reconstruye del .p12 y los usos de llave cumplen la política.
    const p12 = cadena.p12('clave');
    assert.equal(cadenaDesde(cadena.cadena[0], certificadosDePkcs12(p12, 'clave')).length, 3);
    rechaza(() => cadenaDesde(cadena.cadena[0], certificadosDePkcs12(cadena.p12('clave', false), 'clave')), /cadena/i, 'sin la cadena completa');
    assert.equal(problemaDeUso(cadena.cadena[0]), null);
    assert.match(nombreRfc2253((await import('node-forge')).default.pki.certificateFromPem(cadena.cadena[0]).issuer), /^1\.2\.840\.113549\.1\.9\.1=#16[0-9a-f]+,CN=Subordinada de pruebas Cord,O=Cord Pruebas,C=CO$/, 'IssuerName en RFC 2253, emailAddress como OID=#hex');

    const archivos = {};
    for (const [k, s] of Object.entries(DOCS)) {
        archivos[k] = join(dir, `${k}.xml`);
        writeFileSync(archivos[k], firmarDocumento(documentoXml(s), FIRMANTE, s.firmadoAt));
    }
    const contenedor = firmarDocumento(contenedorXml({
        solicitud: DOCS.factura, xmlDocumento: readFileSync(archivos.factura, 'utf8'), xmlRespuesta: '<ApplicationResponse/>',
        validadoFecha: DOCS.factura.fecha, validadoHora: DOCS.factura.hora, fecha: DOCS.factura.fecha, hora: DOCS.factura.hora,
    }), FIRMANTE, DOCS.factura.firmadoAt, { cdata: true });
    archivos.contenedor = join(dir, 'contenedor.xml');
    writeFileSync(archivos.contenedor, contenedor);
    assert.ok(contenedor.includes('<![CDATA[<?xml'), 'el contenedor lleva el documento como CDATA');
    archivos.sobre = join(dir, 'sobre.xml');
    const zipB64 = Buffer.from(zipDocumento('fv.xml', readFileSync(archivos.factura, 'utf8'))).toString('base64');
    writeFileSync(archivos.sobre, sobreDian('homologacion', 'SendBillSync', cuerpoSendBillSync('z.zip', zipB64), { certPem: cadena.cadena[0], llavePem: cadena.llavePem }));
    assert.equal(strFromU8(unzipSync(Buffer.from(zipB64, 'base64'))['fv.xml']), readFileSync(archivos.factura, 'utf8'), 'el zip lleva el XML intacto');

    if (!tiene('xmllint', ['--version'])) {
        if (obligatorias) throw new Error('xmllint no está disponible y DIAN_HERRAMIENTAS_REQUIRED=1');
        avisos.push('xmllint no está instalado: se omite la validación contra los XSD oficiales y la forma canónica');
    } else {
        const X = join(FIX, 'xsd');
        const envoltorio = join(dir, 'envoltorio.xsd');
        writeFileSync(envoltorio, `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:cord:envoltorio" elementFormDefault="qualified">
<xsd:import namespace="dian:gov:co:facturaelectronica:Structures-2-1" schemaLocation="${join(X, 'maindoc/DIAN_UBL_Structures.xsd')}"/>
<xsd:import namespace="http://uri.etsi.org/01903/v1.3.2#" schemaLocation="${join(X, 'common/UBL-XAdESv132-2.1.xsd')}"/>
<xsd:import namespace="http://uri.etsi.org/01903/v1.4.1#" schemaLocation="${join(X, 'common/UBL-XAdESv141-2.1.xsd')}"/>
<xsd:import namespace="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" schemaLocation="${join(X, 'maindoc/UBL-Invoice-2.1.xsd')}"/>
<xsd:import namespace="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" schemaLocation="${join(X, 'maindoc/UBL-CreditNote-2.1.xsd')}"/>
<xsd:import namespace="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2" schemaLocation="${join(X, 'maindoc/UBL-DebitNote-2.1.xsd')}"/>
<xsd:import namespace="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2" schemaLocation="${join(X, 'maindoc/UBL-AttachedDocument-2.1.xsd')}"/>
</xsd:schema>`);
        // El XSD de DianExtensions enumera en ProviderID/@schemeID los tipos de
        // documento, pero el Anexo (FAB22, FAB34) y TODOS los ejemplos oficiales
        // ponen ahí el DV del NIT: la DIAN valida contra el Anexo. Es la única
        // diferencia que se tolera, y se comprueba que el ejemplo oficial la tiene.
        const DISCREPANCIA = /element (ProviderID|AuthorizationProviderID): Schemas validity error : Element '\{dian:gov:co:facturaelectronica:Structures-2-1\}\1', attribute 'schemeID': \[facet 'enumeration'\]/;
        const validar = (file) => {
            const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', envoltorio, file], { encoding: 'utf8' });
            return r.stderr.split('\n').filter((l) => l.trim() && !/ validates$/.test(l) && !/ fails to validate$/.test(l));
        };
        const oficial = validar(join(FIX, 'ejemplos/Generica.xml'));
        assert.ok(oficial.some((l) => DISCREPANCIA.test(l)), 'el ejemplo oficial tiene la misma diferencia con el XSD');
        for (const [k, f] of Object.entries(archivos)) {
            if (k === 'sobre') continue;
            const errores = validar(f).filter((l) => !DISCREPANCIA.test(l));
            assert.deepEqual(errores, [], `${k}: el XML no cumple los XSD oficiales`);
        }
        // Control negativo: un elemento fuera de orden lo rechaza el esquema.
        const malo = join(dir, 'malo.xml');
        writeFileSync(malo, readFileSync(archivos.factura, 'utf8').replace(/(<cbc:IssueDate>[^<]*<\/cbc:IssueDate>)(<cbc:IssueTime>[^<]*<\/cbc:IssueTime>)/, '$2$1'));
        assert.ok(validar(malo).filter((l) => !DISCREPANCIA.test(l)).length > 0, 'xmllint valida de verdad (control negativo)');

        // Forma canónica: el texto que firma Cord es el C14N de libxml2.
        for (const s of [DOCS.factura, DOCS.notaCredito]) {
            const raiz = documentoXml(s);
            const f = join(dir, 'c14n.xml');
            writeFileSync(f, documento(raiz));
            assert.equal(execFileSync('xmllint', ['--c14n', f], { encoding: 'utf8' }), serializar(raiz), 'serializar() escribe C14N');
        }
        const raizC = contenedorXml({ solicitud: DOCS.factura, xmlDocumento: '<a>&amp;</a>', xmlRespuesta: '<b/>', validadoFecha: '2026-10-09', validadoHora: '10:00:00-05:00', fecha: '2026-10-09', hora: '10:00:00-05:00' });
        const fc = join(dir, 'c14n-cdata.xml');
        writeFileSync(fc, documento(raizC, { cdata: true }));
        assert.equal(execFileSync('xmllint', ['--c14n', fc], { encoding: 'utf8' }), serializar(raizC), 'C14N de un CDATA');
    }

    if (!tiene('java', ['-version'])) {
        if (obligatorias) throw new Error('java no está disponible y DIAN_HERRAMIENTAS_REQUIRED=1');
        avisos.push('java no está instalado: se omite la verificación independiente de las firmas');
    } else {
        const verificador = fileURLToPath(new URL('./dian-verificar-firma.java', import.meta.url));
        const r = spawnSync('java', [verificador, ...Object.values(archivos)], { encoding: 'utf8' });
        assert.equal(r.status, 0, `firmas inválidas según el JDK:\n${r.stdout}${r.stderr}`);
        assert.equal((r.stdout.match(/: VALIDA /g) ?? []).length, Object.keys(archivos).length);
        // Control negativo: un importe alterado rompe la firma.
        const alterado = join(dir, 'alterado.xml');
        writeFileSync(alterado, readFileSync(archivos.factura, 'utf8').replace(/(<cbc:PayableAmount currencyID="COP">)(\d)/, (m, a, d) => `${a}${d === '9' ? '8' : '9'}`));
        const neg = spawnSync('java', [verificador, alterado], { encoding: 'utf8' });
        assert.notEqual(neg.status, 0, 'el verificador detecta un documento alterado (control negativo)');
        assert.match(neg.stdout, /INVALIDA/);
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

// Algoritmos declarados [AT 10.6, 10.7].
assert.equal(ALG.c14n, 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
assert.equal(ALG.rsaSha256, 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');

for (const a of avisos) process.stdout.write(`security:dian: AVISO — ${a}.\n`);
process.stdout.write(`security:dian: OK (CUFE/CUDE oficiales, tablas, política, WSDL, documentos, respuestas${avisos.length ? '' : ', XSD, C14N y firmas'})\n`);
