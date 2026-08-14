import { isCountryCode } from '../../countries';
import type { FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider } from '../index';

// Emisor propio de Cord para cualquier país fuera de México. Genera un folio,
// conserva snapshots inmutables y sirve un PDF desde Cord. Es una factura
// comercial: no afirma haber sido transmitida a la autoridad fiscal local.
export class CommercialInvoiceProvider implements FiscalProvider {
  supports(countryCode: string): boolean {
    const normalized = countryCode.toUpperCase();
    return normalized !== 'MX' && isCountryCode(normalized);
  }

  async issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse> {
    return {
      success: true,
      provider: 'cord',
      documentId: request.documentId,
      pdfUrl: `/api/fiscal/documents/${request.documentId}/pdf`,
      rawProviderData: {
        regulatory_status: 'commercial_only',
        authority_submission: false,
        invoice_number: request.invoiceNumber,
        idempotency_key: request.idempotencyKey,
      },
    };
  }

  async cancelDocument(_documentId: string, _reason?: string): Promise<boolean> {
    return true;
  }
}
