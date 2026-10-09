// Validación previa de documentos ante la DIAN con la máquina de estados del
// marco común (latam/comprobantes.ts).
//
// SendBillSync es SÍNCRONO: la DIAN valida y devuelve el ApplicationResponse
// en la misma llamada [AT 7.10]. Lo que no es síncrono es la certeza: si el
// pedido sale y la respuesta se pierde, la DIAN pudo haber validado. Un
// reenvío a ciegas no duplicaría (el CUFE es el mismo y la DIAN respondería
// "Documento procesado anteriormente"), pero el contrato del marco es más
// estricto y aquí se cumple igual: el intento queda `incierto` y se resuelve
// CONSULTANDO con GetStatus(CUFE), nunca reenviando.
//
//   1. La numeración es de Cord, dentro del rango de la resolución: el
//      siguiente número es el mayor de los intentos vivos (o del último
//      autorizado) + 1. Un rechazo o un descarte libera su número — la DIAN
//      no consideró ese documento — y el siguiente intento lo reutiliza.
//   2. Una secuencia (prefijo + tipo) tiene un solo envío en vuelo (lease).
//      Dentro del lease, lo colgado de la secuencia se resuelve ANTES de
//      numerar otro documento.
//   3. El XML firmado se guarda (dian_documentos) ANTES de enviarse: es el
//      documento legal, el que viaja en el contenedor al adquiriente y el que
//      el facturador debe conservar; el ApplicationResponse se le une al
//      validarse.

import { createHash } from 'node:crypto';
import { sql, withOrgTx } from '../../../db';
import { decryptSecret, encryptRequiredSecret } from '../../../crypto-secret';
import { log } from '../../../log';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, sinResolverDeSecuencia, type ClaveSecuencia, type IntentoRail,
} from '../comprobantes';
import { credencialActiva, leerAjustes, marcarVerificacion, type CredencialActiva } from '../credenciales';
import { MSG_INCIERTO, RailDatosError, RailNoDisponibleError, RailTransitorioError } from '../errores';
import type { EntornoRail } from '../rieles';
import type { FiscalParty } from '../../index';
import {
    conNumero, faltantesEmisor, faltantesResolucion, nitValido, prefijoNotaValido,
    type BaseDian, type ClavesDian, type EmisorDian, type FaltanteEmisor, type ResolucionDian, type SolicitudDian, type TratamientoSinIva,
} from './comprobante';
import { TIPO_DOCUMENTO, type TipoPersona } from './constantes';
import { interpretarMensaje, esProcesadoAntes, mensajeRechazo, type MensajeDian } from './errores';
import { firmarDocumento } from './firma';
import { separarCadena } from './cadena';
import {
    cuerpoGetNumberingRange, cuerpoGetStatus, cuerpoSendBillSync, DianFaultError, DianTransporteError, llamarDian,
    momentoRespuesta, parsearGetNumberingRange, parsearGetStatus, parsearSendBillSync, sobreDian, zipDocumento,
    type OpcionesLlamada, type RangoNumeracion, type RespuestaDian,
} from './soap';
import { documentoXml, nombresArchivo } from './ubl';
import { armarSetDePruebas, enviarDocumentoDePrueba, estadoDeEnvio, type CantidadesSet, type EnvioDePrueba } from './habilitacion';

// ── Ajustes ──────────────────────────────────────────────────────────────────

/** Ajustes del riel DIAN por organización (`fiscal_rail_ajustes.ajustes`). */
export interface AjustesDian {
    tipoPersona?: TipoPersona;
    responsabilidades?: string[];
    /** Tributo del emisor (tabla 13.2.6.2): 01 IVA, ZZ No aplica… */
    tributo?: string;
    /** Código DIVIPOLA del municipio (tabla 13.4.3). */
    municipio?: string;
    nombreComercial?: string;
    matriculaMercantil?: string;
    /** Correo de recepción de documentos registrado ante la DIAN. */
    correo?: string;
    /** Identificador del software propio registrado en la DIAN (SoftwareID). */
    softwareId?: string;
    /** Resolución de numeración por entorno: el rango de pruebas en habilitación, la real en producción. */
    numeracion?: Partial<Record<EntornoRail, ResolucionDian>>;
    /** Prefijo de las notas crédito y débito (numeración propia del facturador). */
    prefijoNotas?: string;
    /** Cómo se informa una línea al 0 %: exenta (IVA 0) o excluida (sin IVA). */
    tratamientoSinIva?: TratamientoSinIva;
    /** TestSetId del set de pruebas de habilitación. */
    testSetId?: string;
}

