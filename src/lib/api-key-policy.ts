// Política de llaves secretas: recursos de /api/v1 para las llaves restringidas
// (rk_) e IPs permitidas. Puro, sin DB: lo usan la autenticación, el endpoint
// que crea llaves, el Workbench y los tests. Una ruta de /api/v1 que no esté en
// el catálogo queda prohibida para una llave restringida (falla cerrado).
import { BlockList, isIP } from 'node:net';

export type PermissionLevel = 'none' | 'read' | 'write';

export const API_RESOURCES = {
    cotizaciones: ['/cotizaciones'],
    clientes: ['/clientes'],
    productos: ['/productos'],
    facturas: ['/facturas'],
    cobranza: ['/cobranza'],
    tareas: ['/tareas'],
    eventos: ['/events'],
    webhooks: ['/webhooks'],
    elements: ['/elements'],
    test_helpers: ['/test_helpers'],
} as const;

export type ApiResource = keyof typeof API_RESOURCES;
export type KeyPermissions = Record<ApiResource, PermissionLevel>;

export const RESOURCE_IDS = Object.keys(API_RESOURCES) as ApiResource[];

/** Rutas que cualquier llave secreta puede leer: identifican la llave, no exponen datos de negocio. */
const ALWAYS_READABLE = ['/me'];

const LEVEL_RANK: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2 };

export function resourceForPath(pathname: string): ApiResource | 'always' | null {
    const route = pathname.replace(/^\/api\/v1/, '').replace(/\/+$/, '') || '/';
    if (ALWAYS_READABLE.includes(route)) return 'always';
    for (const id of RESOURCE_IDS) {
        if (API_RESOURCES[id].some((p) => route === p || route.startsWith(p + '/'))) return id;
    }
    return null;
}

export function restrictedKeyAllows(perms: Partial<KeyPermissions>, pathname: string, need: 'read' | 'write'): { ok: true } | { ok: false; resource: ApiResource | null } {
    const resource = resourceForPath(pathname);
    if (resource === 'always') return need === 'read' ? { ok: true } : { ok: false, resource: null };
    if (!resource) return { ok: false, resource: null };
    const level = perms[resource] ?? 'none';
    return LEVEL_RANK[level] >= LEVEL_RANK[need] ? { ok: true } : { ok: false, resource };
}

export function parsePermissions(input: unknown): { ok: true; value: KeyPermissions } | { ok: false; error: string } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Los permisos deben ser un objeto { recurso: nivel }.' };
    const value = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 'none'])) as KeyPermissions;
    for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
        if (!(RESOURCE_IDS as string[]).includes(key)) return { ok: false, error: `Recurso desconocido: ${key.slice(0, 40)}.` };
        if (raw !== 'none' && raw !== 'read' && raw !== 'write') return { ok: false, error: `Nivel inválido para ${key}: usa none, read o write.` };
        value[key as ApiResource] = raw;
    }
    if (RESOURCE_IDS.every((id) => value[id] === 'none')) return { ok: false, error: 'Una llave restringida necesita al menos un permiso.' };
    return { ok: true, value };
}

/** Nivel que se guarda en `api_keys.scope` para una llave restringida (el detalle vive en permissions). */
export function scopeFor(perms: KeyPermissions): 'read' | 'write' {
    return RESOURCE_IDS.some((id) => perms[id] === 'write') ? 'write' : 'read';
}

export const MAX_ALLOWED_IPS = 20;

function normalizeIp(ip: string): string {
    const v4mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(ip);
    return v4mapped ? v4mapped[1] : ip;
}

/** Acepta IPs sueltas y rangos CIDR, IPv4 o IPv6, separados por coma, espacio o salto de línea. */
export function parseAllowedIps(input: unknown): { ok: true; value: string[] | null } | { ok: false; error: string } {
    const items = (Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,]+/) : [])
        .map((s) => String(s).trim()).filter(Boolean);
    if (input != null && !Array.isArray(input) && typeof input !== 'string') return { ok: false, error: 'Las IPs permitidas deben ser una lista.' };
    if (!items.length) return { ok: true, value: null };
    if (items.length > MAX_ALLOWED_IPS) return { ok: false, error: `Máximo ${MAX_ALLOWED_IPS} IPs o rangos por llave.` };
    const out: string[] = [];
    for (const item of items) {
        const [addr, bits, extra] = item.split('/');
        const family = isIP(normalizeIp(addr ?? ''));
        const max = family === 4 ? 32 : 128;
        const okBits = bits === undefined || (/^\d{1,3}$/.test(bits) && Number(bits) <= max);
        if (!family || extra !== undefined || !okBits) return { ok: false, error: `No es una IP ni un rango CIDR válido: ${item.slice(0, 60)}.` };
        // Un /0 equivale a no restringir: se rechaza para que nadie crea que su llave está acotada.
        if (bits !== undefined && Number(bits) === 0) return { ok: false, error: 'Un rango /0 permite cualquier IP. Deja la lista vacía si no quieres restringir.' };
        const norm = normalizeIp(addr) + (bits === undefined ? '' : `/${Number(bits)}`);
        if (!out.includes(norm)) out.push(norm);
    }
    return { ok: true, value: out };
}

export function ipAllowed(allowed: string[] | null | undefined, ip: string): boolean {
    if (!allowed?.length) return true;
    const candidate = normalizeIp(ip);
    const family = isIP(candidate);
    if (!family) return false;
    const list = new BlockList();
    for (const entry of allowed) {
        const [addr, bits] = entry.split('/');
        const fam = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
        if (bits === undefined) list.addAddress(addr, fam);
        else list.addSubnet(addr, Number(bits), fam);
    }
    return list.check(candidate, family === 6 ? 'ipv6' : 'ipv4');
}

/** Vencimientos que ofrece la UI, en días. null = sin vencimiento. */
export const KEY_EXPIRY_DAYS = [7, 30, 90, 365] as const;
/** Gracia de la llave vieja al rotar, en horas. 0 = se revoca en el acto. */
export const ROLL_GRACE_HOURS = [0, 1, 24, 168] as const;
