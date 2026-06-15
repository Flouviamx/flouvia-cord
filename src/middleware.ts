import { clerkMiddleware } from "@clerk/astro/server";
import { reqContext } from "./lib/context";

// APIs que DEBEN seguir públicas (las llaman terceros sin sesión Clerk):
//   /api/q/*       → vista pública del cliente (token secreto)
//   /api/stripe/*  → webhook de Stripe (firma propia)
//   /api/cron/*    → cron de Vercel (protegido por CRON_SECRET)
//   /api/v1/*      → API PÚBLICA (cada ruta se autentica por API key: Bearer)
const PUBLIC_API_PREFIXES = ["/api/q/", "/api/stripe/", "/api/cron/", "/api/v1/"];

export const onRequest = clerkMiddleware((auth, context, next) => {
    const { userId } = auth();
    const path = context.url.pathname;

    const isApp = path === "/app" || path.startsWith("/app/");
    const isApi = path.startsWith("/api/");
    const isPublicApi = PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));

    // Proteger la app: sin sesión → a /login (evita ver datos / la UI sin auth).
    if (isApp && !userId) {
        return context.redirect("/login");
    }
    // Proteger las APIs internas (operan sobre la org del usuario). Las públicas pasan.
    if (isApi && !isPublicApi && !userId) {
        return new Response(JSON.stringify({ error: "No autenticado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Exponer el userId a las queries (db.ts → getActiveOrgId) durante todo el
    // render/handler de este request, vía AsyncLocalStorage.
    return reqContext.run({ userId: userId ?? null }, () => next());
});
