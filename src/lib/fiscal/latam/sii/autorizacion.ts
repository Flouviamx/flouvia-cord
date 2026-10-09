// Emisión ante el SII con la máquina de estados del marco común
// (latam/comprobantes.ts).
//
// A diferencia de ARCA, el SII no autoriza en la misma llamada: el upload
// devuelve un número de envío (trackid) y el SII valida después. Por eso:
//
//   1. El folio sale del CAF (cafs.ts) dentro del lease de la secuencia
//      (conSecuencia: RUT emisor + tipo) y se reclama en la base ANTES de
//      enviar; con él se arma, timbra y firma el documento, y la solicitud
//      guarda el DTE y el sobre exactos.
//   2. `enviado_at` se marca antes del upload. Con STATUS 0 y trackid el
//      intento sigue `pendiente` con el trackid anotado; el SII lo resuelve:
//        - QueryEstUp "EPR" con el documento aceptado (o con reparos) → autorizado;
//        - "EPR" rechazado, o RSC/RFR/RCT (esquema, firma, carátula) → rechazado;
//        - en proceso → se vuelve a consultar (en línea unos segundos, luego el cron).
//   3. Sin respuesta legible del upload el intento queda `incierto` (el SII
//      pudo haberlo recibido): se resuelve con QueryEstDte por los datos del
//      documento. Nunca se reenvía a ciegas; solo se reenvía el MISMO archivo
//      cuando el SII dijo expresamente que no lo recibió (STATUS 2, 3 o 9) o
//      que no estaba autenticado (STATUS 5, con un token nuevo).
//   4. Un folio usado no se reutiliza: un rechazo o un descarte libera el
//      DOCUMENTO (puede volver a emitirse con otro folio), no el folio.

import { log } from '../../../log';
import { invalidarTicket, obtenerTicket, type ClaveAcceso } from '../accesos';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, type IntentoRail,
} from '../comprobantes';
import { credencialActiva, leerAjustes, marcarVerificacion, type CredencialActiva } from '../credenciales';
import { RailDatosError, RailNoDisponibleError, RailTransitorioError, MSG_INCIERTO } from '../errores';
import type { EntornoRail } from '../rieles';
import { sql, withOrgTx } from '../../../db';
import { consumirFolio } from './cafs';
import { SERVICIO_TOKEN, TIPOS_DTE, VIGENCIA_TOKEN_MS } from './constantes';
import { numeroDocumento, type BorradorSii } from './dte';
import { emitirDocumento } from './emision';
import { semillaFirmada } from './envio';
import {
    faseDte, faseEnvio, mensajeDteNoAutorizado, mensajeEnvioRechazado, mensajeToken, mensajeUpload,
    STATUS_REINTENTABLES, tokenTransitorio,
} from './errores';
import { bytesLatin1, fechaChile, rutValido } from './texto';
import {
    ESTADOS_TOKEN, llamarSii, parsearRespuesta, sobreEstadoDte, sobreEstadoEnvio, sobreSemilla, sobreToken, subirEnvio,
    SiiFaultError, SiiTransporteError, type RecepcionEnvio, type RespuestaSii,
} from './ws';

/** Ajustes del riel por organización (`fiscal_rail_ajustes.ajustes`). */
export interface AjustesSii {
    /** Giro del emisor tal como está inscrito en el SII (≤ 80). */
    giro?: string;
    /** Códigos de actividad económica (Acteco, 1 a 4). */
    acteco?: number[];
    /** Dirección de la casa matriz o sucursal emisora; si falta, la de Identidad de facturación. */
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    sucursal?: string;
    /** Código de sucursal que entrega el SII (CdgSIISucur). */
    cdgSucursal?: number;
    /** Dirección regional o unidad del SII del emisor: va bajo el recuadro impreso. */
    unidadSii?: string;
    /** Resolución que autoriza a emitir, por entorno (en certificación el número es 0). */
    resoluciones?: Partial<Record<EntornoRail, { numero: number; fecha: string }>>;
}

