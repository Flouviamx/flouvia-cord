// Autenticación del correo ENTRANTE (el proveedor de correo que entrega a
// Cord los mensajes recibidos): la comparten /api/webhooks/inbound-email
// (respuestas a la cobranza) y /api/webhooks/sii-intercambio (DTE de
// proveedores, Chile). Un solo secreto, INBOUND_EMAIL_SECRET, y falla cerrado
// si no está.
//
// - Bearer en tiempo constante: compararlo con `!==` filtra el secreto por el
//   tiempo de respuesta.
// - Firma HMAC-SHA256 sobre `timestamp.cuerpo` (cabeceras x-cord-timestamp y
//   x-cord-signature) con 300 s de tolerancia: cambiar un byte del cuerpo la
//   invalida y el timestamp acota la reproducción. Si el proveedor no manda
//   firma decide el bearer; en cuanto la manda, manda ella.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const FIRMA_TOLERANCIA_SEG = 300;

function secreto(): string {
    return String((import.meta as { env?: Record<string, string | undefined> }).env?.INBOUND_EMAIL_SECRET
        || (typeof process !== 'undefined' ? process.env?.INBOUND_EMAIL_SECRET : '') || '');
}

/** Compara el bearer con el secreto sin filtrar su longitud ni su contenido por tiempo. */
export function bearerValido(token: string | undefined | null, clave = secreto()): boolean {
    if (!clave || !token) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(clave);
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifica la firma del proveedor sobre el CUERPO CRUDO, en tiempo constante. */
export function firmaValida(raw: string, timestamp: string | null, firma: string | null, clave = secreto(), ahoraS = Date.now() / 1000): boolean {
    if (!clave) return false;
    if (!firma) return true;
    if (!timestamp) return false;
    const edad = Math.abs(ahoraS - Number(timestamp));
    if (!Number.isFinite(edad) || edad > FIRMA_TOLERANCIA_SEG) return false;
    const esperado = createHmac('sha256', clave).update(`${timestamp}.${raw}`).digest();
    const recibido = Buffer.from(firma.replace(/^sha256=/, ''), 'hex');
    return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** Bearer + firma de una petición entrante, con el cuerpo ya leído crudo. */
export function entranteAutorizado(request: Request, raw: string): boolean {
    const token = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') || '').trim())?.[1];
    return bearerValido(token) && firmaValida(raw, request.headers.get('x-cord-timestamp'), request.headers.get('x-cord-signature'));
}
