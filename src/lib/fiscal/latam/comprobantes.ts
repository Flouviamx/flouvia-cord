// Intentos de autorización ante la autoridad (`fiscal_rail_comprobantes`) y el
// lease de cada secuencia de numeración (`fiscal_rail_secuencias`).
//
// Contrato que sostiene el "nunca dos veces, nunca a ciegas":
//   1. El número se RECLAMA (fila `pendiente`) antes de hablar con la
//      autoridad; `solicitud` guarda exactamente lo que se va a enviar.
//   2. `enviado_at` se marca ANTES de enviar: sin él, el intento seguro no
//      salió y se puede descartar sin consultar.
//   3. Una respuesta ilegible deja el intento `incierto`; solo una CONSULTA a
//      la autoridad lo resuelve (autorizado o descartado). Nunca se reenvía.
//   4. Una secuencia (ARCA: punto de venta + tipo) tiene como mucho un intento
//      en vuelo: lease por fila con vencimiento, no advisory lock (el driver
//      HTTP de Neon no lo sostiene entre llamadas).
// Los índices únicos parciales y el trigger de inmutabilidad de db/schema.sql
// son la segunda línea de defensa de todo lo anterior.

import { randomUUID } from 'node:crypto';
import { sql, withOrgTx } from '../../db';
import { RailTransitorioError, MSG_OCUPADO } from './errores';
import type { EntornoRail, EstadoComprobante, RailId } from './rieles';

export interface IntentoRail {
    id: string;
    orgId: string;
    documentoId: string;
    rail: RailId;
    entorno: EntornoRail;
    serie: string;
    tipo: string;
    numero: number;
    estado: EstadoComprobante;
    solicitud: Record<string, any>;
    respuesta: Record<string, any> | null;
    autorizacion: string | null;
    autorizacionVence: string | null;
    observaciones: { code: number; msg?: string; mensaje?: string }[];
    errorCodigo: string | null;
    errorMensaje: string | null;
    intentos: number;
    creadoAt: string;
    enviadoAt: string | null;
    resueltoAt: string | null;
}

const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString()) : null);

function fila(r: Record<string, any>): IntentoRail {
    return {
        id: String(r.id),
        orgId: String(r.org_id),
        documentoId: String(r.documento_id),
        rail: r.rail as RailId,
        entorno: r.entorno === 'produccion' ? 'produccion' : 'homologacion',
        serie: String(r.serie),
        tipo: String(r.tipo),
        numero: Number(r.numero),
        estado: String(r.estado) as EstadoComprobante,
        solicitud: (r.solicitud ?? {}) as Record<string, any>,
        respuesta: (r.respuesta ?? null) as Record<string, any> | null,
        autorizacion: r.autorizacion ? String(r.autorizacion) : null,
        autorizacionVence: r.autorizacion_vence
            ? (r.autorizacion_vence instanceof Date ? r.autorizacion_vence.toISOString() : String(r.autorizacion_vence)).slice(0, 10)
            : null,
        observaciones: Array.isArray(r.observaciones) ? r.observaciones : [],
        errorCodigo: r.error_codigo ? String(r.error_codigo) : null,
        errorMensaje: r.error_mensaje ? String(r.error_mensaje) : null,
        intentos: Number(r.intentos) || 0,
        creadoAt: iso(r.created_at) ?? '',
        enviadoAt: iso(r.enviado_at),
        resueltoAt: iso(r.resuelto_at),
    };
}

/** Un intento por id, releído (el que se tenía en memoria pudo resolverse en otra instancia). */
export async function intentoPorId(orgId: string, id: string): Promise<IntentoRail | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes where id = ${id} and org_id = ${orgId} limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** El intento vivo (pendiente, incierto o autorizado) de un documento, si existe. */
export async function intentoVivo(orgId: string, documentoId: string, rail: RailId, entorno: EntornoRail): Promise<IntentoRail | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes
         where org_id = ${orgId} and documento_id = ${documentoId} and rail = ${rail} and entorno = ${entorno}
           and estado in ('pendiente', 'incierto', 'autorizado')
         limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** El intento AUTORIZADO de un documento, en cualquier entorno (para notas de crédito y la vista). */
export async function intentoAutorizado(orgId: string, documentoId: string, rail: RailId): Promise<IntentoRail | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes
         where org_id = ${orgId} and documento_id = ${documentoId} and rail = ${rail} and estado = 'autorizado'
         order by resuelto_at desc
         limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** Último intento de un documento, sea cual sea su estado (para explicar un rechazo en la vista). */
