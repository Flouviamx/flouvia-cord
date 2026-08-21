// src/lib/billing.ts
// Configuración CENTRAL de Stripe Billing: suscripciones (precio base por plan
// y ciclo) + medidores de uso (overage). REST puro, sin SDK — igual que el resto
// de la integración Stripe del repo (api/stripe/webhook.ts, api/q/.../checkout.ts).
//
// Los price_id / meter_id NO son secretos (sí lo es STRIPE_SECRET_KEY), por eso
// viven aquí en claro. Si André crea nuevos precios en Stripe, se cambian AQUÍ.

import { randomUUID } from 'node:crypto';
import type { PlanId, PaidPlan } from './entitlements';
import { sql, withOrgTx, withSystemTx } from './db';
import { getEntitlementContext } from './org-entitlements';
import { platformCurrencyFor, type PlatformCurrency } from './plan-currency';

import { log } from './log';
export const STRIPE_KEY = import.meta.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

export type Cycle = 'mensual' | 'anual';
// Dimensiones que SÍ tienen meter de Stripe y pueden generar excedente cobrado.
export type MeterDim = 'api' | 'usuario' | 'ia' | 'timbrado';
// 'envios' es un tope duro de Gratis (cotizaciones enviadas/mes) sin meter: no
// se le cobra a nadie, solo cierra el hueco de que "cotizaciones activas" es un
// stock reciclable (cerrar un trato libera cupo, así que un vendedor disciplinado
// nunca tocaba el límite). Nunca se agrega a METER_PRICES/METERS/allowsOverage.
export type UsageDim = MeterDim | 'envios';
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
    scale:     { api: 'price_1Tie7OQuD2ZBXFA9RtEcbu8s', usuario: 'price_1U45ebQuD2ZBXFA97TI8pA55', ia: 'price_1Tie5VQuD2ZBXFA9JUizxrkk', timbrado: 'price_1Tie5wQuD2ZBXFA9hLTY2QKi' },
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

// ── Divisa de plataforma y resolución de precios ──────────────────────────────
// Cord cobra sus planes en MXN a los negocios mexicanos y en USD al resto
// (`plan-currency.ts`). En Stripe eso son `currency_options` sobre los MISMOS
// Price: no hay precios USD paralelos, porque los Price de arriba ya tienen
// suscripciones live y duplicarlos partiría en dos el catálogo.
//
// El resolvedor existe para que esa decisión sea reversible en UN lugar. Si en
// algún momento hiciera falta un Price distinto por divisa, cambia el cuerpo de
// `priceFor()`/`meterPricesFor()` y ningún llamador se entera.

/** Price base para (plan, ciclo) en la divisa dada. */
export function priceFor(plan: PaidPlan, cycle: Cycle, _currency: PlatformCurrency): string {
    return PLAN_PRICES[plan][cycle];
}

/** Prices medidos del plan en la divisa dada, en orden estable. */
export function meterPricesFor(plan: PaidPlan, _currency: PlatformCurrency): string[] {
    return Object.values(METER_PRICES[plan]).filter((id): id is string => Boolean(id));
}

/**
 * Divisa en la que se le cobra a ESTA organización.
 *
 * `billing_currency` es la evidencia de una factura real y por eso gana sobre el
 * país: Stripe congela `customer.currency` en el primer cobro. Ver
 * `plan-currency.ts` para el contrato completo.
 */
export async function platformCurrencyForOrg(orgId: string): Promise<PlatformCurrency> {
    const [o] = await sql`select country_code, billing_currency from orgs where id = ${orgId}`;
    return platformCurrencyFor(o?.country_code, o?.billing_currency);
}

// ── Cuotas mensuales INCLUIDAS por plan (consumo sin costo extra) ─────────────
// null = ilimitado. Alimenta el medidor de uso y la lógica de "tope duro".
// `envios` solo tiene número en Free (5); en el resto de los planes es null
// (sin tope) porque las cotizaciones activas/ilimitadas de Starter+ ya son la
// palanca de negocio — el tope de envíos es puramente el gancho de conversión
// de Gratis.
export const INCLUDED: Record<PlanId, { ia: number | null; cfdi: number; api: number; usuarios: number | null; envios: number | null }> = {
    free:      { ia: 3,    cfdi: 3,    api: 100,   usuarios: 1,    envios: 5 },
    starter:   { ia: 20,   cfdi: 3,    api: 1000,  usuarios: 1,    envios: null },
    pro:       { ia: 50,   cfdi: 20,   api: 5000,  usuarios: 5,    envios: null },
    scale:     { ia: 500,  cfdi: 100,  api: 10000, usuarios: 15,   envios: null },
    developer: { ia: null, cfdi: 1000, api: 50000, usuarios: null, envios: null },
};

