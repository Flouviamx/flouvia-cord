// Cola de envío a la solución pública de facturación electrónica (SPFE): el
// outbox del riel, mismo patrón que Verifactu (verifactu/submit.ts) y que los
// rieles de LatAm (latam/resolucion.ts).
//
// Una pasada por organización y entorno, con un solo proceso en vuelo (lease
// en spfe_envio_estado):
//   1. DESCUBRE lo que hay que comunicar, sin red:
//      - cada factura de España emitida desde que el riel se encendió para la
//        organización (`activado_at`) y que la SPFE admite (factura.ts);
//      - la baja de una factura admitida que Cord anuló;
//      - el siguiente estado de cobro del emisor (estados.ts) a partir de los
//        cobros reales, ya conciliados por `reconcileInvoice`.
//      Cada mensaje se escribe con su XML ANTES de enviarse; el número de orden
//      por factura y el índice único de la factura viva son la idempotencia.
//   2. ENVÍA lo pendiente, marcando `enviado_at` ANTES de hablar con la SPFE.
//   3. RESUELVE por consulta lo que salió y no tuvo respuesta. Nunca reenvía un
//      mensaje que salió: si la SPFE no lo tiene, el intento se descarta y la
//      siguiente pasada escribe uno nuevo.
//   4. RECOGE los estados que comunicó el destinatario (pago o rechazo).
//
// Carriles (regla 30): el barrido entre organizaciones es solo sobre `orgs`
// (withSystemTx, cron validado); todo lo demás va en withOrgTx con el org_id.

import { createHash, randomUUID } from 'node:crypto';
import { sql, withOrgTx, withSystemTx } from '../../db';
import { decryptSecret } from '../../crypto-secret';
import { log } from '../../log';
import { loadInvoiceDocumentRow } from '../invoice-download';
import { sourceFromRow } from '../einvoice/server';
import { isoDayIn } from '../einvoice/model';
import { credencialesTls } from '../verifactu/cert';
import { spfeConfig, type EntornoSpfe } from './config';
import { assessSpfe, claveCodigo, type SpfeCodigo, type SpfeResumen } from './factura';
import {
    CODIGO_DE, estadoCobroDeseado, estadoComunicado, mensajeBaja, mensajeEstadoEmisor, siguienteMensajeEstado,
    type FacturaInformada, type MensajeEstadoPrevio, type TipoMensaje,
} from './estados';
import {
    MAX_POR_CONSULTA, MAX_POR_REMESA, SpfePeticionRechazadaError, SpfeSinRespuestaError, transporteAeat, transporteDisponible,
    type FacturaConsultada, type ItemEnvio, type RespuestaEnvio, type SpfeTransporte,
} from './transporte';

/** Antigüedad mínima para consultar un mensaje que salió sin respuesta. */
export const ANTIGUEDAD_CONSULTA_S = 120;
/** Pausa tras un rechazo de la petición (certificado, representación, servicio caído). */
const PAUSA_PETICION_S = 15 * 60;
/** Cada cuánto se consultan los estados que comunicó el destinatario. */
const INTERVALO_DESTINATARIO_S = 6 * 3600;
const MAX_ALTAS_POR_PASADA = 50;
const MAX_ESTADOS_POR_PASADA = 500;
const MAX_CONSULTA_DESTINATARIO = 1000;

const TIPOS_FACTURA = ['commercial_invoice', 'verifactu_invoice', 'commercial_credit_note', 'verifactu_credit_note', 'credit_note'];

export interface ResultadoSpfeOrg {
    orgId: string;
    encolados: number;
    enviados: number;
    admitidos: number;
    rechazados: number;
    inciertos: number;
    resueltosPorConsulta: number;
    estadosDestinatario: number;
    /** No se hizo nada: interruptor apagado, sin transporte, otra pasada en curso, en pausa. */
    omitido?: string;
    error?: string;
}

const vacio = (orgId: string): ResultadoSpfeOrg => ({
    orgId, encolados: 0, enviados: 0, admitidos: 0, rechazados: 0, inciertos: 0, resueltosPorConsulta: 0, estadosDestinatario: 0,
});

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Organizaciones españolas que pueden usar la SPFE: con certificado (el mismo
 * de Verifactu, que identifica al remitente, Orden art. 11.1), sin sandbox ni
 * demo. Barrido de SISTEMA solo sobre `orgs`; el trabajo vuelve a withOrgTx.
 */
