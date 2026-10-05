// Entry principal de @flouviahq/elements (vanilla / Web Component).
// Importarlo registra automáticamente <cord-cotizador>.
export { mountCotizador } from './core.js';
export { CordQuoteElement, CordCotizadorElement, defineCordElements } from './element.js';
export { CordFiscalFormElement, defineFiscalElement } from './fiscal-element.js';
export { CordAPI, CordError } from './api.js';
export {
    num, sanitizeItem, calculateTotals, roundMoney,
    calculateInvoiceTotals, calculateDocumentTotals,
} from './engine.js';
export { configureCord, getCordConfig } from './config.js';
export type {
    EngineItem, EngineItemInput, EngineTotals,
    InvoiceItemInput, InvoiceItem, InvoiceTotals, TaxBreakdown,
    RetencionInput, RetencionApplied, DocumentTotals,
} from './engine.js';
export type { CordGlobalConfig } from './config.js';
export type { CordErrorCode } from './api.js';
export type {
    CordAppearance,
    CordAppearanceVariables,
    CordElementOptions,
    CordController,
    CordEventDetail,
    CordEvent,
    CordReadyDetail,
    CordViewedDetail,
    CordApprovedDetail,
    CordSignedDetail,
    CordRejectedDetail,
    CordMessageDetail,
    CordItemCommentDetail,
    CordPayDetail,
    CordUpdatedDetail,
    CordStatusChangedDetail,
    CordProduct,
    CordClient,
    QuoteStatus,
    Terminos,
    NivelCliente,
    QuoteItemInput,
    CreateQuoteInput,
    CreateQuoteResponse,
    CreateClientInput,
    CreateProductInput,
    CreateResponse,
    PaginatedResponse
} from './types.js';
export type { CordElements, CordElementKey } from './elements.js';

import { defineCordElements } from './element.js';
import { defineFiscalElement } from './fiscal-element.js';
// Auto-registro al importar (no-op en SSR / sin customElements).
defineCordElements();
defineFiscalElement();
