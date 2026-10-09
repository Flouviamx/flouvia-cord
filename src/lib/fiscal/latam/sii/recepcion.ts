// Intercambio de DTE del lado del receptor (Chile): lo que llega de un
// proveedor a la casilla de intercambio del negocio se valida, se guarda por
// organización y se responde, firmado con el certificado del negocio y por
// correo al emisor, con un único archivo adjunto por respuesta (instructivo
// técnico, Anexo 4):
//
//   1. al recibir: RespuestaDTE con <RecepcionEnvio> (acuse de recibo del
//      envío y de cada DTE: estado 0 o el motivo del rechazo);
//   2. cuando el negocio decide: RespuestaDTE con <ResultadoDTE> (aceptado,
//      aceptado con discrepancias o rechazado, con su motivo) y, por lo que se
//      recibió conforme, EnvioRecibos (Ley 19.983);
//   3. la misma decisión se registra en el SII (registro de aceptación o
//      reclamo, Ley 20.956): ACD/ERM al aceptar, RCD/RFP/RFT al reclamar.
//
// Dos entradas, el mismo camino: el correo entrante (/api/webhooks/
// sii-intercambio, autenticado con INBOUND_EMAIL_SECRET) y el archivo que el
// negocio sube en Ajustes. Un mismo archivo recibido dos veces no se procesa
// ni se responde dos veces (huella SHA-256 única por organización): un
// reintento del proveedor de correo no duplica respuestas.
//
// En certificación las respuestas van a la casilla del SII
// (SII_dte_intercambio@sii.cl, manual de certificación, paso 3).
//
// Todo en el carril de la organización (regla 30).

import { randomBytes } from 'node:crypto';
import { sql, withOrgTx } from '../../../db';
import { sendEmail } from '../../../email';
import { log } from '../../../log';
import { invalidarTicket } from '../accesos';
import { railConfig } from '../config';
import { credencialActiva, type CredencialActiva } from '../credenciales';
import { RailDatosError, RailNoDisponibleError } from '../errores';
import type { EntornoRail } from '../rieles';
import { autenticar } from './autorizacion';
import {
    CORREO_INTERCAMBIO_SII, SERVICIO_TOKEN, TIPOS_CON_RECIBO, TIPOS_CON_RECLAMO, type AccionReclamo,
} from './constantes';
import { llamarReclamo, mensajeReclamo, parsearRespuestaReclamo, reclamoRegistrado, reclamoTransitorio, sobreReclamo } from './reclamo';
import {
    envioRecibos, leerEnvioRecibido, respuestaRecepcion, respuestaResultado,
    type Contacto, type EstadoResultadoDte, type ReciboMercaderias, type ResultadoComercial,
} from './respuesta-intercambio';
import { bytesLatin1, campo, rutValido } from './texto';
import { SiiFaultError, SiiTransporteError } from './ws';

// ── Casilla de intercambio ───────────────────────────────────────────────────

/**
 * Dominio que recibe el correo de intercambio. Sin él (o sin el secreto del
 * correo entrante) la casilla no existe y la pantalla solo ofrece subir el
 * archivo: una dirección que no recibe sería una promesa falsa (regla 15).
 */
export function dominioIntercambio(): string | null {
    const env = (k: string) => String((import.meta as { env?: Record<string, string | undefined> }).env?.[k] || process.env?.[k] || '').trim();
    const dominio = env('SII_INTERCAMBIO_DOMINIO').toLowerCase();
    if (!env('INBOUND_EMAIL_SECRET') || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) return null;
    return dominio;
}

/** La dirección de la casilla de la organización (la crea la primera vez), o null si no hay correo entrante. */
export async function casillaIntercambio(orgId: string): Promise<string | null> {
    const dominio = dominioIntercambio();
    if (!dominio) return null;
    const token = randomBytes(15).toString('hex');
    const [, rows] = await withOrgTx(orgId,
        sql`insert into fiscal_sii_buzones (org_id, token) values (${orgId}, ${token}) on conflict (org_id) do nothing`,
        sql`select token from fiscal_sii_buzones where org_id = ${orgId}`);
    return rows[0] ? `dte-${rows[0].token}@${dominio}` : null;
}