/** Lo que falta para emitir, como código: la pantalla lo traduce (es/en). */
export type FaltanteSii =
    | 'rut' | 'razon_social' | 'direccion' | 'giro' | 'acteco' | 'comuna' | 'unidad_sii' | 'resolucion'
    | 'certificado' | 'certificado_vencido' | 'folios';

const FALTANTE_ES: Record<FaltanteSii, string> = {
    rut: 'RUT del negocio',
    razon_social: 'razón social',
    direccion: 'dirección',
    giro: 'giro',
    acteco: 'actividad económica',
    comuna: 'comuna',
    unidad_sii: 'unidad del SII',
    resolucion: 'número y fecha de resolución',
    certificado: 'certificado digital',
    certificado_vencido: 'certificado vigente',
    folios: 'folios de factura (CAF)',
};

export function faltantesAjustes(a: Partial<AjustesSii>, entorno: EntornoRail): FaltanteSii[] {
    const faltan: FaltanteSii[] = [];
    if (!String(a.giro ?? '').trim()) faltan.push('giro');
    if (!Array.isArray(a.acteco) || !a.acteco.length || !a.acteco.every((c) => Number.isInteger(c) && c > 0 && c < 1_000_000)) faltan.push('acteco');
    if (!String(a.comuna ?? '').trim()) faltan.push('comuna');
    if (!String(a.unidadSii ?? '').trim()) faltan.push('unidad_sii');
    const res = a.resoluciones?.[entorno];
    if (!res || !Number.isInteger(res.numero) || res.numero < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(res.fecha ?? ''))) faltan.push('resolucion');
    return faltan;
}

export interface ContextoSii {
    orgId: string;
    entorno: EntornoRail;
    rutEmisor: string;
    /** RUT del titular del certificado: firma el envío y se autentica ante el SII. */
    rutFirmante: string;
    ajustes: AjustesSii & { giro: string; acteco: number[]; comuna: string; unidadSii: string };
    resolucion: { numero: number; fecha: string };
    credencial: CredencialActiva;
}

