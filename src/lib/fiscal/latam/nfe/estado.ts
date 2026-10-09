// ¿Está lista la NF-e para esta organización? Una sola respuesta para la UI
// (Ajustes › Datos fiscales), para el enrutamiento de documentos de Brasil
// (enrutamiento.ts) y para el proveedor.
//
// Lista = el despliegue tiene la NF-e encendida (NFE_ENABLED) + el negocio
// tiene un certificado ICP-Brasil vigente DEL ENTORNO a nombre de su CNPJ —el
// propio de la NF-e o, si no subió uno, el de la NFS-e del mismo CNPJ— + los
// ajustes mínimos (serie, régimen, IE, dirección, PIS/COFINS) + el responsable
// técnico cuando la SEFAZ de su estado lo exige.

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { credencialActiva, leerAjustes, resumenCredencial, type CredencialActiva, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { credencialCobre } from '../nfse/autorizacao';
import { documentoFederal, type DocumentoFederal } from '../nfse/dps';
import { municipio, type Municipio } from '../nfse/municipios';
import { faltantesAjustes, type AjustesNfe, type FaltanteNfe } from './ajustes';
import { UF_EXIGE_CSRT, UF_EXIGE_RESP_TEC, esUf } from './constantes';
import { responsavelTecnico } from './resp-tec';

export interface EstadoNfe {
    habilitado: boolean;
    entorno: EntornoRail;
    /** La credencial con la que se firmaría: la de la NF-e, o la de la NFS-e del mismo CNPJ. */
    credencial: ResumenCredencial | null;
    origenCredencial: 'nfe' | 'nfse' | null;
    ajustes: Partial<AjustesNfe>;
    documento: DocumentoFederal | null;
    municipio: Municipio | null;
    faltantes: FaltanteNfe[];
    listo: boolean;
    /** Contingencia (SVC) abierta, si la hay. */
    contingencia: { svc: string; desde: string } | null;
}

async function documentoDaOrg(orgId: string): Promise<DocumentoFederal | null> {
    const [[org]] = await withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId} limit 1`);
    return documentoFederal(org?.tax_id || org?.rfc);
}

/**
 * Resumen de la credencial con la que se firmaría: la propia de la NF-e o, si
 * no hay, la de la NFS-e cuando es del mismo CNPJ (un e-CNPJ A1 sirve a los
 * dos sistemas).
 */
async function resumenElegido(orgId: string, entorno: EntornoRail, documento: DocumentoFederal | null): Promise<{ credencial: ResumenCredencial | null; origen: 'nfe' | 'nfse' | null }> {
    const propia = await resumenCredencial(orgId, 'nfe', entorno);
    if (propia) return { credencial: propia, origen: 'nfe' };
    const nfse = await resumenCredencial(orgId, 'nfse', entorno);
    if (nfse && documento?.tipo === 'CNPJ' && credencialCobre(nfse.identificador, documento)) return { credencial: nfse, origen: 'nfse' };
    return { credencial: null, origen: null };
}

/** La credencial descifrada para firmar (la misma elección que resumenElegido). */
export async function credencialNfe(orgId: string, entorno: EntornoRail, documento: DocumentoFederal | null): Promise<CredencialActiva | null> {
    const propia = await credencialActiva(orgId, 'nfe', entorno);
    if (propia) return propia;
    const nfse = await credencialActiva(orgId, 'nfse', entorno);
    return nfse && documento?.tipo === 'CNPJ' && credencialCobre(nfse.identificador, documento) ? nfse : null;
}

export async function estadoNfe(orgId: string): Promise<EstadoNfe> {
    const config = railConfig('nfe');
    const [ajustes, documento] = await Promise.all([leerAjustes<AjustesNfe>(orgId, 'nfe'), documentoDaOrg(orgId)]);
    const { credencial, origen } = await resumenElegido(orgId, config.entorno, documento);
    const [contRows] = await withOrgTx(orgId, sql`
        select svc, iniciada_at from nfe_contingencias
         where org_id = ${orgId} and entorno = ${config.entorno} and encerrada_at is null
         limit 1`);
    const faltantes: FaltanteNfe[] = [...faltantesAjustes(ajustes)];
    if (!documento || documento.tipo !== 'CNPJ') faltantes.unshift('documento');
    if (!credencial) faltantes.push('certificado');
    else if (credencial.vencida) faltantes.push('certificado_vencido');
    else if (documento && !credencialCobre(credencial.identificador, documento)) faltantes.push('certificado_documento');
    const mun = municipio(ajustes.municipio);
    const uf = mun && esUf(mun.uf) ? mun.uf : null;
    const rt = responsavelTecnico();
    if (uf && ((UF_EXIGE_RESP_TEC.includes(uf) && !rt) || (UF_EXIGE_CSRT.includes(uf) && !rt?.csrt?.[uf]))) faltantes.push('responsavel_tecnico');
    const c = contRows[0];
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial,
        origenCredencial: origen,
        ajustes,
        documento,
        municipio: mun,
        faltantes,
        listo: config.habilitado && faltantes.length === 0,
        contingencia: c ? { svc: String(c.svc), desde: c.iniciada_at instanceof Date ? c.iniciada_at.toISOString() : String(c.iniciada_at) } : null,
    };
}

export async function nfeListo(orgId: string): Promise<boolean> {
    if (!railConfig('nfe').habilitado) return false;
    return (await estadoNfe(orgId)).listo;
}
