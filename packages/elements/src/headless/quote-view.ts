// Estado en vivo de una cotización embebida. El iframe ya está suscrito al
// stream de Cord dentro de su propio origen; aquí solo se reduce lo que relaya
// por postMessage. El stream nunca se expone a otro origen: es una credencial.
import type { CordEvent } from '../types.js';

export interface QuoteViewState {
    ready: boolean;
    /** Solo con dominios permitidos configurados; en solo lectura llega null. */
    status: string | null;
    folio: string | null;
    moneda: string | null;
    total: number | null;
    approved: boolean;
    rejected: boolean;
    paid: boolean;
    signedBy: string | null;
    lastEvent: CordEvent['type'] | null;
}

export const INITIAL_QUOTE_VIEW: QuoteViewState = {
    ready: false, status: null, folio: null, moneda: null, total: null,
    approved: false, rejected: false, paid: false, signedBy: null, lastEvent: null,
};

const PAID = new Set(['paid', 'invoiced']);

export function reduceQuoteView(state: QuoteViewState, event: CordEvent): QuoteViewState {
    const next: QuoteViewState = { ...state, lastEvent: event.type };
    switch (event.type) {
        case 'cord:ready': {
            const d = event.detail ?? {};
            next.ready = true;
            if (typeof d.status === 'string') next.status = d.status;
            if (typeof d.folio === 'string') next.folio = d.folio;
            if (typeof d.moneda === 'string') next.moneda = d.moneda;
            if (typeof d.total === 'number') next.total = d.total;
            break;
        }
        case 'cord:updated':
            if (typeof event.detail?.total === 'number') next.total = event.detail.total;
            if (typeof event.detail?.moneda === 'string') next.moneda = event.detail.moneda;
            break;
        case 'cord:status_changed':
            if (typeof event.detail?.status === 'string') next.status = event.detail.status;
            break;
        case 'cord:approved':
        case 'cord:signed':
            next.approved = true;
            next.status = next.status === 'paid' ? next.status : 'approved';
            if (typeof event.detail?.signed_by === 'string') next.signedBy = event.detail.signed_by;
            break;
        case 'cord:rejected':
            next.rejected = true;
            next.status = 'rejected';
            break;
    }
    next.approved = next.approved || next.status === 'approved' || PAID.has(next.status ?? '');
    next.rejected = next.rejected || next.status === 'rejected';
    next.paid = PAID.has(next.status ?? '');
    return next;
}
