// Autorización de comprobantes ante ARCA: WSAA + WSFEv1 con la máquina de
// estados del marco común (latam/comprobantes.ts).
//
// WSFEv1 es SÍNCRONO: FECAESolicitar devuelve el CAE en la misma llamada.
// Lo que no es síncrono es la certeza: el manual ("Operatoria con errores de
// comunicación") describe el caso en que el pedido sale, ARCA asigna el CAE y
// la respuesta se pierde; reenviarlo a ciegas daría error de correlatividad
// (10016) y un segundo número quemaría el primero. Por eso:
//
//   1. Una secuencia (CUIT + punto de venta + tipo) tiene un solo pedido en
//      vuelo (lease). Dentro del lease, los intentos colgados de esa
//      secuencia se resuelven ANTES de pedir otro número.
//   2. El número es FECompUltimoAutorizado + 1 [MAN 10016], reclamado en la
//      base antes de enviar.
//   3. Sin respuesta legible, el intento queda `incierto` y se resuelve
//      consultando: FECompUltimoAutorizado dice si ese número ya existe y
//      FECompConsultar devuelve lo autorizado, que se compara con lo enviado.
//      Si coincide, es nuestro (autorizado); si no, el número lo usó otro
//      sistema (descartado); si ARCA todavía no lo tiene y el pedido es
//      reciente, sigue incierto.

import { log } from '../../../log';
import { invalidarTicket, obtenerTicket, type ClaveAcceso } from '../accesos';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, sinResolverDeSecuencia, type IntentoRail,
} from '../comprobantes';
import { credencialActiva, leerAjustes, marcarVerificacion, type CredencialActiva } from '../credenciales';
import { RailDatosError, RailNoDisponibleError, RailTransitorioError, MSG_INCIERTO } from '../errores';
import type { EntornoRail } from '../rieles';
import { conNumero, cuitValido, dentroDelMargen, type SolicitudArca } from './comprobante';
import {
    CONDICIONES_EMISOR, ESPERA_TICKET_DUPLICADO_S, SERVICIO_WSFE, type ConceptoArca, type CondicionEmisor,
} from './constantes';
import {
    CODIGO_NUMERACION, CODIGOS_AUTENTICACION, CODIGOS_TRANSITORIOS, mensajeObservacion, mensajeRechazo,
    mensajeWsaa, wsaaTransitorio, type CodigoArca,
} from './errores';
import { ArcaWsaaError, construirTRA, cuitsRepresentadas, firmarTRA, loginCms } from './wsaa';
import {
    ambienteCoincide, ArcaFaultError, ArcaTransporteError, llamarWsfe, parsearCAESolicitar, parsearCompConsultar,
    parsearCotizacion, parsearPtosVenta, parsearUltimoAutorizado, sobreCAESolicitar, sobreCompConsultar,
    sobreCotizacion, sobreSoloAuth, sobreUltimoAutorizado, type AuthArca, type PuntoVenta,
} from './wsfe';

/** Ajustes del riel ARCA por organización (`fiscal_rail_ajustes.ajustes`). */
export interface AjustesArca {
    puntoVenta?: number;
    condicionEmisor?: CondicionEmisor;
    concepto?: ConceptoArca;
    /** Número de inscripción en Ingresos Brutos, para la representación impresa. */
    ingresosBrutos?: string;
    /** Fecha de inicio de actividades (aaaa-mm-dd), para la representación impresa. */
    inicioActividades?: string;
}

export interface ContextoArca {
    orgId: string;
    entorno: EntornoRail;
    cuit: string;
    ajustes: AjustesArca & { puntoVenta: number; condicionEmisor: CondicionEmisor; concepto: ConceptoArca };
    credencial: CredencialActiva;
}

/** Qué falta para que el riel quede listo, en vocabulario del usuario. */
/** Lo que falta para poder emitir, como código: la pantalla lo traduce (es/en). */
export type FaltanteArca = 'cuit' | 'punto_venta' | 'condicion_emisor' | 'concepto' | 'certificado' | 'certificado_vencido' | 'certificado_cuit';

