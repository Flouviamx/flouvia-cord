// Contrato de la factura electrónica con ARCA (Argentina) — corre en
// `npm run test:payments` (security:arca). Sin red: todo contra fuentes
// oficiales vendorizadas en scripts/fixtures/arca/.
//
// Capas, de la más dura a la más blanda:
//
//   1. QR (RG 4892/2020): el ejemplo oficial de "Especificaciones del QR
//      incluido en las facturas electrónicas" (JSON y su base64, transcritos
//      del PDF) se reproduce byte a byte.
//   2. Esquema: cada pedido que Cord sabe armar (FECAESolicitar A/B/C,
//      servicios, nota de crédito con CbtesAsoc, moneda extranjera,
//      FECompUltimoAutorizado, FECompConsultar, FEParamGetCotizacion, FEDummy,
//      loginCms) se valida con xmllint contra el <schema> embebido en los WSDL
//      OFICIALES descargados de ARCA (homologación y producción: idénticos
//      salvo el host), y el TRA contra el XSD de la Especificación Técnica del
//      WSAA. Un elemento fuera de orden lo rechaza el deserializador de ASMX
//      ("Server was unable to read request", fixture real), así que esto no es
//      cosmético. Controles negativos prueban que xmllint valida de verdad.
//      Sin xmllint se avisa y se omite (ARCA_XSD_REQUIRED=1 la vuelve obligatoria).
//   3. Transporte: endpoints y soapAction de cada operación iguales a los del WSDL.
//   4. Firma del TRA: CMS SignedData con el TRA adjunto, verificado con
//      openssl cms -verify (sin openssl se omite).
//   5. Reglas del manual del desarrollador (RG 4291, v4.7): matriz de clases
//      A/B/C × condición frente al IVA del receptor (anexo, RG 5616), tipos de
//      comprobante, cuadres (10048, 10023, 10061, 10051…), umbral de
//      identificación del consumidor final (RG 5700/2025) y los rechazos que
//      Cord hace ANTES de pedir el CAE.
//   6. Respuestas reales de homologación (fixtures): parsers, códigos de error
//      y faults del WSAA.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { arcaQrJson, arcaQrUrl } from '../src/lib/fiscal/latam/arca/qr.ts';
import {
    ARCA_ENDPOINTS, ARCA_QR_URL, CONDICIONES_IVA_RECEPTOR, NS_WSFE, NS_WSAA, TIPO_COMPROBANTE, UMBRAL_IDENTIFICACION_CF_ARS,
} from '../src/lib/fiscal/latam/arca/constantes.ts';
import {
    armarSolicitud, claseComprobante, conNumero, cuitValido, dentroDelMargen, documentoReceptor, fechaArca,
    numeroDocumento, numeroLegal, problemasDeCuadre, tipoComprobante,
} from '../src/lib/fiscal/latam/arca/comprobante.ts';
import {
    ambienteCoincide, ArcaFaultError, llamarWsfe, parsearCAESolicitar, parsearDummy, parsearUltimoAutorizado,
    sobreCAESolicitar, sobreCompConsultar, sobreCotizacion, sobreDummy, sobreUltimoAutorizado,
} from '../src/lib/fiscal/latam/arca/wsfe.ts';
import { ArcaWsaaError, construirTRA, firmarTRA, parsearLoginCms, sobreLoginCms } from '../src/lib/fiscal/latam/arca/wsaa.ts';
import { CODIGOS_AUTENTICACION, mensajeRechazo, mensajeWsaa, wsaaTransitorio } from '../src/lib/fiscal/latam/arca/errores.ts';
import { RailDatosError } from '../src/lib/fiscal/latam/errores.ts';

const FIX = fileURLToPath(new URL('./fixtures/arca/', import.meta.url));
const leer = (f) => readFileSync(join(FIX, f), 'utf8');

