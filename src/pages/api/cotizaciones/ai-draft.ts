// POST /api/cotizaciones/ai-draft — arma una cotización desde texto libre y/o un
// documento (PDF/foto de una orden de compra, requisición, cotización de un
// tercero, etc.) con IA. Recibe { text?, file?: { mediaType, data, name } } — al
// menos uno de los dos. `file.data` es el contenido en base64 (sin el prefijo
// data:...;base64,). Le da a Claude el catálogo de la org + el documento/imagen
// (visión nativa de Claude, sin OCR aparte) y devuelve las líneas ya emparejadas
// en el shape que usa el editor: { items: [{ id, nombre, unidad, lista, negociado, cantidad }] }.
//
// Usa el SDK oficial @anthropic-ai/sdk con tool_choice forzado (salida estructurada).
// Necesita ANTHROPIC_API_KEY en el entorno. Modelo configurable con AI_MODEL
// (default claude-haiku-4-5-20251001). El emparejamiento se valida en el servidor: la IA
// sugiere producto_id, pero el precio de lista y los datos salen del catálogo real.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { tooMany } from '../../../lib/ratelimit';
import { armarLineasConIa, IA_DISPONIBLE } from '../../../lib/ai-quote-draft';

// Tipos soportados por la visión nativa de Claude (documentos e imágenes).
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_TYPES = new Set(['application/pdf']);
// Tope defensivo del lado del servidor (el cliente ya recomprime/limita antes de
// subir) — un base64 de ~6M chars ≈ 4.5MB decodificados, el límite práctico del
// body de una función de Vercel.
const MAX_B64_CHARS = 6_000_000;

export const POST: APIRoute = async ({ request }) => {
    if (!IA_DISPONIBLE) {
        return json({ error: 'Armar cotizaciones con IA todavía no está disponible en tu cuenta. Escríbenos a soporte@flouvia.com y lo activamos.' }, 503);
    }
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const text = String(body.text ?? '').trim();
    const file = body.file && typeof body.file === 'object' ? body.file : null;

    if (!text && !file) return json({ error: 'Pega el pedido del cliente o adjunta una foto/PDF' }, 400);
    if (text.length > 2000) return json({ error: 'El texto es demasiado largo (máx 2000 caracteres)' }, 400);

    let fileBlock: any = null;
    if (file) {
        const mediaType = String(file.mediaType || '');
        const data = String(file.data || '');
        if (!data || data.length > MAX_B64_CHARS) {
            return json({ error: 'El archivo es demasiado pesado. Intenta con una foto más ligera o un PDF más corto.' }, 400);
        }
        if (IMAGE_TYPES.has(mediaType)) {
            fileBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
        } else if (DOC_TYPES.has(mediaType)) {
            fileBlock = { type: 'document', source: { type: 'base64', media_type: mediaType, data } };
        } else {
            return json({ error: 'Formato no soportado. Sube una foto (JPG/PNG/WEBP) o un PDF.' }, 400);
        }
    }

    const r = await armarLineasConIa(await getActiveOrgId(), { text, fileBlock, origen: 'cotizaciones/ai-draft' });
    if (!r.ok) return r.retryAfter ? tooMany(r.retryAfter) : json({ error: r.error }, r.status);
    return json({ items: r.items });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
