// src/lib/cobros-data.ts
// Carga de datos de "Mi dinero" (/app/cobros). Espejo de `informes-data.ts`: lo
// importan LA PÁGINA (render SSR) y EL ENDPOINT (/api/cobros, refresco por rango),
// de modo que las dos superficies no puedan divergir en qué significa "cobrado".

import { getCobros, getMrrIgualas, getSerieDiaria, getOrg, type CobrosData } from './queries';
import { getActiveOrgId } from './db';
import { compareRangeFor, type Rango } from './rango';
import { loadCobrosStripe, emptyCobrosStripe, type CobrosStripe } from './stripe-cobros';

export interface CobrosPayload {
    rango: Rango;
    /**
     * ¿La org tiene cuenta Connect? Sale de `orgs`, NO de `stripe.connected`: el render
     * SSR pide `withStripe: false` y entonces `stripe` es null, así que derivarlo de ahí
     * daba SIEMPRE false y escondía los widgets de Stripe incluso con la cuenta activa.
     */
    connected: boolean;
    neon: CobrosData;
    /** Mismo tramo de días inmediatamente anterior. `null` en el rango "todo". */
    prev: { totalCobrado: number; txs: number } | null;
    /** Serie diaria de cobro para la gráfica de evolución. */
    daily: { x: string; y: number }[];
    /** Comparativa diaria alineada por índice con `daily`. */
    dailyPrev: { x: string; y: number }[];
    mrr: { mrr: number; n: number; pastDue: number };
    stripe: CobrosStripe | null;
}

/**
 * `withStripe: false` sirve el payload sin tocar la red de Stripe. Lo usa el render
 * SSR: `/v1/balance_transactions` pagina y puede costar hasta 10 viajes de ida y
 * vuelta en frío, así que atarle el TTFB de la página sería regalarle a Stripe la
 * latencia percibida de "Mi dinero". Los widgets que dependen de eso se rellenan
 * después con una sola llamada del cliente.
 */
export async function loadCobros(rango: Rango, opts?: { withStripe?: boolean; minISO?: string }): Promise<CobrosPayload> {
    const orgId = await getActiveOrgId();
    const minISO = opts?.minISO ?? rango.desde;
    const compare = compareRangeFor(rango, minISO);

    const [neon, prevData, serie, mrr, org] = await Promise.all([
        getCobros(rango),
        compare ? getCobros(compare) : Promise.resolve(null),
        // Ya cacheada 30 s, y su campo `cobrado` fusiona cotizaciones pagadas + cuotas
        // de igualas con la MISMA semántica que getCobros(). Reusarla evita mantener
        // dos definiciones de "cobrado por día" que podrían separarse con el tiempo.
        getSerieDiaria(),
        getMrrIgualas(),
        getOrg(),
    ]);

    const inRange = (desde: string, hasta: string) =>
        serie.dias.filter((d: any) => d.fecha >= desde && d.fecha <= hasta)
            .map((d: any) => ({ x: d.fecha as string, y: Number(d.cobrado) || 0 }));

    const acct = (org as any).stripeAccountId || null;
    const stripe = opts?.withStripe ? await loadCobrosStripe(orgId, acct, rango, org as any) : null;

    return {
        rango,
        connected: !!acct,
        neon,
        prev: prevData ? { totalCobrado: prevData.totalCobrado, txs: prevData.txs } : null,
        daily: inRange(rango.desde, rango.hasta),
        dailyPrev: compare ? inRange(compare.desde, compare.hasta) : [],
        mrr,
        stripe,
    };
}

/** Solo la parte de Stripe — lo que el cliente pide tras el primer render. */
export async function loadCobrosStripeOnly(rango: Rango): Promise<CobrosStripe> {
    const orgId = await getActiveOrgId();
    const org = await getOrg();
    const acct = (org as any).stripeAccountId || null;
    if (!acct) return emptyCobrosStripe(false);
    return loadCobrosStripe(orgId, acct, rango, org as any);
}
