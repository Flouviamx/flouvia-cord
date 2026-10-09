// Sales tax de EE. UU.: la ÚNICA puerta hacia la API de impuestos del
// proveedor (`/v1/tax/*`). `npm run security:us-tax` falla si otra parte del
// código la llama directo.
//
// Todo va EN LA CUENTA DE COBROS del negocio (`Stripe-Account`): el negocio es
// quien está registrado ante cada estado, quien recauda y quien declara. Un
// cálculo hecho en la cuenta de la plataforma usaría los registros de Cord, no
// los del negocio, y mezclaría su obligación con la de otros.
//
// Cuatro garantías (regla 33), aunque un cálculo no mueve dinero: cada POST que
// CREA algo lleva `Idempotency-Key` determinística, ningún mensaje del
// proveedor sale de aquí (solo `UsTaxError` con el motivo de Cord), el rate
// limit vive en el llamador que cobra el cálculo (calculo.ts) y las queries
// van en el carril de la organización.
//
// Fuente: docs.stripe.com/tax/tax-for-platforms (cálculo con `Stripe-Account`
// para cuentas Custom), /tax/settings-api y /tax/registrations-api (variante
// Connect), /api/tax/calculations y /api/tax/transactions/create_from_calculation
// (los cálculos vencen a los 90 días; `reference` es única entre transacciones).

import { stripe } from '../billing';
import { UsTaxError, usTaxErrorFromProvider, type UsAddress } from './core';

const addr = (prefix: string, a: UsAddress): Record<string, string> => ({
    [`${prefix}[country]`]: 'US',
    [`${prefix}[state]`]: a.state,
    [`${prefix}[postal_code]`]: a.postal_code,
    ...(a.line1 ? { [`${prefix}[line1]`]: a.line1 } : {}),
    ...(a.line2 ? { [`${prefix}[line2]`]: a.line2 } : {}),
    ...(a.city ? { [`${prefix}[city]`]: a.city } : {}),
});

async function llamar<T>(fn: () => Promise<T>, locale: string): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof UsTaxError) throw error;
        throw new UsTaxError(usTaxErrorFromProvider(error), locale, error);
    }
}

export interface UsTaxSettingsState {
    status: 'active' | 'pending';
    /** Lo que el proveedor dice que falta (`status_details.pending.missing_fields`). */
    faltantes: string[];
}

const settingsState = (s: any): UsTaxSettingsState => ({
    status: s?.status === 'active' ? 'active' : 'pending',
    faltantes: Array.isArray(s?.status_details?.pending?.missing_fields) ? s.status_details.pending.missing_fields.map(String) : [],
});

/**
 * Domicilio del negocio y clasificación de lo que vende, en su cuenta. Es una
 * ACTUALIZACIÓN idempotente por naturaleza (mismo cuerpo, mismo resultado);
 * la clave evita dos escrituras si el navegador reintenta.
 */
export async function syncUsTaxSettings(
    account: string,
    input: { origen: UsAddress; taxCode: string; idempotencyKey: string },
    locale = 'es',
): Promise<UsTaxSettingsState> {
    const s = await llamar(() => stripe('/v1/tax/settings', {
        ...addr('head_office[address]', input.origen),
        'defaults[tax_code]': input.taxCode,
    }, 'POST', { stripeAccount: account, idempotencyKey: input.idempotencyKey }), locale);
    return settingsState(s);
}

export async function readUsTaxSettings(account: string, locale = 'es'): Promise<UsTaxSettingsState> {
    return settingsState(await llamar(() => stripe('/v1/tax/settings', undefined, 'GET', { stripeAccount: account }), locale));
}

/** Registro de sales tax en un estado. Devuelve el id del registro. */
export async function createUsRegistration(
    account: string,
    input: { state: string; idempotencyKey: string },
    locale = 'es',
): Promise<string> {
    const r = await llamar(() => stripe('/v1/tax/registrations', {
        country: 'US',
        'country_options[us][state]': input.state,
        'country_options[us][type]': 'state_sales_tax',
        active_from: 'now',
    }, 'POST', { stripeAccount: account, idempotencyKey: input.idempotencyKey }), locale);
    return String(r.id);
}

