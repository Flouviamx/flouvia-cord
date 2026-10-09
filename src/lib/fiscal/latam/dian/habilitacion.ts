// Set de pruebas de habilitación ante la DIAN.
//
// Con software propio, cada facturador habilita SU software: lo registra en
// el portal de habilitación de la DIAN (recibe el SoftwareID y fija el PIN),
// la DIAN le asigna un set de pruebas (TestSetId) con un rango de numeración
// de prueba y su clave técnica, y el software tiene que enviar con
// SendTestSetAsync la cantidad de documentos que indica el detalle del set
// ("cantidad total de documentos requeridos y requeridos aceptados", guía
// "Registro y modo de operación", DIAN 09/2022). Superado el set, el
// facturador sincroniza a producción desde el portal.
//
// Aquí se arman esos documentos con los datos REALES del emisor (son
// documentos de prueba del ambiente de habilitación, sin validez fiscal) y un
// adquiriente consumidor final, se firman con el certificado del negocio y se
// envían uno por uno; GetStatusZip dice después si la DIAN los aceptó. Lo usa
// Ajustes › Datos fiscales y, sin base de datos, scripts/dian-prueba.mjs.
//
// Nunca toca producción: SendTestSetAsync solo existe en habilitación y este
// módulo se niega a correr con otro entorno.

import { RailDatosError } from '../errores.ts';
import type { FiscalLineItem } from '../../index.ts';
import { armarBase, conNumero, resolverAdquiriente, type ClavesDian, type EmisorDian, type ResolucionDian, type SolicitudDian } from './comprobante.ts';
import { firmarDocumento, type Firmante } from './firma.ts';
import {
    cuerpoGetStatusZip, cuerpoSendTestSetAsync, llamarDian, parsearGetStatusZip, parsearSendTestSetAsync, sobreDian, zipDocumento,
    type OpcionesLlamada, type RespuestaDian,
} from './soap.ts';
import { documentoXml, nombresArchivo } from './ubl.ts';

export interface CantidadesSet {
    facturas: number;
    notasCredito: number;
    notasDebito: number;
}

export const MAX_DOCUMENTOS_SET = 30;

export function cantidadesValidas(c: Partial<CantidadesSet>): CantidadesSet {
    const n = (v: unknown, max: number) => {
        const x = Number(v);
        if (!Number.isInteger(x) || x < 0 || x > max) throw new RailDatosError('Indica cuántos documentos pide tu set de pruebas (números enteros).');
        return x;
    };
    const r = { facturas: n(c.facturas, MAX_DOCUMENTOS_SET), notasCredito: n(c.notasCredito, 10), notasDebito: n(c.notasDebito, 10) };
    if (r.facturas < 1) throw new RailDatosError('El set de pruebas necesita al menos una factura.');
    if (r.facturas + r.notasCredito + r.notasDebito > MAX_DOCUMENTOS_SET) throw new RailDatosError(`Envía como máximo ${MAX_DOCUMENTOS_SET} documentos a la vez.`);
    return r;
}

export interface ParametrosSet {
    emisor: EmisorDian;
    /** El rango de pruebas que muestra el portal de habilitación (prefijo, desde, hasta, vigencia). */
    resolucion: ResolucionDian;
    prefijoNotas: string;
    softwareId: string;
    claves: ClavesDian & { claveTecnica: string };
    cantidades: CantidadesSet;
    /** Primer consecutivo libre del rango de pruebas y de las notas. */
    numeroFactura: number;
    numeroNota: number;
    ahora?: Date;
}

/** Una línea de prueba con IVA del 19 %, en centavos exactos. */
function linea(descripcion: string, precio: number): FiscalLineItem {
    const iva = Math.round(precio * 0.19 * 100) / 100;
    return { description: descripcion, quantity: 1, unitPrice: precio, taxRate: 0.19, subtotal: precio, taxAmount: iva, total: precio + iva };
}

const totales = (l: FiscalLineItem) => ({ subtotal: l.subtotal, taxes: l.taxAmount, total: l.total, currency: 'COP' });

/**
 * Los documentos del set, numerados y con su CUFE/CUDE, en el orden en que se
 * envían: primero las facturas y después las notas, que ajustan facturas del
 * mismo set (una nota necesita el CUFE de una factura ya enviada).
 */
