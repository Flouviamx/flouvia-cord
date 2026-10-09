// El puerto de transmisión: lo que Cord necesita de una plataforma autorizada
// (PA) francesa, en vocabulario de Cord y no del proveedor. La cola
// (cola.ts), el alta (alta.ts) y los eventos (eventos.ts) hablan SOLO con esta
// interfaz; cada proveedor (hoy Iopole, en iopole/) la implementa traduciendo
// a su API. Cambiar de plataforma —o sumar otra, por ejemplo Storecove— es
// escribir otro adaptador, no reescribir el outbox.
//
// Los importes viajan como número con su divisa al lado (regla 21) y las
// tasas en PORCENTAJE (20, 5.5), que es como las piden la norma (BT-152) y
// las plataformas.
//
// Puro: solo tipos y errores.

import type { CadreFacturation } from '../einvoice/fr-ctc';
import type { RegimenTva } from './periodos';

export type ProveedorId = 'iopole';
export type EntornoPa = 'preproduccion' | 'produccion';

// ── Alta del negocio (enrollment) ────────────────────────────────────────────

export interface SolicitudAlta {
    siren: string;
    regimen: RegimenTva;
    contactoEmail: string;
    /** Dirección postal en una línea. */
    direccion: string;
    /** Representante legal que firma el mandato, si el negocio lo dio. */
    representante?: { nombre: string; apellido: string; cargo: string } | null;
}

export interface AltaCreada {
    altaId: string;
    /** Enlace donde el negocio verifica su identidad y firma el mandato. */
    enlace: string;
}

/** Estado del alta en vocabulario de Cord (la etapa del proveedor se guarda aparte). */
export type EstadoAlta = 'en_curso' | 'accion_requerida' | 'completada' | 'cancelada';

export interface AltaConsultada {
    altaId: string;
    etapa: string;
    estado: EstadoAlta;
    enlace: string | null;
}

// ── Factura (flujo 2) y su ciclo de vida (flujo 6) ──────────────────────────

export interface ArchivoFactura {
    nombre: string;
    tipo: 'application/pdf' | 'application/xml';
    contenido: Uint8Array;
}

export interface FacturaEncontrada {
    id: string;
}

/** Un estado del ciclo de vida de una factura, como lo notificó la plataforma. */
export interface EstadoFactura {
    /** Id del estado en la plataforma: la idempotencia de lo recibido. */
    estadoId: string;
    /** Id de la factura en la plataforma. */
    facturaId: string;
    /** Código de la DGFiP (200…213, 501) o null si la plataforma no lo da. */
    codigo: string | null;
    /** Código del proveedor (RECEIVED, REFUSED…), tal cual. */
    codigoProveedor: string;
    fecha: string;
    /** Número de factura (BT-1) y SIREN del emisor, para reconciliar un envío incierto. */
    numero?: string | null;
    sirenEmisor?: string | null;
    motivo?: string | null;
    detalle?: Record<string, unknown> | null;
}

/** Cobro de una factura cuya TVA es exigible al cobro (estado 212 "Encaissée"). Importe negativo = devolución. */
export interface CobroFactura {
    fecha: string;
    moneda: string;
    porTasa: { tasa: number; importe: number }[];
    /** Obligatorio en una devolución (motivo del decaissement, regla P1.17). */
    mensaje?: string | null;
}

// ── E-reporting (flujo 10) ───────────────────────────────────────────────────

export interface ParteReporte {
    nombre: string;
    tva?: string | null;
    pais: string;
    direccion: { linea1?: string | null; ciudad?: string | null; cp?: string | null };
    /** Identificador (G2.19 de la DGFiP): 0002 SIREN, 0223 TVA de la UE, 0227 fuera de la UE. */
    identificador: { esquema: string; valor: string };
}

export type FechaExigibilidad = 'factura' | 'entrega' | 'cobro';

/** Bloque 10.1: una factura con una empresa establecida fuera de Francia. */
export interface ReporteFactura {
    numero: string;
    fecha: string;
    tipo: '380' | '381';
    cadre: CadreFacturation;
    vencimiento?: string | null;
    moneda: string;
    base: number;
    impuesto: number;
    /** Divisa en que se declara la TVA (EUR). */
    monedaImpuesto: string;
    desglose: { base: number; impuesto: number; tasa: number; categoria: string }[];
    exigibilidad?: FechaExigibilidad | null;
    debitos: boolean;
    vendedor: ParteReporte;
    comprador: ParteReporte;
    facturaPrevia?: { numero: string; fecha: string } | null;
}

export type CategoriaTransaccion = 'TLB1' | 'TPS1' | 'TNT1';

