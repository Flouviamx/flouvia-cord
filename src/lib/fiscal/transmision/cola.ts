// Cola de la emisión por plataforma autorizada en Francia: el outbox del riel,
// mismo patrón que la SPFE (spfe/cola.ts), Verifactu y los rieles de LatAm.
//
// Una pasada por organización y entorno, con un solo proceso en vuelo (lease
// en pa_cola), y solo para un negocio cuya alta en la plataforma terminó
// (`completada_at`: lo emitido antes no se manda de golpe):
//   1. DESCUBRE, sin red, lo que hay que comunicar desde el snapshot congelado
//      de cada documento (ereporting.ts) y desde los cobros reales:
//        - factura entre empresas francesas → su Factur-X (flujo 2);
//        - factura con una empresa extranjera → bloque 10.1;
//        - ventas a particulares → agregado por día cerrado y divisa (10.3);
//        - cobros cuya TVA es exigible al cobro → estado 212 (B2B), 10.2
//          (extranjero) o agregado diario 10.4 (particulares).
//      Lo que no se puede transmitir (le falta un dato que el snapshot ya no
//      puede ganar) se escribe como envío RECHAZADO sin salir, con su motivo:
//      queda a la vista una sola vez y no se reevalúa en cada pasada.
//   2. ENVÍA lo pendiente, marcando `enviado_at` ANTES de hablar con la
//      plataforma.
//   3. RESUELVE por consulta lo que salió sin respuesta. Una factura se busca
//      por emisor y número; un cobro, en el historial de la factura. Si la
//      consulta prueba que la plataforma no lo tiene (24 h sin rastro), el
//      intento se descarta y la siguiente pasada escribe uno nuevo; la
//      plataforma además rechaza una factura duplicada. El e-reporting no
//      tiene consulta por envío: un incierto queda a la vista, nunca se repite.
//
// Carriles (regla 30): el barrido entre organizaciones es solo sobre `orgs`
// (withSystemTx, cron validado); todo lo demás va en withOrgTx con el org_id.

import { createHash, randomUUID } from 'node:crypto';
import { sql, withOrgTx, withSystemTx } from '../../db';
import { log } from '../../log';
import { loadInvoiceDocumentRow } from '../invoice-download';
import { renderEInvoice, sourceFromRow } from '../einvoice/server';
import { assessEInvoice, frCtcProblems, isoDayIn, type EInvoiceSource, type En16931Invoice } from '../einvoice/model';
import { logInvoiceEvent } from '../timeline';
import { paConfig } from './config';
import { proveedorConfigurado } from './activo';
import { refrescarAlta } from './alta';
import { esRechazo } from './estados';
import { periodoDe, type RegimenTva } from './periodos';
import {
    BLOQUEO_DEVOLUCION_REPORTE, BLOQUEO_SIN_EUROS, agregarPagos, agregarTransacciones, clasificar, cobroPorTasa, enEuros,
    reporteFactura, type Bloqueo,
} from './ereporting';
import {
    TransmisionPeticionRechazadaError, TransmisionRechazoError, TransmisionSinRespuestaError,
    type EntornoPa, type ProveedorTransmision,
} from './proveedor';

/** Antigüedad mínima para consultar un envío que salió sin respuesta. */
export const ANTIGUEDAD_CONSULTA_S = 120;
/** Sin rastro en la plataforma pasado este tiempo, el intento se da por no recibido. */
export const DESCARTE_SIN_RASTRO_S = 24 * 3600;
/** Pausa tras un rechazo de la petición (credenciales, permisos, límite). */
const PAUSA_PETICION_S = 15 * 60;
/** Cada cuánto se consulta un alta en curso si el webhook no avisa. */
const CONSULTA_ALTA_S = 3600;
const MAX_DOCUMENTOS = 200;
const MAX_PAGOS = 500;
const MAX_ENVIOS = 100;

const TIPOS_DOCUMENTO = ['commercial_invoice', 'commercial_credit_note'];

export interface ResultadoPaOrg {
    orgId: string;
    encolados: number;
    bloqueados: number;
    enviados: number;
    aceptados: number;
    rechazados: number;
    inciertos: number;
    resueltosPorConsulta: number;
    omitido?: string;
    error?: string;
}

const vacio = (orgId: string): ResultadoPaOrg => ({
    orgId, encolados: 0, bloqueados: 0, enviados: 0, aceptados: 0, rechazados: 0, inciertos: 0, resueltosPorConsulta: 0,
});

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Organizaciones de Francia, reales (ni sandbox ni demo). Barrido de SISTEMA solo sobre `orgs`. */
export async function orgsPa(): Promise<string[]> {
    const [rows] = await withSystemTx(sql`
        select id from orgs
         where upper(coalesce(country_code, '')) = 'FR'
           and sandbox_of is null and is_demo is not true
         order by id`);
    return rows.map((r: any) => String(r.id));
}

export interface OpcionesPa {
    /** Proveedor a usar; sin él, el configurado (null si el riel está apagado). */
    proveedor?: ProveedorTransmision | null;
    /** Instante (ms) a partir del cual no se empieza otro envío o consulta. */
    deadline?: number;
    /** Para pruebas: el "hoy" del negocio (aaaa-mm-dd). */
    hoy?: string;
}

