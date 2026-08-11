import { translateStripeError } from './stripe-catalogs';

export interface SafePayError { message: string; reference: string }

function reference(): string {
    const id = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 8);
    return (id || Math.random().toString(36).slice(2, 10)).toUpperCase();
}

function codeOf(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const value = error as Record<string, any>;
    return String(value.decline_code || value.code || value.error?.decline_code || value.error?.code || '');
}

/** Mensaje cerrado para quien paga. Nunca devuelve texto libre del proveedor. */
export function payerError(error: unknown): SafePayError {
    const ref = reference();
    const code = codeOf(error);
    const messages: Record<string, string> = {
        insufficient_funds: 'La tarjeta no tiene fondos suficientes. Prueba con otro método.',
        expired_card: 'La tarjeta está vencida. Revisa la fecha o usa otra tarjeta.',
        incorrect_cvc: 'El código de seguridad no coincide. Revísalo e intenta de nuevo.',
        incorrect_number: 'El número de tarjeta no es válido. Revísalo e intenta de nuevo.',
        invalid_number: 'El número de tarjeta no es válido. Revísalo e intenta de nuevo.',
        card_declined: 'El banco rechazó el pago. Prueba con otra tarjeta o usa SPEI.',
        processing_error: 'No pudimos procesar el pago. Espera un momento e intenta de nuevo.',
        rate_limit: 'Hay demasiados intentos. Espera un minuto e intenta de nuevo.',
    };
    return { message: messages[code] || 'No pudimos completar el pago. Intenta de nuevo o usa otro método.', reference: ref };
}

/** Mensaje para el vendedor. Conserva traducciones conocidas y cierra el fallback. */
export function merchantError(error: unknown): SafePayError {
    const ref = reference();
    const translated = translateStripeError(error as any);
    const raw = error && typeof error === 'object' ? String((error as any)?.message || (error as any)?.error?.message || '') : '';
    const safe = translated && translated !== raw
        ? translated.replace(/Stripe/gi, 'el procesador de pagos')
        : `No pudimos completar la operación (ref: ${ref})`;
    return { message: safe, reference: ref };
}
