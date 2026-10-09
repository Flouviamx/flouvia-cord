// Autorización de la NFS-e ante la Sefin Nacional con la máquina de estados
// del marco común (latam/comprobantes.ts).
//
// POST /nfse es SÍNCRONO: devuelve la NFS-e generada en la misma llamada. Lo
// que no es síncrono es la certeza: el pedido puede salir, la Sefin generar la
// NFS-e y la respuesta perderse. La identidad de la DPS es la que lo resuelve:
// su Id (municipio + CNPJ/CPF + serie + número) es único en el sistema
// nacional [ANEXO_I E0014], y GET /dps/{id} devuelve la chave de la NFS-e que
// generó. Por eso:
//
//   1. Una serie tiene un solo pedido en vuelo (lease). Dentro del lease, los
//      intentos colgados de esa serie se resuelven ANTES de numerar otro.
//   2. El número de la DPS lo elige Cord: el mayor que esa serie usó (en
//      cualquier estado: nunca se reutiliza uno) + 1, o el número inicial que
//      el negocio configuró. Se reclama en la base antes de enviar.
//   3. Sin respuesta legible, el intento queda `incierto` y se resuelve
//      consultando GET /dps/{id} (+ GET /nfse/{chave}): si la NFS-e existe y
//      encapsula ESTA DPS, es nuestra (autorizado); si encapsula otra, el
//      número lo usó otro sistema (descartado); si no existe y el pedido ya es
//      viejo, no se generó (descartado). Nunca se reenvía a ciegas.
//   4. E0014 (la DPS ya generó una NFS-e) no es un rechazo: es la misma
//      consulta.

import { sql, withOrgTx } from '../../../db';
import { log } from '../../../log';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, sinResolverDeSecuencia, type IntentoRail,
} from '../comprobantes';
import { credencialActiva, leerAjustes, marcarVerificacion, type CredencialActiva } from '../credenciales';
import { MSG_INCIERTO, RailDatosError, RailNoDisponibleError, RailTransitorioError } from '../errores';
import type { EntornoRail } from '../rieles';
import { FALTANTE_ES, faltantesAjustes, type AjustesNfse } from './ajustes';
import { certificadoCobreDocumento } from './certificado';
import { EVENTO_CANCELAMENTO } from './constantes';
import { comXmlAssinado, conNumero, documentoFederal, type DocumentoFederal, type SolicitudNfse } from './dps';
import { CODIGO_DPS_DUPLICADA, deCertificado, mensajeCodigo, mensajeRechazo, normalizarCodigo, tieneCodigo } from './erros';
import { pedidoCancelamento, pedidoCancelamentoAssinado } from './evento';
import { diferencaValorLiquido, lerNfse, nfseCorresponde, type NfseLida } from './nfse';
import {
    alertas, ambienteCoincide, chamarSefin, chaveValida, compactar, descompactar, mensagens, NfseTransporteError,
    type MensagemProcessamento, type RespostaSefin,
} from './sefin';


/** Tipo de secuencia en `fiscal_rail_*`: la numeración de la DPS es por serie. */
export const TIPO_SEQUENCIA = 'DPS';

/** Un pedido enviado y sin NFS-e se da por no generado después de esto (la Sefin responde en segundos). */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 600;

export interface ContextoNfse {
    orgId: string;
    entorno: EntornoRail;
    /** CNPJ/CPF del negocio, el que firma y emite. */
    documento: DocumentoFederal;
    ajustes: AjustesNfse & Required<Pick<AjustesNfse, 'municipio' | 'serie' | 'opSimpNac' | 'servico'>>;
    credencial: CredencialActiva;
    /** El perfil de retención que representa el ISS retenido, con su nombre y tasa vigentes. */
    retencaoIss: { nome: string; tasa: number } | null;
}

const MSG_NO_DISPONIBLE = 'La NFS-e no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';
const MSG_SEFIN_CAIDA = 'El Sistema Nacional NFS-e no está respondiendo en este momento. Reintenta en unos minutos.';

