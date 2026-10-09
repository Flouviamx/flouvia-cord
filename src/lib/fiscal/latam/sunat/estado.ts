// ¿Está listo el riel de SUNAT para esta organización? Una sola respuesta para
// la UI (Ajustes › Datos fiscales), para document-kind.ts (qué tipo de
// documento nace) y para el proveedor (si envía o degrada a comercial).
//
// Listo = el despliegue tiene SUNAT encendido (SUNAT_ENABLED) + la cuenta
// tiene RUC y razón social + un certificado digital vigente DEL ENTORNO del
// despliegue, a nombre de su RUC + el usuario SOL secundario (en producción)
// + los ajustes (serie y qué vende), y no declaró un régimen que Cord todavía
// no sabe facturar (detracciones, percepción). Faltando cualquiera, las
// facturas siguen como documento comercial y la pantalla dice qué falta
// (regla 15).

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { credencialActiva, leerAjustes, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { faltantesAjustes, solDe, type AjustesSunat, type FaltanteSunat } from './autorizacion';
import { rucValido } from './comprobante';

export interface EstadoSunat {
    /** El despliegue habla con SUNAT. */
    habilitado: boolean;
    entorno: EntornoRail;
    credencial: ResumenCredencial | null;
    /** Hay un usuario SOL guardado (nunca su clave). */
    usuarioSol: string | null;
    ajustes: Partial<AjustesSunat>;
    /** RUC del negocio (Ajustes › Datos fiscales), normalizado; null si falta o no es válido. */
    ruc: string | null;
    /** Lo que falta, como código (la pantalla lo traduce). Vacío = listo. */
    faltantes: FaltanteSunat[];
    listo: boolean;
}

/** RUC y razón social del emisor tal como los usa el snapshot de la factura (fiscal/parties.ts). */
export async function emisorSunat(orgId: string): Promise<{ ruc: string | null; razonSocial: string }> {
    const [[o]] = await withOrgTx(orgId, sql`
        select fiscal_metadata->>'tax_id' as tax_id, fiscal_metadata->>'legal_name' as legal_name, rfc, razon_social, nombre
          from orgs where id = ${orgId} limit 1`);
    return {
        ruc: rucValido(o?.tax_id || o?.rfc),
        razonSocial: String(o?.legal_name || o?.razon_social || o?.nombre || '').trim(),
    };
}

export async function estadoSunat(orgId: string): Promise<EstadoSunat> {
    const config = railConfig('sunat');
    const [emisor, ajustes, activa] = await Promise.all([
        emisorSunat(orgId),
        leerAjustes<AjustesSunat>(orgId, 'sunat'),
        credencialActiva(orgId, 'sunat', config.entorno),
    ]);
    const faltantes: FaltanteSunat[] = [];
    if (!emisor.ruc) faltantes.push('ruc');
    if (!emisor.razonSocial) faltantes.push('razon_social');
    faltantes.push(...faltantesAjustes(ajustes));
    if (!activa) faltantes.push('certificado');
    else if (activa.vencida) faltantes.push('certificado_vencido');
    else if (emisor.ruc && activa.identificador !== emisor.ruc) faltantes.push('certificado_ruc');
    if (activa && emisor.ruc && !solDe(activa, emisor.ruc, config.entorno)) faltantes.push('usuario_sol');
    // Lo que vuelve a la pantalla es el resumen: nunca el PEM ni la clave SOL.
    const credencial: ResumenCredencial | null = activa ? {
        entorno: activa.entorno, identificador: activa.identificador, nombreArchivo: activa.nombreArchivo, sujeto: activa.sujeto,
        huellaSha256: activa.huellaSha256, vigenteDesde: activa.vigenteDesde, caduca: activa.caduca, subidoAt: activa.subidoAt,
        verificadoAt: activa.verificadoAt, verificacionError: activa.verificacionError, vencida: activa.vencida,
    } : null;
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial,
        usuarioSol: activa?.secretos?.usuarioSol ? String(activa.secretos.usuarioSol) : null,
        ajustes,
        ruc: emisor.ruc,
        faltantes,
        listo: config.habilitado && faltantes.length === 0,
    };
}

export async function sunatListo(orgId: string): Promise<boolean> {
    if (!railConfig('sunat').habilitado) return false;
    return (await estadoSunat(orgId)).listo;
}
