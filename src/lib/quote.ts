// Modelo de lectura de una cotización: la forma que `lib/queries` arma desde
// Postgres (y `lib/demo-quote` en memoria) y que consumen la app, el link
// público y la API v1. Aquí viven también su vocabulario de estados y sus
// totales, calculados con el MISMO motor que los escribe en la base.

import { calculateDocumentTotals } from '../../packages/elements/src/engine';

export type QuoteStatus =
    | 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'paid' | 'invoiced';

export interface QuoteItem {
    id?: string;
    producto_id?: string | null;
    descripcion: string;
    cantidad: number;
    unidad: string;
    precioLista: number;
    precioNegociado: number | null;
    /** Fracción 0–1. Snapshot de la tasa al capturar, no lectura viva del catálogo. */
    taxRate?: number;
    aprobado?: boolean;   // false = el cliente NO incluyó esta línea al aprobar (aprobación parcial)
    comentarios?: { autor: string; tipo: string; contenido: string; cuando: string; mine?: boolean }[];
}

export interface QuoteEvent {
    tipo: 'created' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'paid' | 'invoiced' | 'comment';
    detalle: string;
    cuando: string;
}

export interface Quote {
    id: string;
    folio: string;
    cliente: string;
    cliente_id?: string;
    clienteInicial: string;
    status: QuoteStatus;
    terminos: 'Contado' | 'Net 30' | 'Net 60';
    vigencia: string;
    creada: string;
    token: string;
    items: QuoteItem[];
    eventos: QuoteEvent[];
    conversacion?: { tipo: string; detalle: string; cuando: string; mine: boolean }[];
    notas?: string;
    total?: number;   // total de la columna DB (la lista no carga items; usa esto)
    /** Divisa en la que se VENDE (la que el cliente ve y paga). Regla 21. */
    baseCurrency?: string;
    /** Divisa contable de la cotización; puede diferir de la de venta. */
    fiscalCurrency?: string;
    version?: number;
    versiones?: { version: number; total: number; fecha: string; items: any[] }[];
    firma?: { nombre: string; ip: string; hash: string; cuando: string } | null;
    iva_incluido?: boolean;
    vigenciaDias?: number | null; // días restantes de vigencia (pre-llenar el editor al editar borradores)
    anticipoPct?: number | null;
    /** Estado del flujo de aprobación interna; null si la org no lo usa. */
    aprobEstado?: string | null;
    aprobMotivo?: string | null;
    esRecurrente?: boolean; // iguala/retainer: se cobra el total automáticamente cada mes vía Stripe Subscription
    /**
     * Tasa de la organización (fracción), para las líneas sin `taxRate` propia.
     * La publica quien carga la cotización con sus líneas; los listados, que no
     * cargan líneas, no la necesitan.
     */
    taxRateFallback?: number;
    /** Retenciones congeladas al crear el documento. Se restan del total. */
    retenciones?: { nombre: string; tipo: string; tasa: number; base: number; monto: number; baseTipo?: 'subtotal' | 'impuesto' }[];
}

export const STATUS_META: Record<QuoteStatus, { label: string; color: string; bg: string }> = {
    draft:    { label: 'Borrador',  color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
    sent:     { label: 'Enviada',   color: '#2563eb', bg: 'rgba(37,99,235,0.09)' },
    viewed:   { label: 'Vista',     color: '#7c3aed', bg: 'rgba(124,58,237,0.09)' },
    approved: { label: 'Aprobada',  color: '#059669', bg: 'rgba(16,185,129,0.1)' },
    rejected: { label: 'Rechazada', color: '#dc2626', bg: 'rgba(239,68,68,0.09)' },
    expired:  { label: 'Vencida',   color: '#d97706', bg: 'rgba(245,158,11,0.1)' },
    paid:     { label: 'Pagada',    color: '#059669', bg: 'rgba(16,185,129,0.14)' },
    invoiced: { label: 'Facturada', color: '#0a192f', bg: 'rgba(10,25,47,0.08)' },
};

export const lineTotal = (it: QuoteItem) => (it.precioNegociado ?? it.precioLista) * it.cantidad;

/**
 * Tasa con la que se calcula una línea: la suya o, si es anterior al impuesto
 * por línea, la de la organización, que es con la que se calculó en su momento.
 *
 * Sin ninguna de las dos no hay tasa demostrable, y se falla en voz alta. Aquí
 * vivía un `?? IVA` (16% fijo para cualquier país): el link público de un negocio en Madrid llegó a
 * mostrar "IVA 21%" junto a un importe que era el 16% del subtotal (regla 23).
 */
function lineTaxRate(it: QuoteItem, q: Quote): number {
    const rate = it.taxRate ?? q.taxRateFallback;
    if (rate == null) {
        throw new Error(`Cotización ${q.id}: la línea "${it.descripcion}" no tiene tasa y la cotización no trae taxRateFallback`);
    }
    return rate;
}

const documentTotals = (q: Quote) => {
    // `q.retenciones` es el snapshot GUARDADO (con `base`/`monto` ya
    // congelados al momento de cotizar o aprobar). Aquí se usa solo como la
    // DEFINICIÓN de la retención (nombre/tipo/tasa) para recalcularla en vivo
    // contra el subtotal ACTUAL de `q.items` — correcto para una vista en
    // vivo del link público, donde el vendedor puede seguir editando o el
    // cliente aprobar solo un subconjunto de líneas. El `base`/`monto` del
    // snapshot se descarta a propósito: mezclarlos con la tasa aquí sería
    // aplicar una retención vieja sobre un subtotal nuevo.
    const retenciones = (q.retenciones ?? []).map((r) => ({ nombre: r.nombre, tipo: r.tipo, tasa: r.tasa, base: r.baseTipo ?? 'subtotal' as const }));
    return calculateDocumentTotals(
        q.items.filter((it) => it.aprobado !== false).map((it) => ({
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precio_unitario: it.precioLista,
            precio_negociado: it.precioNegociado,
            tax_rate: lineTaxRate(it, q),
        })),
        { ivaIncluido: !!q.iva_incluido, retenciones },
    );
};

export const quoteSubtotal = (q: Quote) => documentTotals(q).subtotal;
export const quoteIva = (q: Quote) => documentTotals(q).impuestos;
export const quoteTotal = (q: Quote) => documentTotals(q).total;
/** Desglose por tasa — lo que imprime el resumen cuando hay más de una. */
export const quoteTaxBreakdown = (q: Quote) => documentTotals(q).porTasa.filter((t) => t.impuesto > 0);
/** Retenciones aplicadas, ya con su monto. Se RESTAN del total. */
export const quoteRetenciones = (q: Quote) => documentTotals(q).retenciones;
