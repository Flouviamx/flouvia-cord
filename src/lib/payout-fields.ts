// Cómo se identifica una cuenta bancaria en cada país.
//
// Cord solo sabía capturar CLABE, un formato EXCLUSIVO de México, y respondía
// 409 a cualquier otro país: un negocio en Madrid o en Londres completaba su
// alta de Connect y luego no podía decirle a dónde mandarle su dinero.
//
// Los formatos no son intercambiables. El IBAN lleva su propio dígito de
// control (mod-97 sobre el número reordenado), Estados Unidos usa routing +
// account con checksum ABA, Reino Unido sort code + account number, y varios
// países aceptan directamente el número de cuenta local. Aceptar 18 dígitos
// para todos y dejar que Stripe falle produce un error incomprensible para
// alguien que solo quiere cobrar (regla 14).

export type PayoutFormat = 'clabe' | 'iban' | 'us_aba' | 'gb_sort' | 'ca_transit' | 'au_bsb' | 'nz' | 'generic';

export interface PayoutField {
    key: string;
    label: string;
    labelEn: string;
    /** Qué se acepta: solo dígitos, o alfanumérico (IBAN). */
    kind: 'digits' | 'alnum';
    minLength: number;
    maxLength: number;
    hint?: string;
    hintEn?: string;
}

export interface PayoutSpec {
    format: PayoutFormat;
    fields: PayoutField[];
    /** Nombre del riel como lo llama el país. Se muestra tal cual. */
    label: string;
    labelEn: string;
}

const IBAN_FIELD: PayoutField = {
    key: 'iban', label: 'IBAN', labelEn: 'IBAN', kind: 'alnum', minLength: 15, maxLength: 34,
    hint: 'Empieza con el código de tu país, por ejemplo ES91…',
    hintEn: 'Starts with your country code, for example ES91…',
};

const IBAN_SPEC: PayoutSpec = { format: 'iban', label: 'Cuenta IBAN', labelEn: 'IBAN account', fields: [IBAN_FIELD] };

