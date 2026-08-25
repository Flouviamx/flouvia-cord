// src/lib/mcp/session-store.ts
// Almacén de sesiones del transporte MCP legacy (HTTP+SSE). Usa Upstash Redis
// (REST) si está configurado — MISMO patrón que src/lib/ratelimit.ts — y si no,
// Postgres (Neon) como respaldo DURABLE.
//
// El fallback anterior era un Map en memoria de proceso, y eso no aguanta
// Vercel: el GET que sirve el stream y el POST que entrega el mensaje pueden
// caer en réplicas distintas, así que la segunda no encontraba la sesión que
// abrió la primera (`404 session-not-found` intermitente). Como Upstash nunca
// se provisionó en este proyecto, ESE era el camino real en producción.
//
// Dos estructuras por sesión:
//   mcp:sess:<id>  → string JSON McpSessionData (identidad: orgId/scope/keyId), con TTL
//   mcp:out:<id>   → lista FIFO de mensajes JSON pendientes de entregar por SSE
//
// El GET /api/mcp/sse (instancia que sirve el stream) hace polling de
// mcp:out:<id> cada ~1s y relaya cada mensaje al cliente — mismo patrón ya
// probado en /api/q/[token]/stream.ts. El POST /api/mcp/message (que en un
// entorno multi-instancia puede caer en OTRA instancia distinta a la que
// sirve el stream) solo necesita leer la sesión y hacer RPUSH — nunca toca
// el stream directamente, así que no importa en qué instancia se ejecute.

import { sql } from '../db';

const UP_URL = import.meta.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = import.meta.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Sin Upstash el respaldo es POSTGRES, no memoria: el Map de proceso solo sirve
// para una instancia, y en Vercel el GET del stream y el POST del mensaje pueden
// caer en réplicas distintas (404 session-not-found intermitente). Las tablas
// `mcp_sessions` / `mcp_session_outbox` viven en db/schema.sql.
export const SESSION_STORE_BACKEND: 'upstash' | 'postgres' = UP_URL && UP_TOKEN ? 'upstash' : 'postgres';

// Cubre de sobra el MAX_MS (~4.5 min) del stream de sse.ts + margen de
// reconexión; se refresca en cada heartbeat y en cada mensaje entrante para
// que una sesión activa con pausas largas entre mensajes no expire a medias.
export const SESSION_TTL_SEC = 600;

export interface McpSessionData {
    orgId: string;
    scope: 'read' | 'write';
    keyId: string;
}

// ── Respaldo durable en Postgres (Neon) ──
// Barrido perezoso, mismo patrón que rate_limit_counters: no hay cron para esto
// y una sesión MCP caducada no debe acumularse. Se acota a 500 filas por pasada
// para que un DELETE grande nunca le pegue al WAL en horas pico.
let lastSweep = 0;
function sweepExpired(): void {
    const now = Date.now();
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    sql`delete from mcp_sessions where id in (
            select id from mcp_sessions where expires_at < now() limit 500)`.catch(() => null);
    sql`delete from mcp_session_outbox where seq in (
            select seq from mcp_session_outbox where expires_at < now() limit 500)`.catch(() => null);
}

