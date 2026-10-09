// ¿Está listo el riel del SII para esta organización? Una sola respuesta para
// la UI (Ajustes › Datos fiscales), para document-kind.ts (qué tipo de
// documento nace) y para el proveedor (si emite o degrada a comercial).
//
// Listo = el despliegue tiene el SII encendido (SII_ENABLED) + la cuenta subió
// un certificado vigente DEL ENTORNO del despliegue + los datos que el DTE
// exige (giro, actividad, comuna, unidad del SII, resolución) + folios
// vigentes de factura (33). Faltando cualquiera, las facturas siguen como
// documento comercial y la pantalla dice qué falta (regla 15).

import { sql, withOrgTx } from '../../../db';
import { railConfig } from '../config';
import { leerAjustes, resumenCredencial, type ResumenCredencial } from '../credenciales';
import type { EntornoRail } from '../rieles';
import { faltantesAjustes, hoyChile, type AjustesSii, type FaltanteSii } from './autorizacion';
import { estadoFolios, listarCafs, type EstadoFolios, type ResumenCaf } from './cafs';
import { rutValido } from './texto';

export interface EstadoSii {
    habilitado: boolean;
    entorno: EntornoRail;
    credencial: ResumenCredencial | null;
    ajustes: Partial<AjustesSii>;
    /** RUT del negocio (Ajustes › Datos fiscales), normalizado; null si falta o no es válido. */
    rut: string | null;
    cafs: ResumenCaf[];
    folios: EstadoFolios[];
    /** Lo que falta, como código (la pantalla lo traduce). Vacío = listo. */
    faltantes: FaltanteSii[];
    listo: boolean;
}

export async function estadoSii(orgId: string): Promise<EstadoSii> {
    const config = railConfig('sii');
    const hoy = hoyChile();
    const [[orgRows], ajustes, credencial, cafs] = await Promise.all([
        withOrgTx(orgId, sql`
            select fiscal_metadata->>'tax_id' as tax_id, rfc,
                   coalesce(nullif(fiscal_metadata->>'legal_name', ''), razon_social, nombre) as razon_social,
                   coalesce(nullif(fiscal_metadata->>'address_line1', ''), direccion) as direccion
              from orgs where id = ${orgId} limit 1`),
        leerAjustes<AjustesSii>(orgId, 'sii'),
        resumenCredencial(orgId, 'sii', config.entorno),
        listarCafs(orgId, config.entorno, hoy),
    ]);
    const org = orgRows[0] ?? {};
    const rut = rutValido(org.tax_id || org.rfc);
    const folios = estadoFolios(cafs);
    const faltantes: FaltanteSii[] = [];
    if (!rut) faltantes.push('rut');
    if (!String(org.razon_social ?? '').trim()) faltantes.push('razon_social');
    if (!String(ajustes.direccion || org.direccion || '').trim()) faltantes.push('direccion');
    faltantes.push(...faltantesAjustes(ajustes, config.entorno));
    if (!credencial) faltantes.push('certificado');
    else if (credencial.vencida) faltantes.push('certificado_vencido');
    if (!(folios.find((f) => f.tipo === 33)?.disponibles ?? 0) && !(folios.find((f) => f.tipo === 34)?.disponibles ?? 0)) faltantes.push('folios');
    return {
        habilitado: config.habilitado,
        entorno: config.entorno,
        credencial,
        ajustes,
        rut,
        cafs,
        folios,
        faltantes,
        listo: config.habilitado && faltantes.length === 0,
    };
}

export async function siiListo(orgId: string): Promise<boolean> {
    if (!railConfig('sii').habilitado) return false;
    return (await estadoSii(orgId)).listo;
}
