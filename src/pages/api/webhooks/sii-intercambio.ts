// /api/webhooks/sii-intercambio — correo entrante de la casilla de intercambio
// de DTE de un negocio chileno (`dte-<token>@<SII_INTERCAMBIO_DOMINIO>`).
//
//   POST JSON { to, from, subject?, attachments: [{ filename, content (base64), content_type? }] }
//
// Reutiliza el correo entrante de Cord: el mismo secreto (INBOUND_EMAIL_SECRET
// como Bearer, y la firma HMAC del cuerpo si el proveedor la manda) y la misma
// forma de cuerpo normalizado que /api/webhooks/inbound-email. Falla cerrado
// sin el secreto o sin el dominio de intercambio configurado.
//
// El proveedor de correo no sabe de qué organización es el mensaje: la casilla
// del destinatario la resuelve una función `security definer` acotada
// (cord_sii_buzon_org) y TODO el trabajo vuelve a withOrgTx con ese id
// (regla 30). Cada adjunto XML se procesa como un envío de DTE recibido
// (latam/sii/recepcion.ts); un archivo repetido no se responde dos veces, así
// que un reintento del proveedor es inofensivo.
export const prerender = false;

import type { APIRoute } from 'astro';
import { entranteAutorizado } from '../../../lib/inbound-auth';
import { log } from '../../../lib/log';
import { esErrorSeguro } from '../../../lib/fiscal/latam/errores';
import { dominioIntercambio, orgDeCasilla, recibirEnvio } from '../../../lib/fiscal/latam/sii/recepcion';
import { TAMANO_MAXIMO_ENVIO } from '../../../lib/fiscal/latam/sii/respuesta-intercambio';

const MAX_CUERPO = 12 * 1024 * 1024;
const MAX_ADJUNTOS = 10;

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/** Direcciones de un campo "to" (string, lista o "Nombre <dir>"). */
function direcciones(to: unknown): string[] {
    const lista = Array.isArray(to) ? to : String(to ?? '').split(',');
    return lista.map((v) => {
        const s = typeof v === 'object' && v ? String((v as { email?: string; address?: string }).email ?? (v as { address?: string }).address ?? '') : String(v);
        return (/<([^>]+)>/.exec(s)?.[1] ?? s).trim().toLowerCase();
    }).filter(Boolean);
}

export const POST: APIRoute = async ({ request }) => {
    if (!dominioIntercambio()) return json({ error: 'No disponible' }, 404);
    const largo = Number(request.headers.get('content-length') || 0);
    if (largo > MAX_CUERPO) return json({ error: 'Mensaje demasiado grande' }, 413);
    const raw = await request.text();
    if (raw.length > MAX_CUERPO) return json({ error: 'Mensaje demasiado grande' }, 413);
    if (!entranteAutorizado(request, raw)) return json({ error: 'No autorizado' }, 401);

    let payload: Record<string, unknown>;
    try { payload = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

    let orgId: string | null = null;
    for (const d of direcciones(payload.to)) {
        orgId = await orgDeCasilla(d);
        if (orgId) break;
    }
    if (!orgId) return json({ error: 'Casilla no encontrada' }, 404);

    const remitente = (/<([^>]+)>/.exec(String(payload.from ?? ''))?.[1] ?? String(payload.from ?? '')).trim();
    const adjuntos = (Array.isArray(payload.attachments) ? payload.attachments : []).slice(0, MAX_ADJUNTOS) as Record<string, unknown>[];
    const xmls = adjuntos.filter((a) => /\.xml$/i.test(String(a.filename ?? '')) || /xml/i.test(String(a.content_type ?? a.contentType ?? '')));
    const resultados = [];
    for (const a of xmls) {
        const bytes = Buffer.from(String(a.content ?? ''), 'base64');
        if (!bytes.length || bytes.length > TAMANO_MAXIMO_ENVIO) continue;
        try {
            const r = await recibirEnvio(orgId, { bytes, nombreArchivo: String(a.filename ?? 'envio.xml'), origen: 'correo', remitente });
            resultados.push({ estado: r.estado, documentos: r.documentos, repetido: r.repetido, respondido: r.respondido });
        } catch (error) {
            if (esErrorSeguro(error)) { resultados.push({ error: error.message }); continue; }
            log.error('sii: no se pudo procesar un correo de intercambio', { route: 'api/webhooks/sii-intercambio', orgId, err: error });
            return json({ error: 'No se pudo procesar el mensaje' }, 500);
        }
    }
    return json({ ok: true, recibidos: resultados.length, resultados });
};
