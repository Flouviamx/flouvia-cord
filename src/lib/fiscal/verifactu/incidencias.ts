// Estado de Verifactu de una factura y su corrección desde la app.
//
// La AEAT puede rechazar un registro (o Cord aparcarlo porque rompe el
// esquema) y la ley no deja editarlo: se corrige con OTRO registro, la
// subsanación (regla 29, correcciones.ts). Hasta ahora esa función existía sin
// pantalla, así que un rechazo solo se veía en la base de datos y la factura
// quedaba sin registrar ante la AEAT sin que el negocio lo supiera.
//
// Aquí vive lo que la pantalla necesita: qué pasó con el último registro de la
// factura (con el motivo que dio la AEAT), si se puede corregir, y la
// corrección en sí — que admite fijar la causa de exención de los conceptos al
// 0 %, el dato del desglose que la AEAT rechaza con más frecuencia y que el
// negocio sí puede decidir (fiscal/exemption.ts).

import { sql, withOrgTx } from '../../db';
import type { FiscalLineItem } from '../index';
import { exemptionReasonFor } from '../exemption';
import { logInvoiceEvent } from '../timeline';
import { historialDocumento, type EnvioEstado, type RegistroHistorial } from './chain';
import { crearSubsanacionVerifactu, VerifactuCorreccionError } from './correcciones';
import { programarEnvioInmediato } from './submit';
import { VerifactuDatosError } from './validacion';

const CORREGIBLE: ReadonlySet<EnvioEstado> = new Set(['rechazado', 'bloqueado', 'aceptado_con_errores']);
const NO_LLEGO: ReadonlySet<EnvioEstado> = new Set(['rechazado', 'bloqueado']);

export interface EstadoVerifactu {
    registroId: string;
    tipo: 'alta' | 'anulacion';
    estado: EnvioEstado;
    /** El registro corrige a otro anterior (subsanación). */
    esCorreccion: boolean;
    /** Código y motivo que devolvió la AEAT, o por qué Cord no lo pudo enviar. */
    codigo: number | null;
    motivo: string | null;
    /** El último registro admite una corrección desde la app. */
    corregible: boolean;
    /** Conceptos al 0 % (índice en el documento), cuya causa se puede fijar al corregir un alta. */
    lineasExentas: { indice: number; descripcion: string; causa: string | null }[];
}

/** El registro que manda: el último de la cadena de esa factura. */
function vigente(historial: RegistroHistorial[]): RegistroHistorial | undefined {
    return historial[historial.length - 1];
}

/**
 * Estado de Verifactu de una factura, o `null` si no tiene registros (no es de
 * España, se emitió sin Verifactu o es un borrador).
 */
export async function estadoVerifactuFactura(orgId: string, documentId: string): Promise<EstadoVerifactu | null> {
    const historial = await historialDocumento(orgId, documentId);
    const ultimo = vigente(historial);
    if (!ultimo) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select r.envio_error, r.aeat_respuesta, d.line_items_snapshot
          from verifactu_registros r
          join documentos_fiscales d on d.id = r.documento_id and d.org_id = r.org_id
         where r.id = ${ultimo.id} and r.org_id = ${orgId}`);
    const row = rows[0] ?? {};
    const respuesta = (row.aeat_respuesta ?? {}) as Record<string, any>;
    const codigo = Number(respuesta?.linea?.codigoError ?? respuesta?.codigo);
    const lineas = (Array.isArray(row.line_items_snapshot) ? row.line_items_snapshot : []) as FiscalLineItem[];
    return {
        registroId: ultimo.id,
        tipo: ultimo.tipo,
        estado: ultimo.envioEstado,
        esCorreccion: !!ultimo.subsanaDe,
        codigo: Number.isFinite(codigo) && codigo > 0 ? codigo : null,
        motivo: (row.envio_error as string) || (respuesta?.linea?.descripcionError as string) || null,
        // Una anulación solo se corrige si no llegó; un alta también si se
        // aceptó con errores (subsanación de un registro que la AEAT ya tiene).
        corregible: ultimo.tipo === 'anulacion' ? NO_LLEGO.has(ultimo.envioEstado) : CORREGIBLE.has(ultimo.envioEstado),
        lineasExentas: ultimo.tipo === 'alta'
            ? lineas.map((l, indice) => ({ indice, descripcion: String(l.description || ''), causa: l.exemptionReason ?? null, rate: Number(l.taxRate) }))
                .filter((l) => l.rate === 0)
                .map(({ indice, descripcion, causa }) => ({ indice, descripcion, causa }))
            : [],
    };
}

export interface IncidenciaVerifactu {
    documentoId: string;
    numero: string;
    tipo: 'alta' | 'anulacion';
    estado: EnvioEstado;
    motivo: string | null;
    generadoAt: string;
}

/**
 * Facturas cuyo último registro de Verifactu está rechazado, aparcado o
 * aceptado con errores — lo que el negocio tiene que corregir. Un registro ya
 * corregido no aparece: su corrección es ahora el último de la factura.
 */
export async function incidenciasVerifactu(orgId: string, limite = 50): Promise<IncidenciaVerifactu[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select distinct on (r.documento_id)
               r.documento_id, r.tipo, r.envio_estado, r.envio_error, r.generado_at, d.invoice_number
          from verifactu_registros r
          join documentos_fiscales d on d.id = r.documento_id and d.org_id = r.org_id
         where r.org_id = ${orgId}
           -- Solo facturas con algún registro problemático: el último de cada
           -- una decide si sigue pendiente de corregir.
           and r.documento_id in (
               select documento_id from verifactu_registros
                where org_id = ${orgId} and envio_estado in ('rechazado', 'bloqueado', 'aceptado_con_errores'))
         order by r.documento_id, r.seq desc`);
    return rows
        .filter((r: any) => CORREGIBLE.has(String(r.envio_estado) as EnvioEstado))
        .sort((a: any, b: any) => new Date(b.generado_at).getTime() - new Date(a.generado_at).getTime())
        .slice(0, limite)
        .map((r: any) => ({
            documentoId: String(r.documento_id),
            numero: String(r.invoice_number || '—'),
            tipo: r.tipo === 'anulacion' ? 'anulacion' as const : 'alta' as const,
            estado: String(r.envio_estado) as EnvioEstado,
            motivo: (r.envio_error as string) || null,
            generadoAt: new Date(r.generado_at).toISOString(),
        }));
}