/** ¿La credencial cubre este CNPJ/CPF? `identificador` guarda el titular del certificado. */
export function credencialCobre(identificador: string, documento: DocumentoFederal): boolean {
    const tipo = identificador.length === 11 ? 'cpf' : 'cnpj';
    return certificadoCobreDocumento({ tipo, numero: identificador }, documento.numero);
}

async function perfilRetencao(orgId: string, id: string | undefined): Promise<{ nome: string; tasa: number } | null> {
    if (!id) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select nombre, tasa from impuestos
         where id = ${id} and org_id = ${orgId} and kind = 'retencion' and activo = true
         limit 1`);
    const r = rows[0];
    return r ? { nome: String(r.nombre), tasa: Number(r.tasa) / 100 } : null;
}

/**
 * Lo que hace falta para hablar con la Sefin por esta organización. Lanza
 * RailNoDisponibleError (mensaje apto para el usuario) si falta algo.
 */
export async function contextoNfse(orgId: string, entorno: EntornoRail, documentoEmisor: string | null | undefined): Promise<ContextoNfse> {
    const [ajustes, credencial] = await Promise.all([
        leerAjustes<AjustesNfse>(orgId, 'nfse'),
        credencialActiva(orgId, 'nfse', entorno),
    ]);
    const faltan = faltantesAjustes(ajustes);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los ajustes de la NFS-e (${faltan.map((f) => FALTANTE_ES[f]).join(', ')}) en Ajustes › Datos fiscales.`);
    const documento = documentoFederal(documentoEmisor);
    if (!documento) throw new RailDatosError('El CNPJ (o CPF) de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital ICP-Brasil de tu negocio en Ajustes › Datos fiscales para emitir la NFS-e.');
    if (credencial.vencida) throw new RailNoDisponibleError('El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales.');
    if (!credencialCobre(credencial.identificador, documento)) {
        throw new RailNoDisponibleError('El certificado digital está a nombre de otro CNPJ/CPF. Sube el certificado de tu negocio en Ajustes › Datos fiscales.');
    }
    return {
        orgId, entorno, documento, credencial,
        ajustes: ajustes as ContextoNfse['ajustes'],
        retencaoIss: await perfilRetencao(orgId, ajustes.retencaoIssId),
    };
}

/** Lo que hace falta para CONSULTAR (resolver un intento o cancelar): solo la credencial. */
export type ContextoConsulta = Pick<ContextoNfse, 'orgId' | 'entorno' | 'credencial'>;

export async function contextoConsulta(orgId: string, entorno: EntornoRail): Promise<ContextoConsulta> {
    const credencial = await credencialActiva(orgId, 'nfse', entorno);
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital ICP-Brasil de tu negocio en Ajustes › Datos fiscales.');
    return { orgId, entorno, credencial };
}

const claveSecuencia = (ctx: Pick<ContextoNfse, 'entorno'>, serie: string) => ({ rail: 'nfse' as const, entorno: ctx.entorno, serie, tipo: TIPO_SEQUENCIA });

/**
 * Próximo número de la serie: el mayor que Cord usó en ella, en cualquier
 * estado (un número que pudo llegar a la Sefin nunca se reutiliza), + 1; o el
 * número inicial configurado si es mayor.
 */
export async function proximoNumero(ctx: ContextoNfse, serie: string): Promise<number> {
    const [rows] = await withOrgTx(ctx.orgId, sql`
        select greatest(
                 coalesce((select max(numero) from fiscal_rail_comprobantes
                            where org_id = ${ctx.orgId} and rail = 'nfse' and entorno = ${ctx.entorno}
                              and serie = ${serie} and tipo = ${TIPO_SEQUENCIA}), 0),
                 coalesce((select ultimo_autorizado from fiscal_rail_secuencias
                            where org_id = ${ctx.orgId} and rail = 'nfse' and entorno = ${ctx.entorno}
                              and serie = ${serie} and tipo = ${TIPO_SEQUENCIA}), 0)
               )::bigint as ultimo`);
    const ultimo = Number(rows[0]?.ultimo ?? 0);
    return Math.max(ultimo + 1, Number(ctx.ajustes.numeroInicial) || 1);
}

