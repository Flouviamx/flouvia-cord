// Eventos de una NF-e autorizada (cancelación 110111 y Carta de Correção
// 110110) e inutilização de numeración, con su registro en `nfe_eventos` y
// `nfe_inutilizacoes`.
//
// A diferencia de la autorización, reenviar el MISMO evento es inocuo: la
// SEFAZ responde 573 (duplicidad de evento) y no crea nada nuevo. Aun así,
// un evento sin respuesta se CONSULTA primero (la consulta de la nota trae sus
// eventos registrados) y solo se reenvía si la SEFAZ no lo tiene.
//
//   - Cancelación [MOC 5.9, Anexo III 2.1.3.4 c]: dentro de las 24 horas de
//     la autorización (después, rechazo 501). La de una nota emitida en la SVC
//     va a la SVC.
//   - CC-e [MOC 5.10]: hasta 20 por nota, cada una reemplaza a la anterior; el
//     texto no puede corregir valores, cantidades, partes ni fechas (lo dice
//     xCondUso, y la SEFAZ no lo valida: Cord lo advierte en la pantalla). La
//     SVC no recibe CC-e: va siempre a la SEFAZ normal.
//   - Inutilização [MOC 5.3]: un rango de hasta 10.000 números que nunca se
//     usaron; nunca en la SVC.

import { sql, withOrgTx } from '../../../db';
import { log } from '../../../log';
import { conSecuencia, type IntentoRail } from '../comprobantes';
import type { EntornoRail } from '../rieles';
import { dataHoraBrasilia, documentoFederal } from '../nfse/dps';
import { autorizadorDaChave, claveSecuencia, contextoNfe, TIPO_SEQUENCIA } from './autorizacao';
import { chaveValida } from './chave';
import { AUTORIZADOR_UF, CANCELAMENTO_PRAZO_HORAS, EVENTO_CANCELAMENTO, EVENTO_CCE, INUTILIZACAO_MAX, codigoUf, ufDeCodigo, type Autorizador } from './constantes';
import { EVENTO_DUPLICADO, EVENTO_REGISTRADO, INUTILIZACAO_HOMOLOGADA, mensajeEvento } from './erros';
import { credencialNfe } from './estado';
import {
    consSitNFe, envEvento, eventoAssinado, idLote, inutilizacaoAssinada, lerRetConsSit, lerRetEnvEvento, lerRetInut,
    pedidoCancelamento, pedidoCce, pedidoInutilizacao, procEvento, procInut, type PedidoEvento,
} from './mensagens';
import type { SolicitudNfe } from './nfe';
import { chamarSefaz, NfeTransporteError } from './soap';

export const XJUST_CANCELAMENTO_PADRAO = 'Cancelamento solicitado pelo emitente';

export interface ResultadoEvento {
    estado: 'registrado' | 'rechazado' | 'incierto';
    mensaje?: string;
    datos?: Record<string, unknown>;
}

interface FilaEvento {
    id: string;
    estado: string;
    nSeq: number;
    nProt: string | null;
    pedido: PedidoEvento;
    xmlEvento: string | null;
}

const fila = (r: Record<string, any>): FilaEvento => ({
    id: String(r.id), estado: String(r.estado), nSeq: Number(r.n_seq), nProt: r.n_prot ? String(r.n_prot) : null,
    pedido: r.pedido as PedidoEvento, xmlEvento: r.xml_evento ? String(r.xml_evento) : null,
});

/** El evento ya registrado en la SEFAZ según la consulta de la nota (procEventoNFe). */
async function eventoEnSefaz(entorno: EntornoRail, autorizador: Autorizador, credencial: { certPem: string; keyPem: string }, chave: string, tpEvento: string, nSeq: number): Promise<{ nProt: string } | null | 'sin_respuesta'> {
    try {
        const r = await chamarSefaz(entorno, autorizador, 'NfeConsultaProtocolo', consSitNFe(entorno, chave), credencial, { timeoutMs: 30_000 });
        const ret = lerRetConsSit(r.resultado);
        if (!ret) return 'sin_respuesta';
        const ev = ret.eventos.find((e) => e.tpEvento === tpEvento && Number(e.nSeqEvento) === nSeq && EVENTO_REGISTRADO.has(e.cStat));
        return ev ? { nProt: ev.nProt } : null;
    } catch (error) {
        if (error instanceof NfeTransporteError) return 'sin_respuesta';
        throw error;
    }
}

