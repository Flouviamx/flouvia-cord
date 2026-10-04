/** Narrow transport failure guard. SQL errors and programming bugs still surface. */
export function isDatabaseUnavailable(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as {name?:string; message?:string; sourceError?:unknown};
    return e.name === 'NeonDbError' && !!e.sourceError && !!e.message?.startsWith('Error connecting to database:');
}

/** Fail closed: no app data, no session mutation, no automatic request replay. */
export function databaseUnavailableResponse(english: boolean): Response {
    const title = english ? 'We couldn’t load your workspace' : 'No pudimos cargar tu espacio';
    const detail = english ? 'The connection is temporarily unavailable. Try again in a moment.' : 'La conexión no está disponible en este momento. Vuelve a intentarlo en unos segundos.';
    const retry = english ? 'Try again' : 'Volver a intentar';
    return new Response(`<!doctype html><html lang="${english ? 'en' : 'es'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Cord</title><style>body{margin:0;background:#f5f5f7;color:#0a192f;font:16px system-ui;min-height:100dvh;display:grid;place-items:center}main{margin:24px;padding:40px;max-width:460px;background:#fff;border-radius:28px;box-shadow:0 12px 40px #0a192f0a}h1{font-size:26px;letter-spacing:-.04em}p{color:#626976;line-height:1.6}a{display:inline-block;margin-top:12px;padding:13px 20px;border-radius:999px;background:#0a192f;color:white;text-decoration:none}a:focus-visible{outline:3px solid #6a9fdd;outline-offset:4px}@media(prefers-color-scheme:dark){body{background:#11151c;color:#f4f5f7}main{background:#1b2029}p{color:#b0b8c4}a{background:#f4f5f7;color:#11151c}}</style><main><span>Cord</span><h1>${title}</h1><p>${detail}</p><a href="">${retry}</a></main></html>`, {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Retry-After':'5'}});
}
