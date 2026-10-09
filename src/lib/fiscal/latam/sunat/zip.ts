// Empaquetado del envío y lectura de la constancia [MAN §1.2-1.3]: un ZIP
// con un único XML de nombre RUC-TT-SERIE-NUMERO.xml, y la CDR que vuelve
// en otro ZIP como R-<nombre enviado>.xml [MAN §2.6].
//
// Puro (fflate): lo cargan los scripts de contrato con Node plano.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/** ZIP con el XML firmado. Fecha fija: el mismo comprobante produce siempre los mismos bytes. */
export function zipComprobante(nombre: string, xml: string): Uint8Array {
    return zipSync({ [`${nombre}.xml`]: [strToU8(xml), { level: 6, mtime: new Date('2020-01-01T00:00:00Z') }] });
}

/** Los XML de un ZIP (la CDR viene sola, a veces junto a una carpeta vacía). */
export function xmlsDelZip(bytes: Uint8Array): { nombre: string; xml: string }[] {
    let archivos: Record<string, Uint8Array>;
    try {
        archivos = unzipSync(bytes);
    } catch {
        throw new Error('sunat: el ZIP de la respuesta no se puede abrir');
    }
    return Object.entries(archivos)
        .filter(([nombre, datos]) => /\.xml$/i.test(nombre) && datos.length > 0)
        .map(([nombre, datos]) => ({ nombre: nombre.split('/').pop() || nombre, xml: strFromU8(datos) }));
}
