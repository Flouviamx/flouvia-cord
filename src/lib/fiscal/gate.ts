import { sql, withOrgTx } from '../db';
import type { FeatureKey } from '../entitlements';

/** País fiscal del emisor, normalizado. Default MX por compatibilidad. */
export async function orgCountry(orgId: string): Promise<string> {
    const [rows] = await withOrgTx(orgId, sql`
        select upper(coalesce(country_code, 'MX')) as country_code
          from orgs where id = ${orgId} limit 1`);
    return String(rows[0]?.country_code || 'MX');
}

export async function invoicingFeatureFor(_orgId: string): Promise<FeatureKey> {
    // Acceso al producto gratuito; el tipo fiscal se autoriza al emitir.
    return 'international_invoicing';
}
