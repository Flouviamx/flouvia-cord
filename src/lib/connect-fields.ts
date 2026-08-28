export class UnknownConnectFieldError extends Error {
    // Campo declarado a mano en vez de como parameter property (`constructor(public
    // readonly field)`): esa forma es sintaxis de TypeScript que `node
    // --experimental-strip-types` no sabe borrar, y este repo corre seis scripts de
    // seguridad con esa bandera. Mientras estuvo así, NINGÚN script podía importar
    // este módulo — el contrato más sensible del alta de cobros era justo el único
    // que no se podía verificar automáticamente.
    readonly field: string;
    constructor(field: string) {
        super(`Campo no permitido: ${field}`);
        this.field = field;
    }
}

function stripeParam(path: string): string {
    const [root, ...rest] = path.split('.');
    return root + rest.map((part) => `[${part}]`).join('');
}

/**
 * Rutas cuyo valor es una LISTA de strings en la API de Stripe.
 *
 * El rechazo de arrays sigue siendo el default de `flattenConnectFields()` —
 * un array donde se espera un escalar suele ser un intento de inyectar
 * parámetros. Pero `documents.*.files` y `full_name_aliases` SÍ son arrays en
 * Stripe, así que rechazarlos todos hacía literalmente inexpresable el
 * documento constitutivo de una empresa: el requisito aparecía en
 * `currently_due` y no había forma de satisfacerlo desde Cord.
 *
 * Sólo entra aquí una ruta que la API declara como array. La lista es la
 * excepción, no la puerta.
 */
const ARRAY_LEAF_PATHS = new Set<string>([
    'documents.company_authorization.files',
    'documents.company_license.files',
    'documents.company_memorandum_of_association.files',
    'documents.company_ministerial_decree.files',
    'documents.company_registration_verification.files',
    'documents.company_tax_id_verification.files',
    'documents.proof_of_address.files',
    'documents.proof_of_registration.files',
    'documents.proof_of_ultimate_beneficial_ownership.files',
    'documents.bank_account_ownership_verification.files',
    'documents.passport.files',
    'documents.visa.files',
    'full_name_aliases',
]);

/** Tope de elementos por array. Stripe no acepta listas largas y un array sin
 *  tope es una forma barata de inflar el form-encoded. */
const MAX_ARRAY_ITEMS = 10;

export function flattenConnectFields(
    data: unknown,
    allowedLeafPaths: readonly string[],
    ignoredRootPaths: readonly string[] = [],
): Record<string, string> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new UnknownConnectFieldError('payload');
    }
    const allowed = new Set(allowedLeafPaths);
    const ignored = new Set(ignoredRootPaths);
    const fields: Record<string, string> = {};

    const walk = (value: unknown, path: string) => {
        if (ignored.has(path)) return;
        const key = path.split('.').at(-1) || '';
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
            throw new UnknownConnectFieldError(path);
        }
        if (Array.isArray(value)) {
            // Un array sólo pasa si la ruta lo declara Y está en el allowlist.
            // Las dos condiciones: estar declarada como array no la vuelve
            // permitida, y estar permitida no la vuelve un array.
            if (!ARRAY_LEAF_PATHS.has(path) || !allowed.has(path)) {
                throw new UnknownConnectFieldError(path);
            }
            if (value.length > MAX_ARRAY_ITEMS) throw new UnknownConnectFieldError(path);
            value.forEach((item, index) => {
                if (item === null || item === undefined || item === '') return;
                if (typeof item === 'object') throw new UnknownConnectFieldError(`${path}[${index}]`);
                fields[`${stripeParam(path)}[${index}]`] = String(item);
            });
            return;
        }
        if (value && typeof value === 'object') {
            const isPrefix = allowed.has(path) || [...allowed].some((candidate) => candidate.startsWith(`${path}.`));
            if (path && !isPrefix) throw new UnknownConnectFieldError(path);
            for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
                walk(childValue, path ? `${path}.${childKey}` : childKey);
            }
            return;
        }
        if (!allowed.has(path)) throw new UnknownConnectFieldError(path);
        if (value !== null && value !== undefined && value !== '') fields[stripeParam(path)] = String(value);
    };

    for (const [key, value] of Object.entries(data as Record<string, unknown>)) walk(value, key);
    return fields;
}

