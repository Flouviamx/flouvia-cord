
import { sequence } from "astro:middleware";
import { customerDomainBoundary } from './lib/customer-domain-middleware';
import { reqContext } from "./lib/context";
import { LEGACY_ROUTES } from "./lib/informes";
import { isAllowedMutationOrigin, isCsrfExemptWrite } from './lib/csrf-policy';
import { canonicalPathForInvalidEnglishRoute, preferredPublicLang } from './i18n/utils';

// APIs que DEBEN seguir públicas (las llaman terceros sin sesión):
//   /api/q/*         → vista pública del cliente (token secreto)
//   /api/stripe/*    → webhook de Stripe (firma propia)
//   /api/cron/*      → cron de Vercel (protegido por CRON_SECRET)
//   /api/health      → sonda de Vercel (protegida por CRON_SECRET)
//   /api/v1/*        → API PÚBLICA (cada ruta se autentica por API key: Bearer)
//   /api/mcp/sse|message → transporte MCP (se autentica por API key: Bearer)
//   /api/stripe/*    → webhooks de Stripe (se autentican por firma Stripe)
//
// ⚠️ MCP: se listan las SUB-rutas exactas que se auto-autentican por API key.
// NO usar el prefijo "/api/mcp" a secas: haría públicas rutas de SESIÓN como
// /api/mcp/playground (requirePerm) y saltaría su gate de auth. El endpoint
// JSON-RPC base /api/mcp se cubre con match EXACTO, no por prefijo.
//
// NOTA: /api/webhooks/inbound-email NO va aquí a propósito — hoy queda gateado
// por sesión (el proveedor de correo no la tiene, así que no es alcanzable). Para
// activarlo hay que (1) agregarlo aquí y (2) exigir INBOUND_EMAIL_SECRET dentro
// del handler (ya implementado) para que no quede abierto.
// /api/contacto/* → formulario público de ventas (lead capture, sin sesión; el
// handler valida honeypot + rate limit propio, ya que aquí salta el limiter interno).
// /api/billing/connect/capture/[token] → verificación de identidad "continúa en
// tu teléfono" (sin sesión en el celular; el token aleatorio de 10 min es
// la credencial — ver identity_capture_sessions). OJO: el prefijo exige la barra
// final para NO alcanzar /api/billing/connect/capture-session (esa SÍ requiere
// sesión — la crea el escritorio autenticado).
//
// /api/i/* → factura hospedada. MISMO carril que /api/q/*: el destinatario de una
// factura no tiene cuenta en Cord, y el token de la URL es la credencial (lo
// resuelve `resolvePublicInvoice`, una función security definer que devuelve solo
// {id, orgId} y obliga a volver a withOrgTx — regla 30). Faltaba, y como el
// middleware responde 401 a toda API que no esté aquí, los DOS endpoints de la
// factura hospedada eran inalcanzables para un cliente sin sesión: no se podía
// pagar (`/api/i/[token]/payment-intent`) ni se registraba la vista
// (`/api/i/[token]`, la señal de la regla 19). Ambos handlers existían y estaban
// bien; lo único que faltaba era esta línea.
const PUBLIC_API_PREFIXES = ["/api/q/", "/api/i/", "/api/stripe/", "/api/cron/", "/api/v1/", "/api/mcp/sse", "/api/mcp/message", "/api/auth/", "/api/contacto/", "/api/blog/", "/api/billing/connect/capture/"];
// Solo los tres endpoints que CREAN una sesión de Ops son públicos. Cualquier
// futura API bajo /api/ops queda privada por default y exige sesión Ops válida.
const OPS_PUBLIC_API_EXACT = [
    "/api/ops/auth",
    "/api/ops/passkey-options",
    "/api/ops/passkey-verify",
];
// OAuth legal intent is unauthenticated by definition (the account does not
// exist yet), but it remains a same-origin POST subject to the CSRF check.
const PUBLIC_API_EXACT = ["/api/mcp", "/api/health", "/api/docs-search.json", "/api/geo", "/api/legal/oauth-intent", "/api/resend/marketing-webhook", "/api/build/payment-intent", ...OPS_PUBLIC_API_EXACT];

// Exención CSRF independiente de "API pública". Solo entra aquí una mutación
// que se autentica con una credencial que el navegador no adjunta por sí solo
// (firma HMAC, Bearer o CRON_SECRET) y cuyo handler no debe leer cookies.
//
// No reutilizar PUBLIC_API_PREFIXES: ahí también viven /api/auth/*, /api/q/*,
// /api/i/*, /api/contacto/* y capture/*, que sí reciben llamadas de navegador y
// dependen de cookies o tokens en URL; exentarlas convertiría una ruta pública en
// CSRF.
// ── Rate limiting (in-memory, por IP) ────────────────────────────────────────
// Ventana: 60 s. Límites:
//   · APIs internas de lectura (GET):   200 req/min
//   · APIs internas de escritura:        60 req/min  (POST/PATCH/PUT/DELETE)
//   · Piso global (todas las rutas):    500 req/min
// En producción multi-instancia, usar Upstash Redis para compartir el estado
// entre réplicas. Este contador in-process es suficiente para un solo worker.
const rl = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW = 60_000;

function allow(ip: string, scope: string, limit: number): boolean {
    const key = `${scope}:${ip}`;
    const now = Date.now();
    let b = rl.get(key);
    if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + RL_WINDOW };
        rl.set(key, b);
    }
    b.count++;
    if (rl.size > 10_000) {
        for (const [k, v] of rl) {
            if (now >= v.resetAt) rl.delete(k);
        }
    }
    return b.count <= limit;
}

