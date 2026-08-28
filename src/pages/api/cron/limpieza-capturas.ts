export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';
import { RETENCION_ANIOS } from '../../../lib/kyc-evidencia';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        // `completed_at` NUNCA existió en el schema. Postgres evalúa el WHERE
        // completo, así que este DELETE reventaba con "column does not exist" y
        // **la rama de `expires_at` tampoco se ejecutaba**: ninguna sesión de
        // captura se borró jamás, y el cron devolvía 500 a diario sin que nadie
        // lo notara. La tabla acumulaba org, cuenta conectada, persona y hash del
        // token de todas las verificaciones históricas.
        //
        // El TTL es el único criterio: una sesión cerrada sigue viva unos minutos
        // a propósito, porque el escritorio la sondea cada 2.5 s y un 404 le
        // pintaría "enlace no válido" justo en el momento del éxito.
        const [sesiones, evidencia] = await withSystemTx(
            sql`delete from identity_capture_sessions
                 where expires_at < now()
                    or (closed_at is not null and closed_at < now() - interval '1 hour')
                returning id`,
            // Evidencia de KYC: se conserva RETENCION_ANIOS años desde el envío.
            // Es el horizonte AML habitual (LFPIORPI en México, las directivas
            // AMLD en la UE) para la evidencia de identificación del cliente. El
            // intervalo se construye desde la constante para que cambiar la
            // política sea un solo lugar y quede en el diff.
            sql`delete from connect_kyc_evidencia
                 where created_at < now() - (${String(RETENCION_ANIOS)} || ' years')::interval
                returning id`,
        );
        return new Response(JSON.stringify({
            deleted: sesiones.length,
            evidenciaPurgada: evidencia.length,
        }), { headers: { 'Content-Type': 'application/json' } });
    });
};