/** La organización de una dirección de casilla (`dte-<token>@dominio`), o null. */
export async function orgDeCasilla(direccion: string): Promise<string | null> {
    const dominio = dominioIntercambio();
    const m = /^dte-([a-z0-9]{24,40})@([a-z0-9.-]+)$/.exec(String(direccion ?? '').trim().toLowerCase());
    if (!dominio || !m || m[2] !== dominio) return null;
    const [r] = await sql`select cord_sii_buzon_org(${m[1]}) as org_id`;
    return r?.org_id ? String(r.org_id) : null;
}

// ── Datos del negocio receptor ───────────────────────────────────────────────

interface Receptor {
    rut: string;
    nombre: string;
    correo: string | null;
    entorno: EntornoRail;
    credencial: CredencialActiva | null;
}

async function receptor(orgId: string): Promise<Receptor> {
    const entorno = railConfig('sii').entorno;
    const [[[org]], credencial] = await Promise.all([
        withOrgTx(orgId, sql`
            select fiscal_metadata->>'tax_id' as tax_id, rfc, email_contacto,
                   coalesce(nullif(fiscal_metadata->>'legal_name', ''), razon_social, nombre) as nombre
              from orgs where id = ${orgId} limit 1`),
        credencialActiva(orgId, 'sii', entorno),
    ]);
    const rut = rutValido(org?.tax_id || org?.rfc);
    if (!rut) throw new RailDatosError('El RUT de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    return {
        rut,
        nombre: String(org?.nombre ?? ''),
        correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(org?.email_contacto ?? '')) ? String(org.email_contacto) : null,
        entorno,
        credencial: credencial && !credencial.vencida ? credencial : null,
    };
}

const contactoDe = (r: Receptor): Contacto => ({ nombre: r.nombre, mail: r.correo });

/** A quién se responde: en certificación, al SII; si no, a quien mandó el envío (o al correo del emisor del DTE). */
function destinoRespuesta(entorno: EntornoRail, remitente: string | null, correoDte: string | null, explicito?: string | null): string | null {
    const valido = (v: string | null | undefined) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);
    return valido(explicito) ?? (entorno === 'homologacion' ? CORREO_INTERCAMBIO_SII : valido(remitente) ?? valido(correoDte));
}

async function siguienteIdRespuesta(orgId: string): Promise<number> {
    const [[r]] = await withOrgTx(orgId, sql`select nextval('fiscal_sii_respuesta_seq') as n`);
    return Number(r.n);
}

const NOMBRE_ARCHIVO: Record<'recepcion' | 'resultado' | 'recibos', string> = {
    recepcion: 'RespuestaRecepcion', resultado: 'RespuestaResultado', recibos: 'EnvioRecibos',
};

/** Guarda la respuesta y la manda por correo (un adjunto por correo). Nunca lanza por el correo. */
async function guardarYEnviar(orgId: string, recepcionId: string, tipo: 'recepcion' | 'resultado' | 'recibos', idRespuesta: number, xml: string, destino: string | null, emisor: Receptor): Promise<{ id: string; enviada: boolean }> {
    const [[fila]] = await withOrgTx(orgId, sql`
        insert into fiscal_sii_respuestas (org_id, recepcion_id, tipo, id_respuesta, xml, destinatario)
        values (${orgId}, ${recepcionId}, ${tipo}, ${idRespuesta}, ${xml}, ${destino})
        returning id`);
    const id = String(fila.id);
    if (!destino) return { id, enviada: false };
    return { id, enviada: await enviarRespuesta(orgId, id, tipo, idRespuesta, xml, destino, emisor) };
}

