// ¿Está listo el riel de ARCA para esta organización? Una sola respuesta para
// la UI (Ajustes › Datos fiscales), para document-kind.ts (qué tipo de
// documento nace) y para el proveedor (si emite o degrada a comercial).
//
// Listo = el despliegue tiene ARCA encendido (ARCA_ENABLED) + la cuenta subió
// un certificado vigente DEL ENTORNO del despliegue, a nombre de su CUIT + los
// ajustes mínimos (punto de venta, condición frente al IVA, concepto). Faltando
// cualquiera, las facturas siguen como documento comercial y la pantalla dice
// qué falta (regla 15).

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { leerAjustes, resumenCredencial, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { faltantesAjustes, type AjustesArca, type FaltanteArca } from './autorizacion';
import { cuitValido } from './comprobante';

export interface EstadoArca {
    /** El despliegue habla con ARCA. */
    habilitado: boolean;
    entorno: EntornoRail;
    credencial: ResumenCredencial | null;
    ajustes: Partial<AjustesArca>;
    /** CUIT del negocio (Ajustes › Datos fiscales), normalizada; null si falta o no es válida. */
    cuit: string | null;
    /** Lo que falta, como código (la pantalla lo traduce). Vacío = listo. */
    faltantes: FaltanteArca[];
    listo: boolean;
}

export async function estadoArca(orgId: string): Promise<EstadoArca> {
    const config = railConfig('arca');
    const [[orgRows], ajustes, credencial] = await Promise.all([
        withOrgTx(orgId, sql`select fiscal_metadata->>'tax_id' as tax_id, rfc from orgs where id = ${orgId} limit 1`),
        leerAjustes<AjustesArca>(orgId, 'arca'),
        resumenCredencial(orgId, 'arca', config.entorno),
    ]);
    const cuit = cuitValido(orgRows[0]?.tax_id || orgRows[0]?.rfc);
    const faltantes: FaltanteArca[] = [...faltantesAjustes(ajustes)];
    if (!cuit) faltantes.unshift('cuit');
    if (!credencial) faltantes.push('certificado');
    else if (credencial.vencida) faltantes.push('certificado_vencido');
    else if (cuit && credencial.identificador !== cuit) faltantes.push('certificado_cuit');
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial,
        ajustes,
        cuit,
        faltantes,
        listo: config.habilitado && faltantes.length === 0,
    };
}

export async function arcaListo(orgId: string): Promise<boolean> {
    if (!railConfig('arca').habilitado) return false;
    return (await estadoArca(orgId)).listo;
}
