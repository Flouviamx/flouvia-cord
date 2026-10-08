// GET /api/cron/informes-programados — manda por correo los informes guardados
// con envío semanal o mensual (ver src/lib/informes-programados.ts).
//
// Corre a diario (ver vercel.json): cada informe decide si ya le toca según la
// zona horaria de su negocio, así que un lunes en Tokio y uno en Ciudad de México
// salen en su propio lunes.
export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { runInformesProgramados } from '../../../lib/informes-programados';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    // `withSystemTx` exige este carril: solo el barrido descubre informes de varias
    // organizaciones; cada envío vuelve a withOrgTx con su org_id.
    const result = await reqContext.run(
        { userId: null, sessionId: null, activeOrgId: null, cronScope: true },
        () => runInformesProgramados({ limit: 200 }),
    );

    return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
};
