// Armado de la factura electrónica de la DIAN, sin base de datos ni red: los
// ejemplos oficiales del CUFE/CUDE, el adquiriente, los cuadres con el
// documento de Cord (descuentos, IVA por tarifa, exento/excluido,
// retenciones), la numeración, el XML canónico y la firma. Las fuentes
// oficiales completas (XSD, tablas, WSDL) las cubre scripts/dian-check.mjs.
import { describe, expect, it } from 'vitest';
import { createVerify } from 'node:crypto';
import { calculateDocumentTotals } from '../packages/elements/src/engine';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import { cadenaCufe, cufe, textoQr } from '../src/lib/fiscal/latam/dian/cufe';
import {
    armarBase, avisoNumeracion, conNumero, conceptoNotaCredito, dvNit, faltantesResolucion, fichaClienteDian, momentoColombia, nitValido,
    resolverAdquiriente, tributoDeRetencion,
} from '../src/lib/fiscal/latam/dian/comprobante';
import { documentoXml, nombresArchivo } from '../src/lib/fiscal/latam/dian/ubl';
import { E, escAtributo, escTexto, serializar } from '../src/lib/fiscal/latam/dian/xml';
import { firmarDocumento } from '../src/lib/fiscal/latam/dian/firma';
import { interpretarMensaje, mensajeRechazo } from '../src/lib/fiscal/latam/dian/errores';
import { representacionDian } from '../src/lib/fiscal/latam/dian/representacion';
import { cadenaDePrueba } from '../scripts/dian-cadena-prueba.mjs';

const EMISOR = {
    nit: '900373076', dv: '4', razonSocial: 'Negocio de Prueba S.A.S.', tipoPersona: '1' as const,
    responsabilidades: ['O-13'], tributo: '01', direccion: { municipio: '05001', linea: 'Carrera 43A # 1-50' },
};
const RES = { numero: '18760000001', prefijo: 'SETP', desde: 990000000, hasta: 995000000, vigenteDesde: '2019-01-19', vigenteHasta: '2030-01-19' };
const CLAVES = { claveTecnica: 'fc8eac422eba16e22ffd8c6f94b3f40a6e38162c', pin: '12345' };
const SOFTWARE = '56f2ae4e-9812-4fad-9255-08fcfcd5ccb0';
const CLIENTE = resolverAdquiriente({ nombre: 'Cliente S.A.S.', identificacion: '800197268-4', pais: 'CO', correo: 'a@b.co', ficha: { tipoPersona: '1', tributo: '01' } });
const AHORA = new Date('2026-10-09T15:00:00Z');

function documentoDe(items: any[], opts: any = {}) {
    const t = calculateDocumentTotals(items, { roundLines: 2, ...opts });
    return {
        lineas: t.lineas.map((l: any) => ({ description: l.descripcion, quantity: l.cantidad, unitPrice: l.base / l.cantidad, taxRate: l.tax_rate, subtotal: l.base, taxAmount: l.impuesto, total: l.total, discount: l.descuento || undefined })),
        totales: { subtotal: t.subtotal, taxes: t.impuestos, total: t.total, currency: 'COP', retenciones: t.retenciones, retencionTotal: t.retencionTotal, discountTotal: t.descuentoTotal },
    };
}
const base = (items: any[], opts: any = {}, over: any = {}) => armarBase({
    clase: 'factura', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, ...documentoDe(items, opts),
    tratamientoSinIva: 'exento', resolucion: RES, softwareId: SOFTWARE, ...over,
});
const rechaza = (fn: () => unknown, re: RegExp) => expect(fn).toThrowError(expect.objectContaining({ name: RailDatosError.name, message: expect.stringMatching(re) }));