export async function orgsSpfe(): Promise<string[]> {
    const [rows] = await withSystemTx(sql`
        select id from orgs
         where upper(coalesce(country_code, '')) = 'ES'
           and verifactu_cert_enc is not null
           and sandbox_of is null and is_demo is not true
         order by id`);
    return rows.map((r: any) => String(r.id));
}

export interface OpcionesSpfe {
    /** Transporte a usar; sin él se construye el real (hoy no existe). */
    transporte?: SpfeTransporte | null;
    /** Instante (ms) a partir del cual no se empieza otro envío o consulta. */
    deadline?: number;
}

/** El transporte real del negocio, o null si no existe o falta el certificado. */
async function transporteDeOrg(orgId: string, entorno: EntornoSpfe): Promise<{ transporte: SpfeTransporte | null; motivo?: string }> {
    // Sin especificación publicada no hay adaptador: ni se descifra el certificado.
    if (!transporteDisponible()) return { transporte: null, motivo: 'transporte_no_publicado' };
    const [[org]] = await withOrgTx(orgId, sql`
        select verifactu_cert_enc, verifactu_cert_pass_enc, verifactu_cert_caduca from orgs where id = ${orgId} limit 1`);
    const p12 = org?.verifactu_cert_enc ? decryptSecret(String(org.verifactu_cert_enc)) : null;
    const pass = org?.verifactu_cert_pass_enc ? decryptSecret(String(org.verifactu_cert_pass_enc)) : null;
    if (!p12 || !pass) return { transporte: null, motivo: 'sin_certificado' };
    const caduca = org.verifactu_cert_caduca instanceof Date
        ? org.verifactu_cert_caduca.toISOString().slice(0, 10) : String(org.verifactu_cert_caduca || '').slice(0, 10);
    if (caduca && caduca < new Date().toISOString().slice(0, 10)) return { transporte: null, motivo: 'certificado_caducado' };
    try {
        return { transporte: transporteAeat(entorno, credencialesTls(Buffer.from(p12, 'base64'), pass)) };
    } catch {
        return { transporte: null, motivo: 'certificado_invalido' };
    }
}

async function zonaDe(orgId: string): Promise<string> {
    const [[org]] = await withOrgTx(orgId, sql`select zona_horaria from orgs where id = ${orgId} limit 1`);
    return String(org?.zona_horaria || 'Europe/Madrid');
}

// ── 1. Descubrir ─────────────────────────────────────────────────────────────

/** Escribe un mensaje con el siguiente número de orden de su factura. Null si otro proceso se adelantó. */
async function encolar(orgId: string, m: {
    id?: string; documentoId: string; entorno: EntornoSpfe; tipo: TipoMensaje; codigo: SpfeCodigo; xml: string; datos: Record<string, unknown>;
}): Promise<string | null> {
    const id = m.id ?? randomUUID();
    const [rows] = await withOrgTx(orgId, sql`
        insert into spfe_mensajes (id, org_id, documento_id, entorno, orden, tipo, codigo_unico, xml, xml_sha256, datos)
        select ${id}, ${orgId}, ${m.documentoId}, ${m.entorno},
               coalesce((select max(orden) from spfe_mensajes where documento_id = ${m.documentoId} and entorno = ${m.entorno}), 0) + 1,
               ${m.tipo}, ${claveCodigo(m.codigo)}, ${m.xml}, ${sha256(m.xml)}, ${JSON.stringify(m.datos)}::jsonb
        on conflict do nothing
        returning id`);
    return rows[0] ? String(rows[0].id) : null;
}

/** aaaa-mm-dd del último pago, si la factura está pagada con dinero cobrado. */
async function pagadaEl(orgId: string, documentoId: string, zona: string): Promise<string | null> {
    const [[d]] = await withOrgTx(orgId, sql`
        select d.lifecycle, d.amount_paid, d.amount_refunded,
               (select max(p.aplicado_at) from documento_pagos p where p.documento_id = d.id and p.org_id = d.org_id) as ultimo_pago
          from documentos_fiscales d where d.id = ${documentoId} and d.org_id = ${orgId} limit 1`);
    if (!d || d.lifecycle !== 'paid' || !d.ultimo_pago) return null;
    if (Math.round((Number(d.amount_paid) - Number(d.amount_refunded)) * 100) <= 0) return null;
    return isoDayIn(d.ultimo_pago, zona);
}