// ── 1. QR: vector oficial ────────────────────────────────────────────────────
{
    const json = '{"ver":1,"fecha":"2020-10-13","cuit":30000000007,"ptoVta":10,"tipoCmp":1,"nroCmp":94,"importe":12100,"moneda":"DOL","ctz":65,"tipoDocRec":80,"nroDocRec":20000000001,"tipoCodAut":"E","codAut":70417054367476}';
    const b64 = 'eyJ2ZXIiOjEsImZlY2hhIjoiMjAyMC0xMC0xMyIsImN1aXQiOjMwMDAwMDAwMDA3LCJwdG9WdGEiOjEwLCJ0aXBvQ21wIjoxLCJucm9DbXAiOjk0LCJpbXBvcnRlIjoxMjEwMCwibW9uZWRhIjoiRE9MIiwiY3R6Ijo2NSwidGlwb0RvY1JlYyI6ODAsIm5yb0RvY1JlYyI6MjAwMDAwMDAwMDEsInRpcG9Db2RBdXQiOiJFIiwiY29kQXV0Ijo3MDQxNzA1NDM2NzQ3Nn0=';
    const datos = {
        fecha: '2020-10-13', cuit: '30000000007', ptoVta: 10, tipoCmp: 1, nroCmp: 94, importe: '12100.00', moneda: 'DOL', ctz: '65',
        tipoDocRec: 80, nroDocRec: '20000000001', tipoCodAut: 'E', codAut: '70417054367476',
    };
    assert.equal(arcaQrJson(datos), json, 'el JSON del QR no reproduce el ejemplo oficial');
    assert.equal(Buffer.from(json).toString('base64'), b64, 'transcripción del vector');
    assert.equal(arcaQrUrl(datos, 'https://www.afip.gob.ar/fe/qr/'), `https://www.afip.gob.ar/fe/qr/?p=${b64}`, 'la URL del ejemplo oficial');
    assert.equal(ARCA_QR_URL, 'https://www.arca.gob.ar/fe/qr/', 'la URL del texto normativo vigente');
    // "De corresponder": un consumidor final sin identificar no lleva documento.
    const sinDoc = JSON.parse(arcaQrJson({ ...datos, tipoDocRec: 99, nroDocRec: '0' }));
    assert.equal('tipoDocRec' in sinDoc || 'nroDocRec' in sinDoc, false, 'DocTipo 99 no se informa en el QR');
    assert.deepEqual(Object.keys(sinDoc), ['ver', 'fecha', 'cuit', 'ptoVta', 'tipoCmp', 'nroCmp', 'importe', 'moneda', 'ctz', 'tipoCodAut', 'codAut']);
    assert.equal(JSON.parse(arcaQrJson({ ...datos, importe: '1234.5', ctz: '1045.123456' })).ctz, 1045.123456);
    assert.throws(() => arcaQrJson({ ...datos, codAut: '123' }), /14 dígitos/, 'un CAE que no tiene 14 dígitos no se imprime');
}