interface Alta {
    siren: string;
    regimen: RegimenTva;
    completadaAt: string;
}

interface Contexto {
    orgId: string;
    proveedor: ProveedorTransmision;
    entorno: EntornoPa;
    alta: Alta;
    zona: string;
    hoy: string;
}

interface DocCargado {
    id: string;
    row: any;
    src: EInvoiceSource;
    inv: En16931Invoice | null;
}

async function cargar(orgId: string, documentoId: string): Promise<DocCargado | null> {
    const row = await loadInvoiceDocumentRow(orgId, documentoId);
    if (!row) return null;
    const src = sourceFromRow(row);
    return { id: documentoId, row, src, inv: assessEInvoice(src).invoice };
}

/** Escribe un envío. Null si ya había uno vivo con la misma clave (otro proceso se adelantó). */
async function encolar(c: Contexto, e: {
    tipo: string; clave: string; documentoId?: string | null; numero?: string | null; datos: Record<string, unknown>;
    archivo?: Uint8Array | null; fechaOperacion?: string | null; tipoDato?: 'transaccion' | 'pago';
    bloqueo?: Bloqueo | null;
}): Promise<string | null> {
    const periodo = e.fechaOperacion && e.tipoDato ? periodoDe(c.alta.regimen, e.tipoDato, e.fechaOperacion) : null;
    const id = randomUUID();
    const [rows] = await withOrgTx(c.orgId, sql`
        insert into pa_envios (id, org_id, documento_id, proveedor, entorno, tipo, clave, estado, siren, numero, datos,
                               archivo, archivo_sha256, periodo, fecha_operacion, fecha_limite,
                               error_codigo, error_mensaje, resuelto_at)
        values (${id}, ${c.orgId}, ${e.documentoId ?? null}, ${c.proveedor.id}, ${c.entorno}, ${e.tipo}, ${e.clave},
                ${e.bloqueo ? 'rechazado' : 'pendiente'}, ${c.alta.siren}, ${e.numero ?? null}, ${JSON.stringify(e.datos)}::jsonb,
                ${e.archivo ?? null}, ${e.archivo ? sha256(e.archivo) : null}, ${periodo?.clave ?? null},
                ${e.fechaOperacion ?? null}::date, ${periodo?.limite ?? null}::date,
                ${e.bloqueo?.codigo ?? null}, ${e.bloqueo?.es ?? null}, ${e.bloqueo ? new Date().toISOString() : null}::timestamptz)
        on conflict do nothing
        returning id`);
    return rows[0] ? String(rows[0].id) : null;
}

// ── 1. Descubrir ─────────────────────────────────────────────────────────────

/** Último estado de la factura en la plataforma: decide si su nota de crédito es una anulación contable. */
async function ultimoCodigo(orgId: string, documentoId: string, entorno: EntornoPa): Promise<string | null> {
    const [[e]] = await withOrgTx(orgId, sql`
        select codigo from pa_estados where org_id = ${orgId} and documento_id = ${documentoId} and entorno = ${entorno}
         order by fecha desc, recibido_at desc limit 1`);
    return e?.codigo ? String(e.codigo) : null;
}

const BLOQUEO_ANULACION: Bloqueo = {
    codigo: 'anulacion_contable',
    es: 'Anula una factura que la plataforma o el cliente rechazó: es una anulación contable y no se transmite.',
    en: 'It cancels an invoice that the platform or the client rejected: it is an accounting cancellation and is not transmitted.',
};

