// Piezas puras de la factura electrónica con el SII: RUT y texto ISO-8859-1,
// montos en pesos enteros, timbre electrónico, folios (CAF y su vigencia),
// PDF417, representación impresa y PDF con copia cedible, configuración del
// riel y selección del tipo de documento. Lo que se valida contra el ejemplo
// oficial, los esquemas y los WSDL del SII vive en scripts/sii-check.mjs.
import { afterEach, describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { cafDePrueba, llavesCaf } from '../scripts/fixtures/sii/caf-prueba.mjs';
import { RailDatosError } from '../src/lib/fiscal/latam/errores';
import { railConfig } from '../src/lib/fiscal/latam/config';
import { railDeDocumento, railDePais } from '../src/lib/fiscal/latam/rieles';
import { representacionDe } from '../src/lib/fiscal/latam/representacion';
import { campo, fechaChile, fechaHoraChile, rutConPuntos, rutValido, textoLatin1 } from '../src/lib/fiscal/latam/sii/texto';
import { armarBorrador, idDocumento, numeroDocumento, type EntradaDte } from '../src/lib/fiscal/latam/sii/dte';
import { timbrar, verificarDD } from '../src/lib/fiscal/latam/sii/ted';
import { cafVigente, parsearCaf, venceCaf } from '../src/lib/fiscal/latam/sii/caf';
import { estadoFolios, type ResumenCaf } from '../src/lib/fiscal/latam/sii/cafs';
import { codificarPdf417, correccionErrores, evaluar, medidasTimbre } from '../src/lib/fiscal/latam/sii/pdf417';
import { filaAHex, representacionSii } from '../src/lib/fiscal/latam/sii/representacion';
import { faseDte, faseEnvio, mensajeEnvioRechazado, mensajeUpload } from '../src/lib/fiscal/latam/sii/errores';
import { faltantesAjustes } from '../src/lib/fiscal/latam/sii/autorizacion';
import { documentPrefix, isFiscalDocument, selectDocumentType } from '../src/lib/fiscal/document-kind';
import { createInvoicePdf } from '../src/lib/fiscal/invoice-pdf';

const RUT = '76123456-0';
const emisor = { rut: RUT, razonSocial: 'Empresa de Prueba SpA', giro: 'Consultoría', acteco: [620200], direccion: 'Av. Providencia 1234', comuna: 'Providencia' };
const receptor = { rut: '77777777-7', razonSocial: 'Cliente Ltda.', giro: 'Comercio', direccion: 'San Diego 2222', comuna: 'La Florida', pais: 'CL' };
const linea = (o: Record<string, unknown>) => ({ description: 'Servicio', quantity: 1, unitPrice: 0, taxRate: 0.19, subtotal: 0, taxAmount: 0, total: 0, ...o }) as any;
const entrada = (o: Partial<EntradaDte> = {}): EntradaDte => ({
    emisor, receptor, fechaEmision: '2026-10-09',
    lineas: [linea({ unitPrice: 100_000, subtotal: 100_000, taxAmount: 19_000, total: 119_000 })],
    totales: { subtotal: 100_000, taxes: 19_000, total: 119_000, currency: 'CLP' },
    ...o,
});
const llaves = llavesCaf();
const caf33 = parsearCaf(cafDePrueba({ rut: RUT, tipo: 33, desde: 1, hasta: 100, fecha: '2026-10-01', llaves }).xml, RUT);

describe('RUT y texto', () => {
    it('normaliza el RUT y valida el dígito verificador (también K)', () => {
        expect(rutValido('76.123.456-0')).toBe(RUT);
        expect(rutValido(' 76123456-0 ')).toBe(RUT);
        expect(rutValido('60.803.000-k')).toBe('60803000-K');
        expect(rutValido('76123456-9')).toBeNull();
        expect(rutValido('')).toBeNull();
        expect(rutConPuntos('60803000-K')).toBe('60.803.000-K');
    });

    it('todo texto queda en ISO-8859-1, sin saltos de línea y truncado al largo del esquema', () => {
        const t = textoLatin1('Ñandú “Cía” — 5€');
        expect([...t].every((c) => c.charCodeAt(0) <= 0xff)).toBe(true);
        expect(t).toContain('Ñandú');
        expect(campo('Línea 1\nLínea 2', 40)).toBe('Línea 1 Línea 2');
        expect(campo('x'.repeat(50), 40)).toHaveLength(40);
        expect(campo('EMPRESA  LTDA', 40)).toBe('EMPRESA  LTDA');
    });

    it('fechas en la hora de Chile, con su cambio de horario', () => {
        expect(fechaChile(new Date('2026-10-10T02:30:00Z'))).toBe('2026-10-09');
        expect(fechaHoraChile(new Date('2026-07-01T12:00:00Z'))).toBe('2026-07-01T08:00:00');
        expect(fechaHoraChile(new Date('2026-01-01T12:00:00Z'))).toBe('2026-01-01T09:00:00');
    });
});

describe('montos en pesos y tipo de documento', () => {
    it('afecto → 33 con IVA 19 % del neto; todo exento → 34; mezcla → 33 con IndExe', () => {
        expect(armarBorrador(entrada())).toMatchObject({ tipo: 33, neto: 100_000, exento: 0, iva: 19_000, total: 119_000, formaPago: 1 });
        const exenta = armarBorrador(entrada({
            lineas: [linea({ taxRate: 0, unitPrice: 50_000, subtotal: 50_000, total: 50_000 })],
            totales: { subtotal: 50_000, taxes: 0, total: 50_000, currency: 'CLP' },
        }));
        expect(exenta).toMatchObject({ tipo: 34, neto: 0, exento: 50_000, iva: 0, total: 50_000 });
        const mixta = armarBorrador(entrada({
            lineas: [linea({ unitPrice: 10_000, subtotal: 10_000, taxAmount: 1900, total: 11_900 }), linea({ taxRate: 0, unitPrice: 5000, subtotal: 5000, total: 5000 })],
            totales: { subtotal: 15_000, taxes: 1900, total: 16_900, currency: 'CLP' },
        }));
        expect(mixta).toMatchObject({ tipo: 33, neto: 10_000, exento: 5000, iva: 1900, total: 16_900 });
        expect(mixta.lineas.map((l) => l.exento)).toEqual([false, true]);
    });

    it('descuento como monto por línea; precio y cantidad solo si cuadran exacto', () => {
        const b = armarBorrador(entrada({
            lineas: [linea({ quantity: 3, unitPrice: 33_333.33, subtotal: 90_000, taxAmount: 17_100, total: 107_100, discount: 10_000 })],
            totales: { subtotal: 90_000, taxes: 17_100, total: 107_100, currency: 'CLP', discountTotal: 10_000 },
        }));
        // round(3 × 33.333,33) = 100.000 = monto + descuento: el SII puede recalcularlo.
        expect(b.lineas[0]).toMatchObject({ monto: 90_000, descuento: 10_000, cantidad: '3', precio: '33333.33' });
        const inconsistente = armarBorrador(entrada({
            lineas: [linea({ quantity: 3, unitPrice: 33_000, subtotal: 90_000, taxAmount: 17_100, total: 107_100, discount: 10_000 })],
            totales: { subtotal: 90_000, taxes: 17_100, total: 107_100, currency: 'CLP', discountTotal: 10_000 },
        }));
        expect(inconsistente.lineas[0].precio).toBeUndefined();
        expect(inconsistente.lineas[0].cantidad).toBeUndefined();
        expect(() => armarBorrador(entrada({
            lineas: [linea({ unitPrice: 100_000, subtotal: 90_000, taxAmount: 17_100, total: 107_100, discount: 10_000 })],
            totales: { subtotal: 90_000, taxes: 17_100, total: 107_100, currency: 'CLP', discountTotal: 9000 },
        }))).toThrow(/descuento/);
    });

    it('crédito con vencimiento y período de servicio; contado si vence el mismo día', () => {
        const b = armarBorrador(entrada({ vencimiento: '2026-11-08', servicio: { desde: '2026-10-01', hasta: '2026-10-31' } }));
        expect(b).toMatchObject({ formaPago: 2, vencimiento: '2026-11-08', periodo: { desde: '2026-10-01', hasta: '2026-10-31' } });
        expect(armarBorrador(entrada({ vencimiento: '2026-10-09' })).formaPago).toBe(1);
        expect(() => armarBorrador(entrada({ servicio: { desde: '2026-10-31', hasta: '2026-10-01' } }))).toThrow(/período/);
    });

    it('nota de crédito: CodRef 1 si anula el total, 3 si corrige; nunca más que la factura', () => {
        const original = { tipo: 33 as const, folio: 7, fechaEmision: '2026-10-01', total: 119_000, receptor: { ...receptor } };
        const total = armarBorrador(entrada({ notaCreditoDe: original, receptor: {} }));
        expect(total).toMatchObject({ tipo: 61, referencias: [{ tipo: 33, folio: 7, codigo: 1, razon: 'Anula documento' }] });
        const parcial = armarBorrador(entrada({
            notaCreditoDe: original, receptor: {}, motivo: 'Devolución parcial',
            lineas: [linea({ unitPrice: 10_000, subtotal: 10_000, taxAmount: 1900, total: 11_900 })],
            totales: { subtotal: 10_000, taxes: 1900, total: 11_900, currency: 'CLP' },
        }));
        expect(parcial.referencias?.[0]).toMatchObject({ codigo: 3, razon: 'Devolución parcial' });
        expect(() => armarBorrador(entrada({
            notaCreditoDe: { ...original, total: 1000 }, receptor: {},
        }))).toThrow(/no puede superar/);
    });

    it('lo que no es una factura chilena se dice con un mensaje para el dueño del negocio', () => {
        const rechazo = (e: EntradaDte) => { try { armarBorrador(e); } catch (x) { return x; } return null; };
        const ret = rechazo(entrada({ totales: { subtotal: 100_000, taxes: 19_000, total: 103_750, currency: 'CLP', retencionTotal: 15_250 } }));
        expect(ret).toBeInstanceOf(RailDatosError);
        expect((ret as Error).message).toMatch(/boleta de honorarios/);
        expect((rechazo(entrada({ receptor: { razonSocial: 'Consumidor' } })) as Error).message).toMatch(/boleta electrónica/);
        expect((rechazo(entrada({ receptor: { razonSocial: 'Acme', pais: 'AR' } })) as Error).message).toMatch(/exportación/);
        expect((rechazo(entrada({ totales: { subtotal: 100_000, taxes: 19_000, total: 119_000, currency: 'EUR' } })) as Error).message).toMatch(/CLP/);
    });

    it('identificador y número del documento', () => {
        expect(idDocumento(33, 60)).toBe('F60T33');
        expect(numeroDocumento(34, 12, false)).toBe('FX-12');
        expect(numeroDocumento(33, 12, true)).toBe('C-FE-12');
    });
});

describe('timbre y folios', () => {
    const datos = {
        rutEmisor: RUT, tipo: 33, folio: 5, fechaEmision: '2026-10-09', rutReceptor: '77777777-7', razonSocialReceptor: 'Cliente Ltda.',
        montoTotal: 119_000, primerItem: 'Servicio', cafXml: caf33.cafXml, timestamp: '2026-10-09T12:00:00',
    };

    it('el timbre se firma con la llave del CAF y verifica con su RSAPK', () => {
        const t = timbrar(datos, caf33.llavePrivadaPem);
        expect(verificarDD(t.dd, t.firma, llaves.m, llaves.e)).toBe(true);
        expect(verificarDD(t.dd.replace('<MNT>119000</MNT>', '<MNT>119001</MNT>'), t.firma, llaves.m, llaves.e)).toBe(false);
        expect(t.texto.startsWith('<TED version="1.0"><DD><RE>76123456-0</RE>')).toBe(true);
        expect(t.texto).toContain(caf33.cafXml);
        expect(t.texto).not.toMatch(/>\s+</);
    });

    it('el CAF se valida contra el RUT y su vigencia es de seis meses (33 y 61)', () => {
        expect(caf33).toMatchObject({ rutEmisor: RUT, tipo: 33, desde: 1, hasta: 100, fechaAutorizacion: '2026-10-01', idk: 100 });
        expect(() => parsearCaf(cafDePrueba({ rut: RUT }).xml, '77777777-7')).toThrow(RailDatosError);
        expect(() => parsearCaf('<AUTORIZACION/>', RUT)).toThrow(RailDatosError);
        expect(venceCaf(61, '2026-08-31')).toBe('2027-02-27');
        expect(cafVigente(34, '2020-01-01', '2026-10-09')).toBe(true);
    });

    it('avisa cuando quedan pocos folios', () => {
        const caf = (tipo: 33 | 34 | 61, desde: number, hasta: number, siguiente: number, vencido = false): ResumenCaf => ({
            id: `${tipo}-${desde}`, tipo, desde, hasta, siguiente, restantes: hasta - siguiente + 1, fechaAutorizacion: '2026-10-01',
            vence: null, vencido, nombreArchivo: null, subidoAt: '',
        });
        const e = estadoFolios([caf(33, 1, 100, 85), caf(34, 1, 500, 2), caf(61, 1, 10, 11), caf(33, 101, 200, 101, true)]);
        expect(e.find((f) => f.tipo === 33)).toEqual({ tipo: 33, disponibles: 16, porAgotarse: true });
        expect(e.find((f) => f.tipo === 34)).toEqual({ tipo: 34, disponibles: 499, porAgotarse: false });
        expect(e.find((f) => f.tipo === 61)).toEqual({ tipo: 61, disponibles: 0, porAgotarse: true });
    });

    it('los datos del emisor que faltan se dicen como códigos', () => {
        expect(faltantesAjustes({}, 'homologacion')).toEqual(['giro', 'acteco', 'comuna', 'unidad_sii', 'resolucion']);
        expect(faltantesAjustes({ giro: 'x', acteco: [620200], comuna: 'y', unidadSii: 'z', resoluciones: { produccion: { numero: 80, fecha: '2014-08-22' } } }, 'homologacion')).toEqual(['resolucion']);
    });
});

describe('PDF417', () => {
    it('corrección de errores nivel 5: síndromes nulos en las 64 raíces', () => {
        const datos = [10, 901, 70, 80, 90, 100, 110, 120, 130, 140];
        const palabras = [...datos, ...correccionErrores(datos, 5)];
        let r = 1;
        for (let i = 1; i <= 64; i++) { r = (r * 3) % 929; expect(evaluar(palabras, r)).toBe(0); }
    });

    it('el timbre de un DTE cabe en las medidas del SII', () => {
        const t = timbrar({
            rutEmisor: RUT, tipo: 33, folio: 99, fechaEmision: '2026-10-09', rutReceptor: '77777777-7', razonSocialReceptor: 'R'.repeat(40),
            montoTotal: 999_999_999, primerItem: 'I'.repeat(40), cafXml: caf33.cafXml, timestamp: '2026-10-09T12:00:00',
        }, caf33.llavePrivadaPem);
        const bytes = Buffer.from(t.texto, 'latin1');
        const m = medidasTimbre(bytes);
        const s = codificarPdf417(bytes, m.columnas);
        expect(m.moduloMm).toBeGreaterThanOrEqual(0.17);
        expect((17 * m.columnas + 69) * m.moduloMm).toBeLessThanOrEqual(90);
        expect(s.filas.length * m.altoFilaMm).toBeLessThanOrEqual(40);
        expect(filaAHex('10110')).toBe('b0');
    });
});

describe('representación impresa', () => {
    const b = armarBorrador(entrada({ vencimiento: '2026-11-08' }));
    const t = timbrar({
        rutEmisor: RUT, tipo: 33, folio: 5, fechaEmision: b.fechaEmision, rutReceptor: b.receptor.rut, razonSocialReceptor: b.receptor.razonSocial,
        montoTotal: b.total, primerItem: b.lineas[0].nombre, cafXml: caf33.cafXml, timestamp: '2026-10-09T12:00:00',
    }, caf33.llavePrivadaPem);
    const rep = representacionSii({ borrador: b, folio: 5, timbre: t.texto, unidadSii: 'Santiago Centro', resolucion: { numero: 80, fecha: '2014-08-22' }, certificacion: false });

    it('recuadro, totalizadores, timbre con su resolución y copia cedible', () => {
        expect(rep.recuadro).toEqual({ lineas: ['R.U.T.: 76.123.456-0', 'FACTURA ELECTRÓNICA', 'N° 5'], pie: 'S.I.I. - SANTIAGO CENTRO' });
        expect(rep.filas).toEqual(expect.arrayContaining([{ k: 'Forma de pago', v: 'Crédito' }, { k: 'Vencimiento', v: '08/11/2026' }]));
        // Manual de muestras impresas 1.1.7 y 1.4: giro y casa matriz bajo la razón
        // social; los totalizadores del SII en la zona de totales, con la tasa.
        expect(rep.emisor).toEqual(['Giro: Consultoría', 'Casa matriz: Av. Providencia 1234, Providencia']);
        expect(rep.receptor).toEqual(['Giro: Comercio', 'Dirección: San Diego 2222', 'Comuna: La Florida']);
        expect(rep.totales).toEqual([{ k: 'Monto neto', v: '$ 100.000' }, { k: 'IVA (19%)', v: '$ 19.000' }]);
        expect(rep).toMatchObject({ totalEtiqueta: 'Monto total', descuentoPorLinea: true });
        expect(rep.timbre?.leyendas).toEqual(['Timbre Electrónico SII', 'Res. 80 de 2014 - Verifique documento: www.sii.cl']);
        expect(rep.cedible?.acuseCampos).toEqual(['Nombre', 'RUT', 'Fecha', 'Recinto', 'Firma']);
        expect(rep.cedible?.acuseTexto).toMatch(/Ley 19\.983/);
        expect(rep.prueba).toBeUndefined();
        expect(representacionDe({ latam: { representacion: rep } })?.timbre?.filas).toEqual(rep.timbre?.filas);
    });

    it('el PDF dibuja el recuadro, el timbre y, en la copia cedible, el acuse y "CEDIBLE"', () => {
        const base = {
            invoiceNumber: 'FE-5', countryCode: 'CL', currency: 'CLP', issuedAt: new Date('2026-10-09T15:00:00Z'),
            issuer: { legalName: 'Empresa de Prueba SpA', taxId: RUT, address: { countryCode: 'CL' } },
            recipient: { legalName: 'Cliente Ltda.', taxId: '77777777-7', address: { countryCode: 'CL' } },
            lines: [linea({ unitPrice: 100_000, subtotal: 100_000, taxAmount: 19_000, total: 119_000 })],
            subtotal: 100_000, taxTotal: 19_000, total: 119_000, autoridad: rep,
        } as any;
        const texto = (pdf: Buffer) => [...pdf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
            .map((x) => { try { return inflateSync(Buffer.from(x[1], 'latin1')).toString('latin1'); } catch { return ''; } }).join('\n');
        const normal = texto(createInvoicePdf(base));
        expect(normal).toContain('S.I.I. - SANTIAGO CENTRO');
        expect(normal).toContain('Timbre Electr');
        expect(normal).not.toContain('CEDIBLE');
        const cedible = texto(createInvoicePdf({ ...base, copiaCedible: true }));
        expect(cedible).toContain('CEDIBLE');
        expect(cedible).toContain('ACUSE DE RECIBO');
    });

    it('la nota de crédito no tiene copia cedible e imprime su referencia', () => {
        const nc = armarBorrador(entrada({ notaCreditoDe: { tipo: 33, folio: 5, fechaEmision: '2026-10-09', total: 119_000, receptor: b.receptor }, receptor: {} }));
        const r = representacionSii({ borrador: nc, folio: 1, timbre: t.texto, unidadSii: 'X', resolucion: { numero: 0, fecha: '2026-10-01' }, certificacion: true });
        expect(r.cedible).toBeUndefined();
        expect(r.filas.find((f) => f.k === 'Referencia')?.v).toBe('FACTURA ELECTRÓNICA N° 5 del 09/10/2026');
        expect(r.prueba).toBe(true);
        expect(r.leyendas[0]).toMatch(/certificación/);
    });
});

describe('estados del SII', () => {
    it('se traducen a fases y a mensajes sin vocabulario interno', () => {
        expect(faseEnvio('EPR')).toBe('procesado');
        expect(faseEnvio('RFR')).toBe('rechazado');
        expect(faseDte('DNK')).toBe('datos_distintos');
        for (const m of [mensajeEnvioRechazado('RSC'), mensajeEnvioRechazado('RCT'), mensajeUpload(1), mensajeUpload(6)]) {
            expect(m).not.toMatch(/RSC|RCT|STATUS|Upload|schema/i);
        }
    });
});

describe('riel y tipo de documento', () => {
    const previo = { ...process.env };
    afterEach(() => { process.env.SII_ENABLED = previo.SII_ENABLED; process.env.SII_ENTORNO = previo.SII_ENTORNO; });

    it('nace apagado y en certificación; un entorno desconocido lo apaga', () => {
        delete process.env.SII_ENABLED;
        delete process.env.SII_ENTORNO;
        expect(railConfig('sii')).toMatchObject({ habilitado: false, entorno: 'homologacion' });
        process.env.SII_ENABLED = 'true';
        expect(railConfig('sii')).toMatchObject({ habilitado: true, entorno: 'homologacion' });
        process.env.SII_ENTORNO = 'produccion';
        expect(railConfig('sii')).toMatchObject({ habilitado: true, entorno: 'produccion' });
        process.env.SII_ENTORNO = 'palena';
        expect(railConfig('sii')).toMatchObject({ habilitado: false, motivo: 'entorno_invalido' });
    });

    it('Chile emite sii_invoice solo con el riel listo y la nota de crédito no se anula', () => {
        expect(railDePais('cl')?.id).toBe('sii');
        expect(railDeDocumento('sii_credit_note')).toMatchObject({ id: 'sii', anulable: false });
        expect(isFiscalDocument('sii_invoice', 'CL')).toBe(true);
        expect(documentPrefix('sii_credit_note', 'FE')).toBe('NC-FE');
        expect(selectDocumentType('CL', 'starter', undefined, true)).toBe('sii_invoice');
        expect(selectDocumentType('CL', 'starter', undefined, false)).toBe('commercial_invoice');
        expect(selectDocumentType('CL', 'starter', 'commercial', true)).toBe('proforma');
    });
});