/** Observaciones (apto para el usuario) con las que se registra un intento autorizado. */
function observacoes(nfse: NfseLida, s: SolicitudNfse, avisos: MensagemProcessamento[]) {
    const out: { code: number; codigo?: string; mensaje: string }[] = avisos.map((a) => ({
        code: Number(String(a.codigo).replace(/\D/g, '')) || 0,
        codigo: normalizarCodigo(a.codigo),
        mensaje: `El Sistema Nacional NFS-e generó la nota con un aviso (código ${normalizarCodigo(a.codigo) || 'sin código'}).`,
    }));
    const dif = diferencaValorLiquido(nfse, s);
    if (dif) {
        out.push({
            code: 0,
            mensaje: `El valor líquido de la NFS-e (R$ ${dif.nfse}) difiere del total del documento (R$ ${dif.cord}): la alícuota del ISS retenido que aplicó el municipio no es la del perfil de retención. Ajusta el perfil para las próximas notas.`,
        });
    }
    return out;
}

function respuestaGuardada(nfse: NfseLida, xml: string, extra: Record<string, unknown> = {}) {
    return { nfse, xml, ...extra };
}

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

const MSG_DESCARTADO = 'El Sistema Nacional NFS-e no generó esta NFS-e. Puedes volver a emitirla (con otro número de DPS) o descartarla.';

async function descartar(ctx: ContextoConsulta, intento: IntentoRail, mensaje: string, respuesta?: Record<string, unknown>): Promise<'descartado'> {
    if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje, ...(respuesta ? { respuesta } : {}) })) {
        await liberarDocumento(ctx.orgId, intento.documentoId, 'nfse', MSG_DESCARTADO);
    }
    return 'descartado';
}

/** La NFS-e de una chave, leída. Null si la Sefin no la devuelve. */
async function buscarNfse(ctx: ContextoConsulta, chave: string): Promise<{ nfse: NfseLida; xml: string } | null> {
    const r = await chamarSefin(ctx.entorno, ctx.credencial, 'GET', `/nfse/${chave}`);
    if (r.status !== 200 || !r.json) return null;
    const xml = descompactar(r.json.nfseXmlGZipB64);
    const nfse = lerNfse(xml);
    return nfse ? { nfse, xml } : null;
}

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO a la Sefin. Nunca
 * reenvía. Debe llamarse con la serie tomada.
 */