export const ACCOUNT_CONNECT_FIELDS = [
    'business_profile.mcc', 'business_profile.url', 'business_profile.product_description',
    'business_profile.support_phone', 'business_profile.support_email', 'business_profile.support_url',
    'business_profile.name',
    'company.name', 'company.tax_id', 'company.phone', 'company.structure',
    'company.executives_provided', 'company.owners_provided', 'company.directors_provided',
    'company.address.line1', 'company.address.line2', 'company.address.city',
    'company.address.state', 'company.address.postal_code', 'company.address.country',
    'individual.first_name', 'individual.last_name', 'individual.email', 'individual.phone',
    'individual.id_number', 'individual.gender', 'individual.maiden_name',
    // `ssn_last_4`: Stripe US Custom lo exige casi siempre además de `id_number`
    // (que ahí se usa para el SSN completo o el ITIN). `political_exposure`:
    // otro requisito que Stripe puede pedir en el KYC de EE.UU. Sin ambos en
    // el allowlist, `flattenConnectFields()` los rechazaba como campo
    // desconocido — era IMPOSIBLE completar el KYC de una cuenta individual
    // en Estados Unidos.
    'individual.ssn_last_4', 'individual.political_exposure',
    'individual.address.line1', 'individual.address.line2', 'individual.address.city',
    'individual.address.state', 'individual.address.postal_code', 'individual.address.country',
    'individual.dob.day', 'individual.dob.month', 'individual.dob.year',
    // Identidad de la persona física en la UE: el programa `eu-2025` de Stripe
    // añadió `nationality` como requisito real en España. No es un campo
    // hipotético — sin él en el allowlist, `flattenConnectFields()` lo rechaza
    // como campo desconocido y el requisito queda imposible de satisfacer.
    'individual.nationality', 'individual.id_number_secondary',
    'individual.full_name_aliases',
    // Identidad registral de la empresa fuera de México: número de registro
    // mercantil y NIF-IVA. En España y Alemania son datos distintos del
    // `tax_id`, y Stripe los pide por separado.
    'company.registration_number', 'company.vat_id', 'company.tax_id_registrar',
    'company.name_kana', 'company.name_kanji',
    // ── Declaraciones legales ───────────────────────────────────────────────
    // Mismo contrato que `tos_acceptance`: el CLIENTE manda un booleano y el
    // SERVIDOR pone `date`, `ip` y `user_agent`. Estas rutas viven en el
    // allowlist para que el endpoint pueda escribirlas, pero el flatten del
    // body del cliente las ignora vía `ignoredRootPaths` — una fecha o una IP
    // que llegue del navegador no es evidencia de nada.
    'company.ownership_declaration.date', 'company.ownership_declaration.ip',
    'company.ownership_declaration.user_agent',
    'company.directorship_declaration.date', 'company.directorship_declaration.ip',
    'company.directorship_declaration.user_agent',
    'company.representative_declaration.date', 'company.representative_declaration.ip',
    'company.representative_declaration.user_agent',
    // Enum cerrado de Stripe; se valida en el endpoint contra los dos valores.
    'company.ownership_exemption_reason',
    // Requisito real en Estados Unidos que el alta nunca capturaba: sin él la
    // cuenta se queda con `settings.payments.statement_descriptor` en
    // `currently_due` para siempre.
    'settings.payments.statement_descriptor',
    'settings.payments.statement_descriptor_kana',
    'settings.payments.statement_descriptor_kanji',
    // Documentos a nivel cuenta. Son ARRAYS de file ids (ver ARRAY_LEAF_PATHS):
    // es la ruta alternativa que Stripe ofrece en ES/DE cuando el documento
    // constitutivo no basta.
    'documents.company_authorization.files', 'documents.company_license.files',
    'documents.company_memorandum_of_association.files',
    'documents.company_ministerial_decree.files',
    'documents.company_registration_verification.files',
    'documents.company_tax_id_verification.files',
    'documents.proof_of_address.files', 'documents.proof_of_registration.files',
    'documents.proof_of_ultimate_beneficial_ownership.files',
    'documents.bank_account_ownership_verification.files',
] as const;

