// Traducción de los códigos de SUNAT a mensajes para el dueño del negocio
// (regla 14). El texto crudo de SUNAT ("… - Detalle: xxx.xxx.xxx value='ticket: …
// error: INFO : 3280 (nodo: …)'") se guarda en la respuesta para soporte y
// nunca se muestra; el código sí acompaña al mensaje: es lo que el contador
// busca en la lista de códigos de SUNAT.
//
// Solo se traducen los códigos cuya respuesta real se capturó del servicio
// beta (scripts/fixtures/sunat/beta/); el resto se explica por su rango
// [MAN §4.1]. No hay una lista de códigos inventada de memoria.
//
// Puro: lo cargan los scripts de contrato con Node plano.

import { claseCodigo } from './constantes.ts';

export interface CodigoSunat {
    code: number;
    msg?: string;
}

const RECHAZOS: Record<number, string> = {
    // Respuestas reales del servicio beta (scripts/fixtures/sunat/beta/).
    2335: 'SUNAT no reconoció la firma del comprobante (el documento cambió después de firmarse). Escríbenos a soporte@flouvia.com.',
    3280: 'SUNAT calculó un importe total distinto al del comprobante. Vuelve a guardar el documento y emítelo de nuevo.',
    3462: 'SUNAT exige una sola tasa de IGV vigente por factura. Revisa las tasas de los conceptos.',
    3267: 'El vencimiento del pago debe ser posterior a la fecha de emisión.',
};

const NUMERO_USADO = 'El número quedó registrado como rechazado en SUNAT: al corregir y volver a emitir, la factura tendrá un número nuevo.';

/** Mensaje de un rechazo (2000–3999): la numeración quedó usada [MAN §4.1]. */
export function mensajeRechazo(code: number): string {
    const propio = RECHAZOS[code];
    return propio
        ? `${propio} ${NUMERO_USADO}`
        : `SUNAT rechazó el comprobante (código ${code}). Revisa los datos de la factura y del cliente, o escríbenos a soporte@flouvia.com. ${NUMERO_USADO}`;
}

/** Mensaje de una excepción (0100–1999): el comprobante no quedó informado [MAN §4.1]. */
export function mensajeExcepcion(code: number | null): string {
    if (code !== null && code < 1000) {
        return `SUNAT no procesó la factura (código ${code}). Revisa el usuario SOL y su clave en Ajustes › Datos fiscales, o reintenta en unos minutos: no quedó registrada.`;
    }
    return `SUNAT no pudo leer la factura${code !== null ? ` (código ${code})` : ''}, así que no quedó registrada. Escríbenos a soporte@flouvia.com si el problema sigue.`;
}

/** Mensaje de una observación con la que SUNAT aceptó el comprobante (4000+). */
export function mensajeObservacion(code: number): string {
    return `SUNAT aceptó el comprobante con una observación (código ${code}).`;
}

/** Mensaje para un código cualquiera, según su rango. */
export function mensajeCodigo(code: number): string {
    switch (claseCodigo(code)) {
        case 'rechazo': return mensajeRechazo(code);
        case 'observacion': return mensajeObservacion(code);
        case 'aceptado': return 'SUNAT aceptó el comprobante.';
        default: return mensajeExcepcion(code);
    }
}
