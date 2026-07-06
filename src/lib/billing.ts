// src/lib/billing.ts
// Configuración CENTRAL de Stripe Billing: suscripciones (precio base por plan
// y ciclo) + medidores de uso (overage). REST puro, sin SDK — igual que el resto
// de la integración Stripe del repo (api/stripe/webhook.ts, api/q/.../checkout.ts).
//
// Los price_id / meter_id NO son secretos (sí lo es STRIPE_SECRET_KEY), por eso
// viven aquí en claro. Si André crea nuevos precios en Stripe, se cambian AQUÍ.

import type { PlanId } from './precios';
import { sql } from './db';

export const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export type Cycle = 'mensual' | 'anual';
export type MeterDim = 'api' | 'usuario' | 'ia' | 'timbrado';
export type PaidPlan = Exclude<PlanId, 'free'>;

const isTest = (STRIPE_KEY || '').startsWith('sk_test_') || (STRIPE_KEY || '').startsWith('rk_test_');

// ── Precio base de suscripción por plan y ciclo (recurring flat) ──────────────
export const PLAN_PRICES: Record<PaidPlan, Record<Cycle, string>> = isTest ? {
    starter:   { mensual: 'price_1Tj98JQuD2ZBXFA976GmOJOE', anual: 'price_1Tj98JQuD2ZBXFA9stHNNYwR' },
    pro:       { mensual: 'price_1Tj98KQuD2ZBXFA9w4rgRbAz',  anual: 'price_1Tj98KQuD2ZBXFA9CEtJOY8x' },
    scale:     { mensual: 'price_1Tj98KQuD2ZBXFA9zn9g72ps',  anual: 'price_1Tj98LQuD2ZBXFA94guqWqE7' },
    developer: { mensual: 'price_1Tj98LQuD2ZBXFA9XVA7r2Fz',  anual: 'price_1Tj98LQuD2ZBXFA9f3gEbr7t' },
} : {
    starter:   { mensual: 'price_1TidnNQuD2ZBXFA9dOWBavAE', anual: 'price_1TiekaQuD2ZBXFA9yPYD1WKq' },
    pro:       { mensual: 'price_1Tidx3QuD2ZBXFA99FzBCdJ2', anual: 'price_1TielcQuD2ZBXFA9fPd8XoXx' },
    scale:     { mensual: 'price_1Tie2WQuD2ZBXFA9bd6aMdZr', anual: 'price_1TiemaQuD2ZBXFA9AQBqsypx' },
    developer: { mensual: 'price_1Tie9aQuD2ZBXFA95j6ahOSd', anual: 'price_1TienBQuD2ZBXFA9hEP9OwYR' },
};

// ── Precios MEDIDOS (usage-based) por plan y dimensión ────────────────────────
// Se agregan como items de la suscripción; Stripe los cobra según los meter
// events que reportemos. Starter no cobra usuario extra (tope duro → 1 usuario).
export const METER_PRICES: Record<PaidPlan, Partial<Record<MeterDim, string>>> = isTest ? {
    starter:   { api: 'price_1Tj98NQuD2ZBXFA9RrnYPDtC', ia: 'price_1Tj98NQuD2ZBXFA9TvslIK1h', timbrado: 'price_1Tj98OQuD2ZBXFA9APBme1NU' },
    pro:       { api: 'price_1Tj98OQuD2ZBXFA9PQEZiRUy', usuario: 'price_1Tj98PQuD2ZBXFA9oiBhs22f', ia: 'price_1Tj98OQuD2ZBXFA9qhG8ms3S', timbrado: 'price_1Tj98PQuD2ZBXFA9odb3Zu4I' },
    scale:     { api: 'price_1Tj98QQuD2ZBXFA9AnBCVMYl', usuario: 'price_1Tj98RQuD2ZBXFA9uZHkpmnT', ia: 'price_1Tj98QQuD2ZBXFA9D2eY3J8b', timbrado: 'price_1Tj98QQuD2ZBXFA9aWNVBwl3' },
    developer: { api: 'price_1Tj98RQuD2ZBXFA9gGihI1gA', usuario: 'price_1Tj98SQuD2ZBXFA9f9iLWU2w', ia: 'price_1Tj98RQuD2ZBXFA9tspMUapV', timbrado: 'price_1Tj98SQuD2ZBXFA9VzREjYme' },
} : {
    starter:   { api: 'price_1Tie8yQuD2ZBXFA95QlmfbIj',                                       ia: 'price_1TidsnQuD2ZBXFA9uGEPbBhF', timbrado: 'price_1TiduZQuD2ZBXFA91xtzCz0B' },
    pro:       { api: 'price_1Tie1sQuD2ZBXFA98nejH9l4', usuario: 'price_1TidxsQuD2ZBXFA9t1S7Uang', ia: 'price_1TidyJQuD2ZBXFA9CXUvMZIs', timbrado: 'price_1TidylQuD2ZBXFA9WIRLTZ0L' },
    scale:     { api: 'price_1Tie7OQuD2ZBXFA9RtEcbu8s', usuario: 'price_1Tie4zQuD2ZBXFA9kuhdEOIb', ia: 'price_1Tie5VQuD2ZBXFA9JUizxrkk', timbrado: 'price_1Tie5wQuD2ZBXFA9hLTY2QKi' },
    developer: { api: 'price_1TieClQuD2ZBXFA9dNGVeRox', usuario: 'price_1TieA8QuD2ZBXFA9ZmaQ58oj', ia: 'price_1TieAmQuD2ZBXFA9NZ9980yq', timbrado: 'price_1TieBOQuD2ZBXFA9WJhCjCkG' },
};

