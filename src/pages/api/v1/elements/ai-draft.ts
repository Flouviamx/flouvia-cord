// POST /api/v1/elements/ai-draft (multipart: texto?, archivo?) → text/event-stream
// Propone las líneas de una cotización a partir de un pedido escrito, una foto o
// un PDF, y las emite una por una mientras la IA las lee. No crea nada.
// Eventos: item {index, id, nombre, unidad, lista, negociado, cantidad} · done {count} · error {code, error}.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { fail } from '../../../../lib/apiv1';
import { reqIp } from '../../../../lib/db';
import { strictRateLimit, strictLimitResponse } from '../../../../lib/ratelimit';
import { guardUpload } from '../../../../lib/upload-guard';
import { streamLineasConIa, type AiStreamEvent } from '../../../../lib/ai-quote-stream';

const MAX_TEXT = 4000;
const MAX_FILE = 4 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 64 * 1024;
const encoder = new TextEncoder();

export const POST = withApiAuth('write', async ({ request }, auth) => {
    // Cada borrador cuesta una llamada al modelo: el límite es estricto, falla
    // cerrado y tiene componente de IP, además del cupo mensual de IA del plan.
    const ip = reqIp(request);
    for (const [key, limit, windowSec] of [
        [`ai-draft:ip:${ip}`, 6, 60],
        [`ai-draft:org:${auth.orgId}`, 60, 60],
        [`ai-draft:org-day:${auth.orgId}`, 500, 86400],
    ] as const) {
        const limited = strictLimitResponse(await strictRateLimit(key, limit, windowSec));
        if (limited) return limited;
    }

    const type = (request.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('multipart/form-data')) return fail('Envía el pedido como multipart/form-data.', 'unsupported_media_type', 415);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return fail('El archivo es demasiado pesado (máx 4 MB).', 'payload_too_large', 413);

    let form: FormData;
    try { form = await request.formData(); } catch { return fail('No se pudo leer el formulario.', 'invalid_request', 400); }
    const texto = String(form.get('texto') ?? '').trim();
    const archivo = form.get('archivo');
    if (texto.length > MAX_TEXT) return fail(`El texto es demasiado largo (máx ${MAX_TEXT} caracteres).`, 'text_too_long', 400);

    let file: { mime: 'image/jpeg' | 'image/png' | 'application/pdf'; bytes: Buffer } | null = null;
    if (archivo instanceof File && archivo.size > 0) {
        try {
            const guarded = await guardUpload(archivo, { maxBytes: MAX_FILE, prefix: 'pedido' });
            file = { mime: guarded.mime, bytes: guarded.bytes };
        } catch (e) {
            return fail((e as Error).message || 'Archivo no permitido.', 'invalid_file', 400);
        }
    }
    if (!texto && !file) return fail('Escribe el pedido o adjunta una foto o PDF.', 'missing_text', 400);

    const body = new ReadableStream({
        async start(controller) {
            const send = (e: AiStreamEvent) => {
                try { controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)); } catch { /* cliente desconectado */ }
            };
            try {
                await streamLineasConIa(auth.orgId, { text: texto, file }, send, request.signal);
            } finally {
                try { controller.close(); } catch { /* ya cerrado */ }
            }
        },
    });
    return new Response(body, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store, no-transform',
            'X-Accel-Buffering': 'no',
        },
    });
});
