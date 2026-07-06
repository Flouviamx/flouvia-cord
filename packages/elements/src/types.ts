import type * as React from 'react';

// Tipos públicos de @flouviahq/elements. Superficie mínima a propósito.

/** Payload que viaja con cada evento del cotizador. */
export interface CordEventDetail {
    /** token público de la cotización */
    token?: string;
    /** folio legible, ej. "COT-0148" */
    folio?: string;
    /** campos extra según el evento (comentario, propuesta, url de pago…) */
    [key: string]: unknown;
}

export interface CordElementOptions {
    /** Token público de la cotización (de /q/{token} o la API). REQUERIDO. */
    token: string;
    /** Origen de Cord. Default: https://cord.flouvia.com (cambiar para self-host/staging). */
    baseUrl?: string;
    /** Alto inicial del skeleton en px mientras carga. Default 420. */
    minHeight?: number;
    /** El cotizador terminó de cargar. */
    onReady?: () => void;
    /** El cliente aprobó la cotización. */
    onApproved?: (detail: CordEventDetail) => void;
    /** El cliente rechazó la cotización. */
    onRejected?: (detail: CordEventDetail) => void;
    /** El cliente envió un comentario o contraoferta. */
    onMessage?: (detail: CordEventDetail) => void;
    /** El cliente inició el pago en línea. */
    onPay?: (detail: CordEventDetail) => void;
    /** Catch-all: cualquier evento `cord:*` (incluye los anteriores). */
    onEvent?: (type: string, detail: CordEventDetail) => void;
    /** Configuración de branding para inyectar al iframe */
    appearance?: CordAppearance;
}

/** Handle devuelto por mountCotizador() para limpiar la instancia. */
export interface CordController {
    /** Quita el iframe, los listeners y el skeleton. */
    destroy(): void;
    /** El elemento contenedor. */
    readonly el: HTMLElement;
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
}

/** Datos para crear una nueva cotización vía API o SDK. */
export interface CreateQuoteInput {
    /** Si es `true`, la cotización se enviará por correo al cliente inmediatamente tras crearla. */
    send?: boolean;
    /** Notas adicionales o términos específicos que aparecerán al final de la cotización. */
    notas?: string;
    /** ID del cliente (requerido si `send` es true o si se quieren tomar los términos por defecto del cliente). */
    cliente_id?: string;
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
    colorText?: string;
    colorBackground?: string;
    fontFamily?: string;
    borderRadius?: string;
    [key: string]: string | undefined;
}

/**
 * Define el sistema de diseño visual inyectado en el Iframe (CordEmbed)
 * para mantener consistencia con tu aplicación anfitriona.
 */
export interface CordAppearance {
    /** Fuerza el tema claro, oscuro, o usa la preferencia del sistema. */
    theme?: 'light' | 'dark' | 'auto';
    /** 
     * Variables CSS. Modifican colores, tipografías y bordes globales de los componentes.
     * Soporta valores como '#fff', 'hsl(210 100% 50%)', '12px', 'Inter, sans-serif'.
     */
    variables?: CordAppearanceVariables;
    /** (Avanzado) Reglas para selectores específicos dentro del iframe. */
    rules?: Record<string, any>;
    /** Fuentes externas a cargar (ej. Google Fonts). */
    fonts?: Array<{ cssSrc: string }>;
}

/**
 * Propiedades del CordProvider para envolver aplicaciones React/Next.js.
 * Todas las llamadas de los hooks hijos heredarán esta configuración.
 */
export interface CordProviderProps {
    /** (Opcional) URL absoluta hacia tu Backend for Frontend que hace de proxy a la API de Cord. */
    proxyUrl?: string;
    /** 
     * Llave pública (`pk_live_...` o `pk_test_...`) para interactuar con la API de Cord
     * directamente desde el navegador sin necesidad de un backend. 
     */
    publishableKey?: string;
    /** Token público de una cotización (`cot_...`). Configura el contexto para un Iframe de Cotizador. */
    token?: string;
    /** Idioma de la interfaz y formateos. Por defecto es 'es'. */
    locale?: 'en' | 'es';
    /** Estilos inyectados a todos los componentes o iframes renderizados en el Provider. */
    appearance?: CordAppearance;
    /** Callback global para interceptar eventos de telemetría o acciones (ej. CHECKOUT_STARTED). */
    onAnalyticsEvent?: (event: string, payload?: unknown) => void;
    children: React.ReactNode;
}
