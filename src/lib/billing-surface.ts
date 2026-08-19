// src/lib/billing-surface.ts
// Puerta común de los endpoints de la superficie de facturación de Cord
// (`billing.cordhq.app`).
//
// Existe por una sola razón: cada uno de esos endpoints recibe un id de objeto
// de Stripe DESDE EL CLIENTE (un payment method, una factura). Sin verificar que
// ese objeto cuelga del customer de la org activa, cualquier miembro con permiso
// de ajustes puede leer la factura de otro negocio. El check no puede quedar a
// criterio de cada archivo: se escribe una vez y se usa siempre.

import { sql, getActiveOrgId } from './db';
import { requirePerm } from './queries';
import { STRIPE_KEY, stripe } from './billing';

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export interface BillingContext {
    orgId: string;
    customer: string;
    subscriptionId: string | null;
    status: string | null;
}

/**
 * Resuelve el contexto de facturación o devuelve la Response que corta.
 *
 * Los mensajes describen el ESTADO, nunca el mecanismo: nada de "Stripe",
 * nombres de variables de entorno ni proveedores (regla 14).
 */
export async function billingContext(): Promise<{ ctx: BillingContext } | { denied: Response }> {
    const denied = await requirePerm('ajustes');
    if (denied) return { denied };
    if (!STRIPE_KEY) return { denied: json({ error: 'La facturación aún no está disponible.' }, 503) };

    const orgId = await getActiveOrgId();
    const [o] = await sql`
        select stripe_customer_id, stripe_subscription_id, subscription_status, sandbox_of
          from orgs where id = ${orgId}`;

    if (o?.sandbox_of) {
        return { denied: json({ error: 'Estás en el entorno de prueba. Sal del modo de prueba para gestionar tu facturación.' }, 409) };
    }
    const customer = o?.stripe_customer_id as string | undefined;
    if (!customer) {
        return { denied: json({ error: 'Todavía no tienes una suscripción. Elige un plan para empezar.', code: 'no_subscription' }, 409) };
    }
    return {
        ctx: {
            orgId,
            customer,
            subscriptionId: (o?.stripe_subscription_id as string) || null,
            status: (o?.subscription_status as string) || null,
        },
    };
}

/**
 * Lee un objeto de Stripe y EXIGE que pertenezca a este customer.
 *
 * Devuelve 404 —no 403— cuando el dueño es otro: confirmar que un id existe pero
 * es ajeno ya es filtrar información entre negocios.
 */
export async function fetchOwned(
    path: string,
    customer: string,
    query?: Record<string, string>,
): Promise<{ object: any } | { denied: Response }> {
    let object: any;
    try {
        object = await stripe(path, query, 'GET');
    } catch {
        return { denied: json({ error: 'No encontramos ese registro.' }, 404) };
    }
    const owner = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
    if (!owner || owner !== customer) {
        return { denied: json({ error: 'No encontramos ese registro.' }, 404) };
    }
    return { object };
}

// ── Identificador fiscal, en el vocabulario del procesador ────────────────────
// Stripe clasifica los identificadores con su propio enum (`mx_rfc`, `eu_vat`,
// `us_ein`…), que NO es el mismo dato que `taxIdLabel` del perfil de país: uno
// es cómo se le llama al usuario, el otro cómo lo archiva el procesador. Por eso
// vive aquí y no en `countries.ts`.
//
// Lo no mapeado cae a `unknown`, que Stripe acepta: guarda el valor sin validar
// su formato. Es preferible a rechazar el dato de un país que no previmos.
const EU_VAT = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE',
]);

const TAX_ID_TYPE: Record<string, string> = {
    MX: 'mx_rfc', US: 'us_ein', GB: 'gb_vat', CA: 'ca_bn', AU: 'au_abn',
    BR: 'br_cnpj', AR: 'ar_cuit', CL: 'cl_tin', CO: 'co_nit', PE: 'pe_ruc',
    UY: 'uy_ruc', CH: 'ch_vat', JP: 'jp_cn', IN: 'in_gst', NZ: 'nz_gst',
    NO: 'no_vat', ZA: 'za_vat', KR: 'kr_brn', SG: 'sg_uen',
};

export function stripeTaxIdType(countryCode?: string | null): string {
    const code = String(countryCode ?? '').trim().toUpperCase();
    if (TAX_ID_TYPE[code]) return TAX_ID_TYPE[code];
    if (EU_VAT.has(code)) return 'eu_vat';
    return 'unknown';
}
