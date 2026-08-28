// src/pages/api/billing/connect/disconnect.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { t } from '../../../../i18n/app';
import { stripe } from '../../../../lib/billing';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { auditConnect } from '../../../../lib/connect-audit';
import { requireFreshAuth } from '../../../../lib/step-up';
import { merchantError } from '../../../../lib/pay-errors';
import { log } from '../../../../lib/log';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;

    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'disconnect', orgId, 4);
    if (limited) return limited;
    const staleAuth = await requireFreshAuth();
    if (staleAuth) return staleAuth;
    const [orgRows] = await withOrgTx(orgId, sql`select sandbox_of, stripe_account_id from orgs where id = ${orgId}`);
    const org = orgRows[0];
    if (org?.sandbox_of) {
        return new Response(JSON.stringify({ error: t(currentLocale(), 'err.test.connect') }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    // ── Borrar en el proveedor: no todo fallo significa lo mismo ────────────
    //
    // El `catch` vacío trataba igual dos casos opuestos: "la cuenta ya no existe
    // allá" (borrarla localmente es correcto) y "el proveedor no respondió"
    // (borrar el id local deja una cuenta VIVA sin referencia — puede seguir
    // recibiendo dinero y nadie en Cord sabría a qué organización pertenece).
    let borradaAlla = false;
    if (org?.stripe_account_id) {
        try {
            await stripe(`/v1/accounts/${org.stripe_account_id}`, undefined, 'DELETE');
            borradaAlla = true;
        } catch (e: any) {
            // Mismo criterio que `create.ts`: sólo se considera resuelto si el
            // proveedor confirma que esa cuenta ya no existe o no es accesible.
            const msg = String(e?.message || '');
            if (/no such account|does not have access|has been deleted|account is invalid/i.test(msg)) {
                borradaAlla = true;
            } else {
                const safe = merchantError(e);
                log.error('no se pudo desconectar la cuenta en el proveedor', {
                    route: 'connect-disconnect', orgId, reference: safe.reference, err: e,
                });
                return new Response(JSON.stringify({
                    error: 'No pudimos desconectar tu cuenta de cobros en este momento. Vuelve a intentarlo en unos minutos.',
                    reference: safe.reference,
                }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
        }
    }

    // Se limpia TODO el estado derivado de la cuenta anterior, no sólo el id.
    // Antes quedaban rancios `stripe_requirements`, `stripe_disabled_reason`,
    // `stripe_person_id` y `stripe_business_type`: al conectar una cuenta nueva,
    // el asistente arrancaba mostrando los requisitos de la vieja.
    await withOrgTx(orgId,
        sql`update orgs set
                stripe_account_id        = null,
                stripe_account_type      = null,
                stripe_charges_enabled   = false,
                stripe_payouts_enabled   = false,
                stripe_details_submitted = false,
                stripe_disabled_reason   = null,
                stripe_requirements      = null,
                stripe_person_id         = null,
                stripe_business_type     = null,
                acepta_tarjeta           = false,
                cobro_spei_auto          = false
              where id = ${orgId}`,
        // El espejo de personas y las sesiones de captura pertenecen a la cuenta
        // que se acaba de desconectar: conservarlos sólo produce una lista de
        // personas que ya no corresponde a nada.
        sql`delete from connect_personas where org_id = ${orgId}`,
        sql`delete from identity_capture_sessions where org_id = ${orgId}`,
    );
    // La EVIDENCIA de KYC no se borra: es el registro de lo que Cord transmitió y
    // tiene su propio plazo de retención (regla 34). Desconectar una cuenta no
    // borra la constancia de lo que ya se envió.
    await auditConnect(orgId, request, 'cuenta_desconectada', {
        detail: borradaAlla ? 'cuenta eliminada en el proveedor' : 'cuenta ya inexistente en el proveedor',
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
