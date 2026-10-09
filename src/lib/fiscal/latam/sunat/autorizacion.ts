// Envío de facturas y notas de crédito a SUNAT (SEE - Del contribuyente) con
// la máquina de estados del marco común (latam/comprobantes.ts).
//
// sendBill es SÍNCRONO: devuelve la Constancia de Recepción (CDR) en la
// misma llamada [MAN §2.4]. Lo que no es síncrono es la certeza: el pedido
// puede salir, SUNAT registrarlo y la respuesta perderse. Además, en SUNAT un
// rechazo CONSUME el número ("la numeración se considera ya utilizada",
// [MAN §4.1]) y una excepción no ("el documento se considera como no
// informado"). Por eso:
//
//   1. Una secuencia (RUC + serie + tipo) tiene un solo envío en vuelo (lease).
//      Dentro del lease, lo colgado de esa secuencia se resuelve ANTES de
//      numerar otro comprobante.
//   2. El número es el mayor número USADO de la secuencia + 1: autorizado, en
//      vuelo o rechazado por SUNAT (respuesta.numero_consumido). Un intento
//      descartado o con excepción no lo consume.
//   3. Se firma, se reclama el número con el XML firmado dentro de la
//      solicitud (lo que se envía es exactamente lo que queda guardado) y se
//      marca enviado ANTES de enviar.
//   4. Sin respuesta legible, el intento queda `incierto` y se resuelve
//      CONSULTANDO: en producción, billConsultService (getStatus y
//      getStatusCdr). El servicio beta no tiene consulta ni guarda estado
//      (su getStatusAR responde "Internal Error" y acepta el mismo número dos
//      veces: scripts/fixtures/sunat/beta/), así que allí la única forma de
//      saber qué responde es volver a presentarle el MISMO XML firmado; eso
//      solo ocurre en homologación, que no tiene efecto fiscal.

import { sql, withOrgTx } from '../../../db';
import { log } from '../../../log';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, sinResolverDeSecuencia, type IntentoRail,
} from '../comprobantes';
import { credencialActiva, leerAjustes, type CredencialActiva } from '../credenciales';
import { RailDatosError, RailNoDisponibleError, RailTransitorioError, MSG_INCIERTO } from '../errores';
import type { EntornoRail } from '../rieles';
import { leerCdr, type Cdr } from './cdr';
import { conNumero, idComprobante, nombreArchivo, rucValido, serieValida, type ConceptoSunat, type SolicitudSunat } from './comprobante';
import { AFECTACION, CLAVE_BETA, ESTADO_CONSULTA, ESTABLECIMIENTO_DOMICILIO_FISCAL, TIPO_DOC, USUARIO_BETA, claseCodigo } from './constantes';
import { mensajeExcepcion, mensajeObservacion, mensajeRechazo } from './errores';
import { firmarComprobante } from './firma';
import {
    llamar, parsearConsulta, parsearSendBill, sobreConsulta, sobreSendBill, SunatFaultError, SunatTransporteError,
    type CredencialSol,
} from './servicio';
import { zipComprobante } from './zip';

/** Ajustes del riel SUNAT por organización (`fiscal_rail_ajustes.ajustes`). */
export interface AjustesSunat {
    /** Serie de facturas y de sus notas de crédito: F + 3 alfanuméricos. */
    serie?: string;
    /** Último correlativo emitido FUERA de Cord en esa serie (0 si la serie es nueva). */
    ultimoNumeroFactura?: number;
    ultimoNumeroNotaCredito?: number;
    /** Código de establecimiento anexo; 0000 = domicilio fiscal. */
    establecimiento?: string;
    nombreComercial?: string;
    concepto?: ConceptoSunat;
    /** Cómo se declaran los conceptos al 0 % de una venta interna. */
    afectacionSinIgv?: typeof AFECTACION.EXONERADO | typeof AFECTACION.INAFECTO;
    /** Régimen de IGV reducido para MYPE de restaurantes, hoteles y alojamientos turísticos. */
    regimenMype?: boolean;
    /** Vende bienes o servicios sujetos al SPOT (detracciones). */
    detracciones?: boolean;
    /** Es agente de percepción del IGV. */
    agentePercepcion?: boolean;
    /** Excluido del régimen de retenciones (buen contribuyente, agente de retención o de percepción). */
    excluidoRetenciones?: boolean;
    /** RUC de los clientes que son agentes de retención del IGV. */
    agentesRetencion?: string[];
}