async function enviarRespuesta(orgId: string, id: string, tipo: 'recepcion' | 'resultado' | 'recibos', idRespuesta: number, xml: string, destino: string, emisor: Receptor): Promise<boolean> {
    const asunto = tipo === 'recibos'
        ? `Recibo de mercaderías o servicios (Ley 19.983) - RUT ${emisor.rut}`
        : `Respuesta de intercambio de DTE - RUT ${emisor.rut}`;
    const r = await sendEmail({
        orgId, operation: 'sii_intercambio', to: destino, subject: asunto,
        fromName: emisor.nombre ? `${campo(emisor.nombre, 60)} vía Cord` : null,
        replyTo: emisor.correo,
        html: `<p>${tipo === 'recibos' ? 'Se adjunta el recibo electrónico de las mercaderías o servicios' : 'Se adjunta la respuesta de intercambio de documentos tributarios electrónicos'} de ${campo(emisor.nombre, 100).replace(/[<>&]/g, '')} (RUT ${emisor.rut}).</p>`,
        attachments: [{ filename: `${NOMBRE_ARCHIVO[tipo]}_${idRespuesta}.xml`, content: bytesLatin1(xml), contentType: 'application/xml' }],
    }).catch((err) => ({ sent: false as const, error: String((err as Error)?.message ?? err) }));
    await withOrgTx(orgId, sql`
        update fiscal_sii_respuestas
           set enviado_at = ${r.sent ? new Date().toISOString() : null}, error_envio = ${r.sent ? null : 'No se pudo enviar el correo.'}, destinatario = ${destino}
         where id = ${id} and org_id = ${orgId}`);
    if (!r.sent) log.error('sii: no se pudo enviar una respuesta de intercambio', { route: 'fiscal/sii-intercambio', orgId, tipo });
    return !!r.sent;
}

// ── Recepción ────────────────────────────────────────────────────────────────

export interface ResultadoRecepcion {
    recepcionId: string;
    /** El mismo archivo ya se había recibido: no se procesa ni se responde otra vez. */
    repetido: boolean;
    estado: number;
    glosa: string;
    documentos: number;
    /** El acuse de recibo quedó generado y firmado. */
    respondido: boolean;
    enviado: boolean;
    /** Por qué no se generó el acuse (sin certificado, sin el RUT del emisor). */
    pendiente?: string;
}

/**
 * Recibe un archivo de intercambio: lo valida, guarda el envío y sus DTE y
 * responde el acuse de recibo. Un archivo repetido devuelve lo ya hecho.
 */
