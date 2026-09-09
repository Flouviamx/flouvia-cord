import { sql, withSystemTx } from './db';
import { stripe } from './billing';
import { log } from './log';

export const HEALTH_SERVICES = ['database', 'stripe', 'public_link'] as const;
export type HealthService = (typeof HEALTH_SERVICES)[number];

export const HEALTH_WINDOW_DAYS = 90;
// Vercel Hobby ejecuta crons como máximo una vez al día y puede retrasarlos
// dentro de la hora elegida. Una muestra deja de ser vigente si se pierde la
// siguiente ejecución diaria más un margen de una hora.
export const HEALTH_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8_000;

export interface HealthProbeResult {
    service: HealthService;
    ok: boolean;
    latencyMs: number;
    checkedAt: string;
}

interface InternalProbeResult extends HealthProbeResult {
    errorCode: string | null;
}

export interface HealthServiceSnapshot {
    service: HealthService;
    ok: boolean;
    stale: boolean;
    latencyMs: number;
    checkedAt: string;
    checks: number;
    successfulChecks: number;
    successPct: number;
}

export interface HealthDaySnapshot {
    service: HealthService;
    day: string;
    checks: number;
    successfulChecks: number;
    successPct: number;
}

export interface StatusIncident {
    id: string;
    status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
    severity: 'minor' | 'major' | 'critical';
    titleEs: string;
    titleEn: string;
    summaryEs: string;
    summaryEn: string;
    startedAt: string;
    resolvedAt: string | null;
    updatedAt: string;
}

export interface PublicStatusSnapshot {
    state: 'operational' | 'degraded' | 'outage' | 'unknown';
    services: HealthServiceSnapshot[];
    history: HealthDaySnapshot[];
    incidents: StatusIncident[];
    windowStart: string | null;
    windowEnd: string | null;
}

export interface HealthProbeDependencies {
    database: () => Promise<void>;
    stripe: () => Promise<void>;
    publicLink: () => Promise<void>;
    now?: () => Date;
}

function errorCode(error: unknown): string {
    if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
    if (error instanceof Error && /timeout/i.test(error.message)) return 'timeout';
    return 'check_failed';
}

