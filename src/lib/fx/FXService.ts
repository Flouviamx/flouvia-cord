// Tipo de cambio de Cord.
//
// REGLA DE ORO: este módulo NUNCA inventa una tasa. Antes, si el proveedor no
// respondía o el par no estaba en una tabla mock de tres filas (USD→MXN,
// EUR→MXN), devolvía 1.0 en silencio — y ese 1.0 se congelaba 30 días en
// `cotizaciones.fx_rate` como si fuera una tasa real. Para COP, CLP, PEN o ARS
// eso significaba facturar con un tipo de cambio equivocado por dos órdenes de
// magnitud, sin un solo error en los logs.
//
// Una tasa que no se puede demostrar hace fallar la operación (regla 17:
// ante duda, se falla cerrado). El vendedor ve un mensaje claro y vuelve a
// intentar; nadie factura con un número inventado.

// Extensión .ts explícita a propósito: scripts/currency-check.mjs carga este
// módulo con `node --experimental-strip-types`, que exige la extensión en los
// imports relativos. Vite/Astro la aceptan igual. No la quites "por consistencia".
import { normalizeCurrency } from '../currency.ts';

export interface FXQuoteRequest {
  baseCurrency: string;    // Divisa en la que se le vende al cliente (ej. USD)
  fiscalCurrency: string;  // Divisa contable del negocio (ej. MXN)
  amount: number;          // Monto total en baseCurrency
  bufferPct?: number;      // Cobertura sobre la tasa spot (2 = +2%)
}

export interface FXQuoteResponse {
  baseCurrency: string;
  fiscalCurrency: string;
  spotRate: number;
  appliedRate: number;     // spot + bufferPct
  convertedAmount: number; // amount × appliedRate, en fiscalCurrency
  lockedUntil?: Date;
  source: string;          // 'same' | 'spot' | 'buffer'
  asOf: string;            // Fecha de la tasa publicada por la fuente (ISO)
}

/** Falla explícita de FX. La capa de arriba la traduce a un 503/422 legible. */
export class FXUnavailableError extends Error {
  // Campos declarados explícitamente (sin parameter properties): los checks de
  // scripts/ corren con `node --experimental-strip-types`, que no las soporta.
  base: string;
  fiscal: string;

  constructor(base: string, fiscal: string, cause?: string) {
    super(
      `No pudimos obtener el tipo de cambio ${base} → ${fiscal}${cause ? ` (${cause})` : ''}. ` +
      'Intenta de nuevo en un momento o cotiza en la moneda de tu negocio.',
    );
    this.name = 'FXUnavailableError';
    this.base = base;
    this.fiscal = fiscal;
  }
}

/** Días que dura congelada la tasa de una cotización multi-divisa. */
export const FX_LOCK_DAYS = 30;

/** Cobertura máxima aceptada (%). Un buffer absurdo es un error de captura. */
const MAX_BUFFER_PCT = 25;

// Caché por proceso: el mismo par se pide muchas veces mientras el vendedor
// arma la cotización (el editor consulta en cada cambio de línea).
const CACHE_TTL_MS = 10 * 60 * 1000;

// Respaldo cuando todas las fuentes fallan: una tasa cacheada es un dato real y
// fechado, pero envejece. Pasado este plazo se falla cerrado en vez de facturar
// con la tasa de la semana pasada.
const STALE_MAX_MS = 24 * 60 * 60 * 1000;

// Cada respuesta cachea la tabla completa desde una divisa origen (~160-400
// pares). Este tope evita que el mapa crezca sin control en un proceso largo.
const CACHE_MAX_ENTRIES = 4000;

const cache = new Map<string, { rate: number; asOf: string; at: number }>();

export class FXService {
  /**
   * Cotiza el tipo de cambio. Lanza `FXUnavailableError` si no hay tasa real.
   */
  static async getExchangeRate(request: FXQuoteRequest): Promise<FXQuoteResponse> {
    const base = normalizeCurrency(request.baseCurrency, '');
    const fiscal = normalizeCurrency(request.fiscalCurrency, '');
    if (!base || !fiscal) {
      throw new FXUnavailableError(String(request.baseCurrency), String(request.fiscalCurrency), 'divisa no reconocida');
    }

    const amount = Number(request.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new FXUnavailableError(base, fiscal, 'monto inválido');
    }

    if (base === fiscal) {
      return {
        baseCurrency: base, fiscalCurrency: fiscal,
        spotRate: 1, appliedRate: 1, convertedAmount: amount,
        source: 'same', asOf: new Date().toISOString().slice(0, 10),
      };
    }

    const { rate: spotRate, asOf } = await this.fetchSpotRate(base, fiscal);

    const rawBuffer = Number(request.bufferPct);
    const bufferPct = Number.isFinite(rawBuffer) && rawBuffer > 0
      ? Math.min(rawBuffer, MAX_BUFFER_PCT)
      : 0;
    const appliedRate = bufferPct > 0 ? spotRate * (1 + bufferPct / 100) : spotRate;

    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + FX_LOCK_DAYS);

