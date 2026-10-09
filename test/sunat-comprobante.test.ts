// Piezas puras de la factura electrónica con SUNAT: armado de la solicitud
// (afectaciones, tasas, exportación, descuentos, forma de pago, retención,
// nota de crédito), XML UBL 2.1 y su firma, monto en letras, QR y
// representación impresa, lectura de respuestas REALES del servicio beta,
// ZIP, PDF y registro del riel. Lo que se valida contra los esquemas
// oficiales (XSD, WSDL, catálogos) vive en scripts/sunat-check.mjs.
import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import forge from 'node-forge';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import { railConfig } from '../src/lib/fiscal/latam/config';
import { DOCUMENTOS_DE_RIELES, railDeDocumento, railDePais } from '../src/lib/fiscal/latam/rieles';
import { representacionDe } from '../src/lib/fiscal/latam/representacion';
import {
    armarSolicitud, conNumero, fechaHoraLima, idComprobante, nombreArchivo, numeroDocumento, problemasDeCuadre, rucValido, serieValida,
    tasasIgvAdmitidas, type EntradaComprobante,
} from '../src/lib/fiscal/latam/sunat/comprobante';
import { xmlComprobante } from '../src/lib/fiscal/latam/sunat/ubl';
import { firmarComprobante, verificarFirmaPropia } from '../src/lib/fiscal/latam/sunat/firma';
import { montoEnLetras } from '../src/lib/fiscal/latam/sunat/letras';
import { representacionSunat, sunatQr } from '../src/lib/fiscal/latam/sunat/representacion';
import { leerCdrXml } from '../src/lib/fiscal/latam/sunat/cdr';
import { parsearConsulta, parsearSendBill, SunatFaultError, urlDe } from '../src/lib/fiscal/latam/sunat/servicio';
import { xmlsDelZip, zipComprobante } from '../src/lib/fiscal/latam/sunat/zip';
import { mensajeCodigo, mensajeExcepcion, mensajeRechazo } from '../src/lib/fiscal/latam/sunat/errores';
import { claseCodigo } from '../src/lib/fiscal/latam/sunat/constantes';
import { faltantesAjustes, solDe } from '../src/lib/fiscal/latam/sunat/autorizacion';
import { isFiscalDocument, selectDocumentType } from '../src/lib/fiscal/document-kind';
import { createInvoicePdf } from '../src/lib/fiscal/invoice-pdf';

const RUC = '20100066603';
const RUC_CLIENTE = '20131312955';
const FIXTURES = new URL('../scripts/fixtures/sunat/beta/', import.meta.url);
const fixture = (nombre: string) => readFileSync(new URL(nombre, FIXTURES), 'utf8');
// 10:00 en Lima.
const FECHA = new Date('2026-10-09T15:00:00Z');

const linea = (base: number, rate: number, extra: Record<string, unknown> = {}) => ({
    description: 'Servicio de consultoría', quantity: 1, unitPrice: base, taxRate: rate, subtotal: base,
    taxAmount: Math.round(base * rate * 100) / 100, total: Math.round(base * (1 + rate) * 100) / 100, ...extra,
});
const totales = (lineas: ReturnType<typeof linea>[], currency = 'PEN', extra: Record<string, unknown> = {}) => {
    const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    const taxes = Math.round(lineas.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100;
    return { subtotal, taxes, total: Math.round((subtotal + taxes) * 100) / 100, currency, ...extra };
};
const entrada = (over: Partial<EntradaComprobante> = {}): EntradaComprobante => {
    const lineas = (over.lineas as ReturnType<typeof linea>[] | undefined) ?? [linea(100, 0.18)];
    return {
        ruc: RUC, razonSocial: 'EMPRESA DE PRUEBA S.A.C.', serie: 'F001', concepto: 'servicios', afectacionSinIgv: '20', fecha: FECHA,
        receptor: { taxId: RUC_CLIENTE, pais: 'PE', nombre: 'CLIENTE S.A.' }, lineas, totales: totales(lineas), ...over,
    };
};
const rechaza = (fn: () => unknown, re: RegExp) => {
    let error: unknown;
    try { fn(); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(RailDatosError);
    expect((error as Error).message).toMatch(re);
};

function credencial() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const keyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'prueba' }, { name: 'organizationalUnitName', value: RUC }]);
    cert.setIssuer([{ name: 'commonName', value: 'prueba' }]);
    cert.sign(key, forge.md.sha256.create());
    return { certPem: forge.pki.certificateToPem(cert), keyPem };
}

