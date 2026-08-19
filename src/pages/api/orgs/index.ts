// POST /api/orgs — crea una organización nueva para el usuario en sesión.
//
// Reemplaza a /api/orgs/provision (ago 2026). Ese endpoint era un residuo de
// Clerk Organizations: confiaba en un `childOrgId` que el CLIENTE generaba y
// mandaba en el body, sin verificar que le perteneciera — cualquier usuario
// autenticado podía mandar el UUID de la org de OTRO negocio y pisar su
// `country_code`/`parent_org_id` (`insert ... on conflict (id) do update`).
// También consultaba `orgs.clerk_org_id`/`org_members.clerk_user_id`,
// columnas que la migración a auth propio ya eliminó — el endpoint tronaba
// con un 500 sin capturar en cualquier alta de sub-cuenta.
//
// Ahora el ID lo genera el SERVIDOR (default de la tabla), nunca el cliente.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, logAudit, reqIp, getActiveOrgId } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { COUNTRY_CODES, getCountryProfile } from '../../../lib/countries';
import { defaultCountryTaxPct } from '../../../lib/impuestos';
import { seedTaxCatalog } from '../../../lib/impuestos-db';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { log } from '../../../lib/log';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// El alta en cualquier país está abierta (cotizar/cobrar/CRM funcionan igual
// en todos) — lo que SÍ está limitado a México por ahora es la FACTURACIÓN
// fiscal real (ver FiscalFactory: solo MexicoSatProvider timbra de verdad).
// Fuente única: countries.ts (antes este Set vivía duplicado a mano aquí y
// podía desincronizarse si se agregaba un país nuevo en un solo lugar).
const SUPPORTED_COUNTRIES = new Set<string>(COUNTRY_CODES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'No autorizado' }, 401);

    const rl = await rateLimit(`orgs-create:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const activeOrgId = await getActiveOrgId();
    const entitlementDenied = await requireEntitlement(activeOrgId, 'multi_org');
    if (entitlementDenied) return entitlementDenied;

    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const name = String(body?.name || 'Mi negocio').trim().slice(0, 120) || 'Mi negocio';
    const countryCode = String(body?.countryCode || 'MX').toUpperCase();
    const parentOrgId = body?.parentOrgId ? String(body.parentOrgId).trim() : null;

    if (!SUPPORTED_COUNTRIES.has(countryCode)) return json({ error: 'País no soportado' }, 400);
    if (parentOrgId && !UUID_RE.test(parentOrgId)) return json({ error: 'parentOrgId inválido' }, 400);
    const countryProfile = getCountryProfile(countryCode);
    const appLocale = countryProfile.locale.startsWith('es') ? 'es-MX' : 'en-US';

    try {
        // Si se pide anidar bajo otra org, el usuario DEBE ser miembro ACTIVO de
        // esa org — nunca se confía en el id de la org padre sin verificarlo. El
        // driver de Neon devuelve un ARRAY de filas (nunca `const [rows]`).
        if (parentOrgId) {
            const membership = await sql`
                select 1 from org_members
                where org_id = ${parentOrgId} and user_id = ${userId} and estado = 'activo'
                limit 1`;
            if (!membership.length) {
                return json({ error: 'No tienes acceso a esa organización.' }, 403);
            }
        }

        const [org] = await sql`
            insert into orgs (owner_id, nombre, country_code, parent_org_id, moneda, zona_horaria, idioma, iva_pct)
            values (${userId}, ${name}, ${countryCode}, ${parentOrgId}, ${countryProfile.currency},
                    ${countryProfile.timeZone}, ${appLocale}, ${defaultCountryTaxPct(countryCode)})
            returning id, nombre
        `;
        const orgId = org.id as string;

        await sql`
            insert into org_members (org_id, user_id, rol, estado, joined_at)
            values (${orgId}, ${userId}, 'owner', 'activo', now())
            on conflict (org_id, user_id) where user_id is not null do nothing`;

        // El catálogo de impuestos nace con las tasas estándar del país. Sin
        // esto, una cuenta en España empieza vacía y su primera cotización sale
        // sin IVA — el negocio no tiene por qué capturar el 21% a mano para
        // descubrir que Cord ya sabía cuál era.
        await seedTaxCatalog(orgId, countryCode);

        await logAudit(orgId, {
            accion: 'org.creada',
            entidad: 'org',
            entidad_id: orgId,
            detalle: parentOrgId ? `anidada bajo ${parentOrgId}` : 'independiente',
            ip: reqIp(request),
            userAgent: request.headers.get('user-agent') || null,
        });

        return json({ ok: true, orgId, name: org.nombre });
    } catch (error) {
        log.error('error creando org', { route: 'api/orgs', err: error });
        return json({ error: 'internal_error' }, 500);
    }
};
