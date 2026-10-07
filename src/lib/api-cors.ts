// CORS y trazabilidad de la API pública v1. Solo las rutas que acepta una pk_
// responden a un navegador: el resto no tiene CORS, así que una sk_ usada desde
// una página falla en el preflight antes de llegar al servidor. Sin credenciales:
// la API se autentica con Bearer, nunca con cookies.
const PUBLISHABLE_ALLOWLIST = new Set([
    'GET /api/v1/productos',
    'POST /api/v1/cotizaciones',
    'GET /api/v1/elements/config',
    'POST /api/v1/elements/ai-draft',
]);

export function publishableKeyAllows(method: string, pathname: string): boolean {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return PUBLISHABLE_ALLOWLIST.has(`${method.toUpperCase()} ${path}`);
}

const ALLOWED_HEADERS = 'Authorization, Content-Type, Idempotency-Key, If-None-Match, Cord-Version';
const EXPOSED_HEADERS = 'Cord-Request-Id, Cord-Version, Retry-After, ETag';
export const ERRORS_DOC_URL = 'https://docs.cordhq.app/docs/desarrolladores/esenciales/errores';

function browserOrigin(request: Request): string | null {
    const origin = request.headers.get('origin');
    if (!origin || origin === 'null') return null;
    try { return new URL(origin).origin; } catch { return null; }
}

export function apiPreflight(request: Request): Response | null {
    const url = new URL(request.url);
    if (request.method !== 'OPTIONS' || !url.pathname.startsWith('/api/v1/')) return null;
    const origin = browserOrigin(request);
    const wanted = request.headers.get('access-control-request-method') || '';
    if (!origin || !publishableKeyAllows(wanted, url.pathname)) {
        return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
    }
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': wanted.toUpperCase(),
            'Access-Control-Allow-Headers': ALLOWED_HEADERS,
            'Access-Control-Max-Age': '600',
            Vary: 'Origin',
        },
    });
}

export function newRequestId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return 'req_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Toda respuesta v1 lleva su request id, y cada error lo repite en el cuerpo
// junto al enlace de la documentación: es lo que el desarrollador pega al pedir
// soporte, y lo que se busca en la bitácora.
export async function decorateApiResponse(request: Request, response: Response, requestId: string, apiVersion?: string | null): Promise<Response> {
    const headers = new Headers(response.headers);
    headers.set('Cord-Request-Id', requestId);
    if (apiVersion) headers.set('Cord-Version', apiVersion);

    const url = new URL(request.url);
    const origin = browserOrigin(request);
    if (origin && publishableKeyAllows(request.method, url.pathname)) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS);
        headers.append('Vary', 'Origin');
    }

    let body: BodyInit | null = response.body;
    if (response.status >= 400 && (headers.get('content-type') || '').includes('application/json')) {
        const text = await response.text();
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsed.request_id = requestId;
                if (typeof parsed.code === 'string') parsed.doc_url = `${ERRORS_DOC_URL}#${parsed.code}`;
                body = JSON.stringify(parsed);
                headers.delete('content-length');
            } else {
                body = text;
            }
        } catch {
            body = text;
        }
    }
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