// ── Upstash REST — mismo endpoint de pipeline que ratelimit.ts ──
async function upstashPipeline(cmds: (string | number)[][]): Promise<any[]> {
    const res = await fetch(`${UP_URL}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const data: any = await res.json();
    return (data || []).map((r: any) => r.result);
}

export async function createSession(id: string, data: McpSessionData): Promise<void> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            await upstashPipeline([['SET', `mcp:sess:${id}`, JSON.stringify(data), 'EX', SESSION_TTL_SEC]]);
            return;
        } catch { /* Upstash caído al abrir la sesión — cae al respaldo durable */ }
    }
    sweepExpired();
    await sql`
        insert into mcp_sessions (id, data, expires_at)
        values (${id}, ${JSON.stringify(data)}::jsonb, now() + make_interval(secs => ${SESSION_TTL_SEC}))
        on conflict (id) do update set data = excluded.data, expires_at = excluded.expires_at`;
}

export async function getSession(id: string): Promise<McpSessionData | null> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            const [raw] = await upstashPipeline([['GET', `mcp:sess:${id}`]]);
            return raw ? (JSON.parse(raw) as McpSessionData) : null;
        } catch { return null; }
    }
    try {
        const [row] = await sql`select data from mcp_sessions where id = ${id} and expires_at > now()`;
        return row ? (row.data as McpSessionData) : null;
    } catch { return null; }
}

export async function deleteSession(id: string): Promise<void> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try { await upstashPipeline([['DEL', `mcp:sess:${id}`, `mcp:out:${id}`]]); } catch { /* best-effort */ }
        return;
    }
    try {
        await sql`delete from mcp_sessions where id = ${id}`;
        await sql`delete from mcp_session_outbox where session_id = ${id}`;
    } catch { /* best-effort */ }
}

// Extiende el TTL de una sesión activa. Se llama en cada mensaje entrante y
// en cada heartbeat del stream — una negociación larga con pausas no debe
// expirar a media conversación.
export async function touchSession(id: string): Promise<void> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            await upstashPipeline([
                ['EXPIRE', `mcp:sess:${id}`, SESSION_TTL_SEC],
                ['EXPIRE', `mcp:out:${id}`, SESSION_TTL_SEC],
            ]);
        } catch { /* best-effort */ }
        return;
    }
    try {
        await sql`update mcp_sessions set expires_at = now() + make_interval(secs => ${SESSION_TTL_SEC}) where id = ${id}`;
        await sql`update mcp_session_outbox set expires_at = now() + make_interval(secs => ${SESSION_TTL_SEC}) where session_id = ${id}`;
    } catch { /* best-effort */ }
}

export async function pushOutbox(id: string, payload: unknown): Promise<void> {
    const json = JSON.stringify(payload);
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            await upstashPipeline([
                ['RPUSH', `mcp:out:${id}`, json],
                ['EXPIRE', `mcp:out:${id}`, SESSION_TTL_SEC],
            ]);
            return;
        } catch { /* el mensaje se pierde si Upstash falla justo aquí — best-effort, igual que el resto del push */ }
    }
    try {
        await sql`
            insert into mcp_session_outbox (session_id, payload, expires_at)
            values (${id}, ${json}::jsonb, now() + make_interval(secs => ${SESSION_TTL_SEC}))`;
    } catch { /* best-effort, igual que el camino de Upstash */ }
}

// Drena hasta `max` mensajes pendientes en orden FIFO, ya parseados. Nunca
// lanza — un fallo transitorio del backend simplemente devuelve [] y el
// próximo ciclo de polling del stream lo reintenta.
export async function drainOutbox(id: string, max = 50): Promise<unknown[]> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            const [items] = await upstashPipeline([['LPOP', `mcp:out:${id}`, max]]);
            if (!items) return [];
            const arr = Array.isArray(items) ? items : [items];
            return arr.map((s: string) => JSON.parse(s));
        } catch { return []; }
    }
    // DELETE ... RETURNING drena y borra en UNA sentencia: dos instancias
    // haciendo polling del mismo stream no pueden entregar el mismo mensaje dos
    // veces. El orden lo da `seq` (bigserial), no el timestamp.
    // `delete ... returning` NO garantiza el orden de las filas devueltas, y aquí
    // el orden es el contrato (FIFO). Por eso el CTE ordena al final por `seq`.
    try {
        const rows = await sql`
            with picked as (
                select seq from mcp_session_outbox
                 where session_id = ${id}
                 order by seq
                 limit ${max}
            ), removed as (
                delete from mcp_session_outbox
                 where seq in (select seq from picked)
                returning seq, payload
            )
            select payload from removed order by seq`;
        return rows.map((r: any) => r.payload);
    } catch { return []; }
}