export interface ContextoSunat {
    orgId: string;
    entorno: EntornoRail;
    ruc: string;
    razonSocial: string;
    ajustes: AjustesSunat & { serie: string; concepto: ConceptoSunat; establecimiento: string };
    credencial: CredencialActiva;
    sol: CredencialSol;
}

/** Lo que falta para poder emitir, como código: la pantalla lo traduce (es/en). */
export type FaltanteSunat =
    | 'ruc' | 'razon_social' | 'serie' | 'concepto'
    | 'certificado' | 'certificado_vencido' | 'certificado_ruc' | 'usuario_sol'
    | 'detracciones' | 'percepcion';

const FALTANTE_ES: Record<FaltanteSunat, string> = {
    ruc: 'RUC del negocio',
    razon_social: 'razón social',
    serie: 'serie de facturas',
    concepto: 'qué vendes (bienes o servicios)',
    certificado: 'certificado digital',
    certificado_vencido: 'certificado digital vigente',
    certificado_ruc: 'certificado a nombre de tu RUC',
    usuario_sol: 'usuario SOL secundario y su clave',
    detracciones: 'facturas con detracción (todavía no disponibles en Cord)',
    percepcion: 'facturas con percepción del IGV (todavía no disponibles en Cord)',
};

export function faltantesAjustes(a: Partial<AjustesSunat>): FaltanteSunat[] {
    const faltan: FaltanteSunat[] = [];
    if (!serieValida(a.serie)) faltan.push('serie');
    if (a.concepto !== 'bienes' && a.concepto !== 'servicios') faltan.push('concepto');
    // Regímenes que Cord no sabe declarar todavía: no se emite a medias.
    if (a.detracciones) faltan.push('detracciones');
    if (a.agentePercepcion) faltan.push('percepcion');
    return faltan;
}

/** Usuario SOL guardado como secreto de la credencial. */
export function solDe(credencial: Pick<CredencialActiva, 'secretos'>, ruc: string, entorno: EntornoRail): CredencialSol | null {
    const usuario = String(credencial.secretos?.usuarioSol ?? '').trim().toUpperCase();
    const clave = String(credencial.secretos?.claveSol ?? '');
    if (usuario && clave) return { usuario: `${ruc}${usuario}`, clave };
    // Beta acepta [RUC]MODDATOS/MODDATOS [MAN §2.3]; producción exige el usuario SOL real.
    return entorno === 'homologacion' ? { usuario: `${ruc}${USUARIO_BETA}`, clave: CLAVE_BETA } : null;
}

/**
 * Todo lo que hace falta para hablar con SUNAT por esta organización. Lanza
 * RailNoDisponibleError (mensaje apto para el usuario) si falta algo.
 */