// Matriz de excedentes del contrato comercial. Starter permite excedente de
// IA/CFDI/API, pero su asiento único sí es tope duro; desde Pro los cuatro
// medidores tienen overage. 'envios' nunca tiene overage: es tope duro puro
// de Gratis, sin meter de Stripe detrás.
export function allowsOverage(plan: PlanId, dim: UsageDim): boolean {
    if (dim === 'envios') return false;
    if (plan === 'free') return false;
    if (dim === 'usuario') return plan === 'pro' || plan === 'scale' || plan === 'developer';
    return true;
}

// dim de uso → columna en uso_periodo
export const DIM_COL: Record<UsageDim, 'ia' | 'cfdi' | 'api' | 'usuarios' | 'envios'> = {
    ia: 'ia', timbrado: 'cfdi', api: 'api', usuario: 'usuarios', envios: 'envios',
};

// Techo de seguridad para planes con excedente: aunque el overage se cobra, un
// múltiplo del incluido corta el gasto runaway de una cuenta comprometida antes
// de que genere una factura enorme de Anthropic/Facturapi.
const OVERAGE_SAFETY_MULTIPLIER = 10;

/**
 * Verifica ANTES de una llamada externa costosa (IA/CFDI) si la org está dentro
 * de su cuota. Planes de tope duro (free) se bloquean al llegar al incluido;
 * planes con excedente se permiten hasta un techo de seguridad (10× incluido).
 * Fail-closed: si no se puede demostrar cuota disponible, no se autoriza una
 * llamada externa costosa. `reserveUsage()` es el gate atómico definitivo.
 */
export async function checkQuota(orgId: string, dim: MeterDim): Promise<{ ok: boolean; reason?: string }> {
    const col = DIM_COL[dim];
    const periodo = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
    try {
        const context = await getEntitlementContext(orgId);
        const [[row]] = await withOrgTx(orgId, sql`
            select ia, cfdi, api, usuarios from uso_periodo
             where org_id = ${orgId} and periodo = ${periodo}`);
        const plan = context.effectivePlan;
        const limit = INCLUDED[plan]?.[col];
        if (limit === null || limit === undefined) return { ok: true }; // ilimitado
        const used = Number(row?.[col] ?? 0);
        const isOverage = allowsOverage(plan, dim);
        if (!isOverage) {
            if (used >= limit) return { ok: false, reason: `Alcanzaste el límite de tu plan (${limit} este mes). Sube de plan para seguir usando esta función.` };
            return { ok: true };
        }
        if (used >= limit * OVERAGE_SAFETY_MULTIPLIER) {
            return { ok: false, reason: 'Uso excepcionalmente alto este periodo. Contáctanos para desbloquear.' };
        }
        return { ok: true };
    } catch (error) {
        log.error('no se pudo verificar cuota', { route: 'billing', dim, orgId, err: error });
        return { ok: false, reason: 'No pudimos verificar tu cuota. Intenta de nuevo.' };
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
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    opts?: { version?: string; stripeAccount?: string; idempotencyKey?: string },
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
            ...(opts?.idempotencyKey && !isGet ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
        },
        body: isGet ? undefined : body,
    });
    const data = await res.json();
    if (!res.ok) throw stripeError(data?.error, res.status);
    return data;
}

// Los errores de Stripe traen `type`/`code`/`param`/`doc_url` además del
// `message` en inglés — se adjuntan al Error (sin tocar `.message`, así que
// todo el código existente que solo lee `e.message` sigue funcionando igual)
// para que translateStripeError() (stripe-catalogs.ts) los pueda traducir por
// código en vez de andar adivinando por texto libre.
function stripeError(err: any, status: number): Error {
    const e = new Error(err?.message || `Stripe ${status}`);
    (e as any).stripeStatus = status;
    (e as any).type = err?.type;
    (e as any).code = err?.code;
    (e as any).param = err?.param;
    (e as any).docUrl = err?.doc_url;
    return e;
}

