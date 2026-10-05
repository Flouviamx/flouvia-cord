import type * as React from 'react';
import type { CordElements } from './elements.js';
import type { FiscalReceptorInput } from './fiscal/receptor.js';
import type { AppearanceSelector } from './appearance.js';
import type { ReadableStore } from './headless/store.js';
import type { QuoteViewState } from './headless/quote-view.js';

// Tipos públicos de @flouviahq/elements. Superficie mínima a propósito.

/**
 * Payload que viaja con cada evento del cotizador. Se mantiene como fallback
 * ancho para los callbacks nombrados (`onApproved`, `onRejected`…); para
 * manejo exhaustivo usa `onEvent` con `CordEvent` (unión discriminada) — ver
 * abajo.
 */
export interface CordEventDetail {
    /** token público de la cotización */
    token?: string;
    /** folio legible, ej. "COT-0148" */
    folio?: string;
    /** campos extra según el evento (comentario, propuesta, url de pago…) */
    [key: string]: unknown;
}

// ==== Eventos del cotizador (unión discriminada) ====
// Payloads reales tal como los emite QuoteCard.astro. `approved` y `signed`
// se disparan AMBOS por una sola acción del cliente (aprobar = firmar) — no
// los cuentes como dos eventos de negocio distintos si agregas métricas.
export interface CordReadyDetail {
    /** Presentes solo con dominios permitidos configurados (modo interactivo). */
    status?: string | null;
    folio?: string | null;
    moneda?: string | null;
    total?: number | null;
    /** Solo en la factura (`document: 'invoice'`): saldo pendiente. */
    saldo?: number | null;
}
export interface CordViewedDetail { token?: string }
export interface CordApprovedDetail { signed_by: string; hash: string }
export interface CordSignedDetail { signed_by: string; hash: string }
export interface CordRejectedDetail { comentario: string }
export interface CordPayDetail { url: string }
export interface CordMessageDetail { action: string; mensaje: string; propuesta?: unknown }
export interface CordItemCommentDetail { item_id: string; mensaje: string }
/** El vendedor cambió la propuesta mientras el cliente la tenía abierta. */
export interface CordUpdatedDetail { subtotal: number; total: number; moneda: string }
/** Estado terminal alcanzado: paid, rejected, expired o invoiced. */
export interface CordStatusChangedDetail { status: string; saldo?: number }
/** La factura embebida quedó pagada (con o sin abonos previos). */
export interface CordPaidDetail { folio: string | null; moneda: string | null; saldo: number }

export type CordEvent =
    | { type: 'cord:ready'; detail: CordReadyDetail }
    | { type: 'cord:viewed'; detail: CordViewedDetail }
    | { type: 'cord:approved'; detail: CordApprovedDetail }
    | { type: 'cord:signed'; detail: CordSignedDetail }
    | { type: 'cord:rejected'; detail: CordRejectedDetail }
    | { type: 'cord:pay'; detail: CordPayDetail }
    | { type: 'cord:message'; detail: CordMessageDetail }
    | { type: 'cord:item_comment'; detail: CordItemCommentDetail }
    | { type: 'cord:updated'; detail: CordUpdatedDetail }
    | { type: 'cord:status_changed'; detail: CordStatusChangedDetail }
    | { type: 'cord:paid'; detail: CordPaidDetail };

export interface CordElementOptions {
    /** Token público de la cotización (/q/{token}) o de la factura (/i/{token}). REQUERIDO. */
    token: string;
    /** Qué documento monta. Default 'quote'; 'invoice' monta la factura de /i/{token}. */
    document?: 'quote' | 'invoice';
    /** Origen de Cord. Default: https://cordhq.app (cambiar para self-host/staging). */
    baseUrl?: string;
    /** Alto inicial del skeleton en px mientras carga. Default 420. */
    minHeight?: number;
    /** El cotizador terminó de cargar. */
    onReady?: () => void;
    /** El cliente abrió/vio la cotización. */
    onViewed?: (detail: CordViewedDetail) => void;
    /** El cliente aprobó la cotización. */
    onApproved?: (detail: CordApprovedDetail) => void;
    /** Firma legal capturada (se dispara junto con `onApproved`, mismo evento de negocio). */
    onSigned?: (detail: CordSignedDetail) => void;
    /** El cliente rechazó la cotización. */
    onRejected?: (detail: CordRejectedDetail) => void;
    /** El cliente envió un comentario o contraoferta general. */
    onMessage?: (detail: CordMessageDetail) => void;
    /** El cliente comentó una línea/partida específica. */
    onItemComment?: (detail: CordItemCommentDetail) => void;
    /** El cliente inició el pago en línea. Cord ya abre la página de pago; `url` es solo informativa. */
    onPay?: (detail: CordPayDetail) => void;
    /** El vendedor cambió la propuesta (nuevo total). */
    onUpdated?: (detail: CordUpdatedDetail) => void;
    /** La cotización llegó a un estado terminal (pagada, rechazada, vencida, facturada). */
    onStatusChanged?: (detail: CordStatusChangedDetail) => void;
    /** La factura quedó pagada. Solo con `document: 'invoice'`. */
    onPaid?: (detail: CordPaidDetail) => void;
    /** Catch-all tipado: cualquier evento `cord:*` (incluye los anteriores). Habilita `switch` exhaustivo sobre `event.type`. */
    onEvent?: (event: CordEvent) => void;
    /** Configuración de branding para inyectar al iframe */
    appearance?: CordAppearance;
}

