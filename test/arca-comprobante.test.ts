// Piezas puras de la factura electrónica con ARCA: certificado, lectura de
// respuestas reales y simuladas, representación impresa (QR, leyendas), PDF,
// configuración del riel y selección del tipo de documento. Lo que se valida
// contra los esquemas oficiales vive en scripts/arca-check.mjs.
import { describe, expect, it, afterEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import forge from 'node-forge';
import { parsearCertificado } from '../src/lib/fiscal/latam/certificado';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import { railConfig } from '../src/lib/fiscal/latam/config';
import { railDeDocumento, railDePais, DOCUMENTOS_DE_RIELES } from '../src/lib/fiscal/latam/rieles';
import { representacionDe } from '../src/lib/fiscal/latam/representacion';
import { representacionArca } from '../src/lib/fiscal/latam/arca/representacion';
import { armarSolicitud, conNumero } from '../src/lib/fiscal/latam/arca/comprobante';
import { parsearCAESolicitar, parsearCompConsultar, parsearCotizacion, parsearPtosVenta } from '../src/lib/fiscal/latam/arca/wsfe';
import { construirTRA, cuitsRepresentadas, fechaHoraArgentina, parsearLoginCms } from '../src/lib/fiscal/latam/arca/wsaa';
import { mensajeObservacion, mensajeRechazo } from '../src/lib/fiscal/latam/arca/errores';
import { documentPrefix, isFiscalDocument, selectDocumentType } from '../src/lib/fiscal/document-kind';
import { createInvoicePdf } from '../src/lib/fiscal/invoice-pdf';

const CUIT = '30712345671';
const CUIT_RI = '20111111112';
const NS = 'http://ar.gov.afip.dif.FEV1/';
const soap = (op: string, inner: string) => `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header><FEHeaderInfo xmlns="${NS}"><ambiente>Produccion - Pto</ambiente></FEHeaderInfo></soap:Header><soap:Body><${op}Response xmlns="${NS}"><${op}Result>${inner}</${op}Result></${op}Response></soap:Body></soap:Envelope>`;

function par(bits = 2048, opts: { cuit?: string; desde?: Date; hasta?: Date } = {}) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: bits });
    const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const key = forge.pki.privateKeyFromPem(keyPem);
    const cert = forge.pki.createCertificate();
    cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    cert.serialNumber = '01';
    cert.validity.notBefore = opts.desde ?? new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = opts.hasta ?? new Date(Date.now() + 365 * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'facturacion' }, { type: '2.5.4.5', value: `CUIT ${opts.cuit ?? CUIT}` }]);
    cert.setIssuer([{ name: 'commonName', value: 'AC Computadores' }]);
    cert.sign(key, forge.md.sha256.create());
    return { cert, key, certPem: forge.pki.certificateToPem(cert), keyPem };
}

describe('certificado de ARCA', () => {
    const p = par();

    it('acepta .crt + .key (PEM, PKCS#8) y extrae CUIT, vigencia y huella sin exponer nada más', () => {
        const c = parsearCertificado({ certificado: p.certPem, llave: p.keyPem });
        expect(c.sujetoSerialNumber).toBe(`CUIT ${CUIT}`);
        expect(c.sujetoCN).toBe('facturacion');
        expect(c.emisorCN).toBe('AC Computadores');
        expect(c.huellaSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(c.caduca.getTime()).toBeGreaterThan(Date.now());
    });

    it('acepta una llave cifrada con su contraseña y un PKCS#12', () => {
        const cifrada = forge.pki.encryptRsaPrivateKey(p.key, 'secreto', { algorithm: 'aes256' });
        expect(parsearCertificado({ certificado: p.certPem, llave: cifrada, llavePassword: 'secreto' }).sujetoSerialNumber).toBe(`CUIT ${CUIT}`);
        expect(() => parsearCertificado({ certificado: p.certPem, llave: cifrada, llavePassword: 'otra' })).toThrow(RailDatosError);

        const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(p.key, [p.cert], 'clave', { algorithm: '3des' })).getBytes();
        const c = parsearCertificado({ pkcs12: Buffer.from(p12, 'binary'), pkcs12Password: 'clave' });
        expect(c.sujetoSerialNumber).toBe(`CUIT ${CUIT}`);
        expect(() => parsearCertificado({ pkcs12: Buffer.from(p12, 'binary'), pkcs12Password: 'mala' })).toThrow(RailDatosError);
    });

    it('rechaza una llave que no es la del certificado, una RSA corta y un certificado vencido', () => {
        const otra = par();
        expect(() => parsearCertificado({ certificado: p.certPem, llave: otra.keyPem })).toThrow(/no corresponde|no es la/i);
        const corta = par(1024);
        expect(() => parsearCertificado({ certificado: corta.certPem, llave: corta.keyPem })).toThrow(RailDatosError);
        const vencido = par(2048, { desde: new Date('2024-01-01'), hasta: new Date('2025-01-01') });
        expect(() => parsearCertificado({ certificado: vencido.certPem, llave: vencido.keyPem })).toThrow(/venci/i);
    }, 20_000);
});