/**
 * Envía (o recupera) un evento ya reservado en `nfe_eventos`. Nunca lanza por
 * fallas de la SEFAZ: devuelve el estado.
 */
async function enviarEvento(orgId: string, entorno: EntornoRail, autorizador: Autorizador, credencial: { certPem: string; keyPem: string }, ev: FilaEvento): Promise<ResultadoEvento> {
    const p = ev.pedido;
    if (ev.estado === 'incierto') {
        const visto = await eventoEnSefaz(entorno, autorizador, credencial, p.chave, p.tpEvento, p.nSeqEvento);
        if (visto === 'sin_respuesta') return { estado: 'incierto', mensaje: 'La SEFAZ no respondió. Reintenta en unos minutos: no se duplicará.' };
        if (visto) {
            await withOrgTx(orgId, sql`
                update nfe_eventos set estado = 'registrado', n_prot = ${visto.nProt || null}, registrado_at = now(),
                       respuesta = coalesce(respuesta, '{}'::jsonb) || '{"recuperado":true}'::jsonb
                 where id = ${ev.id} and org_id = ${orgId} and estado <> 'registrado'`);
            return { estado: 'registrado', datos: { nProt: visto.nProt, recuperado: true } };
        }
    }
    const xml = ev.xmlEvento ?? eventoAssinado(p, credencial.certPem, credencial.keyPem);
    if (!ev.xmlEvento) await withOrgTx(orgId, sql`update nfe_eventos set xml_evento = ${xml} where id = ${ev.id} and org_id = ${orgId}`);
    try {
        const r = await chamarSefaz(entorno, autorizador, 'RecepcaoEvento', envEvento(idLote(), xml), credencial, { timeoutMs: 30_000 });
        const ret = lerRetEnvEvento(r.resultado);
        if (!ret) throw new NfeTransporteError(`evento: respuesta ilegible (HTTP ${r.status})`, true);
        if (EVENTO_REGISTRADO.has(ret.cStat) && ret.xml) {
            await withOrgTx(orgId, sql`
                update nfe_eventos set estado = 'registrado', n_prot = ${ret.nProt || null}, registrado_at = now(),
                       respuesta = ${JSON.stringify({ cStat: ret.cStat, nProt: ret.nProt, dhRegEvento: ret.dhRegEvento })}::jsonb,
                       proc_xml = ${procEvento(xml, ret.xml)}, error_codigo = null, error_mensaje = null
                 where id = ${ev.id} and org_id = ${orgId} and estado <> 'registrado'`);
            return { estado: 'registrado', datos: { cStat: ret.cStat, nProt: ret.nProt, dhRegEvento: ret.dhRegEvento } };
        }
        if (ret.cStat === EVENTO_DUPLICADO) {
            // Ya estaba registrado (un envío anterior sin respuesta): se recupera el protocolo.
            const visto = await eventoEnSefaz(entorno, autorizador, credencial, p.chave, p.tpEvento, p.nSeqEvento);
            if (visto && visto !== 'sin_respuesta') {
                await withOrgTx(orgId, sql`
                    update nfe_eventos set estado = 'registrado', n_prot = ${visto.nProt || null}, registrado_at = now(),
                           respuesta = ${JSON.stringify({ cStat: ret.cStat, recuperado: true })}::jsonb
                     where id = ${ev.id} and org_id = ${orgId} and estado <> 'registrado'`);
                return { estado: 'registrado', datos: { nProt: visto.nProt, ya_registrado: true } };
            }
        }
        const cStat = ret.cStat || ret.cStatLote;
        const mensaje = mensajeEvento(cStat);
        await withOrgTx(orgId, sql`
            update nfe_eventos set estado = 'rechazado', error_codigo = ${cStat}, error_mensaje = ${mensaje},
                   respuesta = ${JSON.stringify({ cStat, cStatLote: ret.cStatLote })}::jsonb
             where id = ${ev.id} and org_id = ${orgId} and estado <> 'registrado'`);
        log.error('nfe: evento rechazado', { route: 'fiscal/nfe', orgId, tpEvento: p.tpEvento, cStat });
        return { estado: 'rechazado', mensaje, datos: { cStat } };
    } catch (error) {
        if (!(error instanceof NfeTransporteError)) throw error;
        await withOrgTx(orgId, sql`update nfe_eventos set estado = 'incierto' where id = ${ev.id} and org_id = ${orgId} and estado = 'pendiente'`);
        log.error('nfe: evento sin respuesta', { route: 'fiscal/nfe', orgId, tpEvento: p.tpEvento, err: error });
        return { estado: 'incierto', mensaje: 'La SEFAZ no respondió. Reintenta en unos minutos: no se duplicará.' };
    }
}

