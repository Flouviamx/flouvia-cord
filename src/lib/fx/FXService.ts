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
    // Aquí iría la integración con Fixer.io, Banxico o un Broker.
    // Por ahora simulamos un spot rate.
    const spotRate = this.mockSpotRate(request.baseCurrency, request.fiscalCurrency);
    
    let appliedRate = spotRate;
    let source = 'spot';
    
    // Cobertura cambiaria (Buffer)
    if (request.bufferPct && request.bufferPct > 0) {
      appliedRate = spotRate * (1 + (request.bufferPct / 100));
      source = 'buffer';
    }

    const convertedAmount = request.amount * appliedRate;

    // Lockeamos la tasa por 30 días para B2B por defecto.
    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + 30);

    return {
      baseCurrency: request.baseCurrency,
      fiscalCurrency: request.fiscalCurrency,
      spotRate,
      appliedRate,
      convertedAmount,
      lockedUntil,
      source
    };
  }

  private static mockSpotRate(base: string, fiscal: string): number {
    if (base === 'USD' && fiscal === 'MXN') return 18.50;
    if (base === 'EUR' && fiscal === 'MXN') return 20.10;
    if (base === fiscal) return 1.0;
    
    return 1.0; // Default
  }
}
