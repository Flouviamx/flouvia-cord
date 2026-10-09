import type { RetencionBase } from '../../../packages/elements/src/engine';

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
  /**
   * Solo emisor. `small_business`: franquicia de IVA (FR art. 293 B CGI, DE
   * § 19 UStG). Se congela en el snapshot del documento: la mención legal que
   * imprime describe el régimen del día en que se emitió, no el de hoy.
   */
  vatRegime?: 'small_business';
  email?: string;
  contactName?: string;
  address?: FiscalAddress;
  /**
   * Registros fiscales ADICIONALES al `taxId`, que la factura imprime junto a
   * él. Canadá: el número de QST de Quebec (Revenu Québec), distinto del
   * número de GST/HST de la CRA — sin él el cliente no recupera la QST.
   */
  extraTaxIds?: { kind: 'qst'; value: string }[];
  /** Teléfono de contacto. Del emisor lo exige XRechnung (BT-42, BR-DE-6). */
  phone?: string;
  /**
   * Dirección electrónica de la factura electrónica europea (BT-34 / BT-49):
   * esquema de la lista EAS (0088 GLN, 0204 Leitweg-ID, 0009 SIRET, EM correo…)
   * más el identificador. Congelada al emitir, como el resto de la parte.
   */
  electronicAddress?: { scheme: string; id: string };
  /**
   * Registro legal cuando no es el identificador fiscal (SIREN, Handelsregister):
   * BT-30 / BT-47, con su esquema ISO 6523 si se conoce.
   */
  legalRegistrationId?: { id: string; scheme?: string };
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
  /** Causa legal de exención/no sujeción. ES: 'E1'..'E6' o inversión del sujeto pasivo. */
  exemptionReason?: string;
  /**
   * Descuento de DOCUMENTO repartido a esta línea, antes de impuestos, en la
   * divisa del documento. `subtotal` ya es la base NETA (después del descuento):
   * el importe bruto de la línea es `subtotal + discount`. Ausente = sin
   * descuento. Lo consumen el PDF (importe bruto y renglón de descuento), el
   * CFDI (`Descuento` por concepto) y la factura electrónica europea
   * (AllowanceCharge).
   */
  discount?: number;
}

export interface FiscalRetencion {
  nombre: string;
  /** Subcódigo del país. Solo México lo usa hoy (mapea a los impuestos retenidos del CFDI). */
  tipo: string;
  /** Fracción, no porcentaje: 0.10667, nunca 10.667. */
  tasa: number;
  base: number;
  baseTipo?: RetencionBase;
  monto: number;
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
  /** Retenciones aplicadas al documento — se RESTAN de subtotal+taxes para llegar a `total`. */
  retenciones?: FiscalRetencion[];
  retencionTotal?: number;
  /**
   * Descuento de documento antes de impuestos: la suma de `lines[].discount`.
   * `subtotal` ya es neto; el subtotal bruto es `subtotal + discountTotal`.
   */
  discountTotal?: number;
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
  /** 'commercial_invoice' | 'credit_note' | 'cfdi_40' | 'cfdi_egreso'… — determina p.ej. F1 vs R1 en Verifactu. */
  documentType?: string;
  /** Folio fiscal del comprobante original de una nota de crédito. */
  relatedFiscalId?: string;
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
  /** Consulta sin iniciar otra cancelación. */
  checkOnly?: boolean;
  /**
   * Llave LIVE de la organización de ESTE emisor. Sin ella la cancelación va
   * contra la cuenta global y no encuentra un documento timbrado bajo el CSD
   * del cliente: la factura se quedaría viva en el SAT mientras Cord la muestra
   * como cancelada.
   */
  providerApiKey?: string;
  /**
   * Org dueña del documento. Providers que necesitan releer el propio
   * `documentos_fiscales` bajo RLS (Verifactu: NIF/serie/fecha originales
   * para el registro de anulación) lo requieren porque `documentId` solo no
   * basta para pasar la política de aislamiento por organización.
   */
  orgId?: string;
}

export interface FiscalCancelResponse {
  success: boolean;
  status?: 'accepted' | 'pending' | 'verifying' | 'rejected' | 'expired' | 'none' | 'unknown';
  error?: string;
  rawProviderData?: Record<string, unknown>;
}

export interface FiscalProvider {
  supports(countryCode: string): boolean;
  issueDocument(request: FiscalDocumentRequest): Promise<FiscalDocumentResponse>;
  cancelDocument(documentId: string, request?: FiscalCancelRequest): Promise<FiscalCancelResponse>;
}
