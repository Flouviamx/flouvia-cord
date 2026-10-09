// Código de Autorización de Folios (CAF): el archivo XML que el negocio
// descarga del SII por cada rango de folios y tipo de documento.
//
// Estructura (instructivo técnico, Anexo 1, A.1.2):
//   <AUTORIZACION>
//     <CAF version="1.0"><DA>RE RS TD RNG(D,H) FA RSAPK(M,E) IDK</DA><FRMA algoritmo="SHA1withRSA"/></CAF>
//     <RSASK>llave privada PEM</RSASK>
//     <RSAPUBK>llave pública PEM</RSAPUBK>
//   </AUTORIZACION>
//
// Lo que Cord comprueba antes de aceptar un CAF (instructivo, 1.4):
//   - que el par de llaves funciona (firma con RSASK y verifica con RSAPK);
//   - que RSAPK del CAF y RSAPUBK son la misma llave;
//   - que el CAF es del RUT del negocio y de un tipo que Cord emite.
// La firma del SII sobre <DA> (<FRMA>) no se verifica: el SII no publica en
// su documentación técnica la llave que corresponde a cada <IDK>.
//
// Puro (node:crypto): lo cargan los scripts de contrato con Node plano.

import { createPublicKey, createPrivateKey, createSign, createVerify, createHash, type KeyObject } from 'node:crypto';
import { RailDatosError } from '../errores.ts';
import { esTipoDte, TIPOS_CON_VIGENCIA, VIGENCIA_CAF_MESES, type TipoDte } from './constantes.ts';
import { fechaIso, rutValido, sumarMeses } from './texto.ts';
import { aplanar, buscar, parsearFragmento, serializar, textoDe, type Nodo } from './xml.ts';

export interface CafParseado {
    rutEmisor: string;
    razonSocial: string;
    tipo: TipoDte;
    desde: number;
    hasta: number;
    /** Fecha de autorización (aaaa-mm-dd). */
    fechaAutorizacion: string;
    idk: number;
    /** Elemento <CAF> aplanado, con sus textos tal como los entregó el SII: va dentro de cada timbre. */
    cafXml: string;
    llavePrivadaPem: string;
    /** SHA-256 del elemento <CAF>: identifica el archivo sin exponerlo. */
    huella: string;
}

/** Tamaño de un CAF real: unos pocos KB. */
export const TAMANO_MAXIMO_CAF = 20_000;

const MSG_ILEGIBLE = 'No se pudo leer el archivo de folios. Sube el archivo XML que descargaste del SII (Timbraje electrónico › Solicitar timbraje), sin modificarlo.';