    return {
      baseCurrency: base,
      fiscalCurrency: fiscal,
      spotRate,
      appliedRate,
      convertedAmount: amount * appliedRate,
      lockedUntil,
      source: bufferPct > 0 ? 'buffer' : 'spot',
      asOf,
    };
  }

  /**
   * Tasa spot real, de una fuente publicada y fechada. Lanza si no hay dato.
   * No hay fallback inventado: una tasa falsa es peor que un error visible.
   *
   * Se consultan varias fuentes EN ORDEN porque ninguna sola cubre el mundo:
   * el BCE publica ~30 divisas y devuelve 404 para COP, CLP, PEN, ARS o UYU.
   * Antes eso se leía como "el proveedor falló" y dejaba sin cotizar a media
   * Latinoamérica; el par sencillamente no existía en esa fuente.
   */
  private static async fetchSpotRate(base: string, fiscal: string): Promise<{ rate: number; asOf: string }> {
    const key = `${base}:${fiscal}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { rate: hit.rate, asOf: hit.asOf };

    let networkFailure = false;
    for (const provider of PROVIDERS) {
      let table: RateTable | null = null;
      try {
        table = await provider(base);
      } catch {
        // Timeout, DNS, TLS: es una falla de red, no una divisa inexistente.
        networkFailure = true;
        continue;
      }
      if (!table) continue;

      // La respuesta trae la tabla completa desde `base`: se cachea entera.
      // El editor pide el mismo origen contra varias divisas mientras el
      // vendedor arma la cotizacion; una llamada cubre todas.
      cacheTable(base, table);

      const rate = Number(table.rates[fiscal]);
      if (Number.isFinite(rate) && rate > 0) return { rate, asOf: table.asOf };
    }

    // Ultima red: una tasa cacheada y fechada es un dato REAL, muy distinto de
    // un 1.0 inventado. Se acepta acotada en el tiempo, no indefinidamente.
    if (hit && Date.now() - hit.at < STALE_MAX_MS) return { rate: hit.rate, asOf: hit.asOf };

    throw new FXUnavailableError(
      base,
      fiscal,
      networkFailure
        ? 'no pudimos consultar las fuentes de tipo de cambio'
        : `ninguna fuente publica el par ${base}/${fiscal}`,
    );
  }
}

/** Tabla de tasas desde una divisa origen, con la fecha que publica la fuente. */
interface RateTable {
  asOf: string;                          // ISO corto (YYYY-MM-DD)
  rates: Record<string, number>;         // Codigo ISO en MAYUSCULAS -> tasa
}

const FETCH_TIMEOUT_MS = 4000;

async function getJson(url: string): Promise<any | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  // 404 no es una falla de red: es "esta fuente no cubre esta divisa".
  // Se devuelve null para que el siguiente proveedor lo intente.
  if (!res.ok) return null;
  return await res.json();
}

function normalizeRates(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(raw ?? {})) {
    if (!/^[A-Za-z]{3}$/.test(code)) continue;   // currency-api mezcla cripto
    const rate = Number(value);
    if (Number.isFinite(rate) && rate > 0) out[code.toUpperCase()] = rate;
  }
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(value: unknown, fallbackMs?: number): string {
  if (typeof value === 'string' && ISO_DATE.test(value)) return value;
  const ms = Number(fallbackMs);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fuentes en orden de autoridad. Todas publican fecha y ninguna pide API key.
 * Una fuente que no cubre el par devuelve null y cede el turno a la siguiente.
 */
const PROVIDERS: Array<(base: string) => Promise<RateTable | null>> = [
  // 1. Banco Central Europeo (via Frankfurter): referencia oficial diaria.
  //    Cobertura corta (~30 divisas), pero es la mas defendible ante el SAT.
  async (base) => {
    const data = await getJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`);
    const rates = normalizeRates(data?.rates);
    if (!Object.keys(rates).length) return null;
    return { asOf: isoDay(data?.date), rates };
  },

  // 2. exchangerate-api (endpoint abierto): ~160 divisas, actualizacion diaria.
  async (base) => {
    const data = await getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
    if (data?.result !== 'success') return null;
    const rates = normalizeRates(data?.rates);
    if (!Object.keys(rates).length) return null;
    return { asOf: isoDay(null, Number(data?.time_last_update_unix) * 1000), rates };
  },

  // 3. currency-api sobre CDN: la cobertura mas amplia, ultima linea de defensa.
  async (base) => {
    const path = `v1/currencies/${base.toLowerCase()}.json`;
    const data =
      (await getJson(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/${path}`)) ??
      (await getJson(`https://latest.currency-api.pages.dev/${path}`));
    const rates = normalizeRates(data?.[base.toLowerCase()]);
    if (!Object.keys(rates).length) return null;
    return { asOf: isoDay(data?.date), rates };
  },
];

/** Guarda la tabla completa, acotando el mapa para que no crezca sin limite. */
function cacheTable(base: string, table: RateTable): void {
  if (cache.size > CACHE_MAX_ENTRIES) cache.clear();
  const at = Date.now();
  for (const [code, rate] of Object.entries(table.rates)) {
    cache.set(`${base}:${code}`, { rate, asOf: table.asOf, at });
  }
}
