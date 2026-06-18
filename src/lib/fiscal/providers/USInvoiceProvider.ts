import type { FiscalProvider, FiscalDocumentRequest, FiscalDocumentResponse } from '../index';

export class USInvoiceProvider implements FiscalProvider {
  supports(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'US';
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    console.log(`[USInvoiceProvider] Generando Commercial Invoice para org ${request.orgId}`);
    
    // En EE.UU. no hay timbre del gobierno (SAT), es una factura comercial simple.
    // Posible integración: Stripe Tax o Avalara para cálculo de Sales Tax.
    return {
      success: true,
      documentId: 'inv_us_' + Date.now(),
      fiscalId: undefined, // No existe UUID fiscal
      pdfUrl: 'https://cord.flouvia.com/invoices/pdf/ejemplo_us.pdf',
      rawProviderData: { type: 'commercial_invoice' }
    };
  }

  async cancelDocument(documentId: string, reason?: string): Promise<boolean> {
    console.log(`[USInvoiceProvider] Voiding invoice ${documentId}`);
    return true;
  }
}
