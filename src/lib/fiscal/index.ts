export interface FiscalAddress {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode: string;
}

export interface FiscalParty {
  legalName: string;
  taxId?: string;
  taxSystem?: string;
  email?: string;
  contactName?: string;
  address?: FiscalAddress;
}

export interface FiscalLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  productKey?: string;
  unitKey?: string;
}

export interface FiscalTotals {
  subtotal: number;
  taxes: number;
  total: number;
  /** Divisa en la que están EXPRESADOS subtotal/taxes/total (ISO 4217). */
  currency: string;
  /**
   * Tipo de cambio a la divisa contable del emisor cuando `currency` no es la
   * suya. 1 (o ausente) = misma divisa. El SAT lo exige en el CFDI: un
   * comprobante en USD sin TipoCambio se rechaza o se interpreta como pesos.
   */
  exchangeRate?: number;
  /** Divisa contable del emisor, si difiere de `currency`. */
  ledgerCurrency?: string;
}

// Contrato canónico propiedad de Cord. Los adapters regulatorios traducen este
// DTO al esquema de Facturapi, DIAN u otro proveedor; el dominio no almacena el
// request específico de un tercero como fuente de verdad.
export interface FiscalDocumentRequest {
  documentId: string;
  invoiceNumber: string;
  idempotencyKey: string;
  orgId: string;
  quoteId: string;
  countryCode: string;
  issuer: FiscalParty;
  recipient: FiscalParty;
  lines: FiscalLineItem[];
  totals: FiscalTotals;
  issuedAt: string;
  // Llave LIVE de la organización Facturapi de ESTA org (multi-tenant): si está
  // presente, el CFDI se timbra bajo el RFC del cliente; si no, cae a la global.
  providerApiKey?: string;
  cfdi?: {
    use?: string;
    paymentForm?: string;
    paymentMethod?: string;
  };
}

export interface FiscalDocumentResponse {
  success: boolean;
  provider: string;
  documentId: string;
  fiscalId?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  rawProviderData?: Record<string, unknown>;
  error?: string;
}

export interface FiscalCancelRequest {
  /** Motivo del rail regulatorio. CFDI: 01..04; 02 = comprobante con errores. */
  reason?: string;
  /**
   * Llave LIVE de la organización de ESTE emisor. Sin ella la cancelación va
   * contra la cuenta global y no encuentra un documento timbrado bajo el CSD
   * del cliente: la factura se quedaría viva en el SAT mientras Cord la muestra
   * como cancelada.
   */
  providerApiKey?: string;
}

export interface FiscalCancelResponse {
  success: boolean;
  error?: string;
  rawProviderData?: Record<string, unknown>;
}

export interface FiscalProvider {
  supports(countryCode: string): boolean;
  issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse>;
  cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse>;
}