/** Handle devuelto por mountCotizador() para limpiar la instancia. */
export interface CordController {
    /** Quita el iframe, los listeners y el skeleton. */
    destroy(): void;
    /** El elemento contenedor. */
    readonly el: HTMLElement;
    /** Estado en vivo de la cotización (estado, total, aprobada, pagada). */
    readonly state: ReadableStore<QuoteViewState>;
}

// ==== API Types ====
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'paid' | 'rejected';
export type Terminos = 'contado' | 'net30' | 'net60';
export type NivelCliente = 'estandar' | 'plata' | 'oro' | 'distribuidor';

export interface QuoteItemInput {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    producto_id?: string;
    /** Fracción 0–1 de las opciones de GET /api/v1/elements/config. Ausente = tasa default. */
    tax_rate?: number;
}

/** Datos para crear una nueva cotización vía API o SDK. */
export interface CreateQuoteInput {
    /** Si es `true`, la cotización se enviará por correo al cliente inmediatamente tras crearla. */
    send?: boolean;
    /** Notas adicionales o términos específicos que aparecerán al final de la cotización. */
    notas?: string;
    /** ID del cliente (requerido si `send` es true o si se quieren tomar los términos por defecto del cliente). */
    cliente_id?: string;
    /**
     * Datos de un cliente NUEVO (sin `cliente_id`): se busca primero por
     * `empresa` o `email` dentro de tu organización y, si no existe, se CREA
     * (nunca actualiza uno existente — una publishable key solo puede
     * agregar clientes, no alterarlos). El cliente creado así queda marcado
     * `origen: 'embed'` para tu revisión en el CRM.
     */
    cliente?: {
        empresa: string;
        email?: string;
        contacto?: string;
        telefono?: string;
        rfc?: string;
        /** Datos fiscales del receptor; el servidor los valida con validateFiscalReceptor. */
        fiscal?: FiscalReceptorInput;
    };
    /** Términos de pago (ej. 'contado', 'net30'). Sobrescribe los del cliente. */
    terminos?: Terminos;
    /** Cuántos días es válida la cotización. Por defecto toma el valor de los ajustes de la organización (ej. 30). */
    vigencia_dias?: number;
    /** Moneda base en la que el cliente ve la cotización (ej. 'MXN', 'USD'). */
    base_currency?: string;
    /** Moneda fiscal en la que se facturará (ej. 'MXN'). Si difiere de base_currency, se usa FX con cobertura. */
    fiscal_currency?: string;
    /** Porcentaje de buffer para el tipo de cambio (ej. 0.05 para 5%). */
    fx_buffer_pct?: number;
    /** Si es `true`, los precios unitarios de los items ya incluyen IVA. */
    iva_incluido?: boolean;
    /** Lista de productos o servicios a cotizar. Obligatorio (mínimo 1). */
    items: QuoteItemInput[];
}

export interface CreateQuoteResponse {
    id: string;
    token?: string;
    folio?: string;
    link_publico?: string;
    needs_approval?: boolean;
    motivo?: string;
    email?: { sent: boolean };
}

export interface CreateClientInput {
    empresa: string;
    contacto?: string;
    email?: string;
    telefono?: string;
    rfc?: string;
    terminos?: Terminos;
    limite?: number;
    nivel?: NivelCliente;
    descuento_pct?: number;
}

export interface CreateProductInput {
    nombre: string;
    sku?: string;
    unidad?: string;
    precio?: number;
    activo?: boolean;
}

export interface CreateResponse {
    id: string;
}

export interface CordProduct {
    id: string;
    nombre: string;
    nombre_web?: string;
    sku?: string;
    precio?: number;
    precio_final?: number;
    unidad?: string;
    activo?: boolean;
}

export interface CordClient {
    id: string;
    empresa: string;
    contacto?: string;
    email?: string;
    telefono?: string;
    terminos?: Terminos;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        limit: number;
        offset: number;
        total: number;
    };
}