export async function contextoSunat(orgId: string, entorno: EntornoRail, emisor: { ruc?: string | null; razonSocial?: string | null }): Promise<ContextoSunat> {
    const [ajustes, credencial] = await Promise.all([
        leerAjustes<AjustesSunat>(orgId, 'sunat'),
        credencialActiva(orgId, 'sunat', entorno),
    ]);
    const faltan = faltantesAjustes(ajustes);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los ajustes de SUNAT (${faltan.map((f) => FALTANTE_ES[f]).join(', ')}) en Ajustes › Datos fiscales.`);
    const ruc = rucValido(emisor.ruc);
    if (!ruc) throw new RailDatosError('El RUC de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    const razonSocial = String(emisor.razonSocial ?? '').trim();
    if (!razonSocial) throw new RailDatosError('Falta la razón social de tu negocio en Ajustes › Datos fiscales.');
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital de tu negocio en Ajustes › Datos fiscales para emitir facturas electrónicas.');
    if (credencial.vencida) throw new RailNoDisponibleError('El certificado digital venció. Sube uno vigente en Ajustes › Datos fiscales.');
    if (credencial.identificador !== ruc) {
        throw new RailNoDisponibleError('El certificado digital está a nombre de otro RUC. Sube el certificado de tu negocio en Ajustes › Datos fiscales.');
    }
    const sol = solDe(credencial, ruc, entorno);
    if (!sol) throw new RailNoDisponibleError('Falta el usuario SOL secundario con perfil de envío de comprobantes y su clave, en Ajustes › Datos fiscales.');
    return {
        orgId, entorno, ruc, razonSocial, credencial, sol,
        ajustes: {
            ...ajustes,
            serie: serieValida(ajustes.serie)!,
            concepto: ajustes.concepto as ConceptoSunat,
            establecimiento: /^\d{4}$/.test(String(ajustes.establecimiento ?? '')) ? String(ajustes.establecimiento) : ESTABLECIMIENTO_DOMICILIO_FISCAL,
        },
    };
}

/** Lo enviado: la solicitud numerada más el XML firmado y su valor resumen. */
export interface SolicitudEnviada extends SolicitudSunat {
    envio: { archivo: string; resumen: string; firma: string; algoritmo: string; xml: string };
}

// ── Numeración ──────────────────────────────────────────────────────────────

/**
 * Siguiente correlativo de la secuencia: el mayor número que SUNAT ya tiene o
 * puede tener (autorizado, en vuelo o rechazado) + 1, nunca por debajo del
 * último emitido fuera de Cord.
 */
export async function siguienteNumero(ctx: ContextoSunat, serie: string, tipo: string): Promise<number> {
    const [[r]] = await withOrgTx(ctx.orgId, sql`
        select coalesce(max(numero), 0)::bigint as n from fiscal_rail_comprobantes
         where org_id = ${ctx.orgId} and rail = 'sunat' and entorno = ${ctx.entorno} and serie = ${serie} and tipo = ${tipo}
           and (estado in ('pendiente', 'incierto', 'autorizado')
                or coalesce(respuesta->>'numero_consumido', 'false') = 'true')`);
    const previo = tipo === TIPO_DOC.NOTA_CREDITO ? ctx.ajustes.ultimoNumeroNotaCredito : ctx.ajustes.ultimoNumeroFactura;
    return Math.max(Number(r?.n) || 0, Number.isInteger(previo) && (previo as number) > 0 ? (previo as number) : 0) + 1;
}

// ── Consulta ────────────────────────────────────────────────────────────────

export type EstadoEnSunat =
    | { estado: 'aceptado'; cdr: Cdr | null }
    | { estado: 'rechazado' | 'baja'; cdr: Cdr | null }
    | { estado: 'no_existe' }
    | { estado: 'desconocido'; detalle: string };

/**
 * Qué tiene SUNAT con ese número. Producción: billConsultService/getStatus
 * (códigos documentados en el anexo 2 del manual) y, si existe, getStatusCdr
 * para la CDR. Homologación: el MISMO XML firmado vuelve a presentarse al
 * servicio beta (no guarda estado ni tiene consulta).
 */
export async function estadoEnSunat(ctx: ContextoSunat, s: SolicitudEnviada): Promise<EstadoEnSunat> {
    const clave = { ruc: s.ruc, tipo: s.tipo, serie: s.serie, numero: s.numero };
    if (ctx.entorno === 'homologacion') {
        try {
            const zip = zipComprobante(s.envio.archivo, s.envio.xml);
            const cdr = await leerCdr(await parsearSendBill(await llamar('homologacion', 'sendBill',
                sobreSendBill(ctx.sol, `${s.envio.archivo}.zip`, Buffer.from(zip).toString('base64')))));
            return claseCodigo(cdr.codigo) === 'rechazo' ? { estado: 'rechazado', cdr } : { estado: 'aceptado', cdr };
        } catch (error) {
            if (error instanceof SunatFaultError && error.codigo !== null && claseCodigo(error.codigo) === 'rechazo') return { estado: 'rechazado', cdr: null };
            if (error instanceof SunatFaultError) return { estado: 'no_existe' };
            return { estado: 'desconocido', detalle: error instanceof Error ? error.message : String(error) };
        }
    }
    let codigo: string;
    try {
        codigo = (await parsearConsulta(await llamar(ctx.entorno, 'getStatus', sobreConsulta('getStatus', ctx.sol, clave)), 'getStatus')).codigo;
    } catch (error) {
        return { estado: 'desconocido', detalle: error instanceof Error ? error.message : String(error) };
    }
    if (codigo === ESTADO_CONSULTA.NO_EXISTE) return { estado: 'no_existe' };
    if (codigo !== ESTADO_CONSULTA.ACEPTADO && codigo !== ESTADO_CONSULTA.RECHAZADO && codigo !== ESTADO_CONSULTA.BAJA) {
        return { estado: 'desconocido', detalle: `getStatus ${codigo}` };
    }
    let cdr: Cdr | null = null;
    try {
        const r = await parsearConsulta(await llamar(ctx.entorno, 'getStatusCdr', sobreConsulta('getStatusCdr', ctx.sol, clave)), 'getStatusCdr');
        if (r.cdr) cdr = await leerCdr(r.cdr);
    } catch (error) {
        log.error('sunat: getStatusCdr no devolvió la constancia', { route: 'fiscal/sunat', orgId: ctx.orgId, err: error });
    }
    if (codigo === ESTADO_CONSULTA.ACEPTADO) return { estado: 'aceptado', cdr };
    return { estado: codigo === ESTADO_CONSULTA.BAJA ? 'baja' : 'rechazado', cdr };
}

/**
 * ¿Lo que SUNAT registró con ese número es lo que Cord envió? Con la CDR:
 * mismo serie-número y mismo adquirente, y el mismo valor resumen cuando la
 * CDR lo informa. Sin CDR no se puede afirmar.
 */
export function esNuestro(s: SolicitudEnviada, cdr: Cdr | null): boolean {
    if (!cdr) return false;
    if (cdr.referencia && cdr.referencia !== idComprobante(s)) return false;
    if (cdr.receptor && cdr.receptor !== `${s.receptor.tipoDoc}-${s.receptor.numDoc}`) return false;
    if (cdr.resumen && cdr.resumen !== s.envio.resumen) return false;
    return true;
}

function respuestaCdr(cdr: Cdr, zip?: Uint8Array | null): Record<string, unknown> {
    return {
        cdr: {
            codigo: cdr.codigo, descripcion: cdr.descripcion, observaciones: cdr.observaciones,
            proceso: cdr.procesoId, referencia: cdr.referencia, receptor: cdr.receptor, recepcion: cdr.fechaRecepcion,
        },
        ...(zip ? { cdr_zip: Buffer.from(zip).toString('base64') } : { cdr_xml: cdr.xml }),
    };
}

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

const MSG_DESCARTADO = 'SUNAT no registró esta factura. Puedes volver a emitirla (tendrá un número nuevo) o descartarla.';
const MSG_RECHAZADO_CONSULTA = 'SUNAT tiene este comprobante como rechazado o dado de baja. Corrige los datos y vuelve a emitirlo: tendrá un número nuevo.';

/** Un intento enviado y sin rastro en SUNAT se considera perdido después de esto (sendBill responde en segundos). */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 120;

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO a SUNAT. Nunca
 * reenvía en producción. Debe llamarse con la secuencia tomada.
 */
export async function resolverPorConsulta(ctx: ContextoSunat, recibido: IntentoRail, ahora = Date.now()): Promise<ResultadoResolucion> {
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const s = intento.solicitud as SolicitudEnviada;
    if (!intento.enviadoAt || !s.envio) {
        // Reclamado y nunca enviado (el proceso murió antes): el número está libre.
        if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'El comprobante no llegó a enviarse a SUNAT.' })) {
            await liberarDocumento(ctx.orgId, intento.documentoId, 'sunat', MSG_DESCARTADO);
        }
        return 'descartado';
    }
    const e = await estadoEnSunat(ctx, s);
    if (e.estado === 'desconocido') {
        log.error('sunat: la consulta no resolvió el intento', { route: 'fiscal/sunat', orgId: ctx.orgId, intento: intento.id, detalle: e.detalle });
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    }
    if (e.estado === 'aceptado') {
        if (esNuestro(s, e.cdr) || (ctx.entorno === 'homologacion' && e.cdr)) {
            const r = await resolverIntento(ctx.orgId, intento.id, {
                estado: 'autorizado',
                autorizacion: e.cdr?.procesoId || s.envio.resumen,
                vence: null,
                respuesta: { recuperado: true, ...(e.cdr ? respuestaCdr(e.cdr) : {}) },
                observaciones: (e.cdr?.observaciones ?? []).map((o) => ({ code: o.code, msg: o.msg, mensaje: mensajeObservacion(o.code) })),
            });
            if (r) await anotarUltimoAutorizado(ctx.orgId, { rail: 'sunat', entorno: ctx.entorno, serie: s.serie, tipo: s.tipo }, s.numero);
            return 'autorizado';
        }
        if (!e.cdr) {
            // Existe y aceptado, pero sin CDR no se puede afirmar que sea el de Cord.
            await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
            return 'sin_resolver';
        }
        log.error('sunat: el número reclamado lo tiene otro comprobante', { route: 'fiscal/sunat', orgId: ctx.orgId, intento: intento.id, numero: s.numero });
        if (await resolverIntento(ctx.orgId, intento.id, {
            estado: 'descartado',
            mensaje: 'SUNAT tiene ese número con otro comprobante: la serie se está usando desde otro sistema.',
            respuesta: { conflicto: true, numero_consumido: true, ...respuestaCdr(e.cdr) },
        })) await liberarDocumento(ctx.orgId, intento.documentoId, 'sunat', MSG_DESCARTADO);
        return 'descartado';
    }
    if (e.estado === 'rechazado' || e.estado === 'baja') {
        if (await resolverIntento(ctx.orgId, intento.id, {
            estado: 'descartado',
            mensaje: MSG_RECHAZADO_CONSULTA,
            respuesta: { numero_consumido: true, estado_sunat: e.estado, ...(e.cdr ? respuestaCdr(e.cdr) : {}) },
        })) await liberarDocumento(ctx.orgId, intento.documentoId, 'sunat', MSG_RECHAZADO_CONSULTA);
        return 'descartado';
    }
    // No existe. Si el envío ya es viejo, no llegó.
    if (ahora - Date.parse(intento.enviadoAt) >= ANTIGUEDAD_PARA_DESCARTAR_S * 1000) {
        if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'SUNAT no registró el comprobante.', respuesta: { no_existe: true } })) {
            await liberarDocumento(ctx.orgId, intento.documentoId, 'sunat', MSG_DESCARTADO);
        }
        return 'descartado';
    }
    await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
    return 'sin_resolver';
}

// ── Emisión ─────────────────────────────────────────────────────────────────

export type ResultadoEmision =
    | { tipo: 'autorizado'; intento: IntentoRail }
    | { tipo: 'rechazado'; mensaje: string; codigo?: string }
    | { tipo: 'incierto'; mensaje: string };

const CONFLICTO_PENDIENTE = 'Hay otro comprobante esperando la confirmación de SUNAT en esta serie. Reintenta en un par de minutos.';

/** Firma la solicitud numerada y arma lo que se guarda y se envía. */
export function prepararEnvio(ctx: Pick<ContextoSunat, 'credencial'>, s: SolicitudSunat): SolicitudEnviada {
    const firmado = firmarComprobante(s, ctx.credencial, 'sha256');
    return { ...s, envio: { archivo: nombreArchivo(s), resumen: firmado.resumen, firma: firmado.firma, algoritmo: `rsa-${firmado.algoritmo}`, xml: firmado.xml } };
}

/**
 * Envía `base` (solicitud sin número) para el documento. Debe llamarse SIN
 * un intento vivo del documento: el proveedor resuelve antes el que hubiera.
 */
export async function emitirAnteSunat(ctx: ContextoSunat, documentoId: string, base: SolicitudSunat): Promise<ResultadoEmision> {
    const clave = { rail: 'sunat' as const, entorno: ctx.entorno, serie: base.serie, tipo: base.tipo };
    return conSecuencia(ctx.orgId, clave, async () => {
        for (let vuelta = 0; vuelta < 2; vuelta++) {
            // 0) Otra instancia pudo aceptar ESTE documento mientras se esperaba el lease.
            const previo = await intentoVivo(ctx.orgId, documentoId, 'sunat', ctx.entorno);
            if (previo?.estado === 'autorizado') return { tipo: 'autorizado', intento: previo } as const;

            // 1) Lo colgado de esta secuencia se resuelve antes de numerar otro.
            for (const colgado of await sinResolverDeSecuencia(ctx.orgId, 'sunat', ctx.entorno, clave.serie, clave.tipo)) {
                const r = await resolverPorConsulta(ctx, colgado);
                if (r === 'sin_resolver') {
                    return colgado.documentoId === documentoId
                        ? { tipo: 'incierto', mensaje: MSG_INCIERTO } as const
                        : { tipo: 'rechazado', mensaje: CONFLICTO_PENDIENTE } as const;
                }
                if (r === 'autorizado' && colgado.documentoId === documentoId) {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'sunat', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio } as const;
                }
            }

            // 2) Número, firma y reclamo: lo guardado es exactamente lo que sale.
            const numero = await siguienteNumero(ctx, clave.serie, clave.tipo);
            const solicitud = prepararEnvio(ctx, conNumero(base, numero));
            const intento = await reclamarNumero(ctx.orgId, {
                documentoId, rail: 'sunat', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero,
                solicitud: solicitud as unknown as Record<string, unknown>,
            });
            if (!intento) throw new RailTransitorioError(CONFLICTO_PENDIENTE);

            // 3) Envío. `enviado_at` va antes: sin él, el intento seguro no salió.
            await marcarEnviado(ctx.orgId, intento.id);
            let cdrZip: Uint8Array;
            let cdr: Cdr;
            try {
                const zip = zipComprobante(solicitud.envio.archivo, solicitud.envio.xml);
                cdrZip = await parsearSendBill(await llamar(ctx.entorno, 'sendBill',
                    sobreSendBill(ctx.sol, `${solicitud.envio.archivo}.zip`, Buffer.from(zip).toString('base64'))));
                cdr = await leerCdr(cdrZip);
            } catch (error) {
                if (error instanceof SunatFaultError) {
                    const r = await trasExcepcion(ctx, intento, solicitud, error, vuelta);
                    if (r === 'otra_vuelta') continue;
                    return r;
                }
                // Red, timeout, algo que no es SOAP o una CDR ilegible: SUNAT pudo registrarlo.
                log.error('sunat: sendBill sin respuesta legible', { route: 'fiscal/sunat', orgId: ctx.orgId, intento: intento.id, err: error });
                const incierto = await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
                if (incierto && await resolverPorConsulta(ctx, incierto) === 'autorizado') {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'sunat', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
                }
                return { tipo: 'incierto', mensaje: MSG_INCIERTO };
            }

            const clase = claseCodigo(cdr.codigo);
            if (clase === 'aceptado' || clase === 'observacion') {
                const autorizado = await resolverIntento(ctx.orgId, intento.id, {
                    estado: 'autorizado',
                    autorizacion: cdr.procesoId || solicitud.envio.resumen,
                    vence: null,
                    respuesta: respuestaCdr(cdr, cdrZip),
                    observaciones: cdr.observaciones.map((o) => ({ code: o.code, msg: o.msg, mensaje: mensajeObservacion(o.code) })),
                });
                if (!autorizado) throw new Error('sunat: el intento aceptado no se pudo registrar');
                await anotarUltimoAutorizado(ctx.orgId, clave, numero);
                return { tipo: 'autorizado', intento: autorizado };
            }
            // CDR rechazada: la numeración quedó usada [MAN §4.1].
            const mensaje = mensajeRechazo(cdr.codigo);
            await resolverIntento(ctx.orgId, intento.id, {
                estado: 'rechazado', mensaje, codigo: String(cdr.codigo),
                respuesta: { numero_consumido: true, ...respuestaCdr(cdr, cdrZip) },
            });
            log.error('sunat: comprobante rechazado', { route: 'fiscal/sunat', orgId: ctx.orgId, intento: intento.id, codigo: cdr.codigo });
            return { tipo: 'rechazado', mensaje, codigo: String(cdr.codigo) };
        }
        return { tipo: 'rechazado', mensaje: 'La numeración de la serie cambió mientras se emitía. Reintenta.' };
    }, { esperaMaxMs: 12_000, leaseS: 150 });
}

/**
 * soap:Fault de sendBill. Rechazo (2000–3999): número usado. Excepción
 * (0100–1999): el comprobante no quedó informado; en producción se consulta
 * el número antes de liberarlo (un duplicado lo tiene otro comprobante).
 */
async function trasExcepcion(ctx: ContextoSunat, intento: IntentoRail, s: SolicitudEnviada, error: SunatFaultError, vuelta: number): Promise<ResultadoEmision | 'otra_vuelta'> {
    const crudo = { fault: error.faultcode, detalle: error.faultstring };
    log.error('sunat: sendBill respondió una excepción', { route: 'fiscal/sunat', orgId: ctx.orgId, intento: intento.id, faultcode: error.faultcode, codigo: error.codigo });
    if (error.codigo !== null && claseCodigo(error.codigo) === 'rechazo') {
        const mensaje = mensajeRechazo(error.codigo);
        await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo: String(error.codigo), respuesta: { numero_consumido: true, ...crudo } });
        return { tipo: 'rechazado', mensaje, codigo: String(error.codigo) };
    }
    const mensaje = mensajeExcepcion(error.codigo);
    let consumido = false;
    if (ctx.entorno === 'produccion' && error.codigo !== null && error.codigo >= 1000) {
        const e = await estadoEnSunat(ctx, s);
        if (e.estado === 'aceptado' && esNuestro(s, e.cdr)) {
            // El envío anterior sí quedó registrado: es este comprobante.
            const r = await resolverIntento(ctx.orgId, intento.id, {
                estado: 'autorizado', autorizacion: e.cdr?.procesoId || s.envio.resumen, vence: null,
                respuesta: { recuperado: true, ...crudo, ...(e.cdr ? respuestaCdr(e.cdr) : {}) },
            });
            if (r) return { tipo: 'autorizado', intento: r };
        }
        consumido = e.estado === 'aceptado' || e.estado === 'rechazado' || e.estado === 'baja';
    }
    await resolverIntento(ctx.orgId, intento.id, {
        estado: 'rechazado', mensaje, codigo: error.codigo !== null ? String(error.codigo) : 'fault',
        respuesta: { numero_consumido: consumido, ...crudo },
    });
    // El número lo tiene otro comprobante: una vuelta más con el siguiente.
    if (consumido && vuelta === 0) return 'otra_vuelta';
    return { tipo: 'rechazado', mensaje, codigo: error.codigo !== null ? String(error.codigo) : undefined };
}