export async function recibirEnvio(orgId: string, entrada: { bytes: Uint8Array; nombreArchivo: string | null; origen: 'correo' | 'manual'; remitente?: string | null; destino?: string | null }, ahora = new Date()): Promise<ResultadoRecepcion> {
    const r = await receptor(orgId);
    const envio = leerEnvioRecibido(entrada.bytes, r.rut);
    const nombre = campo(entrada.nombreArchivo || 'envio.xml', 80) || 'envio.xml';
    const remitente = entrada.remitente && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entrada.remitente.trim()) ? entrada.remitente.trim().toLowerCase() : null;

    const [[nueva]] = await withOrgTx(orgId, sql`
        insert into fiscal_sii_recepciones (org_id, entorno, origen, remitente, nombre_archivo, sha256, xml, set_id, digest,
                                            rut_emisor, rut_envia, rut_receptor, estado_recep_env, glosa, recibido_at)
        values (${orgId}, ${r.entorno}, ${entrada.origen}, ${remitente}, ${nombre}, ${envio.sha256},
                ${Buffer.from(entrada.bytes).toString('latin1').replace(/\u0000/g, '')}, ${envio.setId || null}, ${envio.digest},
                ${envio.rutEmisor}, ${envio.rutEnvia}, ${envio.rutReceptor}, ${envio.estado}, ${envio.glosa}, ${ahora.toISOString()})
        on conflict (org_id, sha256) do nothing
        returning id, cod_envio`);
    if (!nueva) {
        const [[previa]] = await withOrgTx(orgId, sql`
            select r.id, r.estado_recep_env, r.glosa,
                   (select count(*) from fiscal_sii_dte_recibidos d where d.recepcion_id = r.id and d.org_id = r.org_id) as docs,
                   exists (select 1 from fiscal_sii_respuestas s where s.recepcion_id = r.id and s.org_id = r.org_id and s.tipo = 'recepcion') as respondido,
                   exists (select 1 from fiscal_sii_respuestas s where s.recepcion_id = r.id and s.org_id = r.org_id and s.tipo = 'recepcion' and s.enviado_at is not null) as enviado
              from fiscal_sii_recepciones r
             where r.org_id = ${orgId} and r.sha256 = ${envio.sha256}`);
        return {
            recepcionId: String(previa.id), repetido: true, estado: Number(previa.estado_recep_env), glosa: String(previa.glosa),
            documentos: Number(previa.docs), respondido: !!previa.respondido, enviado: !!previa.enviado,
        };
    }
    const recepcionId = String(nueva.id);
    const codEnvio = Number(nueva.cod_envio);

    // Cada DTE una sola vez por emisor, tipo y folio: el segundo es "DTE Repetido".
    for (const d of envio.documentos) {
        const insertar = (estado: number, glosa: string) => withOrgTx(orgId, sql`
            insert into fiscal_sii_dte_recibidos (org_id, recepcion_id, tipo_dte, folio, fecha_emision, rut_emisor, razon_social_emisor,
                                                  correo_emisor, rut_receptor, monto_total, monto_neto, monto_exento, iva, dte_xml,
                                                  estado_recep_dte, glosa_recep)
            values (${orgId}, ${recepcionId}, ${d.tipo}, ${d.folio}, ${d.fechaEmision}::date, ${d.rutEmisor}, ${d.razonSocialEmisor || null},
                    ${d.correoEmisor}, ${d.rutReceptor}, ${d.montoTotal}, ${d.neto}, ${d.exento}, ${d.iva}, ${d.xml}, ${estado}, ${glosa})
            on conflict (org_id, rut_emisor, tipo_dte, folio) where estado_recep_dte = 0 do nothing
            returning id`);
        const [filas] = await insertar(d.estado, d.glosa);
        if (!filas[0]) {
            d.estado = 4;
            d.glosa = 'DTE No Recibido - DTE Repetido';
            await insertar(d.estado, d.glosa);
        }
    }

    const base = {
        recepcionId, repetido: false, estado: envio.estado, glosa: envio.glosa, documentos: envio.documentos.length,
    };
    if (!r.credencial) return { ...base, respondido: false, enviado: false, pendiente: 'Sube el certificado digital del SII para firmar el acuse de recibo.' };
    if (!envio.rutEmisor) return { ...base, respondido: false, enviado: false, pendiente: 'El archivo no se pudo leer: no se sabe a quién responder.' };
    const idRespuesta = await siguienteIdRespuesta(orgId);
    const xml = respuestaRecepcion(
        { rutResponde: r.rut, rutRecibe: envio.rutEmisor, idRespuesta, contacto: contactoDe(r) },
        { nombreArchivo: nombre, recibidoEn: ahora, codEnvio, envio },
        ahora, { certPem: r.credencial.certPem, keyPem: r.credencial.keyPem });
    const destino = destinoRespuesta(r.entorno, remitente, envio.documentos[0]?.correoEmisor ?? null, entrada.destino);
    const s = await guardarYEnviar(orgId, recepcionId, 'recepcion', idRespuesta, xml, destino, r);
    return { ...base, respondido: true, enviado: s.enviada };
}

// ── Decisión comercial ───────────────────────────────────────────────────────

export type ResultadoDecision = 'aceptado' | 'aceptado_reparos' | 'rechazado';

