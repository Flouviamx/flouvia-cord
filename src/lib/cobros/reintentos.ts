// Política de reintentos del cobro automático. Pura: recibe el rechazo y la
// historia del intento, devuelve qué hacer. El cron la aplica; las pruebas la
// fijan (test/cobro-reintentos.test.ts).
//
// Tres principios:
//
// 1. Un rechazo DURO no se reintenta nunca. Tarjeta robada, extraviada o
//    marcada como fraude, mandato revocado: insistir no cobra y las redes lo
//    penalizan (Visa y Mastercard multan los reintentos sobre códigos de "no
//    volver a intentar"). El método se da de baja y se le pide otro al cliente.
// 2. Lo que el cliente puede arreglar se le pide, no se reintenta a ciegas:
//    tarjeta vencida o datos incorrectos (otro método), autenticación
//    requerida (que pague él desde el portal: un cargo sin su presencia no
//    puede pasar el 3-D Secure).
// 3. Lo recuperable se reintenta cuando tiene más probabilidad de pasar. Fondos
//    insuficientes: justo después de los días de pago más comunes (1 y 16 de
//    cada mes) si caen dentro de una semana. El resto de rechazos blandos, en
//    escalera de 2, 4 y 7 días. Una falla técnica del emisor, al día siguiente.
//
// La domiciliación tiene reglas propias del esquema: solo se reintenta por
// fondos insuficientes, como máximo 2 veces, y dentro de 30 días (SEPA) o 40
// (ACH) desde el primer intento — los mismos topes que aplica Stripe a sus
// reintentos de débito. Cualquier otro rechazo de un débito lo resuelve el
// cliente con su banco.
// https://docs.stripe.com/declines/codes
// https://docs.stripe.com/payments/sepa-debit#failed-payments
// https://docs.stripe.com/payments/ach-direct-debit#billing-retries

export type MotivoDetencion = 'metodo_invalido' | 'requiere_autenticacion' | 'mandato_revocado' | 'bloqueado' | 'agotado';
export type Categoria = 'bloqueado' | 'mandato' | 'metodo' | 'autenticacion' | 'fondos' | 'temporal' | 'rechazo';

export type Decision =
    | { accion: 'reintentar'; categoria: Categoria; siguienteAt: Date }
    | {
        accion: 'detener'; categoria: Categoria; motivo: MotivoDetencion;
        /** El método guardado ya no sirve: el cobro automático se apaga hasta que el cliente registre otro. */
        desactivar: boolean;
    };

/** Intentos máximos en tarjeta (el primero más tres reintentos). */
export const MAX_INTENTOS_TARJETA = 4;
/** Intentos máximos en domiciliación (el primero más dos reintentos). */
export const MAX_INTENTOS_DOMICILIACION = 3;
/** Ventana del esquema para reintentar un débito, en días desde el primer intento. */
export const VENTANA_DOMICILIACION: Record<string, number> = { sepa_debit: 30, us_bank_account: 40 };

const BLOQUEADO = new Set([
    'lost_card', 'stolen_card', 'pickup_card', 'fraudulent', 'merchant_blacklist',
    'security_violation', 'restricted_card', 'recipient_deceased',
]);
const MANDATO = new Set([
    'revocation_of_authorization', 'revocation_of_all_authorizations', 'stop_payment_order',
    'debit_not_authorized', 'authorization_revoked', 'debit_disputed', 'debit_authorization_not_match',
]);
const METODO = new Set([
    'expired_card', 'incorrect_number', 'invalid_number', 'invalid_expiry_month', 'invalid_expiry_year',
    'incorrect_cvc', 'invalid_cvc', 'card_not_supported', 'currency_not_supported', 'transaction_not_allowed',
    'new_account_information_available', 'invalid_account', 'account_closed', 'no_account',
    'invalid_account_number', 'bank_account_unusable', 'bank_account_restricted', 'bank_account_declined',
    'branch_does_not_exist', 'incorrect_account_holder_name', 'payment_method_unactivated',
]);
const AUTENTICACION = new Set(['authentication_required', 'card_authentication_required']);
const FONDOS = new Set(['insufficient_funds']);
const TEMPORAL = new Set([
    'processing_error', 'try_again_later', 'issuer_not_available', 'reenter_transaction',
    'rate_limit', 'api_connection_error', 'api_error', 'lock_timeout',
]);

