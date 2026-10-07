// src/lib/report-scope.ts
// Contexto común de TODA la analítica (dashboard, Informes, MCP): en qué divisa se
// suman los importes y en qué zona horaria empieza y termina un día.
//
// Divisa (reglas 21 y 22). Un negocio que vende en varias divisas no puede sumar
// `cotizaciones.total` a secas: USD 1,000 + MXN 1,000 salía como "$2,000 MXN".
// Como Shopify, todo se reexpresa en la divisa del negocio (`orgs.moneda`), y la
// pantalla lo dice. Cada importe se convierte con la mejor tasa REAL disponible:
//   1. la venta ya está en la divisa del negocio → factor 1;
//   2. la divisa contable de la cotización ES la del negocio → `fx_rate`, la tasa
//      congelada al cotizar (la misma que declara el documento fiscal);
//   3. si no, la tasa publicada de hoy (FXService, fuente real y fechada).
// Si una divisa no tiene ninguna tasa disponible, sus importes quedan FUERA de la
// suma (factor null) y `sinTasa` lo reporta para decirlo en pantalla. Nunca se
// inventa un 1.0.
//
// Zona horaria (regla 24). `created_at >= '2026-10-01'` compara contra medianoche
// de la sesión de Postgres (UTC): a un negocio en Ciudad de México le cortaba el
// día a las 6 de la tarde. Los límites se calculan en `orgs.zona_horaria`.
import { sql, withOrgTx } from './db';
import { cached } from './cache';
import { normalizeCurrency } from './currency';
import { getCountryProfile } from './countries';
import { FXService } from './fx/FXService';

export type ReportScope = {
    /** Divisa en la que se expresan todos los importes agregados. */
    moneda: string;
    /** Zona IANA del negocio. */
    tz: string;
    /** Hoy, en la zona del negocio (YYYY-MM-DD). */
    hoy: string;
    /** Tasa de hoy divisa → `moneda`, solo para ventas sin tasa congelada útil. */
    rates: Record<string, number>;
    /** Divisas con ventas que se reexpresaron en `moneda`. */
    convertidas: string[];
    /** Divisas sin tasa disponible: sus importes no se suman. */
    sinTasa: string[];
};

/** Hoy en una zona IANA, como YYYY-MM-DD. Sin zona válida cae a UTC. */
export function todayInZone(tz: string | undefined): string {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

function validZone(tz: string): string | null {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

export async function getReportScope(orgId: string): Promise<ReportScope> {
    // 10 min: lo mismo que el caché de FXService. El `hoy` se recalcula siempre.
    const base = await cached(`report-scope:${orgId}`, 600, async () => {
        const [orgRows, monedaRows] = await withOrgTx(orgId,
            sql`select moneda, zona_horaria, country_code from orgs where id = ${orgId} limit 1`,
            sql`select distinct upper(base_currency) as moneda from cotizaciones where org_id = ${orgId}
                union
                select distinct upper(currency) from documentos_fiscales where org_id = ${orgId} and currency is not null
                union
                select distinct upper(moneda) from cotizacion_suscripciones where org_id = ${orgId}`,
        );
        const org = (orgRows[0] ?? {}) as Record<string, unknown>;
        const profile = getCountryProfile(String(org.country_code || 'MX'));
        const moneda = normalizeCurrency(org.moneda, profile.currency || 'MXN');
        const tz = validZone(String(org.zona_horaria || '')) ?? validZone(profile.timeZone) ?? 'UTC';
        const foreign = [...new Set(monedaRows.map((r) => normalizeCurrency(r.moneda, '')).filter((c) => c && c !== moneda))];
        const rates: Record<string, number> = {};
        const sinTasa: string[] = [];
        await Promise.all(foreign.map(async (code) => {
            try {
                const fx = await FXService.getExchangeRate({ baseCurrency: code, fiscalCurrency: moneda, amount: 1 });
                if (Number.isFinite(fx.spotRate) && fx.spotRate > 0) rates[code] = fx.spotRate;
                else sinTasa.push(code);
            } catch {
                sinTasa.push(code);
            }
        }));
        return { moneda, tz, rates, convertidas: foreign.filter((c) => !sinTasa.includes(c)).sort(), sinTasa: sinTasa.sort() };
    });
    return { ...base, hoy: todayInZone(base.tz) };
}

// Alias y columnas se interpolan crudos (no son parámetros), así que solo se aceptan
// identificadores simples `alias` o `alias.columna`, escritos en código, nunca datos.
const IDENT_RE = /^[a-z][a-z0-9_]{0,30}(\.[a-z][a-z0-9_]{0,30})?$/;
function ident(name: string) {
    if (!IDENT_RE.test(name)) throw new Error(`Identificador SQL inválido: ${name}`);
    return sql.unsafe(name);
}

/**
 * Factor que reexpresa un importe de una COTIZACIÓN (o de sus líneas y cobros, que
 * viajan en la misma divisa) en `scope.moneda`. Null si no hay tasa: el importe
 * queda fuera de `sum()`.
 */
export function quoteFx(scope: ReportScope, a = 'c') {
    const t = ident(a);
    return sql`(case
        when upper(${t}.base_currency) = ${scope.moneda} then 1::numeric
        when upper(${t}.fiscal_currency) = ${scope.moneda} and ${t}.fx_rate > 0 then ${t}.fx_rate
        else (${JSON.stringify(scope.rates)}::jsonb ->> upper(${t}.base_currency))::numeric
    end)`;
}

/** Igual que `quoteFx`, para un documento fiscal (factura). */
export function documentFx(scope: ReportScope, a = 'd') {
    const t = ident(a);
    return sql`(case
        when upper(${t}.currency) = ${scope.moneda} then 1::numeric
        when upper(${t}.ledger_currency) = ${scope.moneda} and ${t}.fx_rate > 0 then ${t}.fx_rate
        else (${JSON.stringify(scope.rates)}::jsonb ->> upper(${t}.currency))::numeric
    end)`;
}

/** Igual que `quoteFx`, para una fila que solo trae el código de divisa (vistas). */
export function currencyFx(scope: ReportScope, expr: string) {
    const t = ident(expr);
    return sql`(case
        when upper(${t}) = ${scope.moneda} then 1::numeric
        else (${JSON.stringify(scope.rates)}::jsonb ->> upper(${t}))::numeric
    end)`;
}

/** Inicio del día `desde` en la zona del negocio, como timestamptz. */
export function dayStart(scope: ReportScope, desde: string) {
    return sql`((${desde}::date)::timestamp at time zone ${scope.tz})`;
}

/** Inicio del día SIGUIENTE a `hasta` en la zona del negocio (límite exclusivo). */
export function dayEnd(scope: ReportScope, hasta: string) {
    return sql`((${hasta}::date + 1)::timestamp at time zone ${scope.tz})`;
}

/** Fecha local (zona del negocio) de una columna timestamptz, p. ej. `c.created_at`. */
export function localDate(scope: ReportScope, column: string) {
    const col = ident(column);
    return sql`((${col} at time zone ${scope.tz})::date)`;
}

/** Lo que la pantalla necesita para decir cómo se sumaron los importes. */
export function scopeNote(scope: ReportScope) {
    return { moneda: scope.moneda, convertidas: scope.convertidas, sinTasa: scope.sinTasa };
}