// Crea (o reutiliza) el customer de Stripe de la org. Guarda el id en Neon.
// Auto-sana: si el id guardado no existe bajo la API key actual (cambio de
// cuenta o de modo test↔live), se recrea en vez de fallar ("No such customer").
export async function getOrCreateCustomer(orgId: string, email?: string, nombre?: string): Promise<string> {
    const [o] = await sql`select stripe_customer_id, country_code, idioma from orgs where id = ${orgId}`;
    const existing = o?.stripe_customer_id as string | undefined;
    if (existing) {
        try {
            const c = await stripe(`/v1/customers/${existing}`, undefined, 'GET');
            if (c && !c.deleted) return existing;
        } catch { /* no existe bajo esta key → recrear abajo */ }
    }
    // El país va en el customer, no sólo en nuestra DB: es la señal con la que
    // Stripe valida la divisa de la suscripción y presenta los recibos. Sin él
    // todo cliente nacía sin domicilio y la divisa quedaba a merced del default.
    const country = String(o?.country_code || '').trim().toUpperCase();
    const locale = String(o?.idioma || '').toLowerCase().startsWith('en') ? 'en' : 'es';
    const cus = await stripe('/v1/customers', {
        ...(email ? { email } : {}),
        ...(nombre ? { name: nombre } : {}),
        ...(/^[A-Z]{2}$/.test(country) ? { 'address[country]': country } : {}),
        'preferred_locales[0]': locale,
        'metadata[org_id]': orgId,
    }, 'POST', { idempotencyKey: `billing-customer:${orgId}` });
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

export interface UsageReservation {
    ok: boolean;
    id?: string;
    reason?: string;
}

/**
 * Reserva y contabiliza consumo en una única sentencia bloqueada por org/dim.
 * La fila de outbox queda COMMITTED antes de ejecutar el proveedor externo: si
 * el worker muere después, el cron aún puede entregar el meter event a Stripe.
 */
export async function reserveUsage(orgId: string, dim: UsageDim, rawValue = 1): Promise<UsageReservation> {
    const value = Math.trunc(Number(rawValue));
    if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
        return { ok: false, reason: 'Cantidad de consumo inválida.' };
    }

    try {
        const context = await getEntitlementContext(orgId);
        const plan = context.effectivePlan;
        const col = DIM_COL[dim];
        const included = INCLUDED[plan][col];
        const hardCap = included === null
            ? 2_147_483_647
            : (allowsOverage(plan, dim) ? included * OVERAGE_SAFETY_MULTIPLIER : included);
        const periodo = new Date().toISOString().slice(0, 7);
        const id = randomUUID();
        const meterEligible = !context.isSandbox && plan !== 'free' && !!context.stripeCustomerId
            && included !== null && allowsOverage(plan, dim);
        const includedForMeter = included ?? 2_147_483_647;

        const queryFor = (column: 'ia' | 'cfdi' | 'api' | 'usuarios' | 'envios') => {
            if (column === 'envios') return sql`
                with locked as (select pg_advisory_xact_lock(hashtextextended(${orgId + ':' + dim}, 0))),
                consumed as (
                  insert into uso_periodo (org_id, periodo, envios)
                  select ${orgId}, ${periodo}, ${value} from locked
                  where ${value} <= ${hardCap}
                  on conflict (org_id, periodo) do update
                    set envios = uso_periodo.envios + ${value}, updated_at = now()
                    where uso_periodo.envios + ${value} <= ${hardCap}
                  returning envios
                ), reserved as (
                  insert into usage_reservations
                    (id, org_id, billing_org_id, dimension, value, meter_value, periodo, status,
                     meter_status, stripe_customer_id, committed_at)
                  select ${id}, ${orgId}, ${context.billingOrgId}, ${dim}, ${value},
                         0, ${periodo}, 'committed', 'skipped', ${context.stripeCustomerId}, now()
                  from consumed returning id
                )
                select exists(select 1 from consumed) as ok`;
            if (column === 'ia') return sql`
                with locked as (select pg_advisory_xact_lock(hashtextextended(${orgId + ':' + dim}, 0))),
                consumed as (
                  insert into uso_periodo (org_id, periodo, ia)
                  select ${orgId}, ${periodo}, ${value} from locked
                  where ${value} <= ${hardCap}
                  on conflict (org_id, periodo) do update
                    set ia = uso_periodo.ia + ${value}, updated_at = now()
                    where uso_periodo.ia + ${value} <= ${hardCap}
                  returning ia
                ), reserved as (
                  insert into usage_reservations
                    (id, org_id, billing_org_id, dimension, value, meter_value, periodo, status,
                     meter_status, stripe_customer_id, committed_at)
                  select ${id}, ${orgId}, ${context.billingOrgId}, ${dim}, ${value},
                         case when ${meterEligible} then greatest(0, least(${value}, consumed.ia - ${includedForMeter})) else 0 end,
                         ${periodo}, 'committed',
                         case when ${meterEligible} and consumed.ia > ${includedForMeter} then 'pending' else 'skipped' end,
                         ${context.stripeCustomerId}, now()
                  from consumed returning id
                )
                select exists(select 1 from consumed) as ok`;
            if (column === 'cfdi') return sql`
                with locked as (select pg_advisory_xact_lock(hashtextextended(${orgId + ':' + dim}, 0))),
                consumed as (
                  insert into uso_periodo (org_id, periodo, cfdi)
                  select ${orgId}, ${periodo}, ${value} from locked
                  where ${value} <= ${hardCap}
                  on conflict (org_id, periodo) do update
                    set cfdi = uso_periodo.cfdi + ${value}, updated_at = now()
                    where uso_periodo.cfdi + ${value} <= ${hardCap}
                  returning cfdi
                ), reserved as (
                  insert into usage_reservations
                    (id, org_id, billing_org_id, dimension, value, meter_value, periodo, status,
                     meter_status, stripe_customer_id, committed_at)
                  select ${id}, ${orgId}, ${context.billingOrgId}, ${dim}, ${value},
                         case when ${meterEligible} then greatest(0, least(${value}, consumed.cfdi - ${includedForMeter})) else 0 end,
                         ${periodo}, 'committed',
                         case when ${meterEligible} and consumed.cfdi > ${includedForMeter} then 'pending' else 'skipped' end,
                         ${context.stripeCustomerId}, now()
                  from consumed returning id
                )
                select exists(select 1 from consumed) as ok`;
            if (column === 'api') return sql`
                with locked as (select pg_advisory_xact_lock(hashtextextended(${orgId + ':' + dim}, 0))),
                consumed as (
                  insert into uso_periodo (org_id, periodo, api)
                  select ${orgId}, ${periodo}, ${value} from locked
                  where ${value} <= ${hardCap}
                  on conflict (org_id, periodo) do update
                    set api = uso_periodo.api + ${value}, updated_at = now()
                    where uso_periodo.api + ${value} <= ${hardCap}
                  returning api
                ), reserved as (
                  insert into usage_reservations
                    (id, org_id, billing_org_id, dimension, value, meter_value, periodo, status,
                     meter_status, stripe_customer_id, committed_at)
                  select ${id}, ${orgId}, ${context.billingOrgId}, ${dim}, ${value},
                         case when ${meterEligible} then greatest(0, least(${value}, consumed.api - ${includedForMeter})) else 0 end,
                         ${periodo}, 'committed',
                         case when ${meterEligible} and consumed.api > ${includedForMeter} then 'pending' else 'skipped' end,
                         ${context.stripeCustomerId}, now()
                  from consumed returning id
                )
                select exists(select 1 from consumed) as ok`;
            return sql`
                with locked as (select pg_advisory_xact_lock(hashtextextended(${orgId + ':' + dim}, 0))),
                consumed as (
                  insert into uso_periodo (org_id, periodo, usuarios)
                  select ${orgId}, ${periodo}, greatest(
                    (select count(*)::int from org_members where org_id = ${orgId} and estado = 'activo'), 0
                  ) + ${value} from locked
                  where greatest((select count(*)::int from org_members where org_id = ${orgId} and estado = 'activo'), 0) + ${value} <= ${hardCap}
                  on conflict (org_id, periodo) do update
                    set usuarios = greatest(uso_periodo.usuarios,
                          (select count(*)::int from org_members where org_id = ${orgId} and estado = 'activo')) + ${value},
                        updated_at = now()
                    where greatest(uso_periodo.usuarios,
                          (select count(*)::int from org_members where org_id = ${orgId} and estado = 'activo')) + ${value} <= ${hardCap}
                  returning usuarios
                ), reserved as (
                  insert into usage_reservations
                    (id, org_id, billing_org_id, dimension, value, meter_value, periodo, status,
                     meter_status, stripe_customer_id, committed_at)
                  select ${id}, ${orgId}, ${context.billingOrgId}, ${dim}, ${value},
                         case when ${meterEligible} then greatest(0, least(${value}, consumed.usuarios - ${includedForMeter})) else 0 end,
                         ${periodo}, 'committed',
                         case when ${meterEligible} and consumed.usuarios > ${includedForMeter} then 'pending' else 'skipped' end,
                         ${context.stripeCustomerId}, now()
                  from consumed returning id
                )
                select exists(select 1 from consumed) as ok`;
        };

        const [[result]] = await withOrgTx(orgId, queryFor(col));
        if (!result?.ok) {
            return { ok: false, reason: `Alcanzaste el límite de tu plan para ${dim}. Sube de plan para continuar.` };
        }
        return { ok: true, id };
    } catch (error) {
        log.error('no se pudo reservar consumo', { route: 'billing', dim, orgId, err: error });
        return { ok: false, reason: 'No pudimos verificar ni registrar tu consumo. Intenta de nuevo.' };
    }
}