/**
 * Clasifica un rechazo. El código específico (`decline_code`) manda sobre el
 * genérico (`card_declined`), que no dice por qué.
 */
export function categoriaRechazo(codigo: string | null | undefined, declineCode?: string | null): Categoria {
    const codigos = [declineCode, codigo].map((c) => String(c || '').trim().toLowerCase()).filter(Boolean);
    for (const c of codigos) {
        if (BLOQUEADO.has(c)) return 'bloqueado';
        if (MANDATO.has(c)) return 'mandato';
        if (AUTENTICACION.has(c)) return 'autenticacion';
        if (METODO.has(c)) return 'metodo';
        if (FONDOS.has(c)) return 'fondos';
        if (TEMPORAL.has(c)) return 'temporal';
    }
    return 'rechazo';
}

const DIA = 86_400_000;

/** Medianoche UTC del día `dias` después de `ahora`: el cron diario lo toma ese día. */
export function diaUtc(ahora: Date, dias: number): Date {
    const d = new Date(ahora.getTime() + dias * DIA);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fondos insuficientes: el siguiente 1 o 16 del mes (el día después de los
 * pagos de nómina más comunes) a partir de `minimo` días, si cae dentro de una
 * semana; si no, a los `minimo + 1` días.
 */
export function proximoDiaDePago(ahora: Date, minimo: number): Date {
    for (let dias = minimo; dias <= 7; dias++) {
        const d = diaUtc(ahora, dias);
        if (d.getUTCDate() === 1 || d.getUTCDate() === 16) return d;
    }
    return diaUtc(ahora, minimo + 1);
}

const ESCALERA_RECHAZO = [2, 4, 7];

export interface EntradaReintento {
    codigo: string | null | undefined;
    declineCode?: string | null;
    /** Tipo de método del intento que falló: card | sepa_debit | us_bank_account. */
    tipoMetodo: string;
    /** Número del intento que acaba de fallar (1 = el primero). */
    intento: number;
    /** Cuándo fue el primer intento de este ciclo (la ventana del débito se cuenta desde ahí). */
    primerIntentoAt?: Date | null;
    ahora: Date;
}

export function decidirReintento(e: EntradaReintento): Decision {
    const categoria = categoriaRechazo(e.codigo, e.declineCode);
    const debito = e.tipoMetodo === 'sepa_debit' || e.tipoMetodo === 'us_bank_account';

    if (categoria === 'bloqueado') return { accion: 'detener', categoria, motivo: 'bloqueado', desactivar: true };
    if (categoria === 'mandato') return { accion: 'detener', categoria, motivo: 'mandato_revocado', desactivar: true };
    if (categoria === 'metodo') return { accion: 'detener', categoria, motivo: 'metodo_invalido', desactivar: true };
    if (categoria === 'autenticacion') return { accion: 'detener', categoria, motivo: 'requiere_autenticacion', desactivar: false };

    if (debito) {
        // El esquema solo admite reintentar un débito por falta de fondos.
        if (categoria !== 'fondos' || e.intento >= MAX_INTENTOS_DOMICILIACION) {
            return { accion: 'detener', categoria, motivo: 'agotado', desactivar: false };
        }
        const siguienteAt = proximoDiaDePago(e.ahora, 3);
        const ventana = VENTANA_DOMICILIACION[e.tipoMetodo] ?? 30;
        const desde = e.primerIntentoAt ?? e.ahora;
        if (siguienteAt.getTime() > desde.getTime() + ventana * DIA) {
            return { accion: 'detener', categoria, motivo: 'agotado', desactivar: false };
        }
        return { accion: 'reintentar', categoria, siguienteAt };
    }

    if (e.intento >= MAX_INTENTOS_TARJETA) return { accion: 'detener', categoria, motivo: 'agotado', desactivar: false };
    if (categoria === 'fondos') return { accion: 'reintentar', categoria, siguienteAt: proximoDiaDePago(e.ahora, 2) };
    if (categoria === 'temporal') return { accion: 'reintentar', categoria, siguienteAt: diaUtc(e.ahora, 1) };
    const dias = ESCALERA_RECHAZO[Math.min(Math.max(e.intento, 1), ESCALERA_RECHAZO.length) - 1];
    return { accion: 'reintentar', categoria, siguienteAt: diaUtc(e.ahora, dias) };
}