/** Datos de la factura que viajan en cada mensaje posterior al alta. */
interface DatosAlta extends SpfeResumen {
    nifEmisor: string;
    numero: string;
    fecha: string;
}

function facturaInformada(datos: DatosAlta): FacturaInformada {
    return { nifEmisor: datos.nifEmisor, numero: datos.numero, fecha: datos.fecha, nombreEmisor: datos.nombreEmisor };
}

async function descubrirAltas(orgId: string, entorno: EntornoSpfe, zona: string): Promise<number> {
    const [candidatas] = await withOrgTx(orgId, sql`
        select d.id from documentos_fiscales d
         where d.org_id = ${orgId} and d.status = 'issued' and d.lifecycle <> 'void'
           and upper(coalesce(d.country_code, '')) = 'ES'
           and d.document_type = any(${TIPOS_FACTURA}::text[])
           and d.issued_at >= (select e.activado_at from spfe_envio_estado e where e.org_id = ${orgId} and e.entorno = ${entorno})
           and not exists (select 1 from spfe_mensajes m
                            where m.documento_id = d.id and m.entorno = ${entorno} and m.tipo = 'alta'
                              and m.estado in ('pendiente', 'incierto', 'admitido', 'rechazado'))
         order by d.issued_at asc
         limit ${MAX_ALTAS_POR_PASADA}`);
    let n = 0;
    for (const c of candidatas) {
        const documentoId = String(c.id);
        const row = await loadInvoiceDocumentRow(orgId, documentoId);
        if (!row) continue;
        const vf = row.provider_data?.verifactu;
        const a = assessSpfe({
            ...sourceFromRow(row),
            qrUrl: vf?.qrUrl ? String(vf.qrUrl) : null,
            tipoRectificativa: vf?.tipoFactura ? String(vf.tipoFactura) : null,
            pagadaEl: await pagadaEl(orgId, documentoId, zona),
        });
        // Lo que falta se ve en el detalle de la factura (estado.ts), calculado
        // en vivo: no se encola un documento que la SPFE rechazaría.
        if (!a.xml || !a.codigo || !a.resumen) continue;
        const datos: DatosAlta = { ...a.resumen, ...a.codigo };
        if (await encolar(orgId, { documentoId, entorno, tipo: 'alta', codigo: a.codigo, xml: a.xml, datos: datos as unknown as Record<string, unknown> })) n++;
    }
    return n;
}

async function descubrirBajas(orgId: string, entorno: EntornoSpfe, zona: string): Promise<number> {
    const [rows] = await withOrgTx(orgId, sql`
        select m.id, m.documento_id, m.estado, m.enviado_at, m.datos, d.voided_at
          from spfe_mensajes m
          join documentos_fiscales d on d.id = m.documento_id and d.org_id = m.org_id
         where m.org_id = ${orgId} and m.entorno = ${entorno} and m.tipo = 'alta'
           and m.estado in ('pendiente', 'admitido') and d.lifecycle = 'void'
           and not exists (select 1 from spfe_mensajes b
                            where b.documento_id = m.documento_id and b.entorno = m.entorno and b.tipo = 'baja'
                              and b.estado in ('pendiente', 'incierto', 'admitido', 'rechazado'))
         limit 100`);
    let n = 0;
    for (const r of rows) {
        if (r.estado === 'pendiente') {
            // Nunca salió: se descarta sin baja. Si salió (enviado_at), primero se consulta.
            if (!r.enviado_at) {
                await withOrgTx(orgId, sql`
                    update spfe_mensajes set estado = 'descartado', resuelto_at = now(),
                           error_mensaje = 'La factura se anuló antes de enviarse a la solución pública.'
                     where id = ${r.id} and org_id = ${orgId} and estado = 'pendiente' and enviado_at is null`);
            }
            continue;
        }
        const datos = r.datos as DatosAlta;
        const id = randomUUID();
        const hoy = isoDayIn(new Date(), zona);
        const xml = mensajeBaja({
            factura: facturaInformada(datos),
            cabecera: { id, fecha: hoy },
            fechaBaja: r.voided_at ? isoDayIn(r.voided_at, zona) : hoy,
        });
        if (await encolar(orgId, { id, documentoId: String(r.documento_id), entorno, tipo: 'baja', codigo: datos, xml, datos: { ...facturaInformada(datos) } })) n++;
    }
    return n;
}