export const PERSON_CONNECT_FIELDS = [
    'first_name', 'last_name', 'email', 'phone', 'id_number', 'gender', 'maiden_name',
    'ssn_last_4', 'political_exposure',
    'address.line1', 'address.line2', 'address.city', 'address.state', 'address.postal_code', 'address.country',
    'dob.day', 'dob.month', 'dob.year',
    'relationship.title', 'relationship.owner', 'relationship.representative',
    'relationship.director', 'relationship.executive', 'relationship.percent_ownership',
    // Roles que Stripe pide en algunas jurisdicciones y que no existían aquí:
    // sin ellos, una persona que la ley local exige declarar como tutor legal o
    // como autorizador no cabía en el modelo.
    'relationship.legal_guardian', 'relationship.authorizer',
    // `nationality` es requisito real en España bajo el programa `eu-2025`.
    'nationality', 'id_number_secondary', 'full_name_aliases',
    // Documentos por persona (arrays de file ids).
    'documents.company_authorization.files', 'documents.passport.files',
    'documents.visa.files',
] as const;

/**
 * Snapshot KYC mínimo para Ops/UI. Excluye cualquier campo no previsto por Cord.
 *
 * Conserva `current_deadline` y `alternatives`, que antes se descartaban:
 *   · `getConnectHealth()` (stripe-cobros.ts) lee el deadline de aquí, así que
 *     el widget de salud nunca podía mostrar la fecha límite real — la cuenta
 *     avisaba "faltan datos" sin decir para cuándo.
 *   · `alternatives` es cómo Stripe dice "esto se resuelve de dos formas"
 *     (el caso real de ES/DE con `proof_of_registration`). Sin él, la UI sólo
 *     puede ofrecer una de las dos rutas y la otra queda invisible.
 */
export function sanitizeStripeRequirements(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const source = input as Record<string, unknown>;
    const stringArray = (value: unknown) => Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string').slice(0, 100)
        : [];
    const errors = Array.isArray(source.errors)
        ? source.errors.slice(0, 50).map((error) => {
            const item = error && typeof error === 'object' ? error as Record<string, unknown> : {};
            return {
                requirement: typeof item.requirement === 'string' ? item.requirement : null,
                code: typeof item.code === 'string' ? item.code : null,
                reason: typeof item.reason === 'string' ? item.reason.slice(0, 500) : null,
            };
        })
        : [];
    const alternatives = Array.isArray(source.alternatives)
        ? source.alternatives.slice(0, 20).map((alt) => {
            const item = alt && typeof alt === 'object' ? alt as Record<string, unknown> : {};
            return {
                original_fields_due: stringArray(item.original_fields_due),
                alternative_fields_due: stringArray(item.alternative_fields_due),
            };
        })
        : [];
    return {
        disabled_reason: typeof source.disabled_reason === 'string' ? source.disabled_reason : null,
        current_deadline: typeof source.current_deadline === 'number' ? source.current_deadline : null,
        currently_due: stringArray(source.currently_due),
        eventually_due: stringArray(source.eventually_due),
        past_due: stringArray(source.past_due),
        pending_verification: stringArray(source.pending_verification),
        alternatives,
        errors,
    };
}

/**
 * Lo mismo para `future_requirements`, que Cord nunca leía.
 *
 * Es el aviso anticipado de Stripe: "a partir de esta fecha voy a necesitar
 * estos datos". Sin leerlo, una cuenta que va a quedar deshabilitada en dos
 * semanas no da ninguna señal hasta el día que deja de cobrar.
 */
export function sanitizeFutureRequirements(input: unknown): Record<string, unknown> | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const snapshot = sanitizeStripeRequirements(input);
    const vacio = (['currently_due', 'past_due', 'eventually_due'] as const)
        .every((k) => (snapshot[k] as string[]).length === 0);
    return vacio ? null : snapshot;
}
