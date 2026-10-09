// Estados de la factura ante la SPFE: los mensajes UBL ApplicationResponse del
// Anexo II (cobro e impago del EMISOR y sus cancelaciones) y la baja de la
// factura del Anexo I, y la lógica PURA que decide qué hay que comunicar a
// partir de los cobros reales de Cord.
//
// Qué comunica el emisor y por qué es voluntario: la obligación de informar el
// pago efectivo COMPLETO o el rechazo es del DESTINATARIO (RD 238/2026, art.
// 12.1 y 12.3, en cuatro días naturales sin contar sábados, domingos ni
// festivos nacionales). El emisor PUEDE comunicar el cobro o el impago y las
// diferencias de fechas (art. 12.4; Orden HAC/1028/2026, art. 7.2). Cord lo
// hace porque conoce el cobro: los pagos de `documento_pagos`, conciliados por
// `reconcileInvoice` (fiscal/reconciliation.ts).
//
// Sin parciales: el Anexo II solo tiene el pago y el cobro COMPLETOS, y la
// AEAT lo confirmó en su seminario técnico del 10-09-2026 ("Sin parciales. El
// pago y el cobro se informan siempre por el importe total de la factura").
// El pago parcial del art. 10.2.b) del RD es un estado opcional entre
// plataformas y no aplica a la SPFE (art. 10.7). Un abono parcial no genera
// mensaje: el cobro se comunica cuando la factura queda pagada.
//
// Puro: sin red ni base de datos.

import { el, group } from '../einvoice/xml';
import { SPFE_CODIGO_BAJA, type SpfeCodigoEmisor } from './normativa';
import type { SpfeCodigo } from './factura';

export const NS_APPLICATION_RESPONSE = 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2';
const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

/** Tipos de mensaje de la cola (`spfe_mensajes.tipo`). */
export type TipoMensaje = 'alta' | 'baja' | 'cobro' | 'anula_cobro' | 'impago' | 'anula_impago';
export const TIPOS_ESTADO: readonly TipoMensaje[] = ['cobro', 'anula_cobro', 'impago', 'anula_impago'];

/** Código del Anexo II de cada tipo de estado del emisor. */
export const CODIGO_DE: Record<Exclude<TipoMensaje, 'alta' | 'baja'>, SpfeCodigoEmisor> = {
    cobro: 'SETTLEMENT',
    anula_cobro: 'CANCELSETTLEMENT',
    impago: 'DEFAULT',
    anula_impago: 'CANCELDEFAULT',
};

/** La factura sobre la que se informa (Anexo II, grupo "FACTURA INFORMADA"). */
export interface FacturaInformada extends SpfeCodigo {
    nombreEmisor: string;
}

/**
 * Cabecera del ApplicationResponse: el XSD de UBL 2.5 exige identificador,
 * fecha y partes emisora y receptora, y el Anexo II no las define
 * (PENDIENTES_AEAT 'cabecera_mensajes'). Cord pone su propio identificador de
 * mensaje, la fecha del envío, al emisor de la factura como remitente y a la
 * AEAT como destinataria, sin inventar identificadores de la AEAT.
 */
export interface CabeceraMensaje {
    id: string;
    /** aaaa-mm-dd. */
    fecha: string;
}

/** NIF con el mismo esquema que la factura (Anexo I: TaxScheme LOC, schemeID FC). */
const nifLocal = (nif: string) => group('cac:PartyTaxScheme', [
    el('cbc:CompanyID', nif, { schemeID: 'FC' }),
    group('cac:TaxScheme', [el('cbc:ID', 'LOC')]),
]);

function emisor(f: FacturaInformada): string {
    return group('cac:IssuerParty', [nifLocal(f.nifEmisor), group('cac:PartyLegalEntity', [el('cbc:RegistrationName', f.nombreEmisor)])]);
}