/** Documentos emitidos desde el alta que todavía no tienen envío (ni bloqueo). */
async function descubrirDocumentos(c: Contexto, r: ResultadoPaOrg): Promise<void> {
    const [candidatos] = await withOrgTx(c.orgId, sql`
        select d.id, d.issued_at from documentos_fiscales d
         where d.org_id = ${c.orgId} and d.status = 'issued' and d.lifecycle not in ('void', 'draft')
           and upper(coalesce(d.country_code, '')) = 'FR'
           and d.document_type = any(${TIPOS_DOCUMENTO}::text[])
           and d.issued_at >= ${c.alta.completadaAt}::timestamptz
           and not exists (select 1 from pa_envios e
                            where e.org_id = d.org_id and e.entorno = ${c.entorno}
                              and e.estado in ('pendiente', 'incierto', 'aceptado', 'rechazado')
                              and ((e.documento_id = d.id and e.tipo in ('factura', 'reporte_factura'))
                                   or (e.tipo = 'reporte_transacciones' and e.datos->'documentos' ? d.id::text)))
         order by d.issued_at asc
         limit ${MAX_DOCUMENTOS}`);
    const b2c = new Map<string, DocCargado[]>(); // "día|divisa" → documentos
    for (const cand of candidatos) {
        const doc = await cargar(c.orgId, String(cand.id));
        if (!doc) continue;
        const cl = clasificar(doc.src);
        if (!cl) continue;
        const numero = doc.src.invoiceNumber || null;
        if (cl.flux === 'B2B') {
            const problemas = frCtcProblems(doc.src, assessEInvoice(doc.src));
            let bloqueo: Bloqueo | null = problemas.length ? { codigo: problemas.map((p) => p.code).join(','), es: problemas.map((p) => p.es).join(' '), en: problemas.map((p) => p.en).join(' ') } : null;
            // Nota de crédito de una factura rechazada (210/213): "annulation
            // comptable", sin flujo hacia la administración (Dossier général §3.6.4).
            const originalId = doc.row.credit_note_of ? String(doc.row.credit_note_of) : null;
            if (!bloqueo && cl.notaCredito && originalId && esRechazo(await ultimoCodigo(c.orgId, originalId, c.entorno))) bloqueo = BLOQUEO_ANULACION;
            let archivo: Uint8Array | null = null;
            if (!bloqueo) {
                const f = await renderEInvoice(c.orgId, doc.row, 'facturx');
                if (f.ok) archivo = new Uint8Array(f.file.content);
                else bloqueo = { codigo: f.problems.map((p) => p.code).join(',') || 'facturx', es: f.problems.map((p) => p.es).join(' ') || 'No se pudo generar el Factur-X.', en: f.problems.map((p) => p.en).join(' ') || 'The Factur-X could not be generated.' };
            }
            const id = await encolar(c, {
                tipo: 'factura', clave: `factura:${doc.id}`, documentoId: doc.id, numero,
                datos: { formato: 'facturx', nombre: `${numero}.pdf`, cadre: cl.cadre, ...(bloqueo ? { bloqueo } : {}) },
                archivo, bloqueo,
            });
            if (id) bloqueo ? r.bloqueados++ : r.encolados++;
            continue;
        }
        if (!doc.inv) {
            // Un documento que no se puede representar (totales que no cuadran,
            // documento de prueba…) se aparta una vez con su motivo.
            const problemas = assessEInvoice(doc.src).problems;
            const bloqueo: Bloqueo = {
                codigo: problemas.map((p) => p.code).join(',') || 'modelo',
                es: problemas.map((p) => p.es).join(' ') || 'La factura no se puede representar como factura electrónica.',
                en: problemas.map((p) => p.en).join(' ') || 'The invoice cannot be represented as an e-invoice.',
            };
            const internacional = cl.flux === 'B2BINT';
            if (await encolar(c, {
                tipo: internacional ? 'reporte_factura' : 'reporte_transacciones',
                clave: internacional ? `reporte_factura:${doc.id}` : `tx:bloqueo:${doc.id}`,
                documentoId: doc.id, numero, datos: { documentos: [doc.id], bloqueo }, bloqueo,
            })) r.bloqueados++;
            continue;
        }
        if (cl.flux === 'B2BINT') {
            const rep = reporteFactura(doc.src, doc.inv);
            const bloqueo = 'bloqueo' in rep ? rep.bloqueo : null;
            const id = await encolar(c, {
                tipo: 'reporte_factura', clave: `reporte_factura:${doc.id}`, documentoId: doc.id, numero,
                datos: 'reporte' in rep ? { reporte: rep.reporte } : { bloqueo },
                fechaOperacion: doc.inv.issueDate, tipoDato: 'transaccion', bloqueo,
            });
            if (id) bloqueo ? r.bloqueados++ : r.encolados++;
            continue;
        }
        // B2C: espera a que su día termine y se agrega con el resto del día.
        const dia = doc.inv.issueDate;
        if (dia >= c.hoy) continue;
        const k = `${dia}|${doc.inv.currency}`;
        b2c.set(k, [...(b2c.get(k) ?? []), doc]);
    }
    for (const [k, docs] of b2c) {
        const [dia, moneda] = k.split('|');
        const [[n]] = await withOrgTx(c.orgId, sql`
            select count(*)::int as n from pa_envios where org_id = ${c.orgId} and entorno = ${c.entorno}
               and tipo = 'reporte_transacciones' and clave like ${`tx:${dia}:${moneda}:%`}`);
        const seq = Number(n?.n || 0) + 1;
        const ag = agregarTransacciones(dia, `${dia}-${moneda}-${seq}`, moneda, docs.map((d) => ({ src: d.src, inv: d.inv! })));
        for (const bl of ag.bloqueados) {
            const d = docs[bl.indice];
            if (await encolar(c, {
                tipo: 'reporte_transacciones', clave: `tx:bloqueo:${d.id}`, documentoId: d.id, numero: d.src.invoiceNumber || null,
                datos: { documentos: [d.id], bloqueo: bl.bloqueo }, fechaOperacion: dia, tipoDato: 'transaccion', bloqueo: bl.bloqueo,
            })) r.bloqueados++;
        }
        if (!ag.reporte) continue;
        if (await encolar(c, {
            tipo: 'reporte_transacciones', clave: `tx:${dia}:${moneda}:${seq}`,
            datos: { reporte: ag.reporte, documentos: ag.incluidos.map((i) => docs[i].id) },
            fechaOperacion: dia, tipoDato: 'transaccion',
        })) r.encolados++;
    }
}

interface MovimientoCobro {
    clave: string;
    documentoId: string;
    importe: number;
    fecha: string;
    reembolso: boolean;
}

/**
 * Pagos y devoluciones (ya conciliados) de los documentos de un conjunto,
 * desde el alta. Las devoluciones salen de los reembolsos LIQUIDADOS: un
 * reembolso repartido entre varias facturas cuenta lo que le tocó a cada una
 * (documento_reembolso_asignaciones); uno sin reparto, solo si su cobro pagó
 * esa factura y ninguna otra — el mismo criterio que reconciliation.ts.
 */
