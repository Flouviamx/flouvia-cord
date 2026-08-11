// src/lib/ratelimit.ts
// Rate limit DURABLE para endpoints sensibles (públicos o costosos) que NO pasan
// por el limiter in-memory del middleware, o donde el conteo debe ser global
// entre réplicas de Vercel Fluid.
//
// Usa Upstash Redis (REST) si UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// están configurados → conteo atómico compartido entre TODAS las instancias.
// Si no están, cae a un contador in-memory por proceso (mejor que nada; protege
// dentro de una instancia). Así queda listo para producción sin bloquear dev:
// agregas las 2 env vars y el rate limit pasa a ser global, sin cambios de código.

import { createHash } from 'node:crypto';
import { sql } from './db';

const UP_URL = import.meta.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = import.meta.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const RATE_LIMIT_BACKEND: 'upstash' | 'memory' = UP_URL && UP_TOKEN ? 'upstash' : 'memory';

// Fallback in-memory (por proceso). Se limpia perezosamente.
const mem = new Map<string, { count: number; resetAt: number }>();

function memAllow(key: string, limit: number, windowMs: number): RateResult {
    const now = Date.now();
    let b = mem.get(key);
    if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + windowMs };
        mem.set(key, b);
    }
    b.count++;
    if (mem.size > 20_000) {
        for (const [k, v] of mem) if (now >= v.resetAt) mem.delete(k);
    }
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter };
}

async function upstashAllow(key: string, limit: number, windowSec: number): Promise<RateResult> {
    // Pipeline atómico: INCR y (si es la primera vez) fija el TTL de la ventana.
    const res = await fetch(`${UP_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([
            ['INCR', key],
            ['EXPIRE', key, String(windowSec), 'NX'],
        ]),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const data: any = await res.json();
    const count = Number(data?.[0]?.result ?? 1);
    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter: windowSec };
}

export interface RateResult {
    ok: boolean;
    remaining: number;
    retryAfter: number;
    unavailable?: boolean;
}

// ── Backend durable #2: Postgres (Neon) ──────────────────────────────────────
// Alternativa a Upstash para las superficies fail-closed. Neon YA es el estado
// compartido entre todas las instancias de Vercel, así que el conteo es global
// sin sumar un proveedor, un secreto ni un costo nuevo. El volumen que pasa por
// aquí es bajo por diseño (login de Ops, reembolsos, disputas, reauth): son
// caminos privilegiados o de dinero, no rutas calientes. `rateLimit()` normal
// NUNCA usa este backend — ahí sí habría carga real contra la BD.
//
// La clave se guarda hasheada: el texto original lleva IPs y correos, y esta
// tabla no tiene ninguna razón para acumular ese PII.

let lastCounterSweep = 0;

function counterId(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

async function postgresAllow(key: string, limit: number, windowSec: number): Promise<RateResult> {
    // Un solo statement ⇒ atómico. El `on conflict` toma el lock de la fila, así
    // que dos requests concurrentes nunca leen el mismo contador viejo. La
    // ventana se reinicia sola cuando `reset_at` ya pasó: sin cron, sin carrera.
    const rows = await sql`
        insert into rate_limit_counters (id, count, reset_at)
        values (${counterId(key)}, 1, now() + make_interval(secs => ${windowSec}))
        on conflict (id) do update set
            count = case when rate_limit_counters.reset_at <= now()
                         then 1 else rate_limit_counters.count + 1 end,
            reset_at = case when rate_limit_counters.reset_at <= now()
                            then now() + make_interval(secs => ${windowSec})
                            else rate_limit_counters.reset_at end
        returning count, extract(epoch from (reset_at - now())) as seconds_left
    `;
    const count = Number(rows[0]?.count ?? 1);
    const retryAfter = Math.max(1, Math.ceil(Number(rows[0]?.seconds_left ?? windowSec)));

    // Barrido perezoso de ventanas ya vencidas, como máximo una vez por minuto
    // por instancia. Acotado a 500 filas para que jamás bloquee un login.
    const now = Date.now();
    if (now - lastCounterSweep > 60_000) {
        lastCounterSweep = now;
        sql`
            delete from rate_limit_counters where id in (
                select id from rate_limit_counters
                where reset_at < now() - interval '10 minutes' limit 500
            )
        `.catch(() => null);
    }

    return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter };
}

/**
 * Cuenta un hit contra `key` en una ventana deslizante de `windowSec`. Devuelve
 * ok=false cuando se rebasa `limit`. NUNCA lanza: ante un fallo del backend
 * durable cae al contador local (fail-open hacia el local, no hacia "sin límite").
 */
export async function rateLimit(key: string, limit: number, windowSec = 60): Promise<RateResult> {
    if (RATE_LIMIT_BACKEND === 'upstash') {
        try {
            return await upstashAllow(`rl:${key}`, limit, windowSec);
        } catch {
            // Upstash caído → degradar al contador local en vez de dejar pasar todo.
            return memAllow(key, limit, windowSec * 1000);
        }
    }
    return memAllow(key, limit, windowSec * 1000);
}

/**
 * Variante fail-closed para superficies privilegiadas (login de Ops, reembolsos,
 * disputas, reauth, Connect). Siempre exige un contador DURABLE compartido entre
 * instancias — nunca degrada a un contador por proceso, que sería un límite
 * multiplicado por el número de réplicas.
 *
 * Orden: Upstash si está configurado → Postgres (Neon) como respaldo siempre
 * disponible → fail-closed si ninguno responde. En desarrollo, si la BD tampoco
 * está a la mano, cae al contador local para no bloquear localhost.
 *
 * ⚠️ Histórico: antes esto exigía Upstash y NADA más. Como Upstash nunca se
 * provisionó, en producción devolvía 503 en el 100% de los intentos — Ops quedó
 * inaccesible incluso para sus dos operadores, y con él los reembolsos, la
 * evidencia de disputas, la reautenticación y la aceptación de tarifas.
 */
export async function strictRateLimit(key: string, limit: number, windowSec = 60): Promise<RateResult> {
    if (RATE_LIMIT_BACKEND === 'upstash') {
        try {
            return await upstashAllow(`rl:${key}`, limit, windowSec);
        } catch {
            // Upstash configurado pero caído: intentamos el respaldo durable
            // antes de cerrar la puerta.
        }
    }
    try {
        return await postgresAllow(key, limit, windowSec);
    } catch (error) {
        console.error('[ratelimit/postgres]', error);
        if (import.meta.env.PROD) {
            return { ok: false, remaining: 0, retryAfter: 60, unavailable: true };
        }
        return memAllow(key, limit, windowSec * 1000);
    }
}

export function strictLimitResponse(result: RateResult): Response | null {
    if (result.ok) return null;
    if (result.unavailable) {
        return new Response(JSON.stringify({ error: 'access_temporarily_unavailable' }), {
            status: 503,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(result.retryAfter),
            },
        });
    }
    return tooMany(result.retryAfter);
}

// Helper: arma un Response 429 estándar con Retry-After.
// `code: 'rate_limited'` — antes esta era la única respuesta 4xx de /api/v1/*
// SIN `code` (el resto usa `fail()` en apiv1.ts), así que el SDK no podía
// distinguir "me rate-limitaron" de cualquier otro error por código.
export function tooMany(retryAfter: number, msg = 'Demasiadas peticiones. Intenta de nuevo en un momento.'): Response {
    return new Response(JSON.stringify({ error: msg, code: 'rate_limited' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
}
