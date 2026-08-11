// src/lib/stripe-cobros.ts
// Read-model de Stripe Connect para el dashboard "Mi dinero" (/app/cobros).
//
// POR QUÉ UN ARCHIVO APARTE Y NO billing.ts: billing.ts es el cliente REST + los
// planes + los medidores de uso + las MUTACIONES de Connect (crear cuenta, adjuntar
// documentos de KYC). Esto es solo lectura y su única salida son DTOs recortados.
// Mezclarlos haría que la página de cobros arrastre la lógica de webhooks y meters.
//
// TRES REGLAS QUE NO SE NEGOCIAN:
//
// 1. WHITELIST, NUNCA SPREAD. Los objetos de Stripe traen el KYC completo del dueño
//    (`account.individual`, `account.company`, `tos_acceptance`), datos bancarios
//    completos y la evidencia de las disputas. Nada de eso tiene por qué llegar al
//    navegador. Cada DTO se construye campo por campo; si algún día se agrega uno
//    nuevo, tiene que escribirse a mano aquí.
//
// 2. TODO SALE EN PESOS. Stripe habla en centavos. La conversión ocurre UNA vez, en
//    el borde del DTO, para que ninguna vista tenga que acordarse de dividir.
//
// 3. FAIL-SOFT POR LLAMADA. Stripe caído no puede tumbar "Mi dinero": los widgets que
//    salen de Neon deben seguir vivos. De ahí `Promise.allSettled` y el array
//    `degraded`, en vez del try/catch que englobaba las dos llamadas y las perdía
//    juntas.

import { stripe, getBalance, retrieveAccount } from './billing';
import { cached } from './cache';
import { rateLimit } from './ratelimit';

/** Centavos → pesos. Único punto de conversión de todo el módulo. */
const toMajor = (cents: unknown): number => Math.round(Number(cents || 0)) / 100;

/** `YYYY-MM-DD` desde un epoch de Stripe (segundos), en hora local. */
function isoDay(epochSec: unknown): string {
    const n = Number(epochSec);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n * 1000);
    // getFullYear/getMonth/getDate y NO toISOString: éste último normaliza a UTC y
    // puede correr la fecha un día completo según la zona (regla del proyecto).
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Medianoche local de `YYYY-MM-DD` en segundos epoch. */
const dayStartEpoch = (iso: string): number => Math.floor(new Date(`${iso}T00:00:00`).getTime() / 1000);
/** Último segundo local de `YYYY-MM-DD`. */
const dayEndEpoch = (iso: string): number => Math.floor(new Date(`${iso}T23:59:59`).getTime() / 1000);

export type PayoutStatus = 'paid' | 'in_transit' | 'pending' | 'failed' | 'canceled';
export type DegradedPart = 'snapshot' | 'payouts' | 'health' | 'range' | 'disputes' | 'ratelimit';

export interface StripeSnapshot {
    available: number;
    pending: number;
    instantAvailable: number;
    /** Fondos retenidos por Stripe como reserva de riesgo. */
    reserved: number;
    currency: string;
    livemode: boolean;
}

export interface PayoutLite {
    id: string;
    amount: number;
    status: PayoutStatus;
    arrivalISO: string;
    createdISO: string;
}

export interface ConnectHealth {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    /** Código de Stripe (`requirements.past_due`, `under_review`…), traducible por catálogo. */
    disabledReason: string | null;
    currentlyDue: number;
    pastDue: number;
    pendingVerification: number;
    /** Fecha límite de Stripe para entregar lo pendiente antes de frenar los depósitos. */
    deadlineISO: string | null;
    bank: { name: string; last4: string } | null;
    /** De dónde salió: 'neon' = columnas ya sincronizadas, sin llamar a Stripe. */
    fromCache: 'neon' | 'stripe';
}

export interface RangeMoney {
    /** Bruto cobrado según Stripe (cargos liquidados en el rango). */
    gross: number;
    /** Comisión total descontada al vendedor. */
    fee: number;
    /** Neto real que llega al banco. Stripe YA lo entrega con la comisión descontada. */
    net: number;
    refunds: number;
    disputes: number;
    txs: number;
    /** Comisión efectiva sobre el bruto, 1 decimal. */
    feePct: number;
    byType: { type: string; gross: number; fee: number; net: number; n: number }[];
    /** Se alcanzó el tope de páginas: los totales son un piso, no el total real. */
    truncated: boolean;
}

export interface DisputeLite {
    id: string;
    amount: number;
    reason: string;
    status: string;
    createdISO: string;
    evidenceDueISO: string | null;
}

