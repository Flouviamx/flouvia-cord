// Traducción de los códigos de rechazo del Sistema Nacional NFS-e a mensajes
// para el dueño del negocio (regla 14): la descripción cruda de la Sefin se
// guarda en la respuesta para soporte y nunca se muestra; el código sí
// acompaña al mensaje, porque es lo que el contador busca en el manual.
//
// Códigos y significados de las hojas RN_RECEPCAO_DPS y RN DPS_NFS-e del
// ANEXO_I v1.01-20260209 y RN EVENTO_PED.REG.EVENTO del ANEXO_II v1.01.
//
// Puro: lo cargan los scripts de contrato con Node plano.

// Extensión .ts explícita: este módulo también se carga desde Node plano.
import type { MensagemProcessamento } from './sefin.ts';

/** La DPS (serie + número + municipio + CNPJ/CPF) ya generó una NFS-e: hay que CONSULTARLA [E0014]. */
export const CODIGO_DPS_DUPLICADA = 'E0014';

/** Fallas del certificado de transmisión o de firma: el pedido no se procesó. */
export const CODIGOS_CERTIFICADO = new Set([
    'E1200', 'E1203', 'E1205', 'E1206', 'E1207', 'E1208', 'E1209', 'E0714', 'E0715', 'E0716', 'E0717', 'E0718',
    'E1980', 'E1983', 'E1986', 'E1989', 'E1991',
]);

const CERTIFICADO = 'El Sistema Nacional NFS-e no aceptó el certificado digital: debe ser el e-CNPJ (o e-CPF) ICP-Brasil vigente de tu negocio, tipo A1. Revísalo en Ajustes › Datos fiscales.';
const ALIQUOTA = 'La alícuota del ISS no corresponde a tu régimen y a la parametrización del municipio. Revisa tu situación ante el Simples Nacional y la retención del ISS en Ajustes › Datos fiscales.';
const RETENCAO = 'El municipio no admite la retención del ISS en esta operación. Quita la retención del ISS del documento.';