// ── Subdominios ───────────────────────────────────────────────────────────────
//   dev.cordhq.app  → sirve el árbol /dev-blog en su raíz
//   docs.cordhq.app → sirve el árbol /docs en su raíz
//
// ⚠️ ESTE es el ÚNICO lugar donde se rutean los subdominios. NO agregar rewrites/
// redirects de subdominio en vercel.json: los `rewrites` de vercel.json corren DESPUÉS
// del filesystem (pierden contra archivos estáticos) y, cuando sí disparan, chocan con
// esta lógica y causan bucles 301 / 500. Un solo dueño = sin conflictos.
//
// ⚠️ Requiere que las páginas que sirven la RAÍZ de un subdominio NO sean prerender
// (ver index.astro): las prerender se sirven estáticas y saltan el middleware. Las
// páginas de /dev-blog y /docs ya son SSR. Los assets estáticos (/_astro, /imgs, /fonts)
// se sirven directo por Vercel sin pasar por aquí, así que la reescritura no los toca.
// 'prefixes' (plural) — casi siempre solo el prefijo ES/default. docs.cordhq.app es
// la excepción: la versión EN vive en una ruta física INDEPENDIENTE en el árbol de
// páginas (src/pages/en/docs/[...slug].astro, ya existente desde antes de tocar
// subdominios) en vez de anidar bajo /docs/en/* como hace dev-blog — así que
// "/en/docs" necesita su PROPIA entrada en la whitelist o el guard de abajo la
// trata como una ruta cualquiera y la reescribe mal (ver bug documentado abajo).
const SUBDOMAINS = [
    { host: "dev.cordhq.app", prefixes: ["/dev-blog"], passthrough: ["/robots.txt", "/sitemap.xml"] },
    // La búsqueda vive fuera del árbol /docs. Debe pasar con su URL real o el
    // rewrite la convertiría en /docs/api/docs-search.json y devolvería HTML al
    // modal que espera JSON.
    { host: "docs.cordhq.app", prefixes: ["/docs", "/en/docs"], passthrough: ["/api/docs-search.json", "/robots.txt", "/sitemap.xml"] },
    // /api/ops debe pasar sin reescribirse: el formulario vive en el mismo
    // subdominio y llama a esos endpoints. Antes terminaba como
    // /ops/api/ops/auth y el login devolvía 404 en producción.
    { host: "ops.cordhq.app", prefixes: ["/ops", "/api/ops"], passthrough: ["/robots.txt", "/sitemap.xml"] },
    // Facturación de la suscripción a Cord: superficie propia, fuera del chrome
    // de la app, como la del procesador que sustituye. `/api/billing` viaja con
    // ella porque la página llama a esos endpoints y la política CSRF exige
    // mismo origen: servida desde billing.cordhq.app, un fetch al apex sería
    // cross-origin y se rechazaría con 403.
    { host: "billing.cordhq.app", prefixes: ["/billing", "/api/billing"], passthrough: ["/robots.txt", "/sitemap.xml"] },
];

function normalizedHostname(value: string): string {
    return value.trim().toLowerCase().replace(/\.$/, '');
}