async function movimientos(c: Contexto, documentos: string[]): Promise<MovimientoCobro[]> {
    if (!documentos.length) return [];
    const [pagos, repartidos, directos] = await withOrgTx(c.orgId,
        sql`select p.id, p.documento_id, p.monto, p.aplicado_at from documento_pagos p
             where p.org_id = ${c.orgId} and p.documento_id = any(${documentos}::uuid[])
               and p.aplicado_at >= ${c.alta.completadaAt}::timestamptz`,
        sql`select a.stripe_refund_id as ref, a.documento_id, a.monto, r.updated_at as fecha
              from documento_reembolso_asignaciones a
              join documento_reembolsos r on r.org_id = a.org_id and r.stripe_refund_id = a.stripe_refund_id
             where a.org_id = ${c.orgId} and a.documento_id = any(${documentos}::uuid[]) and r.status = 'succeeded'
               and r.updated_at >= ${c.alta.completadaAt}::timestamptz`,
        sql`select coalesce(r.stripe_refund_id, r.mp_refund_id) as ref, p.documento_id, r.monto, r.updated_at as fecha
              from documento_reembolsos r
              join documento_pagos p on p.org_id = r.org_id
               and (p.stripe_payment_intent_id = r.stripe_payment_intent_id or p.mp_payment_id = r.mp_payment_id)
             where r.org_id = ${c.orgId} and r.status = 'succeeded' and p.documento_id = any(${documentos}::uuid[])
               and r.updated_at >= ${c.alta.completadaAt}::timestamptz
               and not exists (select 1 from documento_reembolso_asignaciones a where a.org_id = r.org_id and a.stripe_refund_id = r.stripe_refund_id)
               and not exists (select 1 from documento_pagos o where o.org_id = r.org_id and o.documento_id <> p.documento_id
                                and (o.stripe_payment_intent_id = r.stripe_payment_intent_id or o.mp_payment_id = r.mp_payment_id))`,
    );
    const dia = (v: unknown) => isoDayIn(v instanceof Date ? v : String(v), c.zona);
    return [
        ...pagos.map((p: any) => ({ clave: `p:${p.id}`, documentoId: String(p.documento_id), importe: Number(p.monto), fecha: dia(p.aplicado_at), reembolso: false })),
        ...[...repartidos, ...directos].map((x: any) => ({ clave: `r:${x.ref}:${x.documento_id}`, documentoId: String(x.documento_id), importe: -Number(x.monto), fecha: dia(x.fecha), reembolso: true })),
    ].filter((m) => Number.isFinite(m.importe) && m.importe !== 0);
}