/** Reserva el evento (o devuelve el vivo con la misma secuencia). */
async function reservarEvento(orgId: string, intento: IntentoRail, pedido: PedidoEvento, creadoPor: string | null): Promise<FilaEvento> {
    const [rows] = await withOrgTx(orgId, sql`
        insert into nfe_eventos (org_id, comprobante_id, documento_id, entorno, chave, tp_evento, n_seq, estado, pedido, creado_por)
        values (${orgId}, ${intento.id}, ${intento.documentoId}, ${intento.entorno}, ${pedido.chave}, ${pedido.tpEvento}, ${pedido.nSeqEvento},
                'pendiente', ${JSON.stringify(pedido)}::jsonb, ${creadoPor})
        on conflict do nothing
        returning *`);
    if (rows[0]) return fila(rows[0]);
    const [vivo] = await withOrgTx(orgId, sql`
        select * from nfe_eventos
         where org_id = ${orgId} and chave = ${pedido.chave} and tp_evento = ${pedido.tpEvento} and n_seq = ${pedido.nSeqEvento}
           and estado <> 'rechazado'
         limit 1`);
    if (!vivo[0]) throw new Error('nfe: no se pudo reservar el evento');
    return fila(vivo[0]);
}

function cnpjDoIntento(intento: IntentoRail): string {
    return String((intento.solicitud as SolicitudNfe).emit?.CNPJ ?? '');
}

/** Hora de autorización de la nota (dhRecbto del protocolo). */
export function autorizadaEm(intento: IntentoRail): Date | null {
    const dh = (intento.respuesta as { prot?: { dhRecbto?: string } } | null)?.prot?.dhRecbto;
    const t = dh ? Date.parse(dh) : NaN;
    return Number.isFinite(t) ? new Date(t) : null;
}

export function dentroDoPrazoDeCancelamento(intento: IntentoRail, agora = Date.now()): boolean {
    const em = autorizadaEm(intento);
    return !!em && agora - em.getTime() <= CANCELAMENTO_PRAZO_HORAS * 3600_000;
}

/**
 * Cancela ante la SEFAZ la NF-e de un intento autorizado (evento 110111). No
 * lanza por fallas de la SEFAZ: devuelve el estado (la anulación en Cord solo
 * se confirma con 'registrado').
 */