async function descubrirEstados(orgId: string, entorno: EntornoSpfe, zona: string): Promise<number> {
    const [docs, mensajes, pagos] = await withOrgTx(orgId,
        // Facturas admitidas, vivas y sin mensajes en vuelo que PUEDEN necesitar
        // un estado: pagadas, incobrables o con un estado ya comunicado.
        sql`select d.id, d.lifecycle, d.amount_paid, d.amount_refunded, d.due_date::text as vencimiento,
                   a.datos as alta
              from spfe_mensajes a
              join documentos_fiscales d on d.id = a.documento_id and d.org_id = a.org_id
             where a.org_id = ${orgId} and a.entorno = ${entorno} and a.tipo = 'alta' and a.estado = 'admitido'
               and d.lifecycle <> 'void' and (a.datos->>'tipoFactura') = '380'
               and not exists (select 1 from spfe_mensajes x where x.documento_id = a.documento_id and x.entorno = a.entorno
                                and x.estado in ('pendiente', 'incierto'))
               and not exists (select 1 from spfe_mensajes b where b.documento_id = a.documento_id and b.entorno = a.entorno
                                and b.tipo = 'baja' and b.estado = 'admitido')
               and (d.lifecycle in ('paid', 'uncollectible')
                    or exists (select 1 from spfe_mensajes s where s.documento_id = a.documento_id and s.entorno = a.entorno
                                and s.tipo in ('cobro', 'impago') and s.estado = 'admitido'))
             order by d.updated_at desc
             limit ${MAX_ESTADOS_POR_PASADA}`,
        sql`select documento_id, tipo, estado, datos, orden from spfe_mensajes
             where org_id = ${orgId} and entorno = ${entorno} and tipo in ('cobro', 'anula_cobro', 'impago', 'anula_impago')
             order by documento_id, orden`,
        sql`select p.documento_id, max(p.aplicado_at) as ultimo from documento_pagos p
             where p.org_id = ${orgId}
               and exists (select 1 from spfe_mensajes a where a.documento_id = p.documento_id and a.entorno = ${entorno}
                            and a.tipo = 'alta' and a.estado = 'admitido')
             group by p.documento_id`,
    );
    const porDoc = new Map<string, MensajeEstadoPrevio[]>();
    for (const m of mensajes) {
        const k = String(m.documento_id);
        porDoc.set(k, [...(porDoc.get(k) ?? []), { tipo: m.tipo as TipoMensaje, estado: String(m.estado), datos: m.datos ?? null }]);
    }
    const ultimoPago = new Map<string, string>(pagos.filter((p: any) => p.ultimo).map((p: any) => [String(p.documento_id), isoDayIn(p.ultimo, zona)]));
    let n = 0;
    for (const d of docs) {
        const documentoId = String(d.id);
        const alta = d.alta as DatosAlta;
        const previos = porDoc.get(documentoId) ?? [];
        const deseado = estadoCobroDeseado({
            lifecycle: String(d.lifecycle), amountPaid: Number(d.amount_paid), amountRefunded: Number(d.amount_refunded),
            vencimiento: d.vencimiento ? String(d.vencimiento).slice(0, 10) : null, esRectificativa: false,
        }, ultimoPago.has(documentoId) ? [ultimoPago.get(documentoId)!] : []);
        const siguiente = siguienteMensajeEstado(deseado, estadoComunicado(alta.pagadaEl ?? null, previos), alta.vencimiento);
        if (!siguiente) continue;
        // El mismo mensaje que la SPFE ya rechazó no se repite solo: queda a la
        // vista en la factura para que alguien lo revise.
        const ultimo = previos.at(-1);
        if (ultimo?.estado === 'rechazado' && ultimo.tipo === siguiente.tipo
            && JSON.stringify(ultimo.datos ?? {}) === JSON.stringify(siguiente.datos)) continue;
        const id = randomUUID();
        const xml = mensajeEstadoEmisor({
            codigo: CODIGO_DE[siguiente.tipo],
            factura: facturaInformada(alta),
            cabecera: { id, fecha: isoDayIn(new Date(), zona) },
            fechaCobro: siguiente.datos.fechaCobro ?? null,
            vencimiento: siguiente.datos.vencimiento ?? null,
        });
        if (await encolar(orgId, { id, documentoId, entorno, tipo: siguiente.tipo, codigo: alta, xml, datos: siguiente.datos })) n++;
    }
    return n;
}

