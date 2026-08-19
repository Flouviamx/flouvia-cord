// src/lib/context.ts
// Contexto por-request (AsyncLocalStorage). El middleware resuelve el
// userId de la sesión y lo guarda aquí, de modo que cualquier query (db.ts) pueda
// leerlo SIN tener que recibir el request explícitamente en cada función.
//
// Es seguro en el modelo serverless de Vercel (Node/Fluid): AsyncLocalStorage
// aísla el store por cadena async, incluso con instancias reutilizadas entre
// requests concurrentes.

import { AsyncLocalStorage } from 'node:async_hooks';

interface ReqCtx {
    userId: string | null;
    // Hash de la sesión validada. Nunca contiene el token crudo de la cookie.
    sessionId?: string | null;
    // Override de tenancy: cuando una request entra autenticada por API KEY
    // (máquina-a-máquina, sin sesión), guardamos aquí el org_id resuelto
    // desde la llave para que getActiveOrgId() lo use directamente.
    orgId?: string | null;
    // Org ACTIVA seleccionada por el usuario en el dashboard.
    activeOrgId?: string | null;
    // Memo por-request del org_id ya resuelto por getActiveOrgId(). Se llena la
    // PRIMERA vez que se resuelve y se reutiliza el resto del request para evitar
    // ~8-9 round-trips redundantes a Neon en un solo render de página. Es mutable
    // a propósito: el store de AsyncLocalStorage está aislado por request.
    resolvedOrgId?: string;
    // Entorno de PRUEBA (cookie cord_test_mode, leída en el middleware). Cuando
    // está activo, getActiveOrgId() resuelve la org SANDBOX espejo (orgs.sandbox_of)
    // en vez de la real — datos de prueba 100% aislados, tipo Stripe test mode.
    testMode?: boolean;
    // Idioma resuelto para este request (app interna /app/**, /q/[token] y
    // correos transaccionales). Se detecta del header Accept-Language del
    // navegador — sin toggle manual, ver docs/app-rutas.md → i18n de la app.
    locale?: "es" | "en";
    // Divisa de PRESENTACIÓN de este request (ISO 4217). La resuelve el
    // middleware para /app y las APIs internas desde orgs.moneda, y el link
    // público desde la divisa de la propia cotización — el cliente debe leer
    // los montos en la divisa en que se le vendió, no en la del vendedor.
    // money()/moneyFull() (lib/fmt.ts) la leen de aquí en vez de asumir MXN.
    currency?: string;
    // Zona horaria de PRESENTACIÓN de este request (IANA). La resuelve el mismo
    // camino que `currency`, desde orgs.zona_horaria.
    //
    // La columna existía desde hace tiempo y NINGÚN formateador de fecha la
    // pasaba a Intl: todas las fechas se renderizaban en la zona del servidor,
    // así que un negocio en Tokio veía sus cotizaciones fechadas un día antes.
    timeZone?: string;
    // Carril de SISTEMA (crons cross-org, ej. el sweeper de webhooks). Lo marca
    // el propio cron route DESPUÉS de validar CRON_SECRET, envolviendo su
    // handler en reqContext.run({..., cronScope:true}, ...). withSystemTx()
    // (db.ts) exige esto antes de setear app.scope='system' — así una ruta con
    // sesión de usuario normal nunca puede tocar ese carril por accidente.
    cronScope?: boolean;
}

export const reqContext = new AsyncLocalStorage<ReqCtx>();

/** userId de la sesión actual, o null si no hay sesión. */
export function currentUserId(): string | null {
    return reqContext.getStore()?.userId ?? null;
}

/** Id hash de la sesión web actual, o null en API keys/crons. */
export function currentSessionId(): string | null {
    return reqContext.getStore()?.sessionId ?? null;
}

/** org_id inyectado por auth de API key (carril máquina-a-máquina), o null. */
export function currentOrgIdOverride(): string | null {
    return reqContext.getStore()?.orgId ?? null;
}

/** Org activa seleccionada de la sesión, o null. */
export function currentActiveOrgId(): string | null {
    return reqContext.getStore()?.activeOrgId ?? null;
}

/** org_id ya resuelto y memoizado para este request, o null si aún no. */
export function memoizedOrgId(): string | null {
    return reqContext.getStore()?.resolvedOrgId ?? null;
}

/** ¿Este request viene en modo de PRUEBA (cookie cord_test_mode)? */
export function isTestModeRequest(): boolean {
    return reqContext.getStore()?.testMode === true;
}

/** Idioma resuelto para este request ("es"|"en"), default "es" fuera del middleware (crons/scripts). */
export function currentLocale(): "es" | "en" {
    return reqContext.getStore()?.locale ?? "es";
}

/** Divisa de presentación del request; MXN fuera del middleware (crons/scripts). */
export function currentCurrency(): string {
    return reqContext.getStore()?.currency ?? "MXN";
}

/**
 * Fija el idioma del request desde la preferencia de la ORGANIZACIÓN
 * (`orgs.idioma`, derivada del país al crear la cuenta). Manda sobre el
 * Accept-Language del navegador: la app de un negocio en Estados Unidos se ve
 * en inglés aunque el vendedor tenga el navegador en español, y la de uno en
 * México en español aunque viaje con la laptop en inglés.
 */
export function setRequestLocale(idioma: string | null | undefined): void {
    const store = reqContext.getStore();
    if (!store) return;
    const value = String(idioma ?? '').trim().toLowerCase();
    if (!value) return;
    store.locale = value.startsWith('en') ? 'en' : 'es';
}

/**
 * Fija la divisa de presentación del request. Idempotente y de última palabra:
 * el link público la sobrescribe con la divisa de la cotización después de que
 * el middleware puso la de la organización.
 */
export function setRequestCurrency(currency: string | null | undefined): void {
    const store = reqContext.getStore();
    if (!store) return;
    const code = String(currency ?? '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) store.currency = code;
}

/**
 * Zona horaria de presentación del request. `undefined` = usar la del sistema,
 * que es lo correcto en scripts y crons sin organización a la vista.
 */
export function currentTimeZone(): string | undefined {
    return reqContext.getStore()?.timeZone;
}

/**
 * Fija la zona horaria del request. Se valida contra ICU: una zona inválida
 * guardada en la base no debe tirar cada `Intl.DateTimeFormat` de la página.
 */
export function setRequestTimeZone(zone: string | null | undefined): void {
    const store = reqContext.getStore();
    if (!store) return;
    const tz = String(zone ?? '').trim();
    if (!tz) return;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        store.timeZone = tz;
    } catch { /* zona inválida: se conserva la del sistema */ }
}

/** ¿Este request corre en el carril de SISTEMA de un cron (ver withSystemTx)? */
export function isCronScope(): boolean {
    return reqContext.getStore()?.cronScope === true;
}

/** Guarda el org_id resuelto en el store del request para reutilizarlo. */
export function memoizeOrgId(orgId: string): void {
    const store = reqContext.getStore();
    if (store) store.resolvedOrgId = orgId;
}
