// Contrato de la factura electrónica con SUNAT (Perú, SEE - Del contribuyente)
// — corre en `npm run test:payments` (security:sunat). Sin red: todo contra
// fuentes oficiales vendorizadas en scripts/fixtures/sunat/ (fuentes.json
// dice de dónde sale cada archivo y su SHA-256).
//
// Capas, de la más dura a la más blanda:
//
//   1. Fuentes: los WSDL de SUNAT (beta y producción) declaran las operaciones,
//      los soapAction y las direcciones que usa el cliente; los códigos de los
//      catálogos que Cord emite (01, 05, 06, 07, 09, 16, 51, 52, 53) aparecen
//      en los anexos oficiales extraídos; el orden del QR es el del anexo 6.
//   2. Esquema: cada comprobante que Cord sabe armar (factura gravada, con
//      descuento y exonerada, inafecta, al crédito con retención, exportación,
//      tasa MYPE, nota de crédito total y parcial) se valida con xmllint contra
//      los XSD OASIS UBL 2.1 sin cambios, y cada sobre (sendBill, getStatus,
//      getStatusCdr, getStatusAR) contra el XSD de su WSDL. Controles negativos
//      prueban que xmllint valida de verdad. Sin xmllint se avisa y se omite
//      (SUNAT_XSD_REQUIRED=1 la vuelve obligatoria).
//   3. Firma XMLDSig: el documento ya escrito en forma canónica coincide byte a
//      byte con `xmllint --c14n` (libxml2), el valor resumen se recalcula sobre
//      esa salida y la firma del SignedInfo se verifica con python/lxml cuando
//      está (SUNAT_FIRMA_REQUIRED=1 la vuelve obligatoria).
//   4. Reglas: cuadres del anexo 1 (valor de venta, IGV, totales, cuotas), una
//      sola tasa de IGV (3462), forma de pago y retención (RS 193-2020), tipo
//      de nota de crédito, y los rechazos que Cord hace ANTES de enviar.
//   5. Respuestas reales del servicio beta (2026-10-09): la CDR aceptada se
//      lee, los faults 2335/3280/3462/3267 se clasifican como rechazo, la
//      consulta getStatusAR de beta no existe, y los comprobantes que beta
//      aceptó siguen cumpliendo el XSD y verificando su firma.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import {
    AFECTACION, CARGO_RETENCION_IGV, DESCUENTO_AFECTA_BASE, LEYENDA_MONTO_LETRAS, NS_SERVICIO, PRECIO_UNITARIO_CON_IGV,
    SUNAT_ENDPOINTS, TIPO_DOC, TIPO_NOTA_CREDITO, TIPO_OPERACION, TRIBUTO, claseCodigo,
} from '../src/lib/fiscal/latam/sunat/constantes.ts';
import {
    armarSolicitud, conNumero, fechaHoraLima, idComprobante, nombreArchivo, numeroDocumento, problemasDeCuadre, rucValido,
} from '../src/lib/fiscal/latam/sunat/comprobante.ts';
import { xmlComprobante } from '../src/lib/fiscal/latam/sunat/ubl.ts';
import { firmarComprobante, verificarFirmaPropia } from '../src/lib/fiscal/latam/sunat/firma.ts';
import { sobreConsulta, sobreSendBill, parsearSendBill, parsearConsulta, SunatFaultError, codigoDeFault } from '../src/lib/fiscal/latam/sunat/servicio.ts';
import { leerCdr, leerCdrXml } from '../src/lib/fiscal/latam/sunat/cdr.ts';
import { zipComprobante, xmlsDelZip } from '../src/lib/fiscal/latam/sunat/zip.ts';
import { enteroEnLetras, montoEnLetras } from '../src/lib/fiscal/latam/sunat/letras.ts';
import { representacionSunat, sunatQr } from '../src/lib/fiscal/latam/sunat/representacion.ts';
import { mensajeExcepcion, mensajeRechazo } from '../src/lib/fiscal/latam/sunat/errores.ts';
import { RailDatosError } from '../src/lib/fiscal/latam/errores.ts';

const FIX = fileURLToPath(new URL('./fixtures/sunat/', import.meta.url));
const leer = (f) => readFileSync(join(FIX, f), 'utf8');