describe('identificadores y fechas', () => {
    it('valida el RUC con su dígito verificador y la serie de facturas', () => {
        expect(rucValido(RUC)).toBe(RUC);
        expect(rucValido('20100066604')).toBeNull();
        expect(rucValido('2010006660')).toBeNull();
        expect(serieValida('f001')).toBe('F001');
        expect(serieValida('B001')).toBeNull();
        expect(serieValida('F0001')).toBeNull();
    });

    it('fecha y hora de emisión en Lima (UTC-5), no en la del servidor', () => {
        expect(fechaHoraLima(new Date('2026-10-09T03:00:00Z'))).toEqual({ fecha: '2026-10-08', hora: '22:00:00' });
        expect(fechaHoraLima(FECHA)).toEqual({ fecha: '2026-10-09', hora: '10:00:00' });
    });

    it('tasas de IGV: 18 % siempre; la del régimen MYPE solo con el régimen declarado y en su año', () => {
        expect(tasasIgvAdmitidas('2026-10-09', false)).toEqual([0.18]);
        expect(tasasIgvAdmitidas('2026-10-09', true)).toEqual([0.18, 0.105]);
        expect(tasasIgvAdmitidas('2027-03-01', true)).toEqual([0.18, 0.15]);
        // Sin tasa publicada para el año: no se inventa.
        expect(tasasIgvAdmitidas('2028-01-01', true)).toEqual([0.18]);
    });
});

