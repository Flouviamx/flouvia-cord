// El puerto de transporte hacia la solución pública de facturación electrónica
// (SPFE). Es una abstracción INTERNA de Cord, no el contrato de la AEAT: dice
// lo que la cola necesita según lo que la Orden HAC/1028/2026 ya describe, y
// nada más:
//
//   - remitir facturas por servicio web, con una respuesta que lista las
//     admitidas y las rechazadas con su motivo, y un acuse con código seguro de
//     verificación (art. 5.2 y 5.4);
//   - dar de baja una factura (art. 3.5);
//   - comunicar los estados del emisor, con la misma forma de respuesta (arts.
//     7.2, 8.1.a y 8.3);
//   - consultar las facturas y sus estados por su código único (arts. 6 y 10).
//
// Autenticación: certificado electrónico del remitente (art. 11.1). Cord usa
// el del propio negocio —el mismo que sube para Verifactu—, es decir, la
// remisión "en nombre propio" (art. 11.2); no actúa como colaborador social ni
// como apoderado.
//
// El adaptador real NO existe: el WSDL, el sobre ebXML, las direcciones de los
// entornos y el catálogo de errores no estaban publicados en la Sede de la AEAT
// a 9 de octubre de 2026 (PENDIENTES_AEAT). `transporteAeat()` devuelve null y
// el riel se queda en "Próximamente". Cuando se publiquen, el adaptador se
// escribe contra esos archivos (no contra el seminario) y se vacía la lista.
// Las pruebas usan una AEAT simulada que implementa este mismo puerto.

import type { TlsCredenciales } from '../verifactu/cert';
import type { EntornoSpfe } from './config';
import { spfeConfig } from './config';
import type { SpfeCodigo } from './factura';
import { PENDIENTES_AEAT, type SpfeCodigoDestinatario, type SpfeCodigoEmisor } from './normativa';

/** Un mensaje que sale: factura (alta), baja o estado del emisor. */
export interface ItemEnvio {
    /** `spfe_mensajes.id`: solo lo usa Cord para emparejar la respuesta. */
    id: string;
    codigo: SpfeCodigo;
    xml: string;
}

/** Lo que la SPFE dijo de UN mensaje (art. 5.4: admitidas y rechazadas con su motivo). */
export type ResultadoItem =
    | { resultado: 'admitido'; csv?: string | null; localizador?: string | null }
    | { resultado: 'rechazado'; codigo?: string | null; descripcion: string; duplicado?: boolean };

export interface RespuestaEnvio {
    /** Acuse de recibo con el código seguro de verificación (art. 5.4). */
    csv?: string | null;
    /** Por id del mensaje. Un mensaje sin línea de respuesta queda sin resolver. */
    resultados: Map<string, ResultadoItem>;
}

export interface EstadoDestinatarioConsultado {
    codigo: SpfeCodigoDestinatario;
    /** aaaa-mm-dd: fecha de efecto (pago o rechazo). */
    fecha: string;
    /** L1 del Anexo II, solo en un rechazo. */
    motivo?: '01' | '02' | null;
    /** Vencimiento del plazo de pago que informó el destinatario. */
    vencimiento?: string | null;
}

/** Lo que la SPFE tiene de una factura (art. 10: consulta de facturas y de sus estados). */
export interface FacturaConsultada {
    codigo: SpfeCodigo;
    /** La factura consta (no rechazada y no dada de baja). */
    consta: boolean;
    localizador?: string | null;
    /** Último estado del emisor que consta, si hay. */
    estadoEmisor?: { codigo: SpfeCodigoEmisor; fecha?: string | null } | null;
    estadosDestinatario?: EstadoDestinatarioConsultado[];
}

/** Lo que Cord necesita de la SPFE. Un adaptador por entorno y por negocio (su certificado). */
export interface SpfeTransporte {
    readonly entorno: EntornoSpfe;
    remitirFacturas(items: ItemEnvio[]): Promise<RespuestaEnvio>;
    anularFacturas(items: ItemEnvio[]): Promise<RespuestaEnvio>;
    comunicarEstados(items: ItemEnvio[]): Promise<RespuestaEnvio>;
    consultarFacturas(codigos: SpfeCodigo[]): Promise<FacturaConsultada[]>;
}

/**
 * No hubo respuesta legible (red, tiempo agotado, respuesta truncada): NO hay
 * prueba de que la SPFE no lo procesara. Lo enviado queda `incierto` y solo una
 * consulta lo resuelve; jamás se reenvía a ciegas.
 */
export class SpfeSinRespuestaError extends Error {
    constructor(detalle: string) {
        super(detalle);
        this.name = 'SpfeSinRespuestaError';
    }
}

/**
 * La SPFE rechazó la PETICIÓN antes de procesar mensaje alguno (certificado,
 * representación, servicio no disponible): nada quedó registrado. Los mensajes
 * vuelven a `pendiente` y la organización se pausa un rato.
 */
export class SpfePeticionRechazadaError extends Error {
    constructor(detalle: string) {
        super(detalle);
        this.name = 'SpfePeticionRechazadaError';
    }
}

/** Topes que la cola respeta. El de remisión es el que anunció la AEAT (1–100 por remesa, seminario 10-09-2026). */
export const MAX_POR_REMESA = 100;
export const MAX_POR_CONSULTA = 100;

/** Se pone en true en el mismo cambio que implementa `transporteAeat` contra el WSDL publicado. */
const TRANSPORTE_REAL_IMPLEMENTADO = false;

/**
 * El adaptador real de la AEAT para un negocio. Hoy no existe: el WSDL y el
 * sobre no están publicados (PENDIENTES_AEAT 'transporte'). Devuelve null y la
 * cola no toca la red ni descifra el certificado.
 */
export function transporteAeat(_entorno: EntornoSpfe, _credenciales: TlsCredenciales): SpfeTransporte | null {
    return null;
}

/**
 * ¿Existe un adaptador real y no queda ningún punto abierto? Mientras la AEAT
 * no publique su especificación técnica, false: aunque el interruptor esté
 * encendido, el riel no envía nada y la pantalla dice "Próximamente".
 */
export function transporteDisponible(): boolean {
    return PENDIENTES_AEAT.length === 0 && TRANSPORTE_REAL_IMPLEMENTADO;
}


export type EstadoRiel = 'proximamente' | 'activo';

/** Estado del riel para la pantalla: solo "activo" con el interruptor encendido Y el transporte real. */
export function spfeEstadoRiel(): { estado: EstadoRiel; entorno: EntornoSpfe } {
    const config = spfeConfig();
    return { estado: config.habilitado && transporteDisponible() ? 'activo' : 'proximamente', entorno: config.entorno };
}
