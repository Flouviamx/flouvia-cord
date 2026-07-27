import type { FiscalProvider, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';

// Facturación fiscal para EE.UU. TODAVÍA NO está implementada — no hay Commercial
// Invoice real ni cálculo de Sales Tax (candidatos: Stripe Tax, Avalara). Antes
// este provider devolvía `success:true` con un PDF y folio INVENTADOS (el PDF ni
// siquiera existe, 404) — un negocio en EE.UU. veía su cotización marcada como
// "facturada" sin ningún documento real detrás. Ahora falla honesto: el llamador
// (emitFiscalDocument) registra el intento como 'error' y la cotización NUNCA
// se marca 'invoiced'. Cotizar/cobrar/CRM funcionan igual en EE.UU.; solo el
// timbrado fiscal está pendiente.
export class USInvoiceProvider implements FiscalProvider {
  supports(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'US';
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    return {
      success: false,
      documentId: 'us_' + request.quoteId,
      error: 'La facturación fiscal para Estados Unidos todavía no está disponible — por ahora Cord solo timbra CFDI real en México.',
    };
  }

  async cancelDocument(_documentId: string, _reason?: string): Promise<boolean> {
    return true;
  }
}