// ── 2. Enviar ────────────────────────────────────────────────────────────────

interface FilaMensaje {
    id: string;
    tipo: TipoMensaje;
    codigo: SpfeCodigo;
    xml: string;
    datos: Record<string, any>;
}

function codigoDeClave(clave: string): SpfeCodigo {
    const [nifEmisor, numero, fecha] = clave.split('|');
    return { nifEmisor, numero, fecha };
}

const SERVICIO: Record<TipoMensaje, 'remitirFacturas' | 'anularFacturas' | 'comunicarEstados'> = {
    alta: 'remitirFacturas', baja: 'anularFacturas',
    cobro: 'comunicarEstados', anula_cobro: 'comunicarEstados', impago: 'comunicarEstados', anula_impago: 'comunicarEstados',
};

async function aplicarRespuesta(orgId: string, filas: FilaMensaje[], respuesta: RespuestaEnvio, r: ResultadoSpfeOrg): Promise<void> {
    for (const f of filas) {
        const linea = respuesta.resultados.get(f.id);
        if (!linea || (linea.resultado === 'rechazado' && linea.duplicado)) {
            // Sin línea, o "ya existe": no hay prueba de qué tiene la SPFE. Lo
            // resuelve la consulta, nunca un reenvío.
            await withOrgTx(orgId, sql`
                update spfe_mensajes set estado = 'incierto',
                       respuesta = ${JSON.stringify({ csv: respuesta.csv ?? null, linea: linea ?? null })}::jsonb,
                       error_mensaje = ${linea ? 'La solución pública ya tenía este documento; se confirmará consultándolo.' : 'La solución pública no devolvió respuesta para este documento.'}
                 where id = ${f.id} and org_id = ${orgId} and estado = 'pendiente'`);
            r.inciertos++;
            continue;
        }
        if (linea.resultado === 'admitido') {
            await withOrgTx(orgId, sql`
                update spfe_mensajes set estado = 'admitido', resuelto_at = now(),
                       csv = ${linea.csv ?? respuesta.csv ?? null}, localizador = ${linea.localizador ?? null},
                       respuesta = ${JSON.stringify({ csv: respuesta.csv ?? null, linea })}::jsonb, error_codigo = null, error_mensaje = null
                 where id = ${f.id} and org_id = ${orgId} and estado = 'pendiente'`);
            r.admitidos++;
        } else {
            await withOrgTx(orgId, sql`
                update spfe_mensajes set estado = 'rechazado', resuelto_at = now(),
                       respuesta = ${JSON.stringify({ csv: respuesta.csv ?? null, linea })}::jsonb,
                       error_codigo = ${linea.codigo ?? null}, error_mensaje = ${String(linea.descripcion || '').slice(0, 1000)}
                 where id = ${f.id} and org_id = ${orgId} and estado = 'pendiente'`);
            r.rechazados++;
        }
    }
}

