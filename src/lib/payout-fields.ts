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
//
// Qué formato tiene dígito de control verificable y cuál sólo se valida por
// estructura está detallado en el docblock de `validatePayout()`.

export type PayoutFormat = 'clabe' | 'iban' | 'us_aba' | 'gb_sort' | 'ca_transit' | 'au_bsb' | 'nz' | 'br_bank' | 'generic';

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
    // Australia y Nueva Zelanda se conservan porque el formato ya está resuelto,
    // aunque hoy NO están en el set de países ofrecidos (`SUPPORTED_COUNTRIES`).
    // Ninguna cuenta llega aquí mientras no se abran esos mercados.
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
    // Brasil NO usa IBAN — estaba en la lista de IBAN y ninguna cuenta brasileña
    // habría pasado el mod-97. El riel local es código de banco (3 dígitos) +
    // agência (4) + conta, que es exactamente lo que pide Stripe.
    BR: {
        format: 'br_bank', label: 'Conta bancária', labelEn: 'Bank account',
        fields: [
            { key: 'bank_code', label: 'Código do banco', labelEn: 'Bank code', kind: 'digits', minLength: 3, maxLength: 3, hint: '3 dígitos', hintEn: '3 digits' },
            { key: 'branch_code', label: 'Agência', labelEn: 'Branch code', kind: 'digits', minLength: 4, maxLength: 4, hint: '4 dígitos', hintEn: '4 digits' },
            { key: 'account_number', label: 'Conta com dígito', labelEn: 'Account number with check digit', kind: 'alnum', minLength: 4, maxLength: 15 },
        ],
    },
};

// Zona SEPA y demás territorios donde Stripe liquida por IBAN.
const IBAN_COUNTRIES = [
    'AD', 'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GI', 'GR',
    'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT',
    'RO', 'SE', 'SI', 'SK', 'SM', 'TR', 'AE', 'SA', 'IL',
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

/**
 * Dígito de control ABA (routing number de EE.UU.): pesos 3,7,1 repetidos
 * sobre los 9 dígitos, mod 10. El archivo llevaba desde su creación afirmando
 * que "los checksums se verifican aquí y no en Stripe" — cierto para CLABE e
 * IBAN, pero un routing number de EE.UU. cualquiera (999999999) pasaba sin
 * checarse. Es la misma matemática que clabeValida(), sobre 9 dígitos en vez
 * de 18 y sin dígito de control separado: la suma ponderada completa debe
 * dar múltiplo de 10.
 */
export function abaValido(routingNumber: string): boolean {
    if (!/^\d{9}$/.test(routingNumber)) return false;
    const pesos = [3, 7, 1];
    let suma = 0;
    for (let i = 0; i < 9; i++) suma += Number(routingNumber[i]) * pesos[i % 3];
    return suma % 10 === 0;
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

// Canadá y Nueva Zelanda: SIN checksum, a propósito.
//
// Ambos países tienen algoritmos de dígito verificador documentados, y la
// tentación era implementarlos aquí. No se hizo porque no se pudieron verificar
// contra la fuente primaria en el momento de escribir esto, y un checksum mal
// implementado es PEOR que ninguno: rechaza cuentas buenas con un mensaje que
// culpa al usuario de un error que no cometió. El proveedor valida del otro
// lado; lo que se pierde es el mensaje temprano, no la corrección.
//
// Nueva Zelanda además usa varios algoritmos (A, B, D, E…) seleccionados por el
// rango de la sucursal: elegir el equivocado rechaza una cuenta válida.
//
// Para activarlos: confirmar el algoritmo contra Payments Canada / Payments NZ,
// añadir vectores reales al check, y recién entonces enchufarlos abajo.

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
 * Los checksums se verifican AQUÍ y no en el proveedor: una CLABE mal tecleada
 * rebotaba con un error suyo que no le dice nada al vendedor, y el dinero
 * terminaba en el limbo hasta que alguien lo notara.
 *
 * Qué se verifica de verdad, y qué no — porque este comentario afirmaba durante
 * meses que "los checksums se verifican aquí" a secas, y eso sólo era cierto
 * para tres de los ocho formatos:
 *
 *   · CLABE (MX) ....... dígito de control, pesos 3,7,1
 *   · IBAN (SEPA) ...... mod-97 sobre el número reordenado (ISO 13616)
 *   · ABA (US) ......... dígito de control, pesos 3,7,1
 *   · CA, GB, AU, BR ... SIN checksum: el sort code británico y el
 *                        BSB australiano son identificadores de sucursal sin
 *                        dígito verificador; en Brasil el dígito de la conta
 *                        depende del banco; y el de Canadá no se pudo verificar
 *                        contra la fuente primaria (ver la nota de arriba).
 *                        Se valida longitud y formato, que es todo lo que se
 *                        puede afirmar con honestidad.
 *   · NZ ............... estructura; el algoritmo depende del rango de sucursal.
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
    if (spec.format === 'us_aba' && !abaValido(values.routing_number)) {
        return {
            ok: false,
            error: locale === 'en'
                ? "That routing number isn't valid. Check the digits — the ABA checksum doesn't match."
                : 'Ese routing number no es válido. Revisa los dígitos; el checksum ABA no coincide.',
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
    if (spec.format === 'br_bank') {
        // Brasil manda banco y agência juntos en `routing_number`, con guion.
        base['external_account[routing_number]'] = `${values.bank_code}-${values.branch_code}`;
        base['external_account[account_number]'] = values.account_number;
        return base;
    }
    if (values.routing_number) base['external_account[routing_number]'] = values.routing_number;
    base['external_account[account_number]'] = values.account_number;
    return base;
}
