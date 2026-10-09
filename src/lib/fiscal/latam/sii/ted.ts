// Timbre Electrónico del DTE (TED): la firma, con la llave privada del CAF,
// de los datos representativos del documento. Va dentro del DTE y, impreso
// como código PDF417, en su representación impresa.
//
// Reglas del instructivo técnico (Anexo 2, A.2.3 y A.2.4):
//   - <DD>: RE, TD, F, FE, RR, RSR (≤ 40), MNT, IT1 (≤ 40), el <CAF> tal como
//     lo entregó el SII y TSTED, en ese orden;
//   - la firma (SHA1withRSA, PKCS#1 en base64) se calcula sobre <DD>
//     "aplanado": sin saltos de línea ni blancos entre etiquetas, sin
//     espacios de nombres y con las entidades XML predefinidas;
//   - los textos deben ser ISO-8859-1 y la firma se calcula sobre esos bytes.
// scripts/sii-check.mjs reproduce el timbre del ejemplo oficial F60T33 y
// verifica su firma con la llave pública de su CAF.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { createSign, createVerify, createPublicKey } from 'node:crypto';
import { LARGOS, type TipoDte } from './constantes.ts';
import { base64Lineas, bytesLatin1, campo } from './texto.ts';
import { aplanar, el, parsearFragmento, serializar, type Nodo } from './xml.ts';

export interface DatosTimbre {
    rutEmisor: string;
    tipo: TipoDte | number;
    folio: number;
    /** aaaa-mm-dd */
    fechaEmision: string;
    rutReceptor: string;
    razonSocialReceptor: string;
    montoTotal: number;
    primerItem: string;
    /** <CAF> aplanado, tal como lo entregó el SII (CafParseado.cafXml). */
    cafXml: string;
    /** AAAA-MM-DDTHH:MM:SS */
    timestamp: string;
}

export interface Timbre {
    /** Elemento <TED> para insertar en el DTE. */
    nodo: Nodo;
    /** <DD> aplanado: exactamente lo que se firmó. */
    dd: string;
    /** Firma en base64. */
    firma: string;
    /** <TED> completo y aplanado: el contenido del PDF417. */
    texto: string;
}

/** Elemento <DD> del timbre. */
export function nodoDD(d: DatosTimbre): Nodo {
    return el('DD', null,
        el('RE', null, d.rutEmisor),
        el('TD', null, String(d.tipo)),
        el('F', null, String(d.folio)),
        el('FE', null, d.fechaEmision),
        el('RR', null, d.rutReceptor),
        el('RSR', null, campo(d.razonSocialReceptor, LARGOS.TimbreTexto)),
        el('MNT', null, String(Math.round(d.montoTotal))),
        el('IT1', null, campo(d.primerItem, LARGOS.TimbreTexto)),
        parsearFragmento(d.cafXml),
        el('TSTED', null, d.timestamp),
    );
}

/** <DD> aplanado: el texto sobre el que se calcula la firma del timbre. */
export function ddAplanado(dd: Nodo): string {
    return serializar(aplanar(dd));
}

export function firmarDD(ddTexto: string, llavePrivadaPem: string): string {
    return createSign('RSA-SHA1').update(bytesLatin1(ddTexto)).sign(llavePrivadaPem).toString('base64');
}

/** Verifica la firma del timbre con la llave pública del CAF (M y E en base64). */
export function verificarDD(ddTexto: string, firmaB64: string, modulo: string, exponente: string): boolean {
    const n = Buffer.from(modulo.replace(/\s+/g, ''), 'base64').toString('base64url');
    const e = Buffer.from(exponente.replace(/\s+/g, ''), 'base64').toString('base64url');
    const llave = createPublicKey({ key: { kty: 'RSA', n, e }, format: 'jwk' });
    return createVerify('RSA-SHA1').update(bytesLatin1(ddTexto)).verify(llave, Buffer.from(firmaB64.replace(/\s+/g, ''), 'base64'));
}

export function timbrar(d: DatosTimbre, llavePrivadaPem: string): Timbre {
    const dd = nodoDD(d);
    const ddTexto = ddAplanado(dd);
    const firma = firmarDD(ddTexto, llavePrivadaPem);
    const nodo = el('TED', [['version', '1.0']], dd, el('FRMT', [['algoritmo', 'SHA1withRSA']], base64Lineas(firma)));
    return { nodo, dd: ddTexto, firma, texto: serializar(aplanar(nodo)) };
}