/** Revierte una reserva que definitivamente no produjo el resultado facturable. */
export async function cancelUsage(orgId: string, reservationId: string): Promise<boolean> {
    try {
        const [[result]] = await withOrgTx(orgId, sql`
            with canceled as (
              update usage_reservations
                 set status = 'canceled', canceled_at = now(), updated_at = now()
               where id = ${reservationId} and org_id = ${orgId}
                 and status = 'committed' and meter_status not in ('sending','sent')
              returning dimension, value, periodo
            ), reverted as (
              update uso_periodo u set
                ia = greatest(0, u.ia - coalesce((select value from canceled where dimension = 'ia'), 0)),
                cfdi = greatest(0, u.cfdi - coalesce((select value from canceled where dimension = 'timbrado'), 0)),
                api = greatest(0, u.api - coalesce((select value from canceled where dimension = 'api'), 0)),
                usuarios = greatest(0, u.usuarios - coalesce((select value from canceled where dimension = 'usuario'), 0)),
                envios = greatest(0, u.envios - coalesce((select value from canceled where dimension = 'envios'), 0)),
                updated_at = now()
              where u.org_id = ${orgId} and u.periodo = (select periodo from canceled)
              returning u.org_id
            )
            select exists(select 1 from canceled) as ok`);
        return result?.ok === true;
    } catch (error) {
        log.error('no se pudo cancelar la reserva', { route: 'billing', reservationId, err: error });
        return false;
    }
}

