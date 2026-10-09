// /api/fiscal/sii-intercambio — DTE recibidos de proveedores (Chile): intercambio entre contribuyentes.
//   GET                              → casilla de intercambio (si hay correo entrante) y lo recibido
//   GET    ?respuesta=<uuid>          → XML de una respuesta firmada (descarga)
//   POST   multipart { archivo:File, correo? }
//                                    → recibe un envío de DTE subido a mano y responde el acuse de recibo
//   POST   JSON { accion: 'decidir', recepcion_id, documentos: [{ id, resultado, motivo?, recinto?, reclamo? }],
//                 correo?, registrar_sii? }
//                                    → aceptación o rechazo comercial, recibos (Ley 19.983) y registro en el SII
//          JSON { accion: 'reintentar_registro', dte_id }   → reintenta el registro en el SII
//          JSON { accion: 'reenviar', respuesta_id, correo } → reenvía una respuesta ya firmada
//
// Lo mismo que entra por el correo de la casilla (/api/webhooks/sii-intercambio)
// entra aquí subido a mano: un solo camino (latam/sii/recepcion.ts). Las
// respuestas se firman con el certificado del negocio y nunca vuelve al
// navegador nada más que su resumen o el XML ya firmado.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId, logAudit, reqIp } from '../../../lib/db';
import { requirePerm } from '../../../lib/queries';
import { requireFreshAuth } from '../../../lib/step-up';
import { requireEntitlement } from '../../../lib/org-entitlements';
import { log } from '../../../lib/log';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import {
    casillaIntercambio, decidirDocumentos, listarRecepciones, recibirEnvio, reenviarRespuesta, reintentarRegistro, xmlRespuesta,
    type Decision,
} from '../../../lib/fiscal/latam/sii/recepcion';
import { TAMANO_MAXIMO_ENVIO } from '../../../lib/fiscal/latam/sii/respuesta-intercambio';
import { motivoSinSii } from '../../../lib/fiscal/latam/sii/vista';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export const GET: APIRoute = async ({ url }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    const orgId = await getActiveOrgId();
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);
    const respuesta = url.searchParams.get('respuesta');
    if (respuesta) {
        if (!UUID_RE.test(respuesta)) return json({ error: 'Respuesta no encontrada' }, 404);
        const x = await xmlRespuesta(orgId, respuesta);
        if (!x) return json({ error: 'Respuesta no encontrada' }, 404);
        return new Response(new Uint8Array(x.bytes), {
            headers: { 'Content-Type': 'application/xml; charset=ISO-8859-1', 'Content-Disposition': `attachment; filename="${x.nombre}"`, 'Cache-Control': 'no-store' },
        });
    }
    const [casilla, recepciones] = await Promise.all([casillaIntercambio(orgId), listarRecepciones(orgId)]);
    return json({ casilla, recepciones });
};

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes'); if (denied) return denied;
    // Toda acción firma con el certificado del negocio o habla con el SII.
    const staleAuth = await requireFreshAuth(); if (staleAuth) return staleAuth;
    const orgId = await getActiveOrgId();
    const subscriptionDenied = await requireEntitlement(orgId, 'cfdi'); if (subscriptionDenied) return subscriptionDenied;
    const sinSii = await motivoSinSii(orgId); if (sinSii) return json({ error: sinSii }, 409);

    try {
        if (!(request.headers.get('content-type') || '').includes('application/json')) {
            let form: FormData;
            try { form = await request.formData(); } catch { return json({ error: 'Sube el archivo XML que recibiste.' }, 400); }
            const archivo = form.get('archivo');
            if (!(archivo instanceof File) || !archivo.size) return json({ error: 'Sube el archivo XML que recibiste.' }, 400);
            if (archivo.size > TAMANO_MAXIMO_ENVIO) return json({ error: 'El archivo es demasiado grande para ser un envío de DTE.' }, 413);
            const r = await recibirEnvio(orgId, {
                bytes: new Uint8Array(await archivo.arrayBuffer()), nombreArchivo: archivo.name, origen: 'manual',
                destino: String(form.get('correo') ?? '').trim() || null,
            });
            await logAudit(orgId, {
                accion: 'sii_intercambio.recibido', entidad: 'org', entidad_id: orgId,
                detalle: `Envío de DTE recibido (${archivo.name}): estado ${r.estado}, ${r.documentos} documentos${r.repetido ? ', repetido' : ''}`,
                ip: reqIp(request),
            });
            return json({ ok: true, ...r, recepciones: await listarRecepciones(orgId) });
        }

        let body: Record<string, any>;
        try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
        const accion = String(body.accion ?? '');
        if (accion === 'decidir') {
            const recepcionId = String(body.recepcion_id ?? '');
            if (!UUID_RE.test(recepcionId)) return json({ error: 'Envío no encontrado' }, 404);
            const decisiones: Decision[] = (Array.isArray(body.documentos) ? body.documentos : []).slice(0, 200)
                .filter((d: any) => UUID_RE.test(String(d?.id ?? '')))
                .map((d: any) => ({
                    dteId: String(d.id),
                    resultado: d.resultado,
                    motivo: d.motivo ? String(d.motivo) : null,
                    recinto: d.recinto ? String(d.recinto) : null,
                    ...(['RCD', 'RFP', 'RFT'].includes(d.reclamo) ? { reclamo: d.reclamo } : {}),
                }));
            const r = await decidirDocumentos(orgId, recepcionId, decisiones, {
                destino: String(body.correo ?? '').trim() || null,
                registrarEnSii: body.registrar_sii !== false,
            });
            await logAudit(orgId, {
                accion: 'sii_intercambio.decidido', entidad: 'org', entidad_id: orgId,
                detalle: `Respuesta comercial a ${r.decididos} DTE recibidos${r.registroSii.length ? `; registro en el SII: ${r.registroSii.map((x) => `${x.accion} ${x.registrado ? 'ok' : 'pendiente'}`).join(', ')}` : ''}`,
                ip: reqIp(request),
            });
            return json({ ok: true, ...r, recepciones: await listarRecepciones(orgId) });
        }
        if (accion === 'reintentar_registro') {
            const dteId = String(body.dte_id ?? '');
            if (!UUID_RE.test(dteId)) return json({ error: 'Documento no encontrado' }, 404);
            const r = await reintentarRegistro(orgId, dteId);
            return json({ ok: true, ...r, recepciones: await listarRecepciones(orgId) });
        }
        if (accion === 'reenviar') {
            const respuestaId = String(body.respuesta_id ?? '');
            if (!UUID_RE.test(respuestaId)) return json({ error: 'Respuesta no encontrada' }, 404);
            const enviada = await reenviarRespuesta(orgId, respuestaId, String(body.correo ?? ''));
            return json({ ok: true, enviada, recepciones: await listarRecepciones(orgId) });
        }
        return json({ error: 'Acción desconocida.' }, 400);
    } catch (error) {
        if (esErrorSeguro(error)) return json({ error: error.message }, 422);
        log.error('sii: falló una acción de intercambio', { route: 'api/fiscal/sii-intercambio', orgId, err: error });
        return json({ error: 'No pudimos completar la operación en este momento. Reintenta en unos minutos.' }, 502);
    }
};
