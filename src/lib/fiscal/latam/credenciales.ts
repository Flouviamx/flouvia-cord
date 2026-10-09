// Credenciales y ajustes de cada riel fiscal de LatAm por organización.
//
// - `fiscal_rail_credenciales`: certificado + llave privada, uno por riel y
//   ENTORNO, cifrados con encryptRequiredSecret() (AES-256-GCM, el mismo
//   contrato que el CSD de Facturapi y el certificado de Verifactu). Lo que
//   vuelve al navegador es el resumen: nombre del archivo, vigencia,
//   identificador del titular y si la autoridad ya lo aceptó. Nunca el PEM.
// - `fiscal_rail_ajustes`: configuración del riel (ARCA: punto de venta,
//   condición frente al IVA, concepto), independiente del entorno.
//
// Todo en el carril de la organización (regla 30).

import { sql, withOrgTx } from '../../db';
import { decryptSecret, encryptRequiredSecret } from '../../crypto-secret';
import type { CertificadoParseado } from './certificado';
import type { EntornoRail, RailId } from './rieles';

export interface ResumenCredencial {
    entorno: EntornoRail;
    identificador: string;
    nombreArchivo: string | null;
    sujeto: string | null;
    huellaSha256: string;
    vigenteDesde: string;
    caduca: string;
    subidoAt: string;
    /** Última vez que la autoridad aceptó la credencial (login exitoso). */
    verificadoAt: string | null;
    /** Mensaje (apto para el usuario) del último intento fallido de verificación. */
    verificacionError: string | null;
    vencida: boolean;
}

export interface CredencialActiva extends ResumenCredencial {
    certPem: string;
    keyPem: string;
    secretos: Record<string, string>;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : '');

function resumen(r: Record<string, any>): ResumenCredencial {
    const caduca = iso(r.caduca);
    return {
        entorno: r.entorno === 'produccion' ? 'produccion' : 'homologacion',
        identificador: String(r.identificador),
        nombreArchivo: r.certificado_nombre ? String(r.certificado_nombre) : null,
        sujeto: r.sujeto ? String(r.sujeto) : null,
        huellaSha256: String(r.huella_sha256),
        vigenteDesde: iso(r.vigente_desde),
        caduca,
        subidoAt: iso(r.subido_at),
        verificadoAt: r.verificado_at ? iso(r.verificado_at) : null,
        verificacionError: r.verificacion_error ? String(r.verificacion_error) : null,
        vencida: !!caduca && Date.parse(caduca) <= Date.now(),
    };
}

