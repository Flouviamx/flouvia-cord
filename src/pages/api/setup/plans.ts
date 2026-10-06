// POST /api/setup/plans — genera una propuesta de configuración desde la app o
// el onboarding (multipart: sitio, descripcion, archivo). Solo propone: aplicar
// es POST /api/setup/plans/[id] con action 'apply'.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActiveOrgId } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { requirePerm } from '../../../lib/queries';
import { proposeSetup } from '../../../lib/setup/propose';
import { readPriceFile, MAX_PRICE_FILE } from '../../../lib/setup/sources';

export const POST: APIRoute = async ({ request }) => {
    const denied = await requirePerm('ajustes');
    if (denied) return denied;
    if (Number(request.headers.get('content-length') || 0) > MAX_PRICE_FILE + 64_000) {
        return json({ error: 'El archivo pesa más de 4 MB.' }, 413);
    }
    let form: FormData;
    try { form = await request.formData(); } catch { return json({ error: 'Formulario inválido' }, 400); }

    const origen = form.get('origen') === 'onboarding' ? 'onboarding' : 'app';
    const sitio = String(form.get('sitio') ?? '').trim();
    const descripcion = String(form.get('descripcion') ?? '').trim();
    const upload = form.get('archivo');
    let archivo = null;
    if (upload instanceof File && upload.size > 0) {
        const r = await readPriceFile(upload);
        if (!r.ok) return json({ error: r.error }, 400);
        archivo = r.file;
    }

    const orgId = await getActiveOrgId();
    const result = await proposeSetup({ orgId, origen, creadoPor: currentUserId() ?? 'app', sitio: sitio || undefined, descripcion, archivo });
    if (!result.ok) return json({ error: result.error, id: result.id }, result.status);
    return json({ id: result.id, propuesta: { ...result.propuesta, avisos: result.avisos, moneda: result.moneda, formato: result.formato }, descartado: result.descartado });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