/** Bloque 10.3: las operaciones con particulares de un día, en una divisa. */
export interface ReporteTransacciones {
    fecha: string;
    /** Identificador del cierre (único por caja): el día, la divisa y el número de envío. */
    cierre: string;
    moneda: string;
    categorias: {
        categoria: CategoriaTransaccion;
        base: number;
        impuesto: number;
        desglose: { base: number; impuesto: number; tasa: number; categoria: string }[];
        exigibilidad?: FechaExigibilidad | null;
        debitos?: boolean;
    }[];
}

/** Bloque 10.2: lo cobrado de una factura con el extranjero, por tasa, en euros. */
export interface ReportePagoFactura {
    numero: string;
    fechaFactura: string;
    fechaPago: string;
    porTasa: { tasa: number; importe: number }[];
}

/** Bloque 10.4: lo cobrado en un día de operaciones con particulares, por tasa, en euros. */
export interface ReportePagoTransacciones {
    fechaPago: string;
    porTasa: { tasa: number; importe: number }[];
}

export interface Recibido {
    /** Id que asignó la plataforma: la reconciliación de lo que notifique después. */
    id: string;
}

// ── El puerto ────────────────────────────────────────────────────────────────

export interface ProveedorTransmision {
    readonly id: ProveedorId;
    readonly entorno: EntornoPa;
    /** Nombre comercial: solo se muestra donde el negocio firma su mandato (regla 14). */
    readonly nombre: string;

    crearAlta(s: SolicitudAlta): Promise<AltaCreada>;
    consultarAlta(altaId: string): Promise<AltaConsultada | null>;
    /** El alta en curso de un SIREN: lo que resuelve un alta que salió sin respuesta. */
    buscarAltaEnCurso(siren: string): Promise<AltaCreada | null>;
    /** El id de la entidad del negocio en la plataforma, una vez completada el alta. */
    buscarEntidad(siren: string): Promise<string | null>;

    enviarFactura(archivo: ArchivoFactura): Promise<Recibido>;
    /** Lo que resuelve una factura que salió sin respuesta: la busca por emisor y número. */
    buscarFactura(q: { siren: string; numero: string; desde: string }): Promise<FacturaEncontrada | null>;
    /** Historial de estados de una factura. Solo para consultar, nunca para sondear. */
    estadosFactura(facturaId: string): Promise<EstadoFactura[]>;
    enviarCobro(facturaId: string, cobro: CobroFactura): Promise<Recibido>;

    reportarFactura(siren: string, r: ReporteFactura): Promise<Recibido>;
    reportarTransacciones(siren: string, r: ReporteTransacciones): Promise<Recibido>;
    reportarPagoFactura(siren: string, r: ReportePagoFactura): Promise<Recibido>;
    reportarPagoTransacciones(siren: string, r: ReportePagoTransacciones): Promise<Recibido>;
}

// ── Eventos que notifica la plataforma (webhook), ya verificados ─────────────

export type EventoPlataforma =
    | { tipo: 'alta'; altaId: string; etapa: string; estado: EstadoAlta; fecha: string }
    | { tipo: 'estado_factura'; estado: EstadoFactura }
    | { tipo: 'reporte_integrado'; envioProveedorId: string; fecha: string }
    | { tipo: 'reporte_rechazado'; envioProveedorId: string; motivo: string; detalle?: Record<string, unknown> | null }
    | { tipo: 'cobro_rechazado'; envioProveedorId: string; motivo: string }
    | { tipo: 'factura_no_entregada'; facturaId: string; motivo: string }
    | { tipo: 'ignorado'; razon: string };

// ── Errores ──────────────────────────────────────────────────────────────────

/**
 * La petición salió y no hubo respuesta legible (red, tiempo agotado, 5xx):
 * no se sabe si la plataforma la procesó. El envío queda INCIERTO y solo una
 * consulta lo resuelve; nunca se repite a ciegas.
 */
export class TransmisionSinRespuestaError extends Error {
    constructor(message: string) { super(message); this.name = 'TransmisionSinRespuestaError'; }
}

/**
 * La plataforma rechazó la PETICIÓN, no el documento (credenciales, permisos,
 * límite de peticiones): nada se procesó. Lo enviado vuelve a la cola y la
 * organización espera antes de reintentar.
 */
export class TransmisionPeticionRechazadaError extends Error {
    constructor(message: string, readonly status?: number) { super(message); this.name = 'TransmisionPeticionRechazadaError'; }
}

/**
 * La plataforma rechazó el documento (validación, duplicado, destinatario
 * desconocido). Es final: queda a la vista del negocio con su motivo y nadie
 * lo corrige solo.
 */
export class TransmisionRechazoError extends Error {
    constructor(message: string, readonly codigo?: string | null, readonly detalle?: unknown) { super(message); this.name = 'TransmisionRechazoError'; }
}