async function sendUsageRow(row: any): Promise<void> {
    const dim = String(row.dimension) as MeterDim;
    const eventName = await meterEventName(dim);
    await stripe('/v1/billing/meter_events', {
        event_name: eventName,
        identifier: String(row.id),
        timestamp: String(Math.floor(new Date(row.committed_at || row.created_at).getTime() / 1000)),
        'payload[stripe_customer_id]': String(row.stripe_customer_id),
        'payload[value]': String(row.meter_value),
    }, 'POST', { idempotencyKey: `usage:${row.id}` });
}

/** Intenta entregar una reserva; si Stripe falla, permanece durable para el cron. */
export async function flushUsageReservation(orgId: string, reservationId: string): Promise<boolean> {
    if (!STRIPE_KEY) return false;
    const [[row]] = await withOrgTx(orgId, sql`
        update usage_reservations
           set meter_status = 'sending', attempt_count = attempt_count + 1, updated_at = now()
         where id = ${reservationId} and org_id = ${orgId} and status = 'committed'
           and meter_status in ('pending','failed')
        returning *`);
    if (!row) return false;
    try {
        await sendUsageRow(row);
        await withOrgTx(orgId, sql`update usage_reservations set meter_status = 'sent', sent_at = now(), last_error = null, updated_at = now() where id = ${reservationId} and org_id = ${orgId}`);
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'error desconocido';
        await withOrgTx(orgId, sql`update usage_reservations set meter_status = 'failed', last_error = ${message}, next_attempt_at = now() + interval '5 minutes', updated_at = now() where id = ${reservationId} and org_id = ${orgId}`);
        return false;
    }
}