const SPECS: Record<string, PayoutSpec> = {
    MX: {
        format: 'clabe', label: 'Cuenta CLABE', labelEn: 'CLABE account',
        fields: [{
            key: 'clabe', label: 'CLABE Interbancaria', labelEn: 'CLABE', kind: 'digits',
            minLength: 18, maxLength: 18,
            hint: '18 dígitos', hintEn: '18 digits',
        }],
    },
    US: {
        format: 'us_aba', label: 'Cuenta bancaria', labelEn: 'Bank account',
        fields: [
            { key: 'routing_number', label: 'Routing number (ABA)', labelEn: 'Routing number (ABA)', kind: 'digits', minLength: 9, maxLength: 9 },
            { key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number', kind: 'digits', minLength: 4, maxLength: 17 },
        ],
    },
    GB: {
        format: 'gb_sort', label: 'Cuenta bancaria', labelEn: 'Bank account',
        fields: [
            { key: 'routing_number', label: 'Sort code', labelEn: 'Sort code', kind: 'digits', minLength: 6, maxLength: 6 },
            { key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number', kind: 'digits', minLength: 8, maxLength: 8 },
        ],
    },
    CA: {
        format: 'ca_transit', label: 'Cuenta bancaria', labelEn: 'Bank account',
        fields: [
            { key: 'transit_number', label: 'Transit number', labelEn: 'Transit number', kind: 'digits', minLength: 5, maxLength: 5 },
            { key: 'institution_number', label: 'Institution number', labelEn: 'Institution number', kind: 'digits', minLength: 3, maxLength: 3 },
            { key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number', kind: 'digits', minLength: 5, maxLength: 12 },
        ],
    },
    AU: {
        format: 'au_bsb', label: 'Cuenta bancaria', labelEn: 'Bank account',
        fields: [
            { key: 'routing_number', label: 'BSB', labelEn: 'BSB', kind: 'digits', minLength: 6, maxLength: 6 },
            { key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number', kind: 'digits', minLength: 4, maxLength: 10 },
        ],
    },
    NZ: {
        format: 'nz', label: 'Cuenta bancaria', labelEn: 'Bank account',
        fields: [{ key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number', kind: 'digits', minLength: 15, maxLength: 16 }],
    },
};

// Zona SEPA y demás territorios donde Stripe liquida por IBAN.
const IBAN_COUNTRIES = [
    'AD', 'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GI', 'GR',
    'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT',
    'RO', 'SE', 'SI', 'SK', 'SM', 'TR', 'AE', 'SA', 'IL', 'BR',
];
for (const code of IBAN_COUNTRIES) SPECS[code] = IBAN_SPEC;

const GENERIC: PayoutSpec = {
    format: 'generic', label: 'Cuenta bancaria', labelEn: 'Bank account',
    fields: [{
        key: 'account_number', label: 'Número de cuenta', labelEn: 'Account number',
        kind: 'alnum', minLength: 4, maxLength: 34,
    }],
};

export function payoutSpecFor(countryCode: string): PayoutSpec {
    return SPECS[String(countryCode || '').toUpperCase()] ?? GENERIC;
}

/** Dígito de control de una CLABE: pesos 3,7,1 sobre los primeros 17. */
export function clabeValida(clabe: string): boolean {
    if (!/^\d{18}$/.test(clabe)) return false;
    const pesos = [3, 7, 1];
    let suma = 0;
    for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
    return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

/** Dígito de control de un IBAN: mod-97 sobre el número reordenado (ISO 13616). */
export function ibanValido(raw: string): boolean {
    const iban = String(raw || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    const reordenado = iban.slice(4) + iban.slice(0, 4);
    // El número resultante excede Number.MAX_SAFE_INTEGER: el módulo se calcula
    // por bloques, que es como lo define la propia norma.
    let resto = 0;
    for (const ch of reordenado) {
        const valor = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
        resto = Number(String(resto) + valor) % 97;
    }
    return resto === 1;
}

export interface PayoutValidation {
    ok: boolean;
    /** Mensaje para el dueño del negocio: qué está mal, no qué proveedor falló. */
    error?: string;
    /** Campos ya normalizados, listos para Stripe. */
    values?: Record<string, string>;
    /** Últimos 4 para mostrar la cuenta sin exponerla. */
    last4?: string;
}

/**
 * Valida los campos de depósito contra el formato del país.
 *
 * Los checksums se verifican AQUÍ y no en Stripe: una CLABE mal tecleada
 * rebotaba con un error del proveedor que no le dice nada al vendedor, y el
 * dinero terminaba en el limbo hasta que alguien lo notara.
 */
export function validatePayout(countryCode: string, input: Record<string, unknown>, locale: 'es' | 'en' = 'es'): PayoutValidation {
    const spec = payoutSpecFor(countryCode);
    const values: Record<string, string> = {};

    for (const field of spec.fields) {
        const raw = String(input[field.key] ?? '').trim();
        const limpio = field.kind === 'digits'
            ? raw.replace(/\D/g, '')
            : raw.replace(/\s+/g, '').toUpperCase();
        const etiqueta = locale === 'en' ? field.labelEn : field.label;
        if (!limpio) {
            return { ok: false, error: locale === 'en' ? `Enter your ${etiqueta}.` : `Captura tu ${etiqueta}.` };
        }
        if (limpio.length < field.minLength || limpio.length > field.maxLength) {
            const rango = field.minLength === field.maxLength
                ? String(field.minLength)
                : `${field.minLength}–${field.maxLength}`;
            return {
                ok: false,
                error: locale === 'en'
                    ? `${etiqueta} must be ${rango} characters.`
                    : `${etiqueta} debe tener ${rango} caracteres.`,
            };
        }
        values[field.key] = limpio;
    }

    if (spec.format === 'clabe' && !clabeValida(values.clabe)) {
        return {
            ok: false,
            error: locale === 'en'
                ? "That CLABE isn't valid. Check the digits — the control digit doesn't match."
                : 'La CLABE no es válida. Revisa que esté bien escrita; el dígito de control no coincide.',
        };
    }
    if (spec.format === 'iban' && !ibanValido(values.iban)) {
        return {
            ok: false,
            error: locale === 'en'
                ? "That IBAN isn't valid. Check the characters — the control digits don't match."
                : 'El IBAN no es válido. Revisa los caracteres; los dígitos de control no coinciden.',
        };
    }

    const principal = values.iban ?? values.clabe ?? values.account_number ?? '';
    return { ok: true, values, last4: principal.slice(-4) };
}

/**
 * Campos `external_account[...]` para la API de Stripe.
 *
 * Sintaxis PLANA a propósito: un objeto anidado se codificaría como
 * "[object Object]" al pasar por URLSearchParams.
 */
export function stripeExternalAccountFields(
    countryCode: string,
    currency: string,
    holderName: string,
    holderType: 'individual' | 'company',
    values: Record<string, string>,
): Record<string, string> {
    const spec = payoutSpecFor(countryCode);
    const base: Record<string, string> = {
        'external_account[object]': 'bank_account',
        'external_account[country]': String(countryCode).toUpperCase(),
        'external_account[currency]': String(currency).toLowerCase(),
        'external_account[account_holder_name]': holderName,
        'external_account[account_holder_type]': holderType,
    };

    if (spec.format === 'clabe') {
        // En México, Stripe recibe la CLABE COMPLETA como número de cuenta.
        base['external_account[account_number]'] = values.clabe;
        return base;
    }
    if (spec.format === 'iban') {
        base['external_account[account_number]'] = values.iban;
        return base;
    }
    if (spec.format === 'ca_transit') {
        // Canadá manda transit e institution juntos en `routing_number`.
        base['external_account[routing_number]'] = `${values.transit_number}-${values.institution_number}`;
        base['external_account[account_number]'] = values.account_number;
        return base;
    }
    if (values.routing_number) base['external_account[routing_number]'] = values.routing_number;
    base['external_account[account_number]'] = values.account_number;
    return base;
}