/** El archivo del SII se publica en ISO-8859-1; si los bytes son UTF-8 válidos, se leen como UTF-8. */
export function decodificarArchivo(bytes: Uint8Array | string): string {
    if (typeof bytes === 'string') return bytes;
    const buf = Buffer.from(bytes);
    const utf8 = buf.toString('utf8');
    const declarado = /encoding\s*=\s*["']([^"']+)["']/i.exec(buf.subarray(0, 200).toString('latin1'))?.[1]?.toLowerCase();
    if (declarado && /8859-1|latin-?1|windows-1252/.test(declarado)) return buf.toString('latin1');
    return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

function llaveRsa(pem: string, tipo: 'privada' | 'publica'): KeyObject {
    try {
        const k = tipo === 'privada' ? createPrivateKey(pem) : createPublicKey(pem);
        if (k.asymmetricKeyType !== 'rsa') throw new Error('no es RSA');
        return k;
    } catch {
        throw new RailDatosError(MSG_ILEGIBLE);
    }
}

const b64aBig = (b64: string) => BigInt(`0x${Buffer.from(b64.replace(/\s+/g, ''), 'base64').toString('hex') || '0'}`);
const jwkABig = (v: string | undefined) => BigInt(`0x${Buffer.from(String(v ?? ''), 'base64url').toString('hex') || '0'}`);

/**
 * Lee y valida un CAF. `rutNegocio` (normalizado) debe coincidir con el
 * emisor autorizado. Lanza RailDatosError con un mensaje para el dueño del
 * negocio.
 */
export function parsearCaf(entrada: Uint8Array | string, rutNegocio: string | null): CafParseado {
    if (entrada.length > TAMANO_MAXIMO_CAF) throw new RailDatosError('El archivo es demasiado grande para ser un archivo de folios del SII.');
    let raiz: Nodo;
    try {
        raiz = parsearFragmento(decodificarArchivo(entrada));
    } catch {
        throw new RailDatosError(MSG_ILEGIBLE);
    }
    if (raiz.n !== 'AUTORIZACION') throw new RailDatosError(MSG_ILEGIBLE);
    const caf = buscar(raiz, 'CAF');
    const da = caf && buscar(caf, 'DA');
    if (!caf || !da) throw new RailDatosError(MSG_ILEGIBLE);

    const rut = rutValido(textoDe(buscar(da, 'RE')));
    const tipo = Number(textoDe(buscar(da, 'TD')).trim());
    const desde = Number(textoDe(buscar(da, 'D')).trim());
    const hasta = Number(textoDe(buscar(da, 'H')).trim());
    const fecha = fechaIso(textoDe(buscar(da, 'FA')).trim());
    const idk = Number(textoDe(buscar(da, 'IDK')).trim());
    const m = textoDe(buscar(da, 'M'));
    const e = textoDe(buscar(da, 'E'));
    const frma = buscar(caf, 'FRMA');
    if (!rut || !Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde || !fecha || !m || !e || !frma || !Number.isFinite(idk)) {
        throw new RailDatosError(MSG_ILEGIBLE);
    }
    if (!esTipoDte(tipo)) {
        throw new RailDatosError(`Este archivo autoriza folios del documento tipo ${tipo}. Cord emite facturas (33), facturas exentas (34), notas de débito (56) y notas de crédito (61).`);
    }
    if (rutNegocio && rut !== rutNegocio) {
        throw new RailDatosError(`Estos folios están autorizados al RUT ${rut}, no al de tu negocio (${rutNegocio}).`);
    }

    const privadaPem = textoDe(buscar(raiz, 'RSASK')).trim();
    const publicaPem = textoDe(buscar(raiz, 'RSAPUBK')).trim();
    if (!privadaPem || !publicaPem) throw new RailDatosError('El archivo de folios no trae la llave para timbrar. Descárgalo de nuevo desde el SII.');
    const privada = llaveRsa(privadaPem, 'privada');
    const publica = llaveRsa(publicaPem, 'publica');

    // La llave pública del CAF (RSAPK) es la que el SII usará para verificar
    // el timbre: debe ser la pareja de la privada entregada.
    const jwk = createPublicKey(privada.export({ format: 'pem', type: 'pkcs8' })).export({ format: 'jwk' }) as { n?: string; e?: string };
    const jwkPub = publica.export({ format: 'jwk' }) as { n?: string; e?: string };
    if (b64aBig(m) !== jwkABig(jwk.n) || b64aBig(e) !== jwkABig(jwk.e) || jwkABig(jwkPub.n) !== jwkABig(jwk.n)) {
        throw new RailDatosError('La llave del archivo de folios no corresponde a su autorización. Descárgalo de nuevo desde el SII.');
    }
    // Instructivo 1.4: "generar una firma con la llave privada y verificar la firma con la llave pública".
    const prueba = Buffer.from(`cord-caf-${desde}-${hasta}`);
    const firma = createSign('RSA-SHA1').update(prueba).sign(privada);
    if (!createVerify('RSA-SHA1').update(prueba).verify(publica, firma)) {
        throw new RailDatosError('La llave del archivo de folios no funciona. Descárgalo de nuevo desde el SII.');
    }

    const cafXml = serializar(aplanar(caf));
    return {
        rutEmisor: rut,
        razonSocial: textoDe(buscar(da, 'RS')).trim(),
        tipo,
        desde,
        hasta,
        fechaAutorizacion: fecha,
        idk,
        cafXml,
        llavePrivadaPem: privadaPem,
        huella: createHash('sha256').update(cafXml, 'latin1').digest('hex'),
    };
}

/**
 * Último día en que los folios del CAF se pueden usar (Res. Ex. SII 58/2017):
 * seis meses desde su autorización para los documentos con derecho a crédito
 * fiscal. Null = sin vencimiento (factura exenta).
 */
export function venceCaf(tipo: TipoDte, fechaAutorizacion: string): string | null {
    if (!TIPOS_CON_VIGENCIA.includes(tipo)) return null;
    // "seis meses contados desde la fecha de su autorización": el último día
    // útil es el anterior al mismo día del sexto mes.
    const limite = sumarMeses(fechaAutorizacion, VIGENCIA_CAF_MESES);
    const d = new Date(`${limite}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}

export function cafVigente(tipo: TipoDte, fechaAutorizacion: string, fechaEmision: string): boolean {
    const vence = venceCaf(tipo, fechaAutorizacion);
    return !vence || fechaEmision <= vence;
}