async function descubrirCobros(c: Contexto, r: ResultadoPaOrg): Promise<void> {
    // B2B y extranjero: factura (o reporte) aceptada por la plataforma.
    const [facturas] = await withOrgTx(c.orgId, sql`
        select e.documento_id, e.tipo from pa_envios e
          join documentos_fiscales d on d.id = e.documento_id and d.org_id = e.org_id
         where e.org_id = ${c.orgId} and e.entorno = ${c.entorno} and e.estado = 'aceptado'
           and e.tipo in ('factura', 'reporte_factura') and d.credit_note_of is null
           -- Solo documentos con servicios y sin la opción por los débitos.
           and exists (select 1 from jsonb_array_elements(coalesce(d.line_items_snapshot, '[]'::jsonb)) l where l->>'nature' = 'services')
           and coalesce(d.issuer_snapshot->>'vatOnDebits', 'false') <> 'true'
         order by e.created_at desc
         limit ${MAX_PAGOS}`);
    const porTipo = new Map(facturas.map((f: any) => [String(f.documento_id), String(f.tipo)]));
    const movs = await movimientos(c, [...porTipo.keys()]);
    if (movs.length) {
        const prefijo = (m: MovimientoCobro) => (porTipo.get(m.documentoId) === 'factura' ? 'cobro' : 'pagofac');
        const [hechos] = await withOrgTx(c.orgId, sql`
            select clave from pa_envios where org_id = ${c.orgId} and entorno = ${c.entorno}
               and clave = any(${movs.map((m) => `${prefijo(m)}:${m.clave}`)}::text[])
               and estado in ('pendiente', 'incierto', 'aceptado', 'rechazado')`);
        const ya = new Set(hechos.map((h: any) => String(h.clave)));
        const cache = new Map<string, DocCargado | null>();
        for (const m of movs) {
            const clave = `${prefijo(m)}:${m.clave}`;
            if (ya.has(clave)) continue;
            if (!cache.has(m.documentoId)) cache.set(m.documentoId, await cargar(c.orgId, m.documentoId));
            const doc = cache.get(m.documentoId);
            if (!doc?.inv) continue;
            const porTasa = cobroPorTasa(doc.src, doc.inv, m.importe);
            if (!porTasa) continue;
            const numero = doc.src.invoiceNumber || null;
            if (porTipo.get(m.documentoId) === 'factura') {
                // Una factura rechazada (210/213) ya no se cobra en la plataforma.
                if (esRechazo(await ultimoCodigo(c.orgId, m.documentoId, c.entorno))) continue;
                const id = await encolar(c, {
                    tipo: 'cobro', clave, documentoId: m.documentoId, numero,
                    datos: { cobro: { fecha: m.fecha, moneda: doc.inv.currency, porTasa, ...(m.reembolso ? { mensaje: 'Remboursement' } : {}) } },
                });
                if (id) r.encolados++;
                continue;
            }
            // Extranjero (10.2): en euros y solo cobros (la API no admite negativos).
            const euros = porTasa.map((x) => ({ tasa: x.tasa, importe: enEuros(x.importe, doc.src) }));
            const bloqueo = m.reembolso ? BLOQUEO_DEVOLUCION_REPORTE : euros.some((x) => x.importe === null) ? BLOQUEO_SIN_EUROS : null;
            const id = await encolar(c, {
                tipo: 'reporte_pago_factura', clave, documentoId: m.documentoId, numero,
                datos: bloqueo ? { bloqueo } : { reporte: { numero: doc.inv.number, fechaFactura: doc.inv.issueDate, fechaPago: m.fecha, porTasa: euros } },
                fechaOperacion: m.fecha, tipoDato: 'pago', bloqueo,
            });
            if (id) bloqueo ? r.bloqueados++ : r.encolados++;
        }
    }

    // Particulares (10.4): lo cobrado en cada día cerrado, de los documentos ya
    // reportados en un agregado de transacciones.
    const [b2c] = await withOrgTx(c.orgId, sql`
        select d.id from documentos_fiscales d
         where d.org_id = ${c.orgId} and d.credit_note_of is null
           and exists (select 1 from jsonb_array_elements(coalesce(d.line_items_snapshot, '[]'::jsonb)) l where l->>'nature' = 'services')
           and coalesce(d.issuer_snapshot->>'vatOnDebits', 'false') <> 'true'
           and exists (select 1 from pa_envios t where t.org_id = d.org_id and t.entorno = ${c.entorno}
                        and t.tipo = 'reporte_transacciones' and t.estado in ('pendiente', 'incierto', 'aceptado')
                        and t.datos->'documentos' ? d.id::text)
         order by d.issued_at desc
         limit ${MAX_PAGOS}`);
    const movsB2c = (await movimientos(c, b2c.map((d: any) => String(d.id)))).filter((m) => m.fecha < c.hoy);
    if (!movsB2c.length) return;
    const [hechos] = await withOrgTx(c.orgId, sql`
        select datos->'movimientos' as movimientos from pa_envios
         where org_id = ${c.orgId} and entorno = ${c.entorno} and tipo = 'reporte_pago_transacciones'
           and estado in ('pendiente', 'incierto', 'aceptado', 'rechazado')`);
    const ya = new Set(hechos.flatMap((h: any) => (Array.isArray(h.movimientos) ? h.movimientos.map(String) : [])));
    const porDia = new Map<string, MovimientoCobro[]>();
    for (const m of movsB2c) {
        if (ya.has(m.clave)) continue;
        porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
    }
    const cache = new Map<string, DocCargado | null>();
    for (const [dia, lista] of porDia) {
        const partes: { tasa: number; importe: number }[][] = [];
        let bloqueo: Bloqueo | null = null;
        for (const m of lista) {
            if (!cache.has(m.documentoId)) cache.set(m.documentoId, await cargar(c.orgId, m.documentoId));
            const doc = cache.get(m.documentoId);
            const porTasa = doc?.inv ? cobroPorTasa(doc.src, doc.inv, m.importe) : null;
            if (!porTasa || !doc) continue;
            const euros = porTasa.map((x) => ({ tasa: x.tasa, importe: enEuros(x.importe, doc.src) }));
            if (euros.some((x) => x.importe === null)) { bloqueo = BLOQUEO_SIN_EUROS; continue; }
            partes.push(euros as { tasa: number; importe: number }[]);
        }
        const ag = bloqueo ? { bloqueo } : agregarPagos(dia, partes);
        if (!ag) continue;
        const [[n]] = await withOrgTx(c.orgId, sql`
            select count(*)::int as n from pa_envios where org_id = ${c.orgId} and entorno = ${c.entorno}
               and tipo = 'reporte_pago_transacciones' and clave like ${`pagotx:${dia}:%`}`);
        const b = 'bloqueo' in ag ? ag.bloqueo : null;
        const id = await encolar(c, {
            tipo: 'reporte_pago_transacciones', clave: `pagotx:${dia}:${Number(n?.n || 0) + 1}`,
            datos: { ...('reporte' in ag ? { reporte: ag.reporte } : { bloqueo: b }), movimientos: lista.map((m) => m.clave) },
            fechaOperacion: dia, tipoDato: 'pago', bloqueo: b,
        });
        if (id) b ? r.bloqueados++ : r.encolados++;
    }
}

// ── 2. Enviar ────────────────────────────────────────────────────────────────

const ORDEN_TIPO: Record<string, number> = {
    factura: 0, reporte_factura: 1, reporte_transacciones: 2, cobro: 3, reporte_pago_factura: 4, reporte_pago_transacciones: 5,
};

const TEXTO_RECHAZO = 'La plataforma no admitió este envío. Lo estamos revisando; si necesitas corregir la factura, anúlala con una nota de crédito y emite otra.';