export async function resumenCredencial(orgId: string, rail: RailId, entorno: EntornoRail): Promise<ResumenCredencial | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select entorno, identificador, certificado_nombre, sujeto, huella_sha256, vigente_desde, caduca,
               subido_at, verificado_at, verificacion_error
          from fiscal_rail_credenciales
         where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}
         limit 1`);
    return rows[0] ? resumen(rows[0]) : null;
}

/**
 * La credencial descifrada, para firmar ante la autoridad. Null si no hay o
 * si no se puede descifrar (llave de cifrado rotada sin la anterior): ambos
 * casos dejan el riel no disponible, nunca se intenta con datos a medias.
 */
export async function credencialActiva(orgId: string, rail: RailId, entorno: EntornoRail): Promise<CredencialActiva | null> {
    const [rows] = await withOrgTx(orgId, sql`
        select entorno, identificador, certificado_nombre, sujeto, huella_sha256, vigente_desde, caduca,
               subido_at, verificado_at, verificacion_error, cert_enc, llave_enc, secretos_enc
          from fiscal_rail_credenciales
         where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}
         limit 1`);
    const r = rows[0];
    if (!r) return null;
    const certPem = decryptSecret(r.cert_enc as string);
    const keyPem = decryptSecret(r.llave_enc as string);
    if (!certPem || !keyPem) return null;
    let secretos: Record<string, string> = {};
    if (r.secretos_enc) {
        try { secretos = JSON.parse(decryptSecret(r.secretos_enc as string) || '{}'); } catch { secretos = {}; }
    }
    return { ...resumen(r), certPem, keyPem, secretos };
}

/**
 * Guarda (o reemplaza) la credencial del riel y entorno. Reemplazar invalida
 * el ticket de acceso cacheado: lo firmó el certificado anterior.
 */
export async function guardarCredencial(orgId: string, rail: RailId, entorno: EntornoRail, cert: CertificadoParseado, meta: {
    identificador: string;
    nombreArchivo?: string | null;
    subidoPor?: string | null;
    secretos?: Record<string, string> | null;
}): Promise<ResumenCredencial> {
    const certEnc = encryptRequiredSecret(cert.certPem);
    const llaveEnc = encryptRequiredSecret(cert.keyPem);
    const secretosEnc = meta.secretos && Object.keys(meta.secretos).length ? encryptRequiredSecret(JSON.stringify(meta.secretos)) : null;
    const [rows] = await withOrgTx(orgId,
        sql`insert into fiscal_rail_credenciales (
                org_id, rail, entorno, cert_enc, llave_enc, secretos_enc, identificador, certificado_nombre, sujeto,
                huella_sha256, vigente_desde, caduca, subido_por, subido_at, verificado_at, verificacion_error)
            values (${orgId}, ${rail}, ${entorno}, ${certEnc}, ${llaveEnc}, ${secretosEnc}, ${meta.identificador},
                    ${meta.nombreArchivo ?? null}, ${cert.sujetoCN}, ${cert.huellaSha256}, ${cert.desde}, ${cert.caduca},
                    ${meta.subidoPor ?? null}, now(), null, null)
            on conflict (org_id, rail, entorno) do update set
                cert_enc = excluded.cert_enc, llave_enc = excluded.llave_enc, secretos_enc = excluded.secretos_enc,
                identificador = excluded.identificador, certificado_nombre = excluded.certificado_nombre,
                sujeto = excluded.sujeto, huella_sha256 = excluded.huella_sha256,
                vigente_desde = excluded.vigente_desde, caduca = excluded.caduca,
                subido_por = excluded.subido_por, subido_at = now(), verificado_at = null, verificacion_error = null
            returning entorno, identificador, certificado_nombre, sujeto, huella_sha256, vigente_desde, caduca,
                      subido_at, verificado_at, verificacion_error`,
        sql`delete from fiscal_rail_accesos where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}`,
    );
    return resumen(rows[0]);
}

export async function eliminarCredencial(orgId: string, rail: RailId, entorno: EntornoRail): Promise<void> {
    await withOrgTx(orgId,
        sql`delete from fiscal_rail_credenciales where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}`,
        sql`delete from fiscal_rail_accesos where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}`,
    );
}

/** Anota el resultado de la última verificación ante la autoridad. `error` debe ser apto para el usuario. */
export async function marcarVerificacion(orgId: string, rail: RailId, entorno: EntornoRail, error: string | null): Promise<void> {
    await withOrgTx(orgId, sql`
        update fiscal_rail_credenciales
           set verificado_at = case when ${error}::text is null then now() else verificado_at end,
               verificacion_error = ${error}
         where org_id = ${orgId} and rail = ${rail} and entorno = ${entorno}`);
}

export async function leerAjustes<T extends object>(orgId: string, rail: RailId): Promise<Partial<T>> {
    const [rows] = await withOrgTx(orgId, sql`
        select ajustes from fiscal_rail_ajustes where org_id = ${orgId} and rail = ${rail} limit 1`);
    const a = rows[0]?.ajustes;
    return a && typeof a === 'object' && !Array.isArray(a) ? a as Partial<T> : {};
}

export async function guardarAjustes(orgId: string, rail: RailId, ajustes: Record<string, unknown>): Promise<void> {
    await withOrgTx(orgId, sql`
        insert into fiscal_rail_ajustes (org_id, rail, ajustes, updated_at)
        values (${orgId}, ${rail}, ${JSON.stringify(ajustes)}::jsonb, now())
        on conflict (org_id, rail) do update set ajustes = excluded.ajustes, updated_at = now()`);
}
