// src/lib/log.ts
// Log estructurado del servidor. Un solo lugar decide FORMATO y NIVEL.
//
// Por qué existe: había 78 `console.*` sueltos por src/, sin nivel, sin org y
// sin ruta. En los logs de Vercel eso es una línea de texto que no se puede
// filtrar: no sabes de qué negocio vino ni qué endpoint la escribió, así que un
// error real se pierde entre avisos de arranque.
//
// Contrato:
//   log.warn('correo no enviado', { orgId, route: '/api/cron/recordatorios' })
//
// En producción emite UNA línea JSON por evento — Vercel la indexa y se puede
// filtrar por `level`, `orgId` o `route` desde el dashboard. En desarrollo
// imprime texto legible. El mensaje siempre va primero y el contexto después:
// nunca se interpola un dato dentro del texto, porque un mensaje interpolado no
// se puede agrupar (mil orgs = mil mensajes distintos para el mismo problema).
//
// Regla 14: esto es vocabulario OPERATIVO, nunca se le muestra al usuario. Lo
// que el dueño de un negocio ve es un estado ("esto todavía no está
// disponible"); el nombre del proveedor o de la variable vive aquí.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Contexto estructurado. `orgId` y `route` son los dos ejes de filtrado reales. */
export interface LogContext {
    orgId?: string | null;
    userId?: string | null;
    route?: string | null;
    /** Cualquier dato extra del evento. Se serializa tal cual, ya redactado. */
    [key: string]: unknown;
}

const env = (key: string): string | undefined =>
    (import.meta.env?.[key] as string | undefined) ?? process.env?.[key];

const isProd = env('NODE_ENV') === 'production' || !!env('VERCEL');

// LOG_LEVEL permite subir el detalle en un deployment concreto sin tocar código.
// Default: 'info' en producción (debug es ruido y cuesta dinero en ingest),
// 'debug' en local.
const threshold = LEVEL_ORDER[(env('LOG_LEVEL') as LogLevel) ?? (isProd ? 'info' : 'debug')] ?? 20;

// Claves cuyo VALOR nunca debe aterrizar en un log, aunque alguien las pase por
// descuido dentro del contexto. Los logs de Vercel los lee el equipo, pero
// también quedan retenidos: un secreto logueado es un secreto rotado.
const REDACT = /^(pass|password|secret|token|key|authorization|cookie|apikey|api_key|clabe|cvc|card)/i;

/** Recorta el contexto a algo serializable y sin secretos. */
function safeContext(ctx: LogContext): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx)) {
        if (v === undefined || v === null) continue;
        if (REDACT.test(k)) { out[k] = '[redactado]'; continue; }
        if (v instanceof Error) { out[k] = { name: v.name, message: v.message }; continue; }
        if (typeof v === 'object') {
            // Un objeto profundo no aporta y puede arrastrar un secreto anidado.
            try { out[k] = JSON.parse(JSON.stringify(v)); } catch { out[k] = '[no serializable]'; }
            continue;
        }
        out[k] = v;
    }
    return out;
}

/**
 * Un Error puede venir de cualquier lado (throw de string, objeto de un SDK).
 * Se normaliza para que `err.message` siempre exista en el log.
 */
function normalizeError(err: unknown): { message: string; name?: string; stack?: string } {
    if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack };
    if (typeof err === 'string') return { message: err };
    try { return { message: JSON.stringify(err) }; } catch { return { message: String(err) }; }
}

function emit(level: LogLevel, msg: string, ctx: LogContext = {}): void {
    if (LEVEL_ORDER[level] < threshold) return;

    const { err, ...rest } = ctx;
    const payload = safeContext(rest);
    if (err !== undefined) payload.err = normalizeError(err);

    // error/warn a stderr, el resto a stdout: así Vercel los separa y una alerta
    // por stderr no se dispara con un log informativo.
    const sink = level === 'error' || level === 'warn' ? console.error : console.log;

    if (isProd) {
        sink(JSON.stringify({ level, msg, ...payload }));
        return;
    }

    const tag = `[${level}]`;
    const extra = Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : '';
    sink(`${tag} ${msg}${extra}`);
}

export const log = {
    debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
    info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
    warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
    /** `log.error('falló el timbrado', { orgId, err })` — `err` se normaliza solo. */
    error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),

    /**
     * Logger con contexto fijo, para no repetir orgId/route en cada llamada:
     *   const l = log.with({ route: '/api/cron/recordatorios' });
     *   l.warn('sin email', { orgId });
     */
    with(base: LogContext) {
        const bind = (level: LogLevel) => (msg: string, ctx?: LogContext) =>
            emit(level, msg, { ...base, ...ctx });
        return {
            debug: bind('debug'), info: bind('info'),
            warn: bind('warn'), error: bind('error'),
        };
    },
};

export default log;
