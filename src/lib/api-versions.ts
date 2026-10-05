// Versionado de la API pública por header, al estilo de Stripe.
//
// Cada llave y cada endpoint de webhook queda FIJADO a la versión vigente al
// crearse; el header `Cord-Version` la sobrescribe por petición. Los handlers
// siempre producen la forma MÁS NUEVA; aquí se convierte hacia atrás, cambio por
// cambio, hasta la versión que pidió el cliente. Un cambio que rompe
// compatibilidad es una entrada nueva en VERSION_CHANGES, nunca un `if` en un
// handler.

/** De la más vieja a la más nueva. La primera es la forma de la API al fijar el versionado. */
export const API_VERSIONS = ['2026-10-01'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];
export const BASELINE_API_VERSION: ApiVersion = API_VERSIONS[0];
export const LATEST_API_VERSION: ApiVersion = API_VERSIONS[API_VERSIONS.length - 1];

export interface VersionChange {
    /** Versión que INTRODUJO el cambio. */
    version: string;
    description: { es: string; en: string };
    /** Convierte una respuesta de la forma nueva a la anterior. `route` es el path sin /api/v1. */
    downgradeResponse?: (route: string, body: any) => any;
    /** Convierte el `data` de un webhook de la forma nueva a la anterior. */
    downgradeWebhook?: (event: string, data: Record<string, unknown>) => Record<string, unknown>;
}

/** Del más nuevo al más viejo. */
export const VERSION_CHANGES: VersionChange[] = [];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isApiVersion(value: unknown): value is ApiVersion {
    return typeof value === 'string' && (API_VERSIONS as readonly string[]).includes(value);
}

export type VersionResolution = { ok: true; version: string } | { ok: false; error: string };

/** Header de la petición > versión fijada de la llave > versión base. */
export function resolveApiVersion(header: string | null, pinned: string | null | undefined, versions: readonly string[] = API_VERSIONS): VersionResolution {
    const requested = header?.trim();
    if (requested) {
        if (!DATE_RE.test(requested) || !versions.includes(requested)) {
            return { ok: false, error: `Cord-Version "${requested.slice(0, 20)}" no existe. Versiones disponibles: ${versions.join(', ')}.` };
        }
        return { ok: true, version: requested };
    }
    if (pinned && versions.includes(pinned)) return { ok: true, version: pinned };
    return { ok: true, version: versions[0] };
}

function changesAfter(version: string, changes: VersionChange[]): VersionChange[] {
    return changes.filter((c) => c.version > version);
}

export function downgradeResponse(route: string, body: unknown, version: string, changes: VersionChange[] = VERSION_CHANGES): unknown {
    let out = body;
    for (const change of changesAfter(version, changes)) {
        if (change.downgradeResponse) out = change.downgradeResponse(route, out);
    }
    return out;
}

export function downgradeWebhookData(event: string, data: Record<string, unknown>, version: string, changes: VersionChange[] = VERSION_CHANGES): Record<string, unknown> {
    let out = data;
    for (const change of changesAfter(version, changes)) {
        if (change.downgradeWebhook) out = change.downgradeWebhook(event, out);
    }
    return out;
}

/** ¿Hay transformaciones entre esta versión y la más nueva? */
export function needsDowngrade(version: string, changes: VersionChange[] = VERSION_CHANGES): boolean {
    return changesAfter(version, changes).length > 0;
}