/** Lo que falta para poder emitir, como código: la pantalla lo traduce (es/en). */
export type FaltanteDian = FaltanteEmisor | 'software' | 'resolucion' | 'prefijo_notas' | 'certificado' | 'certificado_vencido' | 'certificado_nit' | 'pin' | 'clave_tecnica';

const FALTANTE_ES: Record<FaltanteDian, string> = {
    nit: 'NIT del negocio',
    razon_social: 'razón social',
    tipo_persona: 'tipo de persona',
    responsabilidades: 'responsabilidades fiscales',
    tributo: 'responsabilidad frente al IVA',
    municipio: 'municipio',
    direccion: 'dirección',
    software: 'identificador del software',
    resolucion: 'resolución de numeración',
    prefijo_notas: 'prefijo de las notas',
    certificado: 'certificado de firma',
    certificado_vencido: 'certificado de firma vigente',
    certificado_nit: 'certificado a nombre de tu NIT',
    pin: 'PIN del software',
    clave_tecnica: 'clave técnica de la resolución',
};

export const SOFTWARE_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Datos del emisor que viven fuera del riel: los de Ajustes › Datos fiscales de Cord. */
export interface IdentidadEmisor {
    taxId: string | null | undefined;
    legalName: string | null | undefined;
    line1?: string | null;
    line2?: string | null;
    postalCode?: string | null;
}

export function identidadDesdeParte(p: FiscalParty | null | undefined): IdentidadEmisor {
    return {
        taxId: p?.taxId,
        legalName: p?.legalName,
        line1: p?.address?.line1 ?? null,
        line2: p?.address?.line2 ?? null,
        postalCode: p?.address?.postalCode ?? null,
    };
}

/** El emisor tal como lo informa el documento: identidad de Cord + ajustes del riel. Sin validar. */
export function emisorDesde(id: IdentidadEmisor, a: Partial<AjustesDian>): Partial<EmisorDian> {
    const nit = nitValido(id.taxId);
    const linea = [id.line1, id.line2].map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
    return {
        nit: nit?.nit,
        dv: nit?.dv,
        razonSocial: String(id.legalName ?? '').trim(),
        nombreComercial: a.nombreComercial?.trim() || null,
        tipoPersona: a.tipoPersona,
        responsabilidades: a.responsabilidades ?? [],
        tributo: a.tributo,
        direccion: { municipio: String(a.municipio ?? ''), linea, postal: id.postalCode?.trim() || null },
        matriculaMercantil: a.matriculaMercantil?.trim() || null,
        correo: a.correo?.trim() || null,
    };
}

export function faltantesAjustes(id: IdentidadEmisor, a: Partial<AjustesDian>, entorno: EntornoRail): FaltanteDian[] {
    const f: FaltanteDian[] = [...faltantesEmisor(emisorDesde(id, a))];
    if (!SOFTWARE_ID.test(String(a.softwareId ?? ''))) f.push('software');
    if (faltantesResolucion(a.numeracion?.[entorno]).length) f.push('resolucion');
    if (!prefijoNotaValido(a.prefijoNotas)) f.push('prefijo_notas');
    return f;
}

/** Faltantes de la credencial: certificado, PIN y clave técnica (secretos del entorno). */
export function faltantesCredencial(c: { vencida: boolean; identificador: string } | null, secretos: Record<string, string> | null, nit: string | null | undefined): FaltanteDian[] {
    if (!c) return ['certificado'];
    const f: FaltanteDian[] = [];
    if (c.vencida) f.push('certificado_vencido');
    else if (nit && c.identificador !== nit) f.push('certificado_nit');
    if (secretos) {
        if (!/^\d{5}$/.test(String(secretos.pin ?? ''))) f.push('pin');
        if (!/^[0-9a-zA-Z]{8,128}$/.test(String(secretos.claveTecnica ?? ''))) f.push('clave_tecnica');
    }
    return f;
}

export const describirFaltantes = (f: FaltanteDian[]) => f.map((x) => FALTANTE_ES[x]).join(', ');

// ── Contexto ─────────────────────────────────────────────────────────────────

export interface ContextoDian {
    orgId: string;
    entorno: EntornoRail;
    ajustes: AjustesDian & { softwareId: string; prefijoNotas: string };
    emisor: EmisorDian;
    resolucion: ResolucionDian;
    credencial: CredencialActiva;
    /** Cadena de certificación, titular primero (PEM). */
    cadena: string[];
    claves: ClavesDian & { claveTecnica: string };
}