export interface CobrosStripe {
    connected: boolean;
    snapshot: StripeSnapshot | null;
    payouts: PayoutLite[];
    health: ConnectHealth | null;
    range: RangeMoney | null;
    disputes: DisputeLite[];
    degraded: DegradedPart[];
}

/** Estado vacío: sandbox, sin Connect, o rate limit alcanzado. Nunca es un error. */
export function emptyCobrosStripe(connected = false, degraded: DegradedPart[] = []): CobrosStripe {
    return { connected, snapshot: null, payouts: [], health: null, range: null, disputes: [], degraded };
}

// ── Balance ───────────────────────────────────────────────────────────────────

/**
 * `/v1/balance` devuelve un array POR DIVISA. La página vieja leía `available[0]` a
 * ciegas, lo que en una cuenta con USD y MXN podía mostrar la divisa equivocada sin
 * ninguna señal. Aquí se elige la divisa con más saldo y se expone cuál es.
 */
export async function getStripeSnapshot(orgId: string, acct: string): Promise<StripeSnapshot> {
    return cached(`stripe:bal:${orgId}`, 60, async () => {
        const bal = await getBalance(acct);
        const pick = (buckets: any[]): Map<string, number> => {
            const m = new Map<string, number>();
            for (const b of buckets || []) m.set(b.currency, (m.get(b.currency) ?? 0) + Number(b.amount || 0));
            return m;
        };
        const available = pick(bal?.available);
        const pending = pick(bal?.pending);
        // Divisa dominante = la de mayor saldo total (disponible + en camino).
        const currencies = new Set([...available.keys(), ...pending.keys()]);
        let currency = 'mxn';
        let best = -Infinity;
        for (const c of currencies) {
            const total = Math.abs(available.get(c) ?? 0) + Math.abs(pending.get(c) ?? 0);
            if (total > best) { best = total; currency = c; }
        }
        const sumFor = (buckets: any[]): number =>
            (buckets || []).filter((b: any) => b.currency === currency).reduce((s: number, b: any) => s + Number(b.amount || 0), 0);
        return {
            available: toMajor(sumFor(bal?.available)),
            pending: toMajor(sumFor(bal?.pending)),
            instantAvailable: toMajor(sumFor(bal?.instant_available)),
            reserved: toMajor(sumFor(bal?.connect_reserved)),
            currency: currency.toUpperCase(),
            livemode: !!bal?.livemode,
        };
    });
}

// ── Depósitos ─────────────────────────────────────────────────────────────────

/**
 * `listPayouts()` de billing.ts no acepta parámetros, así que Stripe devuelve su
 * default de 10 sin forma de pedir más. Aquí se pide explícitamente.
 */
export async function listPayoutsLite(orgId: string, acct: string, limit = 10): Promise<PayoutLite[]> {
    return cached(`stripe:pay:${orgId}:${limit}`, 60, async () => {
        const res = await stripe('/v1/payouts', { limit: String(Math.min(100, Math.max(1, limit))) }, 'GET', { stripeAccount: acct });
        return (res?.data || []).map((p: any): PayoutLite => ({
            id: String(p.id),
            amount: toMajor(p.amount),
            status: (p.status || 'pending') as PayoutStatus,
            arrivalISO: isoDay(p.arrival_date),
            createdISO: isoDay(p.created),
        }));
    });
}

// ── Salud de la cuenta ────────────────────────────────────────────────────────

/**
 * Estado de la cuenta Connect. La fuente primaria son las columnas que el webhook
 * `account.updated` y `connect/status` ya mantienen en `orgs` — así el widget no
 * cuesta ni una llamada a Stripe en el camino caliente.
 *
 * ⚠️ Deliberadamente NO se llama a `/api/billing/connect/status`: ese endpoint
 * ESCRIBE en `orgs` en cada GET y está gateado por el permiso `ajustes`.
 *
 * Solo se cae a `retrieveAccount()` (cacheado 5 min) cuando faltan los requisitos o
 * el banco destino, que es la información que el dueño necesita para desbloquearse.
 */