export interface Decision {
    dteId: string;
    resultado: ResultadoDecision;
    /** Motivo del rechazo o de la discrepancia (obligatorio en esos casos). */
    motivo?: string | null;
    /** Lugar donde se recibieron las mercaderías o servicios: con él va el recibo (Ley 19.983). */
    recinto?: string | null;
    /** Reclamo ante el SII: RCD (contenido), RFP (falta parcial) o RFT (falta total). Por defecto RCD. */
    reclamo?: 'RCD' | 'RFP' | 'RFT';
}

export interface ResultadoDecisiones {
    decididos: number;
    respuestaEnviada: boolean;
    recibosEnviados: boolean;
    registroSii: { dteId: string; accion: AccionReclamo; registrado: boolean; mensaje: string }[];
}

const ESTADO_RESULTADO: Record<ResultadoDecision, EstadoResultadoDte> = { aceptado: 0, aceptado_reparos: 1, rechazado: 2 };

/**
 * Registra la decisión del negocio sobre DTE recibidos de UN envío y la
 * responde: resultado comercial, recibos de lo recibido conforme y el
 * registro de aceptación o reclamo en el SII. Una decisión no se cambia.
 */
export async function decidirDocumentos(orgId: string, recepcionId: string, decisiones: Decision[], opts: { destino?: string | null; registrarEnSii?: boolean } = {}, ahora = new Date()): Promise<ResultadoDecisiones> {
    if (!decisiones.length) throw new RailDatosError('Indica qué hacer con al menos un documento.');
    const r = await receptor(orgId);
    if (!r.credencial) throw new RailNoDisponibleError('Sube el certificado digital del SII para firmar la respuesta.');
    const clave = { certPem: r.credencial.certPem, keyPem: r.credencial.keyPem };
    const [[rec]] = await withOrgTx(orgId, sql`
        select id, cod_envio, rut_emisor, remitente from fiscal_sii_recepciones where id = ${recepcionId} and org_id = ${orgId}`);
    if (!rec || !rec.rut_emisor) throw new RailDatosError('Envío no encontrado.');

    const resultados: (ResultadoComercial & { dteId: string; decision: Decision })[] = [];
    const recibos: ReciboMercaderias[] = [];
    let correoDte: string | null = null;
    for (const d of decisiones) {
        if (!['aceptado', 'aceptado_reparos', 'rechazado'].includes(d.resultado)) throw new RailDatosError('Decisión no válida.');
        const motivo = campo(d.motivo, 200);
        if (d.resultado !== 'aceptado' && !motivo) throw new RailDatosError('Un rechazo o una aceptación con discrepancias necesita su motivo (Ley 19.983).');
        const recinto = campo(d.recinto, 80);
        const [[doc]] = await withOrgTx(orgId, sql`
            update fiscal_sii_dte_recibidos
               set resultado = ${d.resultado}, resultado_motivo = ${motivo || null}, resultado_at = now(),
                   recinto = ${d.resultado !== 'rechazado' && recinto ? recinto : null}
             where id = ${d.dteId} and org_id = ${orgId} and recepcion_id = ${recepcionId}
               and resultado is null and estado_recep_dte = 0
            returning id, tipo_dte, folio, fecha_emision::text as fecha_emision, rut_emisor, rut_receptor, monto_total, correo_emisor`);
        // Ya decidido (otra pestaña) o no recibido conforme: se responde por los demás.
        if (!doc) continue;
        correoDte ??= doc.correo_emisor ? String(doc.correo_emisor) : null;
        const base = {
            tipo: Number(doc.tipo_dte), folio: Number(doc.folio), fechaEmision: String(doc.fecha_emision).slice(0, 10),
            rutEmisor: String(doc.rut_emisor), rutReceptor: String(doc.rut_receptor), montoTotal: Number(doc.monto_total),
        };
        resultados.push({ ...base, codEnvio: Number(rec.cod_envio), estado: ESTADO_RESULTADO[d.resultado], motivo, dteId: String(doc.id), decision: d });
        if (d.resultado !== 'rechazado' && recinto && TIPOS_CON_RECIBO.includes(base.tipo)) {
            recibos.push({ ...base, recinto, rutFirma: r.credencial.identificador });
        }
    }

    if (!resultados.length) throw new RailDatosError('Esos documentos ya tienen una decisión o no se recibieron conforme.');
    const destino = destinoRespuesta(r.entorno, rec.remitente ? String(rec.remitente) : null, correoDte, opts.destino);
    const idResultado = await siguienteIdRespuesta(orgId);
    const xmlResultado = respuestaResultado({ rutResponde: r.rut, rutRecibe: String(rec.rut_emisor), idRespuesta: idResultado, contacto: contactoDe(r) }, resultados, ahora, clave);
    const enviada = await guardarYEnviar(orgId, recepcionId, 'resultado', idResultado, xmlResultado, destino, r);
    let recibosEnviados = false;
    if (recibos.length) {
        const idRecibos = await siguienteIdRespuesta(orgId);
        const xmlRecibos = envioRecibos({ rutResponde: r.rut, rutRecibe: String(rec.rut_emisor), idEnvio: idRecibos, contacto: contactoDe(r) }, recibos, ahora, clave);
        recibosEnviados = (await guardarYEnviar(orgId, recepcionId, 'recibos', idRecibos, xmlRecibos, destino, r)).enviada;
        await withOrgTx(orgId, sql`
            update fiscal_sii_dte_recibidos set recibo_at = now()
             where org_id = ${orgId} and recepcion_id = ${recepcionId} and id = any(${resultados.filter((x) => x.decision.resultado !== 'rechazado' && x.decision.recinto).map((x) => x.dteId)}::uuid[])`);
    }

    const registroSii: ResultadoDecisiones['registroSii'] = [];
    if (opts.registrarEnSii !== false) {
        for (const x of resultados) {
            if (!TIPOS_CON_RECLAMO.includes(x.tipo)) continue;
            const acciones: AccionReclamo[] = x.decision.resultado === 'rechazado'
                ? [x.decision.reclamo ?? 'RCD']
                : ['ACD', ...(recibos.some((rb) => rb.tipo === x.tipo && rb.folio === x.folio && rb.rutEmisor === x.rutEmisor) ? ['ERM' as const] : [])];
            for (const accion of acciones) {
                const res = await registrarAccion(orgId, r, { rutEmisor: x.rutEmisor, tipo: x.tipo, folio: x.folio }, accion);
                registroSii.push({ dteId: x.dteId, accion, ...res });
                await withOrgTx(orgId, sql`
                    update fiscal_sii_dte_recibidos
                       set reclamo_accion = ${accion}, reclamo_codigo = ${res.codigo}, reclamo_mensaje = ${res.mensaje}, reclamo_at = now()
                     where id = ${x.dteId} and org_id = ${orgId}`);
                if (!res.registrado) break;
            }
        }
    }
    return { decididos: resultados.length, respuestaEnviada: enviada.enviada, recibosEnviados, registroSii };
}

