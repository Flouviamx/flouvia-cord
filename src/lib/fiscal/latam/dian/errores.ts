// Traducción de las reglas de validación de la DIAN a mensajes para el dueño
// del negocio (regla 14). La DIAN responde cada regla incumplida como texto
// ("Regla: FAD06, Rechazo: Valor del CUFE no está calculado correctamente");
// el texto crudo se guarda en la respuesta del intento, para soporte, y lo que
// se muestra es un mensaje accionable con el código de la regla — lo que el
// contador del negocio busca en el Anexo Técnico.
//
// Familias de reglas del Anexo Técnico v1.9 (sección 8, "Reglas de
// validación"; sección 9 para la firma y el XML):
//   FAB/CAB/DAB  extensiones DIAN: numeración, software, proveedor;
//   FAD/CAD/DAD  encabezado: número, CUFE/CUDE, fechas;
//   FAJ/CAJ/DAJ  emisor;  FAK/CAK/DAK  adquiriente;
//   FAS/FAU/FAX  impuestos, totales, líneas (y sus pares de notas);
//   ZB, ZD, ZE   esquema XML, certificado y firma.
//
// Puro: lo cargan los scripts de contrato con Node plano.

export interface MensajeDian {
    /** Código de la regla (FAD06, ZE02, 90…); '' si el texto no lo trae. */
    regla: string;
    /** El Anexo distingue rechazo (el documento no vale) de notificación (vale, con aviso). */
    tipo: 'rechazo' | 'notificacion';
    texto: string;
}

/**
 * "Regla: FAJ71, Notificación: …", "Regla: 90, Rechazo: …" o, en los ejemplos
 * del Anexo, "Regla: AA09 Valor del CUFE…". Sin la palabra, una regla de una
 * respuesta inválida se trata como rechazo.
 */
export function interpretarMensaje(crudo: string, invalido: boolean): MensajeDian {
    const m = /^\s*Regla:\s*([A-Za-z0-9]+)\s*,?\s*(Rechazo|Notificaci[oó]n)?\s*:?\s*([\s\S]*)$/i.exec(crudo);
    if (!m) return { regla: '', tipo: invalido ? 'rechazo' : 'notificacion', texto: crudo.trim() };
    const tipo = m[2] ? (/^rechazo$/i.test(m[2]) ? 'rechazo' : 'notificacion') : (invalido ? 'rechazo' : 'notificacion');
    return { regla: m[1], tipo, texto: m[3].trim() };
}

/** "Documento procesado anteriormente" [AT 7.10.3]: la DIAN YA tiene este CUFE/CUDE. */
export const REGLA_PROCESADO = '90';

export const esProcesadoAntes = (m: MensajeDian) => m.regla === REGLA_PROCESADO || /procesado anteriormente/i.test(m.texto);

const AJUSTES = 'Ajustes › Datos fiscales';

/** Reglas puntuales, antes que las familias. */
const PUNTUALES: Record<string, string> = {
    FAD06: `La DIAN no reconoce la clave técnica de la resolución: revisa que sea la de este rango en ${AJUSTES}.`,
    CAD06: `La DIAN no reconoce el PIN del software: revisa que sea el que registraste ante la DIAN, en ${AJUSTES}.`,
    DAD06: `La DIAN no reconoce el PIN del software: revisa que sea el que registraste ante la DIAN, en ${AJUSTES}.`,
    FAB27b: `La DIAN no reconoce el PIN del software: revisa que sea el que registraste ante la DIAN, en ${AJUSTES}.`,
    CAB27b: `La DIAN no reconoce el PIN del software: revisa que sea el que registraste ante la DIAN, en ${AJUSTES}.`,
    DAB27b: `La DIAN no reconoce el PIN del software: revisa que sea el que registraste ante la DIAN, en ${AJUSTES}.`,
    ZE03: `El certificado no está a nombre del NIT de tu negocio. Sube el certificado de firma de tu empresa en ${AJUSTES}.`,
    ZD02: `El certificado de firma no está vigente. Sube uno vigente en ${AJUSTES}.`,
    ZD04: `El certificado de firma fue revocado por tu entidad certificadora. Sube uno vigente en ${AJUSTES}.`,
    ZD05: 'La DIAN no reconoce a la entidad que emitió tu certificado de firma: debe ser una entidad certificadora avalada por la ONAC.',
    ZD06: 'La DIAN no reconoce a la entidad que emitió tu certificado de firma: debe ser una entidad certificadora avalada por la ONAC.',
    ZD07: 'El certificado no está habilitado para firma digital con no repudio, como exige la DIAN. Usa el certificado de firma de factura electrónica.',
    FAD09e: 'La fecha de emisión no coincide con la de la firma. Reintenta la emisión.',
    DC24: 'La DIAN rechazó la hora de la firma. Reintenta en unos minutos.',
};

/** Familias, por prefijo de la regla (sin el primer carácter del tipo de documento). */
const FAMILIAS: [RegExp, string][] = [
    [/^[FCD]AB(0[5-9]|1[0-2])/, `La DIAN no reconoce la numeración usada: revisa en ${AJUSTES} que el número de resolución, el prefijo, el rango y la vigencia coincidan con los de tu resolución, y que esté asociada al software.`],
    [/^[FCD]AD05/, `El número del documento está fuera del rango autorizado por la DIAN. Revisa la resolución en ${AJUSTES}.`],
    [/^[FCD]AB(19|2[0-9])/, `La DIAN no reconoce el software de facturación de tu negocio: revisa el identificador del software y el PIN en ${AJUSTES}.`],
    [/^[FCD]AJ/, `La DIAN rechazó los datos fiscales de tu negocio (NIT, responsabilidades, dirección o municipio). Revísalos en ${AJUSTES}.`],
    [/^[FCD]AK/, 'La DIAN rechazó los datos del cliente (identificación, dígito de verificación, tipo de documento, responsabilidades o correo). Revísalos en su ficha.'],
    [/^Z[DE]/, `La DIAN rechazó la firma o el certificado del documento. Revisa el certificado de firma en ${AJUSTES}.`],
    [/^CBF/, 'La factura que ajusta esta nota no coincide con la que tiene la DIAN.'],
];

/** Mensaje para el dueño del negocio de UNA regla de rechazo. */
export function mensajeRegla(regla: string): string {
    if (PUNTUALES[regla]) return PUNTUALES[regla];
    const familia = FAMILIAS.find(([re]) => re.test(regla));
    if (familia) return `${familia[1]} (regla ${regla})`;
    return regla
        ? `La DIAN rechazó el documento (regla ${regla}). Revisa los datos de la factura y del cliente, o escríbenos a soporte@flouvia.com.`
        : 'La DIAN rechazó el documento sin indicar la regla. Escríbenos a soporte@flouvia.com.';
}

/** El mensaje más útil de un rechazo: el primero con texto propio, en el orden de la DIAN. */
export function mensajeRechazo(mensajes: MensajeDian[]): string {
    const rechazos = mensajes.filter((m) => m.tipo === 'rechazo');
    const conocido = rechazos.find((m) => PUNTUALES[m.regla] || FAMILIAS.some(([re]) => re.test(m.regla)));
    return mensajeRegla((conocido ?? rechazos[0] ?? mensajes[0])?.regla ?? '');
}
