// Qué entitlement gatea la facturación de ESTA organización.
//
// `cfdi` e `international_invoicing` son dos carriles del mismo producto (Cord
// Invoicing) y están en el mismo peldaño de plan; lo único que cambia es el
// rail regulatorio del país del emisor. La elección se repetía inline en el
// endpoint de cotizaciones, y cada camino nuevo (draft, finalize, API v1, MCP)
// la habría vuelto a copiar — con el riesgo de que uno se quedara con el gate
// equivocado y un negocio fuera de México pasara por el gate de CFDI.

import { sql } from '../db';
import type { FeatureKey } from '../entitlements';

/** País fiscal del emisor, normalizado. Default MX por compatibilidad. */
export async function orgCountry(orgId: string): Promise<string> {
    const [row] = await sql`
        select upper(coalesce(country_code, 'MX')) as country_code
          from orgs where id = ${orgId} limit 1`;
    return String(row?.country_code || 'MX');
}

export async function invoicingFeatureFor(orgId: string): Promise<FeatureKey> {
    return (await orgCountry(orgId)) === 'MX' ? 'cfdi' : 'international_invoicing';
}
