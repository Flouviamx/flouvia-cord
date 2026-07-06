// Entry principal de @flouviahq/elements (vanilla / Web Component).
// Importarlo registra automáticamente <cord-cotizador>.
export { mountCotizador } from './core';
export { CordCotizadorElement, defineCordElements } from './element';
export { CordAPI, CordError } from './api';
export { num, sanitizeItem, calculateTotals } from './engine';
export type { EngineItem, EngineItemInput, EngineTotals } from './engine';
export type {
    CordElementOptions,
    CordController,
    CordEventDetail,
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
} from './types';

import { defineCordElements } from './element';
// Auto-registro al importar (no-op en SSR / sin customElements).
defineCordElements();