describe('CUFE y CUDE', () => {
    it('reproduce el ejemplo oficial del Anexo Técnico 1.9 (11.2)', () => {
        const d = {
            numero: '323200000129', fecha: '2019-01-16', hora: '10:53:10-05:00', valorBruto: '1500000.00', iva: '285000.00', inc: 0, ica: 0,
            total: '1785000.00', nitEmisor: '700085371', numAdquiriente: '800199436', clave: '693ff6f2a553c3646a063436fd4dd9ded0311471', tipoAmbiente: '1' as const,
        };
        expect(cadenaCufe(d)).toBe('3232000001292019-01-1610:53:10-05:001500000.0001285000.00040.00030.001785000.00700085371800199436693ff6f2a553c3646a063436fd4dd9ded03114711');
        expect(cufe(d)).toBe('8bb918b19ba22a694f1da11c643b5e9de39adf60311cf179179e9b33381030bcd4c3c3f156c506ed5908f9276f5bd9b4');
    });

    it('reproduce el CUDE de nota crédito del Anexo (11.4.3)', () => {
        expect(cufe({
            numero: '8110007871', fecha: '2019-01-12', hora: '07:00:00-05:00', valorBruto: 5000, iva: 950, inc: 0, ica: 0, total: 5950,
            nitEmisor: '900373076', numAdquiriente: '8355990', clave: '12301', tipoAmbiente: '1',
        })).toBe('907e4444decc9e59c160a2fb3b6659b33dc5b632a5008922b9a62f83f757b1c448e47f5867f2b50dbdb96f48c7681168');
    });
});

describe('NIT y adquiriente', () => {
    it('dígito de verificación de la DIAN', () => {
        expect(dvNit('800197268')).toBe('4');
        expect(nitValido('900.373.076-4')).toEqual({ nit: '900373076', dv: '4' });
        expect(nitValido('900373076-5')).toBeNull();
        expect(nitValido('abc')).toBeNull();
    });

    it('consumidor final, NIT, cédula y exterior: solo se infiere lo inequívoco', () => {
        expect(resolverAdquiriente({ nombre: '', identificacion: '', pais: 'CO', correo: null, ficha: null })).toMatchObject({ consumidorFinal: true, numero: '222222222222', tipoDocumento: '13', tributo: { id: 'ZZ' } });
        expect(CLIENTE).toMatchObject({ tipoDocumento: '31', numero: '800197268', dv: '4', tributo: { id: '01', nombre: 'IVA' } });
        expect(resolverAdquiriente({ nombre: 'Ana', identificacion: '1.020.304.050', pais: 'CO', correo: null, ficha: { tipoDocumento: '13' } }))
            .toMatchObject({ tipoDocumento: '13', numero: '1020304050', tipoPersona: '2', tributo: { id: 'ZZ' } });
        expect(resolverAdquiriente({ nombre: 'Buyer', identificacion: 'B-12345678', pais: 'ES', correo: null, ficha: { tipoPersona: '1' } }))
            .toMatchObject({ tipoDocumento: '50', numero: 'B12345678' });
        rechaza(() => resolverAdquiriente({ nombre: 'Empresa', identificacion: '900373076', pais: 'CO', correo: null, ficha: null }), /tipo de documento/);
        rechaza(() => resolverAdquiriente({ nombre: 'Empresa', identificacion: '800197268-4', pais: 'CO', correo: null, ficha: { tributo: '01' } }), /natural o jurídica/);
        rechaza(() => resolverAdquiriente({ nombre: 'X', identificacion: '', pais: 'MX', correo: null, ficha: null }), /exterior/);
    });

    it('la ficha del cliente solo conserva códigos oficiales', () => {
        expect(fichaClienteDian({ tipoDocumento: '31', tipoPersona: '1', tributo: 'ZZ', responsabilidades: ['O-15', 'O-15', 'X'] }))
            .toEqual({ tipoDocumento: '31', tipoPersona: '1', tributo: 'ZZ', responsabilidades: ['O-15'] });
        expect(fichaClienteDian({ tipoDocumento: '99' })).toBeNull();
        expect(fichaClienteDian('x')).toBeNull();
    });
});

