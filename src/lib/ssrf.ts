// src/lib/ssrf.ts
// Defensa SSRF para destinos controlados por el usuario (webhooks salientes,
// servidores MCP remotos). Cord hace fetch server-side a estas URLs, así que un
// destino como http://169.254.169.254/ (metadata de la nube) o una IP interna
// podría leer credenciales o servicios internos. Bloqueamos rangos privados y
// reservados, exigimos https, y re-validamos por DNS en tiempo de entrega para
// frenar el "DNS rebinding" (host público que resuelve a una IP interna).
//
// assertSafeWebhookTarget() resuelve DNS y luego safeFetch() vuelve a resolver
// por su cuenta al conectar — hay una ventana (TOCTOU) entre esas dos
// resoluciones donde un host de rebinding rápido podría colarse. El cierre
// real es validar en el momento exacto de la conexión: guardedAgent (undici)
// intercepta CADA resolución DNS que el propio socket va a usar — la IP que se
// valida es literalmente la IP a la que se conecta, sin hueco entre medias.

import { lookup } from 'node:dns/promises';
import { lookup as dnsLookupCb } from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';

// ¿La IP cae en un rango privado, loopback, link-local (metadata), CGNAT,
// multicast o reservado? Cualquier cosa que no sea claramente pública = inseguro.
export function isPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const p = ip.split('.').map(Number);
        const [a, b] = p;
        if (a === 0 || a === 10 || a === 127) return true;         // this-net / 10/8 / loopback
        if (a === 169 && b === 254) return true;                   // link-local + metadata 169.254.169.254
        if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16/12
        if (a === 192 && b === 168) return true;                   // 192.168/16
        if (a === 100 && b >= 64 && b <= 127) return true;         // CGNAT 100.64/10
        if (a === 192 && b === 0 && p[2] === 0) return true;       // 192.0.0/24 IETF
        if (a >= 224) return true;                                 // 224/4 multicast + 240/4 reservado
        return false;
    }
    if (net.isIPv6(ip)) {
        const low = ip.toLowerCase();
        if (low === '::1' || low === '::') return true;            // loopback / unspecified
        if (low.startsWith('fc') || low.startsWith('fd')) return true; // ULA fc00::/7
        if (low.startsWith('fe80')) return true;                   // link-local
        const m = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);       // IPv4-mapped
        if (m) return isPrivateIp(m[1]);
        return false;
    }
    return true; // formato desconocido → inseguro
}

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata']);

// Valida la FORMA de la URL sin tocar la red (para create/patch de webhooks).
// Exige https y rechaza hosts internos evidentes o IPs privadas literales.
export function validateWebhookUrl(u: string): { ok: true } | { ok: false; error: string } {
    let url: URL;
    try { url = new URL(u); } catch { return { ok: false, error: 'La URL no es válida.' }; }
    if (url.protocol !== 'https:') return { ok: false, error: 'La URL debe usar https://' };
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (BLOCKED_HOSTS.has(host) || host.endsWith('.internal') || host.endsWith('.local')) {
        return { ok: false, error: 'No se permiten destinos internos.' };
    }
    if (net.isIP(host) && isPrivateIp(host)) {
        return { ok: false, error: 'No se permiten direcciones IP internas o privadas.' };
    }
    return { ok: true };
}

// Verifica en tiempo de ENTREGA que el destino sea seguro, resolviendo el DNS
// para atrapar rebinding (host público → IP interna). Lanza si es inseguro.
export async function assertSafeWebhookTarget(u: string): Promise<void> {
    const form = validateWebhookUrl(u);
    if (!form.ok) throw new Error(form.error);
    const host = new URL(u).hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) return; // IP literal ya validada por validateWebhookUrl
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) {
        if (isPrivateIp(a.address)) throw new Error('El host del webhook resuelve a una IP interna.');
    }
}

