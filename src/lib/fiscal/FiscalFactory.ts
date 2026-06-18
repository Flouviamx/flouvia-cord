import type { FiscalProvider } from './index';
import { MexicoSatProvider } from './providers/MexicoSatProvider';
import { USInvoiceProvider } from './providers/USInvoiceProvider';

export class FiscalFactory {
  private static providers: FiscalProvider[] = [
    new MexicoSatProvider(),
    new USInvoiceProvider(),
    // Agregar ColombiaDianProvider(), SpainFacturaEProvider() aquí en el futuro.
  ];

  static getProvider(countryCode: string): FiscalProvider {
    const provider = this.providers.find(p => p.supports(countryCode));
    if (!provider) {
      throw new Error(`No existe proveedor fiscal soportado para el país: ${countryCode}`);
    }
    return provider;
  }
}
