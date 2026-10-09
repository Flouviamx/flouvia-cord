// El ejemplar electrónico de la factura (el XML firmado que SUNAT aceptó).
// Para un cliente que no es emisor electrónico, SUNAT pide entregarle "un
// ejemplar electrónico" de la factura, y el emisor debe tenerlo a su
// disposición (orientacion.sunat.gob.pe, "Operatividad"): la representación
// impresa sola no es el comprobante. Se sirve exactamente lo que se envió,
// guardado en `fiscal_rail_comprobantes.solicitud` antes de enviarlo.

import { intentoAutorizado } from '../comprobantes';
import type { SolicitudEnviada } from './autorizacion';

export async function xmlAceptadoSunat(orgId: string, documentoId: string): Promise<{ archivo: string; xml: string } | null> {
    const intento = await intentoAutorizado(orgId, documentoId, 'sunat');
    const envio = (intento?.solicitud as SolicitudEnviada | undefined)?.envio;
    return envio?.xml && envio.archivo ? { archivo: envio.archivo, xml: envio.xml } : null;
}