const MENSAJES: Record<string, string> = {
    E1200: CERTIFICADO, E1203: 'El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales.',
    E1205: CERTIFICADO, E1206: CERTIFICADO, E1207: 'El certificado digital fue revocado. Sube uno vigente en Ajustes › Datos fiscales.',
    E1208: CERTIFICADO, E1209: CERTIFICADO,
    E0714: CERTIFICADO, E0715: CERTIFICADO, E0716: CERTIFICADO, E0717: CERTIFICADO,
    E0718: 'La DPS debe firmarse con el certificado digital del propio negocio emisor. Sube el certificado de tu CNPJ en Ajustes › Datos fiscales.',
    E1235: 'El Sistema Nacional NFS-e no pudo leer la DPS. Escríbenos a soporte@flouvia.com.',
    E1228: 'El Sistema Nacional NFS-e no pudo leer la DPS. Escríbenos a soporte@flouvia.com.',
    E1229: 'El Sistema Nacional NFS-e no pudo leer la DPS. Escríbenos a soporte@flouvia.com.',
    E0001: 'El Sistema Nacional NFS-e ya no acepta esta versión de la DPS. Escríbenos a soporte@flouvia.com.',
    E0008: 'La hora de emisión de la DPS quedó por delante de la del Sistema Nacional NFS-e. Reintenta en un minuto.',
    E0010: 'La serie de la DPS no pertenece al rango de los sistemas propios (1 a 49999). Revísala en Ajustes › Datos fiscales.',
    E0014: 'Esa serie y número de DPS ya generaron una NFS-e. Reintenta: Cord la consulta y no se duplica.',
    E0015: 'La fecha de prestación del servicio no puede ser posterior a la emisión.',
    E0016: 'La fecha de prestación es anterior a la adhesión de tu municipio al Sistema Nacional NFS-e.',
    E1270: 'La fecha de prestación es anterior a la adhesión de tu municipio al Sistema Nacional NFS-e.',
    E0018: 'La fecha de prestación es anterior a la inscripción del CNPJ de tu negocio.',
    E0023: 'La fecha de prestación es anterior a tu inscripción municipal.',
    E0037: 'Tu municipio no está adherido al Sistema Nacional NFS-e: la NFS-e se emite en el sistema propio de la prefectura.',
    E0038: 'El convenio de tu municipio con el Sistema Nacional NFS-e no está activo: la NFS-e se emite en el sistema propio de la prefectura.',
    E0039: 'Tu municipio no permite emitir por el emisor nacional de NFS-e: la NFS-e se emite en el sistema propio de la prefectura.',
    E0041: 'Para un MEI, el municipio emisor debe ser el de la dirección de su CNPJ. Revisa el municipio en Ajustes › Datos fiscales.',
    E0080: 'El CNPJ de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.',
    E0096: 'El CPF de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.',
    E0116: 'Tu municipio exige la inscripción municipal en la NFS-e. Agrégala en Ajustes › Datos fiscales.',
    E0119: 'Tu inscripción municipal no está autorizada a emitir NFS-e. Revísala con la prefectura.',
    E0120: 'Tu municipio no tiene registrada esa inscripción municipal en el cadastro nacional: quítala de Ajustes › Datos fiscales.',
    E0124: 'Tu inscripción municipal está inactiva para la fecha de prestación. Revísala con la prefectura.',
    E0160: 'Tu situación ante el Simples Nacional no coincide con la registrada en la Receita Federal para ese mes. Corrígela en Ajustes › Datos fiscales.',
    E0162: 'Solo un optante ME/EPP del Simples Nacional indica régimen de apuración. Revisa tu régimen en Ajustes › Datos fiscales.',
    E0166: 'Indica tu régimen de apuración del Simples Nacional en Ajustes › Datos fiscales.',
    E0172: 'El régimen especial de tributación debe ser "Ninguno" para esta operación.',
    E0174: 'Un MEI no declara régimen especial de tributación. Revísalo en Ajustes › Datos fiscales.',
    E0175: 'Con todos los tributos por el Simples Nacional el régimen especial debe ser "Ninguno". Revísalo en Ajustes › Datos fiscales.',
    E0176: 'El municipio no te tiene registrado como profesional autónomo. Revisa el régimen especial en Ajustes › Datos fiscales.',
    E0177: 'El municipio no admite ese régimen especial de tributación. Revísalo en Ajustes › Datos fiscales.',
    E0178: 'El municipio no admite ese régimen especial para tu negocio y este servicio. Revísalo en Ajustes › Datos fiscales.',
    E0188: 'El CNPJ del cliente no es válido. Corrígelo en su ficha.',
    E0233: 'El cliente necesita un nombre o razón social.',
    E0310: 'El código del servicio no existe en la lista nacional. Revísalo en Ajustes › Datos fiscales.',
    E0312: 'Tu municipio no administra ese código de servicio. Elige el código que corresponda en Ajustes › Datos fiscales.',
    E0314: 'El código de tributación municipal no existe en tu municipio para ese servicio. Revísalo en Ajustes › Datos fiscales.',
    E0315: 'El código de tributación municipal no puede ser 000.',
    E0427: 'El descuento no puede superar el valor del servicio.',
    E0428: 'Los descuentos y retenciones no pueden superar el valor del servicio.',
    E0429: 'El ISS de este servicio no puede quedar por debajo de la alícuota mínima del 2 %.',
    E0431: 'El descuento debe ser mayor que cero y menor que el valor del servicio.',
    E0539: 'El municipio considera este servicio tributable por el ISS.',
    E0540: 'El municipio considera este servicio no tributable por el ISS; Cord todavía no emite ese caso.',
    E0580: RETENCAO, E0583: 'El ISS de un MEI no se retiene. Quita la retención del documento.',
    E0588: 'El ISS no se retiene con régimen especial de tributación. Quita la retención del documento.',
    E0594: RETENCAO, E0596: RETENCAO, E0667: RETENCAO,
    E0595: 'La alícuota del ISS no puede ser mayor que 5 %.',
    E0600: ALIQUOTA, E0602: ALIQUOTA, E0604: ALIQUOTA, E0612: ALIQUOTA, E0617: ALIQUOTA, E0621: ALIQUOTA,
    E0625: ALIQUOTA, E0628: ALIQUOTA, E0631: ALIQUOTA, E0635: ALIQUOTA,
    E0619: 'El municipio donde incide el ISS no está activo en el Sistema Nacional NFS-e; Cord todavía no emite ese caso.',
    E0640: 'El municipio donde incide el ISS no está activo en el Sistema Nacional NFS-e; Cord todavía no emite ese caso.',
    E0675: 'Una persona física no declara tributos federales en la NFS-e.',
    E0712: 'Como ME/EPP del Simples Nacional, la NFS-e lleva el porcentaje de tributos del Simples. Indícalo en Ajustes › Datos fiscales.',
    E9996: 'El Sistema Nacional NFS-e solo admite la emisión por el prestador.',
    // Cancelación [ANEXO_II].
    E0822: 'Venció el plazo que tu municipio da para cancelar la NFS-e por el sistema: ahora la cancelación se solicita a la prefectura, que la analiza.',
    E0823: 'Tu municipio no permite cancelar por el sistema una NFS-e de este valor.',
    E0824: 'Tu municipio no permite cancelar una NFS-e sin el tomador identificado.',
    E0827: 'La NFS-e ya tiene los tributos recolectados: tu municipio no permite cancelarla.',
    E0840: 'La NFS-e ya está cancelada o bloqueada por la prefectura.',
    E1831: 'El Sistema Nacional NFS-e todavía no tiene esta NFS-e. Reintenta en unos minutos.',
    E0812: 'La cancelación debe firmarse con el certificado del propio negocio emisor.',
    E1845: 'La NFS-e se emitió en otro ambiente del Sistema Nacional NFS-e.',
};

export function normalizarCodigo(c: unknown): string {
    const s = String(c ?? '').trim().toUpperCase();
    return /^\d+$/.test(s) ? `E${s.padStart(4, '0')}` : s;
}

/** Mensaje para el dueño del negocio de UN código de la Sefin. */
export function mensajeCodigo(codigo: string): string {
    const c = normalizarCodigo(codigo);
    return MENSAJES[c] ?? `El Sistema Nacional NFS-e rechazó la NFS-e (código ${c || 'sin código'}). Revisa los datos del documento y de Ajustes › Datos fiscales, o escríbenos a soporte@flouvia.com.`;
}

/** El mensaje más útil de una lista de errores: el primero con texto propio, en el orden de la Sefin. */
export function mensajeRechazo(erros: MensagemProcessamento[]): string {
    const conocido = erros.find((e) => MENSAJES[normalizarCodigo(e.codigo)]);
    return mensajeCodigo((conocido ?? erros[0])?.codigo ?? '');
}

export const tieneCodigo = (erros: MensagemProcessamento[], codigo: string) => erros.some((e) => normalizarCodigo(e.codigo) === codigo);
export const deCertificado = (erros: MensagemProcessamento[]) => erros.some((e) => CODIGOS_CERTIFICADO.has(normalizarCodigo(e.codigo)));