/** Todo lo que hace falta para hablar con el SII por esta organización. Lanza un error apto para el usuario. */
export async function contextoSii(orgId: string, entorno: EntornoRail, rutNegocio: string | null | undefined): Promise<ContextoSii> {
    const [ajustes, credencial] = await Promise.all([
        leerAjustes<AjustesSii>(orgId, 'sii'),
        credencialActiva(orgId, 'sii', entorno),
    ]);
    const faltan = faltantesAjustes(ajustes, entorno);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los datos del SII (${faltan.map((f) => FALTANTE_ES[f]).join(', ')}) en Ajustes › Datos fiscales.`);
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital del usuario autorizado ante el SII en Ajustes › Datos fiscales para emitir facturas electrónicas.');
    if (credencial.vencida) throw new RailNoDisponibleError('El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales.');
    const rut = rutValido(rutNegocio);
    if (!rut) throw new RailDatosError('El RUT de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    return {
        orgId, entorno, rutEmisor: rut, rutFirmante: credencial.identificador,
        ajustes: ajustes as ContextoSii['ajustes'],
        resolucion: ajustes.resoluciones![entorno]!,
        credencial,
    };
}

/** Lo mínimo para autenticarse: la cuenta, el entorno y el certificado (sin los datos del DTE). */
export type AccesoSii = Pick<ContextoSii, 'orgId' | 'entorno' | 'credencial'>;

const claveAcceso = (ctx: AccesoSii): ClaveAcceso => ({ orgId: ctx.orgId, rail: 'sii', entorno: ctx.entorno, servicio: SERVICIO_TOKEN });
const MSG_SII_CAIDO = 'El SII no está respondiendo en este momento. Reintenta en unos minutos.';

/** Token del SII (semilla → semilla firmada → token), cacheado y renovado por una sola instancia. */
export async function autenticar(ctx: AccesoSii, opts: { forzar?: boolean } = {}): Promise<string> {
    const ticket = await obtenerTicket(claveAcceso(ctx), async () => {
        try {
            const semilla = await parsearRespuesta(await llamarSii(ctx.entorno, 'getSeed', sobreSemilla()), 'getSeed');
            if (semilla.estado !== '00' || !semilla.campos.SEMILLA) {
                log.error('sii: CrSeed sin semilla', { route: 'fiscal/sii', orgId: ctx.orgId, estado: semilla.estado });
                return { ok: false, bloquearSegundos: 30, error: new RailTransitorioError(MSG_SII_CAIDO) };
            }
            const firmado = semillaFirmada(semilla.campos.SEMILLA, { certPem: ctx.credencial.certPem, keyPem: ctx.credencial.keyPem });
            const r = await parsearRespuesta(await llamarSii(ctx.entorno, 'getToken', sobreToken(firmado)), 'getToken');
            const token = r.campos.TOKEN;
            if (r.estado !== '00' || !token) {
                log.error('sii: GetTokenFromSeed rechazó la semilla', { route: 'fiscal/sii', orgId: ctx.orgId, estado: r.estado, glosa: r.glosa });
                if (tokenTransitorio(r.estado)) return { ok: false, bloquearSegundos: 30, error: new RailTransitorioError(MSG_SII_CAIDO) };
                const mensaje = mensajeToken(r.estado);
                await marcarVerificacion(ctx.orgId, 'sii', ctx.entorno, mensaje);
                return { ok: false, error: new RailNoDisponibleError(mensaje, r.estado) };
            }
            await marcarVerificacion(ctx.orgId, 'sii', ctx.entorno, null);
            // El token no trae vencimiento: se usa una ventana prudente y se
            // renueva antes si el SII lo rechaza (constantes.ts).
            return { ok: true, ticket: { token, sign: semilla.campos.SEMILLA, expira: new Date(Date.now() + VIGENCIA_TOKEN_MS) } };
        } catch (error) {
            log.error('sii: la autenticación no respondió', { route: 'fiscal/sii', orgId: ctx.orgId, err: error });
            return { ok: false, error: new RailTransitorioError(MSG_SII_CAIDO) };
        }
    }, { forzar: opts.forzar, margenMs: 5 * 60_000 });
    return ticket.token;
}

/** Una consulta (sin efectos) con renovación del token si el SII lo da por inválido. */
async function consulta(ctx: ContextoSii, armar: (token: string) => { op: 'getEstUp' | 'getEstDte'; sobre: string }): Promise<RespuestaSii> {
    try {
        let token = await autenticar(ctx);
        let p = armar(token);
        let r = await parsearRespuesta(await llamarSii(ctx.entorno, p.op, p.sobre), p.op);
        if (ESTADOS_TOKEN.has(r.estado)) {
            await invalidarTicket(claveAcceso(ctx));
            token = await autenticar(ctx, { forzar: true });
            p = armar(token);
            r = await parsearRespuesta(await llamarSii(ctx.entorno, p.op, p.sobre), p.op);
        }
        return r;
    } catch (error) {
        if (error instanceof SiiTransporteError || error instanceof SiiFaultError) {
            log.error('sii: falló una consulta', { route: 'fiscal/sii', orgId: ctx.orgId, err: error });
            throw new RailTransitorioError(MSG_SII_CAIDO);
        }
        throw error;
    }
}

export async function estadoEnvio(ctx: ContextoSii, trackId: string): Promise<RespuestaSii> {
    return consulta(ctx, (token) => ({ op: 'getEstUp', sobre: sobreEstadoEnvio(ctx.rutEmisor, trackId, token) }));
}

export async function estadoDte(ctx: ContextoSii, s: SolicitudSii): Promise<RespuestaSii> {
    return consulta(ctx, (token) => ({
        op: 'getEstDte',
        sobre: sobreEstadoDte({
            rutConsultante: ctx.rutFirmante, rutEmisor: s.rutEmisor, rutReceptor: s.rutReceptor,
            tipo: s.tipo, folio: s.folio, fechaEmision: s.fechaEmision, monto: s.montoTotal,
        }, token),
    }));
}

/** Lo que se le envía al SII por UN documento. Se persiste tal cual en `solicitud`. */
export interface SolicitudSii {
    tipo: 33 | 34 | 61;
    folio: number;
    fechaEmision: string;
    rutEmisor: string;
    rutReceptor: string;
    montoTotal: number;
    borrador: BorradorSii;
    /** <Documento ID="…"> */
    id: string;
    /** <TED> aplanado: contenido del PDF417. */
    timbre: string;
    /** DTE firmado (archivo ISO-8859-1 como texto). */
    dte: string;
    /** Sobre al SII (archivo ISO-8859-1 como texto). */
    envio: string;
    rutEnvia: string;
    resolucion: { numero: number; fecha: string };
    unidadSii: string;
}

/** Respuesta parcial de un intento todavía pendiente (upload, consultas). */
export interface RespuestaParcial {
    trackId?: string;
    upload?: { status: number; timestamp?: string; detalle?: string[] };
    consulta?: { estado: string; glosa?: string; aceptados?: number; rechazados?: number; reparos?: number };
}

/** Anota lo que se sabe de un intento sin cambiar su estado (el trigger permite tocar `respuesta`). */
async function anotarRespuesta(orgId: string, id: string, parcial: RespuestaParcial): Promise<void> {
    await withOrgTx(orgId, sql`
        update fiscal_rail_comprobantes
           set respuesta = coalesce(respuesta, '{}'::jsonb) || ${JSON.stringify(parcial)}::jsonb
         where id = ${id} and org_id = ${orgId} and estado in ('pendiente', 'incierto')`);
}

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

const MSG_LIBERADO = 'El SII no registró esta factura. Puedes volver a emitirla (tendrá un folio nuevo) o descartarla.';
/** Sin trackid, un envío que el SII no registra en este plazo no se registró. */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 2 * 3600;
/** Con trackid y todavía sin veredicto, desde aquí también se consulta el documento. */
export const ANTIGUEDAD_PARA_CONSULTAR_DTE_S = 3600;
/** Con trackid, si el SII no tiene el documento después de esto, no lo aceptó. */
export const ANTIGUEDAD_PARA_RECHAZAR_S = 24 * 3600;

const numero = (v: unknown) => (/^\d+$/.test(String(v ?? '')) ? Number(v) : 0);

async function cerrarRechazado(ctx: ContextoSii, intento: IntentoRail, mensaje: string, codigo: string, respuesta: Record<string, unknown>): Promise<ResultadoResolucion> {
    const r = await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo, respuesta });
    if (r) await liberarDocumento(ctx.orgId, intento.documentoId, 'sii', mensaje);
    return 'descartado';
}

async function cerrarDescartado(ctx: ContextoSii, intento: IntentoRail, mensaje: string, respuesta: Record<string, unknown>): Promise<ResultadoResolucion> {
    const r = await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje, respuesta });
    if (r) await liberarDocumento(ctx.orgId, intento.documentoId, 'sii', MSG_LIBERADO);
    return 'descartado';
}

async function cerrarAutorizado(ctx: ContextoSii, intento: IntentoRail, autorizacion: string, respuesta: Record<string, unknown>, reparos: boolean): Promise<ResultadoResolucion> {
    const sol = intento.solicitud as SolicitudSii;
    await resolverIntento(ctx.orgId, intento.id, {
        estado: 'autorizado',
        autorizacion,
        vence: null,
        respuesta,
        observaciones: reparos ? [{ code: 0, mensaje: 'El SII aceptó el documento con reparos: revisa el detalle en el sitio del SII.' }] : [],
    });
    await anotarUltimoAutorizado(ctx.orgId, { rail: 'sii', entorno: ctx.entorno, serie: sol.rutEmisor, tipo: String(sol.tipo) }, sol.folio);
    return 'autorizado';
}

/** Interpreta el veredicto de QueryEstUp. Null = todavía sin veredicto. */
async function veredictoEnvio(ctx: ContextoSii, intento: IntentoRail, trackId: string): Promise<ResultadoResolucion | null> {
    const r = await estadoEnvio(ctx, trackId);
    const c = r.campos;
    const consultaInfo = { estado: r.estado, glosa: r.glosa, aceptados: numero(c.ACEPTADOS), rechazados: numero(c.RECHAZADOS), reparos: numero(c.REPAROS) };
    const fase = faseEnvio(r.estado);
    if (fase === 'procesado') {
        if (consultaInfo.aceptados + consultaInfo.reparos > 0) {
            return cerrarAutorizado(ctx, intento, trackId, { trackId, consulta: consultaInfo }, consultaInfo.reparos > 0);
        }
        if (consultaInfo.rechazados > 0) {
            log.error('sii: el SII rechazó el documento', { route: 'fiscal/sii', orgId: ctx.orgId, intento: intento.id, trackId });
            return cerrarRechazado(ctx, intento, 'El SII rechazó el documento. Revisa el detalle del envío en el sitio del SII o escríbenos a soporte@flouvia.com.', 'EPR', { trackId, consulta: consultaInfo });
        }
    }
    if (fase === 'rechazado') {
        log.error('sii: el SII rechazó el envío', { route: 'fiscal/sii', orgId: ctx.orgId, intento: intento.id, trackId, estado: r.estado });
        return cerrarRechazado(ctx, intento, mensajeEnvioRechazado(r.estado), r.estado, { trackId, consulta: consultaInfo });
    }
    await anotarRespuesta(ctx.orgId, intento.id, { consulta: consultaInfo });
    return null;
}

/** Interpreta QueryEstDte. Null = todavía sin veredicto. */
async function veredictoDte(ctx: ContextoSii, intento: IntentoRail, edadS: number, conTrackId: boolean): Promise<ResultadoResolucion | null> {
    const sol = intento.solicitud as SolicitudSii;
    const r = await estadoDte(ctx, sol);
    const fase = faseDte(r.estado);
    const respuesta = { consultaDte: { estado: r.estado, glosa: r.glosa } };
    if (fase === 'recibido') {
        const trackId = (intento.respuesta as RespuestaParcial | null)?.trackId;
        return cerrarAutorizado(ctx, intento, trackId ?? `SII-${r.estado}`, { ...respuesta, ...(trackId ? { trackId } : {}), recuperado: true }, false);
    }
    if (fase === 'no_autorizado') {
        const mensaje = mensajeDteNoAutorizado(r.estado);
        return intento.estado === 'pendiente'
            ? cerrarRechazado(ctx, intento, mensaje, r.estado, respuesta)
            : cerrarDescartado(ctx, intento, mensaje, respuesta);
    }
    if (fase === 'no_recibido') {
        const limite = conTrackId ? ANTIGUEDAD_PARA_RECHAZAR_S : ANTIGUEDAD_PARA_DESCARTAR_S;
        if (edadS >= limite) {
            return intento.estado === 'pendiente' && conTrackId
                ? cerrarRechazado(ctx, intento, 'El SII no aceptó el documento.', 'FAU', respuesta)
                : cerrarDescartado(ctx, intento, 'El SII no registró el documento.', respuesta);
        }
    }
    if (fase === 'datos_distintos') {
        // El SII tiene ese folio con OTROS datos: alguien lo usó fuera de Cord, o
        // el documento no es el que Cord envió. No se adivina: soporte.
        log.error('sii: el SII tiene el folio con otros datos', { route: 'fiscal/sii', orgId: ctx.orgId, intento: intento.id, folio: sol.folio, tipo: sol.tipo });
    }
    await anotarRespuesta(ctx.orgId, intento.id, {});
    return null;
}

/**
 * Sube el sobre ya firmado del intento. Reenvía el MISMO archivo solo cuando
 * el SII dijo que no lo recibió (token vencido o problema suyo).
 */
async function subir(ctx: ContextoSii, intento: IntentoRail): Promise<{ tipo: 'recibido'; trackId: string } | { tipo: 'rechazado'; status: number } | { tipo: 'reintentar'; status: number } | { tipo: 'incierto' }> {
    const sol = intento.solicitud as SolicitudSii;
    const archivo = bytesLatin1(sol.envio);
    const nombre = `EnvioDTE_${sol.rutEmisor.replace('-', '')}_T${sol.tipo}_F${sol.folio}.xml`;
    let token = await autenticar(ctx);
    await marcarEnviado(ctx.orgId, intento.id);
    let recepcion: RecepcionEnvio;
    try {
        recepcion = await subirEnvio(ctx.entorno, token, sol.rutEnvia, sol.rutEmisor, nombre, archivo);
        if (recepcion.status === 5) {
            // No autenticado: el SII no procesó el archivo. Token nuevo y el mismo archivo.
            await invalidarTicket(claveAcceso(ctx));
            token = await autenticar(ctx, { forzar: true });
            recepcion = await subirEnvio(ctx.entorno, token, sol.rutEnvia, sol.rutEmisor, nombre, archivo);
        }
    } catch (error) {
        if (error instanceof SiiTransporteError) {
            log.error('sii: el upload no tuvo respuesta legible', { route: 'fiscal/sii', orgId: ctx.orgId, intento: intento.id, err: error });
            return { tipo: 'incierto' };
        }
        throw error;
    }
    await anotarRespuesta(ctx.orgId, intento.id, {
        ...(recepcion.trackId ? { trackId: recepcion.trackId } : {}),
        upload: { status: recepcion.status, timestamp: recepcion.timestamp, ...(recepcion.detalle.length ? { detalle: recepcion.detalle } : {}) },
    });
    if (recepcion.status === 0 && recepcion.trackId) return { tipo: 'recibido', trackId: recepcion.trackId };
    if (recepcion.status === 0) return { tipo: 'incierto' };
    log.error('sii: el upload fue rechazado', { route: 'fiscal/sii', orgId: ctx.orgId, intento: intento.id, status: recepcion.status, detalle: recepcion.detalle });
    return STATUS_REINTENTABLES.has(recepcion.status) || recepcion.status === 5 ? { tipo: 'reintentar', status: recepcion.status } : { tipo: 'rechazado', status: recepcion.status };
}

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO al SII (y, si el
 * SII dijo que no recibió el archivo, reenviándolo). Debe llamarse con el
 * intento releído; tolera que otra instancia lo haya resuelto.
 */
export async function resolverPorConsulta(ctx: ContextoSii, recibido: IntentoRail, ahora = Date.now()): Promise<ResultadoResolucion> {
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const parcial = (intento.respuesta ?? {}) as RespuestaParcial;
    if (!intento.enviadoAt) {
        // Reclamado y nunca enviado (el proceso murió antes): el folio queda
        // usado y el documento libre.
        return cerrarDescartado(ctx, intento, 'El documento no llegó a enviarse al SII.', {});
    }
    const edadS = (ahora - Date.parse(intento.enviadoAt)) / 1000;
    try {
        if (parcial.trackId) {
            const v = await veredictoEnvio(ctx, intento, parcial.trackId);
            if (v) return v;
            if (edadS >= ANTIGUEDAD_PARA_CONSULTAR_DTE_S) {
                const d = await veredictoDte(ctx, intento, edadS, true);
                if (d) return d;
            }
            return 'sin_resolver';
        }
        // El SII dijo que no recibió el archivo por un problema suyo: el MISMO
        // archivo se vuelve a subir (no es reenvío a ciegas).
        if (intento.estado === 'pendiente' && parcial.upload && (STATUS_REINTENTABLES.has(parcial.upload.status) || parcial.upload.status === 5)) {
            const s = await subir(ctx, intento);
            if (s.tipo === 'recibido') return (await veredictoEnvio(ctx, intento, s.trackId)) ?? 'sin_resolver';
            if (s.tipo === 'rechazado') return cerrarRechazado(ctx, intento, mensajeUpload(s.status), `upload:${s.status}`, { upload: { status: s.status } });
            if (s.tipo === 'incierto') await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
            return 'sin_resolver';
        }
        return (await veredictoDte(ctx, intento, edadS, false)) ?? 'sin_resolver';
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
    | { tipo: 'en_validacion'; mensaje: string; trackId: string }
    | { tipo: 'incierto'; mensaje: string };

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function mensajeEnValidacion(trackId: string): string {
    return `El SII recibió el documento (envío N° ${trackId}) y lo está validando. Cord terminará de emitirlo en cuanto el SII lo acepte; no hace falta volver a enviarlo.`;
}

/**
 * Emite `borrador` para el documento: toma un folio, firma, envía y espera un
 * momento el veredicto. Debe llamarse SIN un intento vivo del documento (el
 * proveedor resuelve antes el que hubiera).
 */
export async function emitirAnteSii(ctx: ContextoSii, documentoId: string, borrador: BorradorSii, ahora = new Date(), esperaVeredictoMs = 12_000): Promise<ResultadoEmision> {
    const clave = { rail: 'sii' as const, entorno: ctx.entorno, serie: ctx.rutEmisor, tipo: String(borrador.tipo) };
    // Folio, firma y upload dentro del lease de la secuencia: otra instancia
    // (doble clic, el cron) nunca ve el intento reclamado y todavía sin enviar.
    type Paso = { previo: IntentoRail } | { intento: IntentoRail; subida: Awaited<ReturnType<typeof subir>> };
    const paso: Paso = await conSecuencia(ctx.orgId, clave, async (): Promise<Paso> => {
        // Otra instancia pudo reclamar ESTE documento mientras se esperaba el lease.
        const previo = await intentoVivo(ctx.orgId, documentoId, 'sii', ctx.entorno);
        if (previo) return { previo };
        const asignado = await consumirFolio(ctx.orgId, ctx.entorno, borrador.tipo, borrador.fechaEmision, ctx.rutEmisor);
        const doc = emitirDocumento(borrador, asignado,
            { certPem: ctx.credencial.certPem, keyPem: ctx.credencial.keyPem },
            { rutEmisor: ctx.rutEmisor, rutEnvia: ctx.rutFirmante, resolucion: ctx.resolucion }, ahora);
        const solicitud: SolicitudSii = {
            tipo: borrador.tipo, folio: asignado.folio, fechaEmision: borrador.fechaEmision,
            rutEmisor: ctx.rutEmisor, rutReceptor: borrador.receptor.rut, montoTotal: borrador.total,
            borrador, id: doc.id, timbre: doc.timbre, dte: doc.dteXml, envio: doc.envioXml,
            rutEnvia: ctx.rutFirmante, resolucion: ctx.resolucion, unidadSii: ctx.ajustes.unidadSii,
        };
        const reclamado = await reclamarNumero(ctx.orgId, {
            documentoId, rail: 'sii', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero: asignado.folio,
            solicitud: solicitud as unknown as Record<string, unknown>,
        });
        if (!reclamado) {
            // El folio queda usado: nunca se reintenta con el mismo.
            log.error('sii: no se pudo reclamar un folio recién tomado', { route: 'fiscal/sii', orgId: ctx.orgId, folio: asignado.folio, tipo: borrador.tipo });
            throw new RailTransitorioError('Otra emisión de este documento está en curso. Reintenta en unos segundos.');
        }
        const subida = await subir(ctx, reclamado);
        if (subida.tipo === 'incierto') await resolverIntento(ctx.orgId, reclamado.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
        if (subida.tipo === 'rechazado') {
            await cerrarRechazado(ctx, reclamado, mensajeUpload(subida.status), `upload:${subida.status}`, { upload: { status: subida.status } });
        }
        return { intento: reclamado, subida };
    }, { esperaMaxMs: 12_000, leaseS: 90 });

    if ('previo' in paso) {
        const intento = paso.previo;
        if (intento.estado === 'autorizado') return { tipo: 'autorizado', intento };
        // Ya estaba en vuelo (doble clic): se consulta, nunca se reenvía a ciegas.
        const r = await conSecuencia(ctx.orgId, clave, () => resolverPorConsulta(ctx, intento), { esperaMaxMs: 12_000, leaseS: 90 });
        const actual = await intentoPorId(ctx.orgId, intento.id);
        if (r === 'autorizado' && actual) return { tipo: 'autorizado', intento: actual };
        if (r === 'descartado') return { tipo: 'rechazado', mensaje: actual?.errorMensaje ?? MSG_LIBERADO };
        const trackId = (actual?.respuesta as RespuestaParcial | null)?.trackId;
        return trackId ? { tipo: 'en_validacion', mensaje: mensajeEnValidacion(trackId), trackId } : { tipo: 'incierto', mensaje: MSG_INCIERTO };
    }

    const { intento, subida: s } = paso;
    if (s.tipo === 'incierto') return { tipo: 'incierto', mensaje: MSG_INCIERTO };
    if (s.tipo === 'rechazado') return { tipo: 'rechazado', mensaje: mensajeUpload(s.status), codigo: `upload:${s.status}` };
    if (s.tipo === 'reintentar') return { tipo: 'incierto', mensaje: mensajeUpload(s.status) };

    // Recibido: el veredicto suele llegar en segundos. Se espera un poco; si
    // no llega, el cron (y cada reintento) lo vuelve a consultar.
    const limite = Date.now() + esperaVeredictoMs;
    for (let espera = Math.min(1_500, esperaVeredictoMs); espera > 0; espera = Math.min(espera * 2, 5_000, limite - Date.now())) {
        await dormir(espera);
        try {
            const v = await veredictoEnvio(ctx, (await intentoPorId(ctx.orgId, intento.id)) ?? intento, s.trackId);
            if (v === 'autorizado') {
                const autorizado = await intentoPorId(ctx.orgId, intento.id);
                if (autorizado) return { tipo: 'autorizado', intento: autorizado };
            }
            if (v === 'descartado') {
                const final = await intentoPorId(ctx.orgId, intento.id);
                return { tipo: 'rechazado', mensaje: final?.errorMensaje ?? 'El SII rechazó el documento.', codigo: final?.errorCodigo ?? undefined };
            }
        } catch (error) {
            if (!(error instanceof RailTransitorioError)) throw error;
            break;
        }
    }
    return { tipo: 'en_validacion', mensaje: mensajeEnValidacion(s.trackId), trackId: s.trackId };
}

/** Número del documento en Cord para un intento (folio legal del SII). */
export function numeroDeIntento(intento: IntentoRail): string {
    const sol = intento.solicitud as SolicitudSii;
    return numeroDocumento(sol.tipo, sol.folio, intento.entorno === 'homologacion');
}

export const nombreTipo = (tipo: number) => TIPOS_DTE[tipo as 33]?.nombre ?? `DTE ${tipo}`;
export const hoyChile = () => fechaChile(new Date());
