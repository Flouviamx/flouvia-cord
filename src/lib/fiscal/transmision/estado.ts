// Lo que ven el negocio y su equipo de la emisión por plataforma autorizada:
// el alta y lo que necesita atención en Ajustes, y el recorrido de cada
// factura en su detalle. Solo lectura, en withOrgTx.
//
// Mientras el riel esté apagado la pantalla dice "Próximamente" y, en cada
// factura, si ya tiene lo que exige la reforma o qué le falta: se calcula en
// vivo del mismo snapshot que se transmitiría, sin escribir nada.

import { sql, withOrgTx } from '../../db';
import { loadInvoiceDocumentRow } from '../invoice-download';
import { sourceFromRow } from '../einvoice/server';
import { assessEInvoice, frCtcProblems, isoDayIn, type EInvoiceProblem } from '../einvoice/model';
import { paConfig, NOMBRE_PLATAFORMA } from './config';
import { datosDelPerfil } from './alta';
import { ESTADOS_DGFIP, esRechazo, etiquetaEstado } from './estados';
import { clasificar, reporteFactura } from './ereporting';
import { regimenDe, type RegimenTva } from './periodos';
import type { EntornoPa } from './proveedor';

const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null);

export interface AltaVista {
    estado: string;
    etapa: string | null;
    enlace: string | null;
    siren: string;
    regimen: RegimenTva;
    completadaAt: string | null;
    error: string | null;
}

export interface IncidenciaPa {
    documentoId: string | null;
    numero: string | null;
    tipo: string;
    estado: string;
    mensaje: string | null;
    fecha: string | null;
    limite: string | null;
}

export interface EstadoPaOrg {
    activo: boolean;
    entorno: EntornoPa;
    plataforma: string;
    alta: AltaVista | null;
    /** Lo que falta en el perfil fiscal para pedir el alta (vacío = se puede pedir). */
    faltaPerfil: { codigo: string; es: string; en: string } | null;
    regimen: RegimenTva | null;
    debitos: boolean;
    enCola: number;
    /** Envíos sin confirmación de la plataforma (salieron y no hubo respuesta). */
    sinConfirmar: number;
    /** E-reporting por entregar con el plazo vencido. */
    vencidos: number;
    pausada: boolean;
    incidencias: IncidenciaPa[];
}

export async function estadoPaOrg(orgId: string): Promise<EstadoPaOrg> {
    const config = paConfig();
    const entorno = config.entorno;
    const [orgs, altas, cola, envios, rechazos] = await withOrgTx(orgId,
        sql`select country_code, fiscal_metadata, rfc, email_contacto, direccion, cp_fiscal, zona_horaria from orgs where id = ${orgId} limit 1`,
        sql`select estado, etapa, enlace, siren, regimen_tva, completada_at, error_mensaje from pa_altas
             where org_id = ${orgId} and entorno = ${entorno}
             order by (estado not in ('cancelada', 'rechazada', 'descartada')) desc, created_at desc limit 1`,
        sql`select (proximo_envio_at is not null and proximo_envio_at > now()) as pausada from pa_cola where org_id = ${orgId} and entorno = ${entorno}`,
        sql`select e.estado, e.tipo, e.fecha_limite::text as limite,
                   (e.estado in ('pendiente', 'incierto')) as vivo
              from pa_envios e
             where e.org_id = ${orgId} and e.entorno = ${entorno} and e.estado in ('pendiente', 'incierto')`,
        sql`select e.documento_id, e.numero, e.tipo, e.estado, e.error_mensaje, e.resuelto_at, e.fecha_limite::text as limite
              from pa_envios e
             where e.org_id = ${orgId} and e.entorno = ${entorno}
               and (e.estado = 'rechazado' or e.estado = 'incierto'
                    or (e.estado = 'aceptado' and e.error_codigo = 'no_entregada'))
             order by coalesce(e.resuelto_at, e.created_at) desc limit 30`,
    );
    const org = orgs[0];
    const a = altas[0];
    const perfil = datosDelPerfil(org);
    const hoy = isoDayIn(new Date(), String(org?.zona_horaria || 'Europe/Paris'));
    const [estadosRechazo] = await withOrgTx(orgId, sql`
        select distinct on (s.documento_id) s.documento_id, s.codigo, s.motivo, s.fecha, d.invoice_number
          from pa_estados s join documentos_fiscales d on d.id = s.documento_id and d.org_id = s.org_id
         where s.org_id = ${orgId} and s.entorno = ${entorno}
         order by s.documento_id, s.fecha desc, s.recibido_at desc`);
    const incidencias: IncidenciaPa[] = [
        ...estadosRechazo.filter((x: any) => esRechazo(x.codigo)).slice(0, 20).map((x: any) => ({
            documentoId: String(x.documento_id), numero: x.invoice_number ? String(x.invoice_number) : null, tipo: 'estado', estado: String(x.codigo),
            mensaje: x.motivo ? String(x.motivo) : null, fecha: iso(x.fecha), limite: null,
        })),
        ...rechazos.map((x: any) => ({
            documentoId: x.documento_id ? String(x.documento_id) : null, numero: x.numero ? String(x.numero) : null,
            tipo: String(x.tipo), estado: String(x.estado), mensaje: x.error_mensaje ? String(x.error_mensaje) : null,
            fecha: iso(x.resuelto_at), limite: x.limite ? String(x.limite).slice(0, 10) : null,
        })),
    ];
    return {
        activo: config.habilitado,
        entorno,
        plataforma: NOMBRE_PLATAFORMA,
        alta: a ? {
            estado: String(a.estado), etapa: a.etapa ? String(a.etapa) : null, enlace: a.enlace ? String(a.enlace) : null,
            siren: String(a.siren), regimen: a.regimen_tva as RegimenTva, completadaAt: iso(a.completada_at),
            error: a.error_mensaje ? String(a.error_mensaje) : null,
        } : null,
        faltaPerfil: 'falta' in perfil ? { codigo: perfil.falta, es: perfil.es, en: perfil.en } : null,
        regimen: regimenDe(org?.fiscal_metadata),
        debitos: org?.fiscal_metadata?.fr_tva_debits === 'true',
        enCola: envios.length,
        sinConfirmar: envios.filter((e: any) => e.estado === 'incierto').length,
        vencidos: envios.filter((e: any) => e.limite && String(e.limite).slice(0, 10) < hoy).length,
        pausada: cola[0]?.pausada === true,
        incidencias,
    };
}