/** Envía lo pendiente. Devuelve false si la SPFE rechazó la petición (hay que pausar). */
async function enviarPendientes(orgId: string, entorno: EntornoSpfe, transporte: SpfeTransporte, deadline: number, r: ResultadoSpfeOrg): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, tipo, codigo_unico, xml, datos from spfe_mensajes
         where org_id = ${orgId} and entorno = ${entorno} and estado = 'pendiente' and enviado_at is null
         order by created_at asc, orden asc
         limit ${MAX_POR_REMESA * 5}`);
    const porServicio = new Map<string, FilaMensaje[]>();
    for (const row of rows) {
        const f: FilaMensaje = { id: String(row.id), tipo: row.tipo as TipoMensaje, codigo: codigoDeClave(String(row.codigo_unico)), xml: String(row.xml), datos: row.datos ?? {} };
        const s = SERVICIO[f.tipo];
        porServicio.set(s, [...(porServicio.get(s) ?? []), f]);
    }
    // Las facturas antes que sus bajas y sus estados.
    for (const servicio of ['remitirFacturas', 'anularFacturas', 'comunicarEstados'] as const) {
        const filas = porServicio.get(servicio) ?? [];
        for (let i = 0; i < filas.length; i += MAX_POR_REMESA) {
            if (Date.now() >= deadline) return true;
            const lote = filas.slice(i, i + MAX_POR_REMESA);
            // Se marca ANTES de enviar: si el proceso muere a mitad, lo marcado
            // se trata como enviado sin respuesta y se consulta.
            const [marcadas] = await withOrgTx(orgId, sql`
                update spfe_mensajes set enviado_at = now(), intentos = intentos + 1
                 where org_id = ${orgId} and id = any(${lote.map((f) => f.id)}::uuid[]) and estado = 'pendiente' and enviado_at is null
                returning id`);
            const ids = new Set(marcadas.map((m: any) => String(m.id)));
            const enviar = lote.filter((f) => ids.has(f.id));
            if (!enviar.length) continue;
            const items: ItemEnvio[] = enviar.map((f) => ({ id: f.id, codigo: f.codigo, xml: f.xml }));
            try {
                const respuesta = await transporte[servicio](items);
                r.enviados += enviar.length;
                await aplicarRespuesta(orgId, enviar, respuesta, r);
            } catch (error) {
                if (error instanceof SpfePeticionRechazadaError) {
                    // Nada se procesó: vuelve a la cola tal cual y la organización se pausa.
                    await withOrgTx(orgId, sql`
                        update spfe_mensajes set enviado_at = null, error_mensaje = ${error.message.slice(0, 1000)}
                         where org_id = ${orgId} and id = any(${[...ids]}::uuid[]) and estado = 'pendiente'`);
                    r.error = error.message;
                    return false;
                }
                // Sin respuesta legible (o un fallo que no sabemos clasificar):
                // incierto. Solo la consulta lo resuelve.
                const detalle = error instanceof SpfeSinRespuestaError ? error.message : 'Fallo al comunicarse con la solución pública.';
                if (!(error instanceof SpfeSinRespuestaError)) log.error('spfe: fallo no clasificado al enviar', { route: 'fiscal/spfe', orgId, err: error });
                await withOrgTx(orgId, sql`
                    update spfe_mensajes set estado = 'incierto', error_mensaje = ${detalle.slice(0, 1000)}
                     where org_id = ${orgId} and id = any(${[...ids]}::uuid[]) and estado = 'pendiente'`);
                r.inciertos += enviar.length;
            }
        }
    }
    return true;
}

// ── 3. Resolver por consulta ────────────────────────────────────────────────

/** Qué dice la consulta de un mensaje: admitido (la SPFE tiene su efecto), descartado (no lo tiene). */
export function veredictoConsulta(tipo: TipoMensaje, datos: Record<string, any>, f: FacturaConsultada): 'admitido' | 'descartado' {
    const emisor = f.estadoEmisor?.codigo ?? null;
    switch (tipo) {
        case 'alta': return f.consta ? 'admitido' : 'descartado';
        case 'baja': return f.consta ? 'descartado' : 'admitido';
        case 'cobro': return f.consta && emisor === 'SETTLEMENT' && (!f.estadoEmisor?.fecha || f.estadoEmisor.fecha === datos.fechaCobro) ? 'admitido' : 'descartado';
        case 'impago': return f.consta && emisor === 'DEFAULT' ? 'admitido' : 'descartado';
        case 'anula_cobro': return f.consta && emisor !== 'SETTLEMENT' ? 'admitido' : 'descartado';
        case 'anula_impago': return f.consta && emisor !== 'DEFAULT' ? 'admitido' : 'descartado';
    }
}

async function resolverInciertos(orgId: string, entorno: EntornoSpfe, transporte: SpfeTransporte, deadline: number, r: ResultadoSpfeOrg): Promise<void> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, tipo, codigo_unico, datos from spfe_mensajes
         where org_id = ${orgId} and entorno = ${entorno}
           and (estado = 'incierto' or (estado = 'pendiente' and enviado_at is not null))
           and coalesce(enviado_at, created_at) < now() - make_interval(secs => ${ANTIGUEDAD_CONSULTA_S}::int)
         order by created_at asc
         limit 200`);
    for (let i = 0; i < rows.length; i += MAX_POR_CONSULTA) {
        if (Date.now() >= deadline) return;
        const lote = rows.slice(i, i + MAX_POR_CONSULTA);
        const claves = [...new Set(lote.map((m: any) => String(m.codigo_unico)))];
        let consultadas: FacturaConsultada[];
        try {
            consultadas = await transporte.consultarFacturas(claves.map(codigoDeClave));
        } catch (error) {
            const detalle = error instanceof Error ? error.message : String(error);
            await withOrgTx(orgId, sql`
                update spfe_mensajes set consultado_at = now(), error_mensaje = ${`Consulta sin respuesta: ${detalle}`.slice(0, 1000)}
                 where org_id = ${orgId} and id = any(${lote.map((m: any) => String(m.id))}::uuid[]) and estado in ('pendiente', 'incierto')`);
            if (error instanceof SpfePeticionRechazadaError) r.error = detalle;
            return;
        }
        const porClave = new Map(consultadas.map((f) => [claveCodigo(f.codigo), f]));
        for (const m of lote) {
            const f = porClave.get(String(m.codigo_unico));
            if (!f) {
                await withOrgTx(orgId, sql`update spfe_mensajes set consultado_at = now() where id = ${m.id} and org_id = ${orgId}`);
                continue;
            }
            const veredicto = veredictoConsulta(m.tipo as TipoMensaje, m.datos ?? {}, f);
            const [hecho] = await withOrgTx(orgId, sql`
                update spfe_mensajes set estado = ${veredicto}, consultado_at = now(), resuelto_at = now(),
                       localizador = coalesce(localizador, ${veredicto === 'admitido' ? (f.localizador ?? null) : null}),
                       error_mensaje = ${veredicto === 'admitido' ? null : 'La solución pública no lo registró; se volverá a enviar.'}
                 where id = ${m.id} and org_id = ${orgId} and estado in ('pendiente', 'incierto')
                returning id`);
            if (hecho[0]) r.resueltosPorConsulta++;
        }
    }
}

