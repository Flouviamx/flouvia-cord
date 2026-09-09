import type { FiscalProvider } from './index';
import { MexicoSatProvider } from './providers/MexicoSatProvider';
import { SpainVerifactuProvider } from './providers/SpainVerifactuProvider';
import { CommercialInvoiceProvider } from './providers/CommercialInvoiceProvider';

export class FiscalFactory {
  private static providers: FiscalProvider[] = [
    new MexicoSatProvider(),
    // Antes de CommercialInvoiceProvider: el orden importa, gana el primer
    // supports()===true. SpainVerifactuProvider decide internamente (leyendo
    // orgs.verifactu_modo) si encadena de verdad o degrada al mismo contrato
    // "commercial_only" que CommercialInvoiceProvider — así que interceptar ES
    // aquí nunca deja fuera a una org que todavía no activó Verifactu.
    new SpainVerifactuProvider(),
    new CommercialInvoiceProvider(),
    // Un adapter regulatorio nuevo se registra antes del provider comercial.
    // El documento canónico y el folio permanecen iguales.
  ];

  static getProvider(countryCode: string, documentType?: string): FiscalProvider {
    // El documento persistido manda, incluso después de cambiar plan/país.
    if (['proforma', 'commercial_credit_note'].includes(documentType || '')
      || documentType === 'commercial_invoice') return new CommercialInvoiceProvider();
    const provider = this.providers.find(p => p.supports(countryCode));
    if (!provider) {
      throw new Error(`No existe proveedor fiscal soportado para el país: ${countryCode}`);
    }
    return provider;
  }
}
