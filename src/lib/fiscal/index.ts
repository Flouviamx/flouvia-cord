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
  currency: string;
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

export interface FiscalProvider {
  supports(countryCode: string): boolean;
  issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse>;
  cancelDocument(documentId: string, reason?: string): Promise<boolean>;
}