// ── IDs de los billing meters (para reportar consumo) ─────────────────────────
// El meter agrega los eventos; el price (de arriba) define la tarifa por plan.
// El event_name de cada meter se resuelve en runtime desde la API y se cachea.
export const METERS: Record<MeterDim, string> = isTest ? {
    api:      'mtr_test_61UsX5itlkw5brJ9A41QuD2ZBXFA9LHk',
    usuario:  'mtr_test_61UsX5jtsxrXVSAA141QuD2ZBXFA90r2',
    ia:       'mtr_test_61UsX5iy1a3BEKWl741QuD2ZBXFA90pk',
    timbrado: 'mtr_test_61UsX5iL0exFIs7P241QuD2ZBXFA9KgS',
} : {
    api:      'mtr_61Us1tKSHBU1Zhk4r41QuD2ZBXFA9QTo',
    usuario:  'mtr_61Us1t8pXL5GiRTZ741QuD2ZBXFA93Ee',
    ia:       'mtr_61Us1pzxJnZQjNBQO41QuD2ZBXFA9Mnw',
    timbrado: 'mtr_61Us1rkh7y3xexhFN41QuD2ZBXFA9DAW',
};

// ── Cuotas mensuales INCLUIDAS por plan (consumo sin costo extra) ─────────────
// null = ilimitado. Alimenta el medidor de uso y la lógica de "tope duro".
export const INCLUDED: Record<PlanId, { ia: number | null; cfdi: number; api: number; usuarios: number | null }> = {
    free:      { ia: 3,    cfdi: 0,    api: 100,   usuarios: 1 },
    starter:   { ia: 20,   cfdi: 3,    api: 1000,  usuarios: 1 },
    pro:       { ia: 50,   cfdi: 20,   api: 5000,  usuarios: 5 },
    scale:     { ia: 500,  cfdi: 100,  api: 10000, usuarios: 15 },
    developer: { ia: null, cfdi: 1000, api: 50000, usuarios: null },
};

// Planes donde el excedente se COBRA (los demás son tope duro).
export const OVERAGE_PLANS: PlanId[] = ['pro', 'scale', 'developer', 'starter'];

// dim del medidor → columna en uso_periodo
export const DIM_COL: Record<MeterDim, 'ia' | 'cfdi' | 'api' | 'usuarios'> = {
    ia: 'ia', timbrado: 'cfdi', api: 'api', usuario: 'usuarios',
};

// Techo de seguridad para planes con excedente: aunque el overage se cobra, un
// múltiplo del incluido corta el gasto runaway de una cuenta comprometida antes
// de que genere una factura enorme de Anthropic/Facturapi.
const OVERAGE_SAFETY_MULTIPLIER = 10;

