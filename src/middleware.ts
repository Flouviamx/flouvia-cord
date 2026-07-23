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
const PUBLIC_API_EXACT = ["/api/mcp"];

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

const subdomainRewrite = async (context: any, next: any) => {
    const host = context.request.headers.get("host") || "";
    const path = context.url.pathname;

    if (host.includes("dev.cordhq.app")) {
        // Si visitan explícitamente dev.cordhq.app/dev-blog/..., los redirigimos a dev.cordhq.app/...
        if (path.startsWith("/dev-blog")) {
            let cleanPath = path.replace(/^\/dev-blog/, "") || "/";
            return context.redirect(cleanPath, 301);
        }
        
        // Reescribimos internamente para que dev.cordhq.app sirva las páginas de /dev-blog
        let newPath = `/dev-blog${path === "/" ? "" : path}`;
        if (!newPath.endsWith("/")) newPath += "/";
        return context.rewrite(newPath);
    } else if (host.includes("docs.cordhq.app")) {
        // Mismo patrón para docs.cordhq.app -> /docs
        if (path.startsWith("/docs")) {
            let cleanPath = path.replace(/^\/docs/, "") || "/";
            return context.redirect(cleanPath, 301);
        }
        
        let newPath = `/docs${path === "/" ? "" : path}`;
        if (!newPath.endsWith("/")) newPath += "/";
        return context.rewrite(newPath);
    } else {
        // En producción, prohibimos el acceso directo en el dominio principal y redirigimos a los subdominios correspondientes
        if (import.meta.env.PROD) {
            if (path.startsWith("/dev-blog")) {
                let cleanPath = path.replace(/^\/dev-blog/, "") || "/";
                return context.redirect(`https://dev.cordhq.app${cleanPath}`, 301);
            }
            if (path.startsWith("/docs")) {
                let cleanPath = path.replace(/^\/docs/, "") || "/";
                return context.redirect(`https://docs.cordhq.app${cleanPath}`, 301);
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