export async function cancelarNfe(orgId: string, intento: IntentoRail, motivo?: string | null, creadoPor: string | null = null): Promise<ResultadoEvento> {
    const chave = intento.autorizacion;
    const nProt = (intento.respuesta as { prot?: { nProt?: string } } | null)?.prot?.nProt;
    if (intento.estado !== 'autorizado' || !chaveValida(chave) || !nProt) {
        return { estado: 'rechazado', mensaje: 'Esta NF-e no figura como autorizada: no hay nada que cancelar ante la SEFAZ.' };
    }
    const credencial = await credencialNfe(orgId, intento.entorno, documentoFederal(cnpjDoIntento(intento)));
    if (!credencial) return { estado: 'rechazado', mensaje: 'Para cancelar la NF-e sube de nuevo el certificado digital de tu negocio en Ajustes › Datos fiscales.' };
    if (credencial.vencida) return { estado: 'rechazado', mensaje: 'El certificado digital venció. Sube el vigente en Ajustes › Datos fiscales para cancelar la NF-e.' };
    // Un evento ya reservado se continúa aunque haya pasado el plazo (pudo registrarse a tiempo).
    const [previo] = await withOrgTx(orgId, sql`
        select * from nfe_eventos where org_id = ${orgId} and chave = ${chave} and tp_evento = ${EVENTO_CANCELAMENTO.tpEvento} and estado <> 'rechazado' limit 1`);
    if (previo[0]?.estado === 'registrado') return { estado: 'registrado', datos: { nProt: previo[0].n_prot, ya_registrado: true } };
    if (!previo[0] && !dentroDoPrazoDeCancelamento(intento)) {
        return { estado: 'rechazado', mensaje: mensajeEvento('501') };
    }
    const cUF = chave.slice(0, 2);
    const xJust = String(motivo ?? '').trim().length >= 15 ? String(motivo) : XJUST_CANCELAMENTO_PADRAO;
    const pedido = previo[0]
        ? (previo[0].pedido as PedidoEvento)
        : pedidoCancelamento({ entorno: intento.entorno, cUF, cnpj: cnpjDoIntento(intento), chave, nProt, xJust, dhEvento: dataHoraBrasilia(new Date(Date.now() - 10_000)) });
    const ev = previo[0] ? fila(previo[0]) : await reservarEvento(orgId, intento, pedido, creadoPor);
    return enviarEvento(orgId, intento.entorno, autorizadorDaChave(chave), credencial, ev);
}

/** Registra una Carta de Correção (110110) con la siguiente secuencia de la nota. */
export async function registrarCce(orgId: string, intento: IntentoRail, correcao: string, creadoPor: string | null = null): Promise<ResultadoEvento> {
    const chave = intento.autorizacion;
    if (intento.estado !== 'autorizado' || !chaveValida(chave)) return { estado: 'rechazado', mensaje: 'La Carta de Correção solo aplica a una NF-e autorizada.' };
    const texto = String(correcao ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length < 15 || texto.length > 1000) return { estado: 'rechazado', mensaje: 'La corrección debe tener entre 15 y 1000 caracteres.' };
    const credencial = await credencialNfe(orgId, intento.entorno, documentoFederal(cnpjDoIntento(intento)));
    if (!credencial || credencial.vencida) return { estado: 'rechazado', mensaje: 'Sube el certificado digital vigente de tu negocio en Ajustes › Datos fiscales.' };
    const [eventos] = await withOrgTx(orgId, sql`
        select * from nfe_eventos where org_id = ${orgId} and chave = ${chave} and estado <> 'rechazado' order by created_at desc`);
    if (eventos.some((e) => e.tp_evento === EVENTO_CANCELAMENTO.tpEvento && e.estado === 'registrado')) {
        return { estado: 'rechazado', mensaje: 'La NF-e está cancelada: ya no admite Cartas de Correção.' };
    }
    // Una CC-e sin respuesta se resuelve antes de numerar la siguiente.
    const colgada = eventos.find((e) => e.tp_evento === EVENTO_CCE.tpEvento && e.estado !== 'registrado');
    const uf = ufDeCodigo(chave.slice(0, 2))!;
    if (colgada) {
        const r = await enviarEvento(orgId, intento.entorno, AUTORIZADOR_UF[uf], credencial, fila(colgada));
        if (r.estado !== 'registrado') return r;
    }
    const usadas = eventos.filter((e) => e.tp_evento === EVENTO_CCE.tpEvento).map((e) => Number(e.n_seq));
    const nSeq = (usadas.length ? Math.max(...usadas) : 0) + 1;
    if (nSeq > EVENTO_CCE.nSeqMax) return { estado: 'rechazado', mensaje: mensajeEvento('594') };
    const pedido = pedidoCce({ entorno: intento.entorno, cUF: codigoUf(uf), cnpj: cnpjDoIntento(intento), chave, nSeq, xCorrecao: texto, dhEvento: dataHoraBrasilia(new Date(Date.now() - 10_000)) });
    const ev = await reservarEvento(orgId, intento, pedido, creadoPor);
    return enviarEvento(orgId, intento.entorno, AUTORIZADOR_UF[uf], credencial, ev);
}

