// Filtros de las listas de Cord Ops. Un solo parser por lista, compartido por
// la página y por la exportación CSV: lo que el operador ve filtrado es
// exactamente lo que descarga. Todo valor sale de una lista cerrada; nada que
// llegue por la URL se interpola en SQL (viaja como parámetro).
import { PLAN_IDS } from './entitlements';
import { SUPPORTED_COUNTRIES } from './countries';
import { normalizeOpsSearch } from './ops-pagination';

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | '' =>
    (allowed as readonly string[]).includes(value || '') ? value as T : '';

export const ORG_SUBSCRIPTION_FILTERS = ['active', 'trialing', 'past_due', 'canceled', 'none'] as const;
export const ORG_CHARGES_FILTERS = ['on', 'off'] as const;
export const ORG_SORTS = ['recent', 'oldest', 'name'] as const;

export interface OrgFilters {
    q: string;
    plan: typeof PLAN_IDS[number] | '';
    country: string;
    subscription: typeof ORG_SUBSCRIPTION_FILTERS[number] | '';
    charges: typeof ORG_CHARGES_FILTERS[number] | '';
    sort: typeof ORG_SORTS[number];
}

export function parseOrgFilters(params: URLSearchParams): OrgFilters {
    return {
        q: normalizeOpsSearch(params.get('q')),
        plan: pick(params.get('plan'), PLAN_IDS),
        country: pick(params.get('country'), SUPPORTED_COUNTRIES as readonly string[]),
        subscription: pick(params.get('subscription'), ORG_SUBSCRIPTION_FILTERS),
        charges: pick(params.get('charges'), ORG_CHARGES_FILTERS),
        sort: pick(params.get('sort'), ORG_SORTS) || 'recent',
    };
}

export const USER_STATE_FILTERS = ['active', 'suspended', 'locked', 'unverified'] as const;
export const USER_MFA_FILTERS = ['with', 'without'] as const;
export const USER_SORTS = ['recent', 'oldest', 'email'] as const;

export interface UserFilters {
    q: string;
    state: typeof USER_STATE_FILTERS[number] | '';
    mfa: typeof USER_MFA_FILTERS[number] | '';
    sort: typeof USER_SORTS[number];
}

export function parseUserFilters(params: URLSearchParams): UserFilters {
    return {
        q: normalizeOpsSearch(params.get('q')),
        state: pick(params.get('state'), USER_STATE_FILTERS),
        mfa: pick(params.get('mfa'), USER_MFA_FILTERS),
        sort: pick(params.get('sort'), USER_SORTS) || 'recent',
    };
}

/** Query string con solo los filtros activos (sin página), para enlaces y exportación. */
export function filtersQuery(filters: Record<string, string>, defaults: Record<string, string> = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value && value !== defaults[key]) params.set(key, value);
    }
    return params.toString();
}

export const hasActiveFilters = (filters: Record<string, string>, defaults: Record<string, string> = {}) =>
    Object.entries(filters).some(([key, value]) => key !== 'q' && key !== 'sort' && value && value !== defaults[key]);
