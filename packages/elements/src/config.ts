// Configuración global de @flouviahq/elements — análogo a `loadStripe`/Stripe.js:
// un singleton de módulo para fijar defaults (baseUrl de self-host/staging,
// appearance) sin necesidad de un <CordProvider> (Vue, Web Component, vanilla).
//
// Precedencia de resolución en TODO el SDK: props del componente > valor del
// <CordProvider> (si existe) > configureCord() > default embebido.
import type { CordAppearance } from './types.js';

export interface CordGlobalConfig {
    /** Origen de Cord. Default: https://cordhq.app (self-host/staging). */
    baseUrl?: string;
    /** Appearance aplicada cuando ni el componente ni el Provider la traen. */
    appearance?: CordAppearance;
    /** Llave publishable por default (ver CordProviderProps para el uso normal). */
    publishableKey?: string;
}

const DEFAULT_ORIGIN = 'https://cordhq.app';

let globalConfig: CordGlobalConfig = {};

/** Fija defaults globales del SDK. Llamar una vez, antes de montar cualquier componente. */
export function configureCord(config: CordGlobalConfig): void {
    globalConfig = { ...globalConfig, ...config };
}

/** Config actual (uso interno del SDK; no se garantiza estable entre versiones). */
export function getCordConfig(): CordGlobalConfig {
    return globalConfig;
}

/** Origen de Cord sin trailing slash, aplicando la precedencia estándar del SDK. */
export function resolveOrigin(explicit?: string): string {
    return (explicit || globalConfig.baseUrl || DEFAULT_ORIGIN).replace(/\/$/, '');
}

/** Base de la API pública v1 (origen + /api/v1), o la explícita si se provee completa. */
export function resolveApiBase(explicit?: string): string {
    if (explicit) return explicit.replace(/\/$/, '');
    return `${resolveOrigin()}/api/v1`;
}