// ── Inutilização ─────────────────────────────────────────────────────────────

export interface ResultadoInutilizacao {
    estado: 'homologada' | 'rechazada' | 'incierta';
    mensaje?: string;
    nProt?: string;
}

/**
 * Inutiliza un rango de números de la serie de Cord que nunca se usaron. Se
 * verifica en Postgres antes de enviar: un número con una nota viva,
 * autorizada o denegada no se inutiliza.
 */
export async function inutilizarFaixa(orgId: string, entorno: EntornoRail, cnpj: string | null | undefined, p: { serie: number; inicio: number; fim: number; justificativa: string; creadoPor?: string | null }): Promise<ResultadoInutilizacao> {
    const ctx = await contextoNfe(orgId, entorno, cnpj);
    const { inicio, fim, serie } = p;
    if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio < 1 || fim < inicio) return { estado: 'rechazada', mensaje: 'El rango de números no es válido.' };
    if (fim - inicio + 1 > INUTILIZACAO_MAX) return { estado: 'rechazada', mensaje: mensajeEvento('201') };
    const justificativa = String(p.justificativa ?? '').replace(/\s+/g, ' ').trim();
    if (justificativa.length < 15) return { estado: 'rechazada', mensaje: 'La justificación debe tener al menos 15 caracteres.' };
    const s = String(serie);
    const [usados] = await withOrgTx(orgId, sql`
        select numero from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = 'nfe' and entorno = ${entorno} and serie = ${s} and tipo = ${TIPO_SEQUENCIA}
           and numero between ${inicio} and ${fim}
           and (estado in ('pendiente', 'incierto', 'autorizado') or coalesce(respuesta, '{}'::jsonb) ?| array['denegada', 'conflicto'])
         limit 1`);
    if (usados[0]) return { estado: 'rechazada', mensaje: `El número ${usados[0].numero} del rango ya tiene una NF-e. Inutiliza solo números que nunca se usaron.` };
    const [solapa] = await withOrgTx(orgId, sql`
        select id from nfe_inutilizacoes
         where org_id = ${orgId} and entorno = ${entorno} and serie = ${serie} and estado in ('homologada', 'pendiente', 'incierta')
           and n_ini <= ${fim} and n_fin >= ${inicio}
         limit 1`);
    if (solapa[0]) return { estado: 'rechazada', mensaje: 'Parte de ese rango ya está inutilizada o en proceso.' };

    return conSecuencia(orgId, claveSecuencia(entorno, serie), async () => {
        const ano = dataHoraBrasilia(new Date()).slice(2, 4);
        const pedido = pedidoInutilizacao({ entorno, cUF: codigoUf(ctx.uf), ano, cnpj: ctx.documento.numero, serie, nNFIni: inicio, nNFFin: fim, xJust: justificativa });
        const xml = inutilizacaoAssinada(pedido, ctx.credencial.certPem, ctx.credencial.keyPem);
        const [[fila]] = await withOrgTx(orgId, sql`
            insert into nfe_inutilizacoes (org_id, entorno, serie, n_ini, n_fin, justificativa, estado, pedido, xml_pedido, creado_por)
            values (${orgId}, ${entorno}, ${serie}, ${inicio}, ${fim}, ${pedido.xJust}, 'pendiente', ${JSON.stringify(pedido)}::jsonb, ${xml}, ${p.creadoPor ?? null})
            returning id`);
        try {
            const r = await chamarSefaz(entorno, AUTORIZADOR_UF[ctx.uf], 'NfeInutilizacao', xml, ctx.credencial, { timeoutMs: 30_000 });
            const ret = lerRetInut(r.resultado);
            if (!ret) throw new NfeTransporteError(`inutilização: respuesta ilegible (HTTP ${r.status})`, true);
            if (ret.cStat === INUTILIZACAO_HOMOLOGADA && ret.xml) {
                await withOrgTx(orgId, sql`
                    update nfe_inutilizacoes set estado = 'homologada', n_prot = ${ret.nProt || null}, homologada_at = now(),
                           respuesta = ${JSON.stringify({ cStat: ret.cStat, nProt: ret.nProt, dhRecbto: ret.dhRecbto })}::jsonb,
                           proc_xml = ${procInut(xml, ret.xml)}
                     where id = ${fila.id} and org_id = ${orgId}`);
                return { estado: 'homologada', nProt: ret.nProt } as const;
            }
            const mensaje = mensajeEvento(ret.cStat);
            await withOrgTx(orgId, sql`
                update nfe_inutilizacoes set estado = 'rechazada', error_codigo = ${ret.cStat}, error_mensaje = ${mensaje},
                       respuesta = ${JSON.stringify({ cStat: ret.cStat })}::jsonb
                 where id = ${fila.id} and org_id = ${orgId}`);
            return { estado: 'rechazada', mensaje } as const;
        } catch (error) {
            if (!(error instanceof NfeTransporteError)) throw error;
            await withOrgTx(orgId, sql`update nfe_inutilizacoes set estado = 'incierta' where id = ${fila.id} and org_id = ${orgId}`);
            return { estado: 'incierta', mensaje: 'La SEFAZ no respondió. Revisa el estado en unos minutos antes de volver a pedirla.' } as const;
        }
    }, { esperaMaxMs: 12_000 });
}

