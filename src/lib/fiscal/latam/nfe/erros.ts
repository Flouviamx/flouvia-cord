// Traducción de los códigos de resultado de la NF-e (cStat) a mensajes para
// el dueño del negocio (regla 14): la descripción cruda de la SEFAZ se guarda
// en la respuesta para soporte y no se muestra; el código sí acompaña al
// mensaje, porque es lo que el contador busca en el manual.
//
// Códigos y significados: MOC 7.0 Anexo I §4.4 y las NT vigentes (tabla
// completa en scripts/fixtures/nfe/cstat.tsv, que scripts/nfe-check.mjs
// compara con estos conjuntos).
//
// Puro: lo cargan los scripts con Node plano.

/** Autorizado (100) y autorizado fuera de plazo (150). */
export const AUTORIZADO = new Set(['100', '150']);
/** Uso denegado: el número QUEDA consumido y la NF-e no tiene validez [MOC 2.2.10]. */
export const DENEGADO = new Set(['110', '301', '302', '303']);
/** Cancelada en la base de la SEFAZ (consulta). */
export const CANCELADO = new Set(['101', '151', '155']);
/** El lote no se procesó porque el servicio está parado: candidato a contingencia. */
export const PARALISADO = new Set(['108', '109']);
/** Lote recibido para proceso asíncrono (103), en proceso (105). */
export const LOTE_RECIBIDO = '103';
export const LOTE_PROCESADO = '104';
export const LOTE_EN_PROCESO = '105';
export const LOTE_NO_LOCALIZADO = '106';
export const SERVICO_OPERANDO = '107';
/** Duplicidad: la MISMA chave ya existe (204) o el número ya lo usa OTRA chave (539, 562, 613). */
export const DUPLICIDADE_MESMA = '204';
export const DUPLICIDADE_OUTRA = new Set(['539', '562', '613']);
export const NAO_CONSTA = '217';
/** Evento registrado (135) o registrado sin vínculo (136); 155: cancelación fuera de plazo homologada. */
export const EVENTO_REGISTRADO = new Set(['135', '136', '155']);
export const EVENTO_DUPLICADO = '573';
export const INUTILIZACAO_HOMOLOGADA = '102';
/**
 * Respuestas al REENVÍO de una inutilização sin respuesta que confirman que la
 * primera sí llegó: 256 (un número de la faixa ya está inutilizado) y 563 (ya
 * existe pedido con la misma faixa) [MOC Anexo I 4.4]. El servicio no tiene
 * consulta propia: reenviar el mismo pedido firmado es la forma de saberlo.
 */
export const INUTILIZACAO_JA_REGISTRADA = new Set(['256', '563']);
/** Certificado de transmisión o de firma rechazado. */
export const CERTIFICADO = new Set(['213', '280', '281', '282', '283', '284', '285', '286', '290', '291', '292', '293', '294', '295', '296', '297', '298']);

const CERT = 'La SEFAZ no aceptó el certificado digital: debe ser el e-CNPJ ICP-Brasil vigente (tipo A1) del mismo CNPJ que emite. Revísalo en Ajustes › Datos fiscales.';
const ARMADO = 'La SEFAZ rechazó la estructura de la NF-e que armó Cord. No se emitió nada; escríbenos a soporte@flouvia.com con el código.';
const IE_DEST = 'La Inscrição Estadual del cliente no corresponde a su CNPJ/CPF en el registro de la SEFAZ. Revisa la ficha del cliente.';
const DENEGADA = 'La SEFAZ denegó el uso de la NF-e por la situación fiscal del emisor o del cliente. El número quedó registrado como denegado y no puede volver a usarse.';
const RESP_TEC = 'La SEFAZ exige datos del desarrollador del sistema emisor que Cord todavía no tiene registrados en tu estado. Escríbenos a soporte@flouvia.com.';