/** Barrido cross-org para /api/cron/billing-reconcile. Requiere contexto cron. */
export async function flushPendingUsage(limit = 100): Promise<{ sent: number; failed: number }> {
    if (!STRIPE_KEY) throw new Error('Stripe Billing no está configurado');
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const [rows] = await withSystemTx(sql`
        with candidates as (
          select id from usage_reservations
           where status = 'committed'
             and (meter_status in ('pending','failed') or (meter_status = 'sending' and updated_at < now() - interval '10 minutes'))
             and (next_attempt_at is null or next_attempt_at <= now())
           order by created_at asc
           limit ${safeLimit}
           for update skip locked
        )
        update usage_reservations u
           set meter_status = 'sending', attempt_count = attempt_count + 1, updated_at = now()
          from candidates c where u.id = c.id
        returning u.*`);
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
        try {
            await sendUsageRow(row);
            await withSystemTx(sql`update usage_reservations set meter_status = 'sent', sent_at = now(), last_error = null, updated_at = now() where id = ${row.id}`);
            sent++;
        } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 500) : 'error desconocido';
            const delayMinutes = Math.min(360, 2 ** Math.min(Number(row.attempt_count || 1), 8));
            await withSystemTx(sql`update usage_reservations set meter_status = 'failed', last_error = ${message}, next_attempt_at = now() + (${delayMinutes} * interval '1 minute'), updated_at = now() where id = ${row.id}`);
            failed++;
        }
    }
    return { sent, failed };
}

// Compatibilidad para consumidores existentes: primero persiste el consumo y
// luego intenta entregarlo. Un fallo de Stripe no pierde la fila ni deshace la
// operación; un fallo de Neon sí se propaga para que el caller falle cerrado.
export async function reportUsage(orgId: string, dim: MeterDim, value = 1): Promise<void> {
    const reservation = await reserveUsage(orgId, dim, value);
    if (!reservation.ok || !reservation.id) throw new Error(reservation.reason || 'No se pudo registrar el consumo');
    await flushUsageReservation(orgId, reservation.id);
}

// ── Stripe Connect Custom (Pagos directos a la cuenta del dueño) ────────────────

export async function createConnectAccount(
    orgId: string,
    businessType: 'company' | 'individual',
    countryCode = 'MX',
    currency?: string,
): Promise<string> {
    // `type: 'custom'` ya implica control TOTAL de la plataforma (plataforma
    // responsable de pérdidas, sin dashboard de Stripe, la plataforma recolecta el
    // KYC). NO se combina con `controller[...]` — Stripe rechaza pasar ambos.
    //
    // El país sale de la organización, no de una constante: `country: 'MX'` fijo
    // impedía que un negocio de EE. UU., España o Colombia completara el alta —
    // Stripe valida el KYC contra el país de la cuenta y rechazaba los datos.
    // El país es INMUTABLE en Stripe una vez creada la cuenta.
    const country = String(countryCode || 'MX').toUpperCase();
    const acc = await stripe('/v1/accounts', {
        type: 'custom',
        country,
        business_type: businessType,
        ...(currency ? { default_currency: String(currency).toLowerCase() } : {}),
        'capabilities[card_payments][requested]': 'true',
        'capabilities[transfers][requested]': 'true',
        // SPEI es una capacidad EXCLUSIVA de México; pedirla en otro país hace
        // fallar la creación completa de la cuenta.
        ...(country === 'MX' ? { 'capabilities[mx_bank_transfer_payments][requested]': 'true' } : {}),
        'metadata[org_id]': orgId,
    });
    return acc.id;
}

