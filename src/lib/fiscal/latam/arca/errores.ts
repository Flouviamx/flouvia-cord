// Traducción de los códigos de ARCA a mensajes para el dueño del negocio
// (regla 14): el texto crudo de la autoridad ("ValidacionDeToken: No valido
// token. Excepcion: CargarStringBase64Token…") se guarda en la respuesta para
// soporte y nunca se muestra. El código numérico sí acompaña al mensaje: es
// lo que el contador del negocio busca en el manual de ARCA.
//
// Códigos y significados del "Manual para el desarrollador — RG 4291 v4.7"
// (validaciones de FECAESolicitar, FECompUltimoAutorizado y FECompConsultar,
// y "Tratamiento de errores en el WS") y de la "Especificación Técnica del
// WSAA" 1.2.2 (códigos de SoapFault del WSAA).
//
// Puro: lo cargan los scripts de contrato con Node plano.

export interface CodigoArca {
    code: number;
    msg?: string;
}

/** Errores de infraestructura de ARCA: reintentar más tarde no cambia el comprobante [MAN "Tratamiento de errores"]. */
export const CODIGOS_TRANSITORIOS = new Set([500, 501, 502]);
/** Token/sign no aceptado o CUIT no representada: renovar el ticket de acceso [MAN 600/601]. */
export const CODIGOS_AUTENTICACION = new Set([600, 601]);
/** El número enviado no es el próximo a autorizar: hubo otra emisión entretanto [MAN 10016]. */
export const CODIGO_NUMERACION = 10016;
/** "No existen datos en nuestros registros" [MAN 602]: una consulta sin resultados. */
export const CODIGO_SIN_DATOS = 602;

const MENSAJES: Record<number, string> = {
    10000: 'ARCA no autoriza a tu CUIT a emitir este comprobante (inscripción, actividad o domicilio fiscal). Revisa tu situación en ARCA.',
    10005: 'El punto de venta configurado no está habilitado para factura electrónica por web service en ARCA. Revísalo en Ajustes › Datos fiscales.',
    11002: 'El punto de venta configurado no está habilitado para factura electrónica por web service en ARCA. Revísalo en Ajustes › Datos fiscales.',
    10096: 'Como sujeto exento en IVA, ARCA exige un punto de venta del tipo "exento en IVA – web services". Revísalo en Ajustes › Datos fiscales.',
    10013: 'Una Factura A necesita la CUIT del cliente.',
    10015: 'ARCA no encontró el documento del cliente en sus padrones o falta identificarlo. Revisa su CUIT o DNI.',
    10016: 'La numeración de ARCA cambió mientras se emitía (¿se emitió otro comprobante desde otro sistema con el mismo punto de venta?). Reintenta.',
    10017: 'La CUIT del cliente no está activa en ARCA para recibir una Factura A.',
    10063: 'La CUIT del cliente no está activa en IVA ni en Monotributo para recibir una Factura A. Revisa su condición frente al IVA.',
    10069: 'El documento del cliente no puede ser la CUIT de tu negocio.',
    10119: 'El tipo de cambio está fuera del rango que ARCA admite para esa moneda.',
    10038: 'ARCA no aceptó la cotización de la moneda del comprobante.',
    10039: 'Un comprobante en pesos debe llevar cotización 1.',
    10240: 'ARCA no aceptó la cotización de la moneda del comprobante.',
    10188: 'Por el tamaño de tu negocio y el de tu cliente, ARCA pide una Factura de Crédito Electrónica MiPyME, que Cord todavía no emite.',
    10192: 'Por el tamaño de tu negocio, el de tu cliente y el monto, ARCA exige una Factura de Crédito Electrónica MiPyME, que Cord todavía no emite.',
    10195: 'La CUIT del cliente está inactiva en ARCA por facturación apócrifa.',
    10238: 'La CUIT del cliente no existe en ARCA. Corrígela en su ficha.',
    10242: 'La condición frente al IVA del cliente no es un valor que ARCA admita. Revísala en su ficha.',
    10243: 'La condición frente al IVA del cliente no corresponde a este tipo de comprobante. Revísala en su ficha.',
    10246: 'ARCA exige la condición frente al IVA del cliente. Indícala en su ficha.',
    10247: 'La CUIT del cliente está inactiva o es inválida en ARCA.',
    10248: 'La CUIT del cliente está limitada en ARCA por su situación en la seguridad social.',
    10249: 'El documento del cliente corresponde a una persona fallecida según ARCA.',
    10251: 'ARCA no permite este comprobante con las condiciones de tu CUIT.',
    10284: 'El número de documento del cliente no corresponde al tipo informado.',
    600: 'ARCA no aceptó la credencial de acceso de tu certificado. Si el problema sigue, vuelve a subir el certificado en Ajustes › Datos fiscales.',
    601: 'El certificado no está autorizado a facturar por la CUIT de tu negocio. Revisa en ARCA que el servicio de facturación electrónica esté asociado al certificado.',
    500: 'ARCA no está respondiendo correctamente en este momento. Reintenta en unos minutos.',
    501: 'ARCA no está respondiendo correctamente en este momento. Reintenta en unos minutos.',
    502: 'ARCA no está respondiendo correctamente en este momento. Reintenta en unos minutos.',
};

