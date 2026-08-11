export class UnknownConnectFieldError extends Error {
    constructor(public readonly field: string) {
        super(`Campo no permitido: ${field}`);
    }
}

function stripeParam(path: string): string {
    const [root, ...rest] = path.split('.');
    return root + rest.map((part) => `[${part}]`).join('');
}

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
        if (value && typeof value === 'object') {
            if (Array.isArray(value)) throw new UnknownConnectFieldError(path);
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
    'individual.address.line1', 'individual.address.line2', 'individual.address.city',
    'individual.address.state', 'individual.address.postal_code', 'individual.address.country',
    'individual.dob.day', 'individual.dob.month', 'individual.dob.year',
] as const;

export const PERSON_CONNECT_FIELDS = [
    'first_name', 'last_name', 'email', 'phone', 'id_number', 'gender', 'maiden_name',
    'address.line1', 'address.line2', 'address.city', 'address.state', 'address.postal_code', 'address.country',
    'dob.day', 'dob.month', 'dob.year',
    'relationship.title', 'relationship.owner', 'relationship.representative',
    'relationship.director', 'relationship.executive', 'relationship.percent_ownership',
] as const;

/** Snapshot KYC mínimo para Ops/UI. Excluye cualquier campo no previsto por Cord. */
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
    return {
        disabled_reason: typeof source.disabled_reason === 'string' ? source.disabled_reason : null,
        currently_due: stringArray(source.currently_due),
        eventually_due: stringArray(source.eventually_due),
        past_due: stringArray(source.past_due),
        pending_verification: stringArray(source.pending_verification),
        errors,
    };
}
