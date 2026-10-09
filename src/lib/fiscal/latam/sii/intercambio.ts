// XML que el emisor entrega a su cliente: el mismo DTE firmado que aceptó el
// SII, dentro de un sobre EnvioDTE dirigido al RUT del cliente (Caratula
// RutReceptor = receptor), que es el formato del intercambio entre
// contribuyentes. El DTE viaja byte a byte como se firmó; solo el sobre es
// nuevo y lo firma el certificado vigente del negocio.
//
// Si el certificado ya no está disponible (venció o se quitó), se entrega el
// DTE firmado tal cual: es el documento legal y su firma se sigue pudiendo
// verificar. Nunca se reconstruye ni se vuelve a timbrar un DTE.

import { credencialActiva } from '../credenciales';
import { intentoAutorizado, intentoPorId, type IntentoRail } from '../comprobantes';
import type { SolicitudSii } from './autorizacion';
import { armarEnvio, bytesEnvio } from './envio';
import { bytesLatin1 } from './texto';
import { parsearFragmento } from './xml';

async function intentoDelDocumento(orgId: string, doc: { id: string; provider_data?: any }): Promise<IntentoRail | null> {
    const id = doc.provider_data?.latam?.intento_id;
    if (typeof id === 'string' && id) {
        const intento = await intentoPorId(orgId, id);
        if (intento && intento.estado === 'autorizado' && intento.documentoId === doc.id) return intento;
    }
    return intentoAutorizado(orgId, doc.id, 'sii');
}

/** Archivo XML (ISO-8859-1) del DTE para el cliente; null si el documento no tiene DTE aceptado. */
export async function xmlIntercambio(orgId: string, doc: { id: string; provider_data?: any }, ahora = new Date()): Promise<Buffer | null> {
    const intento = await intentoDelDocumento(orgId, doc);
    const sol = intento?.solicitud as SolicitudSii | undefined;
    if (!intento || !sol?.dte) return null;
    const credencial = await credencialActiva(orgId, 'sii', intento.entorno);
    if (!credencial || credencial.vencida) return bytesLatin1(sol.dte);
    const envio = armarEnvio(
        [{ tipo: sol.tipo, nodo: parsearFragmento(sol.dte) }],
        { rutEmisor: sol.rutEmisor, rutEnvia: credencial.identificador, rutReceptor: sol.rutReceptor, resolucion: sol.resolucion },
        ahora,
        { certPem: credencial.certPem, keyPem: credencial.keyPem },
    );
    return bytesEnvio(envio);
}
