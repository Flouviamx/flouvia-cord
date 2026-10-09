// Lectura de la Constancia de Recepción (CDR) [MAN §2.6 y anexo 1]: un
// ApplicationResponse de UBL firmado por SUNAT, dentro de un ZIP, con
//   - cbc:ID            número del proceso de recepción;
//   - cbc:Note          observaciones "<código> - <descripción>" (4000+);
//   - DocumentResponse/Response/ResponseCode  0 = aceptada; otro valor = el
//     código del error que generó el rechazo (2000–3999);
//   - DocumentResponse/DocumentReference/ID   serie-número procesado;
//   - RecipientParty/PartyIdentification/ID   "<tipo doc>-<número>" del adquirente.
// Las CDR vigentes traen además el valor resumen del comprobante recibido
// (cbc:DocumentHash); si viene, es la forma más directa de reconocer que lo
// registrado es exactamente lo que Cord envió.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { parseStringPromise, processors } from 'xml2js';
import { xmlsDelZip } from './zip.ts';

export interface Cdr {
    /** 0 aceptado; otro valor, el código del rechazo. */
    codigo: number;
    descripcion: string;
    /** Observaciones con las que SUNAT aceptó (4000 en adelante). */
    observaciones: { code: number; msg: string }[];
    procesoId: string;
    /** Serie-número procesado. */
    referencia: string;
    /** "<tipo>-<número>" del adquirente. */
    receptor: string;
    /** Valor resumen del comprobante recibido, si la CDR lo informa. */
    resumen: string | null;
    fechaRecepcion: string;
    xml: string;
}

type Nodo = Record<string, unknown>;
const hijo = (n: unknown, k: string): unknown => (n && typeof n === 'object' ? (n as Nodo)[k] : undefined);
const lista = (n: unknown): unknown[] => (Array.isArray(n) ? n : n === undefined || n === null ? [] : [n]);
const txt = (n: unknown): string => (typeof n === 'string' ? n.trim() : n && typeof n === 'object' && typeof (n as Nodo)._ === 'string' ? String((n as Nodo)._).trim() : '');

/** Busca un descendiente por nombre (la estructura cambia entre versiones de la CDR). */
function buscar(n: unknown, k: string, prof = 0): unknown {
    if (!n || typeof n !== 'object' || prof > 8) return undefined;
    const directo = (n as Nodo)[k];
    if (directo !== undefined) return directo;
    for (const v of Object.values(n as Nodo)) {
        for (const item of lista(v)) {
            const r = buscar(item, k, prof + 1);
            if (r !== undefined) return r;
        }
    }
    return undefined;
}

export async function leerCdrXml(xml: string): Promise<Cdr> {
    let doc: Nodo;
    try {
        doc = await parseStringPromise(xml, { explicitArray: false, tagNameProcessors: [processors.stripPrefix] }) as Nodo;
    } catch {
        throw new Error('sunat: la constancia de recepción no es un XML legible');
    }
    const raiz = hijo(doc, 'ApplicationResponse');
    if (!raiz) throw new Error('sunat: la constancia de recepción no es un ApplicationResponse');
    const respuesta = hijo(hijo(raiz, 'DocumentResponse'), 'Response');
    const codigoTxt = txt(hijo(respuesta, 'ResponseCode'));
    if (!/^\d+$/.test(codigoTxt)) throw new Error('sunat: la constancia no trae un código de respuesta');
    const observaciones = lista(hijo(raiz, 'Note')).map((n) => {
        const t = txt(n);
        const m = /^(\d{4})\s*-\s*(.*)$/s.exec(t);
        return m ? { code: Number(m[1]), msg: m[2].trim().slice(0, 500) } : null;
    }).filter((o): o is { code: number; msg: string } => !!o);
    const docRes = hijo(raiz, 'DocumentResponse');
    return {
        codigo: Number(codigoTxt),
        descripcion: txt(hijo(respuesta, 'Description')).slice(0, 500),
        observaciones,
        procesoId: txt(hijo(raiz, 'ID')),
        referencia: txt(hijo(hijo(docRes, 'DocumentReference'), 'ID')) || txt(hijo(respuesta, 'ReferenceID')),
        receptor: txt(hijo(hijo(hijo(docRes, 'RecipientParty'), 'PartyIdentification'), 'ID')) || txt(hijo(hijo(docRes, 'RecipientParty'), 'ID')),
        resumen: txt(buscar(docRes, 'DocumentHash')) || null,
        fechaRecepcion: txt(hijo(raiz, 'IssueDate')),
        xml,
    };
}

/** La CDR del ZIP que devuelve SUNAT. */
export async function leerCdr(zip: Uint8Array): Promise<Cdr> {
    const xmls = xmlsDelZip(zip);
    const cdr = xmls.find((x) => /^R-/i.test(x.nombre)) ?? xmls[0];
    if (!cdr) throw new Error('sunat: el ZIP de la respuesta no trae la constancia');
    return leerCdrXml(cdr.xml);
}