describe('armado y cuadres', () => {
    it('descuento por línea (AllowanceCharge), IVA por tarifa y totales de la DIAN', () => {
        const b = base([
            { descripcion: 'A', cantidad: 2, precio_unitario: 1000, tax_rate: 0.19 },
            { descripcion: 'B', cantidad: 1, precio_unitario: 500, tax_rate: 0.05 },
            { descripcion: 'C', cantidad: 1, precio_unitario: 300, tax_rate: 0 },
        ], { descuento: { tipo: 'porcentaje', valor: 10 } });
        expect(b.lineas.map((l) => [l.bruto, l.descuento, l.neto])).toEqual([['2000.00', '200.00', '1800.00'], ['500.00', '50.00', '450.00'], ['300.00', '30.00', '270.00']]);
        expect(b.lineas[0].precio).toBe('1000.00');
        expect(b.iva.map((s) => [s.tarifa, s.base, s.valor])).toEqual(expect.arrayContaining([['19.00', '1800.00', '342.00'], ['5.00', '450.00', '22.50'], ['0.00', '270.00', '0.00']]));
        expect(b.totales).toMatchObject({ bruto: '2520.00', baseGravable: '2520.00', iva: '364.50', conImpuestos: '2884.50', pagar: '2884.50', descuentos: '280.00' });
    });

    it('excluido: sin TaxTotal en la línea; exento: IVA 0.00; sin decidir, no se envía', () => {
        const items = [{ descripcion: 'Curso', cantidad: 1, precio_unitario: 100, tax_rate: 0 }];
        expect(base(items, {}, { tratamientoSinIva: 'excluido' })).toMatchObject({ iva: [], totales: { baseGravable: '0.00' } });
        expect(base(items, {}, { tratamientoSinIva: 'excluido' }).lineas[0].iva).toBeNull();
        expect(base(items).lineas[0].iva).toEqual({ tarifa: '0.00', base: '100.00', valor: '0.00' });
        rechaza(() => base(items, {}, { tratamientoSinIva: null }), /exentos o excluidos/);
        rechaza(() => base([{ descripcion: 'X', cantidad: 1, precio_unitario: 100, tax_rate: 0.08 }]), /IVA/);
    });

    it('retenciones: ReteIVA y ReteRenta se informan; lo ambiguo no se adivina; el total de Cord cuadra', () => {
        expect(tributoDeRetencion({ tipo: 'ret_iva', baseTipo: 'impuesto' })).toEqual({ id: '05', nombre: 'ReteIVA' });
        expect(tributoDeRetencion({ tipo: 'ret_isr', baseTipo: 'subtotal' })).toEqual({ id: '06', nombre: 'ReteRenta' });
        expect(tributoDeRetencion({ tipo: 'ret_iva', baseTipo: 'subtotal' })).toBeNull();
        const b = base([{ descripcion: 'A', cantidad: 1, precio_unitario: 1000, tax_rate: 0.19 }], {
            retenciones: [{ nombre: 'ReteIVA', tipo: 'ret_iva', tasa: 0.15, base: 'impuesto' }, { nombre: 'ReteICA', tipo: 'ret_iva', tasa: 0.00966 }],
        });
        expect(b.retenciones.map((r) => [r.tributo.id, r.total])).toEqual([['05', '28.50']]);
        expect(b.retencionesNoInformadas).toEqual(['ReteICA']);
        expect(b.totales.pagar).toBe('1190.00');
    });

    it('moneda extranjera exige la tasa a COP congelada; sin ella falla cerrado', () => {
        const d = documentoDe([{ descripcion: 'A', cantidad: 1, precio_unitario: 100, tax_rate: 0.19 }]);
        const usd = (totales: any, fechaTasa: string | null) => armarBase({ clase: 'factura', entorno: 'homologacion', emisor: EMISOR, adquiriente: CLIENTE, lineas: d.lineas, totales, fechaTasa, tratamientoSinIva: null, resolucion: RES, softwareId: SOFTWARE });
        expect(usd({ ...d.totales, currency: 'USD', exchangeRate: 4000, ledgerCurrency: 'COP' }, '2026-10-01').tasaCambio).toEqual({ tasa: '4000.00', fecha: '2026-10-01' });
        rechaza(() => usd({ ...d.totales, currency: 'USD' }, '2026-10-01'), /tipo de cambio/);
    });
});

describe('numeración, fechas y archivos', () => {
    it('número dentro del rango y la vigencia; hora legal de Colombia; nombres del Anexo', () => {
        const b = base([{ descripcion: 'A', cantidad: 1, precio_unitario: 100, tax_rate: 0.19 }]);
        const s = conNumero(b, 990000001, AHORA, CLAVES);
        expect([s.id, s.fecha, s.hora, s.tipoAmbiente, s.algoritmo]).toEqual(['SETP990000001', '2026-10-09', '10:00:00-05:00', '2', 'CUFE-SHA384']);
        expect(nombresArchivo(s)).toEqual({ xml: 'fv0900373076000263B023381.xml', zip: 'z0900373076000263B023381.zip' });
        rechaza(() => conNumero(b, 989999999, AHORA, CLAVES), /rango/);
        rechaza(() => conNumero(b, 990000001, new Date('2030-02-01T12:00:00Z'), CLAVES), /venció/);
        expect(momentoColombia(new Date('2026-10-10T03:00:00Z')).fecha).toBe('2026-10-09');
        expect(faltantesResolucion({ ...RES, prefijo: 'SETPX' })).toEqual(['resolucion_prefijo']);
        expect(avisoNumeracion(RES, null, AHORA)).toMatchObject({ quedan: 5_000_001, agotada: false, proximoAlFin: false });
        expect(avisoNumeracion({ ...RES, vigenteHasta: '2026-10-20' }, null, AHORA).proximoAlFin).toBe(true);
    });

    it('concepto de la nota crédito: anulación si acredita el total; si no, rebaja', () => {
        expect(conceptoNotaCredito(119, 119)).toBe('2');
        expect(conceptoNotaCredito(50, 119)).toBe('3');
    });
});

