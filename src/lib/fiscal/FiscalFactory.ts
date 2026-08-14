import type { FiscalProvider } from './index';
import { MexicoSatProvider } from './providers/MexicoSatProvider';
import { CommercialInvoiceProvider } from './providers/CommercialInvoiceProvider';

export class FiscalFactory {
  private static providers: FiscalProvider[] = [
    new MexicoSatProvider(),
    new CommercialInvoiceProvider(),
    // Un adapter regulatorio nuevo se registra antes del provider comercial.
    // El documento canónico y el folio permanecen iguales.
  ];

  static getProvider(countryCode: string): FiscalProvider {
    const provider = this.providers.find(p => p.supports(countryCode));
    if (!provider) {
      throw new Error(`No existe proveedor fiscal soportado para el país: ${countryCode}`);
    }
    return provider;
  }
}
