// Autorización de la NF-e ante la SEFAZ autorizadora con la máquina de estados
// del marco común (latam/comprobantes.ts).
//
// Síncrona con lote de UNA nota (indSinc = 1, obligatoria desde el
// 13/10/2025 [NT2025.001, rechazo 452]): la respuesta trae el protocolo. Si
// el autorizador aun así procesa en asíncrono (103 + recibo), Cord guarda el
// recibo y lo consulta (NFeRetAutorizacao). Lo que no es síncrono es la
// certeza, y por eso:
//
//   1. Una serie tiene un solo pedido en vuelo (lease). Dentro del lease, los
//      intentos colgados de la serie se resuelven ANTES de numerar otro.
//   2. El número lo elige Cord: el mayor CONSUMIDO de la serie (vivo,
//      denegado, usado por otra chave o inutilizado) + 1, o el número inicial
//      configurado. Un número rechazado o que nunca salió se reutiliza: así no
//      quedan huecos que inutilizar.
//   3. Sin respuesta legible, el intento queda `incierto` y se resuelve
//      CONSULTANDO la chave (NfeConsultaProtocolo): autorizada → es nuestra;
//      denegada → número consumido; 217 (no consta) pasado un margen → no se
//      registró. Nunca se reenvía a ciegas.
//   4. Duplicidad: 204 (la MISMA chave ya existe) es la misma consulta; 539,
//      562 y 613 (el número lo tiene OTRA chave) consumen el número y se
//      vuelve a intentar con el siguiente.
//   5. Contingencia SVC [MOC Anexo III]: si la SEFAZ normal no recibió el
//      pedido (sin conexión, o 108/109) y la SVC de la UF responde 107, Cord
//      abre la contingencia, emite con tpEmis 6/7 + dhCont + xJust y la cierra
//      sola cuando la SEFAZ normal vuelve a responder 107. Un intento
//      incierto de la SEFAZ normal NO pasa a la SVC: se consulta; la siguiente
//      nota toma otro número [Anexo III 2.1.3.5, nota].

import { sql, withOrgTx } from '../../../db';
import { log } from '../../../log';
import {
    anotarConsulta, anotarUltimoAutorizado, conSecuencia, intentoPorId, intentoVivo, liberarDocumento, marcarEnviado,
    reclamarNumero, resolverIntento, sinResolverDeSecuencia, type IntentoRail,
} from '../comprobantes';
import { leerAjustes, marcarVerificacion, type CredencialActiva } from '../credenciales';
import { MSG_INCIERTO, RailDatosError, RailNoDisponibleError, RailTransitorioError } from '../errores';
import type { EntornoRail } from '../rieles';
import { dataHoraBrasilia, documentoFederal, type DocumentoFederal } from '../nfse/dps';
import { FALTANTE_ES, faltantesAjustes, type AjustesNfe } from './ajustes';
import { chaveValida, partesDaChave } from './chave';
import {
    AUTORIZADOR_UF, TP_EMIS, XJUST_CONTINGENCIA, autorizadorContingencia, codigoUf, ufDeCodigo,
    type Autorizador, type AutorizadorContingencia, type Uf,
} from './constantes';
import {
    AUTORIZADO, CANCELADO, CERTIFICADO, DENEGADO, DUPLICIDADE_MESMA, DUPLICIDADE_OUTRA, LOTE_EN_PROCESO, LOTE_PROCESADO,
    LOTE_RECIBIDO, NAO_CONSTA, PARALISADO, SERVICO_OPERANDO, mensajeCstat,
} from './erros';
import { credencialNfe } from './estado';
import {
    chaveCitada, consReciNFe, consSitNFe, consStatServ, enviNFe, idLote, lerRetConsSit, lerRetConsStatServ, lerRetornoLote, nfeProc,
    type ProtNfe, type RetornoLote,
} from './mensagens';
import { comXmlAssinado, conNumero, type SolicitudNfe } from './nfe';
import { responsavelTecnico } from './resp-tec';
import { chamarSefaz, NfeTransporteError, type RespuestaSoap } from './soap';

/** Tipo de secuencia en `fiscal_rail_*`: la numeración de la NF-e es por serie. */
export const TIPO_SEQUENCIA = 'NFE';
/** Una nota enviada que la SEFAZ no tiene se da por no registrada después de esto. */
export const ANTIGUEDAD_PARA_DESCARTAR_S = 900;
/** Cada cuánto se vuelve a mirar si la SEFAZ normal volvió (con la contingencia abierta). */
export const VERIFICAR_CONTINGENCIA_S = 300;

