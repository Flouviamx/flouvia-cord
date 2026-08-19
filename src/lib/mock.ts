// src/lib/mock.ts
// Datos mock de la app de Cord — simulan lo que vendrá de Neon (PostgreSQL).
import { currentCurrency, currentLocale } from './context';
import { currencyDecimals } from './currency';
import { calculateDocumentTotals } from '../../packages/elements/src/engine';

/** Locale de formato del request (es-MX / en-US). */
const intlLocale = () => (currentLocale() === 'en' ? 'en-US' : 'es-MX');

// Cuando se conecte la DB real, las páginas cambian este import por queries
// y el shape de los datos se mantiene (mismo modelo que db/schema.sql).

export type QuoteStatus =
    | 'draft' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'expired' | 'paid' | 'invoiced';

export interface MockItem {
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

export interface MockEvent {
    tipo: 'created' | 'sent' | 'viewed' | 'approved' | 'rejected' | 'paid' | 'invoiced' | 'comment';
    detalle: string;
    cuando: string;
}

export interface MockQuote {
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
    items: MockItem[];
    eventos: MockEvent[];
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
     * La publica quien carga la cotización; sin ella los totales caerían a una
     * constante, que es justo el bug que este campo elimina.
     */
    taxRateFallback?: number;
    /** Retenciones congeladas al crear el documento. Se restan del total. */
    retenciones?: { nombre: string; tipo: string; tasa: number; base: number; monto: number }[];
}

export const ORG = {
    nombre: 'Materiales del Valle',
    inicial: 'MV',
    rfc: 'MVA240611AB3',
    email: 'ventas@materialesdelvalle.mx',
    plan: 'Profesional',
    prefix: 'COT',
    iva_incluido_defecto: false,
};

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

export const IVA = 0.16;

/**
 * Formateo de dinero del RENDER DE SERVIDOR (lo re-exporta lib/queries y lo usa
 * casi toda la app y el link público).
 *
 * La divisa sale del contexto del request: la del negocio en /app, la de la
 * cotización en /q/[token]. Antes era un `'$'` literal con locale es-MX fijo, así
 * que un negocio en España mostraba "$1.000,00" donde debía decir "1.000,00 €" y
 * uno en Japón inventaba dos decimales que el yen no tiene.
 *
 * `dec` sigue existiendo para los pocos call-sites que piden enteros (dec = 0),
 * pero por defecto manda la divisa: JPY/CLP/COP nunca llevan decimales.
 */
export const money = (n: number, dec?: number) => {
    const currency = currentCurrency();
    const decimals = dec ?? currencyDecimals(currency);
    try {
        return new Intl.NumberFormat(intlLocale(), {
            style: 'currency', currency,
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }).format(n);
    } catch {
        return new Intl.NumberFormat(intlLocale(), {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        }).format(n);
    }
};

export const lineTotal = (it: MockItem) => (it.precioNegociado ?? it.precioLista) * it.cantidad;

/**
 * Totales de una cotización, con el MISMO motor que los escribe en la base.
 *
 * Estas tres funciones calculaban con la constante `IVA = 0.16` sin importar la
 * organización. La etiqueta sí decía la tasa real —`IVA 21%`, `VAT 20%`— así
 * que el link público de un negocio en Madrid mostraba "IVA 21%" junto a un
 * importe que era el 16% del subtotal, y el cliente leía ese número. Uno con
 * tasa 0% veía un impuesto que no cobra.
 *
 * `taxRate` es `undefined` en las líneas anteriores al impuesto por línea; para
 * esas se usa la tasa de la organización, que es exactamente con la que se
 * calcularon en su momento.
 */
const documentTotals = (q: MockQuote) => {
    const fallback = q.taxRateFallback ?? IVA;
    return calculateDocumentTotals(
        q.items.filter((it) => it.aprobado !== false).map((it) => ({
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precio_unitario: it.precioLista,
            precio_negociado: it.precioNegociado,
            tax_rate: it.taxRate ?? fallback,
        })),
        { ivaIncluido: !!q.iva_incluido, retenciones: q.retenciones ?? [] },
    );
};

export const quoteSubtotal = (q: MockQuote) => documentTotals(q).subtotal;
export const quoteIva = (q: MockQuote) => documentTotals(q).impuestos;
export const quoteTotal = (q: MockQuote) => documentTotals(q).total;
/** Desglose por tasa — lo que imprime el resumen cuando hay más de una. */
export const quoteTaxBreakdown = (q: MockQuote) => documentTotals(q).porTasa.filter((t) => t.impuesto > 0);
/** Retenciones aplicadas, ya con su monto. Se RESTAN del total. */
export const quoteRetenciones = (q: MockQuote) => documentTotals(q).retenciones;

export const PRODUCTOS = [
    { sku: 'CEM-50',  nombre: 'Cemento gris 50kg',            unidad: 'saco',   precio: 198.0,  activo: true },
    { sku: 'VAR-38',  nombre: 'Varilla 3/8" × 12m',           unidad: 'pieza',  precio: 189.0,  activo: true },
    { sku: 'BLK-152', nombre: 'Block hueco 15×20×40',         unidad: 'pieza',  precio: 16.5,   activo: true },
    { sku: 'MAL-66',  nombre: 'Malla electrosoldada 6×6',     unidad: 'rollo',  precio: 332.0,  activo: true },
    { sku: 'ARE-M3',  nombre: 'Arena de río',                 unidad: 'm³',     precio: 410.0,  activo: true },
    { sku: 'GRA-M3',  nombre: 'Grava 3/4"',                   unidad: 'm³',     precio: 465.0,  activo: true },
    { sku: 'IMP-19',  nombre: 'Impermeabilizante 19L',        unidad: 'cubeta', precio: 1240.0, activo: true },
    { sku: 'PTR-2',   nombre: 'PTR 2"×2" cal. 14',            unidad: 'tramo',  precio: 389.0,  activo: false },
];

export const CLIENTES = [
    { id: 'c1', empresa: 'Distribuidora El Zarco', contacto: 'Raúl Mendoza',   email: 'compras@elzarco.mx',    rfc: 'DEZ981123QX1', terminos: 'Net 30' as const,  limite: 500000, inicial: 'EZ' },
    { id: 'c2', empresa: 'Constructora GAMA',      contacto: 'Lucía Ferreira', email: 'lucia@gama.com.mx',     rfc: 'CGA050617HJ8', terminos: 'Net 60' as const,  limite: 850000, inicial: 'CG' },
    { id: 'c3', empresa: 'Grupo Ferrex',           contacto: 'Marco Antonio Ruiz', email: 'mruiz@ferrex.mx',   rfc: 'GFE120304TR2', terminos: 'Contado' as const, limite: 0,      inicial: 'GF' },
    { id: 'c4', empresa: 'Obras del Norte SA',     contacto: 'Daniela Quintero', email: 'dquintero@odn.mx',    rfc: 'ODN170822MN5', terminos: 'Net 30' as const,  limite: 320000, inicial: 'ON' },
];

export const COTIZACIONES: MockQuote[] = [
    {
        id: 'q-0148', folio: 'COT-0148', cliente: 'Distribuidora El Zarco', clienteInicial: 'EZ',
        status: 'viewed', terminos: 'Net 30', vigencia: '24 jun 2026', creada: '10 jun 2026', token: 'demo',
        items: [
            { descripcion: 'Cemento gris 50kg',        cantidad: 120,  unidad: 'saco',  precioLista: 198.0, precioNegociado: 182.0 },
            { descripcion: 'Varilla 3/8" × 12m',       cantidad: 340,  unidad: 'pieza', precioLista: 189.0, precioNegociado: 168.5,
              comentarios: [{ autor: 'Raúl Mendoza', tipo: 'cliente', contenido: '¿Me puedes mejorar el precio de la varilla si pido 500 piezas?', cuando: 'hace 10 min' }]
            },
            { descripcion: 'Block hueco 15×20×40',     cantidad: 2400, unidad: 'pieza', precioLista: 16.5,  precioNegociado: 14.2 },
            { descripcion: 'Malla electrosoldada 6×6', cantidad: 180,  unidad: 'rollo', precioLista: 332.0, precioNegociado: 312.0 },
        ],
        eventos: [
            { tipo: 'viewed',   detalle: 'Raúl Mendoza abrió el link',      cuando: 'hace 15 min' },
            { tipo: 'sent',     detalle: 'Enviada por correo y WhatsApp',   cuando: 'hace 1 hora' },
            { tipo: 'created',  detalle: 'Borrador creado',                 cuando: 'hace 2 horas' },
        ],
        notas: 'Precio especial por volumen — entrega en obra Tlalnepantla.',
    },
    {
        id: 'q-0147', folio: 'COT-0147', cliente: 'Constructora GAMA', clienteInicial: 'CG',
        status: 'viewed', terminos: 'Net 60', vigencia: '20 jun 2026', creada: '9 jun 2026', token: 'gama-0147',
        items: [
            { descripcion: 'Impermeabilizante 19L', cantidad: 46,  unidad: 'cubeta', precioLista: 1240.0, precioNegociado: 1140.0 },
            { descripcion: 'Arena de río',          cantidad: 32,  unidad: 'm³',     precioLista: 410.0,  precioNegociado: null },
            { descripcion: 'Grava 3/4"',            cantidad: 28,  unidad: 'm³',     precioLista: 465.0,  precioNegociado: null },
        ],
        eventos: [
            { tipo: 'viewed', detalle: 'Lucía Ferreira abrió el link (3 veces)', cuando: 'hace 2 h' },
            { tipo: 'sent',   detalle: 'Enviada por correo',                      cuando: 'ayer, 17:20' },
            { tipo: 'created', detalle: 'Borrador creado',                        cuando: 'ayer, 16:05' },
        ],
    },
    {
        id: 'q-0146', folio: 'COT-0146', cliente: 'Grupo Ferrex', clienteInicial: 'GF',
        status: 'paid', terminos: 'Contado', vigencia: '15 jun 2026', creada: '6 jun 2026', token: 'ferrex-0146',
        items: [
            { descripcion: 'Varilla 3/8" × 12m', cantidad: 520, unidad: 'pieza', precioLista: 189.0, precioNegociado: 172.0 },
            { descripcion: 'PTR 2"×2" cal. 14',  cantidad: 90,  unidad: 'tramo', precioLista: 389.0, precioNegociado: 365.0 },
        ],
        eventos: [
            { tipo: 'paid',     detalle: 'Pago recibido vía Stripe',  cuando: '8 jun, 09:14' },
            { tipo: 'approved', detalle: 'Ferrex aprobó la cotización', cuando: '7 jun, 13:40' },
            { tipo: 'viewed',   detalle: 'Marco Ruiz abrió el link',  cuando: '7 jun, 13:02' },
            { tipo: 'sent',     detalle: 'Enviada por correo',        cuando: '6 jun, 18:30' },
            { tipo: 'created',  detalle: 'Borrador creado',           cuando: '6 jun, 17:12' },
        ],
    },
    {
        id: 'q-0145', folio: 'COT-0145', cliente: 'Obras del Norte SA', clienteInicial: 'ON',
        status: 'sent', terminos: 'Net 30', vigencia: '18 jun 2026', creada: '5 jun 2026', token: 'odn-0145',
        items: [
            { descripcion: 'Cemento gris 50kg', cantidad: 300, unidad: 'saco', precioLista: 198.0, precioNegociado: 186.0 },
            { descripcion: 'Block hueco 15×20×40', cantidad: 5000, unidad: 'pieza', precioLista: 16.5, precioNegociado: 13.9 },
        ],
        eventos: [
            { tipo: 'sent',    detalle: 'Enviada por WhatsApp', cuando: '5 jun, 12:50' },
            { tipo: 'created', detalle: 'Borrador creado',      cuando: '5 jun, 11:18' },
        ],
    },
    {
        id: 'q-0144', folio: 'COT-0144', cliente: 'Constructora GAMA', clienteInicial: 'CG',
        status: 'expired', terminos: 'Net 60', vigencia: '2 jun 2026', creada: '19 may 2026', token: 'gama-0144',
        items: [
            { descripcion: 'Malla electrosoldada 6×6', cantidad: 240, unidad: 'rollo', precioLista: 332.0, precioNegociado: 318.0 },
        ],
        eventos: [
            { tipo: 'viewed',  detalle: 'Lucía Ferreira abrió el link', cuando: '22 may, 10:01' },
            { tipo: 'sent',    detalle: 'Enviada por correo',           cuando: '19 may, 15:44' },
            { tipo: 'created', detalle: 'Borrador creado',              cuando: '19 may, 15:02' },
        ],
    },
    {
        id: 'q-0143', folio: 'COT-0143', cliente: 'Distribuidora El Zarco', clienteInicial: 'EZ',
        status: 'draft', terminos: 'Net 30', vigencia: '30 jun 2026', creada: 'hoy', token: 'zarco-0143',
        items: [
            { descripcion: 'Arena de río', cantidad: 60, unidad: 'm³', precioLista: 410.0, precioNegociado: null },
        ],
        eventos: [
            { tipo: 'created', detalle: 'Borrador creado', cuando: 'hoy, 09:20' },
        ],
    },
];

export const findQuote = (id: string) => COTIZACIONES.find(q => q.id === id);
export const findQuoteByToken = (token: string) => COTIZACIONES.find(q => q.token === token);

// KPIs del dashboard
export const PIPELINE: { status: QuoteStatus; }[] = [];
export const porCerrar = () =>
    COTIZACIONES.filter(q => ['sent', 'viewed'].includes(q.status)).reduce((s, q) => s + quoteTotal(q), 0);
export const cerradoMes = () =>
    COTIZACIONES.filter(q => ['approved', 'paid', 'invoiced'].includes(q.status)).reduce((s, q) => s + quoteTotal(q), 0);
