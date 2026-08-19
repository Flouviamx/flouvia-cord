
import { sequence } from "astro:middleware";
import { reqContext } from "./lib/context";
import { LEGACY_ROUTES } from "./lib/informes";
import { isAllowedMutationOrigin, isCsrfExemptWrite } from './lib/csrf-policy';

// APIs que DEBEN seguir públicas (las llaman terceros sin sesión):
//   /api/q/*         → vista pública del cliente (token secreto)
//   /api/stripe/*    → webhook de Stripe (firma propia)
//   /api/cron/*      → cron de Vercel (protegido por CRON_SECRET)
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
const PUBLIC_API_PREFIXES = ["/api/q/", "/api/stripe/", "/api/cron/", "/api/v1/", "/api/mcp/sse", "/api/mcp/message", "/api/auth/", "/api/contacto/", "/api/billing/connect/capture/"];
// Solo los tres endpoints que CREAN una sesión de Ops son públicos. Cualquier
// futura API bajo /api/ops queda privada por default y exige sesión Ops válida.
const OPS_PUBLIC_API_EXACT = [
    "/api/ops/auth",
    "/api/ops/passkey-options",
    "/api/ops/passkey-verify",
];
const PUBLIC_API_EXACT = ["/api/mcp", "/api/docs-search.json", "/api/geo", ...OPS_PUBLIC_API_EXACT];

