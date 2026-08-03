
import { sequence } from "astro:middleware";
import { reqContext } from "./lib/context";

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
const PUBLIC_API_EXACT = ["/api/mcp", "/api/docs-search.json"];

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
    { host: "ops.cordhq.app", prefixes: ["/ops"] },
];

const subdomainRewrite = async (context: any, next: any) => {
    const host = (context.request.headers.get("host") || "").toLowerCase();
    const path = context.url.pathname;

    const sub = SUBDOMAINS.find((s) => host.includes(s.host));
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

import { validateSession } from './lib/auth';
import { trustedIp } from './lib/ip';
import { requiresTwoFactorSetup } from './lib/db';

const mainHandler = async (context: any, next: any) => {
    // Leer sesión desde la cookie 'cord_session' (Fase 3 - Custom Auth)
    const sessionId = context.cookies.get('cord_session')?.value;
    let userId = null;
    if (sessionId) {
        const session = await validateSession(sessionId);
        userId = session?.userId || null;
    }
    const orgId = context.cookies.get('cord_active_org')?.value || null; // Fase 3: Active Org picker

    const path = context.url.pathname;

    // IP confiable (x-real-ip/x-vercel-forwarded-for — no spoofeable por el
    // cliente). x-forwarded-for[0] SÍ es spoofeable: un atacante que lo manda
    // se reescribe su propio rate-limit y envenena audit_log/sessions.ip.
    const ip = trustedIp(context.request);
    const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(context.request.method);

    // Prevención de CSRF: Validación de Origin para mutaciones.
    // Fail-CLOSED: antes, si el header Origin venía ausente, el chequeo se
    // saltaba entero (algunos clientes/agentes omiten Origin en ciertas
    // requests simples). Ahora una escritura SIN Origin también se rechaza.
    // Comparación por IGUALDAD EXACTA, no startsWith — "https://cordhq.app"
    // ya no matchea "https://cordhq.app.evil.com".
    if (isWrite) {
        const originHeader = context.request.headers.get("origin");
        const allowedOrigins = new Set([context.url.origin]);
        if (import.meta.env.SITE) allowedOrigins.add(import.meta.env.SITE as string);
        if (!originHeader || !allowedOrigins.has(originHeader)) {
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

    const isApi = path.startsWith("/api/");
    const isPublicApi =
        PUBLIC_API_EXACT.includes(path) || PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));

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

    // Rate limiting estricto para Auth (login/register)
    if (path.startsWith("/api/auth/")) {
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
    if (isApp && !userId) {
        return context.redirect("/sign-in");
    }
    // Proteger las APIs internas (operan sobre la org del usuario). Las públicas pasan.
    if (isApi && !isPublicApi && !userId) {
        return new Response(JSON.stringify({ error: "No autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Entorno de PRUEBA: la cookie cord_test_mode (seteada por el toggle del org
    // switcher) hace que getActiveOrgId() resuelva la org SANDBOX espejo. Solo
    // aplica al carril de SESIÓN (app + APIs internas): las rutas públicas y el
    // carril de API key (sk_test_) tienen su propia resolución.
    const testMode = context.cookies.get("cord_test_mode")?.value === "1";

    // Idioma: detectado del header Accept-Language del navegador — sin toggle
    // manual (decisión del producto). Aplica a /app/**, /q/[token] y correos
    // transaccionales (que reciben el locale ya resuelto). Nunca afecta la
    // landing pública, que usa su propio sistema de rutas /en/*.
    const acceptLang = context.request.headers.get("accept-language") ?? "";
    const firstLang = acceptLang.split(",")[0]?.trim().toLowerCase() ?? "";
    const locale: "es" | "en" = firstLang.startsWith("en") ? "en" : "es";

    // Exponer el userId Y la org activa a las queries (db.ts →
    // getActiveOrgId) durante todo el render/handler de este request, vía
    // AsyncLocalStorage.
    const response = await reqContext.run({ userId: userId ?? null, activeOrgId: orgId ?? null, testMode, locale }, async () => {
        // Gate de 2FA obligatorio (jul 2026: el toggle "Exigir 2FA al equipo"
        // en Ajustes › Seguridad se podía prender y no hacía NADA — quedaba
        // guardado en BD sin ningún enforcement). Si la org activa lo exige y
        // el usuario no tiene TOTP, se confina a las dos páginas que le
        // permiten salir de ese estado: activar 2FA, o (si es el dueño)
        // apagar el requisito. Nunca bloquea las APIs internas —
        // ajustes/cuenta y ajustes/seguridad dependen de ellas para operar.
        if (isApp && userId) {
            const gatePaths = ['/app/ajustes/cuenta', '/app/ajustes/seguridad'];
            const onGatePath = gatePaths.some((p) => path === p || path.startsWith(p + '/'));
            if (!onGatePath && (await requiresTwoFactorSetup(userId))) {
                return context.redirect('/app/ajustes/cuenta?require2fa=1');
            }
        }
        return next();
    });

    // ── Security Headers ──────────────────────────────────────────────────
    // Se aplican a TODA respuesta (antes solo a text/html — las respuestas
    // JSON de /api/** y el iframe de /embed quedaban sin ninguna protección).
    //
    // /embed/[token] es la ÚNICA página que arma su propio
    // Content-Security-Policy (un frame-ancestors con la allowlist de
    // dominios de CADA org, para permitir que la incrusten en iframes de
    // terceros — ver embed/[token].astro). Ahí NO se sobreescribe el CSP ni
    // se manda X-Frame-Options (lo volvería inembebible); el resto de
    // headers sí se agregan igual.
    const secureRes = new Response(response.body, response);
    const isEmbed = path === "/embed" || path.startsWith("/embed/");

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
    secureRes.headers.set("Referrer-Policy", path.startsWith("/reset-password") ? "no-referrer" : "strict-origin-when-cross-origin");
    secureRes.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
    secureRes.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (import.meta.env.PROD) {
        secureRes.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }
    return secureRes;
};

export const onRequest = sequence(subdomainRewrite, mainHandler);
