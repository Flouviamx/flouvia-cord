// /api/integraciones/contabilidad/cuentas — la cuenta de banco de Xero donde entran los pagos.
//   GET → { cuentas: [{ id, nombre }], actual }   POST { cuenta } → { ok }
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../../lib/db';
import { requirePerm } from '../../../../lib/queries';
import { currentLocale } from '../../../../lib/context';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { log } from '../../../../lib/log';
import { cuentaDePagosXero, cuentasBancoXero, guardarCuentaPagosXero } from '../../../../lib/integraciones/contabilidad/pagos';
import { t } from '../../../../i18n/app';

export const GET: APIRoute = async () => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    try {
        return json({ cuentas: await cuentasBancoXero(orgId), actual: await cuentaDePagosXero(orgId) });
    } catch (err) {
        log.error('no se pudieron leer las cuentas de Xero', { route: 'conta-cuentas', orgId, err });
        return json({ error: t(currentLocale(), 'conta.err.envio') }, 502);
    }
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const limitado = strictLimitResponse(await strictRateLimit(`conta-cuentas:${orgId}`, 20, 60));
    if (limitado) return limitado;
    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    if (!(await guardarCuentaPagosXero(orgId, String(body?.cuenta ?? '')))) return json({ error: t(currentLocale(), 'conta.err.envio') }, 400);
    await logAudit(orgId, { accion: 'integracion.xero_cuenta_pagos', entidad: 'org', entidad_id: orgId, detalle: 'Eligió la cuenta de banco de los pagos de Xero', ip: reqIp(request) });
    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