const subdomainRewrite = async (context: any, next: any) => {
    // Comparacion exacta. `includes()` tambien aceptaba hosts como
    // ops.cordhq.app.ejemplo.com y convertia el Host en una frontera de auth.
    const host = normalizedHostname(context.url.hostname || '');
    const path = context.url.pathname;

    const sub = SUBDOMAINS.find((s) => host === s.host);
    if (sub) {
        // Idempotente + a prueba de bucles: si el path YA vive bajo alguno de los
        // prefijos (porque context.rewrite re-ejecuta el middleware, o porque los
        // links internos ya lo incluyen — p.ej. DocsLayout usa /docs/* y /en/docs/*),
        // se sirve tal cual. Nunca se re-reescribe (evita /dev-blog/dev-blog/... y
        // ping-pong de redirecciones). También se dejan pasar los endpoints internos
        // de Astro (/_image, /_server-islands, /_actions) y el 404 (el [slug] del
        // dev-blog redirige a /404 en slug inexistente; sin esta salida se generaría
        // un bucle /404 → /dev-blog/404 → /404).
        //
        // ⚠️ BUG REAL corregido (ago 2026): antes solo existía "/docs" en la
        // whitelist de docs.cordhq.app. Una visita a docs.cordhq.app/en/docs/<slug>
        // NO empezaba con "/docs" (empieza con "/en") → caía al rewrite de abajo →
        // se servía como /docs + "/en/docs/<slug>" = "/docs/en/docs/<slug>", que el
        // catch-all [...slug] de /docs interpreta como slug="en/docs/<slug>" (nunca
        // existe) → 302 silencioso de vuelta a /docs. Es decir: TODA página de docs
        // en inglés rebotaba a la portada en español en vez de mostrar su contenido.
        // Con "/en/docs" en la whitelist, ese path pasa tal cual y llega a la ruta
        // real src/pages/en/docs/[...slug].astro.
        const matchedPrefix = sub.prefixes.find((p) => path === p || path.startsWith(p + "/"));
        const matchedPassthrough = sub.passthrough?.includes(path);
        if (matchedPrefix || matchedPassthrough || path.startsWith("/_") || path === "/404") {
            return next();
        }
        // Reescritura INTERNA: la URL del navegador no cambia; se sirve el árbol del
        // prefijo por DEFAULT (siempre prefixes[0], el idioma default/ES) bajo el
        // subdominio. Sirve sobre todo para la RAÍZ del subdominio (dev.cordhq.app/ →
        // /dev-blog, docs.cordhq.app/ → /docs): la raíz "/" matchea la ruta index →
        // status 200 correcto.
        //
        // ⚠️ El resto de páginas del dev-blog/docs enlazan con su prefijo (/dev-blog/*,
        // /docs/*, /en/docs/*), así que el navegador pide directo un path que matchea
        // ruta → 200 vía el guard de arriba, SIN pasar por este rewrite. Esto es a
        // propósito: Astro fija el status HTTP según si el path ORIGINAL matchea una
        // ruta, en una capa por ENCIMA del middleware — un path raíz-limpio (/<slug>)
        // que no matchea ninguna ruta se sirve con 404 aunque el contenido renderice,
        // y no se puede corregir desde aquí. Por eso los links llevan el prefijo (ver
        // DevBlogLayout/DocsLayout).
        return context.rewrite(sub.prefixes[0] + (path === "/" ? "" : path));
    }

    // Dominio principal (cordhq.app): en prod, el contenido de los subdominios no debe
    // vivir también en cordhq.app/dev-blog|/docs|/en/docs (evita contenido duplicado /
    // SEO split — y evita que la versión EN de docs, que vive en una ruta física propia
    // del árbol de páginas, quede indexable en DOS dominios a la vez). Estas rutas son
    // SSR, así que este middleware sí corre para ellas.
    if (import.meta.env.PROD) {
        for (const s of SUBDOMAINS) {
            for (const p of s.prefixes) {
                // Solo páginas. Un endpoint no se indexa, y `/api/billing/*`
                // SÍ tiene que seguir respondiendo en el apex: es el que usa
                // /app/checkout. Redirigirlo rompería el alta de suscripción.
                if (p.startsWith("/api/")) continue;
                if (path === p || path.startsWith(p + "/")) {
                    // ⚠️ Se PRESERVA el prefijo en el destino (no se recorta). Un deep
                    // link como cordhq.app/docs/pagos/resumen debe caer en
                    // docs.cordhq.app/docs/pagos/resumen (matchea ruta → 200). Si se
                    // recortara a docs.cordhq.app/pagos/resumen, el contenido renderiza
                    // pero con status 404 (Astro fija el status por match de la ruta
                    // ORIGINAL — ver arriba).
                    return context.redirect(`https://${s.host}${path}`, 301);
                }
            }
        }
    }

    return next();
};

const PUBLIC_LANG_COOKIE = 'cord_public_lang';

function languageVary(headers: Headers): void {
    const current = headers.get('Vary')?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
    for (const value of ['Accept-Language', 'Cookie']) {
        if (!current.some((item) => item.toLowerCase() === value.toLowerCase())) current.push(value);
    }
    headers.set('Vary', current.join(', '));
}

// La landing negocia idioma una sola vez en la raíz. Accept-Language describe
// la preferencia real del dispositivo mejor que geolocalizar la IP (una persona
// puede estar viajando o usar VPN). El selector ES/EN fija una cookie para que
// la elección explícita gane en visitas posteriores.
const publicLanguageRouting = async (context: any, next: any) => {
    if (context.locals.customerDomainOrgId) return next();
    const path = context.url.pathname;
    const method = context.request.method;
    const host = normalizedHostname(context.url.hostname || '');
    const isSpecialSubdomain = SUBDOMAINS.some((subdomain) => host === subdomain.host);

    if (isSpecialSubdomain || (method !== 'GET' && method !== 'HEAD') || path.startsWith('/api/')) {
        return next();
    }

    const requestedLang = context.url.searchParams.get('lang');
    const explicitLang = requestedLang === 'es' || requestedLang === 'en' ? requestedLang : null;
    if (explicitLang) {
        context.cookies.set(PUBLIC_LANG_COOKIE, explicitLang, {
            path: '/',
            sameSite: 'lax',
            secure: import.meta.env.PROD,
            maxAge: 60 * 60 * 24 * 365,
        });
    }

    const canonicalPath = canonicalPathForInvalidEnglishRoute(path);
    if (explicitLang || canonicalPath) {
        const destination = new URL(context.url);
        if (explicitLang) destination.searchParams.delete('lang');
        if (canonicalPath) destination.pathname = canonicalPath;
        const response = context.redirect(`${destination.pathname}${destination.search}`, 302);
        response.headers.set('Cache-Control', 'private, no-store');
        languageVary(response.headers);
        return response;
    }

    if (path === '/' || path === '/build' || path === '/build/') {
        const saved = context.cookies.get(PUBLIC_LANG_COOKIE)?.value;
        const lang = saved === 'es' || saved === 'en'
            ? saved
            : preferredPublicLang(context.request.headers.get('accept-language'));

        if (lang === 'en') {
            const destination = `${path === '/' ? '/en' : '/en/build'}${context.url.search}`;
            const response = context.redirect(destination, 302);
            response.headers.set('Cache-Control', 'private, no-store');
            languageVary(response.headers);
            return response;
        }

        const response = await next();
        const varied = new Response(response.body, response);
        languageVary(varied.headers);
        return varied;
    }

    return next();
};