export async function resolverPorConsulta(ctx: ContextoConsulta, recibido: IntentoRail, ahora = Date.now()): Promise<ResultadoResolucion> {
    // Releído dentro del lease: otra instancia pudo resolverlo.
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const sol = intento.solicitud as SolicitudNfse;
    if (!intento.enviadoAt) return descartar(ctx, intento, 'El pedido no llegó a enviarse al Sistema Nacional NFS-e.');
    try {
        const r = await chamarSefin(ctx.entorno, ctx.credencial, 'GET', `/dps/${sol.id}`);
        if (r.status === 200 && chaveValida(r.json?.chaveAcesso)) {
            const encontrada = await buscarNfse(ctx, r.json!.chaveAcesso);
            if (!encontrada) {
                await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
                return 'sin_resolver';
            }
            if (nfseCorresponde(encontrada.nfse, sol)) {
                await resolverIntento(ctx.orgId, intento.id, {
                    estado: 'autorizado',
                    autorizacion: encontrada.nfse.chave,
                    vence: null,
                    respuesta: respuestaGuardada(encontrada.nfse, encontrada.xml, { recuperado: true }),
                    observaciones: observacoes(encontrada.nfse, sol, []),
                });
                await anotarUltimoAutorizado(ctx.orgId, claveSecuencia(ctx, sol.serie), Number(sol.nDPS));
                return 'autorizado';
            }
            // Esa serie y número los usó OTRO sistema del contribuyente.
            log.error('nfse: la DPS reclamada generó otra NFS-e', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id, dps: sol.id });
            return descartar(ctx, intento, 'Esa serie y número de DPS ya generaron otra NFS-e: la serie se está usando desde otro sistema.', { conflicto: true, chave: encontrada.nfse.chave });
        }
        if (r.status === 404) {
            if (ahora - Date.parse(intento.enviadoAt) >= ANTIGUEDAD_PARA_DESCARTAR_S * 1000) {
                return descartar(ctx, intento, 'El Sistema Nacional NFS-e no registró el pedido.', { consulta: 404 });
            }
            await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
            return 'sin_resolver';
        }
        log.error('nfse: consulta de DPS sin resultado', { route: 'fiscal/nfse', orgId: ctx.orgId, status: r.status, erros: mensagens(r.json) });
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    } catch (error) {
        if (error instanceof NfseTransporteError) {
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

const CONFLICTO_PENDIENTE = 'Hay otra NFS-e esperando la confirmación del Sistema Nacional en esta serie. Reintenta en unos minutos.';

/** Interpreta la respuesta de POST /nfse para un intento ya marcado como enviado. */
async function interpretar(ctx: ContextoNfse, intento: IntentoRail, sol: SolicitudNfse, r: RespostaSefin): Promise<ResultadoEmision | 'consultar'> {
    if (r.json && !ambienteCoincide(r.json, ctx.entorno)) {
        log.error('nfse: la respuesta vino de otro ambiente', { route: 'fiscal/nfse', orgId: ctx.orgId, tipoAmbiente: r.json.tipoAmbiente, entorno: ctx.entorno });
        const mensaje = 'La respuesta del Sistema Nacional NFS-e no corresponde al ambiente configurado. Escríbenos a soporte@flouvia.com.';
        await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje, respuesta: { tipoAmbiente: r.json.tipoAmbiente } });
        return { tipo: 'incierto', mensaje };
    }
    if (r.status === 201 && r.json?.nfseXmlGZipB64) {
        let xml: string;
        try { xml = descompactar(r.json.nfseXmlGZipB64); } catch { return 'consultar'; }
        const nfse = lerNfse(xml);
        if (!nfse || !chaveValida(nfse.chave) || nfse.dps.id !== sol.id) {
            log.error('nfse: NFS-e generada ilegible o de otra DPS', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id });
            return 'consultar';
        }
        const avisos = alertas(r.json);
        const autorizado = await resolverIntento(ctx.orgId, intento.id, {
            estado: 'autorizado',
            autorizacion: nfse.chave,
            vence: null,
            respuesta: respuestaGuardada(nfse, xml, { alertas: avisos, dataHoraProcessamento: r.json.dataHoraProcessamento ?? null }),
            observaciones: observacoes(nfse, sol, avisos),
        });
        await anotarUltimoAutorizado(ctx.orgId, claveSecuencia(ctx, sol.serie), Number(sol.nDPS));
        if (!autorizado) throw new Error('nfse: el intento autorizado no se pudo registrar');
        if (diferencaValorLiquido(nfse, sol)) {
            log.error('nfse: el valor líquido de la NFS-e difiere del documento', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id, vLiq: nfse.valores.vLiq, esperado: sol.esperado.vLiq });
        }
        return { tipo: 'autorizado', intento: autorizado };
    }
    const erros = mensagens(r.json);
    if (tieneCodigo(erros, CODIGO_DPS_DUPLICADA)) return 'consultar';
    if ((r.status === 400 || r.status === 401 || r.status === 403) && (erros.length || r.status !== 400)) {
        // Rechazo de negocio o del certificado: la Sefin no generó nada.
        const certificado = r.status === 401 || r.status === 403 || deCertificado(erros);
        const mensaje = erros.length ? mensajeRechazo(erros) : mensajeCodigo('E1200');
        if (certificado) await marcarVerificacion(ctx.orgId, 'nfse', ctx.entorno, mensaje).catch(() => {});
        const codigo = erros[0]?.codigo ? normalizarCodigo(erros[0].codigo) : `http_${r.status}`;
        await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo, respuesta: { status: r.status, erros }, observaciones: [] });
        log.error('nfse: DPS rechazada', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id, status: r.status, erros });
        return { tipo: 'rechazado', mensaje, codigo };
    }
    // 500 o una respuesta fuera del contrato: no se sabe si se generó.
    log.error('nfse: POST /nfse sin desenlace claro', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id, status: r.status, erros });
    return 'consultar';
}

