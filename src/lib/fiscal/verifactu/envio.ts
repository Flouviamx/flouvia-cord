// Lógica PURA del envío a la AEAT: cómo se agrupan los registros pendientes en
// envíos, cómo se empareja cada línea de la respuesta con su registro y qué
// significa cada SoapFault. Sin red ni base de datos, para que
// verifactu-check.mjs y vitest la ejerzan tal cual; submit.ts solo la aplica.

// Extensión .ts explícita: verifactu-check.mjs carga este módulo con Node plano.
import type { AltaPayload, AnulacionPayload, BatchRegistro, RegistroIdentity, RespuestaEnvio, RespuestaLinea } from './aeat.ts';
import { AeatCertificadoError, AeatFaultError } from './aeat.ts';

export type EstadoEnvio = 'pendiente' | 'aceptado' | 'aceptado_con_errores' | 'rechazado' | 'bloqueado';

export interface FilaPendiente {
    id: string;
    tipo: 'alta' | 'anulacion';
    seq: number;
    payload: AltaPayload | AnulacionPayload;
}

/** IDFactura del registro, sea alta o anulación. */
export function identidadDeRegistro(tipo: 'alta' | 'anulacion', payload: any): RegistroIdentity {
    return tipo === 'alta'
        ? { idEmisorFactura: payload.idEmisorFactura, numSerieFactura: payload.numSerieFactura, fechaExpedicionFactura: payload.fechaExpedicionFactura }
        : { idEmisorFactura: payload.idEmisorFacturaAnulada, numSerieFactura: payload.numSerieFacturaAnulada, fechaExpedicionFactura: payload.fechaExpedicionFacturaAnulada };
}

function entornoDe(payload: any, porDefecto: 'pruebas' | 'produccion'): 'pruebas' | 'produccion' {
    return payload?.entorno === 'pruebas' || payload?.entorno === 'produccion' ? payload.entorno : porDefecto;
}

export interface GrupoEnvio {
    entorno: 'pruebas' | 'produccion';
    emisor: { nif: string; nombreRazon: string };
    filas: FilaPendiente[];
    registros: BatchRegistro[];
}

/**
 * El PRIMER envío que toca hacer con la cola pendiente (ordenada por `seq`):
 * el tramo contiguo más largo del mismo obligado (NIF) y el mismo entorno,
 * hasta `max` registros. Un envío solo admite un ObligadoEmision y un endpoint;
 * cortar por tramos contiguos —en vez de reagrupar— conserva el orden de la
 * cadena, que es el que la AEAT necesita para que una anulación no llegue antes
 * que su alta (error 3002).
 *
 * `previoDelPrimero` es la identidad del registro `seq - 1` (puede estar fuera
 * de la cola: ya enviado, rechazado o bloqueado). El resto se encadena dentro
 * del propio tramo.
 */
export function primerGrupo(
    pendientes: FilaPendiente[],
    previoDelPrimero: RegistroIdentity | null,
    opciones: { max: number; entornoPorDefecto: 'pruebas' | 'produccion'; nombrePorDefecto: string },
): GrupoEnvio | null {
    if (!pendientes.length) return null;
    const first = pendientes[0];
    const nif = identidadDeRegistro(first.tipo, first.payload).idEmisorFactura;
    const entorno = entornoDe(first.payload, opciones.entornoPorDefecto);
    const filas: FilaPendiente[] = [];
    for (const fila of pendientes) {
        if (filas.length >= Math.max(1, Math.min(1000, opciones.max))) break;
        if (filas.length && fila.seq !== filas[filas.length - 1].seq + 1) break;
        if (identidadDeRegistro(fila.tipo, fila.payload).idEmisorFactura !== nif) break;
        if (entornoDe(fila.payload, opciones.entornoPorDefecto) !== entorno) break;
        filas.push(fila);
    }
    let previous = previoDelPrimero;
    const registros: BatchRegistro[] = filas.map((fila) => {
        const registro: BatchRegistro = { tipo: fila.tipo, payload: fila.payload, previous };
        previous = identidadDeRegistro(fila.tipo, fila.payload);
        return registro;
    });
    // La razón social de la cabecera: la del alta más reciente del tramo. Una
    // anulación anterior a este cambio no la guardaba.
    const altaConNombre = [...filas].reverse().find((f) => f.tipo === 'alta' && (f.payload as AltaPayload).nombreRazonEmisor);
    const nombreRazon = String(
        (altaConNombre?.payload as AltaPayload | undefined)?.nombreRazonEmisor
        || (filas.find((f) => (f.payload as any).nombreRazonEmisor)?.payload as any)?.nombreRazonEmisor
        || opciones.nombrePorDefecto,
    );
    return { entorno, emisor: { nif, nombreRazon }, filas, registros };
}

function clave(tipo: 'alta' | 'anulacion', id: RegistroIdentity): string {
    return `${tipo}|${id.idEmisorFactura}|${id.numSerieFactura}|${id.fechaExpedicionFactura}`;
}

export interface Resolucion {
    fila: FilaPendiente;
    estado: EstadoEnvio;
    linea: RespuestaLinea | null;
    /** Motivo legible para el historial cuando no es un "Correcto" limpio. */
    motivo?: string;
}