describe('XML y firma', () => {
    it('escapes de C14N y atributos en orden canónico', () => {
        expect(escTexto('a&b<c>\r')).toBe('a&amp;b&lt;c&gt;&#xD;');
        expect(escAtributo('"\t\n')).toBe('&quot;&#x9;&#xA;');
        expect(serializar(E('p:a', { 'xmlns:p': 'urn:p', z: '1', b: '2', 'p:c': '3' }, E('p:b', { 'xmlns:p': 'urn:p' }))))
            .toBe('<p:a xmlns:p="urn:p" b="2" z="1" p:c="3"><p:b></p:b></p:a>');
    });

    it('la firma XAdES cubre el documento canónico y valida con la llave del certificado', () => {
        const c = cadenaDePrueba(EMISOR.nit);
        const s = conNumero(base([{ descripcion: 'A', cantidad: 1, precio_unitario: 100, tax_rate: 0.19 }]), 990000001, AHORA, CLAVES);
        const xml = firmarDocumento(documentoXml(s), { cadena: c.cadena, llavePem: c.llavePem }, s.firmadoAt, { id: 'xmldsig-prueba' });
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?><Invoice ')).toBe(true);
        expect(xml.match(/<xades:Cert>/g)).toHaveLength(3);
        expect(xml).toContain('<xades:SigningTime>2026-10-09T10:00:00-05:00</xades:SigningTime>');
        expect(xml).toContain(`<cbc:UUID schemeID="2" schemeName="CUFE-SHA384">${s.cufe}</cbc:UUID>`);
        // El SignedInfo canónico (con los namespaces de la raíz) verifica con la llave pública.
        const si = /<ds:SignedInfo>[\s\S]*?<\/ds:SignedInfo>/.exec(xml)![0];
        const ns = /^<Invoice ([^>]*)>/.exec(xml.slice(xml.indexOf('<Invoice')))![1];
        const canonico = si.replace('<ds:SignedInfo>', `<ds:SignedInfo ${ns}>`);
        const valor = /<ds:SignatureValue[^>]*>([^<]+)</.exec(xml)![1];
        expect(createVerify('RSA-SHA256').update(canonico).verify(c.cadena[0], valor, 'base64')).toBe(true);
    });

    it('representación gráfica con el QR del Anexo en cada página', () => {
        const s = conNumero(base([{ descripcion: 'A', cantidad: 1, precio_unitario: 100, tax_rate: 0.19 }]), 990000001, AHORA, CLAVES);
        const r = representacionDian({ solicitud: s, homologacion: false });
        expect(r.qrUrl).toBe(textoQr({ numero: s.id, fecha: s.fecha, hora: s.hora, nitEmisor: '900373076', docAdquiriente: '800197268', valorBruto: '100.00', iva: '19.00', otrosImpuestos: 0, total: '119.00', cufe: s.cufe, url: s.qrUrl }));
        expect(r).toMatchObject({ rail: 'dian', titulo: 'FACTURA ELECTRÓNICA DE VENTA', qrCadaPagina: true });
        expect(r.prueba).toBeUndefined();
        expect(r.pie).toContain(`CUFE: ${s.cufe}`);
    });
});

describe('reglas de la DIAN', () => {
    it('rechazo vs notificación y mensaje para el negocio', () => {
        expect(interpretarMensaje('Regla: FAJ71, Notificación: x', false)).toEqual({ regla: 'FAJ71', tipo: 'notificacion', texto: 'x' });
        expect(interpretarMensaje('Regla: AA09 Valor del CUFE', true)).toMatchObject({ regla: 'AA09', tipo: 'rechazo' });
        expect(mensajeRechazo([interpretarMensaje('Regla: FAB27b, Rechazo: x', true)])).toMatch(/PIN/);
        expect(mensajeRechazo([interpretarMensaje('Regla: ZZ99, Rechazo: x', true)])).toMatch(/regla ZZ99/);
    });
});
