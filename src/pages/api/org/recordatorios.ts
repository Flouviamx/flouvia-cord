// /api/org/recordatorios — recordatorios automáticos de la organización activa.
//   PATCH { activos?: boolean, etapas?: number[] | "−7,−1,3" }  → { ok, activos, etapas }
//         Permiso `ajustes`. Las etapas se validan contra el vocabulario cerrado
//         de src/lib/recordatorios.ts: lo que la pantalla no ofrece, la API no
//         lo acepta (regla 28).
//   POST  { cliente_id, pausado: boolean }  → { ok, pausado }
//         Permiso `cobranza`, el mismo de la lista "No escribir a": la pausa por
//         cliente ES esa lista (cobranza_exclusiones), no una segunda.
// Disponible en todos los planes: los recordatorios lo están.
// Quien lo lee: src/pages/api/cron/recordatorios.ts.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { currentLocale, currentUserId } from '../../../lib/context';
import { t } from '../../../i18n/app';
import { MAX_ETAPAS, validarEtapas, type ErrorEtapas } from '../../../lib/recordatorios';
import { guardarAjustesRecordatorios, leerAjustesRecordatorios, pausarCliente } from '../../../lib/recordatorios-db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_KEY: Record<ErrorEtapas, 'set.rec.err_formato' | 'set.rec.err_fuera' | 'set.rec.err_vacio' | 'set.rec.err_demasiadas'> = {
    formato: 'set.rec.err_formato',
    fuera_de_menu: 'set.rec.err_fuera',
    vacio: 'set.rec.err_vacio',
    demasiadas: 'set.rec.err_demasiadas',
};

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
    try {
        const body = await request.json();
        return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

export const PATCH: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    const L = currentLocale();
    const body = await leerCuerpo(request);
    if (!body) return json({ error: t(L, 'set.rec.err_formato') }, 400);

    const orgId = await getActiveOrgId();
    const cambios: { activos?: boolean; etapas?: number[] } = {};
    if (body.activos !== undefined) {
        if (typeof body.activos !== 'boolean') return json({ error: t(L, 'set.rec.err_formato'), field: 'activos' }, 400);
        cambios.activos = body.activos;
    }
    if (body.etapas !== undefined) {
        const v = validarEtapas(body.etapas, (await leerAjustesRecordatorios(orgId)).etapas);
        if (!v.ok) return json({ error: t(L, ERROR_KEY[v.error]).replace('{max}', String(MAX_ETAPAS)), field: 'etapas', code: v.error }, 400);
        cambios.etapas = v.etapas;
    }
    if (cambios.activos === undefined && cambios.etapas === undefined) return json({ error: t(L, 'set.rec.err_formato') }, 400);

    await guardarAjustesRecordatorios(orgId, cambios);
    await logAudit(orgId, {
        accion: 'org.recordatorios', entidad: 'org', entidad_id: orgId, ip: reqIp(request),
        detalle: [
            cambios.activos !== undefined ? `activos: ${cambios.activos ? 'sí' : 'no'}` : '',
            cambios.etapas ? `etapas: ${cambios.etapas.join(',')}` : '',
        ].filter(Boolean).join(' · '),
    });
    return json({ ok: true, ...cambios });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('cobranza');
    if (denied) return denied;
    const L = currentLocale();
    const body = await leerCuerpo(request);
    const clienteId = String(body?.cliente_id ?? '');
    if (!body || !UUID.test(clienteId) || typeof body.pausado !== 'boolean') return json({ error: t(L, 'cdet.rec_error') }, 400);

    const orgId = await getActiveOrgId();
    const ok = await pausarCliente(orgId, clienteId, body.pausado, currentUserId());
    if (!ok) return json({ error: t(L, 'cdet.rec_error') }, 404);
    await logAudit(orgId, {
        accion: body.pausado ? 'recordatorios.cliente_pausado' : 'recordatorios.cliente_reanudado',
        entidad: 'cliente', entidad_id: clienteId, ip: reqIp(request),
    });
    return json({ ok: true, pausado: body.pausado });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