function documento(cab: CabeceraMensaje, f: FacturaInformada, response: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
        + `<ApplicationResponse xmlns="${NS_APPLICATION_RESPONSE}" xmlns:cac="${NS_CAC}" xmlns:cbc="${NS_CBC}">`
        + el('cbc:ID', cab.id)
        + el('cbc:IssueDate', cab.fecha)
        + group('cac:SenderParty', [nifLocal(f.nifEmisor), group('cac:PartyLegalEntity', [el('cbc:RegistrationName', f.nombreEmisor)])])
        + group('cac:ReceiverParty', [group('cac:PartyLegalEntity', [el('cbc:RegistrationName', 'Agencia Estatal de Administración Tributaria')])])
        + group('cac:DocumentResponse', [
            response,
            // Anexo II: cac:DocumentResponse/cac:DocumentReference con número,
            // fecha, NIF y nombre del emisor de la factura informada.
            group('cac:DocumentReference', [el('cbc:ID', f.numero), el('cbc:IssueDate', f.fecha), emisor(f)]),
        ])
        + '</ApplicationResponse>\n';
}

/** Una fecha del Anexo II: cac:Status con cbc:ReferenceDate y su cac:Condition/cbc:AttributeID. */
function fechaCondicion(fecha: string | null | undefined, atributo: 'DueDate' | 'ShipmentDate' | 'ReceptionDate'): string {
    return fecha ? group('cac:Status', [el('cbc:ReferenceDate', fecha), group('cac:Condition', [el('cbc:AttributeID', atributo)])]) : '';
}

/**
 * Cobro (SETTLEMENT), impago (DEFAULT) o la cancelación de uno anterior.
 *   - SETTLEMENT: "Fecha del cobro" en EffectiveDate (1..1) y, si se conoce,
 *     el vencimiento como Status DueDate (0..1).
 *   - DEFAULT: el vencimiento del pago en EffectiveDate (1..1).
 *   - CANCELSETTLEMENT y CANCELDEFAULT: solo la factura informada.
 */
export function mensajeEstadoEmisor(p: {
    codigo: SpfeCodigoEmisor;
    factura: FacturaInformada;
    cabecera: CabeceraMensaje;
    fechaCobro?: string | null;
    vencimiento?: string | null;
}): string {
    let response: string;
    switch (p.codigo) {
        case 'SETTLEMENT':
            if (!p.fechaCobro) throw new Error('SETTLEMENT exige la fecha del cobro.');
            response = group('cac:Response', [el('cbc:ResponseCode', p.codigo), el('cbc:EffectiveDate', p.fechaCobro), fechaCondicion(p.vencimiento, 'DueDate')]);
            break;
        case 'DEFAULT':
            if (!p.vencimiento) throw new Error('DEFAULT exige la fecha de vencimiento del pago.');
            response = group('cac:Response', [el('cbc:ResponseCode', p.codigo), el('cbc:EffectiveDate', p.vencimiento)]);
            break;
        default:
            response = group('cac:Response', [el('cbc:ResponseCode', p.codigo)]);
    }
    return documento(p.cabecera, p.factura, response);
}

/**
 * Baja de una factura que resultó improcedente por inexistencia de la
 * operación (Orden, art. 3.5). Las rutas del Anexo I para este mensaje
 * (cac:Response/cac:DocumentReference y cac:PartyTaxScheme/cac:PartyLegalEntity)
 * no existen en el XSD de UBL 2.5: se usa la misma forma que los mensajes del
 * Anexo II, que sí es UBL válido (PENDIENTES_AEAT 'cabecera_mensajes').
 */
export function mensajeBaja(p: { factura: FacturaInformada; cabecera: CabeceraMensaje; fechaBaja: string }): string {
    return documento(p.cabecera, p.factura, group('cac:Response', [el('cbc:ResponseCode', SPFE_CODIGO_BAJA), el('cbc:EffectiveDate', p.fechaBaja)]));
}

// ── Qué hay que comunicar ───────────────────────────────────────────────────

export type EstadoCobro =
    | { tipo: 'sin_estado' }
    | { tipo: 'cobrada'; fecha: string }
    | { tipo: 'impagada'; vencimiento: string };

export interface DocumentoCobro {
    /** `documentos_fiscales.lifecycle`. */
    lifecycle: string;
    amountPaid: number;
    amountRefunded: number;
    /** aaaa-mm-dd. */
    vencimiento?: string | null;
    esRectificativa: boolean;
}