export const MSG_NO_DISPONIBLE = 'La NF-e no está activa en este momento. El documento se conserva sin emitir; escríbenos a soporte@flouvia.com si necesitas emitirlo ya.';
const MSG_SEFAZ_CAIDA = 'La SEFAZ no está respondiendo y la contingencia no está habilitada para tu estado. No se emitió nada: reintenta en unos minutos.';
const MSG_DESCARTADO = 'La SEFAZ no registró esta NF-e. Puedes volver a emitirla o descartarla.';
const MSG_DENEGADA = mensajeCstat('110');
const CONFLICTO_PENDIENTE = 'Hay otra NF-e esperando la confirmación de la SEFAZ en esta serie. Reintenta en unos minutos.';

export interface ContextoNfe {
    orgId: string;
    entorno: EntornoRail;
    documento: DocumentoFederal;
    ajustes: AjustesNfe & Required<Pick<AjustesNfe, 'serie' | 'crt' | 'ie' | 'municipio'>>;
    credencial: CredencialActiva;
    uf: Uf;
}

export type ContextoConsulta = Pick<ContextoNfe, 'orgId' | 'entorno' | 'credencial'>;

export async function contextoNfe(orgId: string, entorno: EntornoRail, cnpjEmissor: string | null | undefined): Promise<ContextoNfe> {
    const ajustes = await leerAjustes<AjustesNfe>(orgId, 'nfe');
    const faltan = faltantesAjustes(ajustes);
    if (faltan.length) throw new RailNoDisponibleError(`Completa los ajustes de la NF-e (${faltan.map((f) => FALTANTE_ES[f]).join(', ')}) en Ajustes › Datos fiscales.`);
    const documento = documentoFederal(cnpjEmissor);
    if (!documento || documento.tipo !== 'CNPJ') throw new RailDatosError('El CNPJ de tu negocio no es válido. Corrígelo en Ajustes › Datos fiscales.');
    const credencial = await credencialNfe(orgId, entorno, documento);
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital ICP-Brasil (e-CNPJ A1) de tu negocio en Ajustes › Datos fiscales para emitir la NF-e.');
    if (credencial.vencida) throw new RailNoDisponibleError('El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales.');
    const uf = ufDeCodigo(String(ajustes.municipio).slice(0, 2));
    if (!uf) throw new RailDatosError('El municipio de tu establecimiento no es válido. Revísalo en Ajustes › Datos fiscales.');
    return { orgId, entorno, documento, credencial, uf, ajustes: ajustes as ContextoNfe['ajustes'] };
}