describe('armado de la factura', () => {
    it('venta interna gravada al contado: totales, operación 0101, leyenda en letras', () => {
        const s = armarSolicitud(entrada());
        expect(s).toMatchObject({
            tipo: '01', serie: 'F001', numero: 0, fecha: '2026-10-09', hora: '10:00:00', moneda: 'PEN', tipoOperacion: '0101',
            establecimiento: '0000', receptor: { tipoDoc: '6', numDoc: RUC_CLIENTE, nombre: 'CLIENTE S.A.' },
            formaPago: { tipo: 'Contado' }, leyendaLetras: 'CIENTO DIECIOCHO CON 00/100 SOLES',
        });
        expect(s.totales).toMatchObject({ gravadas: '100.00', igv: '18.00', valorVenta: '100.00', importeTotal: '118.00', exoneradas: '0.00' });
        expect(s.lineas[0]).toMatchObject({ afectacion: '10', porcentaje: '18.00', unidad: 'ZZ', valorUnitario: '100', precioUnitario: '118' });
        expect(problemasDeCuadre(conNumero(s, 1))).toEqual([]);
    });

    it('un concepto al 0 % se declara como el negocio indicó (exonerado o inafecto) y sin indicación no se adivina', () => {
        const lineas = [linea(100, 0.18), linea(50, 0)];
        expect(armarSolicitud(entrada({ lineas, totales: totales(lineas) })).lineas[1].afectacion).toBe('20');
        expect(armarSolicitud(entrada({ lineas, totales: totales(lineas), afectacionSinIgv: '30' })).totales.inafectas).toBe('50.00');
        rechaza(() => armarSolicitud(entrada({ lineas, totales: totales(lineas), afectacionSinIgv: null })), /exonerados o inafectos/);
    });

    it('rechaza antes de enviar lo que SUNAT rechazaría', () => {
        // Cliente sin RUC: boleta, que el riel no emite.
        rechaza(() => armarSolicitud(entrada({ receptor: { taxId: '12345678', pais: 'PE', nombre: 'Juan' } })), /boleta de venta/);
        // Una tasa que no es de IGV.
        const l17 = [linea(100, 0.17)];
        rechaza(() => armarSolicitud(entrada({ lineas: l17, totales: totales(l17) })), /no es una tasa de IGV/);
        // MYPE sin el régimen declarado.
        const lm = [linea(100, 0.105)];
        rechaza(() => armarSolicitud(entrada({ lineas: lm, totales: totales(lm) })), /no es una tasa de IGV/);
        expect(armarSolicitud(entrada({ lineas: lm, totales: totales(lm), regimenMype: true })).totales.igv).toBe('10.50');
        // Dos tasas en la misma factura (SUNAT: 3462).
        const mixtas = [linea(100, 0.18), linea(100, 0.105)];
        rechaza(() => armarSolicitud(entrada({ lineas: mixtas, totales: totales(mixtas), regimenMype: true })), /una sola tasa de IGV/);
        // Totales que no cuadran con los conceptos.
        rechaza(() => armarSolicitud(entrada({ totales: { subtotal: 100, taxes: 18, total: 120, currency: 'PEN' } })), /no cuadran/);
        // Retenciones restadas del total (no es como se declara en Perú).
        rechaza(() => armarSolicitud(entrada({ totales: { ...totales([linea(100, 0.18)]), retencionTotal: 3 } as any })), /no descuenta retenciones/);
        // Mismo RUC que el emisor.
        rechaza(() => armarSolicitud(entrada({ receptor: { taxId: RUC, pais: 'PE', nombre: 'Yo' } })), /mismo RUC/);
        // Serie que no es de facturas.
        rechaza(() => armarSolicitud(entrada({ serie: 'B001' })), /empezar con F/);
    });

    it('exportación de servicios: operación 0201, adquirente no domiciliado, afectación 40 y país de uso', () => {
        const l = [linea(500, 0)];
        const s = armarSolicitud(entrada({ receptor: { taxId: '12-3456789', pais: 'US', nombre: 'ACME INC.' }, lineas: l, totales: totales(l, 'USD') }));
        expect(s).toMatchObject({ tipoOperacion: '0201', paisServicio: 'US', moneda: 'USD', receptor: { tipoDoc: '0', numDoc: '12-3456789' } });
        expect(s.lineas[0].afectacion).toBe('40');
        expect(s.totales.exportacion).toBe('500.00');
        expect(s.leyendaLetras).toBe('QUINIENTOS CON 00/100 DÓLARES AMERICANOS');
        // Con IGV no es exportación.
        const g = [linea(500, 0.18)];
        rechaza(() => armarSolicitud(entrada({ receptor: { taxId: '12-3456789', pais: 'US', nombre: 'ACME INC.' }, lineas: g, totales: totales(g, 'USD') })), /exportación, sin IGV/);
        // Sin identificación tributaria del exterior.
        rechaza(() => armarSolicitud(entrada({ receptor: { taxId: '', pais: 'US', nombre: 'ACME INC.' }, lineas: l, totales: totales(l, 'USD') })), /identificación tributaria/);
        // Bienes: 0200, sin país de uso.
        expect(armarSolicitud(entrada({ concepto: 'bienes', receptor: { taxId: 'X1', pais: 'CL', nombre: 'Cliente' }, lineas: l, totales: totales(l, 'USD') })))
            .toMatchObject({ tipoOperacion: '0200' });
    });

    it('el descuento por concepto viaja como cargo/descuento 00 sobre el valor bruto', () => {
        const l = [linea(900, 0.18, { discount: 100, quantity: 2 })];
        const s = armarSolicitud(entrada({ lineas: l, totales: totales(l, 'PEN', { discountTotal: 100 }) }));
        expect(s.lineas[0]).toMatchObject({ valorVenta: '900.00', valorUnitario: '500', descuento: { factor: '0.1', monto: '100.00', base: '1000.00' } });
        expect(s.totales.descuentos).toBe('100.00');
        const xml = xmlComprobante(conNumero(s, 7));
        expect(xml).toContain('<cbc:AllowanceChargeReasonCode>00</cbc:AllowanceChargeReasonCode>');
        expect(xml).toContain('<cbc:MultiplierFactorNumeric>0.1</cbc:MultiplierFactorNumeric>');
    });

    it('al crédito: cuota con vencimiento y neto pendiente; lo ya cobrado lo descuenta', () => {
        const l = [linea(1000, 0.18)];
        const s = armarSolicitud(entrada({ lineas: l, totales: totales(l), pago: { vencimiento: '2026-11-08', pagado: 180 } }));
        expect(s.vencimiento).toBe('2026-11-08');
        expect(s.formaPago).toEqual({ tipo: 'Credito', montoNeto: '1000.00', cuotas: [{ monto: '1000.00', vence: '2026-11-08' }] });
        // Pagado completo o vencimiento el mismo día: contado.
        expect(armarSolicitud(entrada({ lineas: l, totales: totales(l), pago: { vencimiento: '2026-11-08', pagado: 1180 } })).formaPago?.tipo).toBe('Contado');
        expect(armarSolicitud(entrada({ lineas: l, totales: totales(l), pago: { vencimiento: '2026-10-09' } })).formaPago?.tipo).toBe('Contado');
    });

    it('retención del IGV: 3 % del total si el cliente es agente y la operación supera S/ 700', () => {
        const l = [linea(1000, 0.18)];
        const s = armarSolicitud(entrada({ lineas: l, totales: totales(l), pago: { vencimiento: '2026-11-08' }, retencionIgv: { aplica: true } }));
        expect(s.retencion).toEqual({ base: '1180.00', factor: '0.03', monto: '35.40' });
        expect(s.formaPago).toMatchObject({ tipo: 'Credito', montoNeto: '1144.60' });
        const xml = xmlComprobante(conNumero(s, 1));
        expect(xml).toContain('<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>62</cbc:AllowanceChargeReasonCode><cbc:MultiplierFactorNumeric>0.03</cbc:MultiplierFactorNumeric><cbc:Amount currencyID="PEN">35.40</cbc:Amount><cbc:BaseAmount currencyID="PEN">1180.00</cbc:BaseAmount></cac:AllowanceCharge>');
        // Por debajo del umbral, no.
        const chica = [linea(500, 0.18)];
        expect(armarSolicitud(entrada({ lineas: chica, totales: totales(chica), pago: { vencimiento: '2026-11-08' }, retencionIgv: { aplica: true } })).retencion).toBeUndefined();
        // En dólares hace falta el tipo de cambio a soles para medir el umbral.
        rechaza(() => armarSolicitud(entrada({ lineas: l, totales: totales(l, 'USD'), pago: { vencimiento: '2026-11-08' }, retencionIgv: { aplica: true } })), /tipo de cambio a soles/);
        expect(armarSolicitud(entrada({ lineas: l, totales: totales(l, 'USD'), pago: { vencimiento: '2026-11-08' }, retencionIgv: { aplica: true, tipoCambioPen: 3.7 } })).retencion?.monto).toBe('35.40');
    });
});