export async function ultimoIntento(orgId: string, documentoId: string, rail: RailId): Promise<IntentoRail | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes
         where org_id = ${orgId} and documento_id = ${documentoId} and rail = ${rail}
         order by created_at desc
         limit 1`);
    return rows[0] ? fila(rows[0]) : null;
}

/** Intentos sin resolver (pendiente/incierto) de una secuencia. */
export async function sinResolverDeSecuencia(orgId: string, rail: RailId, entorno: EntornoRail, serie: string, tipo: string): Promise<IntentoRail[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno} and serie = ${serie} and tipo = ${tipo}
           and estado in ('pendiente', 'incierto')
         order by numero asc`);
    return rows.map(fila);
}

/** Intentos sin resolver de la organización con más de `antiguedadS` segundos (para el cron). */
export async function sinResolverDeOrg(orgId: string, rail: RailId, antiguedadS: number): Promise<IntentoRail[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select * from fiscal_rail_comprobantes
         where org_id = ${orgId} and rail = ${rail} and estado in ('pendiente', 'incierto')
           and created_at < now() - make_interval(secs => ${Math.max(0, antiguedadS)}::int)
         order by created_at asc
         limit 50`);
    return rows.map(fila);
}

/**
 * Reclama un número: inserta el intento `pendiente`. Null si el número o el
 * documento ya tienen un intento vivo (otra instancia se adelantó).
 */
export async function reclamarNumero(orgId: string, p: {
    documentoId: string; rail: RailId; entorno: EntornoRail; serie: string; tipo: string; numero: number;
    solicitud: Record<string, unknown>;
}): Promise<IntentoRail | null> {
    const [rows] = await withOrgTx(orgId, sql`
        insert into fiscal_rail_comprobantes (org_id, documento_id, rail, entorno, serie, tipo, numero, estado, solicitud)
        values (${orgId}, ${p.documentoId}, ${p.rail}, ${p.entorno}, ${p.serie}, ${p.tipo}, ${p.numero}, 'pendiente',
                ${JSON.stringify(p.solicitud)}::jsonb)
        on conflict do nothing
        returning *`);
    return rows[0] ? fila(rows[0]) : null;
}

/** Marca que el intento SALE hacia la autoridad. Va antes del envío, nunca después. */
export async function marcarEnviado(orgId: string, id: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update fiscal_rail_comprobantes set enviado_at = now(), intentos = intentos + 1
         where id = ${id} and org_id = ${orgId} and estado = 'pendiente'`);
}

export type Resolucion =
    | { estado: 'autorizado'; autorizacion: string; vence: string | null; respuesta: Record<string, unknown>; observaciones?: unknown[] }
    | { estado: 'rechazado'; respuesta: Record<string, unknown>; codigo?: string | null; mensaje: string; observaciones?: unknown[] }
    | { estado: 'incierto'; mensaje: string; respuesta?: Record<string, unknown> }
    | { estado: 'descartado'; mensaje: string; respuesta?: Record<string, unknown> };

/**
 * Aplica una transición. Solo desde estados que la admiten (el trigger de la
 * tabla lo vuelve a comprobar). Devuelve el intento resultante, o null si otro
 * proceso ya lo había resuelto.
 */
export async function resolverIntento(orgId: string, id: string, r: Resolucion): Promise<IntentoRail | null> {
    const desde = r.estado === 'incierto' ? ['pendiente'] : r.estado === 'rechazado' ? ['pendiente'] : ['pendiente', 'incierto'];
    const [rows] = await withOrgTx(orgId, sql`
        update fiscal_rail_comprobantes set
            estado = ${r.estado},
            autorizacion = ${r.estado === 'autorizado' ? r.autorizacion : null},
            autorizacion_vence = ${r.estado === 'autorizado' ? r.vence : null}::date,
            respuesta = coalesce(${'respuesta' in r && r.respuesta ? JSON.stringify(r.respuesta) : null}::jsonb, respuesta),
            observaciones = coalesce(${'observaciones' in r && r.observaciones ? JSON.stringify(r.observaciones) : null}::jsonb, observaciones),
            error_codigo = ${r.estado === 'rechazado' ? (r.codigo ?? null) : null},
            error_mensaje = ${r.estado === 'autorizado' ? null : r.mensaje},
            resuelto_at = case when ${r.estado} = 'incierto' then null else now() end,
            consultado_at = case when ${r.estado} in ('autorizado', 'descartado') then now() else consultado_at end
         where id = ${id} and org_id = ${orgId} and estado = any(${desde}::text[])
        returning *`);
    return rows[0] ? fila(rows[0]) : null;
}