// ── 4. Estados del destinatario ──────────────────────────────────────────────

async function recogerEstadosDestinatario(orgId: string, entorno: EntornoSpfe, transporte: SpfeTransporte, deadline: number, r: ResultadoSpfeOrg): Promise<void> {
    const [[e]] = await withOrgTx(orgId, sql`
        select (proxima_consulta_at is null or proxima_consulta_at <= now()) as toca
          from spfe_envio_estado where org_id = ${orgId} and entorno = ${entorno}`);
    if (!e?.toca) return;
    const [altas] = await withOrgTx(orgId, sql`
        select a.documento_id, a.codigo_unico from spfe_mensajes a
         where a.org_id = ${orgId} and a.entorno = ${entorno} and a.tipo = 'alta' and a.estado = 'admitido'
           and a.created_at > now() - interval '400 days'
           and not exists (select 1 from spfe_mensajes b where b.documento_id = a.documento_id and b.entorno = a.entorno
                            and b.tipo = 'baja' and b.estado = 'admitido')
         order by a.created_at desc
         limit ${MAX_CONSULTA_DESTINATARIO}`);
    const docPorClave = new Map(altas.map((a: any) => [String(a.codigo_unico), String(a.documento_id)]));
    const claves = [...docPorClave.keys()];
    for (let i = 0; i < claves.length; i += MAX_POR_CONSULTA) {
        if (Date.now() >= deadline) return;
        let consultadas: FacturaConsultada[];
        try {
            consultadas = await transporte.consultarFacturas(claves.slice(i, i + MAX_POR_CONSULTA).map(codigoDeClave));
        } catch (error) {
            log.warn('spfe: no se pudieron consultar los estados del destinatario', { route: 'fiscal/spfe', orgId, err: error });
            return;
        }
        for (const f of consultadas) {
            const documentoId = docPorClave.get(claveCodigo(f.codigo));
            if (!documentoId) continue;
            for (const s of f.estadosDestinatario ?? []) {
                const [ins] = await withOrgTx(orgId, sql`
                    insert into spfe_estados_destinatario (org_id, documento_id, entorno, codigo, fecha, motivo, vencimiento)
                    values (${orgId}, ${documentoId}, ${entorno}, ${s.codigo}, ${s.fecha}::date, ${s.motivo ?? null}, ${s.vencimiento ?? null}::date)
                    on conflict do nothing
                    returning id`);
                if (ins[0]) r.estadosDestinatario++;
            }
        }
    }
    await withOrgTx(orgId, sql`
        update spfe_envio_estado set proxima_consulta_at = now() + make_interval(secs => ${INTERVALO_DESTINATARIO_S}::int), updated_at = now()
         where org_id = ${orgId} and entorno = ${entorno}`);
}

// ── Pasada completa ─────────────────────────────────────────────────────────