// ==== Appearance API ====
export interface CordAppearanceVariables {
    colorPrimary?: string;
    colorOnPrimary?: string;
    colorBackground?: string;
    colorSurface?: string;
    colorText?: string;
    colorTextSecondary?: string;
    colorTextPlaceholder?: string;
    colorBorder?: string;
    colorDanger?: string;
    colorSuccess?: string;
    colorInput?: string;
    colorInputText?: string;
    colorInputBorder?: string;
    colorFocus?: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeightBold?: string;
    borderRadius?: string;
    borderRadiusButton?: string;
    borderRadiusInput?: string;
    spacingCard?: string;
    /** 'none' quita la sombra; 'default' conserva la de Cord. */
    shadowCard?: 'none' | 'default';
}

/** Propiedades permitidas en `rules`; los valores se validan por tipo y lo demás se descarta. */
export type CordAppearanceRule = Partial<Record<
    'color' | 'background-color' | 'border-color' | 'border-width' | 'border-style' | 'border-radius' | 'font-size'
    | 'font-weight' | 'letter-spacing' | 'text-transform' | 'padding' | 'box-shadow' | 'opacity',
    string
>>;

/**
 * Define el sistema de diseño visual del cotizador embebido y de los
 * componentes nativos, para que coincida con tu aplicación.
 */
export interface CordAppearance {
    /** light, dark (alias night), auto (sigue al sistema) o flat (sin sombras). */
    theme?: 'light' | 'dark' | 'night' | 'auto' | 'flat';
    /**
     * 'none' desactiva la hoja de estilos default de los componentes NATIVOS
     * (CordBuilder y sus slots). No afecta al iframe.
     */
    baseTheme?: 'default' | 'none';
    variables?: CordAppearanceVariables;
    /** (Solo componentes nativos) className/estilo extra por elemento interno. */
    elements?: CordElements;
    /** Fuentes de Google Fonts o Bunny Fonts (https). */
    fonts?: Array<{ cssSrc: string }>;
    /**
     * Estilo por elemento del cotizador embebido. Solo selectores de la lista
     * pública y propiedades permitidas; el servidor descarta lo demás.
     */
    rules?: Partial<Record<AppearanceSelector, CordAppearanceRule>>;
    /** Opciones de layout del cotizador embebido. */
    layout?: { compact?: boolean; hideChat?: boolean; hideNotes?: boolean };
}

interface CordProviderCommonProps {
    /** Origen de Cord. Default: https://cordhq.app (self-host/staging). */
    baseUrl?: string;
    /** Token público de una cotización (el mismo de `/q/{token}`). Configura el contexto para un Iframe de Cotizador. */
    token?: string;
    /** Idioma de la interfaz y formateos. Por defecto es 'es'. */
    locale?: 'en' | 'es';
    /**
     * @deprecated Ya no se usa: cada línea toma su tasa de la configuración de
     * tu organización en Cord (GET /api/v1/elements/config).
     */
    ivaPct?: number;
    /** Registra en la consola cada petición con su request id. */
    debug?: boolean;
    /** Estilos inyectados a todos los componentes o iframes renderizados en el Provider. */
    appearance?: CordAppearance;
    /** Callback global para interceptar eventos de telemetría o acciones (ej. CHECKOUT_STARTED). */
    onAnalyticsEvent?: (event: string, payload?: unknown) => void;
    children: React.ReactNode;
}

/**
 * Propiedades del CordProvider para envolver aplicaciones React/Next.js.
 * Todas las llamadas de los hooks hijos heredarán esta configuración.
 *
 * Unión discriminada A PROPÓSITO: `publishableKey` y `proxyUrl` son
 * mutuamente excluyentes. Pasar los dos a la vez (el error real que tenía El
 * Zarco: una `pk_test_...` de prueba pegada junto a un `proxyUrl` real) hoy
 * es un error de compilación, no un bug silencioso en producción donde la
 * llave falsa se manda como `Authorization` a tu propio proxy.
 */
export type CordProviderProps =
    | ({
          /** Interactúas con la API de Cord directo desde el navegador con una llave pública. */
          mode?: 'publishable';
          publishableKey: string;
          proxyUrl?: undefined;
      } & CordProviderCommonProps)
    | ({
          /** Interactúas vía tu propio backend (recomendado para escribir en el CRM o crear cotizaciones). */
          mode?: 'proxy';
          proxyUrl: string;
          publishableKey?: undefined;
      } & CordProviderCommonProps)
    | ({
          /** Ninguno de los dos — uso "solo visor" (ej. un <CordCotizador> que únicamente muestra/aprueba una cotización). */
          mode?: undefined;
          publishableKey?: undefined;
          proxyUrl?: undefined;
      } & CordProviderCommonProps);