/** Lo que hace falta para CONSULTAR (resolver un intento): solo la credencial. */
export async function contextoConsulta(orgId: string, entorno: EntornoRail): Promise<ContextoConsulta> {
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId} limit 1`);
    const credencial = await credencialNfe(orgId, entorno, documentoFederal(org?.tax_id || org?.rfc));
    if (!credencial) throw new RailNoDisponibleError('Sube el certificado digital ICP-Brasil de tu negocio en Ajustes › Datos fiscales.');
    return { orgId, entorno, credencial };
}

export const claveSecuencia = (entorno: EntornoRail, serie: number | string) => ({ rail: 'nfe' as const, entorno, serie: String(serie), tipo: TIPO_SEQUENCIA });

/**
 * Próximo número de la serie: el mayor CONSUMIDO + 1. Consumen número los
 * intentos vivos, los denegados, los que la SEFAZ dijo que ya tenía otra
 * chave y los rangos inutilizados. Un rechazo o un intento que nunca llegó no
 * consumen nada y su número se reutiliza.
 */
export async function proximoNumero(ctx: Pick<ContextoNfe, 'orgId' | 'entorno' | 'ajustes'>, serie: number): Promise<number> {
    const s = String(serie);
    const [rows] = await withOrgTx(ctx.orgId, sql`
        select greatest(
                 coalesce((select max(numero) from fiscal_rail_comprobantes
                            where org_id = ${ctx.orgId} and rail = 'nfe' and entorno = ${ctx.entorno}
                              and serie = ${s} and tipo = ${TIPO_SEQUENCIA}
                              and (estado in ('pendiente', 'incierto', 'autorizado')
                                   or coalesce(respuesta, '{}'::jsonb) ?| array['denegada', 'conflicto'])), 0),
                 coalesce((select max(n_fin) from nfe_inutilizacoes
                            where org_id = ${ctx.orgId} and entorno = ${ctx.entorno} and serie = ${serie}
                              and estado = 'homologada'), 0),
                 coalesce((select ultimo_autorizado from fiscal_rail_secuencias
                            where org_id = ${ctx.orgId} and rail = 'nfe' and entorno = ${ctx.entorno}
                              and serie = ${s} and tipo = ${TIPO_SEQUENCIA}), 0)
               )::bigint as ultimo`);
    const ultimo = Number(rows[0]?.ultimo ?? 0);
    return Math.max(ultimo + 1, Number(ctx.ajustes.numeroInicial) || 1);
}

/** Autorizador que recibe la nota de una chave: la SVC si se emitió en contingencia. */
export function autorizadorDaChave(chave: string): Autorizador {
    const p = partesDaChave(chave);
    if (p.tpEmis === TP_EMIS['SVC-AN']) return 'SVC-AN';
    if (p.tpEmis === TP_EMIS['SVC-RS']) return 'SVC-RS';
    return AUTORIZADOR_UF[ufDeCodigo(p.cUF)!];
}

// ── Registro de resultados ───────────────────────────────────────────────────

const protGuardado = (p: ProtNfe) => ({ chNFe: p.chNFe, cStat: p.cStat, nProt: p.nProt, dhRecbto: p.dhRecbto, digVal: p.digVal, tpAmb: p.tpAmb });

async function registrarAutorizada(ctx: ContextoConsulta, intento: IntentoRail, sol: SolicitudNfe, prot: ProtNfe, extra: Record<string, unknown> = {}): Promise<IntentoRail | null> {
    const observaciones: { code: number; mensaje: string }[] = [];
    if (prot.cStat === '150') observaciones.push({ code: 150, mensaje: 'La SEFAZ autorizó la NF-e fuera de plazo.' });
    if (prot.digVal && sol.digVal && prot.digVal !== sol.digVal) {
        log.error('nfe: el digVal autorizado difiere del firmado', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id });
    }
    const autorizado = await resolverIntento(ctx.orgId, intento.id, {
        estado: 'autorizado',
        autorizacion: sol.chave!,
        vence: null,
        respuesta: { prot: protGuardado(prot), protXml: prot.xml, nfeProc: nfeProc(sol.xml!, prot.xml), ...extra },
        observaciones,
    });
    if (autorizado) await anotarUltimoAutorizado(ctx.orgId, claveSecuencia(intento.entorno, sol.serie), sol.nNF!);
    return autorizado;
}

async function descartar(ctx: ContextoConsulta, intento: IntentoRail, mensaje: string, respuesta?: Record<string, unknown>, liberar = MSG_DESCARTADO): Promise<'descartado'> {
    if (await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje, ...(respuesta ? { respuesta } : {}) })) {
        await liberarDocumento(ctx.orgId, intento.documentoId, 'nfe', liberar);
    }
    return 'descartado';
}

/** Denegada: el número queda consumido. Desde `pendiente` es un rechazo; desde `incierto`, un descarte (el trigger no admite incierto → rechazado). */
async function registrarDenegada(ctx: ContextoConsulta, intento: IntentoRail, sol: SolicitudNfe, prot: ProtNfe | null, cStat: string): Promise<void> {
    const respuesta = { denegada: true, cStat, ...(prot ? { prot: protGuardado(prot), protXml: prot.xml, nfeProc: sol.xml ? nfeProc(sol.xml, prot.xml) : null } : {}) };
    const mensaje = mensajeCstat(cStat);
    const r = intento.estado === 'pendiente'
        ? await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo: cStat, respuesta, observaciones: [] })
        : await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje, respuesta });
    if (r) await liberarDocumento(ctx.orgId, intento.documentoId, 'nfe', mensaje);
    log.error('nfe: uso denegado', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, cStat });
}

// ── Consulta ─────────────────────────────────────────────────────────────────

export type ResultadoResolucion = 'autorizado' | 'descartado' | 'sin_resolver';

async function chamar(ctx: ContextoConsulta, autorizador: Autorizador, servico: Parameters<typeof chamarSefaz>[2], msg: string, timeoutMs = 30_000): Promise<RespuestaSoap | null> {
    try {
        return await chamarSefaz(ctx.entorno, autorizador, servico, msg, ctx.credencial, { timeoutMs });
    } catch (error) {
        if (error instanceof NfeTransporteError) return null;
        throw error;
    }
}

/**
 * Resuelve un intento `pendiente` o `incierto` CONSULTANDO a la SEFAZ. Nunca
 * reenvía. Debe llamarse con la serie tomada.
 */
export async function resolverPorConsulta(ctx: ContextoConsulta, recibido: IntentoRail, ahora = Date.now()): Promise<ResultadoResolucion> {
    const intento = await intentoPorId(ctx.orgId, recibido.id);
    if (!intento || intento.estado === 'rechazado' || intento.estado === 'descartado') return 'descartado';
    if (intento.estado === 'autorizado') return 'autorizado';
    const sol = intento.solicitud as SolicitudNfe;
    if (!intento.enviadoAt || !sol.chave) return descartar(ctx, intento, 'El pedido no llegó a enviarse a la SEFAZ.');
    const autorizador = autorizadorDaChave(sol.chave);

    // a) Un lote asíncrono pendiente se pregunta primero por su recibo.
    const nRec = String((intento.respuesta as Record<string, unknown> | null)?.nRec ?? '');
    if (/^[0-9]{15}$/.test(nRec)) {
        const r = await chamar(ctx, autorizador, 'NFeRetAutorizacao', consReciNFe(ctx.entorno, nRec));
        const lote = lerRetornoLote(r?.resultado);
        if (lote?.cStat === LOTE_PROCESADO && lote.prot?.chNFe === sol.chave) {
            const resultado = await aplicarProtocolo(ctx, intento, sol, lote.prot, { nRec });
            if (resultado !== 'consultar') return resultado;
        }
    }

    // b) La chave.
    const r = await chamar(ctx, autorizador, 'NfeConsultaProtocolo', consSitNFe(ctx.entorno, sol.chave));
    const ret = lerRetConsSit(r?.resultado);
    if (!ret) {
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    }
    if (ret.prot && ret.prot.chNFe === sol.chave && (AUTORIZADO.has(ret.prot.cStat) || CANCELADO.has(ret.cStat))) {
        // Autorizada (y quizá ya cancelada en la SEFAZ: el número es nuestro igual).
        const cancelada = CANCELADO.has(ret.cStat);
        await registrarAutorizada(ctx, intento, sol, ret.prot, { recuperado: true, ...(cancelada ? { cancelada_en_sefaz: true } : {}) });
        return 'autorizado';
    }
    if (DENEGADO.has(ret.cStat) || (ret.prot && DENEGADO.has(ret.prot.cStat))) {
        await registrarDenegada(ctx, intento, sol, ret.prot, ret.prot?.cStat || ret.cStat);
        return 'descartado';
    }
    if (ret.cStat === NAO_CONSTA) {
        if (ahora - Date.parse(intento.enviadoAt) >= ANTIGUEDAD_PARA_DESCARTAR_S * 1000) {
            return descartar(ctx, intento, 'La SEFAZ no registró la NF-e.', { consulta: NAO_CONSTA });
        }
        await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
        return 'sin_resolver';
    }
    if (DUPLICIDADE_OUTRA.has(ret.cStat)) {
        log.error('nfe: el número reclamado lo tiene otra chave', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, cStat: ret.cStat });
        return descartar(ctx, intento, 'Esa serie y número ya los usa otra NF-e: la serie se está usando desde otro sistema.', { conflicto: true, cStat: ret.cStat, chaveExistente: chaveCitada(ret.xMotivo) });
    }
    log.error('nfe: consulta sin resultado', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, cStat: ret.cStat });
    await anotarConsulta(ctx.orgId, intento.id, MSG_INCIERTO);
    return 'sin_resolver';
}

/** Aplica un protNFe de NUESTRA chave. 'consultar' = no concluye (204). */
async function aplicarProtocolo(ctx: ContextoConsulta, intento: IntentoRail, sol: SolicitudNfe, prot: ProtNfe, extra: Record<string, unknown> = {}): Promise<ResultadoResolucion | 'consultar'> {
    if (AUTORIZADO.has(prot.cStat)) {
        return (await registrarAutorizada(ctx, intento, sol, prot, extra)) ? 'autorizado' : 'sin_resolver';
    }
    if (DENEGADO.has(prot.cStat)) {
        await registrarDenegada(ctx, intento, sol, prot, prot.cStat);
        return 'descartado';
    }
    return 'consultar';
}

// ── Contingencia SVC ─────────────────────────────────────────────────────────

interface Contingencia { id: string; svc: AutorizadorContingencia; dhCont: string; xJust: string }

async function statusOperando(ctx: Pick<ContextoNfe, 'entorno' | 'credencial' | 'orgId'>, autorizador: Autorizador, cUF: string): Promise<string | null> {
    const r = await chamar(ctx, autorizador, 'NfeStatusServico', consStatServ(ctx.entorno, cUF), 20_000);
    return lerRetConsStatServ(r?.resultado)?.cStat ?? null;
}

/**
 * La contingencia abierta de la organización, si sigue vigente. Cada
 * VERIFICAR_CONTINGENCIA_S se pregunta a la SEFAZ normal: si volvió (107),
 * se cierra y la emisión vuelve a lo normal.
 */
export async function contingenciaVigente(ctx: Pick<ContextoNfe, 'orgId' | 'entorno' | 'credencial' | 'uf'>): Promise<Contingencia | null> {
    const [rows] = await withOrgTx(ctx.orgId, sql`
        select id, svc, dh_cont, x_just, (verificada_at is null or verificada_at < now() - make_interval(secs => ${VERIFICAR_CONTINGENCIA_S}::int)) as verificar
          from nfe_contingencias
         where org_id = ${ctx.orgId} and entorno = ${ctx.entorno} and encerrada_at is null
         limit 1`);
    const c = rows[0];
    if (!c) return null;
    if (c.verificar) {
        const status = await statusOperando(ctx, AUTORIZADOR_UF[ctx.uf], codigoUf(ctx.uf));
        if (status === SERVICO_OPERANDO) {
            await withOrgTx(ctx.orgId, sql`update nfe_contingencias set encerrada_at = now(), verificada_at = now() where id = ${c.id} and org_id = ${ctx.orgId} and encerrada_at is null`);
            return null;
        }
        await withOrgTx(ctx.orgId, sql`update nfe_contingencias set verificada_at = now() where id = ${c.id} and org_id = ${ctx.orgId}`);
    }
    return { id: String(c.id), svc: c.svc as AutorizadorContingencia, dhCont: String(c.dh_cont), xJust: String(c.x_just) };
}

/** Abre la contingencia si la SVC de la UF está operando para ella (107). */
async function entrarContingencia(ctx: ContextoNfe, motivo: string): Promise<Contingencia | null> {
    const svc = autorizadorContingencia(ctx.uf, ctx.entorno);
    const status = await statusOperando(ctx, svc, codigoUf(ctx.uf));
    if (status !== SERVICO_OPERANDO) {
        log.error('nfe: SEFAZ caída y SVC no disponible', { route: 'fiscal/nfe', orgId: ctx.orgId, svc, status, motivo });
        return null;
    }
    const dhCont = dataHoraBrasilia(new Date(Date.now() - 10_000));
    await withOrgTx(ctx.orgId, sql`
        insert into nfe_contingencias (org_id, entorno, uf, svc, dh_cont, x_just, motivo, verificada_at)
        values (${ctx.orgId}, ${ctx.entorno}, ${ctx.uf}, ${svc}, ${dhCont}, ${XJUST_CONTINGENCIA}, ${motivo.slice(0, 500)}, now())
        on conflict do nothing`);
    log.info('nfe: contingencia SVC abierta', { route: 'fiscal/nfe', orgId: ctx.orgId, svc, motivo });
    return contingenciaVigente(ctx);
}

async function cerrarContingencia(ctx: ContextoNfe, id: string): Promise<void> {
    await withOrgTx(ctx.orgId, sql`update nfe_contingencias set encerrada_at = now() where id = ${id} and org_id = ${ctx.orgId} and encerrada_at is null`);
}

// ── Emisión ──────────────────────────────────────────────────────────────────

export type ResultadoEmision =
    | { tipo: 'autorizado'; intento: IntentoRail }
    | { tipo: 'rechazado'; mensaje: string; codigo?: string }
    | { tipo: 'incierto'; mensaje: string };

type Paso = ResultadoEmision | 'consultar' | 'contingencia' | 'otra_vez';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Interpreta el retorno del lote para un intento ya marcado como enviado. */
async function interpretar(ctx: ContextoNfe, intento: IntentoRail, sol: SolicitudNfe, autorizador: Autorizador, cont: Contingencia | null, lote: RetornoLote | null): Promise<Paso> {
    if (!lote) return 'consultar';
    const tpAmb = String(sol.tpAmb);
    if (lote.tpAmb && lote.tpAmb !== tpAmb) {
        const mensaje = 'La respuesta de la SEFAZ no corresponde al ambiente configurado. Escríbenos a soporte@flouvia.com.';
        await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje, respuesta: { tpAmb: lote.tpAmb } });
        return { tipo: 'incierto', mensaje };
    }
    // Servicio parado: el lote NO se procesó; la nota no existe.
    if (PARALISADO.has(lote.cStat) || (cont && ['113', '114'].includes(lote.cStat))) {
        await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'La SEFAZ no procesó el lote (servicio parado).', respuesta: { cStat: lote.cStat } });
        if (cont) { await cerrarContingencia(ctx, cont.id); return { tipo: 'rechazado', mensaje: MSG_SEFAZ_CAIDA, codigo: lote.cStat }; }
        return 'contingencia';
    }
    // Asíncrono: se guarda el recibo y se pregunta unas veces.
    let prot = lote.prot;
    if (lote.cStat === LOTE_RECIBIDO && /^[0-9]{15}$/.test(lote.nRec)) {
        await withOrgTx(ctx.orgId, sql`
            update fiscal_rail_comprobantes set respuesta = coalesce(respuesta, '{}'::jsonb) || jsonb_build_object('nRec', ${lote.nRec}::text)
             where id = ${intento.id} and org_id = ${ctx.orgId}`);
        for (let i = 0; i < 3 && !prot; i++) {
            await espera(1_500 * (i + 1));
            const r = await chamar(ctx, autorizador, 'NFeRetAutorizacao', consReciNFe(ctx.entorno, lote.nRec));
            const ret = lerRetornoLote(r?.resultado);
            if (ret?.cStat === LOTE_PROCESADO && ret.prot) prot = ret.prot;
            else if (ret && ret.cStat !== LOTE_EN_PROCESO) break;
        }
        if (!prot) return 'consultar';
    } else if (lote.cStat !== LOTE_PROCESADO) {
        // El LOTE se rechazó (esquema, firma, certificado, 452…): la nota no se procesó.
        return rechazar(ctx, intento, lote.cStat, { lote: lote.cStat });
    }
    if (!prot || prot.chNFe !== sol.chave) return 'consultar';
    const aplicado = await aplicarProtocolo(ctx, intento, sol, prot, lote.cStat === LOTE_RECIBIDO ? { nRec: lote.nRec } : {});
    if (aplicado === 'autorizado') {
        const vivo = await intentoPorId(ctx.orgId, intento.id);
        return vivo?.estado === 'autorizado' ? { tipo: 'autorizado', intento: vivo } : 'consultar';
    }
    if (aplicado === 'descartado') return { tipo: 'rechazado', mensaje: MSG_DENEGADA, codigo: prot.cStat };
    if (prot.cStat === DUPLICIDADE_MESMA) return 'consultar';
    if (DUPLICIDADE_OUTRA.has(prot.cStat)) {
        const chaveExistente = chaveCitada(prot.xMotivo);
        await resolverIntento(ctx.orgId, intento.id, {
            estado: 'rechazado', codigo: prot.cStat, mensaje: 'Ese número ya lo usa otra NF-e.',
            respuesta: { conflicto: true, cStat: prot.cStat, chaveExistente }, observaciones: [],
        });
        log.error('nfe: el número lo tiene otra chave', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, cStat: prot.cStat, chaveExistente });
        return 'otra_vez';
    }
    return rechazar(ctx, intento, prot.cStat, { prot: protGuardado(prot) });
}

async function rechazar(ctx: ContextoNfe, intento: IntentoRail, cStat: string, respuesta: Record<string, unknown>): Promise<ResultadoEmision> {
    const mensaje = mensajeCstat(cStat);
    // La credencial puede ser la de la NFS-e (mismo CNPJ): se marca la que haya de la NF-e.
    if (CERTIFICADO.has(cStat)) await marcarVerificacion(ctx.orgId, 'nfe', ctx.entorno, mensaje).catch(() => {});
    await resolverIntento(ctx.orgId, intento.id, { estado: 'rechazado', mensaje, codigo: cStat, respuesta: { cStat, ...respuesta }, observaciones: [] });
    log.error('nfe: NF-e rechazada', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, cStat });
    return { tipo: 'rechazado', mensaje, codigo: cStat };
}

/**
 * Emite la NF-e de `base` (sin número) para el documento. Debe llamarse SIN un
 * intento vivo del documento: el proveedor resuelve antes el que hubiera.
 */
export async function emitirAnteSefaz(ctx: ContextoNfe, documentoId: string, base: SolicitudNfe): Promise<ResultadoEmision> {
    const clave = claveSecuencia(ctx.entorno, base.serie);
    const rt = responsavelTecnico();
    return conSecuencia(ctx.orgId, clave, async () => {
        let intentoContingencia = false;
        for (let vuelta = 0; vuelta < 3; vuelta++) {
            // 0) Otra instancia pudo autorizar ESTE documento mientras se esperaba el lease.
            const previo = await intentoVivo(ctx.orgId, documentoId, 'nfe', ctx.entorno);
            if (previo?.estado === 'autorizado') return { tipo: 'autorizado', intento: previo } as const;

            const cont = await contingenciaVigente(ctx);

            // 1) Lo colgado de esta serie se resuelve antes de numerar otra nota.
            //    En contingencia, lo colgado de OTROS documentos no bloquea: se
            //    numera después de su número [Anexo III 2.1.3.5, nota].
            for (const colgado of await sinResolverDeSecuencia(ctx.orgId, 'nfe', ctx.entorno, clave.serie, clave.tipo)) {
                const r = await resolverPorConsulta(ctx, colgado);
                if (r === 'sin_resolver') {
                    if (colgado.documentoId === documentoId) return { tipo: 'incierto', mensaje: MSG_INCIERTO } as const;
                    if (!cont) return { tipo: 'rechazado', mensaje: CONFLICTO_PENDIENTE } as const;
                }
                if (r === 'autorizado' && colgado.documentoId === documentoId) {
                    const propio = await intentoVivo(ctx.orgId, documentoId, 'nfe', ctx.entorno);
                    if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio } as const;
                }
            }

            // 2) Número, chave y firma; se reclama ANTES de enviar.
            const numero = await proximoNumero(ctx, base.serie);
            const sol = comXmlAssinado(conNumero(base, numero, {
                tpEmis: cont ? TP_EMIS[cont.svc] : TP_EMIS.normal,
                contingencia: cont ? { dhCont: cont.dhCont, xJust: cont.xJust } : null,
                csrt: rt?.csrt?.[ctx.uf] ?? null,
            }), ctx.credencial.certPem, ctx.credencial.keyPem);
            const intento = await reclamarNumero(ctx.orgId, {
                documentoId, rail: 'nfe', entorno: ctx.entorno, serie: clave.serie, tipo: clave.tipo, numero,
                solicitud: sol as unknown as Record<string, unknown>,
            });
            if (!intento) throw new RailTransitorioError(CONFLICTO_PENDIENTE);

            // 3) Enviar. `enviado_at` va antes: sin él, el intento seguro no salió.
            const autorizador: Autorizador = cont ? cont.svc : sol.autorizador;
            await marcarEnviado(ctx.orgId, intento.id);
            let paso: Paso;
            try {
                const r = await chamarSefaz(ctx.entorno, autorizador, 'NFeAutorizacao', enviNFe(idLote(), sol.xml!), ctx.credencial, { timeoutMs: 60_000 });
                paso = await interpretar(ctx, intento, sol, autorizador, cont, lerRetornoLote(r.resultado));
            } catch (error) {
                if (!(error instanceof NfeTransporteError)) throw error;
                log.error('nfe: autorización sin respuesta', { route: 'fiscal/nfe', orgId: ctx.orgId, intento: intento.id, enviado: error.enviado, err: error });
                if (error.enviado) paso = 'consultar';
                else {
                    // La conexión ni se abrió: la nota no existe y el número queda libre.
                    await resolverIntento(ctx.orgId, intento.id, { estado: 'descartado', mensaje: 'La SEFAZ no recibió el pedido (sin conexión).' });
                    paso = cont ? { tipo: 'rechazado', mensaje: MSG_SEFAZ_CAIDA } : 'contingencia';
                }
            }
            if (paso === 'otra_vez') continue;
            if (paso === 'contingencia') {
                if (intentoContingencia || !(await entrarContingencia(ctx, `autorizador ${autorizador} sin servicio`))) {
                    await liberarDocumento(ctx.orgId, documentoId, 'nfe', MSG_SEFAZ_CAIDA);
                    return { tipo: 'rechazado', mensaje: MSG_SEFAZ_CAIDA };
                }
                intentoContingencia = true;
                continue;
            }
            if (paso !== 'consultar') return paso;

            // 4) Incierto: una consulta inmediata resuelve el caso común.
            const incierto = await resolverIntento(ctx.orgId, intento.id, { estado: 'incierto', mensaje: MSG_INCIERTO });
            const r = incierto ? await resolverPorConsulta(ctx, incierto) : 'sin_resolver';
            if (r === 'autorizado') {
                const propio = await intentoVivo(ctx.orgId, documentoId, 'nfe', ctx.entorno);
                if (propio?.estado === 'autorizado') return { tipo: 'autorizado', intento: propio };
            }
            if (r === 'descartado') {
                const visto = await intentoPorId(ctx.orgId, intento.id);
                const resp = (visto?.respuesta ?? {}) as Record<string, unknown>;
                if (resp.conflicto) continue;
                return { tipo: 'rechazado', mensaje: resp.denegada ? MSG_DENEGADA : (visto?.errorMensaje || MSG_DESCARTADO) };
            }
            return { tipo: 'incierto', mensaje: MSG_INCIERTO };
        }
        return { tipo: 'rechazado', mensaje: 'La serie de la NF-e se está usando desde otro sistema. Configura en Ajustes › Datos fiscales una serie exclusiva para Cord.' };
    }, { esperaMaxMs: 12_000, leaseS: 180 });
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
        r.sinResolver = intentos.length;
        r.error = error instanceof Error ? error.message : 'contexto no disponible';
        return r;
    }
    for (const intento of intentos) {
        if (Date.now() >= deadline) break;
        r.revisados++;
        try {
            const resultado = await conSecuencia(orgId, claveSecuencia(entorno, intento.serie),
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
                log.error('nfe: no se pudo resolver un intento', { route: 'fiscal/nfe', orgId, intento: intento.id, err: error });
            }
        }
    }
    return r;
}

/**
 * Prueba la credencial ante la SEFAZ sin efectos: consulta el estado del
 * servicio del autorizador de la UF. 107 = el certificado abrió la conexión.
 */
export async function probarCredencial(orgId: string, entorno: EntornoRail, uf: Uf, documento: DocumentoFederal): Promise<string | null> {
    const credencial = await credencialNfe(orgId, entorno, documento);
    if (!credencial) return null;
    try {
        const r = await chamarSefaz(entorno, AUTORIZADOR_UF[uf], 'NfeStatusServico', consStatServ(entorno, codigoUf(uf)), credencial, { timeoutMs: 20_000 });
        const ret = lerRetConsStatServ(r.resultado);
        if (!ret) {
            if (r.status === 403 || r.status === 401 || r.status === 495 || r.status === 496) {
                const mensaje = mensajeCstat('280');
                await marcarVerificacion(orgId, 'nfe', entorno, mensaje).catch(() => {});
                return mensaje;
            }
            return 'No pudimos comprobar la conexión con la SEFAZ en este momento. Reintenta en unos minutos.';
        }
        if (CERTIFICADO.has(ret.cStat)) {
            const mensaje = mensajeCstat(ret.cStat);
            await marcarVerificacion(orgId, 'nfe', entorno, mensaje).catch(() => {});
            return mensaje;
        }
        await marcarVerificacion(orgId, 'nfe', entorno, null).catch(() => {});
        return ret.cStat === SERVICO_OPERANDO ? null : 'La SEFAZ de tu estado informa que el servicio no está operando ahora mismo.';
    } catch (error) {
        if (error instanceof NfeTransporteError) {
            return error.enviado
                ? 'No pudimos comprobar la conexión con la SEFAZ en este momento. Reintenta en unos minutos.'
                : 'La SEFAZ no aceptó la conexión con el certificado (o no está disponible). Verifica que sea el e-CNPJ A1 vigente de tu negocio.';
        }
        throw error;
    }
}

/** Validación ligera de una chave guardada (para rutas que la reciben). */
export const chaveDeIntento = (i: IntentoRail) => (chaveValida(i.autorizacion) ? i.autorizacion : null);
