// Archivos de folios (CAF) por organización y entorno (`fiscal_sii_cafs`).
//
// - El archivo entero (incluida la llave privada del timbre) se guarda
//   cifrado con encryptRequiredSecret() y nunca vuelve al navegador: la
//   pantalla solo conoce el rango, la fecha, el vencimiento y cuántos quedan.
// - `folio_siguiente` es el próximo folio por usar y SOLO avanza: se toma con
//   un UPDATE atómico (dentro del lease de la secuencia del marco,
//   comprobantes.ts) y un folio tomado no vuelve nunca, aunque el documento se
//   rechace o se descarte. El trigger de db/schema.sql es la segunda línea de
//   defensa (no retrocede, no se solapa, no se borra un CAF usado).
//
// Todo en el carril de la organización (regla 30).

import { sql, withOrgTx } from '../../../db';
import { decryptSecret, encryptRequiredSecret } from '../../../crypto-secret';
import { RailDatosError, RailNoDisponibleError } from '../errores';
import type { EntornoRail } from '../rieles';
import { parsearCaf, venceCaf, type CafParseado } from './caf';
import { AVISO_FOLIOS_FRACCION, AVISO_FOLIOS_MINIMO, TIPOS_DTE, type TipoDte } from './constantes';
import type { FolioAsignado } from './emision';

export interface ResumenCaf {
    id: string;
    tipo: TipoDte;
    desde: number;
    hasta: number;
    siguiente: number;
    restantes: number;
    fechaAutorizacion: string;
    vence: string | null;
    vencido: boolean;
    nombreArchivo: string | null;
    subidoAt: string;
}

export interface EstadoFolios {
    tipo: TipoDte;
    /** Folios utilizables hoy (de CAF vigentes). */
    disponibles: number;
    /** Quedan pocos: avisar para que el negocio pida más al SII. */
    porAgotarse: boolean;
}

const fecha = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : '');

function resumen(r: Record<string, any>, hoy: string): ResumenCaf {
    const siguiente = Number(r.folio_siguiente);
    const hasta = Number(r.folio_hasta);
    const vence = r.vence ? fecha(r.vence) : null;
    return {
        id: String(r.id),
        tipo: Number(r.tipo_dte) as TipoDte,
        desde: Number(r.folio_desde),
        hasta,
        siguiente,
        restantes: Math.max(0, hasta - siguiente + 1),
        fechaAutorizacion: fecha(r.fecha_autorizacion),
        vence,
        vencido: !!vence && hoy > vence,
        nombreArchivo: r.archivo_nombre ? String(r.archivo_nombre) : null,
        subidoAt: r.subido_at instanceof Date ? r.subido_at.toISOString() : String(r.subido_at ?? ''),
    };
}

export async function listarCafs(orgId: string, entorno: EntornoRail, hoy: string): Promise<ResumenCaf[]> {
    const [rows] = await withOrgTx(orgId, sql`
        select id, tipo_dte, folio_desde, folio_hasta, folio_siguiente, fecha_autorizacion, vence, archivo_nombre, subido_at
          from fiscal_sii_cafs
         where org_id = ${orgId} and entorno = ${entorno}
         order by tipo_dte, folio_desde`);
    return rows.map((r) => resumen(r, hoy));
}

/** Folios utilizables por tipo y si conviene pedir más. */
export function estadoFolios(cafs: ResumenCaf[]): EstadoFolios[] {
    return (Object.keys(TIPOS_DTE).map(Number) as TipoDte[]).map((tipo) => {
        const propios = cafs.filter((c) => c.tipo === tipo && !c.vencido);
        const disponibles = propios.reduce((s, c) => s + c.restantes, 0);
        const total = propios.reduce((s, c) => s + (c.hasta - c.desde + 1), 0);
        const umbral = Math.max(AVISO_FOLIOS_MINIMO, Math.ceil(total * AVISO_FOLIOS_FRACCION));
        return { tipo, disponibles, porAgotarse: total > 0 && disponibles <= umbral };
    });
}

/**
 * Guarda un CAF ya validado. El primer folio por usar no puede ser uno que
 * Cord ya haya intentado emitir en este entorno (por ejemplo, un CAF que se
 * quitó sin usar y se vuelve a subir).
 */
