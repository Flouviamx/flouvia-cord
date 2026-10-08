// Serie de facturación única por emisor.
//
// La numeración correlativa es del EMISOR (su NIF / SIREN / VAT), no de la
// organización de Cord. Dos organizaciones con el mismo identificador fiscal
// que numeran con la misma serie emiten el mismo número dos veces: la AEAT ve
// el mismo IDFactura (NIF + número + fecha) y rechaza el segundo como
// duplicado, y fuera de España el emisor queda con dos facturas iguales.
// `cord_serie_en_uso` (db/schema.sql) responde si otra organización con el
// mismo identificador ya usa esta serie, sin exponer nada de ella.
//
// México no entra: el CFDI se identifica por su UUID del SAT, no por el folio.

import { sql, withOrgTx } from '../db';

export function serieCompartidaMensaje(prefix: string): string {
    return `Otra organización con el mismo identificador fiscal ya numera sus facturas con la serie "${prefix}". Elige una serie distinta en Ajustes › Datos fiscales (por ejemplo "${prefix}2") para que las facturas de las dos no repitan número.`;
}

/**
 * ¿Otra organización del mismo país y con el mismo identificador fiscal usa
 * esta serie? `prefix` vacío = la serie por defecto del país (`defaultPrefix`).
 * Sin identificador fiscal no hay con qué comparar y responde `false`.
 */
export async function serieCompartida(
    orgId: string,
    opts: { country: string; taxId: string | null | undefined; prefix: string | null | undefined; defaultPrefix: string },
): Promise<boolean> {
    if (opts.country.toUpperCase() === 'MX') return false;
    const taxId = String(opts.taxId || '').trim();
    if (!taxId) return false;
    const [rows] = await withOrgTx(orgId, sql`
        select cord_serie_en_uso(${orgId}::uuid, ${taxId}, ${String(opts.prefix || '')}, ${opts.defaultPrefix}) as en_uso`);
    return rows[0]?.en_uso === true;
}
