// Qué le falta a una cuenta de Connect, leído de la ÚNICA fuente autoritativa:
// el `requirements` que devuelve el propio Stripe.
//
// El wizard preguntaba qué pedir con ramas por país (`if (PAIS === 'US')`,
// `if (esMx)`) y con campos obligatorios fijos. Dos consecuencias reales:
//
//   · `person.id_number` se exigía en los OCHO países. Verificado contra la API
//     de requisitos de Stripe: España, Alemania y Reino Unido NO lo piden, y el
//     representante europeo no tiene ese número — el alta era imposible de
//     terminar en media Europa.
//   · `ssn_last_4` se pedía con `if (PAIS === 'US')`, que hoy acierta pero es
//     una copia local de una regla que Stripe puede cambiar sin avisar.
//
// La regla correcta no es "qué país es" sino "qué pidió Stripe para ESTA cuenta,
// con ESTA capability y ESTE tipo de entidad". Stripe ya lo dice en cada
// respuesta; sólo había que leerlo. Cuando Stripe cambie sus reglas —y lo hace,
// el programa `eu-2025` añadió `nationality` en España— este archivo se adapta
// solo, sin tocar una lista.
//
// Lo que SÍ es estático vive en otro lado a propósito: cómo se LLAMA cada campo
// en cada idioma y país (stripe-catalogs.ts), porque eso la API no lo devuelve.

/** Urgencia de un requisito, de la más apremiante a la más lejana. */
export type RequirementUrgency =
    | 'past_due'
    | 'currently_due'
    | 'pending_verification'
    | 'eventually_due'
    | 'future';

/** Orden de severidad. `indexOf` sobre este arreglo compara dos urgencias. */
export const URGENCY_ORDER: readonly RequirementUrgency[] = [
    'past_due', 'currently_due', 'pending_verification', 'eventually_due', 'future',
] as const;

/** A quién le falta el dato. `role` es una persona que todavía NO existe. */
export type RequirementScope =
    | { kind: 'account' }
    | { kind: 'company' }
    | { kind: 'individual' }
    | { kind: 'person'; personId: string }
    | { kind: 'role'; role: 'representative' | 'owner' | 'director' | 'executive' }
    | { kind: 'interview'; id: string };

export interface ParsedRequirement {
    /** El string exacto de Stripe, intacto. Es lo que se audita y se registra. */
    raw: string;
    scope: RequirementScope;
    /** El campo sin su prefijo de scope: `dob.day`, `id_number`, `verification.document`. */
    field: string;
    urgency: RequirementUrgency;
}

// Prefijos de "persona que falta crear". Stripe los usa cuando la cuenta todavía
// no tiene una Person de ese rol; en cuanto existe, el requisito pasa a
// `person_XXXX.<campo>`. `translateRequirement()` no conocía ninguno de estos, así
// que TODO lo que ve una cuenta recién creada caía al fallback genérico.
const ROLE_PREFIXES: Record<string, 'representative' | 'owner' | 'director' | 'executive'> = {
    representative: 'representative',
    owners: 'owner',
    directors: 'director',
    executives: 'executive',
};

/**
 * Parte un requisito de Stripe en (a quién le falta, qué le falta).
 *
 * `representative.id_number`      → role representative · id_number
 * `person_1KabcXYZ.dob.day`       → person 1KabcXYZ     · dob.day
 * `individual.verification.document` → individual       · verification.document
 * `company.address.line1`         → company             · address.line1
 * `external_account`              → account             · external_account
 */
export function parseRequirement(raw: string, urgency: RequirementUrgency): ParsedRequirement {
    const s = String(raw || '');
    const dot = s.indexOf('.');
    const head = dot === -1 ? s : s.slice(0, dot);
    const rest = dot === -1 ? '' : s.slice(dot + 1);

    if (head.startsWith('person_')) {
        return { raw: s, scope: { kind: 'person', personId: head }, field: rest, urgency };
    }
    if (head.startsWith('interv_')) {
        return { raw: s, scope: { kind: 'interview', id: head }, field: rest, urgency };
    }
    const role = ROLE_PREFIXES[head];
    if (role && rest) {
        return { raw: s, scope: { kind: 'role', role }, field: rest, urgency };
    }
    if (head === 'individual' && rest) {
        return { raw: s, scope: { kind: 'individual' }, field: rest, urgency };
    }
    if (head === 'company' && rest) {
        return { raw: s, scope: { kind: 'company' }, field: rest, urgency };
    }
    return { raw: s, scope: { kind: 'account' }, field: s, urgency };
}