// Custom `lookup` inyectado en el connector de undici — se invoca justo antes
// de abrir el socket TCP, con el hostname real que se va a conectar. SIEMPRE
// resolvemos con `all:true` propio para revisar TODAS las direcciones (no
// solo la primera) y solo entregamos al conector si NINGUNA es privada. Si el
// callback recibe un error, undici aborta la conexión — nunca llega a tocar
// la IP insegura.
//
// ⚠️ El shape de la respuesta DEBE espejar `options.all` de quien llama, no
// el nuestro interno: el connector de undici invoca este lookup con
// `{ all: true, ... }` y espera `callback(err, addresses[])` (array) — si en
// vez de eso se le manda la forma de una sola dirección `callback(err, ip,
// family)` (como hace node-dns cuando `all` es falsy), el propio `net` de
// Node interpreta el string de IP como si fuera el array y truena con
// "Invalid IP address: undefined". Se comprobó llamando el lookup real desde
// undici: llega con `all:true` — respetar ese contrato explícitamente en vez
// de asumir un shape fijo.
export function guardedLookup(
    hostname: string,
    options: { all?: boolean } | undefined,
    callback: (err: NodeJS.ErrnoException | null, address?: string | { address: string; family: number }[], family?: number) => void,
): void {
    dnsLookupCb(hostname, { all: true }, (err, addresses) => {
        if (err) return callback(err);
        const list = addresses as { address: string; family: number }[];
        if (!list.length) return callback(new Error(`Sin resolución DNS para ${hostname}`));
        const bad = list.find((a) => isPrivateIp(a.address));
        if (bad) return callback(new Error(`Destino inseguro: ${hostname} resolvió a ${bad.address}`));
        if (options?.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
    });
}

// Un solo Agent (pool de conexiones) para todo el proceso — construirlo por
// request desperdiciaría el pooling de undici y filtraría sockets.
const guardedAgent = new Agent({ connect: { lookup: guardedLookup } as any });

export interface SafeFetchResult {
    status: number;
    ok: boolean;
    body: string;
    error: string | null;
    ms: number;
}

/**
 * fetch() endurecido para destinos controlados por el usuario (webhooks, MCP
 * remotos): re-valida SSRF antes de tocar la red, NUNCA sigue redirects (un
 * host público que responda 302 hacia http://169.254.169.254/ evadiría por
 * completo assertSafeWebhookTarget si lo siguiéramos — cada salto necesitaría
 * su propia resolución DNS y seguiría siendo TOCTOU), y acota la lectura del
 * cuerpo para que un receptor que gotea la respuesta indefinidamente
 * (slowloris) no cuelgue la entrega para siempre. El timeout cubre TODA la
 * operación — conexión, headers y cuerpo — no solo la conexión inicial.
 */
export async function safeFetch(
    url: string,
    init: RequestInit,
    opts: { timeoutMs: number; maxBodyBytes?: number },
): Promise<SafeFetchResult> {
    const t0 = Date.now();
    try {
        await assertSafeWebhookTarget(url);
    } catch (e: any) {
        return { status: 0, ok: false, body: '', error: e?.message || 'destino bloqueado', ms: Date.now() - t0 };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
        // fetch de undici (no el global de Node) para poder pasarle nuestro
        // dispatcher — es lo que hace exigible el guardedLookup de arriba.
        const res = await undiciFetch(url, { ...init, redirect: 'manual', signal: ctrl.signal, dispatcher: guardedAgent } as any);
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get('location') || '(sin Location)';
            return {
                status: res.status, ok: false, body: '',
                error: `Redirección no permitida (HTTP ${res.status} → ${location})`,
                ms: Date.now() - t0,
            };
        }
        const body = await readCapped(res, opts.maxBodyBytes ?? 8192);
        return { status: res.status, ok: res.ok, body, error: res.ok ? null : `HTTP ${res.status}`, ms: Date.now() - t0 };
    } catch (e: any) {
        return {
            status: 0, ok: false, body: '',
            error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'error de red'),
            ms: Date.now() - t0,
        };
    } finally {
        // Se limpia DESPUÉS de leer el cuerpo (arriba), no justo tras los
        // headers — si no, una lectura colgada nunca abortaría.
        clearTimeout(timer);
    }
}

// Lee como máximo `maxBytes` del cuerpo. El AbortController de safeFetch sigue
// activo mientras esto corre, así que una respuesta que gotea bytes sin fin
// también se corta por el timeout (no solo por el tope de bytes).
// Acepta cualquier Response con cuerpo legible: el fetch de undici devuelve su
// propia clase Response, incompatible nominalmente con la global de lib.dom.
type ReadableResponse = {
    text(): Promise<string>;
    body: {
        getReader(): {
            read(): Promise<{ done: boolean; value?: Uint8Array }>;
            cancel(): Promise<void>;
        };
    } | null;
};
async function readCapped(res: ReadableResponse, maxBytes: number): Promise<string> {
    if (!res.body) {
        try { return await res.text(); } catch { return ''; }
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (total < maxBytes) {
            const { done, value } = await reader.read();
            if (done || !value) break;
            chunks.push(value);
            total += value.length;
        }
    } catch {
        /* abort/timeout a media lectura: nos quedamos con lo ya leído */
    } finally {
        try { await reader.cancel(); } catch {}
    }
    const out = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const c of chunks) {
        const room = out.length - offset;
        if (room <= 0) break;
        const slice = c.subarray(0, Math.min(c.length, room));
        out.set(slice, offset);
        offset += slice.length;
    }
    return new TextDecoder().decode(out);
}
