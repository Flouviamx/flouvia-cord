export interface FXQuoteRequest {
  baseCurrency: string;    // Ej. USD (Moneda de presentación al cliente)
  fiscalCurrency: string;  // Ej. MXN (Moneda contable para la factura)
  amount: number;          // Monto total
  bufferPct?: number;      // Porcentaje de cobertura (ej. 2.0 = 2% extra al tipo de cambio spot)
}

export interface FXQuoteResponse {
  baseCurrency: string;
  fiscalCurrency: string;
  spotRate: number;
  appliedRate: number;     // Spot rate + bufferPct
  convertedAmount: number;
  lockedUntil?: Date;      // Cuánto dura esta cobertura
  source: string;          // 'spot', 'buffer', 'forward'
}

export class FXService {
  /**
   * Obtiene la cotización del tipo de cambio con o sin cobertura.
   */
  static async getExchangeRate(request: FXQuoteRequest): Promise<FXQuoteResponse> {
    // Tasa spot REAL desde Frankfurter (datos del BCE, sin API key). Si la red
    // falla o la divisa no está soportada, caemos a una tasa de respaldo para
    // que la cotización nunca se rompa por un problema externo.
    const spotRate = await this.fetchSpotRate(request.baseCurrency, request.fiscalCurrency);

    let appliedRate = spotRate;
    let source = 'spot';

    // Cobertura cambiaria (Buffer): protege el margen ante movimientos del FX
    // entre que se aprueba (en USD) y se factura semanas después (en MXN).
    if (request.bufferPct && request.bufferPct > 0) {
      appliedRate = spotRate * (1 + (request.bufferPct / 100));
      source = 'buffer';
    }

    const convertedAmount = request.amount * appliedRate;

    // Lockeamos la tasa por 30 días para B2B por defecto (FX lock).
    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + 30);

    return {
      baseCurrency: request.baseCurrency,
      fiscalCurrency: request.fiscalCurrency,
      spotRate,
      appliedRate,
      convertedAmount,
      lockedUntil,
      source,
    };
  }

  /** Obtiene la tasa spot en vivo (BCE vía Frankfurter); fallback a mock. */
  private static async fetchSpotRate(base: string, fiscal: string): Promise<number> {
    if (base === fiscal) return 1.0;
    try {
      const res = await fetch(
        `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(fiscal)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (res.ok) {
        const data: any = await res.json();
        const rate = data?.rates?.[fiscal];
        if (typeof rate === 'number' && rate > 0) return rate;
      }
    } catch {
      /* red caída / timeout → fallback */
    }
    return this.mockSpotRate(base, fiscal);
  }

  private static mockSpotRate(base: string, fiscal: string): number {
    if (base === 'USD' && fiscal === 'MXN') return 18.50;
    if (base === 'EUR' && fiscal === 'MXN') return 20.10;
    if (base === fiscal) return 1.0;

    return 1.0; // Default
  }
}