// ── Datos de prueba (CUIT válidas por dígito verificador) ────────────────────
const CUIT_EMISOR = '30712345671';
const CUIT_RI = '20111111112';
const AUTH = { token: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+', sign: 'c2lnbg==', cuit: CUIT_EMISOR };
const FECHA = new Date('2026-10-08T15:00:00Z');
const linea = (subtotal, taxRate, description = 'Servicio') => ({
    description, quantity: 1, unitPrice: subtotal, taxRate,
    subtotal, taxAmount: Math.round(subtotal * taxRate * 100) / 100, total: Math.round(subtotal * (1 + taxRate) * 100) / 100,
});
const totales = (lineas, currency = 'ARS') => {
    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    const taxes = lineas.reduce((s, l) => s + l.taxAmount, 0);
    return { subtotal, taxes, total: subtotal + taxes, currency };
};
const base = (over = {}) => {
    const lineas = over.lineas ?? [linea(1000, 0.21), linea(500, 0.105), linea(200, 0)];
    return {
        cuitEmisor: CUIT_EMISOR, condicionEmisor: 'responsable_inscripto', puntoVenta: 3, concepto: 1, fecha: FECHA,
        receptor: { taxId: CUIT_RI, pais: 'AR', condicionIva: 1 },
        lineas, totales: totales(lineas), moneda: { id: 'PES', cotizacion: 1 },
        ...over,
    };
};
const rechaza = (fn, re, msg) => assert.throws(fn, (e) => e instanceof RailDatosError && re.test(e.message), msg);

// ── 5. Reglas del manual ─────────────────────────────────────────────────────
{
    // Tipos de comprobante [Tabla de comprobantes]: A 1/3, B 6/8, C 11/13.
    assert.deepEqual(TIPO_COMPROBANTE, { A: { factura: 1, notaCredito: 3 }, B: { factura: 6, notaCredito: 8 }, C: { factura: 11, notaCredito: 13 } });
    assert.equal(tipoComprobante('B', true), 8);

    // Matriz del anexo "Condición frente al IVA del receptor" (RG 5616):
    // A para 1, 6, 13 y 16; B para el resto; C siempre para monotributo y exento.
    const esperadas = { 1: 'A', 4: 'B', 5: 'B', 6: 'A', 7: 'B', 8: 'B', 9: 'B', 10: 'B', 13: 'A', 15: 'B', 16: 'A' };
    assert.deepEqual(CONDICIONES_IVA_RECEPTOR.map((c) => c.id).sort((a, b) => a - b), Object.keys(esperadas).map(Number));
    for (const [id, clase] of Object.entries(esperadas)) {
        assert.equal(claseComprobante('responsable_inscripto', Number(id)), clase, `RI → condición ${id}`);
        assert.equal(claseComprobante('monotributo', Number(id)), 'C', `monotributo → condición ${id}`);
        assert.equal(claseComprobante('exento', Number(id)), 'C', `exento → condición ${id}`);
        assert.ok(CONDICIONES_IVA_RECEPTOR.find((c) => c.id === Number(id)).clases.includes('C'), `la condición ${id} admite C`);
    }

    // Documento del receptor (tabla de documentos): CUIT 80, DNI 96, sin identificar 99/0.
    assert.deepEqual(documentoReceptor('20-11111111-2'), { DocTipo: 80, DocNro: CUIT_RI });
    assert.deepEqual(documentoReceptor('12.345.678'), { DocTipo: 96, DocNro: '12345678' });
    assert.deepEqual(documentoReceptor(''), { DocTipo: 99, DocNro: '0' });
    assert.equal(cuitValido('30-71234567-1'), CUIT_EMISOR);
    assert.equal(cuitValido('30712345670'), null, 'dígito verificador');

    // Fecha del comprobante: el día en Argentina, no en UTC.
    assert.equal(fechaArca(new Date('2026-10-09T02:30:00Z')), '20261008');
    assert.equal(numeroLegal(3, 42), '00003-00000042');
    assert.equal(numeroDocumento(1, 3, 42, false), 'FA-A-00003-00000042');
    assert.equal(numeroDocumento(8, 3, 42, true), 'H-NC-B-00003-00000042');

    // Margen del manual: relativo ≤ 0,01 % o absoluto ≤ 0,01.
    assert.ok(dentroDelMargen(100.01, 100));
    assert.ok(!dentroDelMargen(100.03, 100));
    assert.ok(dentroDelMargen(1_000_000.5, 1_000_000), 'relativo');
}

const SOLICITUDES = {};
{
    // Factura A, tres alícuotas (21 %, 10,5 % y exento).
    const a = armarSolicitud(base());
    assert.equal(a.cbteTipo, 1);
    assert.equal(a.clase, 'A');
    assert.deepEqual(
        { ImpTotal: a.detalle.ImpTotal, ImpNeto: a.detalle.ImpNeto, ImpOpEx: a.detalle.ImpOpEx, ImpIVA: a.detalle.ImpIVA, ImpTotConc: a.detalle.ImpTotConc, ImpTrib: a.detalle.ImpTrib },
        { ImpTotal: '1962.50', ImpNeto: '1500.00', ImpOpEx: '200.00', ImpIVA: '262.50', ImpTotConc: '0.00', ImpTrib: '0.00' },
    );
    assert.deepEqual(a.detalle.Iva, [{ Id: 4, BaseImp: '500.00', Importe: '52.50' }, { Id: 5, BaseImp: '1000.00', Importe: '210.00' }]);
    assert.equal(a.detalle.CondicionIVAReceptorId, 1);
    assert.equal(a.detalle.CbteFch, '20261008');
    assert.equal(a.detalle.FchServDesde, undefined, 'productos no informan fechas de servicio');
    assert.deepEqual(problemasDeCuadre(a.detalle, 'A'), []);
    SOLICITUDES.facturaA = conNumero(a, 42);

    // Factura B a consumidor final sin identificar, servicios con período y vencimiento.
    const b = armarSolicitud(base({
        concepto: 2, receptor: { taxId: '', pais: 'AR', condicionIva: null },
        lineas: [linea(10_000, 0.21)], servicio: { desde: '2026-09-01', hasta: '2026-09-30' }, vencimientoPago: '2026-10-31',
    }));
    assert.equal(b.cbteTipo, 6);
    assert.equal(b.detalle.DocTipo, 99);
    assert.equal(b.detalle.DocNro, '0');
    assert.equal(b.detalle.CondicionIVAReceptorId, 5, 'sin CUIT ni condición capturada = consumidor final');
    assert.deepEqual([b.detalle.FchServDesde, b.detalle.FchServHasta, b.detalle.FchVtoPago], ['20260901', '20260930', '20261031']);
    assert.deepEqual(problemasDeCuadre(b.detalle, 'B'), []);
    SOLICITUDES.facturaB = conNumero(b, 7);

    // Vencimiento anterior a la fecha del comprobante [MAN 10036]: se lleva a la fecha.
    const bVencida = armarSolicitud(base({ concepto: 2, lineas: [linea(100, 0.21)], vencimientoPago: '2026-01-01' }));
    assert.equal(bVencida.detalle.FchVtoPago, '20261008');

    // Factura C de un monotributista: sin IVA ni array Iva; ImpNeto es el total.
    const c = armarSolicitud(base({ condicionEmisor: 'monotributo', receptor: { taxId: CUIT_RI, pais: 'AR', condicionIva: 1 }, lineas: [linea(3000, 0)] }));
    assert.equal(c.cbteTipo, 11);
    assert.equal(c.detalle.Iva, undefined);
    assert.deepEqual([c.detalle.ImpNeto, c.detalle.ImpIVA, c.detalle.ImpOpEx, c.detalle.ImpTotal], ['3000.00', '0.00', '0.00', '3000.00']);
    assert.deepEqual(problemasDeCuadre(c.detalle, 'C'), []);
    SOLICITUDES.facturaC = conNumero(c, 1);

    // Factura en dólares: MonId DOL y cotización en pesos.
    const usd = armarSolicitud(base({ lineas: [linea(100, 0.21)], moneda: { id: 'DOL', cotizacion: 1045.25 } }));
    assert.deepEqual([usd.detalle.MonId, usd.detalle.MonCotiz], ['DOL', '1045.25']);
    SOLICITUDES.facturaUsd = conNumero(usd, 43);

    // Nota de crédito: misma clase, receptor y condición; CbtesAsoc apunta al original.
    const nc = armarSolicitud(base({ lineas: [linea(100, 0.21)], notaCreditoDe: SOLICITUDES.facturaA, receptor: { taxId: '', pais: 'AR', condicionIva: 5 } }));
    assert.equal(nc.cbteTipo, 3, 'la NC de una A es NC A aunque el cliente haya cambiado');
    assert.equal(nc.detalle.DocNro, CUIT_RI);
    assert.equal(nc.detalle.CondicionIVAReceptorId, 1);
    assert.deepEqual(nc.detalle.CbtesAsoc, [{ Tipo: 1, PtoVta: 3, Nro: 42, Cuit: CUIT_EMISOR, CbteFch: '20261008' }]);
    SOLICITUDES.notaCredito = conNumero(nc, 5);

    // Controles negativos: lo que ARCA rechazaría no se envía.
    rechaza(() => armarSolicitud(base({ condicionEmisor: 'monotributo', lineas: [linea(100, 0.21)] })), /Factura C no se discrimina/, 'C con IVA');
    rechaza(() => armarSolicitud(base({ lineas: [linea(100, 0.16)] })), /no es una alícuota vigente/, 'tasa inexistente');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: '12345678', pais: 'AR', condicionIva: 1 } })), /Factura A necesita la CUIT/, 'A sin CUIT');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: CUIT_RI, pais: 'AR', condicionIva: null } })), /condición frente al IVA/, 'CUIT sin condición');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: CUIT_RI, pais: 'UY', condicionIva: 9 } })), /Factura E/, 'exportación');
    rechaza(() => armarSolicitud(base({ totales: { ...totales(base().lineas), retencionTotal: 10 } })), /retenciones/, 'retenciones');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: CUIT_EMISOR, pais: 'AR', condicionIva: 1 } })), /misma CUIT/, 'autofactura');
    rechaza(() => armarSolicitud(base({ moneda: { id: 'DOL', cotizacion: 0 } })), /tipo de cambio/, 'sin cotización');
    const grande = UMBRAL_IDENTIFICACION_CF_ARS / 1.21 + 1;
    rechaza(() => armarSolicitud(base({ receptor: { taxId: '', pais: 'AR', condicionIva: 5 }, lineas: [linea(Math.round(grande), 0.21)] })), /identificar al consumidor final/, 'RG 5700');
    armarSolicitud(base({ receptor: { taxId: '12345678', pais: 'AR', condicionIva: 5 }, lineas: [linea(Math.round(grande), 0.21)] }));
    rechaza(() => armarSolicitud(base({ totales: { subtotal: 1700, taxes: 300, total: 2000, currency: 'ARS' } })), /no cuadran/, 'totales del documento');
    rechaza(() => conNumero(SOLICITUDES.facturaA, 0), /fuera de rango/);

    // problemasDeCuadre detecta lo que se rompe a mano.
    const roto = { ...SOLICITUDES.facturaA.detalle, ImpTotal: '1999.00' };
    assert.ok(problemasDeCuadre(roto, 'A').some((p) => p.startsWith('10048')));
    assert.ok(problemasDeCuadre({ ...SOLICITUDES.facturaA.detalle, Iva: [{ Id: 5, BaseImp: '1500.00', Importe: '262.50' }] }, 'A').some((p) => p.startsWith('10051')));
    assert.ok(problemasDeCuadre({ ...SOLICITUDES.facturaC.detalle, Iva: [{ Id: 5, BaseImp: '1', Importe: '0.21' }] }, 'C').some((p) => p.startsWith('10071')));
}