// Exención CSRF independiente de "API pública". Solo entra aquí una mutación
// que se autentica con una credencial que el navegador no adjunta por sí solo
// (firma HMAC, Bearer o CRON_SECRET) y cuyo handler no debe leer cookies.
//
// No reutilizar PUBLIC_API_PREFIXES: ahí también viven /api/auth/*, /api/q/*,
// /api/contacto/* y capture/*, que sí reciben llamadas de navegador y dependen
// de cookies o tokens en URL; exentarlas convertiría una ruta pública en CSRF.
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
    { host: "dev.cordhq.app", prefixes: ["/dev-blog"] },
    { host: "docs.cordhq.app", prefixes: ["/docs", "/en/docs"] },
    // /api/ops debe pasar sin reescribirse: el formulario vive en el mismo
    // subdominio y llama a esos endpoints. Antes terminaba como
    // /ops/api/ops/auth y el login devolvía 404 en producción.
    { host: "ops.cordhq.app", prefixes: ["/ops", "/api/ops"] },
    // Facturación de la suscripción a Cord: superficie propia, fuera del chrome
    // de la app, como la del procesador que sustituye. `/api/billing` viaja con
    // ella porque la página llama a esos endpoints y la política CSRF exige
    // mismo origen: servida desde billing.cordhq.app, un fetch al apex sería
    // cross-origin y se rechazaría con 403.
    { host: "billing.cordhq.app", prefixes: ["/billing", "/api/billing"] },
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
        if (matchedPrefix || path.startsWith("/_") || path === "/404") {
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

import { validateSession, invalidateSession, SESSION_COOKIE, setSessionCookies, clearSessionCookies } from './lib/auth';
import { OPS_SESSION_COOKIE, validateOpsSession } from './lib/ops-auth';
import { trustedIp } from './lib/ip';
import { getAppGates, getActiveOrgId } from './lib/db';
import { checkMemberSeatAccess } from './lib/org-entitlements';
import { strictLimitResponse, strictRateLimit } from './lib/ratelimit';
import { log } from './lib/log';

const mainHandler = async (context: any, next: any) => {
    const path = context.url.pathname;
    const method = context.request.method;
    const csrfExempt = isCsrfExemptWrite(path, method);

    // Leer sesión desde la cookie 'cord_session' (Fase 3 - Custom Auth)
    // Las rutas CSRF-exempt son deliberadamente ciegas a cookies. Si una ruta se
    // agrega por error a la lista, pierde el contexto de usuario/org y falla 401
    // dentro de su handler en vez de heredar autoridad ambiental del navegador.
    const sessionId = csrfExempt ? undefined : context.cookies.get(SESSION_COOKIE)?.value;
    let userId = null;
    let validatedSessionId: string | null = null;
    let sessionIdleMs = 0;
    if (sessionId) {
        const session = await validateSession(sessionId);
        userId = session?.userId || null;
        validatedSessionId = session?.sessionId || null;
        sessionIdleMs = session?.idleMs ?? 0;
        if (session) {
            // La sesión se desliza en BD en cada visita (validateSession), pero el
            // Max-Age de la cookie del navegador se fijaba una sola vez al hacer
            // login — sin esto, el navegador borraba la cookie a los 30 días
            // exactos del login aunque el usuario entrara todos los días. Cuando
            // `slid` viene true (throttle de 5 min ya cumplido) se re-emiten
            // AMBAS cookies (la de sesión con el mismo token crudo ya en la mano,
            // y el hint no-httpOnly que lee el navbar público) con un Max-Age
            // renovado — `context.cookies.set(...)` se adjunta a la respuesta que
            // sea que este handler termine devolviendo (attachCookiesToResponse
            // de Astro tagea el jar completo sobre el Response final).
            if (session.slid) {
                setSessionCookies(context.cookies, sessionId);
            }
        } else {
            // Cookie presente pero la sesión ya no es válida (expiró, fue
            // revocada, o la cuenta se suspendió) — sin esto la cookie muerta
            // se quedaba en el navegador hasta su Max-Age original, y el hint
            // seguía diciendo "hay sesión" aunque ya no la hubiera.
            clearSessionCookies(context.cookies);
        }
    }
    const orgId = csrfExempt ? null : (context.cookies.get('cord_active_org')?.value || null); // Fase 3: Active Org picker

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
    if (isOpsPage || isOpsApi) {
        const opsToken = context.cookies.get(OPS_SESSION_COOKIE)?.value;
        const opsOperator = await validateOpsSession(
            opsToken,
            context.request.headers.get('user-agent') || 'desconocido',
        );
        context.locals.opsOperator = opsOperator ?? undefined;

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
    const testMode = !csrfExempt && context.cookies.get("cord_test_mode")?.value === "1";

    // Idioma: este es el VALOR INICIAL, detectado del header Accept-Language del
    // navegador. Dentro de /app y de las APIs internas lo sobrescribe el idioma
    // de la ORGANIZACIÓN (orgs.idioma, derivado del país al crear la cuenta) en
    // cuanto se resuelve — ver setRequestLocale() en lib/context.ts, invocado
    // desde getAppGates() y getOrg(). Así una cuenta creada en Estados Unidos ve
    // la app en inglés aunque el navegador venga en español, y viceversa.
    // Sigue siendo el valor efectivo donde no hay organización todavía: el wizard
    // de /onboarding (aún no hay país elegido) y el link público /q/[token].
    // Nunca afecta la landing, que usa su propio sistema de rutas /en/*.
    const acceptLang = context.request.headers.get("accept-language") ?? "";
    const firstLang = acceptLang.split(",")[0]?.trim().toLowerCase() ?? "";
    const locale: "es" | "en" = firstLang.startsWith("en") ? "en" : "es";

    // Exponer el userId Y la org activa a las queries (db.ts →
    // getActiveOrgId) durante todo el render/handler de este request, vía
    // AsyncLocalStorage.
    const response = await reqContext.run({ userId: userId ?? null, sessionId: validatedSessionId, activeOrgId: orgId ?? null, testMode, locale }, async () => {
        // Un downgrade conserva miembros y datos, pero no puede seguir otorgando
        // asientos premium. El owner siempre conserva acceso para recuperar el
        // pago; los miembros fuera del cupo quedan confinados a su propia cuenta.
        if (userId && (isApp || (isApi && !isPublicApi && !isOpsApi))) {
            const selfServiceApi = path.startsWith('/api/account/') || path === '/api/account' || path === '/api/auth/logout';
            const selfServicePage = path === '/app/ajustes/cuenta' || path.startsWith('/app/ajustes/cuenta/');
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
            const gatePaths = ['/app/ajustes/cuenta', '/app/ajustes/seguridad'];
            const onGatePath = gatePaths.some((p) => path === p || path.startsWith(p + '/'));

            // 0) Cierre de sesión por inactividad (orgs.session_timeout_min):
            // se guardaba en Ajustes › Seguridad desde jul 2026 pero ningún
            // código lo aplicaba — una org podía "exigir" cierre a 1h y la
            // sesión seguía viva 30 días igual. `sessionIdleMs` es el tiempo
            // transcurrido desde el ÚLTIMO request verificado (calculado en
            // validateSession ANTES de tocar la fila), comparado contra el
            // límite de la org ACTIVA (0 = sin límite). Al vencer: se invalida
            // la sesión en BD, se limpian ambas cookies, y se manda a
            // /sign-in — igual que una sesión expirada por cualquier otra vía.
            const gates = await getAppGates(userId);
            if (gates.sessionTimeoutMin > 0 && sessionIdleMs > gates.sessionTimeoutMin * 60_000) {
                if (sessionId) await invalidateSession(sessionId);
                clearSessionCookies(context.cookies);
                return context.redirect(`/sign-in?redirect_url=${encodeURIComponent(path)}`);
            }

            // 1) Gate de 2FA obligatorio (jul 2026: el toggle "Exigir 2FA al
            // equipo" en Ajustes › Seguridad se podía prender y no hacía NADA
            // — quedaba guardado en BD sin ningún enforcement). Si la org
            // activa lo exige y el usuario no tiene TOTP, se confina a las
            // dos páginas que le permiten salir de ese estado: activar 2FA, o
            // (si es el dueño) apagar el requisito. Nunca bloquea las APIs
            // internas — ajustes/cuenta y ajustes/seguridad dependen de ellas
            // para operar. Tiene prioridad sobre el gate de onboarding: si
            // faltan ambos, primero se resuelve seguridad.
            if (!onGatePath && gates.needs2fa) {
                return context.redirect('/app/ajustes/cuenta?require2fa=1');
            }

            // 2) Gate de onboarding (ago 2026): el dueño de una org que nunca
            // completó el wizard de /onboarding (nombre real de la empresa,
            // rol, giro, para qué usará Cord) se confina ahí. Solo aplica al
            // DUEÑO — un miembro invitado no debe terminar configurando el
            // negocio de otra persona. /onboarding y /api/** viven fuera de
            // isApp, así que nunca se auto-redirige en loop.
            if (!onGatePath && !gates.needs2fa && gates.needsOnboarding) {
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
            "style-src 'self' 'unsafe-inline'; " +
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
    secureRes.headers.set("Referrer-Policy", path.startsWith("/reset-password") ? "no-referrer" : "strict-origin-when-cross-origin");
    secureRes.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
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

export const onRequest = sequence(subdomainRewrite, securityHeaders, mainHandler);