/** Registro de aceptación o reclamo de un DTE en el SII, con renovación del token si el SII lo da por inválido. */
async function registrarAccion(orgId: string, r: Receptor, doc: { rutEmisor: string; tipo: number; folio: number }, accion: AccionReclamo): Promise<{ registrado: boolean; codigo: number | null; mensaje: string }> {
    const acceso = { orgId, entorno: r.entorno, credencial: r.credencial! };
    const sobre = sobreReclamo('ingresarAceptacionReclamoDoc', doc, accion);
    try {
        const token = await autenticar(acceso);
        let resp;
        try {
            resp = await parsearRespuestaReclamo(await llamarReclamo(r.entorno, token, sobre), 'ingresarAceptacionReclamoDoc');
        } catch (error) {
            // Un token vencido se ve como un Fault o una respuesta sin cuerpo: uno nuevo y otra vez.
            if (!(error instanceof SiiFaultError) && !(error instanceof SiiTransporteError)) throw error;
            await invalidarTicket({ orgId, rail: 'sii', entorno: r.entorno, servicio: SERVICIO_TOKEN });
            resp = await parsearRespuestaReclamo(await llamarReclamo(r.entorno, await autenticar(acceso, { forzar: true }), sobre), 'ingresarAceptacionReclamoDoc');
        }
        if (reclamoTransitorio(resp.codigo)) return { registrado: false, codigo: resp.codigo, mensaje: mensajeReclamo(resp.codigo) };
        return { registrado: reclamoRegistrado(resp.codigo), codigo: resp.codigo, mensaje: mensajeReclamo(resp.codigo) };
    } catch (error) {
        log.error('sii: no se pudo registrar la aceptación o el reclamo', { route: 'fiscal/sii-intercambio', orgId, accion, err: error });
        return { registrado: false, codigo: null, mensaje: 'El SII no respondió. Reintenta el registro en unos minutos o hazlo en el sitio del SII.' };
    }
}

