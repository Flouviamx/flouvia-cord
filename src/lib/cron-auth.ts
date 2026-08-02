// src/lib/cron-auth.ts — autenticación compartida de los 6 endpoints
// /api/cron/*. Antes cada uno hacía `if (CRON_SECRET) { ...comparar... }` —
// si la env var no estaba configurada en el deployment, el bloque completo se
// saltaba y el cron quedaba ABIERTO a cualquier caller anónimo. Varios mutan
// dinero real (intereses moratorios, cobranza) o mandan correo en nombre de
// la plataforma. Ahora: sin CRON_SECRET configurado, el endpoint responde
// 503 (falla CERRADO) en vez de 200 sin auth. La comparación del secreto es
// constant-time.
import { timingSafeEqual } from 'node:crypto';

/** Devuelve un Response de error si el request no trae el Bearer correcto, o null si puede continuar. */
export function assertCronAuth(request: Request): Response | null {
    const secret = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
    if (!secret) {
        return new Response(JSON.stringify({ error: 'CRON_SECRET no configurado en este entorno' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    const auth = request.headers.get('authorization') || '';
    const expected = `Bearer ${secret}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    return null;
}
