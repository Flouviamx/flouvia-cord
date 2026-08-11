// /api/cobros — datos de "Mi dinero" para refrescar sin recargar la página.
//   GET ?rango=30            → payload completo del preset
//   GET ?desde=&hasta=       → rango a la medida
//   GET ?parts=stripe        → SOLO la parte de Stripe (lo que el cliente pide tras
//                              el primer render, para no atarle el TTFB a Stripe)
//
// El gate es `cobranza`, el MISMO de /app/cobros. Antes existía una asimetría real:
// la página gateaba con `cobranza` pero el único endpoint de dinero
// (/api/billing/connect/payouts) exigía `ajustes`, así que un miembro con cobranza y
// sin ajustes veía el saldo por SSR y se comía un 403 desde el navegador.
export const prerender = false;

import type { APIRoute } from 'astro';
import { requirePerm } from '../../lib/queries';
import { getActiveOrgId } from '../../lib/db';
import { loadCobros, loadCobrosStripeOnly } from '../../lib/cobros-data';
import { addDaysISO, parseRangoParams } from '../../lib/rango';
import { rateLimit, tooMany } from '../../lib/ratelimit';

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const rl = await rateLimit(`api:cobros:${orgId}`, 60, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const todayISO = new Date().toISOString().slice(0, 10);
    const minISO = addDaysISO(todayISO, -364);
    const rango = parseRangoParams(url.searchParams, { minISO, maxISO: todayISO, anchorISO: todayISO, fallback: '30' });

    const parts = (url.searchParams.get('parts') || '').split(',').map((p) => p.trim()).filter(Boolean);
    const onlyStripe = parts.length === 1 && parts[0] === 'stripe';
    const withStripe = parts.length === 0 || parts.includes('stripe');

    // Sin cuenta Connect (incluye toda org sandbox) el loader responde `connected:false`
    // sin tocar la red. Eso es 200, no un error — mismo criterio que connect/status.
    const body = onlyStripe
        ? { range: rango, stripe: await loadCobrosStripeOnly(rango) }
        : await loadCobros(rango, { withStripe, minISO });

    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
};