/**
 * Emite la NFS-e de `base` (DPS sin número) para el documento. Debe llamarse
 * SIN un intento vivo del documento: el proveedor resuelve antes el que hubiera.
 */
export async function emitirAnteSefin(ctx: ContextoNfse, documentoId: string, base: SolicitudNfse): Promise<ResultadoEmision> {
    const clave = claveSecuencia(ctx, base.serie);
    return conSecuencia(ctx.orgId, clave, async () => {
        for (let vuelta = 0; vuelta < 2; vuelta++) {
            // 0) Otra instancia pudo autorizar ESTE documento mientras se esperaba el lease.
            const previo = await intentoVivo(ctx.orgId, documentoId, 'nfse', ctx.entorno);
            if (previo?.estado === 'autorizado') return { tipo: 'autorizado', intento: previo } as const;

            // 1) Lo colgado de esta serie se resuelve antes de numerar otra DPS.
            for (const colgado of await sinResolverDeSecuencia(ctx.orgId, 'nfse', ctx.entorno, clave.serie, clave.tipo)) {
                const r = await resolverPorConsulta(ctx, colgado);
                if (r === 'sin_resolver') {
                    return colgado.documentoId === documentoId
                        ? { tipo: 'incierto', mensaje: MSG_INCIERTO } as const
                        : { tipo: 'rechazado', mensaje: CONFLICTO_PENDIENTE } as const;
                }
                if (r === 'autorizado' && colgado.documentoId === documentoId) {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'nfse', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio } as const;
                }
            }

            // 2) Número y firma; se reclama ANTES de enviar.
            const numero = await proximoNumero(ctx, clave.serie);
            const sol = comXmlAssinado(conNumero(base, numero), ctx.credencial.certPem, ctx.credencial.keyPem);
            const intento = await reclamarNumero(ctx.orgId, {
                documentoId, rail: 'nfse', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero,
                solicitud: sol as unknown as Record<string, unknown>,
            });
            if (!intento) throw new RailTransitorioError(CONFLICTO_PENDIENTE);

            // 3) Enviar. `enviado_at` va antes: sin él, el intento seguro no salió.
            await marcarEnviado(ctx.orgId, intento.id);
            let resultado: ResultadoEmision | 'consultar';
            try {
                const r = await chamarSefin(ctx.entorno, ctx.credencial, 'POST', '/nfse', { dpsXmlGZipB64: compactar(sol.xml!) });
                resultado = await interpretar(ctx, intento, sol, r);
            } catch (error) {
                if (!(error instanceof NfseTransporteError)) throw error;
                log.error('nfse: POST /nfse sin respuesta', { route: 'fiscal/nfse', orgId: ctx.orgId, intento: intento.id, err: error });
                resultado = 'consultar';
            }
            if (resultado !== 'consultar') return resultado;

            // 4) Incierto: una consulta inmediata resuelve el caso común (la
            //    respuesta se perdió, o la DPS ya había generado la NFS-e).
            const incierto = await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
            const r = incierto ? await resolverPorConsulta(ctx, incierto) : 'sin_resolver';
            if (r === 'autorizado') {
                const propio = await intentoVivo(ctx.orgId, documentoId, 'nfse', ctx.entorno);
                if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
            }
            // El número lo usó otro sistema: una vuelta más con el siguiente.
            if (r === 'descartado' && vuelta === 0) {
                const visto = await intentoPorId(ctx.orgId, intento.id);
                if ((visto?.respuesta as Record<string, unknown> | null)?.conflicto) continue;
                return { tipo: 'rechazado', mensaje: visto?.errorMensaje || MSG_DESCARTADO };
            }
            if (r === 'descartado') return { tipo: 'rechazado', mensaje: MSG_DESCARTADO };
            return { tipo: 'incierto', mensaje: MSG_INCIERTO };
        }
        return { tipo: 'rechazado', mensaje: 'La serie de la DPS se está usando desde otro sistema. Configura en Ajustes › Datos fiscales una serie exclusiva para Cord.' };
    }, { esperaMaxMs: 12_000, leaseS: 150 });
}

