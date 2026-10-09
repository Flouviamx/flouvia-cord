// GET /api/cron/depositos — el control diario de depósitos de las cuentas de
// Cord Payments (src/lib/deposit-control.ts):
//   - activa el cobro de saldos negativos al banco donde Stripe lo permite;
//   - decide si una cuenta sale del periodo de prueba o vuelve a él;
//   - lleva la frecuencia de Stripe al estado que toca;
//   - bajo prueba, crea el depósito del día con su reserva del 10%.
//
// La cuenta que lleva más tiempo sin revisarse va primero; lo que no alcance el
// presupuesto de tiempo se revisa mañana. Todo es idempotente.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { procesarCuenta } from '../../../lib/deposit-control';
import { notifyPayoutControl } from '../../../lib/auth-email';
import { sendOpsAlert } from '../../../lib/ops-alert';
import { log } from '../../../lib/log';

const PRESUPUESTO_MS = 240_000;

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    let cuentas: Array<{ org_id: string; stripe_account_id: string; country_code: string }>;
    try {
        cuentas = await sql`select * from cord_cuentas_de_cobro_activas(1000)` as any;
    } catch (err) {
        log.error('no se pudieron listar las cuentas de cobro', { route: 'depositos', err });
        return json({ error: 'No se pudo revisar los depósitos.' }, 500);
    }

    const dia = new Date().toISOString().slice(0, 10);
    const limite = Date.now() + PRESUPUESTO_MS;
    let revisadas = 0; let depositos = 0; let fallidas = 0;
    for (const c of cuentas) {
        if (Date.now() > limite) break;
        const orgId = String(c.org_id);
        revisadas += 1;
        try {
            const r = await reqContext.run({ userId: null, orgId, actor: 'system' }, () =>
                procesarCuenta(orgId, String(c.stripe_account_id), String(c.country_code), dia));
            depositos += r.depositos?.length ?? 0;
            if (r.salioDePrueba) await notifyPayoutControl(orgId, 'prueba_fin');
            if (r.reingreso) {
                await notifyPayoutControl(orgId, 'prueba_reingreso');
                await sendOpsAlert('Cuenta de cobros de vuelta en periodo de prueba', `Organización ${orgId}; motivo ${r.reingreso}`);
            }
        } catch (err) {
            fallidas += 1;
            log.error('no se pudo procesar la cuenta de cobros', { route: 'depositos', orgId, err });
        }
    }
    if (fallidas) await sendOpsAlert('Control de depósitos con fallas', `${fallidas} de ${revisadas} cuentas fallaron hoy`);
    return json({ ok: fallidas === 0, revisadas, depositos, fallidas });
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
