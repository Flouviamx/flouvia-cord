// @flouviahq/elements/headless — el núcleo sin UI ni framework. Importarlo no
// registra elementos ni toca el DOM: solo estado, validación y red.
export { createStore } from './store.js';
export type { Store, ReadableStore } from './store.js';
export { createCordClient, newIdempotencyKey } from './client.js';
export type { CordClient, CordClientOptions } from './client.js';
export { createQuoteBuilder, validateState as validateQuoteBuilder } from './quote-builder.js';
export type {
    QuoteBuilder, QuoteBuilderOptions, QuoteBuilderState, QuoteBuilderEvent, BuilderItem, BuilderCliente, BuilderIssue, BuilderIssueCode,
} from './quote-builder.js';
export { createFiscalForm } from './fiscal-form.js';
export type { FiscalForm, FiscalFormState } from './fiscal-form.js';
export { reduceQuoteView, INITIAL_QUOTE_VIEW } from './quote-view.js';
export type { QuoteViewState } from './quote-view.js';
export * from '../fiscal/index.js';
export { fiscalText } from '../fiscal/messages.js';
export type { FiscalLocale } from '../fiscal/messages.js';
export { sanitizeAppearance, appearanceToCss, APPEARANCE_VARIABLES } from '../appearance.js';
export type { SanitizedAppearance, AppearanceTheme } from '../appearance.js';
export { calculateDocumentTotals, calculateInvoiceTotals, roundMoney } from '../engine.js';
export type { DocumentTotals, InvoiceItemInput, RetencionInput, RetencionBase, DescuentoInput } from '../engine.js';
export { CordError } from '../api.js';
export type { CordErrorCode } from '../api.js';
export type { CordElementsConfig, CordTaxOption, CordRetencion, CordTerminos } from '../contract/elements-config.js';