// ── Datos de prueba ─────────────────────────────────────────────────────────
// RUC del ejemplo del manual del programador (20100066603) y el de SUNAT
// (20131312955): válidos por dígito verificador.
const RUC = '20100066603';
const RUC_CLIENTE = '20131312955';
const FECHA = new Date('2026-10-08T15:00:00Z');
const linea = (subtotal, taxRate, extra = {}) => ({
    description: 'Servicio de consultoría', quantity: 2, unitPrice: subtotal / 2, taxRate,
    subtotal, taxAmount: Math.round(subtotal * taxRate * 100) / 100, total: Math.round(subtotal * (1 + taxRate) * 100) / 100, ...extra,
});
const totales = (lineas, currency = 'PEN', extra = {}) => {
    const subtotal = Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
    const taxes = Math.round(lineas.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;
    return { subtotal, taxes, total: Math.round((subtotal + taxes) * 100) / 100, currency, ...extra };
};
const base = (over = {}) => {
    const lineas = over.lineas ?? [linea(100, 0.18)];
    return {
        ruc: RUC, razonSocial: 'EMPRESA DE PRUEBA S.A.C.', serie: 'F001', concepto: 'servicios', afectacionSinIgv: '20',
        fecha: FECHA, receptor: { taxId: RUC_CLIENTE, pais: 'PE', nombre: 'CLIENTE S.A.' },
        lineas, totales: totales(lineas), ...over,
    };
};
const rechaza = (fn, re, msg) => assert.throws(fn, (e) => e instanceof RailDatosError && re.test(e.message), msg);

// ── 1. Fuentes oficiales ────────────────────────────────────────────────────
{
    const fuentes = JSON.parse(leer('fuentes.json'));
    for (const f of fuentes) {
        for (const archivo of String(f.extracto ?? '').split(',').map((s) => s.trim()).filter((s) => /\.(txt|wsdl|xsd)$/.test(s))) {
            assert.ok(existsSync(join(FIX, archivo)), `falta el extracto ${archivo}`);
        }
    }
    // Direcciones y operaciones: las del WSDL de cada ambiente.
    const beta = leer('billService-beta.wsdl');
    const prod = leer('billService-produccion.wsdl');
    const consulta = leer('billConsultService-produccion.wsdl');
    assert.ok(beta.includes(`location="${SUNAT_ENDPOINTS.homologacion.bill.replace('https://e-beta.sunat.gob.pe/', 'https://e-beta.sunat.gob.pe:443/')}"`), 'endpoint beta');
    assert.ok(prod.includes(`location="${SUNAT_ENDPOINTS.produccion.bill.replace('https://e-factura.sunat.gob.pe/', 'https://e-factura.sunat.gob.pe:443/')}"`), 'endpoint de producción');
    assert.ok(consulta.includes(`location="${SUNAT_ENDPOINTS.produccion.consulta}"`), 'endpoint de consulta de producción');
    assert.equal(SUNAT_ENDPOINTS.homologacion.consulta, null, 'beta no publica billConsultService');
    for (const op of ['sendBill', 'getStatus', 'sendSummary']) {
        assert.ok(beta.includes(`soapAction="urn:${op}"`) && prod.includes(`soapAction="urn:${op}"`), `soapAction de ${op}`);
    }
    assert.ok(beta.includes('soapAction="urn:getStatusAR"') && !prod.includes('getStatusAR'), 'getStatusAR solo existe en beta');
    assert.ok(consulta.includes('soapAction="urn:getStatusCdr"') && consulta.includes('soapAction="urn:getStatus"'), 'consulta de producción');
    assert.ok(leer('billService-beta.xsd').includes(`targetNamespace="${NS_SERVICIO}"`), 'namespace del servicio');

    // Catálogos (anexo 8, RS 340-2017; catálogo 09 según RS 193-2020).
    const cat = leer('normas/rs340-2017-anexo8-catalogos.txt');
    const catalogo = (n) => {
        const desde = cat.indexOf(`CATALOGO No. ${n}`);
        const hasta = cat.indexOf('CATALOGO No.', desde + 10);
        assert.ok(desde > 0, `catálogo ${n} en el anexo`);
        return cat.slice(desde, hasta > 0 ? hasta : undefined);
    };
    const tiene = (n, re, msg) => assert.match(catalogo(n), re, msg);
    tiene('01', /\n\s+01\s+Factura/i, 'cat. 01: 01 factura');
    tiene('01', /\n\s+07\s+Nota de crédito/i, 'cat. 01: 07 nota de crédito');
    for (const af of Object.values(AFECTACION)) {
        const t = TRIBUTO[af];
        tiene('07', new RegExp(`\\n\\s+${af}\\s+`), `cat. 07: ${af}`);
        assert.match(cat, new RegExp(`\\n\\s+${t.id}\\s*\\*?\\s+[^\\n]*\\s${t.codigo}\\b[^\\n]*(\\n[^\\n]*)?\\s${t.nombre}\\b`), `cat. 05: ${t.id} ${t.codigo} ${t.nombre}`);
    }
    tiene('06', /\n\s+0\s+Doc\.trib\.no\.dom\.sin\.ruc/i, 'cat. 06: 0');
    tiene('06', /\n\s+1\s+Doc\. Nacional de identidad/i, 'cat. 06: 1');
    tiene('06', /\n\s+6\s+Registro Único de contribuyentes/i, 'cat. 06: 6');
    tiene('16', new RegExp(`\\n\\s+${PRECIO_UNITARIO_CON_IGV}\\s+Precio unitario \\(incluye el IGV\\)`), 'cat. 16: 01');
    tiene('51', new RegExp(`\\n\\s+${TIPO_OPERACION.VENTA_INTERNA}\\s+Venta interna`), 'cat. 51: 0101');
    tiene('51', new RegExp(`\\n\\s+${TIPO_OPERACION.EXPORTACION_BIENES}\\s+Exportación de Bienes`), 'cat. 51: 0200');
    tiene('51', new RegExp(`\\n\\s+${TIPO_OPERACION.EXPORTACION_SERVICIOS}\\s+Exportación de Servicios`), 'cat. 51: 0201');
    tiene('52', new RegExp(`\\n\\s+${LEYENDA_MONTO_LETRAS}\\s+Monto en Letras`), 'cat. 52: 1000');
    tiene('53', new RegExp(`\\n\\s+${DESCUENTO_AFECTA_BASE}\\s+Descuentos que afectan la base imponible del IGV`), 'cat. 53: 00');
    assert.match(leer('normas/rs123-2022-anexo9a-factura-ubl21.txt'), new RegExp(`"${CARGO_RETENCION_IGV}"[\\s\\S]{0,200}Retención del IGV`), 'cat. 53: 62 (anexo 9-A, retención del IGV)');
    const cat09 = leer('normas/rs193-2020-anexo3-catalogo09.txt');
    assert.match(cat09, new RegExp(`\\n\\s+${TIPO_NOTA_CREDITO.ANULACION}\\s+Anulación de la operación`), 'cat. 09: 01');
    assert.match(cat09, new RegExp(`\\n\\s+${TIPO_NOTA_CREDITO.DISMINUCION_VALOR}\\s+Disminución en el valor`), 'cat. 09: 09');

    // QR [RS 113-2018, anexo 6, §6.4]: orden de campos y nivel Q.
    const anexo6 = leer('normas/rs113-2018-anexo6-aspectos-tecnicos-qr.txt');
    assert.match(anexo6.replace(/\s+/g, ' '), /RUC \| TIPO DE DOCUMENTO \| SERIE \| NUMERO \| MTO TOTAL IGV \| MTO TOTAL DEL COMPROBANTE \| FECHA DE EMISION \| TIPO DE DOCUMENTO ADQUIRENTE \| NUMERO DE DOCUMENTO ADQUIRENTE \| VALOR RESUMEN En caso/, 'orden del QR');
    assert.match(anexo6, /Error Correction Level\): nivel Q/, 'nivel de corrección del QR');
    // Rangos de códigos [manual §4.1].
    const manual = leer('normas/manual-programador-see-del-contribuyente-v2.1.txt').replace(/\s+/g, ' ');
    assert.match(manual, /Del 0100 al 999 Excepciones propias de SUNAT\. - Del 1000 al 1999 Excepciones \(formatos y estructura\)propias del contribuyente\. - Del 2000 al 3999 Errores que generan rechazo - Del 4000 en adelante Observaciones/, 'rangos de códigos');
    assert.match(manual, /la numeración se considera ya utilizada/, 'un rechazo consume el número');
    assert.deepEqual([claseCodigo(0), claseCodigo(109), claseCodigo(1033), claseCodigo(2335), claseCodigo(3999), claseCodigo(4001)],
        ['aceptado', 'excepcion_sunat', 'excepcion', 'rechazo', 'rechazo', 'observacion']);
}

