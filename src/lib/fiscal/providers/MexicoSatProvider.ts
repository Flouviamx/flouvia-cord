import type { FiscalProvider, FiscalDocumentRequest, FiscalDocumentResponse } from './index';

export class MexicoSatProvider implements FiscalProvider {
  supports(countryCode: string): boolean {
    return countryCode.toUpperCase() === 'MX';
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    console.log(`[MexicoSatProvider] Timbrando CFDI 4.0 para org ${request.orgId}`);
    
    // Aquí iría la lógica original que usa el PAC de Shopify o el proveedor MX actual
    // simulamos la respuesta por ahora
    return {
      success: true,
      documentId: 'doc_mx_' + Date.now(),
      fiscalId: 'FCEB9C82-C233-40DF-A8DB-23A0B1A78401',
      pdfUrl: 'https://cord.flouvia.com/cfdi/pdf/ejemplo.pdf',
      xmlUrl: 'https://cord.flouvia.com/cfdi/xml/ejemplo.xml',
      rawProviderData: { pac: 'Shopify PAC' }
    };
  }

  async cancelDocument(documentId: string, reason?: string): Promise<boolean> {
    console.log(`[MexicoSatProvider] Cancelando CFDI ${documentId} (Motivo: ${reason})`);
    return true;
  }
}