export async function getConnectHealth(orgId: string, acct: string, org: Record<string, any>): Promise<ConnectHealth> {
    const reqs = org.stripeRequirements ?? org.stripe_requirements ?? null;
    const clabe = String(org.bancoClabe ?? org.banco_clabe ?? '');
    const bankName = String(org.bancoNombre ?? org.banco_nombre ?? '');
    const base: ConnectHealth = {
        chargesEnabled: !!(org.stripeChargesEnabled ?? org.stripe_charges_enabled),
        payoutsEnabled: !!(org.stripePayoutsEnabled ?? org.stripe_payouts_enabled),
        detailsSubmitted: !!(org.stripeDetailsSubmitted ?? org.stripe_details_submitted),
        disabledReason: (org.stripeDisabledReason ?? org.stripe_disabled_reason) || null,
        currentlyDue: Array.isArray(reqs?.currently_due) ? reqs.currently_due.length : 0,
        pastDue: Array.isArray(reqs?.past_due) ? reqs.past_due.length : 0,
        pendingVerification: Array.isArray(reqs?.pending_verification) ? reqs.pending_verification.length : 0,
        deadlineISO: reqs?.current_deadline ? isoDay(reqs.current_deadline) : null,
        bank: clabe ? { name: bankName || '', last4: clabe.slice(-4) } : null,
        fromCache: 'neon',
    };
    if (reqs && base.bank) return base;

    // Enriquecimiento: solo cuando Neon no alcanza. Cacheado 5 min — el KYC no cambia
    // de un minuto a otro y esta llamada trae el objeto Account completo.
    return cached(`stripe:health:${orgId}`, 300, async () => {
        const acc = await retrieveAccount(acct);
        const r = acc?.requirements || {};
        const ext = (acc?.external_accounts?.data || [])[0];
        return {
            chargesEnabled: !!acc?.charges_enabled,
            payoutsEnabled: !!acc?.payouts_enabled,
            detailsSubmitted: !!acc?.details_submitted,
            disabledReason: r.disabled_reason || null,
            currentlyDue: Array.isArray(r.currently_due) ? r.currently_due.length : 0,
            pastDue: Array.isArray(r.past_due) ? r.past_due.length : 0,
            pendingVerification: Array.isArray(r.pending_verification) ? r.pending_verification.length : 0,
            deadlineISO: r.current_deadline ? isoDay(r.current_deadline) : null,
            // SOLO nombre del banco y últimos 4. Nunca routing_number, account_holder_name
            // ni fingerprint — el objeto external_account los trae todos.
            bank: ext ? { name: String(ext.bank_name || bankName || ''), last4: String(ext.last4 || '') } : base.bank,
            fromCache: 'stripe' as const,
        };
    });
}

// ── Bruto → comisión → neto ───────────────────────────────────────────────────

/** Tope de páginas. Sin él, una cuenta con volumen alto cuelga el render. */
const MAX_BT_PAGES = 10;
const BT_PAGE = 100;

/**
 * Reconcilia lo que Neon dice que se facturó contra lo que Stripe realmente depositó.
 * Es la pieza que faltaba: Neon guarda el BRUTO de la cotización, Stripe se queda su
 * comisión, y hasta ahora nada mostraba la diferencia.
 *
 * ⚠️ `balance_transaction.net` YA viene con la comisión descontada. Restar `fee`
 * otra vez descuenta doble — es el error clásico de esta API.
 */
export async function getRangeMoney(orgId: string, acct: string, desde: string, hasta: string): Promise<RangeMoney> {
    return cached(`stripe:range:${orgId}:${desde}:${hasta}`, 60, async () => {
        const rows: any[] = [];
        let startingAfter: string | null = null;
        let truncated = false;
        for (let page = 0; page < MAX_BT_PAGES; page++) {
            const params: Record<string, string> = {
                limit: String(BT_PAGE),
                'created[gte]': String(dayStartEpoch(desde)),
                'created[lte]': String(dayEndEpoch(hasta)),
            };
            if (startingAfter) params.starting_after = startingAfter;
            const res: any = await stripe('/v1/balance_transactions', params, 'GET', { stripeAccount: acct });
            const data: any[] = res?.data || [];
            rows.push(...data);
            if (!res?.has_more || !data.length) { startingAfter = null; break; }
            startingAfter = String(data[data.length - 1].id);
            if (page === MAX_BT_PAGES - 1) truncated = true;
        }

        const CHARGE = new Set(['charge']);
        const REFUND = new Set(['refund']);
        const DISPUTE = new Set(['dispute']);

        const byType = new Map<string, { gross: number; fee: number; net: number; n: number }>();
        let gross = 0, fee = 0, net = 0, refunds = 0, disputes = 0, txs = 0;
        for (const r of rows) {
            // reporting_category es el contrato estable para reportes. `type`
            // también incluye cuotas del procesador y no debe confundirse con
            // contracargos.
            const type = String(r.reporting_category || r.type || 'otro');
            const amount = Number(r.amount || 0);
            const rFee = Number(r.fee || 0);
            const rNet = Number(r.net || 0);
            const slot = byType.get(type) ?? { gross: 0, fee: 0, net: 0, n: 0 };
            slot.gross += amount; slot.fee += rFee; slot.net += rNet; slot.n += 1;
            byType.set(type, slot);
            if (CHARGE.has(type)) { gross += amount; fee += rFee; net += rNet; txs += 1; }
            else if (REFUND.has(type)) refunds += Math.abs(amount);
            else if (DISPUTE.has(type) && amount < 0) disputes += Math.abs(amount);
        }

        return {
            gross: toMajor(gross),
            fee: toMajor(fee),
            net: toMajor(net),
            refunds: toMajor(refunds),
            disputes: toMajor(disputes),
            txs,
            feePct: gross > 0 ? Math.round((fee / gross) * 1000) / 10 : 0,
            byType: [...byType.entries()]
                .map(([type, v]) => ({ type, gross: toMajor(v.gross), fee: toMajor(v.fee), net: toMajor(v.net), n: v.n }))
                .sort((a, b) => Math.abs(b.gross) - Math.abs(a.gross)),
            truncated,
        };
    });
}

