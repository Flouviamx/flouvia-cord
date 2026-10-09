// Composición del documento que se envía: borrador + folio + CAF → timbre →
// DTE firmado → sobre de envío firmado. Todo determinista a partir de sus
// entradas y del instante; lo que sale se guarda tal cual en la solicitud del
// intento (lo que se envió es lo que se archiva y se reenvía si hace falta).
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { RailDatosError } from '../errores.ts';
import { cafVigente } from './caf.ts';
import type { TipoDte } from './constantes.ts';
import { idDocumento, nodosDocumento, type BorradorSii } from './dte.ts';
import { archivoDte, armarEnvio, firmarDte, type Caratula } from './envio.ts';
import type { ClaveFirma } from './firma.ts';
import { fechaHoraChile } from './texto.ts';
import { timbrar } from './ted.ts';

export interface FolioAsignado {
    folio: number;
    /** <CAF> aplanado del rango al que pertenece el folio. */
    cafXml: string;
    llavePrivadaPem: string;
    tipo: TipoDte;
    desde: number;
    hasta: number;
    fechaAutorizacion: string;
}

export interface DocumentoFirmado {
    id: string;
    tipo: TipoDte;
    folio: number;
    /** <TED> aplanado: contenido del PDF417. */
    timbre: string;
    /** El DTE firmado como archivo propio (ISO-8859-1). */
    dteXml: string;
    /** El sobre al SII con este único DTE (ISO-8859-1). */
    envioXml: string;
    tsted: string;
}

export function emitirDocumento(b: BorradorSii, f: FolioAsignado, clave: ClaveFirma, caratula: Caratula, ahora: Date): DocumentoFirmado {
    if (f.tipo !== b.tipo) throw new Error('sii: el folio no es del tipo del documento');
    if (f.folio < f.desde || f.folio > f.hasta) throw new Error('sii: folio fuera del rango del CAF');
    if (!cafVigente(b.tipo, f.fechaAutorizacion, b.fechaEmision)) {
        throw new RailDatosError('Los folios de este tipo de documento vencieron (seis meses desde su autorización). Descarga folios nuevos del SII y súbelos en Ajustes › Datos fiscales.');
    }
    const tsted = fechaHoraChile(ahora);
    const timbre = timbrar({
        rutEmisor: b.emisor.rut,
        tipo: b.tipo,
        folio: f.folio,
        fechaEmision: b.fechaEmision,
        rutReceptor: b.receptor.rut,
        razonSocialReceptor: b.receptor.razonSocial,
        montoTotal: b.total,
        primerItem: b.lineas[0].nombre,
        cafXml: f.cafXml,
        timestamp: tsted,
    }, f.llavePrivadaPem);
    const id = idDocumento(b.tipo, f.folio);
    const dte = firmarDte(id, nodosDocumento(b, f.folio), timbre.nodo, ahora, clave);
    return {
        id,
        tipo: b.tipo,
        folio: f.folio,
        timbre: timbre.texto,
        dteXml: archivoDte(dte),
        envioXml: armarEnvio([{ tipo: b.tipo, nodo: dte }], caratula, ahora, clave),
        tsted,
    };
}
