// src/lib/mcp/session-store.ts
// Almacén de sesiones del transporte MCP legacy (HTTP+SSE). Usa Upstash Redis
// (REST) si está configurado — MISMO patrón que src/lib/ratelimit.ts — con
// fallback a un Map en memoria de proceso. Sin Upstash, una sesión abierta en
// una instancia de Vercel NO es visible en otra (documentado abajo); sigue
// siendo correcto para una sola instancia, que es el caso común en
// desarrollo/tráfico bajo, y no bloquea nada — agregar las 2 env vars lo
// vuelve multi-instancia sin tocar código.
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

const UP_URL = import.meta.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
const UP_TOKEN = import.meta.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const SESSION_STORE_BACKEND: 'upstash' | 'memory' = UP_URL && UP_TOKEN ? 'upstash' : 'memory';

// Cubre de sobra el MAX_MS (~4.5 min) del stream de sse.ts + margen de
// reconexión; se refresca en cada heartbeat y en cada mensaje entrante para
// que una sesión activa con pausas largas entre mensajes no expire a medias.
export const SESSION_TTL_SEC = 600;

export interface McpSessionData {
    orgId: string;
    scope: 'read' | 'write';
    keyId: string;
}

// ── Fallback in-memory (por proceso) ──
const memSessions = new Map<string, { data: McpSessionData; expiresAt: number }>();
const memOutbox = new Map<string, { queue: string[]; expiresAt: number }>();

function memGC(): void {
    const now = Date.now();
    for (const [k, v] of memSessions) if (now >= v.expiresAt) memSessions.delete(k);
    for (const [k, v] of memOutbox) if (now >= v.expiresAt) memOutbox.delete(k);
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
        } catch { /* Upstash caído al abrir la sesión — cae al fallback local para esta sesión */ }
    }
    memGC();
    memSessions.set(id, { data, expiresAt: Date.now() + SESSION_TTL_SEC * 1000 });
}

export async function getSession(id: string): Promise<McpSessionData | null> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try {
            const [raw] = await upstashPipeline([['GET', `mcp:sess:${id}`]]);
            return raw ? (JSON.parse(raw) as McpSessionData) : null;
        } catch { return null; }
    }
    const s = memSessions.get(id);
    if (!s || Date.now() >= s.expiresAt) return null;
    return s.data;
}

export async function deleteSession(id: string): Promise<void> {
    if (SESSION_STORE_BACKEND === 'upstash') {
        try { await upstashPipeline([['DEL', `mcp:sess:${id}`, `mcp:out:${id}`]]); } catch { /* best-effort */ }
        return;
    }
    memSessions.delete(id);
    memOutbox.delete(id);
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
    const now = Date.now();
    const s = memSessions.get(id);
    if (s) s.expiresAt = now + SESSION_TTL_SEC * 1000;
    const o = memOutbox.get(id);
    if (o) o.expiresAt = now + SESSION_TTL_SEC * 1000;
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
    memGC();
    let o = memOutbox.get(id);
    if (!o) { o = { queue: [], expiresAt: Date.now() + SESSION_TTL_SEC * 1000 }; memOutbox.set(id, o); }
    o.queue.push(json);
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
    const o = memOutbox.get(id);
    if (!o || !o.queue.length) return [];
    const out = o.queue.splice(0, max);
    return out.map((s) => JSON.parse(s));
}