// ── 3. Transporte: endpoints y soapAction contra el WSDL ─────────────────────
{
    const wsdlHomo = leer('wsfev1-homologacion.wsdl');
    const wsdlProd = leer('wsfev1-produccion.wsdl');
    assert.ok(wsdlHomo.includes(`location="${ARCA_ENDPOINTS.homologacion.wsfe}"`), 'endpoint de homologación de WSFEv1');
    assert.ok(wsdlProd.includes(`location="${ARCA_ENDPOINTS.produccion.wsfe}"`), 'endpoint de producción de WSFEv1');
    assert.ok(leer('wsaa-homologacion.wsdl').includes(`location="${ARCA_ENDPOINTS.homologacion.wsaa}"`), 'endpoint de homologación del WSAA');
    assert.ok(leer('wsaa-produccion.wsdl').includes(`location="${ARCA_ENDPOINTS.produccion.wsaa}"`), 'endpoint de producción del WSAA');
    assert.equal(wsdlHomo.replaceAll(ARCA_ENDPOINTS.homologacion.wsfe, 'X'), wsdlProd.replaceAll(ARCA_ENDPOINTS.produccion.wsfe, 'X'), 'los dos WSDL describen el mismo servicio');
    assert.ok(wsdlHomo.includes(`targetNamespace="${NS_WSFE}"`));
    assert.ok(leer('wsaa-homologacion.wsdl').includes(`targetNamespace="${NS_WSAA}"`));
    for (const op of ['FECAESolicitar', 'FECompUltimoAutorizado', 'FECompConsultar', 'FEParamGetPtosVenta', 'FEParamGetCotizacion', 'FEDummy']) {
        assert.ok(wsdlHomo.includes(`soapAction="${NS_WSFE}${op}"`), `soapAction de ${op}`);
    }
    // El transporte manda ese soapAction, al endpoint del entorno, sin seguir redirecciones.
    const original = globalThis.fetch;
    let visto = null;
    globalThis.fetch = async (url, init) => {
        visto = { url, init };
        return new Response(leer('respuesta-fedummy-homologacion.xml'), { status: 200 });
    };
    try {
        const xml = await llamarWsfe('homologacion', 'FEDummy', sobreDummy());
        assert.equal(visto.url, ARCA_ENDPOINTS.homologacion.wsfe);
        assert.equal(visto.init.headers.SOAPAction, `"${NS_WSFE}FEDummy"`);
        assert.equal(visto.init.redirect, 'error');
        const d = await parsearDummy(xml);
        assert.deepEqual([d.app, d.db, d.auth], ['OK', 'OK', 'OK']);
        assert.ok(ambienteCoincide(d.ambiente, 'homologacion'));
        assert.ok(!ambienteCoincide(d.ambiente, 'produccion'), 'una respuesta de homologación nunca autoriza producción');
    } finally {
        globalThis.fetch = original;
    }
}