/** Números de la serie que quedaron sin usar por debajo del último consumido (candidatos a inutilizar). */
export async function numerosSemUso(orgId: string, entorno: EntornoRail, serie: number): Promise<number[]> {
    const s = String(serie);
    const [rows] = await withOrgTx(orgId, sql`
        with consumidos as (
          select numero from fiscal_rail_comprobantes
           where org_id = ${orgId} and rail = 'nfe' and entorno = ${entorno} and serie = ${s} and tipo = ${TIPO_SEQUENCIA}
             and (estado in ('pendiente', 'incierto', 'autorizado') or coalesce(respuesta, '{}'::jsonb) ?| array['denegada', 'conflicto'])
        ), tope as (select max(numero) as n from consumidos)
        select distinct c.numero
          from fiscal_rail_comprobantes c, tope
         where c.org_id = ${orgId} and c.rail = 'nfe' and c.entorno = ${entorno} and c.serie = ${s} and c.tipo = ${TIPO_SEQUENCIA}
           and c.estado in ('rechazado', 'descartado') and c.numero < tope.n
           and not exists (select 1 from consumidos k where k.numero = c.numero)
           and not exists (select 1 from nfe_inutilizacoes i
                            where i.org_id = ${orgId} and i.entorno = ${entorno} and i.serie = ${serie}
                              and i.estado = 'homologada' and c.numero between i.n_ini and i.n_fin)
         order by c.numero
         limit 200`);
    return rows.map((r) => Number(r.numero));
}

/** Eventos de una nota, para la vista de la factura. */
export async function eventosDaNota(orgId: string, chave: string): Promise<{ id: string; tpEvento: string; nSeq: number; estado: string; nProt: string | null; texto: string | null; criadoEm: string; erro: string | null }[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, tp_evento, n_seq, estado, n_prot, pedido, created_at, error_mensaje
          from nfe_eventos where org_id = ${orgId} and chave = ${chave}
         order by created_at asc`);
    return rows.map((r) => ({
        id: String(r.id), tpEvento: String(r.tp_evento), nSeq: Number(r.n_seq), estado: String(r.estado),
        nProt: r.n_prot ? String(r.n_prot) : null,
        texto: (r.pedido?.xCorrecao ?? r.pedido?.xJust ?? null) as string | null,
        criadoEm: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        erro: r.error_mensaje ? String(r.error_mensaje) : null,
    }));
}