async function enviarUno(c: Contexto, e: any): Promise<string> {
    const p = c.proveedor;
    const datos = e.datos ?? {};
    switch (e.tipo) {
        case 'factura':
            return (await p.enviarFactura({ nombre: String(datos.nombre || `${e.numero}.pdf`), tipo: 'application/pdf', contenido: new Uint8Array(e.archivo) })).id;
        case 'cobro':
            if (!e.factura_id) throw new TransmisionRechazoError('La factura no tiene identificador en la plataforma.', 'sin_factura');
            return (await p.enviarCobro(String(e.factura_id), datos.cobro)).id;
        case 'reporte_factura':
            return (await p.reportarFactura(c.alta.siren, datos.reporte)).id;
        case 'reporte_transacciones':
            return (await p.reportarTransacciones(c.alta.siren, datos.reporte)).id;
        case 'reporte_pago_factura':
            return (await p.reportarPagoFactura(c.alta.siren, datos.reporte)).id;
        case 'reporte_pago_transacciones':
            return (await p.reportarPagoTransacciones(c.alta.siren, datos.reporte)).id;
    }
    throw new TransmisionRechazoError(`tipo de envío desconocido: ${e.tipo}`, 'tipo');
}

/** Envía lo pendiente. Devuelve false si la plataforma rechazó la petición (hay que pausar). */
async function enviarPendientes(c: Contexto, deadline: number, r: ResultadoPaOrg): Promise<boolean> {
    const [filas] = await withOrgTx(c.orgId, sql`
        select e.id, e.tipo, e.clave, e.datos, e.archivo, e.numero, e.documento_id,
               (select f.id_proveedor from pa_envios f
                 where f.org_id = e.org_id and f.entorno = e.entorno and f.documento_id = e.documento_id
                   and f.tipo = 'factura' and f.estado = 'aceptado' limit 1) as factura_id
          from pa_envios e
         where e.org_id = ${c.orgId} and e.entorno = ${c.entorno} and e.estado = 'pendiente' and e.enviado_at is null
         order by e.created_at asc
         limit ${MAX_ENVIOS}`);
    filas.sort((a: any, b: any) => (ORDEN_TIPO[a.tipo] ?? 9) - (ORDEN_TIPO[b.tipo] ?? 9));
    for (const e of filas) {
        if (Date.now() >= deadline) return true;
        // Un cobro sale cuando su factura ya está aceptada.
        if (e.tipo === 'cobro' && !e.factura_id) continue;
        // Se marca ANTES de enviar: si el proceso muere a mitad, lo marcado se
        // trata como enviado sin respuesta y se consulta.
        const [marcada] = await withOrgTx(c.orgId, sql`
            update pa_envios set enviado_at = now(), intentos = intentos + 1
             where id = ${e.id} and org_id = ${c.orgId} and estado = 'pendiente' and enviado_at is null
            returning id`);
        if (!marcada[0]) continue;
        try {
            const idProveedor = await enviarUno(c, e);
            r.enviados++;
            await withOrgTx(c.orgId, sql`
                update pa_envios set estado = 'aceptado', id_proveedor = ${idProveedor}, resuelto_at = now(),
                       respuesta = ${JSON.stringify({ id: idProveedor })}::jsonb, error_codigo = null, error_mensaje = null
                 where id = ${e.id} and org_id = ${c.orgId} and estado = 'pendiente'`);
            r.aceptados++;
            if (e.documento_id && e.tipo === 'factura') await logInvoiceEvent(c.orgId, String(e.documento_id), 'plataforma', 'Enviada a la plataforma de facturación electrónica');
            if (e.documento_id && e.tipo === 'cobro') await logInvoiceEvent(c.orgId, String(e.documento_id), 'plataforma', 'Cobro comunicado a la plataforma');
        } catch (error) {
            if (error instanceof TransmisionPeticionRechazadaError) {
                // Nada se procesó: vuelve a la cola tal cual y la organización se pausa.
                await withOrgTx(c.orgId, sql`
                    update pa_envios set enviado_at = null, error_mensaje = 'La plataforma no atendió la petición; se reintentará.'
                     where id = ${e.id} and org_id = ${c.orgId} and estado = 'pendiente'`);
                log.warn('fr-pa: la plataforma rechazó la petición', { route: 'fiscal/transmision', orgId: c.orgId, status: error.status, err: error.message });
                r.error = 'peticion_rechazada';
                return false;
            }
            if (error instanceof TransmisionRechazoError) {
                log.warn('fr-pa: la plataforma rechazó un envío', { route: 'fiscal/transmision', orgId: c.orgId, tipo: e.tipo, codigo: error.codigo, motivo: error.message });
                await withOrgTx(c.orgId, sql`
                    update pa_envios set estado = 'rechazado', resuelto_at = now(),
                           respuesta = ${JSON.stringify({ codigo: error.codigo ?? null, mensaje: error.message })}::jsonb,
                           error_codigo = ${String(error.codigo ?? 'rechazo').slice(0, 100)}, error_mensaje = ${TEXTO_RECHAZO}
                     where id = ${e.id} and org_id = ${c.orgId} and estado = 'pendiente'`);
                r.rechazados++;
                if (e.documento_id && e.tipo === 'factura') await logInvoiceEvent(c.orgId, String(e.documento_id), 'plataforma', 'La plataforma no admitió el envío');
                continue;
            }
            // Sin respuesta legible (o un fallo que no sabemos clasificar):
            // incierto. Solo la consulta lo resuelve.
            const detalle = error instanceof TransmisionSinRespuestaError ? error.message : 'Fallo al comunicarse con la plataforma.';
            if (!(error instanceof TransmisionSinRespuestaError)) log.error('fr-pa: fallo no clasificado al enviar', { route: 'fiscal/transmision', orgId: c.orgId, err: error });
            await withOrgTx(c.orgId, sql`
                update pa_envios set estado = 'incierto', error_mensaje = ${`Sin respuesta de la plataforma: ${detalle}`.slice(0, 500)}
                 where id = ${e.id} and org_id = ${c.orgId} and estado = 'pendiente'`);
            r.inciertos++;
        }
    }
    return true;
}