/** Observaciones con las que ARCA APRUEBA el comprobante y que el negocio debe conocer. */
const OBSERVACIONES: Record<number, string> = {
    10217: 'El cliente es monotributista: el crédito fiscal discriminado solo puede computarse a efectos del Procedimiento permanente de transición al Régimen General.',
    10234: 'ARCA indica que tu formulario de habilitación de comprobantes clase A está pendiente o es anterior a tu alta en IVA.',
    10235: 'ARCA advierte que el monto supera el límite de la categoría máxima de Monotributo.',
    10236: 'ARCA advierte que el monto supera el límite de tu categoría de Monotributo: tenlo en cuenta en la próxima recategorización.',
    10245: 'ARCA recuerda que la condición frente al IVA del cliente es obligatoria.',
};

/** Mensaje para el dueño del negocio de UN código de ARCA. */
export function mensajeCodigo(code: number): string {
    return MENSAJES[code] ?? `ARCA rechazó el comprobante (código ${code}). Revisa los datos de la factura y del cliente, o escríbenos a soporte@flouvia.com.`;
}

/** Mensaje de una observación con la que ARCA aprobó el comprobante. */
export function mensajeObservacion(code: number): string {
    return OBSERVACIONES[code] ?? `ARCA aprobó el comprobante con una observación (código ${code}).`;
}

/**
 * El mensaje más útil de una lista de errores/observaciones de un rechazo:
 * primero los que tienen texto propio, en el orden en que ARCA los devolvió.
 */
export function mensajeRechazo(codigos: CodigoArca[]): string {
    const conocido = codigos.find((c) => MENSAJES[c.code]);
    return mensajeCodigo((conocido ?? codigos[0])?.code ?? 0);
}

/** Códigos de SoapFault del WSAA [Especificación Técnica 1.2.2, tabla de errores] → mensaje. */
export function mensajeWsaa(faultcode: string): string {
    switch (faultcode) {
        case 'coe.notAuthorized':
            return 'ARCA no autoriza a este certificado para facturar. Asocia el servicio de factura electrónica al certificado en ARCA (Administrador de Relaciones) y vuelve a intentar.';
        case 'cms.cert.expired':
            return 'El certificado de ARCA venció. Genera uno nuevo y súbelo en Ajustes › Datos fiscales.';
        case 'cms.cert.untrusted':
            return 'ARCA no reconoce este certificado en el ambiente configurado: un certificado de homologación no sirve en producción, ni al revés.';
        case 'cms.cert.invalid':
            return 'El certificado de ARCA todavía no está vigente.';
        // No figura en la tabla de la especificación 1.2.2: es lo que el WSAA de
        // homologación respondió el 2026-10-08 a un certificado que no emitió su
        // autoridad certificante (scripts/fixtures/arca/respuesta-wsaa-cert-bloqueado.xml).
        case 'cms.cert.blacklist':
            return 'ARCA bloqueó este certificado o no lo emitió su autoridad certificante. Genera uno nuevo desde ARCA y súbelo en Ajustes › Datos fiscales.';
        case 'coe.alreadyAuthenticated':
            return 'ARCA todavía no permite renovar el acceso de este certificado. Reintenta en unos minutos.';
        case 'wsn.unavailable':
        case 'wsaa.unavailable':
        case 'wsaa.internalError':
            return 'ARCA no está respondiendo en este momento. Reintenta en unos minutos.';
        case 'xml.generationTime.invalid':
        case 'xml.expirationTime.expired':
        case 'xml.expirationTime.invalid':
            return 'ARCA rechazó la hora de la solicitud de acceso. Reintenta en unos minutos; si sigue, escríbenos a soporte@flouvia.com.';
        default:
            return 'ARCA rechazó la solicitud de acceso de tu certificado. Revisa que sea el certificado vigente de tu CUIT, o escríbenos a soporte@flouvia.com.';
    }
}

/** Fallas del WSAA que se resuelven solas con el tiempo (la especificación pide no reintentar antes de 60 s). */
export function wsaaTransitorio(faultcode: string): boolean {
    return faultcode === 'coe.alreadyAuthenticated' || faultcode.startsWith('wsaa.') || faultcode === 'wsn.unavailable';
}
