// src/lib/ip.ts — IP de cliente confiable.
//
// `x-forwarded-for` tomando SOLO la primera entrada es spoofeable: el
// atacante manda su propio `X-Forwarded-For: 1.2.3.4` y ese valor queda
// primero en la cadena, así que leer `split(',')[0]` da la IP que el
// atacante quiso, no la real — bypassa cualquier rate-limit/lockout por IP
// y envenena `audit_log.ip`/`sessions.ip`.
//
// Vercel escribe (y no permite que el cliente sobreescriba) `x-real-ip` y
// `x-vercel-forwarded-for` en su propia capa de proxy — son la fuente
// confiable. `x-forwarded-for` queda como último recurso (dev local / detrás
// de otro proxy no-Vercel).
export function trustedIp(request: Request): string {
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim();
    const vercelXff = request.headers.get('x-vercel-forwarded-for');
    if (vercelXff) return vercelXff.split(',')[0].trim();
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return 'desconocida';
}
