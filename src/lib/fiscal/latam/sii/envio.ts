// DTE firmado y sobre de envío (EnvioDTE) en el formato del SII.
//
//   <DTE version="1.0"><Documento ID="F{folio}T{tipo}">…<TED/><TmstFirma/></Documento><Signature/></DTE>
//   <EnvioDTE version="1.0"><SetDTE ID="SetDoc"><Caratula/><DTE/>…</SetDTE><Signature/></EnvioDTE>
//
// - El DTE se firma SUELTO y sin declaración de espacio de nombres: el
//   <Documento> se canonicaliza como si el <DTE> fuera un documento aparte.
//   Es la convención del propio SII: el DigestValue del ejemplo oficial
//   (F60T33, schema_dte de www.sii.cl) solo se reproduce así —no con el
//   Documento en el contexto del sobre, que le heredaría xmlns y xmlns:xsi—,
//   y los DTE que entrega el SII en sus descargas llevan <DTE version="1.0">
//   sin xmlns. Dentro del sobre el DTE hereda el espacio de nombres de
//   <EnvioDTE> y valida contra el esquema; scripts/sii-check.mjs reproduce el
//   digest del ejemplo oficial y verifica las firmas con la JDK.
// - El envío declara xmlns:xsi y el schemaLocation en su segunda línea y
//   codifica en ISO-8859-1 en la primera (A 3.1: "el SII valida que las 2
//   primeras líneas del envío contengan el set de caracteres y el
//   schemaLocation").
// - Saltos de línea al final de cada etiqueta (A 3.1).
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { NS_SII_DTE, NS_XSI, RUT_SII, SCHEMA_LOCATION_ENVIO, type TipoDte } from './constantes.ts';
import { firmar, type ClaveFirma } from './firma.ts';
import { bytesLatin1, fechaHoraChile } from './texto.ts';
import { c14n, el, formatear, serializar, type Nodo } from './xml.ts';

export const DECLARACION_XML = '<?xml version="1.0" encoding="ISO-8859-1"?>';

/** DTE firmado: el <Documento> (con timbre) más su firma. */
export function firmarDte(id: string, cuerpo: Nodo[], ted: Nodo, firmadoEn: Date, clave: ClaveFirma): Nodo {
    const documento = formatear(el('Documento', [['ID', id]], ...cuerpo, ted, el('TmstFirma', null, fechaHoraChile(firmadoEn))));
    // Sin espacios de nombres en ámbito (ver la cabecera de este archivo).
    const firma = firmar(c14n(documento, {}), `#${id}`, clave, {});
    return formatear(el('DTE', [['version', '1.0']], documento, firma));
}

/** El DTE como archivo propio (ISO-8859-1): lo que se guarda y se reutiliza en cada sobre. */
export function archivoDte(dte: Nodo): string {
    return `${DECLARACION_XML}\n${serializar(dte)}\n`;
}

export interface Caratula {
    rutEmisor: string;
    /** RUT del titular del certificado que firma el envío. */
    rutEnvia: string;
    /** SII (60803000-K) para el envío al SII; el RUT del cliente para el intercambio. */
    rutReceptor?: string;
    /** Resolución que autoriza al emisor: número (0 en certificación) y fecha. */
    resolucion: { numero: number; fecha: string };
}

/**
 * Sobre de envío firmado con los DTE ya firmados. Devuelve el texto del
 * archivo (ISO-8859-1 al codificarlo con `bytesEnvio`).
 */
export function armarEnvio(dtes: { tipo: TipoDte; nodo: Nodo }[], c: Caratula, firmadoEn: Date, clave: ClaveFirma): string {
    const subtotales = new Map<TipoDte, number>();
    for (const d of dtes) subtotales.set(d.tipo, (subtotales.get(d.tipo) ?? 0) + 1);
    const caratula = el('Caratula', [['version', '1.0']],
        el('RutEmisor', null, c.rutEmisor),
        el('RutEnvia', null, c.rutEnvia),
        el('RutReceptor', null, c.rutReceptor ?? RUT_SII),
        el('FchResol', null, c.resolucion.fecha),
        el('NroResol', null, String(c.resolucion.numero)),
        el('TmstFirmaEnv', null, fechaHoraChile(firmadoEn)),
        ...[...subtotales.entries()].sort((a, b) => a[0] - b[0])
            .map(([tipo, n]) => el('SubTotDTE', null, el('TpoDTE', null, String(tipo)), el('NroDTE', null, String(n)))),
    );
    const setDte = formatear(el('SetDTE', [['ID', 'SetDoc']], caratula, ...dtes.map((d) => d.nodo)));
    const ns = { '': NS_SII_DTE, xsi: NS_XSI };
    const firma = firmar(c14n(setDte, ns), '#SetDoc', clave, ns);
    const envio = formatear(el('EnvioDTE', [
        ['xmlns', NS_SII_DTE], ['xmlns:xsi', NS_XSI], ['xsi:schemaLocation', SCHEMA_LOCATION_ENVIO], ['version', '1.0'],
    ], setDte, firma));
    // Primera línea: la codificación; segunda: <EnvioDTE … schemaLocation …>.
    return `${DECLARACION_XML}\n${serializar(envio)}\n`;
}

export const bytesEnvio = (texto: string) => bytesLatin1(texto);

/**
 * Semilla firmada para GetTokenFromSeed (manual "Autenticación automática",
 * cap. 4.1.5 y 8): <getToken><item><Semilla/></item><Signature/></getToken>,
 * referencia URI="" con la transformación enveloped-signature.
 */
export function semillaFirmada(semilla: string, clave: ClaveFirma): string {
    const cuerpo = el('getToken', null, el('item', null, el('Semilla', null, semilla)));
    const firma = firmar(c14n(cuerpo), '', clave, {}, true);
    return `<?xml version="1.0"?>${serializar({ ...cuerpo, c: [...(cuerpo.c ?? []), firma] })}`;
}