export function armarSetDePruebas(p: ParametrosSet): SolicitudDian[] {
    const ahora = p.ahora ?? new Date();
    const adquiriente = resolverAdquiriente({ nombre: '', identificacion: null, pais: 'CO', correo: null, ficha: null });
    const comun = { entorno: 'homologacion' as const, emisor: p.emisor, adquiriente, tratamientoSinIva: null, softwareId: p.softwareId };
    const out: SolicitudDian[] = [];
    const facturas: SolicitudDian[] = [];
    for (let i = 0; i < p.cantidades.facturas; i++) {
        const l = linea(`Servicio de prueba de habilitación ${i + 1}`, 100_000 + i * 1_000);
        const base = armarBase({ ...comun, clase: 'factura', lineas: [l], totales: totales(l), resolucion: p.resolucion });
        const s = conNumero(base, p.numeroFactura + i, ahora, p.claves);
        facturas.push(s);
        out.push(s);
    }
    let nota = p.numeroNota;
    for (let i = 0; i < p.cantidades.notasCredito; i++) {
        const f = facturas[i % facturas.length];
        // Anulación (concepto 2) por el total de la factura que ajusta.
        const l = linea('Anulación de la factura de prueba', Number(f.totales.bruto));
        const base = armarBase({
            ...comun, clase: 'nota_credito', lineas: [l], totales: totales(l), prefijoNotas: p.prefijoNotas,
            referencia: { id: f.id, cufe: f.cufe, fecha: f.fecha, concepto: '2' },
        });
        out.push(conNumero(base, nota++, ahora, p.claves));
    }
    for (let i = 0; i < p.cantidades.notasDebito; i++) {
        const f = facturas[i % facturas.length];
        // Cambio del valor (concepto 3).
        const l = linea('Ajuste de valor de la factura de prueba', 10_000);
        const base = armarBase({
            ...comun, clase: 'nota_debito', lineas: [l], totales: totales(l), prefijoNotas: p.prefijoNotas,
            referencia: { id: f.id, cufe: f.cufe, fecha: f.fecha, concepto: '3' },
        });
        out.push(conNumero(base, nota++, ahora, p.claves));
    }
    return out;
}

export interface EnvioDePrueba {
    clase: SolicitudDian['clase'];
    id: string;
    cufe: string;
    /** TrackId del zip, para GetStatusZip. Vacío si la DIAN lo rechazó al recibirlo. */
    zipKey: string;
    /** Error de las validaciones iniciales (texto de la DIAN, para soporte). */
    error: string | null;
}

/** Firma y envía UN documento del set. Solo habilitación. */
export async function enviarDocumentoDePrueba(s: SolicitudDian, firmante: Firmante, testSetId: string, opts: OpcionesLlamada = {}): Promise<EnvioDePrueba> {
    if (s.entorno !== 'homologacion') throw new Error('dian: el set de pruebas solo se envía al ambiente de habilitación');
    if (!/^[0-9a-fA-F-]{36}$/.test(testSetId)) throw new RailDatosError('El identificador del set de pruebas (TestSetId) no es válido. Cópialo del detalle del set en el portal de habilitación de la DIAN.');
    const xml = firmarDocumento(documentoXml(s), firmante, s.firmadoAt);
    const nombres = nombresArchivo(s);
    const zip = Buffer.from(zipDocumento(nombres.xml, xml)).toString('base64');
    const r = await parsearSendTestSetAsync(await llamarDian('homologacion', 'SendTestSetAsync',
        sobreDian('homologacion', 'SendTestSetAsync', cuerpoSendTestSetAsync(nombres.zip, zip, testSetId),
            { certPem: firmante.cadena[0], llavePem: firmante.llavePem }, { url: opts.url }), opts));
    const error = r.errores.find((e) => !e.exito && e.mensaje)?.mensaje ?? null;
    return { clase: s.clase, id: s.id, cufe: s.cufe, zipKey: r.zipKey, error };
}

/** Resultado de la validación de un envío del set (GetStatusZip). */
export async function estadoDeEnvio(zipKey: string, firmante: Firmante, opts: OpcionesLlamada = {}): Promise<RespuestaDian[]> {
    return parsearGetStatusZip(await llamarDian('homologacion', 'GetStatusZip',
        sobreDian('homologacion', 'GetStatusZip', cuerpoGetStatusZip(zipKey), { certPem: firmante.cadena[0], llavePem: firmante.llavePem }, { url: opts.url }), opts));
}
