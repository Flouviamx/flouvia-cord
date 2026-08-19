// POST /api/onboarding/complete — cierra el wizard de /onboarding: renombra
// la org (que hoy nace en silencio como "Mi negocio", ver resolveOrgId() en
// db.ts) y guarda país/giro/tamaño/puesto/casos de uso.
//
// Solo el DUEÑO puede completarlo (mismo criterio que el gate de
// middleware.ts) — un miembro invitado no debe poder renombrar la empresa de
// otra persona por esta vía; para eso está /api/org (PATCH, permiso
// `ajustes`). Este endpoint es deliberadamente más chico: 5 campos, todos
// contra allowlists de slugs — nunca texto libre a la BD salvo el nombre.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, getActiveOrgId, logAudit, reqIp, withOrgTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { COUNTRY_CODES, getCountryProfile } from '../../../lib/countries';
import { defaultCountryTaxPct } from '../../../lib/impuestos';
import { seedTaxCatalog } from '../../../lib/impuestos-db';

const PUESTOS = ['dueno', 'ventas', 'finanzas', 'operaciones', 'otro'] as const;
const INDUSTRIAS = ['distribucion', 'manufactura', 'construccion', 'servicios', 'tecnologia', 'comercio', 'otro'] as const;
const TAMANOS = ['solo', '2-10', '11-50', '51-200', '200+'] as const;
const CASOS_USO = ['cotizar', 'cobrar', 'facturar', 'seguimiento', 'margenes', 'cobranza_ia'] as const;

const schema = z.object({
    nombre: z.string().trim().min(1).max(120),
    countryCode: z.enum(COUNTRY_CODES),
    puesto: z.enum(PUESTOS),
    industria: z.enum(INDUSTRIAS),
    tamano: z.enum(TAMANOS),
    casosUso: z.array(z.enum(CASOS_USO)).min(1).max(CASOS_USO.length),
});

export const POST: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const rl = await rateLimit(`onboarding:${userId}`, 10, 60);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    const { nombre, countryCode, puesto, industria, tamano, casosUso } = parsed.data;
    const countryProfile = getCountryProfile(countryCode);
    const appLocale = countryProfile.locale.startsWith('es') ? 'es-MX' : 'en-US';

    const orgId = await getActiveOrgId();

    // Solo el dueño completa el wizard — mismo criterio que el gate de
    // middleware.ts (needsOnboarding solo se evalúa para owner_id === userId).
    const [[org]] = await withOrgTx(orgId, sql`select owner_id from orgs where id = ${orgId}`);
    if (!org || org.owner_id !== userId) {
        return json({ error: 'No autorizado' }, 403);
    }

    await withOrgTx(
        orgId,
        sql`update orgs set
                nombre = ${nombre},
                country_code = ${countryCode},
                moneda = ${countryProfile.currency},
                zona_horaria = ${countryProfile.timeZone},
                idioma = ${appLocale},
                iva_pct = ${defaultCountryTaxPct(countryCode)},
                industria = ${industria},
                tamano_equipo = ${tamano},
                casos_uso = ${JSON.stringify(casosUso)}::jsonb,
                onboarded_at = now()
            where id = ${orgId}`,
        sql`update users set puesto = ${puesto} where id = ${userId}`,
    );

    // El país puede haber cambiado respecto al de la creación (el wizard lo
    // vuelve a preguntar), así que el catálogo se siembra aquí también. Es
    // idempotente: no toca un catálogo que ya tenga perfiles.
    await seedTaxCatalog(orgId, countryCode);

    await logAudit(orgId, {
        accion: 'org.onboarding_completado',
        entidad: 'org',
        entidad_id: orgId,
        detalle: `Onboarding completado: ${industria} · ${tamano} · ${countryCode}`,
        ip: reqIp(request),
    });

    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
