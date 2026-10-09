// Contenedor (AttachedDocument) de un documento validado por la DIAN: lo que
// el facturador le entrega al adquiriente [AT 6.4: "siempre que un documento
// es validado, deberá ser transmitido para el adquiriente el respectivo
// contenedor"]. Lleva el XML firmado TAL COMO se envió y el ApplicationResponse
// de la DIAN, y lo firma el emisor.
//
// Por correo va un único .zip con el contenedor y, opcionalmente, el PDF de la
// representación gráfica [AT 9.1]. Se arma al pedirlo: los dos XML que
// contiene están guardados (dian_documentos) y son inmutables.

import { strToU8, zipSync } from 'fflate';
import { intentoAutorizado } from '../comprobantes';
import { credencialActiva } from '../credenciales';
import { separarCadena } from './cadena';
import { momentoColombia, type SolicitudDian } from './comprobante';
import { documentoDeIntento } from './autorizacion';
import { firmarDocumento } from './firma';
import { contenedorXml } from './ubl';

export interface ContenedorDian {
    /** Nombre del archivo [AT 6.5.7: `ad` + NIT + 000 + año + consecutivo]. */
    nombre: string;
    xml: string;
}

/** El contenedor firmado de un documento validado, o null si no hay con qué armarlo. */
export async function contenedorDeDocumento(orgId: string, documentoId: string): Promise<ContenedorDian | null> {
    const intento = await intentoAutorizado(orgId, documentoId, 'dian');
    if (!intento) return null;
    const [guardado, credencial] = await Promise.all([
        documentoDeIntento(orgId, intento.id),
        credencialActiva(orgId, 'dian', intento.entorno),
    ]);
    if (!guardado?.respuestaXml || !credencial) return null;
    const cadena = separarCadena(credencial.certPem);
    if (!cadena.length) return null;
    const sol = intento.solicitud as SolicitudDian;
    const ahora = momentoColombia(new Date(Date.now() - 5_000));
    const validado = guardado.validado ?? { fecha: sol.fecha, hora: sol.hora };
    const xml = firmarDocumento(contenedorXml({
        solicitud: sol,
        xmlDocumento: guardado.xmlFirmado,
        xmlRespuesta: guardado.respuestaXml,
        validadoFecha: validado.fecha,
        validadoHora: validado.hora,
        fecha: ahora.fecha,
        hora: ahora.hora,
    }), { cadena, llavePem: credencial.keyPem }, ahora.iso, { cdata: true });
    return { nombre: `ad${guardado.nombreXml.slice(2)}`, xml };
}

/** El .zip del correo: contenedor + PDF de la representación gráfica [AT 9.1]. */
export async function adjuntoDian(orgId: string, documentoId: string, pdf: { filename: string; content: Uint8Array } | null): Promise<{ filename: string; content: Uint8Array } | null> {
    const c = await contenedorDeDocumento(orgId, documentoId);
    if (!c) return null;
    const archivos: Record<string, Uint8Array> = { [c.nombre]: strToU8(c.xml) };
    if (pdf) archivos[c.nombre.replace(/\.xml$/, '.pdf')] = pdf.content;
    return { filename: `z${c.nombre.slice(2).replace(/\.xml$/, '.zip')}`, content: zipSync(archivos, { level: 6 }) };
}