export interface EstadoVista {
    codigo: string | null;
    es: string;
    en: string;
    fecha: string | null;
    motivo: string | null;
    rechazo: boolean;
}

export interface EnvioVista {
    tipo: string;
    estado: string;
    mensaje: string | null;
    fecha: string | null;
    confirmado: boolean;
}

export interface EstadoPaFactura {
    activo: boolean;
    entorno: EntornoPa;
    /** Cómo trata la reforma esta factura. */
    tratamiento: 'B2B' | 'B2BINT' | 'B2C';
    /** El negocio todavía no completó su alta, o la factura es anterior: Cord no la transmite. */
    sinAlta: boolean;
    envio: EnvioVista | null;
    cobros: EnvioVista[];
    estados: EstadoVista[];
    /** Lo que falta para transmitirla (vacío = lista). Solo si todavía no hay envío. */
    faltantes: EInvoiceProblem[];
}

function vistaEnvio(e: any): EnvioVista {
    return {
        tipo: String(e.tipo), estado: String(e.estado), mensaje: e.error_mensaje ? String(e.error_mensaje) : null,
        fecha: iso(e.resuelto_at ?? e.enviado_at ?? e.created_at), confirmado: !!e.confirmado_at,
    };
}

/**
 * La factura ante la plataforma, o null si no aplica (emisor fuera de
 * Francia, borrador, proforma).
 */
export async function estadoPaFactura(orgId: string, documentoId: string): Promise<EstadoPaFactura | null> {
    const doc = await loadInvoiceDocumentRow(orgId, documentoId);
    if (!doc || doc.status !== 'issued' || String(doc.document_type) === 'proforma') return null;
    const src = sourceFromRow(doc);
    const cl = clasificar(src);
    if (!cl) return null;
    const config = paConfig();
    const entorno = config.entorno;
    const [altas, envios, estados] = await withOrgTx(orgId,
        sql`select completada_at from pa_altas where org_id = ${orgId} and entorno = ${entorno} and estado = 'completada' limit 1`,
        sql`select tipo, estado, error_mensaje, created_at, enviado_at, resuelto_at, confirmado_at from pa_envios
             where org_id = ${orgId} and entorno = ${entorno}
               and (documento_id = ${documentoId} or (tipo = 'reporte_transacciones' and datos->'documentos' ? ${documentoId}::text))
             order by created_at asc`,
        sql`select codigo, codigo_proveedor, fecha, motivo from pa_estados
             where org_id = ${orgId} and documento_id = ${documentoId} and entorno = ${entorno}
             order by fecha desc, recibido_at desc`,
    );
    const completada = altas[0]?.completada_at ? new Date(altas[0].completada_at) : null;
    const emitida = doc.issued_at ? new Date(doc.issued_at) : null;
    const sinAlta = !completada || (!!emitida && emitida < completada);
    const principal = envios.filter((e: any) => ['factura', 'reporte_factura', 'reporte_transacciones'].includes(String(e.tipo))
        && e.estado !== 'descartado').at(-1) ?? null;
    const cobros = envios.filter((e: any) => ['cobro', 'reporte_pago_factura'].includes(String(e.tipo))).map(vistaEnvio);

    let faltantes: EInvoiceProblem[] = [];
    if (!principal && (src.status === 'issued')) {
        const a = assessEInvoice(src);
        if (cl.flux === 'B2B') faltantes = frCtcProblems(src, a);
        else if (cl.flux === 'B2BINT') {
            const r = a.invoice ? reporteFactura(src, a.invoice) : null;
            if (r && 'bloqueo' in r) faltantes = [{ code: r.bloqueo.codigo, es: r.bloqueo.es, en: r.bloqueo.en }];
        } else if (!cl.cadre) {
            faltantes = [{ code: 'fr_operation_category', es: 'Falta decir si cada concepto es un bien o un servicio: sin eso la venta no se puede clasificar en el e-reporting.', en: 'Each line must say whether it is goods or a service: without it the sale cannot be classified for e-reporting.' }];
        }
    }
    return {
        activo: config.habilitado,
        entorno,
        tratamiento: cl.flux,
        sinAlta,
        envio: principal ? vistaEnvio(principal) : null,
        cobros,
        estados: estados.map((s: any) => {
            const codigo = s.codigo ? String(s.codigo) : null;
            return {
                codigo,
                es: etiquetaEstado(codigo, String(s.codigo_proveedor), 'es'),
                en: etiquetaEstado(codigo, String(s.codigo_proveedor), 'en'),
                fecha: iso(s.fecha),
                motivo: s.motivo ? String(s.motivo) : null,
                rechazo: esRechazo(codigo),
            };
        }),
        faltantes,
    };
}

/** El texto francés oficial de un código (para quien habla con su contable). */
export const estadoFrances = (codigo: string | null) => (codigo && ESTADOS_DGFIP[codigo] ? ESTADOS_DGFIP[codigo].fr : null);