// ── Credencial de prueba ────────────────────────────────────────────────────
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' });
const fkey = forge.pki.privateKeyFromPem(keyPem);
const fcert = forge.pki.createCertificate();
fcert.publicKey = forge.pki.setRsaPublicKey(fkey.n, fkey.e);
fcert.serialNumber = '0c';
fcert.validity.notBefore = new Date(Date.now() - 86_400_000);
fcert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
fcert.setSubject([{ name: 'commonName', value: 'Prueba' }, { name: 'organizationalUnitName', value: RUC }]);
fcert.setIssuer([{ name: 'commonName', value: 'Prueba' }]);
fcert.sign(fkey, forge.md.sha256.create());
const CRED = { certPem: forge.pki.certificateToPem(fcert), keyPem };

// ── Casos ───────────────────────────────────────────────────────────────────
const vence = '2026-11-07';
const casos = {
    gravada: base(),
    descuento_exonerado: base({
        lineas: [linea(900, 0.18, { discount: 100 }), linea(450, 0, { discount: 50, description: 'Libro – edición “especial” ñ' })],
        totales: totales([linea(900, 0.18), linea(450, 0)], 'PEN', { discountTotal: 150 }),
    }),
    inafecto: base({ afectacionSinIgv: '30', lineas: [linea(200, 0)], totales: totales([linea(200, 0)]) }),
    credito_retencion: base({
        lineas: [linea(1000, 0.18)], totales: totales([linea(1000, 0.18)]),
        pago: { vencimiento: vence }, retencionIgv: { aplica: true },
    }),
    exportacion: base({ receptor: { taxId: '123456789', pais: 'US', nombre: 'ACME INC.' }, lineas: [linea(500, 0)], totales: totales([linea(500, 0)], 'USD') }),
    mype: base({ regimenMype: true, lineas: [linea(100, 0.105)], totales: totales([linea(100, 0.105)]) }),
};
const solicitudes = Object.fromEntries(Object.entries(casos).map(([k, e], i) => [k, conNumero(armarSolicitud(e), i + 1)]));
const factura = solicitudes.gravada;
solicitudes.nc_total = conNumero(armarSolicitud({ ...casos.gravada, notaCreditoDe: factura, motivo: 'Devolución total' }), 1);
solicitudes.nc_parcial = conNumero(armarSolicitud({
    ...casos.gravada, lineas: [linea(50, 0.18)], totales: totales([linea(50, 0.18)]), notaCreditoDe: factura, motivo: 'Descuento posterior',
}), 2);