export interface ConteoResolucion {
    revisados: number;
    autorizados: number;
    descartados: number;
    sinResolver: number;
    error?: string;
}

/**
 * Resuelve por consulta los intentos colgados de una organización (el cron
 * /api/cron/fiscal-latam). Un intento autorizado termina la emisión de su
 * factura (`finalizar`, que reproduce lo autorizado sin volver a pedir nada).
 */
export async function resolverIntentosDeOrg(orgId: string, entorno: EntornoRail, intentos: IntentoRail[], deadline: number,
    finalizar: (documentoId: string) => Promise<unknown>): Promise<ConteoResolucion> {
    const r: ConteoResolucion = { revisados: 0, autorizados: 0, descartados: 0, sinResolver: 0 };
    let ctx: ContextoConsulta;
    try {
        ctx = await contextoConsulta(orgId, entorno);
    } catch (error) {
        // Sin certificado no se puede consultar: el intento queda incierto
        // (bloqueando la anulación) hasta que vuelva.
        r.sinResolver = intentos.length;
        r.error = error instanceof Error ? error.message : 'contexto no disponible';
        return r;
    }
    for (const intento of intentos) {
        if (Date.now() >= deadline) break;
        r.revisados++;
        try {
            const resultado = await conSecuencia(orgId, claveSecuencia(ctx, intento.serie),
                () => resolverPorConsulta(ctx, intento), { esperaMaxMs: 2_000 });
            if (resultado === 'autorizado') {
                r.autorizados++;
                await finalizar(intento.documentoId);
            } else if (resultado === 'descartado') {
                r.descartados++;
            } else {
                r.sinResolver++;
            }
        } catch (error) {
            r.sinResolver++;
            if (!(error instanceof RailTransitorioError)) {
                log.error('nfse: no se pudo resolver un intento', { route: 'fiscal/nfse', orgId, intento: intento.id, err: error });
            }
        }
    }
    return r;
}

// ── Cancelación (evento e101101) ─────────────────────────────────────────────

export interface ResultadoCancelamento {
    estado: 'aceptada' | 'rechazada' | 'incierta';
    mensaje?: string;
    datos?: Record<string, unknown>;
}

/** ¿La NFS-e ya tiene el evento de cancelación? (idempotencia de la anulación). */
async function cancelamentoRegistrado(entorno: EntornoRail, credencial: CredencialActiva, chave: string): Promise<boolean> {
    const r = await chamarSefin(entorno, credencial, 'GET', `/nfse/${chave}/eventos/${EVENTO_CANCELAMENTO.codigo}/${EVENTO_CANCELAMENTO.nSeq}`);
    return r.status === 200;
}

/**
 * Cancela ante la Sefin la NFS-e de un intento autorizado. No lanza por fallas
 * de la Sefin: devuelve el estado (la anulación en Cord solo se confirma con
 * 'aceptada').
 */
