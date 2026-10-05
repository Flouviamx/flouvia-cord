// Checklist de integración de Cord Elements y la API. Cada paso se marca con
// datos que ya existen (llaves, bitácora de la API, webhooks y sus entregas):
// nada se declara completo porque alguien hizo clic en "listo".
import { sql, withOrgTx } from './db';

export const ONBOARDING_STEPS = ['llave', 'dominios', 'peticion', 'cotizacion_api', 'webhook', 'webhook_entregado'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export async function getOnboarding(orgId: string): Promise<{ sandbox: boolean; steps: Record<OnboardingStep, boolean>; completo: boolean }> {
    const [[row]] = await withOrgTx(orgId, sql`
        select
          (o.sandbox_of is not null) as sandbox,
          exists(select 1 from api_keys k where k.org_id = o.id and k.revoked_at is null and k.oauth_client_id is null) as llave,
          coalesce(nullif(trim(o.embed_domains), ''), '') <> '' as dominios,
          exists(select 1 from api_requests r where r.org_id = o.id and r.status < 400) as peticion,
          exists(select 1 from api_requests r where r.org_id = o.id and r.metodo = 'POST' and r.ruta = '/v1/cotizaciones' and r.status < 300) as cotizacion_api,
          exists(select 1 from webhooks w where w.org_id = o.id and w.activo and w.cli_hasta is null) as webhook,
          exists(select 1 from webhook_events e where e.org_id = o.id and e.estado = 'succeeded') as webhook_entregado
        from orgs o where o.id = ${orgId}`);
    const steps = Object.fromEntries(ONBOARDING_STEPS.map((s) => [s, !!row?.[s]])) as Record<OnboardingStep, boolean>;
    return { sandbox: !!row?.sandbox, steps, completo: ONBOARDING_STEPS.every((s) => steps[s]) };
}