describe('nota de crédito', () => {
    const factura = conNumero(armarSolicitud(entrada({ lineas: [linea(100, 0.18), linea(50, 0)], totales: totales([linea(100, 0.18), linea(50, 0)]) })), 42);

    it('acredita la factura completa como anulación (01) y conserva adquirente y afectaciones', () => {
        const otros = [linea(100, 0.18), linea(50, 0)];
        const s = armarSolicitud(entrada({ lineas: otros, totales: totales(otros), afectacionSinIgv: '30', receptor: { taxId: '20000000001', pais: 'PE', nombre: 'Otro' }, notaCreditoDe: factura, motivo: 'Error en el precio' }));
        expect(s).toMatchObject({ tipo: '07', receptor: factura.receptor, notaCredito: { tipoNota: '01', motivo: 'Error en el precio', referencia: { tipo: '01', serie: 'F001', numero: 42 } } });
        expect(s.lineas[1].afectacion).toBe('20');
        expect(s.tipoOperacion).toBeUndefined();
        expect(s.formaPago).toBeUndefined();
        const xml = xmlComprobante(conNumero(s, 3));
        expect(xml).toMatch(/^<CreditNote /);
        expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
        expect(xml).toContain('<cac:InvoiceDocumentReference><cbc:ID>F001-42</cbc:ID><cbc:DocumentTypeCode>01</cbc:DocumentTypeCode></cac:InvoiceDocumentReference>');
    });

    it('una parte es disminución en el valor (09); más que la factura o en otra moneda, no', () => {
        const parte = [linea(50, 0.18), linea(10, 0)];
        expect(armarSolicitud(entrada({ lineas: parte, totales: totales(parte), notaCreditoDe: factura })).notaCredito?.tipoNota).toBe('09');
        const mas = [linea(200, 0.18), linea(50, 0)];
        rechaza(() => armarSolicitud(entrada({ lineas: mas, totales: totales(mas), notaCreditoDe: factura })), /superar el importe/);
        rechaza(() => armarSolicitud(entrada({ lineas: parte, totales: totales(parte, 'USD'), notaCreditoDe: factura })), /misma moneda/);
        rechaza(() => armarSolicitud(entrada({ lineas: [linea(50, 0.18)], totales: totales([linea(50, 0.18)]), notaCreditoDe: factura })), /mismos conceptos/);
    });
});