/**
 * Todo lo que hace falta para hablar con la DIAN por esta organización. Lanza
 * RailNoDisponibleError (mensaje apto para el usuario) si falta algo.
 */
export async function contextoDian(orgId: string, entorno: EntornoRail, identidad: IdentidadEmisor): Promise<ContextoDian> {
    const [ajustes, credencial] = await Promise.all([leerAjustes<AjustesDian>(orgId, 'dian'), credencialActiva(orgId, 'dian', entorno)]);
    const faltan = faltantesAjustes(identidad, ajustes, entorno);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los datos de facturación electrónica de la DIAN (${describirFaltantes(faltan)}) en Ajustes › Datos fiscales.`);
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado de firma de tu negocio en Ajustes › Datos fiscales para emitir facturas electrónicas.');
    const emisor = emisorDesde(identidad, ajustes) as EmisorDian;
    const faltaCred = faltantesCredencial(credencial, credencial.secretos, emisor.nit);
    if (faltaCred.length) throw new RailNoDisponibleError(`Completa en Ajustes › Datos fiscales: ${describirFaltantes(faltaCred)}.`);
    const cadena = separarCadena(credencial.certPem);
    if (cadena.length < 3) throw new RailNoDisponibleError('Vuelve a subir el certificado de firma con su cadena de certificación completa en Ajustes › Datos fiscales.');
    return {
        orgId,
        entorno,
        ajustes: ajustes as ContextoDian['ajustes'],
        emisor,
        resolucion: ajustes.numeracion![entorno]!,
        credencial,
        cadena,
        claves: { pin: credencial.secretos.pin, claveTecnica: credencial.secretos.claveTecnica },
    };
}

/**
 * PIN y clave técnica del entorno, cifrados junto al certificado
 * (`fiscal_rail_credenciales.secretos_enc`). Se combinan con los que ya
 * había: cambiar uno no borra el otro.
 */
export async function guardarClaves(orgId: string, entorno: EntornoRail, claves: { pin?: string | null; claveTecnica?: string | null }): Promise<boolean> {
    const [[fila]] = await withOrgTx(orgId, sql`
        select secretos_enc from fiscal_rail_credenciales where org_id = ${orgId} and rail = 'dian' and entorno = ${entorno} limit 1`);
    if (!fila) return false;
    let actuales: Record<string, string> = {};
    if (fila.secretos_enc) {
        try { actuales = JSON.parse(decryptSecret(String(fila.secretos_enc)) || '{}'); } catch { actuales = {}; }
    }
    const nuevos = { ...actuales };
    if (claves.pin !== undefined) nuevos.pin = String(claves.pin ?? '');
    if (claves.claveTecnica !== undefined) nuevos.claveTecnica = String(claves.claveTecnica ?? '');
    for (const k of Object.keys(nuevos)) if (!nuevos[k]) delete nuevos[k];
    const enc = Object.keys(nuevos).length ? encryptRequiredSecret(JSON.stringify(nuevos)) : null;
    await withOrgTx(orgId, sql`
        update fiscal_rail_credenciales set secretos_enc = ${enc}
         where org_id = ${orgId} and rail = 'dian' and entorno = ${entorno}`);
    return true;
}

// ── Numeración ───────────────────────────────────────────────────────────────

export const tipoDeClase = (clase: SolicitudDian['clase']) =>
    clase === 'factura' ? TIPO_DOCUMENTO.factura : clase === 'nota_credito' ? TIPO_DOCUMENTO.notaCredito : TIPO_DOCUMENTO.notaDebito;

export const claveSecuencia = (entorno: EntornoRail, base: Pick<BaseDian, 'prefijo' | 'clase'>): ClaveSecuencia =>
    ({ rail: 'dian', entorno, serie: base.prefijo, tipo: tipoDeClase(base.clase) });

/**
 * Siguiente número de la secuencia: el mayor entre los intentos vivos y el
 * último autorizado, + 1; nunca antes del inicio del rango. Debe llamarse con
 * la secuencia tomada (conSecuencia).
 */
export async function siguienteNumero(orgId: string, k: ClaveSecuencia, desde: number): Promise<number> {
    const [vivos, seq] = await withOrgTx(orgId,
        sql`select max(numero) as n from fiscal_rail_comprobantes
             where org_id = ${orgId} and rail = ${k.rail} and entorno = ${k.entorno} and serie = ${k.serie} and tipo = ${k.tipo}
               and estado in ('pendiente', 'incierto', 'autorizado')`,
        sql`select ultimo_autorizado from fiscal_rail_secuencias
             where org_id = ${orgId} and rail = ${k.rail} and entorno = ${k.entorno} and serie = ${k.serie} and tipo = ${k.tipo}`);
    const mayor = Math.max(Number(vivos[0]?.n ?? 0) || 0, Number(seq[0]?.ultimo_autorizado ?? 0) || 0, desde - 1);
    return mayor + 1;
}

/** Último número usado de la secuencia (para el aviso de fin de rango), o null. */
export async function ultimoUsado(orgId: string, k: ClaveSecuencia): Promise<number | null> {
    const n = await siguienteNumero(orgId, k, 1);
    return n > 1 ? n - 1 : null;
}

// ── XML enviado y respuesta de la DIAN ───────────────────────────────────────

async function guardarEnvio(orgId: string, intento: IntentoRail, nombreXml: string, xml: string): Promise<void> {
    await withOrgTx(orgId, sql`
        insert into dian_documentos (intento_id, org_id, documento_id, entorno, nombre_xml, xml_firmado, xml_sha256)
        values (${intento.id}, ${orgId}, ${intento.documentoId}, ${intento.entorno}, ${nombreXml}, ${xml},
                ${createHash('sha256').update(xml, 'utf8').digest('hex')})
        on conflict (intento_id) do nothing`);
}

async function guardarRespuesta(orgId: string, intentoId: string, applicationResponse: string | null): Promise<void> {
    if (!applicationResponse) return;
    const m = momentoRespuesta(applicationResponse);
    await withOrgTx(orgId, sql`
        update dian_documentos
           set respuesta_xml = ${applicationResponse},
               validado_fecha = ${m?.fecha ?? null}::date, validado_hora = ${m?.hora ?? null}
         where intento_id = ${intentoId} and org_id = ${orgId} and respuesta_xml is null`);
}

export interface DocumentoGuardado {
    nombreXml: string;
    xmlFirmado: string;
    respuestaXml: string | null;
    validado: { fecha: string; hora: string } | null;
}

export async function documentoDeIntento(orgId: string, intentoId: string): Promise<DocumentoGuardado | null> {
    const [[r]] = await withOrgTx(orgId, sql`
        select nombre_xml, xml_firmado, respuesta_xml, validado_fecha::text as validado_fecha, validado_hora
          from dian_documentos where intento_id = ${intentoId} and org_id = ${orgId} limit 1`);
    if (!r) return null;
    return {
        nombreXml: String(r.nombre_xml),
        xmlFirmado: String(r.xml_firmado),
        respuestaXml: r.respuesta_xml ? String(r.respuesta_xml) : null,
        validado: r.validado_fecha && r.validado_hora ? { fecha: String(r.validado_fecha), hora: String(r.validado_hora) } : null,
    };
}

// ── Consultas ────────────────────────────────────────────────────────────────

/** El mensaje entero se rechazó por el certificado con que se firmó. */
const MSG_CERTIFICADO = 'La DIAN no aceptó el certificado de firma: debe ser el de tu negocio, estar vigente y haberlo emitido una entidad certificadora avalada por la ONAC.';

const firmanteSoap = (ctx: Pick<ContextoDian, 'cadena' | 'credencial'>) => ({ certPem: ctx.cadena[0], llavePem: ctx.credencial.keyPem });

/** Estado de un documento por su CUFE/CUDE. Lanza RailTransitorioError si la DIAN no responde. */
export async function consultarEstado(ctx: ContextoDian, clave: string, opts: OpcionesLlamada = {}): Promise<RespuestaDian> {
    try {
        return await parsearGetStatus(await llamarDian(ctx.entorno, 'GetStatus',
            sobreDian(ctx.entorno, 'GetStatus', cuerpoGetStatus(clave), firmanteSoap(ctx), { url: opts.url }), opts));
    } catch (error) {
        if (error instanceof DianTransporteError || error instanceof DianFaultError) {
            log.error('dian: falló GetStatus', { route: 'fiscal/dian', orgId: ctx.orgId, err: error });
            if (error instanceof DianFaultError && error.noProcesado) {
                const mensaje = MSG_CERTIFICADO;
                await marcarVerificacion(ctx.orgId, 'dian', ctx.entorno, mensaje);
                throw new RailNoDisponibleError(mensaje, error.subcodigo);
            }
            throw new RailTransitorioError('La DIAN no está respondiendo en este momento. Reintenta en unos minutos.');
        }
        throw error;
    }
}

/**
 * Rangos de numeración autorizados a este NIT y software (solo producción:
 * en habilitación el rango es el del set de pruebas, que muestra el portal).
 */
export async function rangosAutorizados(ctx: Pick<ContextoDian, 'orgId' | 'entorno' | 'cadena' | 'credencial' | 'emisor' | 'ajustes'>, opts: OpcionesLlamada = {}): Promise<RangoNumeracion[]> {
    let r;
    try {
        r = await parsearGetNumberingRange(await llamarDian(ctx.entorno, 'GetNumberingRange',
            sobreDian(ctx.entorno, 'GetNumberingRange', cuerpoGetNumberingRange(ctx.emisor.nit, ctx.emisor.nit, ctx.ajustes.softwareId), firmanteSoap(ctx), { url: opts.url }), opts));
    } catch (error) {
        if (error instanceof DianTransporteError || error instanceof DianFaultError) {
            log.error('dian: falló GetNumberingRange', { route: 'fiscal/dian', orgId: ctx.orgId, err: error });
            throw new RailTransitorioError('La DIAN no está respondiendo en este momento. Reintenta en unos minutos.');
        }
        throw error;
    }
    if (r.codigo !== '100' && !r.rangos.length) {
        throw new RailDatosError('La DIAN no informa rangos de numeración para tu NIT y este software. Revisa que la resolución esté asociada al software en el portal de la DIAN.', r.codigo);
    }
    return r.rangos;
}

// ── Resolución de intentos colgados ──────────────────────────────────────────

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

const MSG_DESCARTADO = 'La DIAN no registró este documento. Puedes volver a emitirlo o descartarlo.';

/** Un envío sin respuesta y que la DIAN no conoce se considera perdido después de esto. */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 120;

const notificaciones = (ms: MensajeDian[]) => ms.filter((m) => m.tipo === 'notificacion').map((m) => ({ code: m.regla, msg: m.texto }));

function crudo(r: RespuestaDian): Record<string, unknown> {
    return {
        valido: r.isValid, estado: r.statusCode, descripcion: r.statusDescription, mensaje: r.statusMessage,
        reglas: r.mensajes, clave: r.documentKey, archivo: r.fileName,
    };
}

async function autorizar(ctx: Pick<ContextoDian, 'orgId' | 'entorno'>, intento: IntentoRail, r: RespuestaDian, extra: Record<string, unknown> = {}): Promise<IntentoRail | null> {
    const sol = intento.solicitud as SolicitudDian;
    await guardarRespuesta(ctx.orgId, intento.id, r.applicationResponse);
    const mensajes = r.mensajes.map((m) => interpretarMensaje(m, false));
    const autorizado = await resolverIntento(ctx.orgId, intento.id, {
        estado: 'autorizado', autorizacion: sol.cufe, vence: null,
        respuesta: { ...crudo(r), ...extra }, observaciones: notificaciones(mensajes),
    });
    await anotarUltimoAutorizado(ctx.orgId, claveSecuencia(ctx.entorno, sol), intento.numero);
    return autorizado;
}

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO a la DIAN por su
 * CUFE/CUDE. Nunca reenvía. Debe llamarse con la secuencia tomada.
 */
export async function resolverPorConsulta(ctx: ContextoDian, recibido: IntentoRail, ahora = Date.now(), opts: OpcionesLlamada = {}): Promise<ResultadoResolucion> {
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const sol = intento.solicitud as SolicitudDian;
    if (!intento.enviadoAt) {
        if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'El documento no llegó a enviarse a la DIAN.' })) {
            await liberarDocumento(ctx.orgId, intento.documentoId, 'dian', MSG_DESCARTADO);
        }
        return 'descartado';
    }
    try {
        const r = await consultarEstado(ctx, sol.cufe, opts);
        if (r.isValid) {
            await autorizar(ctx, intento, r, { recuperado: true });
            return 'autorizado';
        }
        const mensajes = r.mensajes.map((m) => interpretarMensaje(m, true));
        // La DIAN tiene el documento y lo rechazó: no existe fiscalmente y su
        // número queda libre. Un intento incierto solo puede descartarse.
        if (mensajes.some((m) => m.tipo === 'rechazo') && !['66', '90'].includes(r.statusCode)) {
            const mensaje = mensajeRechazo(mensajes);
            if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje, respuesta: crudo(r) })) {
                await liberarDocumento(ctx.orgId, intento.documentoId, 'dian', mensaje);
            }
            return 'descartado';
        }
        // La DIAN no conoce ese CUFE (66 / 90): si el envío ya es viejo, no llegó.
        if (ahora - Date.parse(intento.enviadoAt) >= ANTIGUEDAD_PARA_DESCARTAR_S * 1000) {
            if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'La DIAN no registró el envío.', respuesta: crudo(r) })) {
                await liberarDocumento(ctx.orgId, intento.documentoId, 'dian', MSG_DESCARTADO);
            }
            return 'descartado';
        }
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    } catch (error) {
        // Sin respuesta, o sin un certificado que la DIAN acepte para
        // consultar: el intento sigue sin resolver (nunca se adivina).
        if (error instanceof RailTransitorioError || error instanceof RailNoDisponibleError) {
            await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
            return 'sin_resolver';
        }
        throw error;
    }
}

// ── Emisión ──────────────────────────────────────────────────────────────────

export type ResultadoEmision =
    | { tipo: 'autorizado'; intento: IntentoRail }
    | { tipo: 'rechazado'; mensaje: string; codigo?: string }
    | { tipo: 'incierto'; mensaje: string };

const CONFLICTO_PENDIENTE = 'Hay otro documento esperando la confirmación de la DIAN en esta numeración. Reintenta en un par de minutos.';

/** La firma va unos segundos atrás: la DIAN rechaza una hora de firma posterior a la suya [AT DC24]. */
export const ADELANTO_RELOJ_MS = 5_000;

/**
 * Valida `base` ante la DIAN para el documento. Debe llamarse SIN un intento
 * vivo del documento: el proveedor resuelve antes el que hubiera.
 */
export async function emitirAnteDian(ctx: ContextoDian, documentoId: string, base: BaseDian, opts: OpcionesLlamada = {}): Promise<ResultadoEmision> {
    const clave = claveSecuencia(ctx.entorno, base);
    const desde = base.clase === 'factura' ? ctx.resolucion.desde : 1;
    return conSecuencia(ctx.orgId, clave, async () => {
        // 0) Otra instancia pudo validar ESTE documento mientras se esperaba el lease.
        const previo = await intentoVivo(ctx.orgId, documentoId, 'dian', ctx.entorno);
        if (previo?.estado === 'autorizado') return { tipo: 'autorizado', intento: previo } as const;

        // 1) Lo colgado de esta secuencia se resuelve antes de numerar otro documento.
        for (const colgado of await sinResolverDeSecuencia(ctx.orgId, 'dian', ctx.entorno, clave.serie, clave.tipo)) {
            const r = await resolverPorConsulta(ctx, colgado, Date.now(), opts);
            if (r === 'sin_resolver') {
                return colgado.documentoId === documentoId
                    ? { tipo: 'incierto', mensaje: MSG_INCIERTO } as const
                    : { tipo: 'rechazado', mensaje: CONFLICTO_PENDIENTE } as const;
            }
            if (r === 'autorizado' && colgado.documentoId === documentoId) {
                const propio = await intentoVivo(ctx.orgId, documentoId, 'dian', ctx.entorno);
                if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio } as const;
            }
        }

        // 2) Número, fecha y códigos; reclamar antes de firmar y enviar.
        const numero = await siguienteNumero(ctx.orgId, clave, desde);
        const solicitud = conNumero(base, numero, new Date(Date.now() - ADELANTO_RELOJ_MS), ctx.claves);
        const intento = await reclamarNumero(ctx.orgId, {
            documentoId, rail: 'dian', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero,
            solicitud: solicitud as unknown as Record<string, unknown>,
        });
        if (!intento) throw new RailTransitorioError(CONFLICTO_PENDIENTE);

        let xml: string;
        let nombres: ReturnType<typeof nombresArchivo>;
        try {
            xml = firmarDocumento(documentoXml(solicitud), { cadena: ctx.cadena, llavePem: ctx.credencial.keyPem }, solicitud.firmadoAt, { id: `xmldsig-${intento.id}` });
            nombres = nombresArchivo(solicitud);
            await guardarEnvio(ctx.orgId, intento, nombres.xml, xml);
        } catch (error) {
            // Nada salió hacia la DIAN: el número queda libre.
            await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'No se pudo firmar el documento.' });
            log.error('dian: no se pudo firmar o guardar el documento', { route: 'fiscal/dian', orgId: ctx.orgId, intento: intento.id, err: error });
            throw new RailNoDisponibleError('No se pudo firmar el documento con tu certificado. Vuelve a subirlo en Ajustes › Datos fiscales; si el problema sigue, escríbenos a soporte@flouvia.com.');
        }

        // 3) Enviar. `enviado_at` va antes: sin él, el intento seguro no salió.
        await marcarEnviado(ctx.orgId, intento.id);
        let respuesta: RespuestaDian;
        try {
            const zip = Buffer.from(zipDocumento(nombres.xml, xml)).toString('base64');
            respuesta = await parsearSendBillSync(await llamarDian(ctx.entorno, 'SendBillSync',
                sobreDian(ctx.entorno, 'SendBillSync', cuerpoSendBillSync(nombres.zip, zip), firmanteSoap(ctx), { url: opts.url }), opts));
        } catch (error) {
            if (error instanceof DianFaultError && error.noProcesado) {
                // WCF rechazó el mensaje por su seguridad antes de despacharlo.
                log.error('dian: SendBillSync rechazado por la seguridad del mensaje', { route: 'fiscal/dian', orgId: ctx.orgId, codigo: error.codigo, subcodigo: error.subcodigo, razon: error.razon });
                const mensaje = MSG_CERTIFICADO;
                await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo: `fault:${error.subcodigo || error.codigo}`, respuesta: { fault: error.subcodigo || error.codigo } });
                await marcarVerificacion(ctx.orgId, 'dian', ctx.entorno, mensaje);
                return { tipo: 'rechazado', mensaje, codigo: error.subcodigo || error.codigo };
            }
            if (error instanceof DianFaultError || error instanceof DianTransporteError) {
                log.error('dian: SendBillSync sin respuesta legible', { route: 'fiscal/dian', orgId: ctx.orgId, intento: intento.id, err: error });
                const incierto = await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
                if (incierto && await resolverPorConsulta(ctx, incierto, Date.now(), opts) === 'autorizado') {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'dian', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
                }
                return { tipo: 'incierto', mensaje: MSG_INCIERTO };
            }
            throw error;
        }

        await marcarVerificacion(ctx.orgId, 'dian', ctx.entorno, null);
        const mensajes = respuesta.mensajes.map((m) => interpretarMensaje(m, !respuesta.isValid));
        if (respuesta.isValid) {
            const autorizado = await autorizar(ctx, intento, respuesta);
            if (!autorizado) throw new Error('dian: el intento validado no se pudo registrar');
            return { tipo: 'autorizado', intento: autorizado };
        }
        if (mensajes.some(esProcesadoAntes)) {
            // La DIAN ya tiene este CUFE: es este mismo documento (el CUFE
            // resume número, fecha, importes y NIT). Se consulta su resultado.
            const r = await resolverPorConsulta(ctx, intento, Date.now(), opts);
            if (r === 'autorizado') {
                const propio = await intentoVivo(ctx.orgId, documentoId, 'dian', ctx.entorno);
                if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
            }
            if (r === 'sin_resolver') {
                await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
                return { tipo: 'incierto', mensaje: MSG_INCIERTO };
            }
            return { tipo: 'rechazado', mensaje: MSG_DESCARTADO };
        }
        if (!mensajes.some((m) => m.tipo === 'rechazo') && respuesta.statusCode !== '99') {
            // Ni válido ni con reglas incumplidas: no se sabe qué registró. Se consulta.
            await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO, respuesta: crudo(respuesta) });
            return { tipo: 'incierto', mensaje: MSG_INCIERTO };
        }
        const mensaje = mensajeRechazo(mensajes);
        const codigo = mensajes.find((m) => m.tipo === 'rechazo')?.regla || null;
        await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo, respuesta: crudo(respuesta), observaciones: mensajes.map((m) => ({ code: m.regla, msg: m.texto })) });
        log.error('dian: documento rechazado', { route: 'fiscal/dian', orgId: ctx.orgId, intento: intento.id, reglas: mensajes.map((m) => m.regla) });
        return { tipo: 'rechazado', mensaje, codigo: codigo ?? undefined };
    }, { esperaMaxMs: 12_000, leaseS: 150 });
}

// ── Set de pruebas de habilitación ───────────────────────────────────────────

export interface EstadoEnvioPrueba extends EnvioDePrueba {
    /** null = la DIAN todavía no termina de validarlo. */
    aceptado: boolean | null;
    /** Mensaje para el usuario si no fue aceptado. */
    mensaje: string | null;
}

/**
 * Arma, firma y envía el set de pruebas con los datos de la organización (solo
 * habilitación). Los números del rango de pruebas que usa quedan reservados en
 * la secuencia: una factura de habilitación emitida después no los repite.
 */
export async function enviarSetDePruebasOrg(ctx: ContextoDian, cantidades: CantidadesSet, testSetId: string, opts: OpcionesLlamada = {}): Promise<EnvioDePrueba[]> {
    if (ctx.entorno !== 'homologacion') throw new RailNoDisponibleError('El set de pruebas solo se envía en el ambiente de habilitación de la DIAN.');
    const kF = claveSecuencia(ctx.entorno, { prefijo: ctx.resolucion.prefijo, clase: 'factura' });
    const kN = claveSecuencia(ctx.entorno, { prefijo: ctx.ajustes.prefijoNotas, clase: 'nota_credito' });
    const kD = claveSecuencia(ctx.entorno, { prefijo: ctx.ajustes.prefijoNotas, clase: 'nota_debito' });
    const firmante = { cadena: ctx.cadena, llavePem: ctx.credencial.keyPem };
    const lease = { esperaMaxMs: 5_000, leaseS: 600 };
    return conSecuencia(ctx.orgId, kF, () => conSecuencia(ctx.orgId, kN, () => conSecuencia(ctx.orgId, kD, async () => {
        const numeroFactura = await siguienteNumero(ctx.orgId, kF, ctx.resolucion.desde);
        const numeroNota = Math.max(await siguienteNumero(ctx.orgId, kN, 1), await siguienteNumero(ctx.orgId, kD, 1));
        const docs = armarSetDePruebas({
            emisor: ctx.emisor, resolucion: ctx.resolucion, prefijoNotas: ctx.ajustes.prefijoNotas, softwareId: ctx.ajustes.softwareId,
            claves: ctx.claves, cantidades, numeroFactura, numeroNota, ahora: new Date(Date.now() - ADELANTO_RELOJ_MS),
        });
        const notas = cantidades.notasCredito + cantidades.notasDebito;
        await anotarUltimoAutorizado(ctx.orgId, kF, numeroFactura + cantidades.facturas - 1);
        if (notas) {
            await anotarUltimoAutorizado(ctx.orgId, kN, numeroNota + notas - 1);
            await anotarUltimoAutorizado(ctx.orgId, kD, numeroNota + notas - 1);
        }
        const envios: EnvioDePrueba[] = [];
        for (const s of docs) {
            try {
                envios.push(await enviarDocumentoDePrueba(s, firmante, testSetId, opts));
            } catch (error) {
                if (error instanceof RailDatosError) throw error;
                log.error('dian: falló un envío del set de pruebas', { route: 'fiscal/dian', orgId: ctx.orgId, documento: s.id, err: error });
                envios.push({ clase: s.clase, id: s.id, cufe: s.cufe, zipKey: '', error: 'La DIAN no respondió a este envío.' });
            }
        }
        return envios;
    }, lease), lease), lease);
}

/** Cómo va cada envío del set (GetStatusZip). */
export async function estadoSetDePruebasOrg(ctx: ContextoDian, envios: EnvioDePrueba[], opts: OpcionesLlamada = {}): Promise<EstadoEnvioPrueba[]> {
    const firmante = { cadena: ctx.cadena, llavePem: ctx.credencial.keyPem };
    const out: EstadoEnvioPrueba[] = [];
    for (const e of envios) {
        if (!e.zipKey) {
            out.push({ ...e, aceptado: false, mensaje: 'La DIAN no recibió este documento.' });
            continue;
        }
        try {
            const [r] = await estadoDeEnvio(e.zipKey, firmante, opts);
            if (!r || (!r.isValid && ['66', '90'].includes(r.statusCode))) {
                out.push({ ...e, aceptado: null, mensaje: null });
            } else if (r.isValid) {
                out.push({ ...e, aceptado: true, mensaje: null });
            } else {
                out.push({ ...e, aceptado: false, mensaje: mensajeRechazo(r.mensajes.map((m) => interpretarMensaje(m, true))) });
            }
        } catch (error) {
            log.error('dian: falló GetStatusZip', { route: 'fiscal/dian', orgId: ctx.orgId, err: error });
            out.push({ ...e, aceptado: null, mensaje: null });
        }
    }
    return out;
}