export async function updateConnectAccount(id: string, fields: Record<string, string>): Promise<any> {
    return stripe(`/v1/accounts/${id}`, fields, 'POST');
}

export async function retrieveAccount(id: string): Promise<any> {
    return stripe(`/v1/accounts/${id}`, undefined, 'GET');
}

export async function getBalance(id: string): Promise<any> {
    return stripe('/v1/balance', undefined, 'GET', { stripeAccount: id });
}

export async function listPayouts(id: string): Promise<any> {
    return stripe('/v1/payouts', undefined, 'GET', { stripeAccount: id });
}

// ── Helpers de Personas (Dueños, Representantes, Directores) ──────────────────

export async function createPerson(accountId: string, fields: Record<string, string>): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons`, fields, 'POST');
}

export async function updatePerson(accountId: string, personId: string, fields: Record<string, string>): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons/${personId}`, fields, 'POST');
}

export async function deletePerson(accountId: string, personId: string): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons/${personId}`, undefined, 'DELETE');
}

export async function listPersons(accountId: string): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons`, undefined, 'GET');
}

// ── Cuentas Externas (CLABE) ──────────────────────────────────────────────────

export async function createExternalAccount(accountId: string, fields: Record<string, string>): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/external_accounts`, fields, 'POST');
}

// ── Subida de Archivos Multipart (Files API) ──────────────────────────────────

/**
 * Sube un archivo a Stripe usando multipart/form-data.
 * Requerido para documentos de identidad de Connect.
 */
export async function stripeUpload(
    bytes: Buffer | ArrayBuffer | Uint8Array,
    filename: string,
    mime: 'image/jpeg' | 'image/png' | 'application/pdf',
    purpose: 'identity_document' | 'additional_verification' | 'dispute_evidence',
    stripeAccount: string
): Promise<any> {
    if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY no configurada');

    const boundary = '----StripeBoundary' + Math.random().toString(16).substring(2);
    let body = Buffer.alloc(0);

    const appendText = (name: string, value: string) => {
        body = Buffer.concat([
            body,
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
        ]);
    };

    const appendFile = (name: string, fname: string, fileBytes: Buffer | ArrayBuffer | Uint8Array) => {
        const safeName = fname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
        body = Buffer.concat([
            body,
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${safeName}"\r\nContent-Type: ${mime}\r\n\r\n`),
            Buffer.from(fileBytes instanceof ArrayBuffer ? new Uint8Array(fileBytes) : fileBytes),
            Buffer.from('\r\n')
        ]);
    };

    appendText('purpose', purpose);
    appendFile('file', filename, bytes);
    
    // Cerrar boundary
    body = Buffer.concat([body, Buffer.from(`--${boundary}--\r\n`)]);

    const res = await fetch('https://files.stripe.com/v1/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${STRIPE_KEY}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Stripe-Account': stripeAccount
        },
        body
    });

    const data = await res.json();
    if (!res.ok) throw stripeError(data?.error, res.status);
    return data;
}

export async function attachPersonDocument(
    accountId: string,
    personId: string,
    fileId: string,
    side: 'front' | 'back'
): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons/${personId}`, {
        [`verification[document][${side}]`]: fileId
    }, 'POST');
}

// Selfie / documento adicional — Stripe lo guarda como "additional_document".
// No siempre es un requisito explícito de currently_due, pero recolectarlo de
// entrada adelanta el caso en que Stripe lo pida por una discrepancia (fraude/
// coincidencia facial) y eleva la diligencia KYC de la plataforma.
// Stripe bloquea reemplazar campos de verification (documento, datos legales…)
// una vez que la identidad ya quedó "verified" — protección anti-fraude, para
// que nadie pueda canjear la identificación después de verificado. En modo
// TEST esto pasa casi al instante (Stripe auto-verifica cuentas de prueba),
// así que es un caso normal a manejar, no un error real de la integración.
export function isAlreadyVerifiedError(message: string): boolean {
    return /cannot change/i.test(message) && /verifi/i.test(message);
}

export async function attachPersonAdditionalDocument(
    accountId: string,
    personId: string,
    fileId: string
): Promise<any> {
    return stripe(`/v1/accounts/${accountId}/persons/${personId}`, {
        'verification[additional_document][front]': fileId
    }, 'POST');
}