describe('XML, firma y ZIP', () => {
    const cred = credencial();
    const s = conNumero(armarSolicitud(entrada()), 123);

    it('nombres del comprobante y del archivo', () => {
        expect(idComprobante(s)).toBe('F001-123');
        expect(nombreArchivo(s)).toBe(`${RUC}-01-F001-123`);
        expect(numeroDocumento(s, false)).toBe('F001-00000123');
        expect(numeroDocumento(s, true)).toBe('H-F001-00000123');
    });

    it('la firma XMLDSig enveloped se verifica y el valor resumen es el DigestValue', () => {
        const f = firmarComprobante(s, cred);
        expect(f.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><Invoice ')).toBe(true);
        expect(f.xml).toContain(`<ds:DigestValue>${f.resumen}</ds:DigestValue>`);
        expect(f.xml).toContain('Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"');
        expect(verificarFirmaPropia(s, f)).toBe(true);
        // Otro contenido no verifica con esa firma.
        const otro = conNumero(s, 124);
        expect(verificarFirmaPropia(otro, f)).toBe(false);
        // SHA-1 también es aceptado por SUNAT (fixture real del servicio beta).
        const f1 = firmarComprobante(s, cred, 'sha1');
        expect(f1.algoritmo).toBe('sha1');
        expect(verificarFirmaPropia(s, f1)).toBe(true);
    });

    it('el ZIP es determinista y contiene un solo XML con el nombre del comprobante', () => {
        const f = firmarComprobante(s, cred);
        const a = zipComprobante(nombreArchivo(s), f.xml);
        const b = zipComprobante(nombreArchivo(s), f.xml);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        expect(xmlsDelZip(a)).toEqual([{ nombre: `${nombreArchivo(s)}.xml`, xml: f.xml }]);
    });

    it('caracteres especiales escapados, sin romper el XML', () => {
        const l = [linea(100, 0.18, { description: 'Diseño & "branding" <web>' })];
        const xml = xmlComprobante(conNumero(armarSolicitud(entrada({ lineas: l, totales: totales(l) })), 1));
        expect(xml).toContain('Diseño &amp; "branding" &lt;web&gt;');
    });
});

describe('monto en letras', () => {
    it('importe en letras con céntimos y moneda (catálogo 52, código 1000)', () => {
        expect(montoEnLetras('118.00', 'PEN')).toBe('CIENTO DIECIOCHO CON 00/100 SOLES');
        expect(montoEnLetras('21.00', 'PEN')).toBe('VEINTIUNO CON 00/100 SOLES');
        expect(montoEnLetras('2021.05', 'PEN')).toBe('DOS MIL VEINTIUNO CON 05/100 SOLES');
        expect(montoEnLetras('1000001.50', 'USD')).toBe('UN MILLÓN UNO CON 50/100 DÓLARES AMERICANOS');
        expect(montoEnLetras('0.99', 'EUR')).toBe('CERO CON 99/100 EUROS');
        // Una moneda sin nombre conocido se escribe con su código, no se inventa.
        expect(montoEnLetras('100.00', 'GBP')).toBe('CIEN CON 00/100 GBP');
    });
});

describe('QR y representación impresa', () => {
    const s = conNumero(armarSolicitud(entrada({ pago: { vencimiento: '2026-11-08' } })), 5);

    it('QR con los diez campos del anexo 6 en su orden', () => {
        expect(sunatQr(s, 'abc=')).toBe(`${RUC}|01|F001|5|18.00|118.00|2026-10-09|6|${RUC_CLIENTE}|abc=`);
    });

    it('la representación lleva QR nivel Q al pie, valor resumen, monto en letras y forma de pago', () => {
        const rep = representacionSunat({ solicitud: s, resumen: 'abc=', constancia: '123456', homologacion: true });
        expect(rep).toMatchObject({ rail: 'sunat', titulo: 'FACTURA ELECTRÓNICA', qrNivel: 'Q', qrPosicion: 'inferior', prueba: true });
        expect(rep.qrUrl).toBe(sunatQr(s, 'abc='));
        expect(rep.leyendas).toEqual(expect.arrayContaining(['SON: CIENTO DIECIOCHO CON 00/100 SOLES', 'Valor resumen: abc=']));
        expect(rep.filas).toEqual(expect.arrayContaining([
            { k: 'Forma de pago', v: 'Crédito' }, { k: 'Constancia de recepción', v: '123456' }, { k: 'Serie y número', v: 'F001-5' },
        ]));
        // Sobrevive al guardado en provider_data.
        expect(representacionDe({ latam: { representacion: JSON.parse(JSON.stringify(rep)) } })).toEqual(rep);
    });

    it('el PDF dibuja el bloque de SUNAT', () => {
        const rep = representacionSunat({ solicitud: s, resumen: 'abc=', homologacion: false });
        const pdf = createInvoicePdf({
            invoiceNumber: 'F001-00000005', countryCode: 'PE', currency: 'PEN', issuedAt: FECHA,
            issuer: { legalName: 'EMPRESA DE PRUEBA S.A.C.', taxId: RUC, address: { countryCode: 'PE' } },
            recipient: { legalName: 'CLIENTE S.A.', taxId: RUC_CLIENTE, address: { countryCode: 'PE' } },
            lines: [linea(100, 0.18)], subtotal: 100, taxTotal: 18, total: 118, autoridad: rep,
        } as any);
        const text = [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
            .map((m) => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } }).join('\n');
        expect(text).toContain('FACTURA ELECTR');
        expect(text).toContain('SON: CIENTO DIECIOCHO');
        expect(text).toContain('Representaci');
    });
});