/**
 * Verifica ANTES de una llamada externa costosa (IA/CFDI) si la org está dentro
 * de su cuota. Planes de tope duro (free) se bloquean al llegar al incluido;
 * planes con excedente se permiten hasta un techo de seguridad (10× incluido).
 * NUNCA lanza: ante cualquier fallo devuelve ok (no bloquear por un error de DB).
 */
export async function checkQuota(orgId: string, dim: MeterDim): Promise<{ ok: boolean; reason?: string }> {
    const col = DIM_COL[dim];
    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
    try {
        const [row] = await sql`
            select coalesce(o.plan, 'free') as plan, up.ia, up.cfdi, up.api, up.usuarios
            from orgs o
            left join uso_periodo up on up.org_id = o.id and up.periodo = ${periodo}
            where o.id = ${orgId}`;
        const plan = ((row?.plan as PlanId) ?? 'free');
        const limit = INCLUDED[plan]?.[col];
        if (limit === null || limit === undefined) return { ok: true }; // ilimitado
        const used = Number(row?.[col] ?? 0);
        const isOverage = OVERAGE_PLANS.includes(plan);
        if (!isOverage) {
            if (used >= limit) return { ok: false, reason: `Alcanzaste el límite de tu plan (${limit} este mes). Sube de plan para seguir usando esta función.` };
            return { ok: true };
        }
        if (used >= limit * OVERAGE_SAFETY_MULTIPLIER) {
            return { ok: false, reason: 'Uso excepcionalmente alto este periodo. Contáctanos para desbloquear.' };
        }
        return { ok: true };
    } catch {
        return { ok: true }; // fail-open: un error de cuota jamás debe romper la operación
    }
}

// ── Reverse map: price_id base → plan (lo usa el webhook para sincronizar) ─────
export const PRICE_TO_PLAN: Record<string, PaidPlan> = (() => {
    const m: Record<string, PaidPlan> = {};
    for (const plan of Object.keys(PLAN_PRICES) as PaidPlan[]) {
        m[PLAN_PRICES[plan].mensual] = plan;
        m[PLAN_PRICES[plan].anual] = plan;
    }
    return m;
})();

export const isPaidPlan = (p: string): p is PaidPlan => p in PLAN_PRICES;

// ── Cliente REST mínimo de Stripe ─────────────────────────────────────────────
export async function stripe(
    path: string,
    params?: Record<string, string>,
    method: 'GET' | 'POST' = 'POST',
    opts?: { version?: string; stripeAccount?: string },
): Promise<any> {
    if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY no configurada');
    const isGet = method === 'GET';
    const body = params ? new URLSearchParams(params).toString() : '';
    const url = isGet && body ? `https://api.stripe.com${path}?${body}` : `https://api.stripe.com${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${STRIPE_KEY}`,
            ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
            ...(opts?.version ? { 'Stripe-Version': opts.version } : {}),
            ...(opts?.stripeAccount ? { 'Stripe-Account': opts.stripeAccount } : {}),
        },
        body: isGet ? undefined : body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
    return data;
}

// Crea (o reutiliza) el customer de Stripe de la org. Guarda el id en Neon.
// Auto-sana: si el id guardado no existe bajo la API key actual (cambio de
// cuenta o de modo test↔live), se recrea en vez de fallar ("No such customer").
export async function getOrCreateCustomer(orgId: string, email?: string, nombre?: string): Promise<string> {
    const [o] = await sql`select stripe_customer_id from orgs where id = ${orgId}`;
    const existing = o?.stripe_customer_id as string | undefined;
    if (existing) {
        try {
            const c = await stripe(`/v1/customers/${existing}`, undefined, 'GET');
            if (c && !c.deleted) return existing;
        } catch { /* no existe bajo esta key → recrear abajo */ }
    }
    const cus = await stripe('/v1/customers', {
        ...(email ? { email } : {}),
        ...(nombre ? { name: nombre } : {}),
        'metadata[org_id]': orgId,
    });
    await sql`update orgs set stripe_customer_id = ${cus.id} where id = ${orgId}`;
    return cus.id as string;
}

// Resuelve el event_name de un meter (cacheado por proceso).
const _eventNames: Partial<Record<MeterDim, string>> = {};
async function meterEventName(dim: MeterDim): Promise<string> {
    if (_eventNames[dim]) return _eventNames[dim]!;
    const m = await stripe(`/v1/billing/meters/${METERS[dim]}`, undefined, 'GET');
    _eventNames[dim] = m.event_name as string;
    return m.event_name as string;
}