// ── 3. Resolver por consulta ────────────────────────────────────────────────

async function resolverInciertos(c: Contexto, deadline: number, r: ResultadoPaOrg): Promise<void> {
    const [filas] = await withOrgTx(c.orgId, sql`
        select e.id, e.tipo, e.numero, e.datos, e.documento_id, coalesce(e.enviado_at, e.created_at) as enviado,
               extract(epoch from (now() - coalesce(e.enviado_at, e.created_at)))::int as edad,
               (select f.id_proveedor from pa_envios f
                 where f.org_id = e.org_id and f.entorno = e.entorno and f.documento_id = e.documento_id
                   and f.tipo = 'factura' and f.estado = 'aceptado' limit 1) as factura_id
          from pa_envios e
         where e.org_id = ${c.orgId} and e.entorno = ${c.entorno} and e.tipo in ('factura', 'cobro')
           and (e.estado = 'incierto' or (e.estado = 'pendiente' and e.enviado_at is not null))
           and coalesce(e.enviado_at, e.created_at) < now() - make_interval(secs => ${ANTIGUEDAD_CONSULTA_S}::int)
         order by e.created_at asc
         limit 50`);
    for (const e of filas) {
        if (Date.now() >= deadline) return;
        const enviado = e.enviado instanceof Date ? e.enviado.toISOString() : String(e.enviado);
        let encontrado: string | null = null;
        try {
            if (e.tipo === 'factura') {
                encontrado = (await c.proveedor.buscarFactura({ siren: c.alta.siren, numero: String(e.numero || ''), desde: enviado }))?.id ?? null;
            } else if (e.factura_id) {
                // El cobro consta si el historial tiene un 212 posterior al envío
                // que ningún otro envío reclamó.
                const [usados] = await withOrgTx(c.orgId, sql`
                    select id_proveedor from pa_envios where org_id = ${c.orgId} and entorno = ${c.entorno}
                       and documento_id = ${e.documento_id} and tipo = 'cobro' and id_proveedor is not null`);
                const tomados = new Set(usados.map((u: any) => String(u.id_proveedor)));
                const desde = new Date(enviado).getTime() - 5 * 60_000;
                const estados = await c.proveedor.estadosFactura(String(e.factura_id));
                encontrado = estados.find((s) => s.codigo === '212' && new Date(s.fecha).getTime() >= desde && !tomados.has(s.estadoId))?.estadoId ?? null;
            }
        } catch (error) {
            const detalle = error instanceof Error ? error.message : String(error);
            await withOrgTx(c.orgId, sql`
                update pa_envios set consultado_at = now(), error_mensaje = ${`Consulta sin respuesta: ${detalle}`.slice(0, 500)}
                 where id = ${e.id} and org_id = ${c.orgId} and estado in ('pendiente', 'incierto')`);
            if (error instanceof TransmisionPeticionRechazadaError) { r.error = 'peticion_rechazada'; return; }
            continue;
        }
        if (encontrado) {
            const [hecho] = await withOrgTx(c.orgId, sql`
                update pa_envios set estado = 'aceptado', id_proveedor = ${encontrado}, consultado_at = now(), resuelto_at = now(),
                       respuesta = ${JSON.stringify({ id: encontrado, porConsulta: true })}::jsonb, error_mensaje = null
                 where id = ${e.id} and org_id = ${c.orgId} and estado in ('pendiente', 'incierto')
                returning id`);
            if (hecho[0]) {
                r.resueltosPorConsulta++;
                if (e.documento_id && e.tipo === 'factura') await logInvoiceEvent(c.orgId, String(e.documento_id), 'plataforma', 'Enviada a la plataforma de facturación electrónica');
            }
        } else if (Number(e.edad) >= DESCARTE_SIN_RASTRO_S) {
            const [hecho] = await withOrgTx(c.orgId, sql`
                update pa_envios set estado = 'descartado', consultado_at = now(), resuelto_at = now(),
                       error_mensaje = 'La plataforma no lo registró; se volverá a enviar.'
                 where id = ${e.id} and org_id = ${c.orgId} and estado in ('pendiente', 'incierto')
                returning id`);
            if (hecho[0]) r.resueltosPorConsulta++;
        } else {
            await withOrgTx(c.orgId, sql`
                update pa_envios set estado = 'incierto', consultado_at = now()
                 where id = ${e.id} and org_id = ${c.orgId} and estado in ('pendiente', 'incierto')`);
        }
    }
}

// ── Pasada completa ─────────────────────────────────────────────────────────