export type ResultadoCorreccion = { ok: true; registroId: string } | { ok: false; error: string };

/**
 * Corrige el último registro de la factura con una subsanación y la manda a la
 * AEAT. `causas` fija la causa de exención de conceptos al 0 % (índice del
 * concepto → código, o null para que el registro la derive); solo aplica a un
 * alta y solo en España. Nunca cambia importes: lo que la subsanación corrige
 * es cómo se REGISTRA la factura, no lo que se cobró.
 */
export async function corregirRegistroVerifactu(
    orgId: string,
    documentId: string,
    causas: Record<string, unknown> = {},
): Promise<ResultadoCorreccion> {
    const estado = await estadoVerifactuFactura(orgId, documentId);
    if (!estado) return { ok: false, error: 'Esta factura no tiene registros de Verifactu.' };
    if (!estado.corregible) {
        return {
            ok: false,
            error: estado.estado === 'pendiente'
                ? 'El registro todavía espera la respuesta de la AEAT. Corrígelo cuando llegue.'
                : 'El último registro de esta factura no necesita corrección.',
        };
    }

    let lineas: FiscalLineItem[] | undefined;
    const indices = Object.keys(causas ?? {});
    if (indices.length) {
        if (estado.tipo !== 'alta') return { ok: false, error: 'La causa de exención solo se corrige en el registro de alta.' };
        const [[doc]] = await withOrgTx(orgId, sql`
            select line_items_snapshot, country_code from documentos_fiscales
             where id = ${documentId} and org_id = ${orgId}`);
        const actuales = (Array.isArray(doc?.line_items_snapshot) ? doc.line_items_snapshot : []) as FiscalLineItem[];
        lineas = actuales.map((l) => ({ ...l }));
        for (const clave of indices) {
            const i = Number(clave);
            const linea = Number.isInteger(i) ? lineas[i] : undefined;
            if (!linea) return { ok: false, error: 'Uno de los conceptos no existe en la factura.' };
            const pedida = causas[clave];
            if (pedida === null || pedida === '') { delete linea.exemptionReason; continue; }
            const causa = exemptionReasonFor(String(doc?.country_code || ''), pedida, linea.taxRate);
            if (!causa) return { ok: false, error: `La causa de exención de "${linea.description}" no es válida para ese concepto.` };
            linea.exemptionReason = causa;
        }
    }

    let nuevo;
    try {
        nuevo = await crearSubsanacionVerifactu(orgId, estado.registroId, lineas ? { lineas } : {});
    } catch (error) {
        if (error instanceof VerifactuCorreccionError || error instanceof VerifactuDatosError) return { ok: false, error: error.message };
        throw error;
    }
    // El snapshot se actualiza DESPUÉS de encadenar: un dato que la validación
    // rechazó no queda guardado, y el PDF cita la causa que se registró.
    if (lineas) {
        await withOrgTx(orgId, sql`
            update documentos_fiscales set line_items_snapshot = ${JSON.stringify(lineas)}::jsonb, updated_at = now()
             where id = ${documentId} and org_id = ${orgId}`);
    }
    await logInvoiceEvent(orgId, documentId, 'verifactu', estado.tipo === 'anulacion'
        ? 'Anulación corregida y reenviada a la AEAT'
        : 'Registro corregido y reenviado a la AEAT');
    programarEnvioInmediato(orgId);
    return { ok: true, registroId: nuevo.id };
}