// Reporta consumo: incrementa el contador del periodo en Neon (para la UI en
// vivo) y manda el meter event a Stripe (para el cobro de excedente). NUNCA
// lanza: medir el uso jamás debe romper la operación que lo originó.
export async function reportUsage(orgId: string, dim: MeterDim, value = 1): Promise<void> {
    const col = DIM_COL[dim];
    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
    try {
        // Upsert del contador del periodo. neon-serverless no tiene sql.unsafe, así
        // que cada columna tiene su propia sentencia (segura, sin interpolar).
        if (col === 'ia') {
            await sql`insert into uso_periodo (org_id, periodo, ia) values (${orgId}, ${periodo}, ${value})
                      on conflict (org_id, periodo) do update set ia = uso_periodo.ia + ${value}, updated_at = now()`;
        } else if (col === 'cfdi') {
            await sql`insert into uso_periodo (org_id, periodo, cfdi) values (${orgId}, ${periodo}, ${value})
                      on conflict (org_id, periodo) do update set cfdi = uso_periodo.cfdi + ${value}, updated_at = now()`;
        } else if (col === 'api') {
            await sql`insert into uso_periodo (org_id, periodo, api) values (${orgId}, ${periodo}, ${value})
                      on conflict (org_id, periodo) do update set api = uso_periodo.api + ${value}, updated_at = now()`;
        } else {
            await sql`insert into uso_periodo (org_id, periodo, usuarios) values (${orgId}, ${periodo}, ${value})
                      on conflict (org_id, periodo) do update set usuarios = uso_periodo.usuarios + ${value}, updated_at = now()`;
        }
    } catch { /* tabla aún no migrada: no bloquear la operación */ }

    if (!STRIPE_KEY) return;
    try {
        const [o] = await sql`select stripe_customer_id from orgs where id = ${orgId}`;
        const cus = o?.stripe_customer_id as string | undefined;
        if (!cus) return; // sin suscripción de pago → no se reporta a Stripe
        const event_name = await meterEventName(dim);
        await stripe('/v1/billing/meter_events', {
            event_name,
            'payload[stripe_customer_id]': cus,
            'payload[value]': String(value),
        });
    } catch { /* best-effort: Stripe reintenta vía dashboard si hace falta */ }
}

// ── Stripe Connect (Pagos directos a la cuenta del dueño) ─────────────────────

export async function createConnectAccount(orgId: string, type: 'standard' | 'express'): Promise<string> {
    const acc = await stripe('/v1/accounts', {
        type,
        country: 'MX', // default a MX por ahora
        'metadata[org_id]': orgId,
    });
    return acc.id;
}

export async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
    const link = await stripe('/v1/account_links', {
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
    });
    return link.url;
}

// `state` DEBE ser un nonce aleatorio (anti-CSRF), guardado en cookie httpOnly y
// verificado en el callback — NUNCA el orgId (es un valor conocido/adivinable, lo
// que permitiría a un atacante enganchar SU Stripe a la org de una víctima).
export function getConnectOAuthUrl(state: string, redirectUri: string): string {
    const clientId = import.meta.env.STRIPE_CONNECT_CLIENT_ID || process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) throw new Error('STRIPE_CONNECT_CLIENT_ID no configurada');
    const u = new URL('https://connect.stripe.com/oauth/authorize');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', clientId);
    u.searchParams.set('scope', 'read_write');
    u.searchParams.set('state', state);
    u.searchParams.set('redirect_uri', redirectUri);
    return u.toString();
}

export async function exchangeOAuthCode(code: string): Promise<string> {
    const res = await stripe('/oauth/token', {
        grant_type: 'authorization_code',
        code,
    });
    if (!res.stripe_user_id) throw new Error('No se pudo obtener el account id');
    return res.stripe_user_id;
}

export async function getAccountStatus(accountId: string): Promise<{ charges_enabled: boolean }> {
    const acc = await stripe(`/v1/accounts/${accountId}`, undefined, 'GET');
    return { charges_enabled: !!acc.charges_enabled };
}
