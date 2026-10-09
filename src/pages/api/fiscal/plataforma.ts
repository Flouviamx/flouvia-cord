// /api/fiscal/plataforma — Francia: el alta del negocio en la plataforma
// autorizada con que Cord emite sus facturas (src/lib/fiscal/transmision/).
//   GET                                       → estado del alta y de la cola
//   POST { accion: 'alta', representante_* }  → crea el alta y devuelve el
//                                               enlace de verificación y mandato
//   POST { accion: 'actualizar' }             → consulta el alta a la plataforma
//
// Crear el alta firma un mandato en nombre del negocio: exige el permiso de
// Ajustes, sesión reciente (step-up) y el mismo plan que el resto de los
// rieles fiscales (csd.ts, verifactu-cert.ts). Las respuestas dicen qué pasó,
// no qué proveedor o variable lo causó (regla 14).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { currentLocale } from '../../../lib/context';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { log } from '../../../lib/log';
import { refrescarAlta, representanteDe, solicitarAlta } from '../../../lib/fiscal/transmision/alta';
import { estadoPaOrg } from '../../../lib/fiscal/transmision/estado';

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    return json(await estadoPaOrg(orgId));
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const en = currentLocale() === 'en';
    const rl = await rateLimit(`fr-pa:${orgId}`, 10, 300);
    if (!rl.ok) return tooMany(rl.retryAfter ?? 60);

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: en ? 'Invalid request.' : 'Petición inválida.' }, 400); }

    if (body.accion === 'actualizar') {
        try {
            await refrescarAlta(orgId);
        } catch (error) {
            log.warn('fr-pa: no se pudo consultar el alta', { route: 'api/fiscal/plataforma', orgId, err: error });
            return json({ error: en ? 'The platform is not available right now. Try again later.' : 'La plataforma no está disponible en este momento. Intenta de nuevo más tarde.' }, 503);
        }
        return json({ ok: true, ...(await estadoPaOrg(orgId)) });
    }

    if (body.accion !== 'alta') return json({ error: en ? 'Unknown action.' : 'Acción desconocida.' }, 400);
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const representante = representanteDe(body);
    if (representante === 'incompleto') {
        return json({ error: en ? 'Fill in the legal representative’s first name, last name and position, or leave all three empty.' : 'Completa nombre, apellido y cargo del representante legal, o deja los tres vacíos.' }, 400);
    }
    let r;
    try {
        r = await solicitarAlta(orgId, representante);
    } catch (error) {
        log.error('fr-pa: el alta falló', { route: 'api/fiscal/plataforma', orgId, err: error });
        return json({ error: en ? 'The registration could not be requested. Try again later.' : 'No se pudo pedir el alta. Intenta de nuevo más tarde.' }, 500);
    }
    if (!r.ok) return json({ error: en ? r.en : r.es, code: r.code }, r.status);
    await logAudit(orgId, {
        accion: 'fr_pa.alta_solicitada', entidad: 'org', entidad_id: orgId,
        detalle: `Alta en la plataforma de facturación electrónica: ${r.estado}`,
        ip: reqIp(request),
    });
    return json({ ok: true, estado: r.estado, enlace: r.enlace });
};
