// Lo que ven el negocio y su equipo del riel de la solución pública de la AEAT
// (SPFE): el estado del riel en Ajustes y el de cada factura en su detalle.
//
// Mientras el riel no esté activo (interruptor apagado o especificación de la
// AEAT sin publicar, ver transporte.ts) la pantalla dice "Próximamente" y, en
// cada factura, si ya reúne lo que el Anexo I exige o qué le falta: eso se
// calcula en vivo del mismo snapshot que se enviaría, sin escribir nada.

import { sql, withOrgTx } from '../../db';
import { loadInvoiceDocumentRow } from '../invoice-download';
import { sourceFromRow } from '../einvoice/server';
import type { EInvoiceProblem } from '../einvoice/model';
import { assessSpfe, SPFE_NO_APLICA } from './factura';
import { spfeEstadoRiel, type EstadoRiel } from './transporte';
import type { EntornoSpfe } from './config';
import type { TipoMensaje } from './estados';
import type { SpfeCodigoDestinatario } from './normativa';

export interface MensajeVista {
    tipo: TipoMensaje;
    estado: 'pendiente' | 'incierto' | 'admitido' | 'rechazado' | 'descartado';
    csv: string | null;
    error: string | null;
    fecha: string | null;
}

export interface EstadoDestinatarioVista {
    codigo: SpfeCodigoDestinatario;
    fecha: string;
    motivo: '01' | '02' | null;
}

export interface EstadoSpfeFactura {
    riel: EstadoRiel;
    entorno: EntornoSpfe;
    /** Lo que falta para que la SPFE admita esta factura (vacío = lista). */
    faltantes: EInvoiceProblem[];
    /** Último mensaje de la factura (alta) y el último de cobro o impago. */
    alta: MensajeVista | null;
    cobro: MensajeVista | null;
    /** Lo último que comunicó el cliente (pago o rechazo), si lo hay. */
    destinatario: EstadoDestinatarioVista | null;
}

const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null);

function vista(m: any): MensajeVista | null {
    if (!m) return null;
    return {
        tipo: m.tipo,
        estado: m.estado,
        csv: m.csv ? String(m.csv) : null,
        error: m.error_mensaje ? String(m.error_mensaje) : null,
        fecha: iso(m.resuelto_at ?? m.enviado_at ?? m.created_at),
    };
}

/**
 * Estado de una factura ante la SPFE, o null si la factura no va por ahí
 * (emisor fuera de España, cliente extranjero, borrador, proforma, anulada
 * sin haberse enviado…).
 */
export async function estadoSpfeFactura(orgId: string, documentoId: string): Promise<EstadoSpfeFactura | null> {
    const doc = await loadInvoiceDocumentRow(orgId, documentoId);
    if (!doc) return null;
    const { estado: riel, entorno } = spfeEstadoRiel();
    const [mensajes, destinatario] = await withOrgTx(orgId,
        sql`select tipo, estado, csv, error_mensaje, created_at, enviado_at, resuelto_at
              from spfe_mensajes where org_id = ${orgId} and documento_id = ${documentoId} and entorno = ${entorno}
             order by orden asc`,
        sql`select codigo, fecha::text as fecha, motivo from spfe_estados_destinatario
             where org_id = ${orgId} and documento_id = ${documentoId} and entorno = ${entorno}
             order by recibido_at desc, fecha desc
             limit 1`,
    );
    const alta = mensajes.filter((m: any) => m.tipo === 'alta' || m.tipo === 'baja').at(-1) ?? null;
    const cobro = mensajes.filter((m: any) => m.tipo !== 'alta' && m.tipo !== 'baja').at(-1) ?? null;
    const d = destinatario[0];

    let faltantes: EInvoiceProblem[] = [];
    if (!alta) {
        if (doc.status !== 'issued') return null;
        const vf = doc.provider_data?.verifactu;
        const a = assessSpfe({
            ...sourceFromRow(doc),
            qrUrl: vf?.qrUrl ? String(vf.qrUrl) : null,
            tipoRectificativa: vf?.tipoFactura ? String(vf.tipoFactura) : null,
        });
        if (a.problems.some((p) => SPFE_NO_APLICA.has(p.code))) return null;
        faltantes = a.problems;
    }
    return {
        riel,
        entorno,
        faltantes,
        alta: vista(alta),
        cobro: vista(cobro),
        destinatario: d ? { codigo: d.codigo, fecha: String(d.fecha).slice(0, 10), motivo: d.motivo ?? null } : null,
    };
}

export interface IncidenciaSpfe {
    documentoId: string;
    numero: string;
    tipo: TipoMensaje | 'rechazo_cliente';
    motivo: string | null;
}

export interface EstadoSpfeOrg {
    riel: EstadoRiel;
    entorno: EntornoSpfe;
    /** El certificado electrónico con que el negocio se identifica (el de Verifactu). */
    certificado: boolean;
    /** Mensajes por enviar o esperando confirmación. */
    enCola: number;
    /** Lo que necesita atención: rechazos de la SPFE y facturas que el cliente rechazó. */
    incidencias: IncidenciaSpfe[];
}

export async function estadoSpfeOrg(orgId: string): Promise<EstadoSpfeOrg> {
    const { estado: riel, entorno } = spfeEstadoRiel();
    const [org, cola, rechazos, rechazosCliente] = await withOrgTx(orgId,
        sql`select verifactu_cert_enc is not null as certificado from orgs where id = ${orgId} limit 1`,
        sql`select count(*)::int as n from spfe_mensajes where org_id = ${orgId} and entorno = ${entorno} and estado in ('pendiente', 'incierto')`,
        sql`select m.documento_id, m.tipo, m.error_mensaje, d.invoice_number
              from spfe_mensajes m join documentos_fiscales d on d.id = m.documento_id and d.org_id = m.org_id
             where m.org_id = ${orgId} and m.entorno = ${entorno} and m.estado = 'rechazado'
               and not exists (select 1 from spfe_mensajes x where x.documento_id = m.documento_id and x.entorno = m.entorno
                                and x.orden > m.orden and x.estado = 'admitido')
             order by m.created_at desc limit 20`,
        sql`select distinct on (e.documento_id) e.documento_id, e.codigo, e.motivo, d.invoice_number
              from spfe_estados_destinatario e join documentos_fiscales d on d.id = e.documento_id and d.org_id = e.org_id
             where e.org_id = ${orgId} and e.entorno = ${entorno}
             order by e.documento_id, e.recibido_at desc, e.fecha desc`,
    );
    const incidencias: IncidenciaSpfe[] = [
        ...rechazos.map((r: any) => ({ documentoId: String(r.documento_id), numero: String(r.invoice_number || ''), tipo: r.tipo as TipoMensaje, motivo: r.error_mensaje ? String(r.error_mensaje) : null })),
        ...rechazosCliente.filter((r: any) => r.codigo === 'REJECTION').slice(0, 20)
            .map((r: any) => ({ documentoId: String(r.documento_id), numero: String(r.invoice_number || ''), tipo: 'rechazo_cliente' as const, motivo: r.motivo ? String(r.motivo) : null })),
    ];
    return { riel, entorno, certificado: org[0]?.certificado === true, enCola: Number(cola[0]?.n || 0), incidencias };
}