/** Los registros no se borran: se vencen desde ahora. */
export async function expireUsRegistration(account: string, registrationId: string, locale = 'es'): Promise<void> {
    await llamar(() => stripe(`/v1/tax/registrations/${encodeURIComponent(registrationId)}`, {
        expires_at: 'now',
    }, 'POST', { stripeAccount: account, idempotencyKey: `us-tax-reg-expire:${registrationId}` }), locale);
}

/** Registros vivos en la cuenta, por estado. */
export async function listActiveUsRegistrations(account: string, locale = 'es'): Promise<{ id: string; state: string }[]> {
    const r = await llamar(() => stripe('/v1/tax/registrations', { status: 'active', limit: '100' }, 'GET', { stripeAccount: account }), locale);
    return (Array.isArray(r?.data) ? r.data : [])
        .filter((x: any) => x?.country === 'US' && x?.country_options?.us?.type === 'state_sales_tax')
        .map((x: any) => ({ id: String(x.id), state: String(x.country_options.us.state || '').toUpperCase() }));
}

export interface UsTaxCalcInput {
    currency: string;
    destino: UsAddress;
    exento: boolean;
    incluido: boolean;
    taxCode: string;
    /** Importes por línea en unidades mínimas, en el orden del documento. */
    montos: number[];
    idempotencyKey: string;
}

/**
 * Calcula el impuesto de un documento por la dirección del cliente. Las
 * líneas en 0 no se mandan (el proveedor exige importes positivos). Se pide
 * el desglose por jurisdicción de cada línea en la misma llamada.
 */
export async function createUsTaxCalculation(account: string, input: UsTaxCalcInput, locale = 'es'): Promise<any> {
    const form: Record<string, string> = {
        currency: input.currency.toLowerCase(),
        ...addr('customer_details[address]', input.destino),
        'customer_details[address_source]': 'billing',
        'expand[0]': 'line_items.data.tax_breakdown',
    };
    if (input.exento) form['customer_details[taxability_override]'] = 'customer_exempt';
    let n = 0;
    input.montos.forEach((monto, i) => {
        if (!(monto > 0)) return;
        form[`line_items[${n}][amount]`] = String(Math.round(monto));
        form[`line_items[${n}][reference]`] = `L${i}`;
        form[`line_items[${n}][tax_code]`] = input.taxCode;
        form[`line_items[${n}][tax_behavior]`] = input.incluido ? 'inclusive' : 'exclusive';
        n++;
    });
    return llamar(() => stripe('/v1/tax/calculations', form, 'POST', {
        stripeAccount: account, idempotencyKey: input.idempotencyKey,
    }), locale);
}

/**
 * Registra la venta para la declaración del negocio. `reference` es única en
 * la cuenta (el proveedor rechaza otra igual), y la clave de idempotencia
 * cubre el reintento inmediato.
 */
export async function createUsTaxTransaction(
    account: string,
    input: { calculationId: string; reference: string },
    locale = 'es',
): Promise<string> {
    const t = await llamar(() => stripe('/v1/tax/transactions/create_from_calculation', {
        calculation: input.calculationId,
        reference: input.reference,
    }, 'POST', { stripeAccount: account, idempotencyKey: `us-tax-tx:${input.reference}` }), locale);
    return String(t.id);
}

/** Revierte por completo una transacción (factura anulada). */
export async function reverseUsTaxTransaction(
    account: string,
    input: { transactionId: string; reference: string },
    locale = 'es',
): Promise<string> {
    const t = await llamar(() => stripe('/v1/tax/transactions/create_reversal', {
        mode: 'full',
        original_transaction: input.transactionId,
        reference: input.reference,
    }, 'POST', { stripeAccount: account, idempotencyKey: `us-tax-tx:${input.reference}` }), locale);
    return String(t.id);
}