describe('respuestas de ARCA', () => {
    it('CAE aprobado con observaciones', async () => {
        const r = await parsearCAESolicitar(soap('FECAESolicitar', '<FeCabResp><Cuit>30712345671</Cuit><PtoVta>3</PtoVta><CbteTipo>1</CbteTipo><Resultado>A</Resultado></FeCabResp>'
            + '<FeDetResp><FECAEDetResponse><CbteDesde>42</CbteDesde><CbteHasta>42</CbteHasta><CbteFch>20261008</CbteFch><Resultado>A</Resultado>'
            + '<Observaciones><Obs><Code>10217</Code><Msg>texto crudo</Msg></Obs></Observaciones><CAE>76123456789012</CAE><CAEFchVto>20261018</CAEFchVto></FECAEDetResponse></FeDetResp>'));
        expect(r).toMatchObject({ resultadoCabecera: 'A', resultado: 'A', numero: 42, cae: '76123456789012', caeVence: '20261018', cbteFch: '20261008', ambiente: 'Produccion - Pto' });
        expect(r.observaciones).toEqual([{ code: 10217, msg: 'texto crudo' }]);
        expect(mensajeObservacion(10217)).not.toContain('texto crudo');
    });

    it('rechazo: el mensaje para el usuario sale del código, nunca del texto de ARCA', async () => {
        const r = await parsearCAESolicitar(soap('FECAESolicitar', '<FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>7</CbteDesde><Resultado>R</Resultado>'
            + '<Observaciones><Obs><Code>10242</Code><Msg>Campo Condicion Frente al IVA del receptor ...</Msg></Obs><Obs><Code>10013</Code><Msg>otro</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp>'));
        expect(r.resultado).toBe('R');
        const msg = mensajeRechazo(r.observaciones);
        expect(msg).not.toMatch(/Campo Condicion/);
        expect(msg.length).toBeGreaterThan(10);
        expect(mensajeRechazo([{ code: 99999, msg: 'desconocido' }])).not.toContain('desconocido');
    });

    it('consulta de un comprobante, puntos de venta y cotización', async () => {
        const c = await parsearCompConsultar(soap('FECompConsultar', '<ResultGet><DocTipo>80</DocTipo><DocNro>20111111112</DocNro><CbteDesde>42</CbteDesde><CbteFch>20261008</CbteFch>'
            + '<ImpTotal>1210</ImpTotal><MonId>PES</MonId><Resultado>A</Resultado><CodAutorizacion>76123456789012</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261018</FchVto><PtoVta>3</PtoVta><CbteTipo>1</CbteTipo></ResultGet>'));
        expect(c.comprobante).toMatchObject({ numero: 42, ptoVta: 3, cbteTipo: 1, docTipo: 80, codAutorizacion: '76123456789012', impTotal: 1210 });
        const vacio = await parsearCompConsultar(soap('FECompConsultar', '<Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors>'));
        expect(vacio.comprobante).toBeNull();
        const pv = await parsearPtosVenta(soap('FEParamGetPtosVenta', '<ResultGet><PtoVenta><Nro>3</Nro><EmisionTipo>CAE - Ws</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta><PtoVenta><Nro>4</Nro><EmisionTipo>CAE</EmisionTipo><Bloqueado>S</Bloqueado></PtoVenta></ResultGet>'));
        expect(pv.puntos.map((p) => [p.numero, p.bloqueado])).toEqual([[3, false], [4, true]]);
        const cot = await parsearCotizacion(soap('FEParamGetCotizacion', '<ResultGet><MonId>DOL</MonId><MonCotiz>1045.5</MonCotiz><FchCotiz>20261008</FchCotiz></ResultGet>'));
        expect(cot.cotizacion).toBe(1045.5);
    });

    it('ticket del WSAA: token, firma, vencimiento y CUIT representadas', async () => {
        const token = Buffer.from(`<sso><login><relations><relation key="${CUIT}" reltype="4"/><relation key="${CUIT_RI}" reltype="4"/></relations></login></sso>`).toString('base64');
        const ta = `<?xml version="1.0" encoding="UTF-8"?><loginTicketResponse version="1.0"><header><generationTime>2026-10-08T10:00:00-03:00</generationTime><expirationTime>2026-10-08T22:00:00-03:00</expirationTime></header><credentials><token>${token}</token><sign>abc==</sign></credentials></loginTicketResponse>`;
        const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${ta.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn></loginCmsResponse></soapenv:Body></soapenv:Envelope>`;
        const t = await parsearLoginCms(xml);
        expect(t.sign).toBe('abc==');
        expect(t.expira.toISOString()).toBe('2026-10-09T01:00:00.000Z');
        expect(cuitsRepresentadas(t.token)).toEqual([CUIT, CUIT_RI]);
    });

    it('el TRA lleva hora de Argentina con su desplazamiento y una ventana de ±10 minutos', () => {
        expect(fechaHoraArgentina(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-08T12:00:00-03:00');
        const tra = construirTRA('wsfe', new Date('2026-10-08T15:00:00Z'), 7);
        expect(tra).toContain('<uniqueId>7</uniqueId><generationTime>2026-10-08T11:50:00-03:00</generationTime><expirationTime>2026-10-08T12:10:00-03:00</expirationTime>');
        expect(tra).toContain('<service>wsfe</service>');
    });
});

const linea = (subtotal: number, taxRate: number) => ({ description: 'x', quantity: 1, unitPrice: subtotal, taxRate, subtotal, taxAmount: Math.round(subtotal * taxRate * 100) / 100, total: 0 });
function solicitud(over: Record<string, unknown> = {}) {
    const lineas = (over.lineas as any) ?? [linea(1000, 0.21)];
    const subtotal = lineas.reduce((s: number, l: any) => s + l.subtotal, 0);
    const taxes = lineas.reduce((s: number, l: any) => s + l.taxAmount, 0);
    return conNumero(armarSolicitud({
        cuitEmisor: CUIT, condicionEmisor: 'responsable_inscripto', puntoVenta: 3, concepto: 1, fecha: new Date('2026-10-08T15:00:00Z'),
        receptor: { taxId: CUIT_RI, pais: 'AR', condicionIva: 1 }, lineas, totales: { subtotal, taxes, total: subtotal + taxes, currency: 'ARS' },
        moneda: { id: 'PES', cotizacion: 1 }, ...over,
    } as any), 42);
}

describe('representación impresa', () => {
    it('Factura A: letra, código, CAE con vencimiento y QR; sin leyendas de consumidor final', () => {
        const r = representacionArca({ solicitud: solicitud(), cae: '76123456789012', caeVence: '2026-10-18', condicionEmisor: 'responsable_inscripto', homologacion: false, ingresosBrutos: '901-123456-7', inicioActividades: '2020-03-01' });
        expect(r).toMatchObject({ titulo: 'FACTURA A', letra: 'A', codigo: 'COD. 01' });
        expect(Object.fromEntries(r.filas.map((f) => [f.k, f.v]))).toMatchObject({
            'Punto de venta': '00003', 'Comp. Nro': '00000042', 'Fecha de emisión': '08/10/2026', 'CUIT del emisor': '30-71234567-1',
            'Ingresos Brutos': '901-123456-7', 'Inicio de actividades': '01/03/2020', Receptor: 'CUIT 20-11111111-2',
            'CAE N°': '76123456789012', 'Fecha de Vto. de CAE': '18/10/2026',
        });
        expect(r.leyendas).toEqual([]);
        expect(r.prueba).toBeUndefined();
        expect(r.pie).toContain('76123456789012');
        const qr = JSON.parse(Buffer.from(r.qrUrl!.split('?p=')[1], 'base64').toString());
        expect(qr).toMatchObject({ fecha: '2026-10-08', ptoVta: 3, tipoCmp: 1, nroCmp: 42, importe: 1210, tipoDocRec: 80, codAut: 76123456789012 });
    });

    it('Factura B a consumidor final: leyenda "A CONSUMIDOR FINAL" y la de transparencia fiscal con el IVA contenido', () => {
        const r = representacionArca({ solicitud: solicitud({ receptor: { taxId: '', pais: 'AR', condicionIva: null } }), cae: '76123456789012', caeVence: null, condicionEmisor: 'responsable_inscripto', homologacion: false });
        expect(r.letra).toBe('B');
        expect(r.leyendas[0]).toBe('A CONSUMIDOR FINAL');
        expect(r.leyendas[1]).toMatch(/Transparencia Fiscal al Consumidor.*IVA Contenido: \$ 210,00/);
        expect(r.filas.find((f) => f.k === 'Receptor')?.v).toBe('Sin identificar');
    });

    it('Factura A a un monotributista lleva la leyenda del crédito fiscal; homologación se marca como prueba', () => {
        const r = representacionArca({ solicitud: solicitud({ receptor: { taxId: CUIT_RI, pais: 'AR', condicionIva: 6 } }), cae: '76123456789012', caeVence: null, condicionEmisor: 'responsable_inscripto', homologacion: true });
        expect(r.leyendas.join(' ')).toMatch(/Régimen General/);
        expect(r.leyendas[0]).toMatch(/homologación/);
        expect(r.prueba).toBe(true);
        expect(r.pie).toMatch(/Sin validez fiscal/);
    });

    it('representacionDe solo acepta una representación bien formada', () => {
        const r = representacionArca({ solicitud: solicitud(), cae: '76123456789012', caeVence: null, condicionEmisor: 'responsable_inscripto', homologacion: false });
        expect(representacionDe({ latam: { representacion: r } })?.titulo).toBe('FACTURA A');
        expect(representacionDe({ latam: { representacion: { titulo: 3 } } })).toBeNull();
        expect(representacionDe(null)).toBeNull();
    });

    it('el PDF dibuja título, código, CAE y leyendas del riel', () => {
        const autoridad = representacionArca({ solicitud: solicitud({ receptor: { taxId: '', pais: 'AR', condicionIva: null } }), cae: '76123456789012', caeVence: '2026-10-18', condicionEmisor: 'responsable_inscripto', homologacion: false });
        const pdf = createInvoicePdf({
            invoiceNumber: 'FA-B-00003-00000042', countryCode: 'AR', currency: 'ARS', issuedAt: new Date('2026-10-08T15:00:00Z'),
            issuer: { legalName: 'ACME SRL', taxId: CUIT, address: { countryCode: 'AR' } },
            recipient: { legalName: 'Consumidor final', address: { countryCode: 'AR' } },
            lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRate: 0.21, subtotal: 1000, taxAmount: 210, total: 1210 }],
            subtotal: 1000, taxTotal: 210, total: 1210, autoridad,
        } as any);
        const text = [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
            .map((m) => { try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; } }).join('\n');
        expect(text).toContain('COD. 06');
        expect(text).toContain('76123456789012');
        expect(text).toContain('A CONSUMIDOR FINAL');
        expect(text).toContain('Comprobante electr');
    });
});

describe('riel y tipo de documento', () => {
    const previo = { ...process.env };
    afterEach(() => { process.env.ARCA_ENABLED = previo.ARCA_ENABLED; process.env.ARCA_ENTORNO = previo.ARCA_ENTORNO; });

    it('nace apagado; un entorno desconocido lo apaga en vez de adivinar', () => {
        delete process.env.ARCA_ENABLED;
        delete process.env.ARCA_ENTORNO;
        expect(railConfig('arca')).toMatchObject({ habilitado: false, entorno: 'homologacion' });
        process.env.ARCA_ENABLED = 'true';
        expect(railConfig('arca')).toMatchObject({ habilitado: true, entorno: 'homologacion' });
        process.env.ARCA_ENTORNO = 'produccion';
        expect(railConfig('arca')).toMatchObject({ habilitado: true, entorno: 'produccion' });
        process.env.ARCA_ENTORNO = 'prod';
        expect(railConfig('arca')).toMatchObject({ habilitado: false, motivo: 'entorno_invalido' });
    });

    it('registro de rieles y tipos de documento', () => {
        expect(railDePais('ar')?.id).toBe('arca');
        expect(railDePais('MX')).toBeNull();
        expect(railDeDocumento('arca_credit_note')?.anulable).toBe(false);
        expect(DOCUMENTOS_DE_RIELES).toEqual(['arca_invoice', 'arca_credit_note']);
        expect(isFiscalDocument('arca_invoice', 'AR')).toBe(true);
        expect(isFiscalDocument('commercial_invoice', 'AR')).toBe(false);
        expect(documentPrefix('arca_credit_note', 'FA')).toBe('NC-FA');
    });

    it('Argentina emite arca_invoice solo con el riel listo; sin él conserva la factura comercial', () => {
        expect(selectDocumentType('AR', 'starter', undefined, true)).toBe('arca_invoice');
        expect(selectDocumentType('AR', 'starter', 'commercial', true)).toBe('proforma');
        expect(selectDocumentType('AR', 'starter', undefined, false)).toBe('commercial_invoice');
        expect(() => selectDocumentType('AR', 'starter', 'fiscal', false)).toThrow(/habilitada/);
        expect(selectDocumentType('AR', 'free', undefined, true)).toBe('proforma');
    });
});
