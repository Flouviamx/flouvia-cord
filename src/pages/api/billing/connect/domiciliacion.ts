export const prerender = false;

// Domiciliación bancaria (SEPA en la zona euro, ACH en EE. UU.) y permiso de
// cobro automático, desde Ajustes › Cobros.
//
//   PATCH { domiciliacion?: boolean, cobro_automatico?: boolean }
//
// Encender la domiciliación PIDE la capacidad a la cuenta conectada (Custom:
// la plataforma la solicita por el negocio). Mientras el proveedor la revisa
// queda `pending` y no se ofrece a ningún cliente: `metodosPara()` solo ofrece
// un método con la capacidad `active`. Apagarla deja de ofrecerla en los
// cobros nuevos; los que ya están en proceso siguen su curso.
//
// Apagar el cobro automático no borra los métodos que los clientes guardaron:
// deja de cobrarlos y de ofrecerlo en el portal hasta que se vuelva a encender.

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId, withOrgTx } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { updateConnectAccount } from '../../../../lib/billing';
import { translateStripeError } from '../../../../lib/stripe-catalogs';
import { auditConnect } from '../../../../lib/connect-audit';
import { limitConnectMutation } from '../../../../lib/connect-security';
import { DOMICILIACION, domiciliacionDelPais, estadoCapacidad } from '../../../../lib/cobros/metodos';

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobros_config');
    if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limited = await limitConnectMutation(request, 'domiciliacion', orgId, 10);
    if (limited) return limited;
    const body = await request.json().catch(() => ({} as any));
    const quiereDomiciliacion = typeof body?.domiciliacion === 'boolean' ? body.domiciliacion : undefined;
    const quiereAutopay = typeof body?.cobro_automatico === 'boolean' ? body.cobro_automatico : undefined;
    if (quiereDomiciliacion === undefined && quiereAutopay === undefined) return json({ error: 'Nada que cambiar.' }, 400);

    const [[o]] = await withOrgTx(orgId, sql`
        select stripe_account_id, stripe_charges_enabled, country_code, stripe_capacidades
          from orgs where id = ${orgId}`);
    if (!o) return json({ error: 'Organización no encontrada.' }, 404);

    let capacidades = (o.stripe_capacidades ?? {}) as Record<string, string>;
    const metodo = domiciliacionDelPais(o.country_code);
    if (quiereDomiciliacion) {
        if (!metodo) return json({ error: 'La domiciliación bancaria no está disponible para tu país por ahora.' }, 409);
        if (!o.stripe_account_id || !o.stripe_charges_enabled) {
            return json({ error: 'Termina de activar tu cuenta de cobros antes de encender la domiciliación.' }, 409);
        }
        const capacidad = DOMICILIACION[metodo].capacidad;
        if (estadoCapacidad(capacidades, capacidad) === 'unrequested') {
            try {
                const cuenta = await updateConnectAccount(String(o.stripe_account_id), {
                    [`capabilities[${capacidad}][requested]`]: 'true',
                });
                const estado = cuenta?.capabilities?.[capacidad];
                capacidades = { ...capacidades, [capacidad]: typeof estado === 'string' ? estado : 'pending' };
            } catch (e: any) {
                return json({ error: translateStripeError(e) }, 400);
            }
        }
    }

    await withOrgTx(orgId, sql`
        update orgs set
            acepta_domiciliacion = coalesce(${quiereDomiciliacion ?? null}::boolean, acepta_domiciliacion),
            cobro_automatico_permitido = coalesce(${quiereAutopay ?? null}::boolean, cobro_automatico_permitido),
            stripe_capacidades = ${JSON.stringify(capacidades)}::jsonb
         where id = ${orgId}`);
    await auditConnect(orgId, request, 'cord_pagos.metodos_actualizados', {
        entity: 'orgs',
        detail: [
            quiereDomiciliacion !== undefined ? `domiciliacion: ${quiereDomiciliacion ? 'sí' : 'no'}` : '',
            quiereAutopay !== undefined ? `cobro automático: ${quiereAutopay ? 'sí' : 'no'}` : '',
        ].filter(Boolean).join('; '),
    });
    return json({
        ok: true,
        domiciliacion: metodo ? estadoCapacidad(capacidades, DOMICILIACION[metodo].capacidad) : null,
    });
};