// ── 4. Reglas ───────────────────────────────────────────────────────────────
{
    for (const [k, s] of Object.entries(solicitudes)) assert.deepEqual(problemasDeCuadre(s), [], `cuadres de ${k}`);
    assert.deepEqual(fechaHoraLima(FECHA), { fecha: '2026-10-08', hora: '10:00:00' }, 'fecha y hora de Lima (UTC-5)');
    const g = solicitudes.gravada;
    assert.equal(g.tipoOperacion, '0101');
    assert.deepEqual(g.receptor, { tipoDoc: '6', numDoc: RUC_CLIENTE, nombre: 'CLIENTE S.A.' });
    assert.equal(g.lineas[0].valorUnitario, '50');
    assert.equal(g.lineas[0].precioUnitario, '59');
    assert.deepEqual([g.totales.gravadas, g.totales.igv, g.totales.importeTotal], ['100.00', '18.00', '118.00']);
    assert.equal(g.leyendaLetras, 'CIENTO DIECIOCHO CON 00/100 SOLES');
    assert.deepEqual(g.formaPago, { tipo: 'Contado' }, 'sin vencimiento posterior: contado');
    assert.equal(idComprobante(g), 'F001-1');
    assert.equal(nombreArchivo(g), `${RUC}-01-F001-1`);
    assert.equal(numeroDocumento(g, true), 'H-F001-00000001');

    // Descuento por ítem: valor unitario bruto, cargo/descuento 00, valor de venta neto.
    const d = solicitudes.descuento_exonerado;
    assert.deepEqual(d.lineas[0].descuento, { factor: '0.1', monto: '100.00', base: '1000.00' });
    assert.deepEqual([d.lineas[0].valorUnitario, d.lineas[0].valorVenta], ['500', '900.00']);
    assert.deepEqual([d.lineas[1].afectacion, d.totales.exoneradas, d.totales.descuentos], ['20', '450.00', '150.00']);
    assert.equal(solicitudes.inafecto.lineas[0].afectacion, '30');

    // Crédito: el monto neto descuenta la retención del 3 % (RS 193-2020) y la cuota vence después.
    const c = solicitudes.credito_retencion;
    assert.deepEqual(c.retencion, { base: '1180.00', factor: '0.03', monto: '35.40' });
    assert.deepEqual(c.formaPago, { tipo: 'Credito', montoNeto: '1144.60', cuotas: [{ monto: '1144.60', vence }] });
    assert.equal(c.vencimiento, vence);
    const bajoUmbral = armarSolicitud(base({ pago: { vencimiento: vence }, retencionIgv: { aplica: true } }));
    assert.equal(bajoUmbral.retencion, undefined, 'S/ 118 no supera S/ 700: no hay retención');
    assert.equal(bajoUmbral.formaPago.montoNeto, '118.00');
    rechaza(() => armarSolicitud(base({ totales: { ...totales([linea(1000, 0.18)], 'USD') }, lineas: [linea(1000, 0.18)], pago: { vencimiento: vence }, retencionIgv: { aplica: true } })),
        /tipo de cambio a soles/, 'agente de retención en dólares sin tipo de cambio');
    assert.equal(armarSolicitud(base({ pago: { vencimiento: vence, pagado: 118 } })).formaPago.tipo, 'Contado', 'ya pagado: contado');

    // Exportación: tipo de operación, documento del no domiciliado, afectación 40 y país del servicio.
    const x = solicitudes.exportacion;
    assert.deepEqual([x.tipoOperacion, x.receptor.tipoDoc, x.lineas[0].afectacion, x.paisServicio, x.moneda], ['0201', '0', '40', 'US', 'USD']);
    assert.equal(x.leyendaLetras, 'QUINIENTOS CON 00/100 DÓLARES AMERICANOS');
    assert.equal(armarSolicitud({ ...casos.exportacion, concepto: 'bienes' }).tipoOperacion, '0200');

    // MYPE: la tasa del año, solo con el régimen declarado.
    assert.equal(solicitudes.mype.lineas[0].porcentaje, '10.50');
    rechaza(() => armarSolicitud({ ...casos.mype, regimenMype: false }), /no es una tasa de IGV/, '10,5 % sin el régimen');
    rechaza(() => armarSolicitud({ ...casos.mype, fecha: new Date('2028-02-01T15:00:00Z') }), /no es una tasa de IGV/, 'sin tasa MYPE publicada para el año');

    // Nota de crédito: tipo 01 si acredita todo, 09 si una parte; referencia a la factura.
    assert.equal(solicitudes.nc_total.notaCredito.tipoNota, '01');
    assert.equal(solicitudes.nc_parcial.notaCredito.tipoNota, '09');
    assert.deepEqual(solicitudes.nc_parcial.notaCredito.referencia, { tipo: '01', serie: 'F001', numero: 1 });
    assert.equal(solicitudes.nc_total.tipo, TIPO_DOC.NOTA_CREDITO);
    assert.equal(solicitudes.nc_total.formaPago, undefined);
    rechaza(() => armarSolicitud({ ...casos.gravada, lineas: [linea(200, 0.18)], totales: totales([linea(200, 0.18)]), notaCreditoDe: factura }), /no puede superar/, 'nota mayor que la factura');

    // Rechazos ANTES de enviar.
    rechaza(() => armarSolicitud(base({ receptor: { taxId: '12345678', pais: 'PE', nombre: 'Juan' } })), /boleta de venta/, 'cliente con DNI');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: '', pais: 'PE', nombre: 'Juan' } })), /boleta de venta/, 'cliente sin RUC');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: RUC, pais: 'PE', nombre: 'Yo' } })), /mismo RUC/, 'autofactura');
    rechaza(() => armarSolicitud(base({ receptor: { taxId: '123', pais: 'US', nombre: 'ACME' } })), /exportación, sin IGV/, 'exterior con IGV');
    rechaza(() => armarSolicitud({ ...casos.inafecto, afectacionSinIgv: null }), /exonerados o inafectos/, '0 % sin declarar');
    rechaza(() => armarSolicitud(base({ lineas: [linea(100, 0.16)], totales: totales([linea(100, 0.16)]) })), /no es una tasa de IGV/, 'tasa ajena');
    rechaza(() => armarSolicitud({ ...casos.mype, lineas: [linea(100, 0.105), linea(100, 0.18)], totales: totales([linea(100, 0.105), linea(100, 0.18)]) }), /una sola tasa de IGV/, 'mezcla de tasas (3462)');
    rechaza(() => armarSolicitud(base({ totales: { ...totales([linea(100, 0.18)]), retencionTotal: 3 } })), /retenciones/, 'retenciones del emisor');
    rechaza(() => armarSolicitud(base({ serie: 'B001' })), /empezar con F/, 'serie de boleta');
    rechaza(() => armarSolicitud(base({ totales: { ...totales([linea(100, 0.18)]), total: 120 } })), /no cuadran/, 'total que no cuadra');
    rechaza(() => armarSolicitud(base({ totales: { ...totales([linea(100, 0.18)]), discountTotal: 5 } })), /descuento del documento/, 'descuento que no cuadra');
    assert.equal(rucValido('20100066603'), RUC);
    assert.equal(rucValido('20100066604'), null, 'dígito verificador');

    // Importe en letras.
    assert.equal(enteroEnLetras(1_001_021), 'UN MILLÓN MIL VEINTIUNO');
    assert.equal(enteroEnLetras(423_225), 'CUATROCIENTOS VEINTITRÉS MIL DOSCIENTOS VEINTICINCO');
    assert.equal(enteroEnLetras(21_000), 'VEINTIÚN MIL');
    assert.equal(enteroEnLetras(100), 'CIEN');
    assert.equal(montoEnLetras('2000000.50', 'EUR'), 'DOS MILLONES CON 50/100 EUROS');

    // QR y representación impresa.
    const qr = sunatQr(g, 'abc=');
    assert.equal(qr, `${RUC}|01|F001|1|18.00|118.00|2026-10-08|6|${RUC_CLIENTE}|abc=`);
    const rep = representacionSunat({ solicitud: g, resumen: 'abc=', constancia: '123', homologacion: false });
    assert.equal(rep.titulo, 'FACTURA ELECTRÓNICA');
    assert.equal(rep.qrNivel, 'Q');
    assert.equal(rep.qrPosicion, 'inferior');
    assert.ok(rep.leyendas.includes('Representación impresa de la factura electrónica'), 'campo 62');
    for (const k of ['RUC', 'Serie y número', 'Fecha de emisión', 'Moneda', 'Adquirente', 'Op. gravada', 'Importe total', 'Forma de pago']) {
        assert.ok(rep.filas.some((f) => f.k === k), `la representación imprime ${k}`);
    }
    assert.doesNotMatch(mensajeRechazo(3280) + mensajeExcepcion(1033) + mensajeExcepcion(109), /xxx|ticket|nodo|value=/, 'regla 14');
}

