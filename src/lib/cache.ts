// src/lib/cache.ts
// Cache TTL en proceso para agregados de LECTURA que toleran staleness leve
// (KPIs de dashboard, analítica, proyección CFO). Es por-instancia: cada réplica
// de Vercel cachea aparte, pero aun así recorta drásticamente los escaneos
// agregados repetidos a Neon cuando el mismo usuario navega/recarga o cuando hay
// muchos usuarios de la misma org. TTL corto (segundos) → nunca datos viejos.
//
// Para invalidación compartida entre réplicas a futuro: Vercel Runtime Cache
// (getCache de @vercel/functions) con tags por org. Aquí basta lo local.

interface Entry { value: unknown; expiresAt: number }
const store = new Map<string, Entry>();

/**
 * Devuelve el valor cacheado de `key` si sigue fresco; si no, ejecuta `fn`,
 * guarda el resultado por `ttlSec` segundos y lo devuelve. Si `fn` lanza, NO
 * cachea el error (se propaga y el siguiente intento reintenta).
 */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now < hit.expiresAt) return hit.value as T;
    const value = await fn();
    store.set(key, { value, expiresAt: now + ttlSec * 1000 });
    if (store.size > 5000) {
        for (const [k, v] of store) if (now >= v.expiresAt) store.delete(k);
    }
    return value;
}

/** Invalida todas las entradas cuya clave empiece con `prefix` (ej. una org). */
export function invalidate(prefix: string): void {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