// ── 2. Esquema: xmllint contra los WSDL y el XSD oficiales ───────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (!xmllint) {
        if (process.env.ARCA_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y ARCA_XSD_REQUIRED=1');
        process.stdout.write('security:arca: AVISO — xmllint no está instalado; se omite la validación contra los esquemas oficiales.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'arca-check-'));
        try {
            // El <schema> embebido en el WSDL, con los prefijos que declara la raíz.
            const wsdl = leer('wsfev1-homologacion.wsdl');
            const schemaWsfe = wsdl.slice(wsdl.indexOf('<s:schema'), wsdl.indexOf('</s:schema>') + '</s:schema>'.length)
                .replace('<s:schema ', `<s:schema xmlns:s="http://www.w3.org/2001/XMLSchema" xmlns:tns="${NS_WSFE}" `);
            writeFileSync(join(dir, 'wsfe.xsd'), schemaWsfe);
            const wsaaWsdl = leer('wsaa-homologacion.wsdl');
            const inicio = wsaaWsdl.indexOf('<schema ');
            const schemaWsaa = wsaaWsdl.slice(inicio, wsaaWsdl.indexOf('</schema>', inicio) + '</schema>'.length)
                .replace(/<import [^>]*\/>/, '')
                .replace('<schema ', '<schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" ');
            writeFileSync(join(dir, 'wsaa.xsd'), schemaWsaa);

            const validar = (nombre, xml, xsd) => {
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, xml);
                try {
                    execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(dir, xsd), file], { stdio: 'pipe' });
                    return null;
                } catch (e) {
                    return String(e.stderr || e.message);
                }
            };
            // El hijo de <soapenv:Body>, con el namespace del prefijo redeclarado en él.
            const cuerpo = (envelope, prefijo, ns) => {
                const m = /<soapenv:Body>([\s\S]*)<\/soapenv:Body>/.exec(envelope);
                assert.ok(m, 'sobre sin Body');
                return m[1].replace(new RegExp(`^<${prefijo}:(\\w+)`), `<${prefijo}:$1 xmlns:${prefijo}="${ns}"`);
            };
            const pedidos = {
                caeA: sobreCAESolicitar(AUTH, SOLICITUDES.facturaA, SOLICITUDES.facturaA.detalle),
                caeB: sobreCAESolicitar(AUTH, SOLICITUDES.facturaB, SOLICITUDES.facturaB.detalle),
                caeC: sobreCAESolicitar(AUTH, SOLICITUDES.facturaC, SOLICITUDES.facturaC.detalle),
                caeUsd: sobreCAESolicitar(AUTH, SOLICITUDES.facturaUsd, SOLICITUDES.facturaUsd.detalle),
                caeNc: sobreCAESolicitar(AUTH, SOLICITUDES.notaCredito, SOLICITUDES.notaCredito.detalle),
                ultimo: sobreUltimoAutorizado(AUTH, 3, 1),
                consultar: sobreCompConsultar(AUTH, 3, 1, 42),
                cotizacion: sobreCotizacion(AUTH, 'DOL'),
                dummy: sobreDummy(),
            };
            for (const [nombre, env] of Object.entries(pedidos)) {
                const error = validar(nombre, cuerpo(env, 'ar', NS_WSFE), 'wsfe.xsd');
                assert.equal(error, null, `${nombre} no cumple el esquema del WSDL de WSFEv1:\n${error}`);
            }
            const login = validar('loginCms', cuerpo(sobreLoginCms('TUlJQ0FB'), 'wsaa', NS_WSAA), 'wsaa.xsd');
            assert.equal(login, null, `loginCms no cumple el esquema del WSDL del WSAA:\n${login}`);
            // El TRA contra el XSD de la Especificación Técnica del WSAA (fixture).
            const traFile = join(dir, 'tra.xml');
            writeFileSync(traFile, construirTRA('wsfe', FECHA, 4294967295));
            let traReal = null;
            try { execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(FIX, 'loginTicketRequest.xsd'), traFile], { stdio: 'pipe' }); }
            catch (e) { traReal = String(e.stderr || e.message); }
            assert.equal(traReal, null, `el TRA no cumple loginTicketRequest.xsd:\n${traReal}`);

            // Controles negativos: prueban que xmllint valida de verdad.
            const desordenado = cuerpo(pedidos.caeA, 'ar', NS_WSFE).replace(/(<ar:MonId>[^<]*<\/ar:MonId>)(<ar:MonCotiz>[^<]*<\/ar:MonCotiz>)/, '$2$1');
            assert.notEqual(validar('neg_orden', desordenado, 'wsfe.xsd'), null, 'MonCotiz antes de MonId debe romper el esquema');
            const sinNumero = cuerpo(pedidos.caeA, 'ar', NS_WSFE).replace('<ar:CbteDesde>42</ar:CbteDesde>', '');
            assert.notEqual(validar('neg_falta', sinNumero, 'wsfe.xsd'), null, 'sin CbteDesde (minOccurs=1) debe romper el esquema');
            const texto = cuerpo(pedidos.caeA, 'ar', NS_WSFE).replace('<ar:DocTipo>80</ar:DocTipo>', '<ar:DocTipo>CUIT</ar:DocTipo>');
            assert.notEqual(validar('neg_tipo', texto, 'wsfe.xsd'), null, 'DocTipo no numérico debe romper el esquema (es el fault real de la fixture)');
            const traMalo = join(dir, 'tra-malo.xml');
            writeFileSync(traMalo, construirTRA('wsfe', FECHA).replace('<service>wsfe</service>', '<service>1wsfe</service>'));
            assert.throws(() => execFileSync('xmllint', ['--noout', '--nonet', '--schema', join(FIX, 'loginTicketRequest.xsd'), traMalo], { stdio: 'pipe' }), 'un servicio que empieza con dígito no cumple el XSD del TRA');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── 4. Firma del TRA: CMS verificable con openssl ────────────────────────────
{
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    const attrs = [{ name: 'commonName', value: 'cord-check' }, { type: '2.5.4.5', value: `CUIT ${CUIT_EMISOR}` }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(key, forge.md.sha256.create());
    const certPem = forge.pki.certificateToPem(cert);
    const tra = construirTRA('wsfe', FECHA, 1);
    const cms = firmarTRA(tra, certPem, keyPem, FECHA);
    // El contenido adjunto es el TRA, byte a byte, y el algoritmo es SHA-256.
    const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms)));
    assert.equal(forge.util.decodeUtf8(p7.rawCapture.content.value[0].value), tra, 'el CMS lleva el TRA adjunto');
    const der = Buffer.from(cms, 'base64');
    assert.ok(der.includes(Buffer.from('0609608648016503040201', 'hex')), 'el digest del CMS es SHA-256 (OID 2.16.840.1.101.3.4.2.1)');
    assert.ok(!der.includes(Buffer.from('06052b0e03021a', 'hex')), 'el CMS no usa SHA-1');
    let openssl = true;
    try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { openssl = false; }
    if (openssl) {
        const dir = mkdtempSync(join(tmpdir(), 'arca-cms-'));
        try {
            writeFileSync(join(dir, 'cms.der'), Buffer.from(cms, 'base64'));
            writeFileSync(join(dir, 'cert.pem'), certPem);
            const out = execFileSync('openssl', ['cms', '-verify', '-binary', '-inform', 'DER', '-in', join(dir, 'cms.der'), '-CAfile', join(dir, 'cert.pem'), '-purpose', 'any'], { stdio: ['ignore', 'pipe', 'pipe'] });
            assert.equal(out.toString('utf8'), tra, 'openssl verifica la firma y devuelve el TRA');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    } else {
        process.stdout.write('security:arca: AVISO — openssl no está instalado; se omite la verificación independiente del CMS.\n');
    }
}

