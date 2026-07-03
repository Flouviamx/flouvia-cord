// src/lib/ssrf.ts
// Defensa SSRF para destinos controlados por el usuario (webhooks salientes,
// servidores MCP remotos). Cord hace fetch server-side a estas URLs, así que un
// destino como http://169.254.169.254/ (metadata de la nube) o una IP interna
// podría leer credenciales o servicios internos. Bloqueamos rangos privados y
// reservados, exigimos https, y re-validamos por DNS en tiempo de entrega para
// frenar el "DNS rebinding" (host público que resuelve a una IP interna).

import { lookup } from 'node:dns/promises';
import net from 'node:net';

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
