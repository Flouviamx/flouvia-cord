import { isCountryCode } from '../../countries';
import type { FiscalCancelRequest, FiscalCancelResponse, FiscalDocumentRequest, FiscalDocumentResponse, FiscalProvider } from '../index';

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

  // Una factura comercial no se transmitió a ninguna autoridad, así que
  // anularla es un hecho puramente local: no hay tercero al que avisarle.
  async cancelDocument(_documentId: string, _request?: FiscalCancelRequest): Promise<FiscalCancelResponse> {
    return { success: true, rawProviderData: { regulatory_status: 'commercial_only' } };
  }
}