describe('respuestas reales del servicio beta', () => {
    it('sendBill aceptado: CDR con código 0, referencia y adquirente', async () => {
        const cdr = await leerCdrXml(fixture('cdr-factura-aceptada.xml'));
        expect(cdr.codigo).toBe(0);
        expect(cdr.referencia).toMatch(/^F001-\d+$/);
        expect(cdr.receptor).toBe(`6-${RUC_CLIENTE}`);
        expect(cdr.descripcion).toMatch(/ha sido aceptada/);
        const zip = await parsearSendBill(fixture('respuesta-sendbill-aceptada.xml'));
        expect(zip.length).toBeGreaterThan(0);
    });

    it('un rechazo llega como soap:Fault con el código en faultcode; el mensaje es de Cord', async () => {
        for (const [archivo, codigo] of [['respuesta-sendbill-2335-alterado.xml', 2335], ['respuesta-sendbill-3280-importe-total.xml', 3280], ['respuesta-sendbill-3462-tasa-igv.xml', 3462], ['respuesta-sendbill-3267-cuota.xml', 3267]] as const) {
            const error = await parsearSendBill(fixture(archivo)).then(() => null, (e) => e);
            expect(error).toBeInstanceOf(SunatFaultError);
            expect(error.codigo).toBe(codigo);
            expect(claseCodigo(codigo)).toBe('rechazo');
            expect(mensajeRechazo(codigo)).not.toMatch(/soap|faultcode|Client\./i);
        }
    });

    it('beta no tiene consulta: getStatusAR responde un error interno', async () => {
        await expect(parsearConsulta(fixture('respuesta-getstatusar-beta.xml'), 'getStatusAR')).rejects.toBeInstanceOf(SunatFaultError);
    });

    it('rangos de códigos del manual', () => {
        expect(claseCodigo(0)).toBe('aceptado');
        expect(claseCodigo(109)).toBe('excepcion_sunat');
        expect(claseCodigo(1033)).toBe('excepcion');
        expect(claseCodigo(2800)).toBe('rechazo');
        expect(claseCodigo(4252)).toBe('observacion');
        expect(mensajeExcepcion(null)).toMatch(/SUNAT/);
        expect(mensajeCodigo(9999)).toMatch(/9999/);
    });
});

