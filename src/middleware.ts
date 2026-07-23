import { clerkMiddleware } from "@clerk/astro/server";
import { sequence } from "astro:middleware";
import { reqContext } from "./lib/context";

// APIs que DEBEN seguir públicas (las llaman terceros sin sesión Clerk):
//   /api/q/*         → vista pública del cliente (token secreto)
//   /api/stripe/*    → webhook de Stripe (firma propia)
//   /api/cron/*      → cron de Vercel (protegido por CRON_SECRET)
//   /api/v1/*        → API PÚBLICA (cada ruta se autentica por API key: Bearer)
//   /api/mcp/sse|message → transporte MCP (se autentica por API key: Bearer)
//   /api/clerk/*     → webhooks de Clerk (se autentican por firma Svix)
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
// tu teléfono" (sin sesión Clerk en el celular; el token aleatorio de 10 min es
// la credencial — ver identity_capture_sessions). OJO: el prefijo exige la barra
// final para NO alcanzar /api/billing/connect/capture-session (esa SÍ requiere
// sesión — la crea el escritorio autenticado).
const PUBLIC_API_PREFIXES = ["/api/q/", "/api/stripe/", "/api/cron/", "/api/v1/", "/api/mcp/sse", "/api/mcp/message", "/api/clerk/", "/api/contacto/", "/api/billing/connect/capture/"];
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
const SUBDOMAINS = [
    { host: "dev.cordhq.app", prefix: "/dev-blog" },
    { host: "docs.cordhq.app", prefix: "/docs" },
];

const subdomainRewrite = async (context: any, next: any) => {
    const host = (context.request.headers.get("host") || "").toLowerCase();
    const path = context.url.pathname;

    const sub = SUBDOMAINS.find((s) => host.includes(s.host));
    if (sub) {
        // Idempotente + a prueba de bucles: si el path YA vive bajo el prefijo (porque
        // context.rewrite re-ejecuta el middleware, o porque los links internos ya lo
        // incluyen — p.ej. DocsLayout usa /docs/*), se sirve tal cual. Nunca se
        // re-reescribe (evita /dev-blog/dev-blog/... y ping-pong de redirecciones).
        // También se dejan pasar los endpoints internos de Astro (/_image, /_server-islands,
        // /_actions) y el 404 (el [slug] del dev-blog redirige a /404 en slug inexistente;
        // sin esta salida se generaría un bucle /404 → /dev-blog/404 → /404).
        if (
            path === sub.prefix ||
            path.startsWith(sub.prefix + "/") ||
            path.startsWith("/_") ||
            path === "/404"
        ) {
            return next();
        }
        // Reescritura INTERNA: la URL del navegador no cambia; se sirve el árbol del
        // prefijo bajo el subdominio. Sirve sobre todo para la RAÍZ del subdominio
        // (dev.cordhq.app/ → /dev-blog, docs.cordhq.app/ → /docs): la raíz "/" matchea
        // la ruta index → status 200 correcto.
        //
        // ⚠️ El resto de páginas del dev-blog/docs enlazan con su prefijo (/dev-blog/*,
        // /docs/*), así que el navegador pide directo un path que matchea ruta → 200 vía
        // el guard de arriba, SIN pasar por este rewrite. Esto es a propósito: Astro fija
        // el status HTTP según si el path ORIGINAL matchea una ruta, en una capa por
        // ENCIMA del middleware — un path raíz-limpio (/<slug>) que no matchea ninguna
        // ruta se sirve con 404 aunque el contenido renderice, y no se puede corregir
        // desde aquí. Por eso los links llevan el prefijo (ver DevBlogLayout).
        return next(sub.prefix + (path === "/" ? "" : path));
    }

    // Dominio principal (cordhq.app): en prod, el contenido de los subdominios no debe
    // vivir también en cordhq.app/dev-blog|/docs (evita contenido duplicado / SEO split).
    // Estas rutas son SSR, así que este middleware sí corre para ellas.
    if (import.meta.env.PROD) {
        for (const s of SUBDOMAINS) {
            if (path === s.prefix || path.startsWith(s.prefix + "/")) {
                // ⚠️ Se PRESERVA el prefijo en el destino (no se recorta). Un deep link
                // como cordhq.app/docs/pagos/resumen debe caer en
                // docs.cordhq.app/docs/pagos/resumen (matchea ruta → 200). Si se recortara
                // a docs.cordhq.app/pagos/resumen, el contenido renderiza pero con status
                // 404 (Astro fija el status por match de la ruta ORIGINAL — ver arriba).
                return context.redirect(`https://${s.host}${path}`, 301);
            }
        }
    }

    return next();
};

const mainHandler = clerkMiddleware((auth, context, next) => {
    const { userId, orgId } = auth();
    const path = context.url.pathname;

    const ip =
        context.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
    const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(context.request.method);

    const isApp = path === "/app" || path.startsWith("/app/");
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

    // Exponer el userId Y la org activa de Clerk a las queries (db.ts →
    // getActiveOrgId) durante todo el render/handler de este request, vía
    // AsyncLocalStorage.
    return reqContext.run({ userId: userId ?? null, clerkOrgId: orgId ?? null, testMode, locale }, () => next());
});

export const onRequest = sequence(subdomainRewrite, mainHandler);