// ── Disputas ──────────────────────────────────────────────────────────────────

/** Contracargos abiertos. Solo metadatos: la evidencia nunca sale del servidor. */
export async function listDisputesLite(orgId: string, acct: string, desde: string, hasta: string): Promise<DisputeLite[]> {
    return cached(`stripe:disp:${orgId}:${desde}:${hasta}`, 120, async () => {
        const res = await stripe('/v1/disputes', {
            limit: '20',
            'created[gte]': String(dayStartEpoch(desde)),
            'created[lte]': String(dayEndEpoch(hasta)),
        }, 'GET', { stripeAccount: acct });
        return (res?.data || []).map((d: any): DisputeLite => ({
            id: String(d.id),
            amount: toMajor(d.amount),
            reason: String(d.reason || 'unknown'),
            status: String(d.status || 'unknown'),
            createdISO: isoDay(d.created),
            // Solo la fecha límite. `evidence` y el resto de `evidence_details` traen
            // datos del comprador y de la defensa: se quedan en el servidor.
            evidenceDueISO: d.evidence_details?.due_by ? isoDay(d.evidence_details.due_by) : null,
        }));
    });
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Junta todo lo de Stripe para un rango. Nunca lanza: lo que falle se reporta en
 * `degraded` y la página pinta el resto.
 */
export async function loadCobrosStripe(
    orgId: string,
    acct: string | null,
    rango: { desde: string; hasta: string },
    org: Record<string, any>,
): Promise<CobrosStripe> {
    // Sin cuenta conectada (incluye TODA org sandbox) no se toca la red.
    if (!acct) return emptyCobrosStripe(false);

    // Techo por org. `rateLimit` y NO `strictRateLimit`: éste último falla cerrado en
    // producción cuando Upstash no está configurado, lo que dejaría los widgets de
    // Stripe permanentemente muertos. Aquí no hay superficie privilegiada que proteger,
    // solo gasto de API, así que degradar al contador local es lo correcto.
    const rl = await rateLimit(`stripe:cobros:${orgId}`, 30, 60);
    if (!rl.ok) return emptyCobrosStripe(true, ['ratelimit']);

    const [snapshot, payouts, health, range, disputes] = await Promise.allSettled([
        getStripeSnapshot(orgId, acct),
        listPayoutsLite(orgId, acct, 10),
        getConnectHealth(orgId, acct, org),
        getRangeMoney(orgId, acct, rango.desde, rango.hasta),
        listDisputesLite(orgId, acct, rango.desde, rango.hasta),
    ]);

    const degraded: DegradedPart[] = [];
    const take = <T>(res: PromiseSettledResult<T>, tag: DegradedPart, fallback: T): T => {
        if (res.status === 'fulfilled') return res.value;
        degraded.push(tag);
        console.error(`[stripe-cobros] ${tag} falló para org ${orgId}:`, res.reason?.message || res.reason);
        return fallback;
    };

    return {
        connected: true,
        snapshot: take(snapshot, 'snapshot', null as StripeSnapshot | null),
        payouts: take(payouts, 'payouts', [] as PayoutLite[]),
        health: take(health, 'health', null as ConnectHealth | null),
        range: take(range, 'range', null as RangeMoney | null),
        disputes: take(disputes, 'disputes', [] as DisputeLite[]),
        degraded,
    };
}