export async function cancelarNfse(orgId: string, intento: IntentoRail, motivo?: string | null): Promise<ResultadoCancelamento> {
    if (intento.estado !== 'autorizado' || !chaveValida(intento.autorizacion)) {
        return { estado: 'rechazada', mensaje: 'Esta NFS-e no figura como autorizada: no hay nada que cancelar ante el Sistema Nacional.' };
    }
    const credencial = await credencialActiva(orgId, 'nfse', intento.entorno);
    if (!credencial) return { estado: 'rechazada', mensaje: 'Para cancelar la NFS-e sube de nuevo el certificado digital de tu negocio en Ajustes › Datos fiscales.' };
    if (credencial.vencida) return { estado: 'rechazada', mensaje: 'El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales para cancelar la NFS-e.' };
    const sol = intento.solicitud as SolicitudNfse;
    const autor: DocumentoFederal = { tipo: sol.prest.tipo, numero: sol.prest.numero };
    const chave = intento.autorizacion;
    try {
        if (await cancelamentoRegistrado(intento.entorno, credencial, chave)) {
            return { estado: 'aceptada', datos: { evento: `e${EVENTO_CANCELAMENTO.codigo}`, chave, ya_registrado: true } };
        }
        const pedido = pedidoCancelamento({ entorno: intento.entorno, autor, chave, instante: new Date(Date.now() - 10_000), motivo });
        const xml = pedidoCancelamentoAssinado(pedido, credencial.certPem, credencial.keyPem);
        const r = await chamarSefin(intento.entorno, credencial, 'POST', `/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: compactar(xml) });
        if (r.status === 201) {
            return { estado: 'aceptada', datos: { evento: `e${EVENTO_CANCELAMENTO.codigo}`, chave, pedido: pedido.id, dhEvento: pedido.dhEvento, dataHoraProcessamento: r.json?.dataHoraProcessamento ?? null } };
        }
        const erros = mensagens(r.json);
        if (r.status === 400 || r.status === 401 || r.status === 403) {
            // E0840: otro evento ya vinculado; puede ser esta misma cancelación.
            if (tieneCodigo(erros, 'E0840') && await cancelamentoRegistrado(intento.entorno, credencial, chave)) {
                return { estado: 'aceptada', datos: { evento: `e${EVENTO_CANCELAMENTO.codigo}`, chave, ya_registrado: true } };
            }
            log.error('nfse: cancelación rechazada', { route: 'fiscal/nfse', orgId, intento: intento.id, status: r.status, erros });
            return { estado: 'rechazada', mensaje: erros.length ? mensajeRechazo(erros) : mensajeCodigo('E1200'), datos: { status: r.status, erros } };
        }
        log.error('nfse: cancelación sin desenlace claro', { route: 'fiscal/nfse', orgId, intento: intento.id, status: r.status, erros });
        return { estado: 'incierta', mensaje: 'No pudimos confirmar la cancelación con el Sistema Nacional NFS-e. Reintenta en unos minutos: no se duplicará.' };
    } catch (error) {
        if (error instanceof NfseTransporteError) {
            return { estado: 'incierta', mensaje: 'El Sistema Nacional NFS-e no respondió. Reintenta la cancelación en unos minutos: no se duplicará.' };
        }
        throw error;
    }
}

/**
 * Prueba la credencial ante la Sefin sin efectos: HEAD /dps/{id} de una DPS
 * que no existe (la API lo admite a cualquier certificado válido). 200/404 =
 * el certificado abrió la conexión; 401/403 = la Sefin no lo acepta.
 */
export async function probarCredencial(orgId: string, entorno: EntornoRail, documento: DocumentoFederal, municipio: string): Promise<string | null> {
    const credencial = await credencialActiva(orgId, 'nfse', entorno);
    if (!credencial) return null;
    const id = `DPS${municipio}${documento.tipo === 'CPF' ? '1' : '2'}${documento.numero.padStart(14, '0')}${'0'.padStart(5, '0')}${'0'.padStart(15, '0')}`;
    try {
        const r = await chamarSefin(entorno, credencial, 'HEAD', `/dps/${id}`, undefined, { timeoutMs: 20_000 });
        if (r.status === 401 || r.status === 403) {
            const mensaje = mensajeCodigo('E1200');
            await marcarVerificacion(orgId, 'nfse', entorno, mensaje);
            return mensaje;
        }
        if (r.status >= 500 || r.status === 0) return MSG_SEFIN_CAIDA;
        await marcarVerificacion(orgId, 'nfse', entorno, null);
        return null;
    } catch (error) {
        if (error instanceof NfseTransporteError) return MSG_SEFIN_CAIDA;
        throw error;
    }
}

export { MSG_NO_DISPONIBLE };