/** Tras un rechazo de la petición: nada se procesó y la organización espera antes de volver a intentarlo. */
async function pausar(orgId: string, entorno: EntornoSpfe, r: ResultadoSpfeOrg): Promise<void> {
    await withOrgTx(orgId, sql`
        update spfe_envio_estado
           set proximo_envio_at = now() + make_interval(secs => ${PAUSA_PETICION_S}::int),
               ultimo_error = ${String(r.error || '').slice(0, 1000)}, updated_at = now()
         where org_id = ${orgId} and entorno = ${entorno}`);
}

/**
 * Una pasada de la cola para UNA organización. Aislada por diseño: nunca lanza
 * por un fallo de la SPFE (lo devuelve en `error`), y el fallo de una
 * organización no detiene a las demás.
 */
export async function procesarOrgSpfe(orgId: string, opciones: OpcionesSpfe = {}): Promise<ResultadoSpfeOrg> {
    const r = vacio(orgId);
    const config = spfeConfig();
    if (!config.habilitado) { r.omitido = 'apagado'; return r; }
    const entorno = config.entorno;
    const deadline = opciones.deadline ?? Date.now() + 60_000;

    let transporte = opciones.transporte;
    if (transporte === undefined) {
        const t = await transporteDeOrg(orgId, entorno);
        if (!t.transporte) { r.omitido = t.motivo ?? 'sin_transporte'; return r; }
        transporte = t.transporte;
    }
    if (!transporte) { r.omitido = 'sin_transporte'; return r; }

    const token = randomUUID();
    const leaseS = Math.max(60, Math.ceil((deadline - Date.now()) / 1000) + 60);
    const [, tomado] = await withOrgTx(orgId,
        sql`insert into spfe_envio_estado (org_id, entorno) values (${orgId}, ${entorno}) on conflict (org_id, entorno) do nothing`,
        sql`update spfe_envio_estado
               set lease_hasta = now() + make_interval(secs => ${leaseS}::int), lease_token = ${token}, updated_at = now()
             where org_id = ${orgId} and entorno = ${entorno} and (lease_hasta is null or lease_hasta < now())
            returning (proximo_envio_at is not null and proximo_envio_at > now()) as en_pausa`,
    );
    if (!tomado[0]) { r.omitido = 'en_curso'; return r; }
    const enPausa = tomado[0].en_pausa === true;

    try {
        const zona = await zonaDe(orgId);
        r.encolados += await descubrirAltas(orgId, entorno, zona);
        r.encolados += await descubrirBajas(orgId, entorno, zona);
        r.encolados += await descubrirEstados(orgId, entorno, zona);
        if (enPausa) { r.omitido = 'en_pausa'; return r; }

        const sigue = await enviarPendientes(orgId, entorno, transporte, deadline, r);
        if (!sigue) {
            await pausar(orgId, entorno, r);
            return r;
        }
        const resueltosAntes = r.resueltosPorConsulta;
        await resolverInciertos(orgId, entorno, transporte, deadline, r);
        // Lo que la consulta dio por descartado (o lo que un cobro admitido
        // destrabó) vuelve a la cola y sale en esta misma pasada: ya se sabe
        // que la SPFE no lo tiene, así que no es un reenvío a ciegas.
        if (r.resueltosPorConsulta > resueltosAntes || r.admitidos > 0) {
            const nuevos = await descubrirAltas(orgId, entorno, zona)
                + await descubrirBajas(orgId, entorno, zona)
                + await descubrirEstados(orgId, entorno, zona);
            r.encolados += nuevos;
            if (nuevos && !(await enviarPendientes(orgId, entorno, transporte, deadline, r))) {
                await pausar(orgId, entorno, r);
                return r;
            }
        }
        await recogerEstadosDestinatario(orgId, entorno, transporte, deadline, r);
        await withOrgTx(orgId, sql`
            update spfe_envio_estado
               set ultimo_envio_at = case when ${r.enviados > 0} then now() else ultimo_envio_at end,
                   ultimo_error = ${r.error ?? null}, updated_at = now()
             where org_id = ${orgId} and entorno = ${entorno}`);
    } catch (error) {
        log.error('spfe: la pasada de la cola falló', { route: 'fiscal/spfe', orgId, err: error });
        r.error = 'fallo no controlado';
    } finally {
        await withOrgTx(orgId, sql`
            update spfe_envio_estado set lease_hasta = null, lease_token = null, updated_at = now()
             where org_id = ${orgId} and entorno = ${entorno} and lease_token = ${token}`).catch(() => {});
    }
    return r;
}