export async function guardarCaf(orgId: string, entorno: EntornoRail, caf: CafParseado, xml: string, meta: { nombreArchivo?: string | null; subidoPor?: string | null }): Promise<string> {
    const enc = encryptRequiredSecret(xml);
    const vence = venceCaf(caf.tipo, caf.fechaAutorizacion);
    try {
        const [rows] = await withOrgTx(orgId, sql`
            insert into fiscal_sii_cafs (org_id, entorno, tipo_dte, folio_desde, folio_hasta, folio_siguiente, fecha_autorizacion,
                                         vence, idk, huella_sha256, caf_enc, archivo_nombre, subido_por)
            select ${orgId}, ${entorno}, ${caf.tipo}, ${caf.desde}, ${caf.hasta},
                   greatest(${caf.desde}::bigint, coalesce((
                       select max(c.numero) + 1 from fiscal_rail_comprobantes c
                        where c.org_id = ${orgId} and c.rail = 'sii' and c.entorno = ${entorno} and c.tipo = ${String(caf.tipo)}
                          and c.numero between ${caf.desde} and ${caf.hasta}), ${caf.desde}::bigint)),
                   ${caf.fechaAutorizacion}::date, ${vence}::date, ${caf.idk}, ${caf.huella}, ${enc},
                   ${meta.nombreArchivo ?? null}, ${meta.subidoPor ?? null}
            returning id`);
        return String(rows[0].id);
    } catch (error) {
        const msg = String((error as Error)?.message ?? '');
        if (/solapa|duplicate|unique/i.test(msg)) {
            throw new RailDatosError(`Ya tienes cargados folios de ${TIPOS_DTE[caf.tipo].nombre.toLowerCase()} que se cruzan con el rango ${caf.desde}–${caf.hasta}.`);
        }
        throw error;
    }
}

/** Quita un CAF que no se usó. Con folios usados el trigger lo impide. */
export async function quitarCaf(orgId: string, entorno: EntornoRail, id: string): Promise<boolean> {
    const [rows] = await withOrgTx(orgId, sql`
        delete from fiscal_sii_cafs
         where id = ${id} and org_id = ${orgId} and entorno = ${entorno} and folio_siguiente = folio_desde
        returning id`);
    return !!rows[0];
}

/**
 * Toma el próximo folio del tipo, del CAF vigente más antiguo con folios. El
 * UPDATE es atómico y solo avanza; quien lo llama debe tener tomada la
 * secuencia (conSecuencia) para no quemar folios en carreras.
 */
export async function consumirFolio(orgId: string, entorno: EntornoRail, tipo: TipoDte, fechaEmision: string, rutNegocio: string): Promise<FolioAsignado> {
    const [rows] = await withOrgTx(orgId, sql`
        update fiscal_sii_cafs set folio_siguiente = folio_siguiente + 1
         where id = (
                 select id from fiscal_sii_cafs
                  where org_id = ${orgId} and entorno = ${entorno} and tipo_dte = ${tipo}
                    and folio_siguiente <= folio_hasta and (vence is null or vence >= ${fechaEmision}::date)
                  order by folio_desde
                  limit 1)
           and org_id = ${orgId} and folio_siguiente <= folio_hasta
        returning id, folio_siguiente - 1 as folio, folio_desde, folio_hasta, fecha_autorizacion, caf_enc`);
    const r = rows[0];
    if (!r) {
        throw new RailNoDisponibleError(`No te quedan folios vigentes de ${TIPOS_DTE[tipo].nombre.toLowerCase()}. Descarga un nuevo archivo de folios (CAF) del SII y súbelo en Ajustes › Datos fiscales.`);
    }
    const xml = decryptSecret(r.caf_enc as string);
    if (!xml) throw new RailNoDisponibleError('No se pudo leer el archivo de folios guardado. Vuelve a subirlo en Ajustes › Datos fiscales.');
    const caf = parsearCaf(xml, rutNegocio);
    return {
        folio: Number(r.folio),
        cafXml: caf.cafXml,
        llavePrivadaPem: caf.llavePrivadaPem,
        tipo,
        desde: Number(r.folio_desde),
        hasta: Number(r.folio_hasta),
        fechaAutorizacion: fecha(r.fecha_autorizacion),
    };
}