async function altaDe(orgId: string, proveedor: ProveedorTransmision): Promise<{ alta: Alta | null; consultar: boolean }> {
    const [[a]] = await withOrgTx(orgId, sql`
        select siren, regimen_tva, estado, completada_at,
               (consultado_at is null or consultado_at < now() - make_interval(secs => ${CONSULTA_ALTA_S}::int)) as toca_consultar
          from pa_altas
         where org_id = ${orgId} and proveedor = ${proveedor.id} and entorno = ${proveedor.entorno}
           and estado not in ('cancelada', 'rechazada', 'descartada')
         limit 1`);
    if (!a) return { alta: null, consultar: false };
    if (a.estado !== 'completada' || !a.completada_at) return { alta: null, consultar: a.toca_consultar === true };
    const completadaAt = a.completada_at instanceof Date ? a.completada_at.toISOString() : String(a.completada_at);
    return { alta: { siren: String(a.siren), regimen: a.regimen_tva as RegimenTva, completadaAt }, consultar: false };
}

async function pausar(c: Contexto, r: ResultadoPaOrg): Promise<void> {
    await withOrgTx(c.orgId, sql`
        update pa_cola set proximo_envio_at = now() + make_interval(secs => ${PAUSA_PETICION_S}::int),
               ultimo_error = ${String(r.error || '').slice(0, 500)}, updated_at = now()
         where org_id = ${c.orgId} and entorno = ${c.entorno}`);
}

/**
 * Una pasada de la cola para UNA organización. Aislada por diseño: nunca lanza
 * por un fallo de la plataforma (lo devuelve en `error`), y el fallo de una
 * organización no detiene a las demás.
 */
export async function procesarOrgPa(orgId: string, opciones: OpcionesPa = {}): Promise<ResultadoPaOrg> {
    const r = vacio(orgId);
    const proveedor = opciones.proveedor === undefined ? proveedorConfigurado() : opciones.proveedor;
    if (!proveedor) { r.omitido = paConfig().motivo ?? 'apagado'; return r; }
    const deadline = opciones.deadline ?? Date.now() + 60_000;

    const { alta, consultar } = await altaDe(orgId, proveedor);
    if (!alta) {
        // Respaldo del webhook: el alta en curso se consulta cada hora.
        if (consultar) await refrescarAlta(orgId, { proveedor }).catch((err) => log.warn('fr-pa: no se pudo consultar el alta', { route: 'fiscal/transmision', orgId, err }));
        r.omitido = 'sin_alta';
        return r;
    }

    const token = randomUUID();
    const leaseS = Math.max(60, Math.ceil((deadline - Date.now()) / 1000) + 60);
    const [, tomado] = await withOrgTx(orgId,
        sql`insert into pa_cola (org_id, entorno) values (${orgId}, ${proveedor.entorno}) on conflict (org_id, entorno) do nothing`,
        sql`update pa_cola
               set lease_hasta = now() + make_interval(secs => ${leaseS}::int), lease_token = ${token}, updated_at = now()
             where org_id = ${orgId} and entorno = ${proveedor.entorno} and (lease_hasta is null or lease_hasta < now())
            returning (proximo_envio_at is not null and proximo_envio_at > now()) as en_pausa`,
    );
    if (!tomado[0]) { r.omitido = 'en_curso'; return r; }
    const enPausa = tomado[0].en_pausa === true;

    try {
        const [[org]] = await withOrgTx(orgId, sql`select zona_horaria from orgs where id = ${orgId} limit 1`);
        const zona = String(org?.zona_horaria || 'Europe/Paris');
        const c: Contexto = { orgId, proveedor, entorno: proveedor.entorno, alta, zona, hoy: opciones.hoy ?? isoDayIn(new Date(), zona) };

        await descubrirDocumentos(c, r);
        await descubrirCobros(c, r);
        if (enPausa) { r.omitido = 'en_pausa'; return r; }

        if (!(await enviarPendientes(c, deadline, r))) { await pausar(c, r); return r; }
        const antes = r.resueltosPorConsulta;
        await resolverInciertos(c, deadline, r);
        if (r.error === 'peticion_rechazada') { await pausar(c, r); return r; }
        // Lo que la consulta dio por descartado vuelve a la cola, y una factura
        // recién aceptada destraba sus cobros: salen en esta misma pasada.
        if (r.resueltosPorConsulta > antes || r.aceptados > 0) {
            const previos = r.encolados;
            await descubrirDocumentos(c, r);
            await descubrirCobros(c, r);
            if (r.encolados > previos && !(await enviarPendientes(c, deadline, r))) { await pausar(c, r); return r; }
        }
        await withOrgTx(orgId, sql`
            update pa_cola set ultimo_envio_at = case when ${r.enviados > 0} then now() else ultimo_envio_at end,
                   ultimo_error = ${r.error ?? null}, updated_at = now()
             where org_id = ${orgId} and entorno = ${proveedor.entorno}`);
    } catch (error) {
        log.error('fr-pa: la pasada de la cola falló', { route: 'fiscal/transmision', orgId, err: error });
        r.error = 'fallo no controlado';
    } finally {
        await withOrgTx(orgId, sql`
            update pa_cola set lease_hasta = null, lease_token = null, updated_at = now()
             where org_id = ${orgId} and entorno = ${proveedor.entorno} and lease_token = ${token}`).catch(() => {});
    }
    return r;
}
