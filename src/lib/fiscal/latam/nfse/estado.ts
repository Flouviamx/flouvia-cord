// ¿Está lista la NFS-e para esta organización? Una sola respuesta para la UI
// (Ajustes › Datos fiscales), para document-kind.ts (qué tipo de documento
// nace) y para el proveedor (si emite o degrada a comercial).
//
// Lista = el despliegue tiene la NFS-e encendida (NFSE_ENABLED) + el negocio
// subió un certificado ICP-Brasil vigente DEL ENTORNO del despliegue, a nombre
// de su CNPJ/CPF + los ajustes mínimos (municipio, serie, régimen, servicio).
// Faltando cualquiera, las facturas siguen como documento comercial y la
// pantalla dice qué falta (regla 15).

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { leerAjustes, resumenCredencial, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { faltantesAjustes, type AjustesNfse, type FaltanteNfse } from './ajustes';
import { credencialCobre } from './autorizacao';
import { documentoFederal, type DocumentoFederal } from './dps';
import { municipio, type Municipio } from './municipios';

export interface PerfilRetencao {
    id: string;
    nome: string;
    /** Porcentaje (0–100), como en Ajustes › Impuestos. */
    tasa: number;
}

export interface EstadoNfse {
    /** El despliegue habla con la Sefin Nacional. */
    habilitado: boolean;
    entorno: EntornoRail;
    credencial: ResumenCredencial | null;
    ajustes: Partial<AjustesNfse>;
    /** CNPJ/CPF del negocio (Ajustes › Datos fiscales), normalizado; null si falta o no es válido. */
    documento: DocumentoFederal | null;
    municipio: Municipio | null;
    /** Perfiles de retención activos (Ajustes › Impuestos), para elegir el del ISS. */
    retencoes: PerfilRetencao[];
    /** Lo que falta, como código (la pantalla lo traduce). Vacío = listo. */
    faltantes: FaltanteNfse[];
    listo: boolean;
}

export async function estadoNfse(orgId: string): Promise<EstadoNfse> {
    const config = railConfig('nfse');
    const [[orgRows, retRows], ajustes, credencial] = await Promise.all([
        withOrgTx(orgId,
            sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId} limit 1`,
            sql`select id, nombre, tasa from impuestos
                 where org_id = ${orgId} and kind = 'retencion' and activo = true
                 order by nombre`,
        ),
        leerAjustes<AjustesNfse>(orgId, 'nfse'),
        resumenCredencial(orgId, 'nfse', config.entorno),
    ]);
    const documento = documentoFederal(orgRows[0]?.tax_id || orgRows[0]?.rfc);
    const faltantes: FaltanteNfse[] = [...faltantesAjustes(ajustes)];
    if (!documento) faltantes.unshift('documento');
    if (!credencial) faltantes.push('certificado');
    else if (credencial.vencida) faltantes.push('certificado_vencido');
    else if (documento && !credencialCobre(credencial.identificador, documento)) faltantes.push('certificado_documento');
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial,
        ajustes,
        documento,
        municipio: municipio(ajustes.municipio),
        retencoes: retRows.map((r) => ({ id: String(r.id), nome: String(r.nombre), tasa: Number(r.tasa) })),
        faltantes,
        listo: config.habilitado && faltantes.length === 0,
    };
}

export async function nfseListo(orgId: string): Promise<boolean> {
    if (!railConfig('nfse').habilitado) return false;
    return (await estadoNfse(orgId)).listo;
}
