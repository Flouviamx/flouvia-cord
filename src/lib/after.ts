// src/lib/after.ts
// Ejecuta trabajo de FONDO después de responderle al usuario, sin bloquear la
// respuesta. En Vercel (Fluid Compute) usa `waitUntil` para mantener viva la
// función hasta que el trabajo termine — sin esto, una promesa suelta (`void p`)
// se puede congelar/matar en cuanto retorna el handler. En dev/local (sin
// contexto de invocación) cae a fire-and-forget best-effort.
//
// Úsalo para efectos secundarios best-effort que NO deben añadir latencia al
// usuario: webhooks salientes, Slack, métricas, correos no críticos.
import { waitUntil } from '@vercel/functions';

export function after(promise: Promise<unknown>): void {
    // Nunca dejar que un rechazo tumbe el proceso: el trabajo de fondo es best-effort.
    const p = Promise.resolve(promise).catch(() => {});
    try {
        waitUntil(p);
    } catch {
        // Sin contexto de invocación de Vercel (dev/test): sigue corriendo suelto.
    }
}