/** Reintenta el registro en el SII de un DTE ya decidido cuyo registro falló. */
export async function reintentarRegistro(orgId: string, dteId: string): Promise<{ registrado: boolean; mensaje: string }> {
    const r = await receptor(orgId);
    if (!r.credencial) throw new RailNoDisponibleError('Sube el certificado digital del SII para registrar la acción.');
    const [[doc]] = await withOrgTx(orgId, sql`
        select id, tipo_dte, folio, rut_emisor, resultado, reclamo_accion, reclamo_codigo, recibo_at
          from fiscal_sii_dte_recibidos where id = ${dteId} and org_id = ${orgId} and resultado is not null`);
    if (!doc) throw new RailDatosError('Documento no encontrado o sin decisión.');
    if (!TIPOS_CON_RECLAMO.includes(Number(doc.tipo_dte))) throw new RailDatosError('El SII solo registra aceptaciones y reclamos de facturas.');
    const accion = (doc.reclamo_accion as AccionReclamo | null) ?? (doc.resultado === 'rechazado' ? 'RCD' : 'ACD');
    const res = await registrarAccion(orgId, r, { rutEmisor: String(doc.rut_emisor), tipo: Number(doc.tipo_dte), folio: Number(doc.folio) }, accion);
    await withOrgTx(orgId, sql`
        update fiscal_sii_dte_recibidos set reclamo_accion = ${accion}, reclamo_codigo = ${res.codigo}, reclamo_mensaje = ${res.mensaje}, reclamo_at = now()
         where id = ${dteId} and org_id = ${orgId}`);
    return res;
}

/** Reenvía por correo una respuesta ya firmada (la misma, byte a byte). */
export async function reenviarRespuesta(orgId: string, respuestaId: string, destino: string): Promise<boolean> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(destino ?? '').trim())) throw new RailDatosError('Indica un correo válido.');
    const r = await receptor(orgId);
    const [[s]] = await withOrgTx(orgId, sql`select id, tipo, id_respuesta, xml from fiscal_sii_respuestas where id = ${respuestaId} and org_id = ${orgId}`);
    if (!s) throw new RailDatosError('Respuesta no encontrada.');
    return enviarRespuesta(orgId, String(s.id), s.tipo, Number(s.id_respuesta), String(s.xml), destino.trim().toLowerCase(), r);
}

// ── Lectura para la pantalla ─────────────────────────────────────────────────

export interface VistaRecepcion {
    id: string;
    recibidoAt: string;
    origen: string;
    remitente: string | null;
    nombreArchivo: string | null;
    rutEmisor: string | null;
    estado: number;
    glosa: string;
    documentos: {
        id: string; tipo: number; folio: number; fechaEmision: string; rutEmisor: string; razonSocialEmisor: string | null;
        montoTotal: number; estado: number; glosa: string; resultado: string | null; resultadoMotivo: string | null;
        recibo: boolean; reclamoAccion: string | null; reclamoMensaje: string | null; reclamoRegistrado: boolean;
    }[];
    respuestas: { id: string; tipo: string; idRespuesta: number; destinatario: string | null; enviadoAt: string | null; errorEnvio: string | null }[];
}

