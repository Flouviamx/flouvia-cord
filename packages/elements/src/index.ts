// Entry principal de @flouviahq/elements (vanilla / Web Component).
// Importarlo registra automáticamente <cord-cotizador>.
export { mountCotizador } from './core';
export { CordCotizadorElement, defineCordElements } from './element';
export type {
    CordElementOptions,
    CordController,
    CordEventDetail,
} from './types';

import { defineCordElements } from './element';
// Auto-registro al importar (no-op en SSR / sin customElements).
defineCordElements();