// ── 3. Firma XMLDSig ────────────────────────────────────────────────────────
const firmados = Object.fromEntries(Object.entries(solicitudes).map(([k, s]) => [k, firmarComprobante(s, CRED, 'sha256')]));
{
    for (const [k, f] of Object.entries(firmados)) assert.ok(verificarFirmaPropia(solicitudes[k], f), `firma propia de ${k}`);
    const sha1 = firmarComprobante(factura, CRED, 'sha1');
    assert.ok(verificarFirmaPropia(factura, sha1), 'firma SHA-1');
    const alterado = { ...firmados.gravada, xml: firmados.gravada.xml.replace('CLIENTE S.A.', 'OTRO S.A.') };
    assert.ok(verificarFirmaPropia(factura, firmados.gravada), 'control');
    assert.equal(createHash('sha256').update(xmlComprobante({ ...factura, receptor: { ...factura.receptor, nombre: 'OTRO S.A.' } }, '')).digest('base64') === alterado.resumen, false, 'cambiar un dato cambia el resumen');
    assert.match(firmados.gravada.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="[^"]+" xmlns:cbc="[^"]+" xmlns:ds="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#" xmlns:ext="[^"]+"><ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="SignatureCord">/);
}

// ── 2 y 3. Esquemas y canonicalización con libxml2 ──────────────────────────
{
    let xmllint = true;
    try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }
    if (!xmllint) {
        if (process.env.SUNAT_XSD_REQUIRED === '1') throw new Error('xmllint no está disponible y SUNAT_XSD_REQUIRED=1');
        process.stdout.write('security:sunat: AVISO — xmllint no está instalado; se omiten los esquemas y la canonicalización independiente.\n');
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'sunat-check-'));
        try {
            const xsd = (s) => join(FIX, 'ubl-2.1', 'maindoc', s.tipo === TIPO_DOC.NOTA_CREDITO ? 'UBL-CreditNote-2.1.xsd' : 'UBL-Invoice-2.1.xsd');
            const validar = (nombre, xml, esquema) => {
                const file = join(dir, `${nombre}.xml`);
                writeFileSync(file, xml);
                try {
                    execFileSync('xmllint', ['--noout', '--nonet', '--schema', esquema, file], { stdio: 'pipe' });
                    return null;
                } catch (e) {
                    return String(e.stderr || e.message);
                }
            };
            for (const [k, f] of Object.entries(firmados)) {
                assert.equal(validar(k, f.xml, xsd(solicitudes[k])), null, `${k} no cumple el XSD UBL 2.1`);
                // C14N: lo escrito ES la forma canónica (sin la firma, que la transformación enveloped retira).
                const sinFirma = join(dir, `${k}-sinfirma.xml`);
                writeFileSync(sinFirma, f.xml.replace(/<ds:Signature [\s\S]*<\/ds:Signature>/, ''));
                const c14n = execFileSync('xmllint', ['--c14n', sinFirma]);
                assert.equal(c14n.toString('utf8'), xmlComprobante(solicitudes[k], ''), `${k}: el XML no está en forma canónica`);
                assert.equal(createHash('sha256').update(c14n).digest('base64'), f.resumen, `${k}: el valor resumen no corresponde a la canonicalización de libxml2`);
            }
            // Controles negativos.
            const fuera = firmados.gravada.xml.replace(/(<cbc:IssueDate>[^<]*<\/cbc:IssueDate>)(<cbc:IssueTime>[^<]*<\/cbc:IssueTime>)/, '$2$1');
            assert.notEqual(validar('neg_orden', fuera, xsd(factura)), null, 'IssueTime antes de IssueDate debe romper el esquema');
            assert.notEqual(validar('neg_elemento', firmados.gravada.xml.replace('<cbc:LineCountNumeric>', '<cbc:LineasCount>').replace('</cbc:LineCountNumeric>', '</cbc:LineasCount>'), xsd(factura)), null, 'un elemento que no existe');

            // Sobres SOAP contra el XSD de cada WSDL: el elemento del cuerpo, solo.
            const sol = { usuario: `${RUC}MODDATOS`, clave: 'MODDATOS' };
            const cuerpo = (env) => {
                const m = /<soapenv:Body>([\s\S]*)<\/soapenv:Body>/.exec(env);
                return m[1].replace(/^<ser:(\w+)>/, `<ser:$1 xmlns:ser="${NS_SERVICIO}">`);
            };
            const zip = Buffer.from(zipComprobante(nombreArchivo(factura), firmados.gravada.xml)).toString('base64');
            const clave = { ruc: RUC, tipo: '01', serie: 'F001', numero: 1 };
            for (const [nombre, env, esquema] of [
                ['sendBill-beta', sobreSendBill(sol, `${nombreArchivo(factura)}.zip`, zip), 'billService-beta.xsd'],
                ['sendBill-prod', sobreSendBill(sol, `${nombreArchivo(factura)}.zip`, zip), 'billService-produccion.xsd'],
                ['getStatusAR', sobreConsulta('getStatusAR', sol, clave), 'billService-beta.xsd'],
                ['getStatus', sobreConsulta('getStatus', sol, clave), 'billConsultService-produccion.xsd'],
                ['getStatusCdr', sobreConsulta('getStatusCdr', sol, clave), 'billConsultService-produccion.xsd'],
            ]) {
                assert.equal(validar(nombre, cuerpo(env), join(FIX, esquema)), null, `${nombre} no cumple ${esquema}`);
            }
            assert.notEqual(validar('neg_sobre', cuerpo(sobreSendBill(sol, 'x.zip', zip)).replace('<fileName>', '<ser:fileName>').replace('</fileName>', '</ser:fileName>'), join(FIX, 'billService-beta.xsd')), null, 'fileName va sin namespace');

            // La firma del SignedInfo, verificada con otra implementación (lxml).
            let python = true;
            try { execFileSync('python3', ['-I', '-c', 'import lxml, cryptography'], { stdio: 'ignore' }); } catch { python = false; }
            if (!python) {
                if (process.env.SUNAT_FIRMA_REQUIRED === '1') throw new Error('python3 con lxml y cryptography no está disponible y SUNAT_FIRMA_REQUIRED=1');
                process.stdout.write('security:sunat: AVISO — sin python3/lxml; la firma del SignedInfo solo se verifica con node:crypto.\n');
            } else {
                const verificador = `
import sys, base64, hashlib
from lxml import etree
from cryptography import x509
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
DS = 'http://www.w3.org/2000/09/xmldsig#'
for path in sys.argv[1:]:
    doc = etree.parse(path)
    sig = doc.find('.//{%s}Signature' % DS)
    si = sig.find('{%s}SignedInfo' % DS)
    alg = si.find('{%s}SignatureMethod' % DS).get('Algorithm')
    cert = x509.load_der_x509_certificate(base64.b64decode(sig.find('.//{%s}X509Certificate' % DS).text))
    h = hashes.SHA256() if alg.endswith('sha256') else hashes.SHA1()
    cert.public_key().verify(base64.b64decode(sig.find('{%s}SignatureValue' % DS).text), etree.tostring(si, method='c14n'), padding.PKCS1v15(), h)
    digest = si.find('.//{%s}DigestValue' % DS).text
    sig.getparent().remove(sig)
    hh = hashlib.sha256 if si.find('.//{%s}DigestMethod' % DS).get('Algorithm').endswith('sha256') else hashlib.sha1
    assert base64.b64encode(hh(etree.tostring(doc, method='c14n')).digest()).decode() == digest, path
print('ok')
`;
                const script = join(dir, 'verificar.py');
                writeFileSync(script, verificador);
                const archivos = Object.keys(firmados).map((k) => join(dir, `${k}.xml`));
                const sha1File = join(dir, 'sha1.xml');
                writeFileSync(sha1File, firmarComprobante(factura, CRED, 'sha1').xml);
                const beta = ['factura-credito-retencion-aceptada.xml', 'factura-exportacion-aceptada.xml', 'factura-descuento-exonerado-aceptada.xml', 'nota-credito-parcial-aceptada.xml', 'factura-sha1-aceptada.xml']
                    .map((f) => join(FIX, 'beta', f));
                const out = execFileSync('python3', ['-I', script, ...archivos, sha1File, ...beta], { stdio: ['ignore', 'pipe', 'pipe'] });
                assert.equal(out.toString().trim(), 'ok', 'lxml verifica resumen y firma');
                const malo = join(dir, 'alterado.xml');
                writeFileSync(malo, firmados.gravada.xml.replace('CLIENTE S.A.', 'OTRO S.A.'));
                assert.throws(() => execFileSync('python3', ['-I', script, malo], { stdio: 'pipe' }), 'un documento alterado no verifica');
            }

            // Los comprobantes que beta aceptó siguen cumpliendo el XSD.
            for (const f of ['factura-credito-retencion-aceptada.xml', 'factura-exportacion-aceptada.xml', 'factura-descuento-exonerado-aceptada.xml', 'factura-sha1-aceptada.xml']) {
                assert.equal(validar(`beta-${f}`, leer(`beta/${f}`), join(FIX, 'ubl-2.1', 'maindoc', 'UBL-Invoice-2.1.xsd')), null, f);
            }
            assert.equal(validar('beta-nc', leer('beta/nota-credito-parcial-aceptada.xml'), join(FIX, 'ubl-2.1', 'maindoc', 'UBL-CreditNote-2.1.xsd')), null, 'nota de crédito aceptada');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}