/**
 * Empareja cada registro del envío con SU línea de respuesta por
 * (operación, NIF, número, fecha) — antes solo por número, así que el alta y la
 * anulación de una misma factura en un mismo lote se pisaban la respuesta.
 *
 * - Correcto → aceptado; AceptadoConErrores → aceptado_con_errores.
 * - 3000 (duplicado): la AEAT ya tenía ese registro — típicamente porque un
 *   envío anterior sí llegó y su respuesta se perdió. El estado real es el del
 *   registro que ella guarda (`EstadoRegistroDuplicado`), no un rechazo.
 * - 3001 en una anulación: la factura ya estaba anulada; el efecto buscado ya
 *   existe.
 * - Cualquier otro Incorrecto → rechazado (necesita subsanación).
 * - Sin línea de respuesta → sigue pendiente: no hay prueba de que la AEAT lo
 *   procesara, y marcarlo rechazado para siempre lo sacaba de la cola sin que
 *   nadie lo hubiera rechazado de verdad.
 */
export function resolverRespuesta(grupo: GrupoEnvio, respuesta: RespuestaEnvio): Resolucion[] {
    const porClave = new Map<string, RespuestaLinea>();
    for (const linea of respuesta.lineas) {
        const tipo = linea.tipoOperacion === 'Anulacion' ? 'anulacion' : 'alta';
        porClave.set(clave(tipo, linea), linea);
    }
    return grupo.filas.map((fila) => {
        const linea = porClave.get(clave(fila.tipo, identidadDeRegistro(fila.tipo, fila.payload))) ?? null;
        if (!linea) return { fila, estado: 'pendiente' as const, linea, motivo: 'La AEAT no devolvió respuesta para este registro.' };
        if (linea.estado === 'Correcto') return { fila, estado: 'aceptado' as const, linea };
        if (linea.estado === 'AceptadoConErrores') return { fila, estado: 'aceptado_con_errores' as const, linea, motivo: linea.descripcionError };
        if (linea.codigoError === 3000) {
            const dup = linea.registroDuplicado?.estado;
            // Un ALTA cuyo duplicado la AEAT guarda como anulado no está vigente
            // allí: darla por aceptada escondía que la factura consta anulada.
            if (fila.tipo === 'alta' && dup === 'Anulada') {
                return { fila, estado: 'rechazado' as const, linea, motivo: 'La AEAT tiene esta factura registrada como anulada; hay que volver a darla de alta.' };
            }
            const estado = dup === 'AceptadaConErrores' ? 'aceptado_con_errores' as const : 'aceptado' as const;
            return { fila, estado, linea, motivo: 'La AEAT ya tenía este registro (duplicado).' };
        }
        if (linea.codigoError === 3001 && fila.tipo === 'anulacion') {
            return { fila, estado: 'aceptado' as const, linea, motivo: 'La factura ya constaba anulada en la AEAT.' };
        }
        return { fila, estado: 'rechazado' as const, linea, motivo: linea.descripcionError };
    });
}

// Códigos de SoapFault que hablan de la CABECERA, del certificado o del
// servicio — no de un registro concreto. Partir el lote no los aísla: todos
// los trozos fallarían igual y se aparcarían registros correctos. Se reintenta
// la organización completa más tarde.
const FAULT_CABECERA = new Set([
    4104, 4105, 4107, 4108, 4110, 4111, 4112, 4115, 4116, 4117, 4118,
    4120, 4121, 4122, 4123, 4124, 4125, 4126, 4127, 4128, 4129, 4130, 4131, 4132, 4133,
    4134, 4135, 4139, 4140, 4141, 3500, 3501,
]);

export type ClaseFallo = 'transitorio' | 'cabecera' | 'aislable';

/**
 * - transitorio: red, timeout, HTTP sin SOAP o faultcode Server → reenviar tal cual.
 * - cabecera: certificado, NIF del obligado, servicio suspendido → reintentar
 *   la org más tarde, sin tocar los registros.
 * - aislable: el mensaje no cumple el esquema por culpa de ALGÚN registro
 *   (4102, 4103, 4106, 4109, 4119, 4136, 4137…) → partir el lote hasta dejar
 *   solo al culpable y aparcarlo, en vez de reenviar el mismo lote para siempre.
 */
export function clasificarFallo(error: unknown): ClaseFallo {
    // Certificado no reconocido: reenviar con el mismo no sirve de nada.
    if (error instanceof AeatCertificadoError) return 'cabecera';
    if (!(error instanceof AeatFaultError)) return 'transitorio';
    if (/server/i.test(error.faultcode)) return 'transitorio';
    if (error.codigo !== undefined && FAULT_CABECERA.has(error.codigo)) return 'cabecera';
    return 'aislable';
}

/** Lote siguiente tras un fallo aislable: la mitad, hasta llegar a 1. */
export function loteTrasFallo(tamanoEnviado: number): number {
    return Math.max(1, Math.ceil(tamanoEnviado / 2));
}

/** Tiempo de espera entre envíos: el que diga la AEAT, 60 s si no dice nada (art. 16.2 de la Orden). */
export function segundosDeEspera(respuesta: RespuestaEnvio | null): number {
    const t = respuesta?.tiempoEsperaEnvio;
    return Number.isFinite(t) && (t as number) >= 0 ? Math.min(86_400, Math.round(t as number)) : 60;
}
