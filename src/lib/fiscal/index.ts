export interface FiscalDocumentRequest {
  orgId: string;
  quoteId: string;
  countryCode: string;
  customerData: any;
  items: any[];
  totalAmounts: {
    subtotal: number;
    taxes: number;
    total: number;
    currency: string;
  };
}

export interface FiscalDocumentResponse {
  success: boolean;
  documentId: string;
  fiscalId?: string; // UUID SAT, DIAN code, etc.
  pdfUrl?: string;
  xmlUrl?: string;
  rawProviderData?: any;
  error?: string;
}

export interface FiscalProvider {
  /**
   * Valida si el proveedor soporta este país.
   */
  supports(countryCode: string): boolean;

  /**
   * Emite el documento fiscal en el país destino.
   */
  issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse>;

  /**
   * Cancela un documento fiscal emitido.
   */
  cancelDocument(documentId: string, reason?: string): Promise<boolean>;
}