/** Anota una consulta que no resolvió nada (la autoridad no respondió). */
export async function anotarConsulta(orgId: string, id: string, mensaje: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update fiscal_rail_comprobantes set consultado_at = now(), error_mensaje = ${mensaje}
         where id = ${id} and org_id = ${orgId} and estado in ('pendiente', 'incierto')`);
}

export interface ClaveSecuencia {
    rail: RailId;
    entorno: EntornoRail;
    serie: string;
    tipo: string;
}

/**
 * Ejecuta `fn` con la secuencia tomada (un solo intento en vuelo). Si otra
 * instancia la tiene, espera hasta `esperaMaxMs` y luego lanza
 * RailTransitorioError (apto para el usuario: nada se envió). El lease vence
 * solo: un proceso que muere no bloquea la secuencia para siempre.
 */
export async function conSecuencia<T>(orgId: string, k: ClaveSecuencia, fn: () => Promise<T>, opts: { esperaMaxMs?: number; leaseS?: number } = {}): Promise<T> {
    const token = randomUUID();
    const leaseS = Math.max(30, opts.leaseS ?? 90);
    const limite = Date.now() + (opts.esperaMaxMs ?? 10_000);
    for (let intento = 0; ; intento++) {
        const [, tomado] = await withOrgTx(orgId,
            sql`insert into fiscal_rail_secuencias (org_id, rail, entorno, serie, tipo)
                values (${orgId}, ${k.rail}, ${k.entorno}, ${k.serie}, ${k.tipo})
                on conflict (org_id, rail, entorno, serie, tipo) do nothing`,
            sql`update fiscal_rail_secuencias
                   set lease_hasta = now() + make_interval(secs => ${leaseS}::int), lease_token = ${token}, updated_at = now()
                 where org_id = ${orgId} and rail = ${k.rail} and entorno = ${k.entorno} and serie = ${k.serie} and tipo = ${k.tipo}
                   and (lease_hasta is null or lease_hasta < now())
                returning lease_token`,
        );
        if (tomado[0]) break;
        if (Date.now() > limite) throw new RailTransitorioError(MSG_OCUPADO);
        await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, 100 * 2 ** Math.min(intento, 3)) * (0.5 + Math.random())));
    }
    try {
        return await fn();
    } finally {
        await withOrgTx(orgId, sql`
            update fiscal_rail_secuencias set lease_hasta = null, lease_token = null, updated_at = now()
             where org_id = ${orgId} and rail = ${k.rail} and entorno = ${k.entorno} and serie = ${k.serie} and tipo = ${k.tipo}
               and lease_token = ${token}`).catch(() => {});
    }
}

/** Recuerda el último número que la autoridad dio por autorizado (informativo, para soporte). */
export async function anotarUltimoAutorizado(orgId: string, k: ClaveSecuencia, numero: number): Promise<void> {
    await withOrgTx(orgId, sql`
        update fiscal_rail_secuencias set ultimo_autorizado = greatest(coalesce(ultimo_autorizado, 0), ${numero}), updated_at = now()
         where org_id = ${orgId} and rail = ${k.rail} and entorno = ${k.entorno} and serie = ${k.serie} and tipo = ${k.tipo}`);
}

/**
 * El intento se descartó (la autoridad no lo registró): el documento vuelve a
 * quedar libre para emitirse otra vez —con otro número— o anularse. Se quitan
 * las marcas de entrega incierta y el id del proveedor pasa a `err_`, que es
 * lo que voidInvoice reconoce como "nada quedó emitido fuera de Cord".
 */
export async function liberarDocumento(orgId: string, documentoId: string, rail: RailId, mensaje: string): Promise<void> {
    await withOrgTx(orgId, sql`
        update documentos_fiscales
           set provider_data = (coalesce(provider_data, '{}'::jsonb) - 'delivery_uncertain' - 'retry_safe')
                               || jsonb_build_object('error', ${mensaje}::text),
               provider_document_id = case
                   when provider_document_id is null or left(provider_document_id, 4) = 'err_' then provider_document_id
                   else ${`err_${rail}_`} || provider_document_id end,
               updated_at = now()
         where id = ${documentoId} and org_id = ${orgId} and status <> 'issued'`);
}