// ── ZIP ─────────────────────────────────────────────────────────────────────
{
    const z = zipComprobante(nombreArchivo(factura), firmados.gravada.xml);
    assert.deepEqual(xmlsDelZip(z), [{ nombre: `${RUC}-01-F001-1.xml`, xml: firmados.gravada.xml }], 'un único XML con el nombre del archivo');
    assert.deepEqual(z, zipComprobante(nombreArchivo(factura), firmados.gravada.xml), 'el mismo comprobante produce los mismos bytes');
}

// ── 5. Respuestas reales del servicio beta ──────────────────────────────────
{
    const cdr = await leerCdr(await parsearSendBill(leer('beta/respuesta-sendbill-aceptada.xml')));
    assert.equal(cdr.codigo, 0);
    assert.match(cdr.descripcion, /ha sido aceptada/);
    assert.equal(cdr.referencia, 'F001-530748');
    assert.equal(cdr.receptor, `6-${RUC_CLIENTE}`);
    assert.ok(cdr.procesoId);
    assert.equal((await leerCdrXml(leer('beta/cdr-nota-credito-aceptada.xml'))).descripcion, 'La Nota de Credito numero F001-530830, ha sido aceptada');
    for (const [f, code] of [['respuesta-sendbill-2335-alterado.xml', 2335], ['respuesta-sendbill-3280-importe-total.xml', 3280], ['respuesta-sendbill-3462-tasa-igv.xml', 3462], ['respuesta-sendbill-3267-cuota.xml', 3267]]) {
        await assert.rejects(parsearSendBill(leer(`beta/${f}`)), (e) => e instanceof SunatFaultError && e.codigo === code && claseCodigo(code) === 'rechazo', f);
        assert.doesNotMatch(mensajeRechazo(code), /ticket|nodo|Detalle/, `regla 14 en ${code}`);
    }
    await assert.rejects(parsearConsulta(leer('beta/respuesta-getstatusar-beta.xml'), 'getStatusAR'), (e) => e instanceof SunatFaultError && e.codigo === null, 'beta no tiene consulta');
    assert.equal(codigoDeFault('soap-env:Client.0111', ''), 111);
    assert.equal(codigoDeFault('soap-env:Server', '0109 - El sistema no puede responder'), 109);
}

process.stdout.write('security:sunat (WSDL y catálogos oficiales, XSD UBL 2.1, firma XMLDSig contra libxml2/lxml, reglas del anexo 1 y respuestas reales del servicio beta) OK\n');