// ── 6. Respuestas reales de homologación ─────────────────────────────────────
{
    const ultimo = await parsearUltimoAutorizado(leer('respuesta-ultimo-token-invalido.xml'));
    assert.equal(ultimo.numero, null, 'con errores no hay último autorizado');
    assert.deepEqual(ultimo.errores.map((e) => e.code), [600]);
    assert.ok(CODIGOS_AUTENTICACION.has(600));
    assert.equal(ultimo.ambiente, 'HomologacionExterno - srt');

    const cae = await parsearCAESolicitar(leer('respuesta-caesolicitar-token-invalido.xml'));
    assert.deepEqual(cae.errores.map((e) => e.code), [600], 'el pedido de Cord se deserializó: ARCA llegó a validar el token');
    assert.equal(cae.cae, '');
    assert.doesNotMatch(mensajeRechazo(cae.errores), /ValidacionDeToken|Excepcion/, 'el mensaje crudo de ARCA no llega al usuario (regla 14)');

    await assert.rejects(parsearCAESolicitar(leer('respuesta-fault-request-ilegible.xml')), (e) => e instanceof ArcaFaultError && e.faultcode === 'Client');

    for (const [fixture, code, transitorio] of [['respuesta-wsaa-cms-bad.xml', 'cms.bad', false], ['respuesta-wsaa-cert-bloqueado.xml', 'cms.cert.blacklist', false]]) {
        await assert.rejects(parsearLoginCms(leer(fixture)), (e) => e instanceof ArcaWsaaError && e.faultcode === code, fixture);
        assert.equal(wsaaTransitorio(code), transitorio, code);
        assert.doesNotMatch(mensajeWsaa(code), /cms\.|WSAA|LoginFault/, `mensaje para el usuario de ${code}`);
    }
    assert.ok(wsaaTransitorio('coe.alreadyAuthenticated'), 'un ticket vigente en otro lado se espera, no se reporta');
}

process.stdout.write('security:arca (QR oficial, esquemas de los WSDL y del TRA, firma CMS, reglas del manual y respuestas reales de ARCA) OK\n');