const MENSAJES: Record<string, string> = {
    110: DENEGADA, 301: DENEGADA, 302: DENEGADA, 303: DENEGADA,
    201: 'La SEFAZ inutiliza como máximo 10.000 números por pedido. Divide el rango.',
    241: 'Un número del rango ya se usó en una NF-e: inutiliza solo números que nunca se usaron.',
    256: 'Parte de ese rango ya está inutilizada en la SEFAZ.',
    563: 'La SEFAZ ya tiene un pedido de inutilização para ese mismo rango.',
    203: 'Tu CNPJ todavía no está habilitado para emitir NF-e en la SEFAZ de tu estado (credenciamento). Complétalo y vuelve a emitir.',
    205: 'Ese número de NF-e está denegado en la SEFAZ.',
    206: 'Ese número de NF-e ya está inutilizado en la SEFAZ.',
    207: 'La SEFAZ no reconoce el CNPJ de tu negocio.',
    208: 'La SEFAZ no reconoce el CNPJ del cliente. Revisa su ficha.',
    209: 'La SEFAZ no reconoce la Inscrição Estadual de tu establecimiento. Revísala en Ajustes › Datos fiscales.',
    210: 'La SEFAZ no reconoce la Inscrição Estadual del cliente. Revisa su ficha.',
    215: ARMADO, 225: ARMADO, 243: ARMADO, 404: ARMADO, 516: ARMADO, 517: ARMADO, 297: ARMADO, 298: ARMADO,
    232: 'El cliente tiene Inscrição Estadual activa: indícala en su ficha.',
    233: IE_DEST, 234: IE_DEST, 624: IE_DEST,
    305: 'La SEFAZ bloqueó al cliente en su estado: no se le puede emitir NF-e.',
    306: 'La Inscrição Estadual del cliente no está activa en su estado. Revisa su ficha.',
    452: ARMADO,
    501: 'Pasó el plazo de cancelación de la NF-e (24 horas desde la autorización): corrígela con una nota de devolución o una Carta de Correção.',
    573: 'La SEFAZ ya tiene registrado ese evento.',
    580: 'La NF-e no está autorizada en la SEFAZ: no admite eventos.',
    594: 'La NF-e alcanzó el máximo de 20 Cartas de Correção.',
    598: ARMADO,
    656: 'La SEFAZ limitó temporalmente las consultas de Cord. Reintenta en una hora.',
    694: 'Una venta a otro estado a un consumidor final no contribuyente exige el diferencial de alícuotas (DIFAL), que Cord todavía no declara.',
    696: 'Con un cliente no contribuyente la operación debe marcarse como de consumidor final. Revisa su ficha.',
    728: 'El cliente está marcado como contribuyente del ICMS pero no tiene Inscrição Estadual. Revisa su ficha.',
    778: 'La SEFAZ no reconoce el NCM de un producto. Revísalo en el catálogo.',
    805: 'La SEFAZ del cliente no admite "contribuyente exento de IE" en esta operación. Revisa el indicador de IE del cliente.',
    930: 'La SEFAZ de tu estado exige el código de beneficio fiscal (cBenef) para un producto, y Cord todavía no lo declara.',
    972: RESP_TEC, 973: RESP_TEC, 974: RESP_TEC, 975: RESP_TEC, 976: RESP_TEC, 977: RESP_TEC, 978: RESP_TEC,
};
for (const c of CERTIFICADO) MENSAJES[c] = CERT;
MENSAJES[281] = 'El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales.';
MENSAJES[291] = MENSAJES[281];
MENSAJES[284] = 'El certificado digital fue revocado. Sube uno vigente en Ajustes › Datos fiscales.';
MENSAJES[294] = MENSAJES[284];
MENSAJES[213] = 'El certificado digital es de otro CNPJ: debe ser el del establecimiento que emite. Revísalo en Ajustes › Datos fiscales.';

/** Mensaje para el dueño del negocio de un cStat de rechazo. */
export function mensajeCstat(cStat: string): string {
    const c = String(cStat ?? '').trim();
    return MENSAJES[c] ?? `La SEFAZ rechazó la NF-e (código ${c || 'sin código'}). Revisa los datos del documento, del cliente y de Ajustes › Datos fiscales, o escríbenos a soporte@flouvia.com.`;
}

/** Igual que mensajeCstat, para un evento o una inutilização. */
export function mensajeEvento(cStat: string): string {
    const c = String(cStat ?? '').trim();
    return MENSAJES[c] ?? `La SEFAZ rechazó el pedido (código ${c || 'sin código'}). Escríbenos a soporte@flouvia.com si necesitas ayuda.`;
}

/** Códigos con mensaje propio (lo compara el script de contrato con la tabla oficial). */
export const CODIGOS_CON_MENSAJE = Object.keys(MENSAJES);
