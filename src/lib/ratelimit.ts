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

export interface RateResult { ok: boolean; remaining: number; retryAfter: number }

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

// Helper: arma un Response 429 estándar con Retry-After.
export function tooMany(retryAfter: number, msg = 'Demasiadas peticiones. Intenta de nuevo en un momento.'): Response {
    return new Response(JSON.stringify({ error: msg }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
    });
}
