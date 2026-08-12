// Cron de cobranza autónoma (AI Accounts Receivable). Agendado en vercel.json
// (diario 16:00 UTC) y protegido con CRON_SECRET.
//
// Este archivo es SOLO el disparador: toda la lógica —selección de cartera con
// el vencimiento canónico, días de gracia, cadencia, exclusiones, monto mínimo,
// tope por corrida, llamada al agente, envío o borrador según el modo de la
// org— vive en src/lib/agents/cobranza-run.ts, que comparte con el botón de
// ejecución manual. Antes eran dos implementaciones divergentes.
import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { orgsConCobranzaActiva, runCobranzaOrg, type RunResult } from '../../../lib/agents/cobranza-run';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  try {
    const orgs = await orgsConCobranzaActiva();
    const results: (RunResult & { error?: string })[] = [];
    for (const orgId of orgs) {
      try {
        results.push(await runCobranzaOrg(orgId));
      } catch (e: any) {
        // Una org que falla no puede tumbar la corrida de las demás.
        console.error(`cobranza: org ${orgId} falló`, e);
        results.push({ orgId, error: e?.message ?? 'error', procesadas: 0, borradores: 0, enviados: 0, fallidos: 0, omitidas: [] });
      }
    }

    const total = (k: 'procesadas' | 'borradores' | 'enviados' | 'fallidos') =>
      results.reduce((s, r) => s + (r[k] ?? 0), 0);

    return new Response(JSON.stringify({
      success: true,
      orgs: orgs.length,
      processed: total('procesadas'),
      borradores: total('borradores'),
      enviados: total('enviados'),
      fallidos: total('fallidos'),
      results,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error en cron de cobranza:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