import { validateSession, authorizeSessionActivity, SESSION_COOKIE, setSessionCookies, clearSessionCookies } from './lib/auth';
import { OPS_SESSION_COOKIE, validateOpsSession } from './lib/ops-auth';
import { trustedIp } from './lib/ip';
import { getAppGates, getActiveOrgId, resolvePresentationContext } from './lib/db';
import { checkMemberSeatAccess } from './lib/org-entitlements';
import { strictLimitResponse, strictRateLimit } from './lib/ratelimit';
import { log } from './lib/log';
import { isTwoFactorRecoveryApi } from './lib/two-factor-gate';

const mainHandler = async (context: any, next: any) => {
    const path = context.url.pathname;
    const method = context.request.method;
    const csrfExempt = isCsrfExemptWrite(path, method);

    // Leer sesión desde la cookie 'cord_session' (Fase 3 - Custom Auth)
    // Las rutas CSRF-exempt son deliberadamente ciegas a cookies. Si una ruta se
    // agrega por error a la lista, pierde el contexto de usuario/org y falla 401
    // dentro de su handler en vez de heredar autoridad ambiental del navegador.
    const cookieBlind = csrfExempt || !!context.locals.customerDomainOrgId;
    const sessionId = cookieBlind ? undefined : context.cookies.get(SESSION_COOKIE)?.value;
    let userId = null;
    let validatedSessionId: string | null = null;
    if (sessionId) {
        const session = await validateSession(sessionId);
        userId = session?.userId || null;
        validatedSessionId = session?.sessionId || null;
        if (!session) {
            // Cookie presente pero la sesión ya no es válida (expiró, fue
            // revocada, o la cuenta se suspendió) — sin esto la cookie muerta
            // se quedaba en el navegador hasta su Max-Age original, y el hint
            // seguía diciendo "hay sesión" aunque ya no la hubiera.
            clearSessionCookies(context.cookies);
        }
    }
    const orgId = cookieBlind ? null : (context.cookies.get('cord_active_org')?.value || null); // Fase 3: Active Org picker

    // IP confiable (x-real-ip/x-vercel-forwarded-for — no spoofeable por el
    // cliente). x-forwarded-for[0] SÍ es spoofeable: un atacante que lo manda
    // se reescribe su propio rate-limit y envenena audit_log/sessions.ip.
    const ip = trustedIp(context.request);
    const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

    // Prevención de CSRF: Validación de Origin para mutaciones.
    // Fail-CLOSED: antes, si el header Origin venía ausente, el chequeo se
    // saltaba entero (algunos clientes/agentes omiten Origin en ciertas
    // requests simples). Ahora una escritura SIN Origin también se rechaza.
    // Comparación por IGUALDAD EXACTA, no startsWith — "https://cordhq.app"
    // ya no matchea "https://cordhq.app.evil.com".
    //
    if (isWrite && !csrfExempt) {
        const originHeader = context.request.headers.get("origin");
        if (!isAllowedMutationOrigin(path, originHeader, context.url.origin, import.meta.env.SITE as string | undefined)) {
            if (!originHeader && context.request.headers.get('sec-fetch-site') === 'same-origin') {
                log.warn('escritura same-origin sin Origin bloqueada', { route: 'csrf', method, path });
            }
            return new Response(JSON.stringify({ error: "Invalid Origin (CSRF)" }), {
                status: 403,
                headers: { "Content-Type": "application/json" }
            });
        }
    }

    const isApp = path === "/app" || path.startsWith("/app/");

    // Legacy: Ajustes › API / Webhooks se movieron al Cord Workbench (dock de
    // Desarrolladores estilo Stripe, ver src/components/app/DevWorkbench.astro).
    // Redirige a /app abriendo el dock directo en la pestaña correspondiente
    // (?wb=<tab>, leído client-side por DevWorkbench.astro).
    if (path === "/app/ajustes/api" || path === "/app/ajustes/webhooks") {
        const tab = path.endsWith("/api") ? "api" : "webhooks";
        return context.redirect(`/app?wb=${tab}`, 301);
    }

    // Informes consolida las superficies analíticas. 302 durante la primera
    // release para poder revertir sin dejar redirects permanentes en navegador.
    const reportTarget = LEGACY_ROUTES[path as keyof typeof LEGACY_ROUTES];
    if (reportTarget) {
        const destination = new URL(reportTarget, context.url);
            context.url.searchParams.forEach((value: string, key: string) => {
            if (!destination.searchParams.has(key)) destination.searchParams.append(key, value);
        });
        return context.redirect(`${destination.pathname}${destination.search}`, 302);
    }

    const isApi = path.startsWith("/api/");
    const isPublicApi =
        PUBLIC_API_EXACT.includes(path) || PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
    const isOpsPage = path === "/ops" || path.startsWith("/ops/");
    const isOpsApi = path === "/api/ops" || path.startsWith("/api/ops/");
    const isOpsLoginPage = path === "/ops/login";
    const isPublicOpsApi = OPS_PUBLIC_API_EXACT.includes(path);

    // Facturación de la suscripción: superficie propia en billing.cordhq.app.
    // `/billing/entrar` es su ÚNICA puerta sin sesión — canjea el token de
    // traspaso que emite el apex por una sesión de este host (ver
    // `/api/billing/handoff`). El resto exige sesión como /app.
    const isBillingPage = path === "/billing" || path.startsWith("/billing/");
    const isBillingEntry = path === "/billing/entrar";

    // El árbol /billing solo existe bajo su host. En el apex es 404: una misma
    // superficie alcanzable por dos hosts es una superficie con dos políticas de
    // cookie, y tarde o temprano divergen. Mismo criterio que Ops.
    if (isBillingPage && import.meta.env.PROD &&
        normalizedHostname(context.url.hostname || '') !== 'billing.cordhq.app') {
        return new Response('Not found', { status: 404 });
    }

    // La ruta fisica nunca basta para convertirse en Ops. En produccion debe
    // llegar por el hostname canonico; previews y aliases desconocidos fallan
    // cerrados aun si Vercel o Astro cambian el orden de sus rewrites.
    if ((isOpsPage || isOpsApi) && import.meta.env.PROD &&
        normalizedHostname(context.url.hostname || '') !== 'ops.cordhq.app') {
        return new Response(isOpsApi ? JSON.stringify({ error: 'Not found' }) : 'Not found', {
            status: 404,
            headers: isOpsApi ? { 'Content-Type': 'application/json' } : undefined,
        });
    }

    // Carril de identidad independiente: una sesión normal de cliente jamás
    // autoriza Ops. Todo /ops y /api/ops se valida aquí, centralmente, además
    // de los guards locales de las páginas/endpoints sensibles.
    // Se declara fuera del bloque porque el carril de Ops (app.scope='ops', ver
    // withOpsTx en db.ts) se cuelga del reqContext de más abajo, y solo puede
    // encenderse con un operador YA validado aquí.
    let opsOperatorValidado = false;
    if (isOpsPage || isOpsApi) {
        const opsToken = context.cookies.get(OPS_SESSION_COOKIE)?.value;
        const opsOperator = await validateOpsSession(
            opsToken,
            context.request.headers.get('user-agent') || 'desconocido',
        );
        context.locals.opsOperator = opsOperator ?? undefined;
        opsOperatorValidado = !!opsOperator;

        if (isOpsPage && !isOpsLoginPage && !opsOperator) {
            return context.redirect('/ops/login');
        }
        if (isOpsApi && !isPublicOpsApi && !opsOperator) {
            return new Response(JSON.stringify({ error: 'No autenticado' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            });
        }

        if (isOpsApi && !isPublicOpsApi && opsOperator) {
            const [sessionLimit, ipLimit] = await Promise.all([
                strictRateLimit(`ops-api-session:${opsOperator.sessionId}`, 120, 60),
                strictRateLimit(`ops-api-ip:${ip}`, 180, 60),
            ]);
            const limited = strictLimitResponse(!sessionLimit.ok ? sessionLimit : ipLimit);
            if (limited) return limited;
        }
    }

    // Rate limiting en APIs internas (las públicas tienen su propia auth)
    if (isApi && !isPublicApi) {
        const scope = isWrite ? "api-write" : "api-read";
        const limit = isWrite ? 60 : 200;
        if (!allow(ip, scope, limit)) {
            return new Response(
                JSON.stringify({
                    error: "Demasiadas peticiones. Intenta de nuevo en un minuto.",
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Retry-After": "60",
                    },
                },
            );
        }
    }

    // Piso para APIs públicas que antes quedaban fuera del carril interno. El
    // webhook conserva solo el piso global: Stripe puede enviar ráfagas grandes
    // durante redeliveries y su firma ya autentica cada request.
    const isStripeWebhook = path === '/api/stripe/webhook';
    if (isApi && isPublicApi && !isStripeWebhook) {
        if (!allow(ip, 'api-public', 300)) {
            return new Response(
                JSON.stringify({ error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' }),
                {
                    status: 429,
                    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
                },
            );
        }
    }

    // Rate limiting estricto para Auth (login/register) — el carril SAML tiene
    // SU PROPIO scope: 50 empleados detrás del mismo NAT saliente de la
    // oficina (o del propio IdP, que suele reenviar todo desde un puñado de
    // IPs) compartirían un solo trustedIp y agotarían 15/min en minutos. La
    // defensa real de abuso ahí es el rate-limit POR CONEXIÓN dentro de
    // acs.ts (rateLimit('saml-acs:'+cid, ...)), no este piso genérico.
    if (path.startsWith("/api/auth/saml/")) {
        if (!allow(ip, "saml", 120)) { // 120 req/min
            return new Response(JSON.stringify({ error: "Demasiados intentos. Intenta de nuevo en un minuto." }), {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
        }
    } else if (path.startsWith("/api/auth/")) {
        if (!allow(ip, "auth", 15)) { // 15 req/min
            return new Response(JSON.stringify({ error: "Demasiados intentos. Intenta de nuevo en un minuto." }), {
                status: 429,
                headers: { "Content-Type": "application/json", "Retry-After": "60" },
            });
        }
    }

    // Piso global (anti-bot / scraping agresivo)
    if (!allow(ip, "all", 500)) {
        return new Response("Demasiadas peticiones.", {
            status: 429,
            headers: { "Retry-After": "60" },
        });
    }

    // Proteger la app: sin sesión → a /sign-in (evita ver datos / la UI sin auth).
    // Se preserva el path original en redirect_url para que un deep link
    // (ej. /app/cotizaciones/x) no se pierda tras iniciar sesión.
    if (isApp && !userId) {
        return context.redirect(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
    }
    // Sin sesión en billing.cordhq.app se manda al apex a iniciarla, y de vuelta
    // por el traspaso — no a `/sign-in` de este host, donde la cookie que se
    // creara no serviría para el resto de la app.
    if (isBillingPage && !isBillingEntry && !userId) {
        // En dev todo vive en el mismo origen, así que se resuelve local. En prod
        // el login está en el apex: mandarlo a `/sign-in` de este host crearía una
        // cookie que no sirve para el resto de la app.
        const signIn = `/sign-in?redirect_url=${encodeURIComponent('/api/billing/handoff')}`;
        return context.redirect(import.meta.env.PROD ? `https://cordhq.app${signIn}` : signIn);
    }
    // Proteger las APIs internas (operan sobre la org del usuario). Las públicas pasan.
    if (isApi && !isPublicApi && !isOpsApi && !userId) {
        return new Response(JSON.stringify({ error: "No autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Entorno de PRUEBA: la cookie cord_test_mode (seteada por el toggle del org
    // switcher) hace que getActiveOrgId() resuelva la org SANDBOX espejo. Solo
    // aplica al carril de SESIÓN (app + APIs internas): las rutas públicas y el
    // carril de API key (sk_test_) tienen su propia resolución.
    const testMode = !cookieBlind && context.cookies.get("cord_test_mode")?.value === "1";

    // Idioma: este es solo el VALOR INICIAL, adivinado del header Accept-Language.
    // Dentro de /app y de las APIs internas lo pisa el idioma de la ORGANIZACIÓN
    // unas líneas abajo, en resolvePresentationContext() — que corre como PRIMER
    // paso del scope, no como efecto secundario de otra función. Así una cuenta
    // creada en Estados Unidos ve la app en inglés aunque el navegador venga en
    // español, y viceversa.
    // Este valor sigue siendo el efectivo donde no hay organización todavía: el
    // wizard de /onboarding (aún no hay país elegido). El link público
    // /q/[token] y la hosted invoice /i/[token] lo pisan con el idioma DEL
    // NEGOCIO (setRequestLocale en getCotizacionByToken/getFacturaByToken) —
    // el cliente final lee la interfaz en el idioma que el negocio configuró,
    // no en el de su propio navegador.
    // Nunca afecta la landing, que usa su propio sistema de rutas /en/*.
    const acceptLang = context.request.headers.get("accept-language") ?? "";
    const firstLang = acceptLang.split(",")[0]?.trim().toLowerCase() ?? "";
    const locale: "es" | "en" = firstLang.startsWith("en") ? "en" : "es";

    // Exponer el userId Y la org activa a las queries (db.ts →
    // getActiveOrgId) durante todo el render/handler de este request, vía
    // AsyncLocalStorage.
    const response = await reqContext.run({ userId: userId ?? null, sessionId: validatedSessionId, activeOrgId: orgId ?? null, testMode, locale, opsScope: opsOperatorValidado }, async () => {
        // PRIMERO de todo: idioma, divisa y zona horaria de la ORGANIZACIÓN, que
        // pisan la adivinanza por Accept-Language de arriba. Va antes que
        // cualquier otra cosa dentro del scope porque hasta las respuestas de
        // este mismo middleware (el 402 de asiento, los redirects) deben salir
        // en el idioma del negocio.
        //
        // Cubre /app Y las APIs internas: un endpoint interno que responde un
        // error traducido estaba leyendo el Accept-Language de quien llama.
        // Se excluyen la API pública y la de Ops — la primera la consume un
        // servidor ajeno, la segunda es interna de Cord y monolingüe.
        if (userId && (isApp || (isApi && !isPublicApi && !isOpsApi))) {
            await resolvePresentationContext();
        }

        // Public cookie reads and 2FA recovery do not refresh activity. Business
        // APIs, app/billing pages and session-bound passkey enrollment enforce
        // the same idle policy before their handlers can run.
        const sessionBoundAuth = path === '/api/auth/passkeys/register' || path === '/api/auth/passkeys/register-options';
        const privateSessionApi = isApi && !isPublicApi && !isOpsApi && !isTwoFactorRecoveryApi(path, method);
        let securityGates: Awaited<ReturnType<typeof getAppGates>> | undefined;
        if (userId && validatedSessionId && (isApp || (isBillingPage && !isBillingEntry) || privateSessionApi || sessionBoundAuth)) {
            try {
                securityGates = await getAppGates(userId, { strictSecurity: true });
                const active = await authorizeSessionActivity(validatedSessionId, userId, securityGates.sessionTimeoutMin ?? 0);
                if (!active) {
                    clearSessionCookies(context.cookies);
                    if (isApi) return new Response(JSON.stringify({ error: 'Tu sesión venció. Inicia sesión de nuevo.', code: 'session_expired' }), {
                        status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                    });
                    if (isBillingPage) {
                        const signIn = `/sign-in?redirect_url=${encodeURIComponent('/api/billing/handoff')}`;
                        return context.redirect(import.meta.env.PROD ? `https://cordhq.app${signIn}` : signIn);
                    }
                    return context.redirect(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
                }
                if (active.slid && sessionId) setSessionCookies(context.cookies, sessionId);
            } catch (error) {
                log.error('no se pudo verificar la vigencia de la sesión', { route: 'session-security', err: error });
                return new Response(JSON.stringify({ error: 'No pudimos verificar el acceso. Intenta de nuevo.' }), {
                    status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }
        }

        // El confinamiento por 2FA también protege llamadas directas a APIs de
        // negocio. Las excepciones solo permiten completar la verificación.
        if (userId && isApi && !isPublicApi && !isOpsApi && !isTwoFactorRecoveryApi(path, method)) {
            try {
                const gates = securityGates ?? await getAppGates(userId, { strictSecurity: true });
                if (gates.needs2fa) {
                    return new Response(JSON.stringify({
                        error: 'Activa la verificación en dos pasos para continuar.',
                        code: 'two_factor_required',
                        redirectUrl: '/app/ajustes/cuenta?require2fa=1',
                    }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
                }
            } catch (error) {
                log.error('no se pudo verificar la política de 2FA', { route: 'session-security', err: error });
                return new Response(JSON.stringify({ error: 'No pudimos verificar el acceso. Intenta de nuevo.' }), {
                    status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }
        }

        // Un downgrade conserva miembros y datos, pero no puede seguir otorgando
        // asientos premium. El owner siempre conserva acceso para recuperar el
        // pago; los miembros fuera del cupo quedan confinados a su propia cuenta.
        if (userId && (isApp || (isApi && !isPublicApi && !isOpsApi))) {
            const selfServiceApi = path.startsWith('/api/account/') || path === '/api/account' || path === '/api/auth/logout';
            const selfServicePage = path === '/app/aceptacion-legal' ||
                ['/app/ajustes/cuenta', '/app/ajustes/datos', '/app/ajustes/plan']
                    .some((p) => path === p || path.startsWith(p + '/'));
            if (!selfServiceApi && !selfServicePage) {
                try {
                    const active = await getActiveOrgId();
                    const seat = await checkMemberSeatAccess(active, userId);
                    if (!seat.ok) {
                        if (isApi) {
                            return new Response(JSON.stringify({
                                error: 'Este usuario está fuera de los asientos incluidos en la suscripción actual.',
                                code: 'subscription_seat_required',
                            }), { status: 402, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
                        }
                        return context.redirect('/app/ajustes/cuenta?subscription_seat=1');
                    }
                } catch (error) {
                    log.error('no se pudo verificar el asiento', { route: 'subscription', err: error });
                    if (isApi) return new Response(JSON.stringify({ error: 'No pudimos verificar la suscripción.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
                    return context.redirect('/app/ajustes/cuenta?subscription_check=1');
                }
            }
        }
        // Las páginas que materializan datos premium (auditoría, agentes,
        // cobranza y cobranza/agente) verifican su propio entitlement en el
        // frontmatter y muestran el paywall de AccessGate — ya no se resuelve
        // aquí. Antes este bloque redirigía duro a /app/ajustes/plan antes de
        // que la página cargara, así que un clic en "Cobranza" desde el sidebar
        // aterrizaba en Planes sin explicar qué se estaba bloqueando ni ofrecer
        // el paywall persuasivo; el usuario solo veía "me mandó a Planes".
        // Gates de entrada a /app, resueltos en una sola query (getAppGates).
        if (isApp && userId) {
            const securityGatePaths = ['/app/ajustes/cuenta', '/app/ajustes/seguridad'];
            const onSecurityGatePath = securityGatePaths.some((p) => path === p || path.startsWith(p + '/'));
            const legalExemptPaths = ['/app/aceptacion-legal', '/app/ajustes/cuenta', '/app/ajustes/datos', '/app/ajustes/plan'];
            const onLegalExemptPath = legalExemptPaths.some((p) => path === p || path.startsWith(p + '/'));

            // The shared session gate above already checked inactivity atomically.
            const gates = securityGates ?? await getAppGates(userId, { strictSecurity: true });

            // 1) Gate de 2FA obligatorio (jul 2026: el toggle "Exigir 2FA al
            // equipo" en Ajustes › Seguridad se podía prender y no hacía NADA
            // — quedaba guardado en BD sin ningún enforcement). Si la org
            // activa lo exige y el usuario no tiene TOTP, se confina a las
            // dos páginas que le permiten salir de ese estado: activar 2FA, o
            // consultar la configuración. Las APIs de negocio exigen 2FA arriba;
            // solo sus rutas de recuperación quedan disponibles sin completarlo.
            // Tiene prioridad sobre el gate de onboarding: si
            // faltan ambos, primero se resuelve seguridad.
            if (!onSecurityGatePath && gates.needs2fa) {
                return context.redirect('/app/ajustes/cuenta?require2fa=1');
            }

            // 2) El clickwrap personal es obligatorio para operar, pero nunca
            // secuestra las salidas de seguridad/privacidad ni billing: cerrar
            // sesión, exportar o borrar datos y resolver pagos siguen accesibles.
            if (!onLegalExemptPath && !gates.needs2fa && gates.needsLegalAcceptance) {
                return context.redirect(`/app/aceptacion-legal?redirect_url=${encodeURIComponent(path)}`);
            }

            // 3) Gate de onboarding (ago 2026): el dueño de una org que nunca
            // completó el wizard de /onboarding (nombre real de la empresa,
            // rol, giro, para qué usará Cord) se confina ahí. Solo aplica al
            // DUEÑO — un miembro invitado no debe terminar configurando el
            // negocio de otra persona. /onboarding y /api/** viven fuera de
            // isApp, así que nunca se auto-redirige en loop.
            if (!onSecurityGatePath && !gates.needs2fa && !gates.needsLegalAcceptance && gates.needsOnboarding) {
                return context.redirect('/onboarding');
            }
        }
        return next();
    });

    return response;
};

// Capa exterior: decora incluso redirects, 401, 403, 404, 429 y 503 que el
// handler principal devuelve antes de renderizar. Antes esas salidas tempranas
// podian escapar con cache publica y la CSP general.
const securityHeaders = async (context: any, next: any) => {
    const response = await next();
    const path = context.url.pathname;
    const secureRes = new Response(response.body, response);
    const isEmbed = path === "/embed" || path.startsWith("/embed/");
    const isOpsPage = path === "/ops" || path.startsWith("/ops/");
    const isOpsApi = path === "/api/ops" || path.startsWith("/api/ops/");

    if (!isEmbed) {
        // 'unsafe-inline' se mantiene (decenas de <script is:inline> en el
        // repo dependen de él; migrar a CSP con nonce es un proyecto aparte,
        // documentado como pendiente). 'unsafe-eval' SÍ se quita — nada en
        // el bundle lo necesita y es la directiva que de verdad habilita
        // ejecución de código arbitrario vía eval/Function.
        // ⚠️ PostHog: .env.example documenta PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
        // como default, pero el host de ingesta y el de assets estáticos son
        // subdominios DISTINTOS entre sí y de us.posthog.com — si falta cualquiera
        // de los tres aquí, el navegador bloquea el script/las llamadas de captura
        // en silencio (sin error visible salvo en la consola de devtools).
        secureRes.headers.set(
            "Content-Security-Policy",
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://accounts.google.com https://appleid.apple.com https://js.stripe.com; " +
            "connect-src 'self' https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://vitals.vercel-insights.com https://api.stripe.com; " +
            "img-src 'self' data: https:; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com; " +
            "frame-src 'self' https://accounts.google.com https://appleid.apple.com https://js.stripe.com https://hooks.stripe.com; " +
            "frame-ancestors 'self'; " +
            "base-uri 'self'; " +
            "form-action 'self' https://accounts.google.com https://appleid.apple.com; " +
            "object-src 'none';"
        );
        secureRes.headers.set("X-Frame-Options", "SAMEORIGIN");
    }

    secureRes.headers.set("X-Content-Type-Options", "nosniff");
    secureRes.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    // La captura de identidad es la ÚNICA superficie que necesita la cámara, y el
    // token de la sesión viaja en el path — así que también es la única que no
    // puede filtrar su URL por `Referer`, igual que el enlace de recuperación de
    // contraseña.
    const isCapturaIdentidad = path === "/verificar-identidad" || path.startsWith("/verificar-identidad/");
    const isPublicInvoice = path.startsWith('/i/') || path.startsWith('/api/i/');

    secureRes.headers.set(
        "Referrer-Policy",
        path.startsWith("/reset-password") || isCapturaIdentidad || isPublicInvoice ? "no-referrer" : "strict-origin-when-cross-origin",
    );
    // `camera=()` es una allowlist VACÍA: deshabilita getUserMedia incluso para el
    // documento de nivel superior, no sólo para iframes. Se aplicaba a TODA ruta
    // sin excepción, así que en Chromium la pantalla de verificación de identidad
    // fallaba con NotAllowedError ANTES de mostrar el prompt de permiso — el flujo
    // del QR no podía funcionar, y el usuario veía un mensaje genérico de
    // "revisa los permisos de tu navegador" sobre un permiso que nunca se le pidió.
    //
    // `camera=(self)` habilita la cámara sólo en este mismo origen y sólo en esta
    // ruta; todo lo demás sigue con la allowlist vacía.
    secureRes.headers.set(
        "Permissions-Policy",
        `camera=${isCapturaIdentidad ? "(self)" : "()"}, microphone=(), geolocation=(), payment=(self)`,
    );
    if (isCapturaIdentidad || isPublicInvoice) {
        // Una página que lleva una credencial portadora en la URL no se cachea ni
        // se indexa. El `noindex` del layout es un meta tag; esto es el header,
        // que también cubre respuestas no-HTML y crawlers que no ejecutan JS.
        secureRes.headers.set("Cache-Control", "private, no-store, max-age=0");
        secureRes.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    secureRes.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (isOpsPage || isOpsApi) {
        // Ops usa un layout aislado sin analytics, iframes, fuentes ni scripts
        // externos. CSP mucho más cerrada que la landing (que aún necesita
        // inline scripts por deuda histórica) y frame embedding prohibido.
        secureRes.headers.set(
            "Content-Security-Policy",
            "default-src 'self'; " +
            "script-src 'self'; " +
            "script-src-attr 'none'; " +
            "connect-src 'self'; " +
            "img-src 'self' data:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self'; " +
            "frame-src 'none'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'none'; " +
            "form-action 'self'; " +
            "object-src 'none';"
        );
        secureRes.headers.set("X-Frame-Options", "DENY");
        secureRes.headers.set("Cache-Control", "private, no-store, max-age=0");
        secureRes.headers.set("Pragma", "no-cache");
        secureRes.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        secureRes.headers.set("Cross-Origin-Resource-Policy", "same-origin");
        secureRes.headers.set("Cross-Origin-Opener-Policy", "same-origin");
        secureRes.headers.set("Cross-Origin-Embedder-Policy", "require-corp");
        secureRes.headers.set("Referrer-Policy", "no-referrer");
        secureRes.headers.set("Origin-Agent-Cluster", "?1");
        secureRes.headers.set(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), " +
            "bluetooth=(), browsing-topics=(), publickey-credentials-create=(), " +
            "publickey-credentials-get=(self)",
        );
    }
    if (import.meta.env.PROD) {
        secureRes.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    return secureRes;
};

export const onRequest = sequence(customerDomainBoundary, subdomainRewrite, securityHeaders, publicLanguageRouting, mainHandler);