const FALTANTE_ES: Record<FaltanteArca, string> = {
    cuit: 'CUIT del negocio',
    punto_venta: 'punto de venta',
    condicion_emisor: 'condición frente al IVA',
    concepto: 'qué vendes (productos o servicios)',
    certificado: 'certificado de ARCA',
    certificado_vencido: 'certificado vigente',
    certificado_cuit: 'certificado a nombre de tu CUIT',
};

export function faltantesAjustes(a: Partial<AjustesArca>): FaltanteArca[] {
    const faltan: FaltanteArca[] = [];
    if (!Number.isInteger(a.puntoVenta) || (a.puntoVenta as number) < 1 || (a.puntoVenta as number) > 99998) faltan.push('punto_venta');
    if (!CONDICIONES_EMISOR.some((c) => c.id === a.condicionEmisor)) faltan.push('condicion_emisor');
    if (![1, 2, 3].includes(Number(a.concepto))) faltan.push('concepto');
    return faltan;
}

/**
 * Todo lo que hace falta para hablar con ARCA por esta organización. Lanza
 * RailNoDisponibleError (mensaje apto para el usuario) si falta algo.
 */
export async function contextoArca(orgId: string, entorno: EntornoRail, cuitEmisor: string | null | undefined): Promise<ContextoArca> {
    const [ajustes, credencial] = await Promise.all([
        leerAjustes<AjustesArca>(orgId, 'arca'),
        credencialActiva(orgId, 'arca', entorno),
    ]);
    const faltan = faltantesAjustes(ajustes);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los ajustes de ARCA (${faltan.map((f) => FALTANTE_ES[f]).join(', ')}) en Ajustes › Datos fiscales.`);
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado de ARCA de tu negocio en Ajustes › Datos fiscales para emitir facturas electrónicas.');
    if (credencial.vencida) throw new RailNoDisponibleError('El certificado de ARCA venció. Genera uno nuevo y súbelo en Ajustes › Datos fiscales.');
    const cuit = cuitValido(cuitEmisor);
    if (!cuit) throw new RailDatosError('La CUIT de tu negocio no es válida. Corrígela en Ajustes › Datos fiscales.');
    if (credencial.identificador !== cuit) {
        throw new RailNoDisponibleError('El certificado de ARCA está a nombre de otra CUIT. Sube el certificado de tu negocio en Ajustes › Datos fiscales.');
    }
    return { orgId, entorno, cuit, ajustes: ajustes as ContextoArca['ajustes'], credencial };
}

const claveAcceso = (ctx: ContextoArca): ClaveAcceso => ({ orgId: ctx.orgId, rail: 'arca', entorno: ctx.entorno, servicio: SERVICIO_WSFE });

/** Ticket de acceso (token + sign) de WSFE para la CUIT del contexto, cacheado. */
export async function autenticar(ctx: ContextoArca, opts: { forzar?: boolean } = {}): Promise<AuthArca> {
    const ticket = await obtenerTicket(claveAcceso(ctx), async () => {
        try {
            const tra = construirTRA(SERVICIO_WSFE);
            const cms = firmarTRA(tra, ctx.credencial.certPem, ctx.credencial.keyPem);
            const t = await loginCms(ctx.entorno, cms);
            // El ticket dice qué CUITs puede representar este certificado
            // (manual del WSAA §6.3). Si las declara y la del negocio no está,
            // facturar fallaría con 601 en cada intento: se dice ahora.
            const representadas = cuitsRepresentadas(t.token);
            if (representadas.length && !representadas.includes(ctx.cuit)) {
                const error = new RailNoDisponibleError('El certificado de ARCA no está autorizado a facturar por la CUIT de tu negocio. Revisa en ARCA las relaciones del certificado.');
                await marcarVerificacion(ctx.orgId, 'arca', ctx.entorno, error.message);
                return { ok: false, error };
            }
            await marcarVerificacion(ctx.orgId, 'arca', ctx.entorno, null);
            return { ok: true, ticket: { token: t.token, sign: t.sign, expira: t.expira } };
        } catch (error) {
            if (error instanceof ArcaWsaaError) {
                log.error('arca: el WSAA rechazó el login', { route: 'fiscal/arca', orgId: ctx.orgId, faultcode: error.faultcode, detalle: error.faultstring });
                const mensaje = mensajeWsaa(error.faultcode);
                if (wsaaTransitorio(error.faultcode)) {
                    return {
                        ok: false,
                        bloquearSegundos: error.faultcode === 'coe.alreadyAuthenticated' ? ESPERA_TICKET_DUPLICADO_S[ctx.entorno] : 60,
                        error: new RailTransitorioError(mensaje),
                    };
                }
                await marcarVerificacion(ctx.orgId, 'arca', ctx.entorno, mensaje);
                return { ok: false, error: new RailNoDisponibleError(mensaje, error.faultcode) };
            }
            log.error('arca: el WSAA no respondió', { route: 'fiscal/arca', orgId: ctx.orgId, err: error });
            return { ok: false, error: new RailTransitorioError('ARCA no está respondiendo en este momento. Reintenta en unos minutos.') };
        }
    }, { forzar: opts.forzar });
    return { token: ticket.token, sign: ticket.sign, cuit: ctx.cuit };
}

/** Errores de autenticación en una respuesta de WSFEv1: hay que renovar el ticket. */
const esDeAutenticacion = (errores: CodigoArca[]) => errores.some((e) => CODIGOS_AUTENTICACION.has(e.code));

/**
 * Ejecuta una operación de consulta (sin efectos) con renovación del ticket si
 * ARCA lo rechaza. Lanza RailTransitorioError si ARCA no responde.
 */
async function consultaConAuth<T extends { errores: CodigoArca[] }>(ctx: ContextoArca, fn: (auth: AuthArca) => Promise<T>): Promise<T> {
    let auth = await autenticar(ctx);
    try {
        let r = await fn(auth);
        if (esDeAutenticacion(r.errores)) {
            await invalidarTicket(claveAcceso(ctx));
            auth = await autenticar(ctx, { forzar: true });
            r = await fn(auth);
        }
        return r;
    } catch (error) {
        if (error instanceof ArcaTransporteError || error instanceof ArcaFaultError) {
            log.error('arca: falló una consulta a WSFEv1', { route: 'fiscal/arca', orgId: ctx.orgId, err: error });
            throw new RailTransitorioError('ARCA no está respondiendo en este momento. Reintenta en unos minutos.');
        }
        throw error;
    }
}

export async function ultimoAutorizado(ctx: ContextoArca, ptoVta: number, cbteTipo: number): Promise<number> {
    const r = await consultaConAuth(ctx, async (auth) =>
        parsearUltimoAutorizado(await llamarWsfe(ctx.entorno, 'FECompUltimoAutorizado', sobreUltimoAutorizado(auth, ptoVta, cbteTipo))));
    if (r.numero === null) {
        const e = r.errores[0];
        log.error('arca: FECompUltimoAutorizado con errores', { route: 'fiscal/arca', orgId: ctx.orgId, errores: r.errores });
        if (e && !CODIGOS_TRANSITORIOS.has(e.code)) throw new RailDatosError(mensajeRechazo(r.errores), String(e.code));
        throw new RailTransitorioError('ARCA no está respondiendo en este momento. Reintenta en unos minutos.');
    }
    return r.numero;
}

export async function consultarComprobante(ctx: ContextoArca, ptoVta: number, cbteTipo: number, numero: number) {
    const r = await consultaConAuth(ctx, async (auth) =>
        parsearCompConsultar(await llamarWsfe(ctx.entorno, 'FECompConsultar', sobreCompConsultar(auth, ptoVta, cbteTipo, numero))));
    if (!r.comprobante && r.errores.some((e) => CODIGOS_TRANSITORIOS.has(e.code))) {
        throw new RailTransitorioError('ARCA no está respondiendo en este momento. Reintenta en unos minutos.');
    }
    return r.comprobante;
}

export async function cotizacionArca(ctx: ContextoArca, monId: string): Promise<number> {
    const r = await consultaConAuth(ctx, async (auth) =>
        parsearCotizacion(await llamarWsfe(ctx.entorno, 'FEParamGetCotizacion', sobreCotizacion(auth, monId))));
    if (!r.cotizacion) throw new RailTransitorioError('ARCA no informó la cotización de la moneda del comprobante. Reintenta en unos minutos.');
    return r.cotizacion;
}

/** Puntos de venta web service del emisor. Null si ARCA no informa ninguno (602, habitual en homologación). */
export async function puntosDeVenta(ctx: ContextoArca): Promise<PuntoVenta[] | null> {
    const r = await consultaConAuth(ctx, async (auth) =>
        parsearPtosVenta(await llamarWsfe(ctx.entorno, 'FEParamGetPtosVenta', sobreSoloAuth('FEParamGetPtosVenta', auth))));
    if (!r.puntos.length) return null;
    return r.puntos;
}

/** ¿Lo que ARCA tiene con ese número es lo que Cord envió? */
export function coincide(enviada: SolicitudArca, c: NonNullable<Awaited<ReturnType<typeof consultarComprobante>>>): boolean {
    const d = enviada.detalle;
    return c.numero === d.CbteDesde
        && c.ptoVta === enviada.ptoVta
        && c.cbteTipo === enviada.cbteTipo
        && c.docTipo === d.DocTipo
        && String(Number(c.docNro)) === String(Number(d.DocNro))
        && c.cbteFch === d.CbteFch
        && c.monId === d.MonId
        && dentroDelMargen(c.impTotal, Number(d.ImpTotal));
}

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

const MSG_DESCARTADO = 'ARCA no registró esta factura. Puedes volver a emitirla (tendrá un número nuevo) o descartarla.';

/** Un intento enviado y sin respuesta se considera perdido después de esto (ARCA responde en segundos). */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 120;

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO a ARCA. Nunca
 * reenvía. Debe llamarse con la secuencia tomada.
 */
export async function resolverPorConsulta(ctx: ContextoArca, recibido: IntentoRail, ahora = Date.now()): Promise<ResultadoResolucion> {
    // Releído dentro del lease: otra instancia pudo resolverlo mientras este
    // proceso esperaba la secuencia.
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const sol = intento.solicitud as SolicitudArca;
    if (!intento.enviadoAt) {
        // Reclamado y nunca enviado (el proceso murió antes): el número está libre.
        if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'El pedido no llegó a enviarse a ARCA.' })) {
            await liberarDocumento(ctx.orgId, intento.documentoId, 'arca', MSG_DESCARTADO);
        }
        return 'descartado';
    }
    try {
        const ultimo = await ultimoAutorizado(ctx, sol.ptoVta, sol.cbteTipo);
        if (ultimo >= intento.numero) {
            const c = await consultarComprobante(ctx, sol.ptoVta, sol.cbteTipo, intento.numero);
            if (c && c.resultado !== 'R' && coincide(sol, c)) {
                await resolverIntento(ctx.orgId, intento.id, {
                    estado: 'autorizado',
                    autorizacion: c.codAutorizacion,
                    vence: /^\d{8}$/.test(c.fchVto) ? `${c.fchVto.slice(0, 4)}-${c.fchVto.slice(4, 6)}-${c.fchVto.slice(6, 8)}` : null,
                    respuesta: { recuperado: true, consulta: c },
                    observaciones: c.observaciones.map((o) => ({ code: o.code, mensaje: mensajeObservacion(o.code) })),
                });
                await anotarUltimoAutorizado(ctx.orgId, { rail: 'arca', entorno: ctx.entorno, serie: String(sol.ptoVta), tipo: String(sol.cbteTipo) }, intento.numero);
                return 'autorizado';
            }
            // ARCA tiene ese número con OTROS datos: lo usó otro sistema con el
            // mismo punto de venta. El pedido de Cord no fue autorizado.
            log.error('arca: el número reclamado lo tiene otro comprobante', { route: 'fiscal/arca', orgId: ctx.orgId, intento: intento.id, numero: intento.numero });
            const conflicto = await resolverIntento(ctx.orgId, intento.id, {
                estado: 'descartado',
                mensaje: 'ARCA tiene ese número con otro comprobante: el punto de venta se está usando desde otro sistema.',
                respuesta: { conflicto: true, consulta: c ?? null },
            });
            if (conflicto) await liberarDocumento(ctx.orgId, intento.documentoId, 'arca', MSG_DESCARTADO);
            return 'descartado';
        }
        // ARCA no tiene ese número. Si el pedido ya es viejo, no se autorizó.
        if (ahora - Date.parse(intento.enviadoAt) >= ANTIGUEDAD_PARA_DESCARTAR_S * 1000) {
            if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'ARCA no registró el pedido.', respuesta: { ultimo } })) {
                await liberarDocumento(ctx.orgId, intento.documentoId, 'arca', MSG_DESCARTADO);
            }
            return 'descartado';
        }
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    } catch (error) {
        if (error instanceof RailTransitorioError) {
            await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
            return 'sin_resolver';
        }
        throw error;
    }
}

export type ResultadoEmision =
    | { tipo: 'autorizado'; intento: IntentoRail }
    | { tipo: 'rechazado'; mensaje: string; codigo?: string }
    | { tipo: 'incierto'; mensaje: string };

const CONFLICTO_PENDIENTE = 'Hay otra factura esperando la confirmación de ARCA en este punto de venta. Reintenta en un par de minutos.';

/**
 * Pide el CAE de `base` para el documento. `base` es la solicitud sin número
 * (armarSolicitud). Debe llamarse SIN un intento vivo del documento: el
 * proveedor resuelve antes el que hubiera.
 */
export async function emitirAnteArca(ctx: ContextoArca, documentoId: string, base: SolicitudArca): Promise<ResultadoEmision> {
    const clave = { rail: 'arca' as const, entorno: ctx.entorno, serie: String(base.ptoVta), tipo: String(base.cbteTipo) };
    return conSecuencia(ctx.orgId, clave, async () => {
        for (let vuelta = 0; vuelta < 2; vuelta++) {
            // 0) Otra instancia pudo autorizar ESTE documento mientras se
            //    esperaba el lease (dos clics en "Emitir"): se devuelve ese.
            const previo = await intentoVivo(ctx.orgId, documentoId, 'arca', ctx.entorno);
            if (previo?.estado === 'autorizado') return { tipo: 'autorizado', intento: previo } as const;

            // 1) Lo colgado de esta secuencia se resuelve antes de pedir otro número.
            for (const colgado of await sinResolverDeSecuencia(ctx.orgId, 'arca', ctx.entorno, clave.serie, clave.tipo)) {
                const r = await resolverPorConsulta(ctx, colgado);
                if (r === 'sin_resolver') {
                    return colgado.documentoId === documentoId
                        ? { tipo: 'incierto', mensaje: MSG_INCIERTO } as const
                        : { tipo: 'rechazado', mensaje: CONFLICTO_PENDIENTE } as const;
                }
                if (r === 'autorizado' && colgado.documentoId === documentoId) {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'arca', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio } as const;
                }
            }

            // 2) Número = último autorizado + 1.
            const numero = (await ultimoAutorizado(ctx, base.ptoVta, base.cbteTipo)) + 1;
            const solicitud = conNumero(base, numero);
            const intento = await reclamarNumero(ctx.orgId, {
                documentoId, rail: 'arca', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero,
                solicitud: solicitud as unknown as Record<string, unknown>,
            });
            if (!intento) throw new RailTransitorioError(CONFLICTO_PENDIENTE);

            // 3) Enviar. `enviado_at` va antes: sin él, el intento seguro no salió.
            let auth = await autenticar(ctx);
            await marcarEnviado(ctx.orgId, intento.id);
            let respuesta;
            try {
                respuesta = await parsearCAESolicitar(await llamarWsfe(ctx.entorno, 'FECAESolicitar',
                    sobreCAESolicitar(auth, { ptoVta: solicitud.ptoVta, cbteTipo: solicitud.cbteTipo }, solicitud.detalle)));
                if (!respuesta.resultado && esDeAutenticacion(respuesta.errores)) {
                    // Token rechazado: ARCA no procesó el comprobante. Se reenvía
                    // el MISMO número con un ticket nuevo.
                    await invalidarTicket(claveAcceso(ctx));
                    auth = await autenticar(ctx, { forzar: true });
                    respuesta = await parsearCAESolicitar(await llamarWsfe(ctx.entorno, 'FECAESolicitar',
                        sobreCAESolicitar(auth, { ptoVta: solicitud.ptoVta, cbteTipo: solicitud.cbteTipo }, solicitud.detalle)));
                }
            } catch (error) {
                if (error instanceof ArcaFaultError) {
                    // El servidor no pudo leer el pedido: no se procesó nada.
                    log.error('arca: FECAESolicitar respondió soap:Fault', { route: 'fiscal/arca', orgId: ctx.orgId, faultcode: error.faultcode, detalle: error.faultstring });
                    const mensaje = 'ARCA no pudo procesar la solicitud de la factura. Escríbenos a soporte@flouvia.com si el problema sigue.';
                    await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo: `fault:${error.faultcode}`, respuesta: { fault: error.faultcode } });
                    return { tipo: 'rechazado', mensaje, codigo: error.faultcode };
                }
                if (error instanceof ArcaTransporteError || error instanceof RailTransitorioError) {
                    log.error('arca: FECAESolicitar sin respuesta legible', { route: 'fiscal/arca', orgId: ctx.orgId, intento: intento.id, err: error });
                    const incierto = await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
                    // Una consulta inmediata resuelve el caso más común (la
                    // respuesta se perdió pero el CAE ya existe).
                    if (incierto && await resolverPorConsulta(ctx, incierto) === 'autorizado') {
                        const propio = await intentoVivo(ctx.orgId, documentoId, 'arca', ctx.entorno);
                        if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
                    }
                    return { tipo: 'incierto', mensaje: MSG_INCIERTO };
                }
                throw error;
            }

            if (!ambienteCoincide(respuesta.ambiente, ctx.entorno)) {
                log.error('arca: la respuesta vino de otro ambiente', { route: 'fiscal/arca', orgId: ctx.orgId, ambiente: respuesta.ambiente, entorno: ctx.entorno });
                const mensaje = 'La respuesta de ARCA no corresponde al ambiente configurado. Escríbenos a soporte@flouvia.com.';
                await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje, respuesta: { ambiente: respuesta.ambiente } });
                return { tipo: 'incierto', mensaje };
            }

            const observaciones = respuesta.observaciones.map((o) => ({ code: o.code, msg: o.msg, mensaje: mensajeObservacion(o.code) }));
            const crudo = {
                resultado: respuesta.resultado, resultadoCabecera: respuesta.resultadoCabecera, cae: respuesta.cae,
                caeVence: respuesta.caeVence, cbteFch: respuesta.cbteFch, errores: respuesta.errores,
                observaciones: respuesta.observaciones, eventos: respuesta.eventos, ambiente: respuesta.ambiente,
            };

            if (respuesta.resultado === 'A' && /^\d{14}$/.test(respuesta.cae)) {
                const vence = /^\d{8}$/.test(respuesta.caeVence)
                    ? `${respuesta.caeVence.slice(0, 4)}-${respuesta.caeVence.slice(4, 6)}-${respuesta.caeVence.slice(6, 8)}` : null;
                const autorizado = await resolverIntento(ctx.orgId, intento.id, {
                    estado: 'autorizado', autorizacion: respuesta.cae, vence, respuesta: crudo, observaciones,
                });
                await anotarUltimoAutorizado(ctx.orgId, clave, numero);
                if (!autorizado) throw new Error('arca: el intento autorizado no se pudo registrar');
                return { tipo: 'autorizado', intento: autorizado };
            }

            const codigos = [...respuesta.errores, ...respuesta.observaciones];
            if (!respuesta.resultado && respuesta.errores.some((e) => CODIGOS_TRANSITORIOS.has(e.code))) {
                // Error interno de ARCA (500/501/502): no se sabe si alcanzó a
                // registrar algo. Se consulta, nunca se reenvía a ciegas.
                await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO, respuesta: crudo });
                return { tipo: 'incierto', mensaje: MSG_INCIERTO };
            }

            const mensaje = codigos.length ? mensajeRechazo(codigos) : 'ARCA rechazó el comprobante sin indicar el motivo. Escríbenos a soporte@flouvia.com.';
            const codigo = codigos[0] ? String(codigos[0].code) : null;
            await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo, respuesta: crudo, observaciones });
            log.error('arca: comprobante rechazado', { route: 'fiscal/arca', orgId: ctx.orgId, intento: intento.id, codigos });
            // 10016: la numeración cambió entretanto (otro sistema emitió con el
            // mismo punto de venta). Una vuelta más con el número nuevo.
            if (codigos.some((c) => c.code === CODIGO_NUMERACION) && vuelta === 0) continue;
            return { tipo: 'rechazado', mensaje, codigo: codigo ?? undefined };
        }
        return { tipo: 'rechazado', mensaje: 'La numeración de ARCA cambió mientras se emitía. Reintenta.' };
    }, { esperaMaxMs: 12_000, leaseS: 120 });
}
