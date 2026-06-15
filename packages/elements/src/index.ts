// Entry principal de @flouviahq/elements (vanilla / Web Component).
// Importarlo registra automáticamente <trato-cotizador>.
export { mountCotizador } from './core';
export { TratoCotizadorElement, defineTratoElements } from './element';
export type {
    TratoElementOptions,
    TratoController,
    TratoEventDetail,
} from './types';

import { defineTratoElements } from './element';
// Auto-registro al importar (no-op en SSR / sin customElements).
defineTratoElements();
