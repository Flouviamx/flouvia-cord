// Errores comunes de los rieles fiscales de LatAm.
//
// La regla 14 manda en todos: el `message` de estos errores es apto para el
// dueño del negocio (no nombra variables de entorno, web services ni
// proveedores internos); el detalle operativo, si lo hay, va en `detalle` y
// solo llega al log.
//
// Puro: lo cargan los scripts de contrato con Node plano.

/**
 * Un dato del documento, del cliente o de la configuración impide armar el
 * comprobante. Se detecta ANTES de hablar con la autoridad: no hay nada que
 * reintentar hasta corregirlo.
 */
export class RailDatosError extends Error {
    readonly codigo?: string;
    constructor(message: string, codigo?: string) {
        super(message);
        this.name = 'RailDatosError';
        this.codigo = codigo;
    }
}

/** El riel no está activo para esta cuenta o este despliegue (interruptor, credencial, ajustes). */
export class RailNoDisponibleError extends Error {
    readonly detalle?: string;
    constructor(message: string, detalle?: string) {
        super(message);
        this.name = 'RailNoDisponibleError';
        this.detalle = detalle;
    }
}

/**
 * La autoridad no respondió o respondió algo ilegible, ANTES de que exista un
 * comprobante pendiente (autenticación, consulta de numeración). Reintentable
 * sin riesgo: no se pidió ninguna autorización.
 */
export class RailTransitorioError extends Error {
    readonly detalle?: string;
    constructor(message: string, detalle?: string) {
        super(message);
        this.name = 'RailTransitorioError';
        this.detalle = detalle;
    }
}

/** Errores cuyo `message` se puede mostrar tal cual al dueño del negocio. */
export function esErrorSeguro(error: unknown): error is RailDatosError | RailNoDisponibleError | RailTransitorioError {
    return error instanceof RailDatosError || error instanceof RailNoDisponibleError || error instanceof RailTransitorioError;
}

export const MSG_INCIERTO = 'No pudimos confirmar la autorización con la autoridad fiscal. Reintenta en unos minutos: no se duplicará.';
export const MSG_OCUPADO = 'Otra factura de tu negocio se está autorizando en este momento. Reintenta en unos segundos.';