export async function listarRecepciones(orgId: string, limite = 30): Promise<VistaRecepcion[]> {
    const [recs, docs, resp] = await withOrgTx(orgId,
        sql`select id, recibido_at, origen, remitente, nombre_archivo, rut_emisor, estado_recep_env, glosa
              from fiscal_sii_recepciones where org_id = ${orgId} order by recibido_at desc limit ${limite}`,
        sql`select d.id, d.recepcion_id, d.tipo_dte, d.folio, d.fecha_emision::text as fecha_emision, d.rut_emisor, d.razon_social_emisor,
                   d.monto_total, d.estado_recep_dte, d.glosa_recep, d.resultado, d.resultado_motivo, d.recibo_at, d.reclamo_accion,
                   d.reclamo_mensaje, d.reclamo_codigo
              from fiscal_sii_dte_recibidos d
              join (select id from fiscal_sii_recepciones where org_id = ${orgId} order by recibido_at desc limit ${limite}) r on r.id = d.recepcion_id
             where d.org_id = ${orgId} order by d.created_at`,
        sql`select s.id, s.recepcion_id, s.tipo, s.id_respuesta, s.destinatario, s.enviado_at, s.error_envio
              from fiscal_sii_respuestas s
              join (select id from fiscal_sii_recepciones where org_id = ${orgId} order by recibido_at desc limit ${limite}) r on r.id = s.recepcion_id
             where s.org_id = ${orgId} order by s.created_at`);
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
    return recs.map((r) => ({
        id: String(r.id), recibidoAt: iso(r.recibido_at) ?? '', origen: String(r.origen), remitente: r.remitente ?? null,
        nombreArchivo: r.nombre_archivo ?? null, rutEmisor: r.rut_emisor ?? null, estado: Number(r.estado_recep_env), glosa: String(r.glosa),
        documentos: docs.filter((d) => String(d.recepcion_id) === String(r.id)).map((d) => ({
            id: String(d.id), tipo: Number(d.tipo_dte), folio: Number(d.folio), fechaEmision: String(d.fecha_emision).slice(0, 10),
            rutEmisor: String(d.rut_emisor), razonSocialEmisor: d.razon_social_emisor ?? null, montoTotal: Number(d.monto_total),
            estado: Number(d.estado_recep_dte), glosa: String(d.glosa_recep), resultado: d.resultado ?? null,
            resultadoMotivo: d.resultado_motivo ?? null, recibo: !!d.recibo_at, reclamoAccion: d.reclamo_accion ?? null,
            reclamoMensaje: d.reclamo_mensaje ?? null, reclamoRegistrado: d.reclamo_codigo === 0 || d.reclamo_codigo === 7,
        })),
        respuestas: resp.filter((s) => String(s.recepcion_id) === String(r.id)).map((s) => ({
            id: String(s.id), tipo: String(s.tipo), idRespuesta: Number(s.id_respuesta), destinatario: s.destinatario ?? null,
            enviadoAt: iso(s.enviado_at), errorEnvio: s.error_envio ?? null,
        })),
    }));
}

/** El XML de una respuesta firmada, para descargarlo. */
export async function xmlRespuesta(orgId: string, respuestaId: string): Promise<{ nombre: string; bytes: Buffer } | null> {
    const [[s]] = await withOrgTx(orgId, sql`select tipo, id_respuesta, xml from fiscal_sii_respuestas where id = ${respuestaId} and org_id = ${orgId}`);
    if (!s) return null;
    return { nombre: `${NOMBRE_ARCHIVO[s.tipo as 'recepcion']}_${s.id_respuesta}.xml`, bytes: bytesLatin1(String(s.xml)) };
}