/** Forma mínima de lo que devuelve Stripe; sólo lo que este módulo lee. */
interface RequirementsBag {
    past_due?: unknown;
    currently_due?: unknown;
    pending_verification?: unknown;
    eventually_due?: unknown;
}
interface AccountLike {
    requirements?: RequirementsBag | null;
    future_requirements?: RequirementsBag | null;
}

const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

/**
 * Aplana `requirements` y `future_requirements` de una cuenta (y, si se pasan,
 * los `requirements` de cada Person) en una lista con urgencia.
 *
 * Se deduplica por `raw` conservando la urgencia MÁS apremiante: un mismo campo
 * aparece a la vez en `currently_due` y en `eventually_due` con frecuencia, y
 * mostrarlo dos veces con dos urgencias distintas es peor que no mostrarlo.
 */
export function collectRequirements(account: AccountLike | null | undefined, persons: AccountLike[] = []): ParsedRequirement[] {
    const out = new Map<string, ParsedRequirement>();

    const absorb = (bag: RequirementsBag | null | undefined, future: boolean) => {
        if (!bag) return;
        const buckets: [RequirementUrgency, unknown][] = future
            ? [['future', bag.currently_due], ['future', bag.eventually_due], ['future', bag.past_due]]
            : [
                ['past_due', bag.past_due],
                ['currently_due', bag.currently_due],
                ['pending_verification', bag.pending_verification],
                ['eventually_due', bag.eventually_due],
            ];
        for (const [urgency, list] of buckets) {
            for (const raw of strings(list)) {
                const previo = out.get(raw);
                if (previo && URGENCY_ORDER.indexOf(previo.urgency) <= URGENCY_ORDER.indexOf(urgency)) continue;
                out.set(raw, parseRequirement(raw, urgency));
            }
        }
    };

    absorb(account?.requirements, false);
    absorb(account?.future_requirements, true);
    for (const person of persons) absorb(person?.requirements, false);

    return [...out.values()];
}

/**
 * ¿Stripe está pidiendo este campo para ALGUNA persona de esta cuenta?
 *
 * Reemplaza a las ramas por país. `field` se compara contra el campo ya
 * despojado de su prefijo de scope, así que un solo llamado cubre
 * `representative.id_number`, `owners.id_number` y `person_1K….id_number`.
 *
 * Por defecto sólo cuenta lo que se debe AHORA (`past_due` / `currently_due`):
 * pintar un campo obligatorio porque algún día podría pedirse es la regla 15 —
 * un formulario que exige un dato que nadie pidió.
 */
export function requiresField(
    account: AccountLike | null | undefined,
    field: string,
    opts: { persons?: AccountLike[]; includeEventual?: boolean } = {},
): boolean {
    const urgencias: RequirementUrgency[] = opts.includeEventual
        ? ['past_due', 'currently_due', 'eventually_due']
        : ['past_due', 'currently_due'];
    return collectRequirements(account, opts.persons ?? [])
        .some((r) => r.field === field && urgencias.includes(r.urgency));
}

/** Los roles de persona que Stripe pide y todavía no existen en la cuenta. */
export function missingPersonRoles(
    account: AccountLike | null | undefined,
): Set<'representative' | 'owner' | 'director' | 'executive'> {
    const out = new Set<'representative' | 'owner' | 'director' | 'executive'>();
    for (const r of collectRequirements(account)) {
        if (r.scope.kind === 'role' && (r.urgency === 'past_due' || r.urgency === 'currently_due')) {
            out.add(r.scope.role);
        }
    }
    return out;
}
