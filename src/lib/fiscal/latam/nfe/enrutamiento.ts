// Brasil tiene dos documentos fiscales que no se mezclan: la NFS-e
// (servicios, municipal, Sistema Nacional NFS-e) y la NF-e modelo 55
// (mercancías, estatal, SEFAZ). Este módulo decide cuál nace para un
// documento de Cord, por sus conceptos:
//
//   - Todos los conceptos son productos del catálogo con datos de NF-e
//     (FiscalLineItem.nfe, congelado al guardar) → `nfe_invoice`.
//   - Ninguno lo es → los servicios de siempre: `nfse_invoice` si la NFS-e
//     está lista; si no, el documento no fiscal (o un error si se pidió
//     fiscal).
//   - Mezcla → falla cerrado: son dos documentos distintos ante dos
//     autoridades distintas.
//
// Sin NFE_ENABLED este módulo no cambia nada: el tipo de documento queda
// exactamente como lo decidía document-kind.ts (regla 15).

import { sql, withOrgTx } from '../../../db';
import type { FiscalLineItem } from '../../index';
import { railConfig } from '../config';
import { railListo } from '../estado';
import { RIELES } from '../rieles';
import { produtoNfeDe } from './produto';

export const MSG_MIXTA = 'Esta factura mezcla servicios y productos. En Brasil los servicios se documentan con NFS-e (municipal) y las mercancías con NF-e (estatal): son dos documentos distintos. Emite una factura con los servicios y otra con los productos.';
const MSG_NFE_NO_LISTA = 'Estos productos se facturan con NF-e, y la NF-e de tu cuenta todavía no está completa. Termina de configurarla en Ajustes › Datos fiscales o emite un documento no fiscal.';
const MSG_NFSE_NO_LISTA = 'Esta factura es de servicios: en Brasil se documenta con NFS-e, que no está activa en tu cuenta. Actívala en Ajustes › Datos fiscales o emite un documento no fiscal.';

/** ¿Los conceptos son mercancías con NF-e? 'todas' | 'ninguna' | 'mezcla'. */
export function clasificarConceptos(lines: Pick<FiscalLineItem, 'nfe'>[]): 'todas' | 'ninguna' | 'mezcla' {
    const conNfe = lines.filter((l) => !!l.nfe).length;
    if (!conNfe) return 'ninguna';
    return conNfe === lines.length ? 'todas' : 'mezcla';
}

/**
 * Tipo de documento final de un documento de Brasil. `docType` es el que
 * eligió document-kind.ts (el riel "del país" es la NFS-e).
 */
export async function tipoDocumentoBrasil(orgId: string, docType: string, lines: Pick<FiscalLineItem, 'nfe'>[], mode?: unknown): Promise<{ ok: true; docType: string } | { ok: false; error: string }> {
    const fiscales = [RIELES.nfse.documentos.factura, RIELES.nfe.documentos.factura];
    if (!fiscales.includes(docType)) return { ok: true, docType };
    if (!railConfig('nfe').habilitado) return { ok: true, docType };
    const clase = clasificarConceptos(lines);
    if (clase === 'mezcla') return { ok: false, error: MSG_MIXTA };
    if (clase === 'todas') {
        return (await railListo(orgId, 'nfe')) ? { ok: true, docType: RIELES.nfe.documentos.factura } : { ok: false, error: MSG_NFE_NO_LISTA };
    }
    if (await railListo(orgId, 'nfse')) return { ok: true, docType: RIELES.nfse.documentos.factura };
    return mode === 'fiscal' ? { ok: false, error: MSG_NFSE_NO_LISTA } : { ok: true, docType: 'proforma' };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Congela en cada concepto los datos de NF-e de su producto del catálogo
 * (`productos.nfe`, más el SKU como código del producto). `productIds` va en
 * el orden de `lines`. Solo con la NF-e encendida y en Brasil: sin eso las
 * líneas quedan idénticas a las de siempre. Se lee en servidor y acotado a la
 * organización: el navegador no decide con qué NCM o CFOP se emite.
 */
export async function conDatosNfe(orgId: string, country: string, productIds: (string | null | undefined)[], lines: FiscalLineItem[]): Promise<FiscalLineItem[]> {
    if (country !== RIELES.nfe.pais || !railConfig('nfe').habilitado) return lines;
    const ids = Array.from(new Set(productIds.filter((id): id is string => !!id && UUID_RE.test(String(id)))));
    if (!ids.length) return lines;
    const [rows] = await withOrgTx(orgId, sql`
        select id, sku, nfe from productos
         where org_id = ${orgId} and id = any(${ids}::uuid[]) and nfe is not null`);
    const porId = new Map(rows.map((r) => [String(r.id), r]));
    return lines.map((line, i) => {
        const p = productIds[i] ? porId.get(String(productIds[i])) : undefined;
        const dados = p ? produtoNfeDe(p.nfe) : null;
        if (!dados?.ok || !dados.valor) return line;
        const codigo = String(p!.sku ?? '').trim() || String(p!.id).slice(0, 8).toUpperCase();
        return { ...line, nfe: { ...dados.valor, codigo } };
    });
}