/**
 * El estado de cobro que la SPFE debería conocer, a partir del documento ya
 * conciliado (`reconcileInvoice` mantiene `lifecycle`, `amount_paid` y
 * `amount_refunded`):
 *   - pagada con dinero cobrado de verdad → cobrada, con la fecha del ÚLTIMO
 *     pago (el que la dejó saldada). Una factura saldada solo con notas de
 *     crédito no tiene cobro que comunicar: la rectificativa ya lo dice;
 *   - marcada como incobrable y con vencimiento → impagada;
 *   - cualquier otra cosa → sin estado (un abono parcial no se comunica).
 * Una rectificativa no lleva estado de cobro.
 */
export function estadoCobroDeseado(doc: DocumentoCobro, fechasPago: string[]): EstadoCobro {
    if (doc.esRectificativa) return { tipo: 'sin_estado' };
    const cobrado = Math.round((Number(doc.amountPaid) - Number(doc.amountRefunded)) * 100);
    if (doc.lifecycle === 'paid' && cobrado > 0 && fechasPago.length) {
        return { tipo: 'cobrada', fecha: [...fechasPago].sort().at(-1)! };
    }
    if (doc.lifecycle === 'uncollectible' && doc.vencimiento) return { tipo: 'impagada', vencimiento: doc.vencimiento };
    return { tipo: 'sin_estado' };
}

export interface MensajeEstadoPrevio {
    tipo: TipoMensaje;
    estado: string;
    datos: { fechaCobro?: string | null; vencimiento?: string | null } | null;
}

/**
 * Lo que la SPFE YA sabe del cobro: el pago declarado en la propia factura
 * (BT-ES-2) y después, en orden, cada mensaje de estado ADMITIDO.
 */
export function estadoComunicado(pagadaEnFactura: string | null, mensajes: MensajeEstadoPrevio[]): EstadoCobro {
    let estado: EstadoCobro = pagadaEnFactura ? { tipo: 'cobrada', fecha: pagadaEnFactura } : { tipo: 'sin_estado' };
    for (const m of mensajes) {
        if (m.estado !== 'admitido') continue;
        if (m.tipo === 'cobro' && m.datos?.fechaCobro) estado = { tipo: 'cobrada', fecha: m.datos.fechaCobro };
        else if (m.tipo === 'impago' && m.datos?.vencimiento) estado = { tipo: 'impagada', vencimiento: m.datos.vencimiento };
        else if (m.tipo === 'anula_cobro' || m.tipo === 'anula_impago') estado = { tipo: 'sin_estado' };
    }
    return estado;
}

export interface SiguienteEstado {
    tipo: Exclude<TipoMensaje, 'alta' | 'baja'>;
    datos: { fechaCobro?: string; vencimiento?: string };
}

/**
 * El siguiente mensaje para llevar la SPFE de `comunicado` a `deseado`, de uno
 * en uno: un cobro con otra fecha primero se cancela y después se vuelve a
 * comunicar (dos mensajes, cada uno en su turno de la cola).
 */
export function siguienteMensajeEstado(deseado: EstadoCobro, comunicado: EstadoCobro, vencimiento?: string | null): SiguienteEstado | null {
    if (comunicado.tipo === 'cobrada') {
        if (deseado.tipo === 'cobrada' && deseado.fecha === comunicado.fecha) return null;
        return { tipo: 'anula_cobro', datos: {} };
    }
    if (comunicado.tipo === 'impagada') {
        if (deseado.tipo === 'impagada' && deseado.vencimiento === comunicado.vencimiento) return null;
        return { tipo: 'anula_impago', datos: {} };
    }
    if (deseado.tipo === 'cobrada') return { tipo: 'cobro', datos: { fechaCobro: deseado.fecha, ...(vencimiento ? { vencimiento } : {}) } };
    if (deseado.tipo === 'impagada') return { tipo: 'impago', datos: { vencimiento: deseado.vencimiento } };
    return null;
}