async function withTimeout(task: Promise<void>, timeoutMs: number): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('health probe timeout')), timeoutMs);
    });
    try {
        await Promise.race([task, timeoutPromise]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function measure(
    service: HealthService,
    check: () => Promise<void>,
    checkedAt: string,
): Promise<InternalProbeResult> {
    const started = performance.now();
    try {
        await withTimeout(check(), PROBE_TIMEOUT_MS);
        return {
            service,
            ok: true,
            latencyMs: Math.max(0, Math.round(performance.now() - started)),
            checkedAt,
            errorCode: null,
        };
    } catch (error) {
        return {
            service,
            ok: false,
            latencyMs: Math.max(0, Math.round(performance.now() - started)),
            checkedAt,
            errorCode: errorCode(error),
        };
    }
}

function siteOrigin(): string {
    const configured = import.meta.env.SITE
        || process.env.SITE
        || import.meta.env.PUBLIC_SITE_URL
        || process.env.PUBLIC_SITE_URL
        || 'https://cordhq.app';
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('SITE debe usar HTTPS fuera de desarrollo local');
    }
    return url.origin;
}

export function defaultHealthProbeDependencies(): HealthProbeDependencies {
    return {
        database: async () => {
            const [rows] = await withSystemTx(sql`select 1 as ok`);
            if (Number(rows[0]?.ok) !== 1) throw new Error('database_unexpected_response');
        },
        stripe: async () => {
            const balance = await stripe('/v1/balance', undefined, 'GET');
            if (!balance || balance.object !== 'balance') throw new Error('stripe_unexpected_response');
        },
        publicLink: async () => {
            const response = await fetch(new URL('/q/demo', siteOrigin()), {
                method: 'GET',
                cache: 'no-store',
                redirect: 'error',
                headers: { 'User-Agent': 'Cord-Health/1.0' },
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
            });
            const contentType = response.headers.get('content-type') || '';
            if (!response.ok || !contentType.includes('text/html')) {
                throw new Error('public_link_unexpected_response');
            }
            const html = await response.text();
            if (!html.includes('class="qp-main"') || !html.includes('COT-0004')) {
                throw new Error('public_link_render_incomplete');
            }
        },
    };
}

export async function probePlatformHealth(
    dependencies: HealthProbeDependencies = defaultHealthProbeDependencies(),
): Promise<InternalProbeResult[]> {
    const checkedAt = (dependencies.now?.() ?? new Date()).toISOString();
    return Promise.all([
        measure('database', dependencies.database, checkedAt),
        measure('stripe', dependencies.stripe, checkedAt),
        measure('public_link', dependencies.publicLink, checkedAt),
    ]);
}

export async function persistHealthResults(results: InternalProbeResult[]): Promise<void> {
    if (results.length !== HEALTH_SERVICES.length) {
        throw new Error('health probe incompleta; no se persiste una muestra parcial');
    }
    await withSystemTx(...results.map((result) => sql`
        insert into health_checks (service, ok, latency_ms, checked_at)
        values (${result.service}, ${result.ok}, ${result.latencyMs}, ${result.checkedAt})
    `));
}

export function publicHealthResults(results: InternalProbeResult[]): HealthProbeResult[] {
    return results.map(({ errorCode: _errorCode, ...result }) => result);
}

export function logFailedHealthResults(results: InternalProbeResult[]): void {
    for (const result of results) {
        if (!result.ok) {
            log.warn('Sonda de disponibilidad falló', {
                route: 'platform-health',
                service: result.service,
                errorCode: result.errorCode,
                latencyMs: result.latencyMs,
            });
        }
    }
}

export function derivePlatformState(
    services: Pick<HealthServiceSnapshot, 'ok' | 'stale'>[],
    expectedServices = HEALTH_SERVICES.length,
): PublicStatusSnapshot['state'] {
    if (services.length !== expectedServices || services.some((service) => service.stale)) return 'unknown';
    const failing = services.filter((service) => !service.ok).length;
    if (failing === 0) return 'operational';
    if (failing === services.length) return 'outage';
    return 'degraded';
}

function numeric(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string {
    return new Date(String(value)).toISOString();
}

export async function getPublicStatusSnapshot(now = new Date()): Promise<PublicStatusSnapshot> {
    const since = new Date(now.getTime() - HEALTH_WINDOW_DAYS * 86_400_000).toISOString();
    const [latest, stats, history, incidents] = await Promise.all([
        sql`
            select distinct on (service) service, ok, latency_ms, checked_at
            from health_checks
            where checked_at >= ${since}
            order by service, checked_at desc`,
        sql`
            select service,
                   count(*)::int as checks,
                   count(*) filter (where ok)::int as successful_checks,
                   min(checked_at) as window_start,
                   max(checked_at) as window_end
            from health_checks
            where checked_at >= ${since}
            group by service`,
        sql`
            select service,
                   to_char(date_trunc('day', checked_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
                   count(*)::int as checks,
                   count(*) filter (where ok)::int as successful_checks
            from health_checks
            where checked_at >= ${since}
            group by service, 2
            order by 2, service`,
        sql`
            select id, status, severity, title_es, title_en, summary_es, summary_en,
                   started_at, resolved_at, updated_at
            from status_incidents
            where status <> 'resolved' or resolved_at >= ${since}
            order by (status = 'resolved'), started_at desc
            limit 20`,
    ]);

    const latestByService = new Map(latest.map((row) => [String(row.service), row]));
    const statsByService = new Map(stats.map((row) => [String(row.service), row]));
    const services = HEALTH_SERVICES.flatMap((service): HealthServiceSnapshot[] => {
        const current = latestByService.get(service);
        if (!current) return [];
        const aggregate = statsByService.get(service);
        const checks = numeric(aggregate?.checks);
        const successfulChecks = numeric(aggregate?.successful_checks);
        const checkedAt = iso(current.checked_at);
        return [{
            service,
            ok: Boolean(current.ok),
            stale: now.getTime() - new Date(checkedAt).getTime() > HEALTH_STALE_AFTER_MS,
            latencyMs: numeric(current.latency_ms),
            checkedAt,
            checks,
            successfulChecks,
            successPct: checks > 0 ? (successfulChecks / checks) * 100 : 0,
        }];
    });

    const state = derivePlatformState(services);

    const starts = stats.map((row) => row.window_start).filter(Boolean).map((value) => new Date(String(value)).getTime());
    const ends = stats.map((row) => row.window_end).filter(Boolean).map((value) => new Date(String(value)).getTime());

    return {
        state,
        services,
        history: history.map((row) => {
            const checks = numeric(row.checks);
            const successfulChecks = numeric(row.successful_checks);
            return {
                service: row.service as HealthService,
                day: String(row.day),
                checks,
                successfulChecks,
                successPct: checks > 0 ? (successfulChecks / checks) * 100 : 0,
            };
        }),
        incidents: incidents.map((row) => ({
            id: String(row.id),
            status: row.status as StatusIncident['status'],
            severity: row.severity as StatusIncident['severity'],
            titleEs: String(row.title_es),
            titleEn: String(row.title_en),
            summaryEs: String(row.summary_es),
            summaryEn: String(row.summary_en),
            startedAt: iso(row.started_at),
            resolvedAt: row.resolved_at ? iso(row.resolved_at) : null,
            updatedAt: iso(row.updated_at),
        })),
        windowStart: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
        windowEnd: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
    };
}