describe('ajustes, usuario SOL y riel', () => {
    const previo = { ...process.env };
    afterEach(() => { process.env.SUNAT_ENABLED = previo.SUNAT_ENABLED; process.env.SUNAT_ENTORNO = previo.SUNAT_ENTORNO; });

    it('lo que falta en los ajustes, y los regímenes que Cord no declara dejan el riel sin activar', () => {
        expect(faltantesAjustes({})).toEqual(['serie', 'concepto']);
        expect(faltantesAjustes({ serie: 'F001', concepto: 'servicios' })).toEqual([]);
        expect(faltantesAjustes({ serie: 'F001', concepto: 'bienes', detracciones: true, agentePercepcion: true })).toEqual(['detracciones', 'percepcion']);
    });

    it('usuario SOL: el guardado; sin él, el de pruebas solo en beta', () => {
        expect(solDe({ secretos: { usuarioSol: 'cordenvio', claveSol: 'x' } }, RUC, 'produccion')).toEqual({ usuario: `${RUC}CORDENVIO`, clave: 'x' });
        expect(solDe({ secretos: {} }, RUC, 'homologacion')).toEqual({ usuario: `${RUC}MODDATOS`, clave: 'MODDATOS' });
        expect(solDe({ secretos: {} }, RUC, 'produccion')).toBeNull();
    });

    it('nace apagado; producción y beta tienen sus endpoints', () => {
        delete process.env.SUNAT_ENABLED;
        delete process.env.SUNAT_ENTORNO;
        expect(railConfig('sunat')).toMatchObject({ habilitado: false, entorno: 'homologacion' });
        process.env.SUNAT_ENABLED = 'true';
        process.env.SUNAT_ENTORNO = 'produccion';
        expect(railConfig('sunat')).toMatchObject({ habilitado: true, entorno: 'produccion' });
        expect(urlDe('homologacion', 'sendBill')).toBe('https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService');
        expect(urlDe('produccion', 'sendBill')).toBe('https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService');
        expect(urlDe('produccion', 'getStatusCdr')).toBe('https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService');
        expect(() => urlDe('homologacion', 'getStatus')).toThrow();
    });

    it('registro: Perú es SUNAT, sin anulación; emite sunat_invoice solo con el riel listo', () => {
        expect(railDePais('pe')?.id).toBe('sunat');
        expect(railDeDocumento('sunat_credit_note')?.anulable).toBe(false);
        expect(DOCUMENTOS_DE_RIELES).toEqual(expect.arrayContaining(['sunat_invoice', 'sunat_credit_note']));
        expect(isFiscalDocument('sunat_invoice', 'PE')).toBe(true);
        expect(selectDocumentType('PE', 'starter', undefined, true)).toBe('sunat_invoice');
        expect(selectDocumentType('PE', 'starter', undefined, false)).toBe('commercial_invoice');
    });
});
