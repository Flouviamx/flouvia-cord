// Traducción de los estados del SII a mensajes para el dueño del negocio
// (regla 14). El código del SII acompaña al mensaje cuando sirve para buscarlo
// en su sitio; la glosa cruda queda en la respuesta guardada, para soporte.
//
// Fuentes: manual de envío automático (OI2003_UPDTE_MDE 1.5, 2.1), consulta de
// estado de envío (OI2004_CEUPDTE_MDE 1.10, 3.3 y 3.5), consulta de estado de
// DTE (OI2004_CEDTE_MDE 1.10, 3.3 y 3.5) y autenticación automática
// (OI2007_AUTAUTOM_MDE 1.9, 5.2.2).
//
// Puro: lo cargan los scripts de contrato con Node plano.

/** STATUS de <RECEPCIONDTE> (manual de envío, 2.1). */
export const STATUS_UPLOAD: Record<number, string> = {
    0: 'Upload OK',
    1: 'El Sender no tiene permiso para enviar',
    2: 'Error en tamaño del archivo',
    3: 'Archivo cortado',
    5: 'No está autenticado',
    6: 'Empresa no autorizada a enviar archivos',
    7: 'Esquema inválido',
    8: 'Firma del documento',
    9: 'Sistema bloqueado',
};

/** Upload rechazado sin número de envío: el SII no recibió nada. */
export function mensajeUpload(status: number): string {
    switch (status) {
        case 1:
            return 'El SII no autoriza al titular del certificado a enviar documentos de tu empresa. Regístralo como usuario autorizado en el SII o sube el certificado de una persona autorizada.';
        case 6:
            return 'El SII no tiene a tu empresa autorizada como emisora de documentos electrónicos en este ambiente. Revisa tu postulación y certificación en el SII.';
        case 7:
            return 'El SII rechazó el documento por formato (esquema). Escríbenos a soporte@flouvia.com: no es un dato que puedas corregir tú.';
        case 8:
            return 'El SII rechazó la firma del documento. Revisa que el certificado sea el vigente del usuario autorizado, o escríbenos a soporte@flouvia.com.';
        case 2:
        case 3:
            return 'El SII no recibió el archivo completo. Reintenta en unos minutos.';
        case 9:
            return 'El sistema de recepción del SII está bloqueado en este momento. Reintenta en unos minutos.';
        default:
            return `El SII no recibió el documento (estado ${status}). Reintenta en unos minutos o escríbenos a soporte@flouvia.com.`;
    }
}

/** Upload que conviene reintentar con el MISMO archivo (el SII no lo recibió y el motivo es pasajero). */
export const STATUS_REINTENTABLES = new Set([2, 3, 9]);

/** Estados de QueryEstUp (consulta de estado de envío, 3.3). */
export type FaseEnvio = 'procesado' | 'rechazado' | 'en_proceso' | 'desconocido';

export function faseEnvio(estado: string): FaseEnvio {
    switch (estado) {
        case 'EPR':
            return 'procesado';
        // Rechazado por error en schema, firma o carátula.
        case 'RSC':
        case 'RFR':
        case 'RCT':
            return 'rechazado';
        // Schema validado, carátula OK, firma OK, en proceso.
        case 'SOK':
        case 'CRT':
        case 'FOK':
        case 'PDR':
        case 'PRD':
            return 'en_proceso';
        default:
            return 'desconocido';
    }
}

export function mensajeEnvioRechazado(estado: string): string {
    switch (estado) {
        case 'RSC':
            return 'El SII rechazó el documento por formato (esquema). Escríbenos a soporte@flouvia.com.';
        case 'RFR':
            return 'El SII rechazó la firma electrónica del documento. Revisa el certificado en Ajustes › Datos fiscales.';
        case 'RCT':
            return 'El SII rechazó la carátula del envío: revisa el número y la fecha de resolución en Ajustes › Datos fiscales.';
        default:
            return `El SII rechazó el documento (estado ${estado}).`;
    }
}

/** Estados de QueryEstDte (consulta de estado de DTE, 3.3). */
export type FaseDte = 'recibido' | 'no_recibido' | 'no_autorizado' | 'datos_distintos' | 'desconocido';

export function faseDte(estado: string): FaseDte {
    switch (estado) {
        // Recibido y los datos coinciden (con o sin notas que lo modifican).
        case 'DOK':
        case 'TMD':
        case 'TMC':
        case 'MMD':
        case 'MMC':
        case 'AND':
        case 'ANC':
            return 'recibido';
        case 'DNK':
            return 'datos_distintos';
        case 'FAU':
            return 'no_recibido';
        case 'FNA':
        case 'FAN':
        case 'EMP':
            return 'no_autorizado';
        default:
            return 'desconocido';
    }
}

export function mensajeDteNoAutorizado(estado: string): string {
    switch (estado) {
        case 'FNA':
            return 'El SII informa este documento como no autorizado (folio fuera de rango, vencido o anulado).';
        case 'FAN':
            return 'El SII informa este folio como anulado.';
        case 'EMP':
            return 'El SII no tiene a tu empresa autorizada para emitir documentos electrónicos en este ambiente.';
        default:
            return `El SII no registró el documento (estado ${estado}).`;
    }
}

/**
 * Estados de GetTokenFromSeed (autenticación automática, 5.2.2). Observado en
 * maullin el 2026-10-09 (fixtures respuesta-token-*): con la firma válida y un
 * certificado que el SII no tiene registrado responde 10; con la firma
 * alterada, 11 — con la misma glosa en ambos casos.
 */
export function mensajeToken(estado: string): string {
    switch (estado) {
        case '-07':
        case '-3':
            return 'El SII no reconoce al titular del certificado como usuario con certificado digital. Revisa que esté registrado y autorizado para tu empresa en el SII.';
        case '10':
            return 'El SII no aceptó tu certificado digital: debe emitirlo una entidad certificadora acreditada en Chile y su titular debe estar registrado en el SII.';
        case '05':
        case '11':
        case '21':
            return 'El SII no aceptó la firma del certificado. Vuelve a subir el certificado vigente en Ajustes › Datos fiscales.';
        default:
            return 'El SII no aceptó la autenticación con tu certificado. Reintenta en unos minutos o escríbenos a soporte@flouvia.com.';
    }
}

/**
 * Fallas de la autenticación que se resuelven solas: semilla vencida
 * ("TIME-OUT DEL SEED", 08) y errores internos del SII (07, 09, 12, -1, -2).
 * Las de XML inválido (01–04, 06, 11) son de Cord, y 10 es un certificado
 * que el SII no acepta: no se reintentan.
 */
export function tokenTransitorio(estado: string): boolean {
    return ['07', '08', '09', '12', '-1', '-2'].includes(estado);
}
