// POST /api/v1/setup/plans — el CLI (`cord setup`) y los agentes proponen una
// configuración. Nunca la aplican: la respuesta trae review_url, donde una
// persona con sesión la revisa y la aprueba. Con una llave de prueba la propuesta
// va a la cuenta real a la que pertenece la llave: es esa la que se configura.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { sql, withOrgTx } from '../../../../lib/db';
import { proposeSetup } from '../../../../lib/setup/propose';
import { proposalCounts } from '../../../../lib/setup/plan';
import type { PriceFile } from '../../../../lib/setup/sources';
import { readPriceFile } from '../../../../lib/setup/sources';

/** El cuerpo de una función en Vercel no pasa de 4.5 MB: un archivo en base64 crece un tercio. */
const MAX_FILE_BYTES = 3 * 1024 * 1024;

export const POST = withApiAuth('write', async ({ request }, auth) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido', code: 'invalid_json' }, 400); }
    const [[org]] = await withOrgTx(auth.orgId, sql`select sandbox_of from orgs where id = ${auth.orgId}`);
    const orgId = String(org?.sandbox_of || auth.orgId);

    let archivo: PriceFile | null = null;
    if (body?.archivo?.base64) {
        const bytes = Buffer.from(String(body.archivo.base64), 'base64');
        if (bytes.length > MAX_FILE_BYTES) return json({ error: 'El archivo pesa más de 3 MB.', code: 'invalid_request' }, 413);
        const r = await readPriceFile(new File([bytes], String(body.archivo.nombre || 'lista').slice(0, 120)));
        if (!r.ok) return json({ error: r.error, code: 'invalid_request' }, 400);
        archivo = r.file;
    }
    const result = await proposeSetup({
        orgId,
        origen: body?.origen === 'mcp' ? 'mcp' : 'cli',
        creadoPor: `api:${auth.keyId}`,
        sitio: typeof body?.sitio === 'string' && body.sitio.trim() ? body.sitio.trim() : undefined,
        descripcion: typeof body?.descripcion === 'string' ? body.descripcion : '',
        archivo,
    });
    if (!result.ok) return json({ error: result.error, code: result.status === 429 ? 'rate_limited' : 'invalid_request' }, result.status);
    return json({
        data: {
            object: 'setup_plan', id: result.id, estado: 'propuesto',
            review_url: new URL(`/app/setup/${result.id}`, request.url).href,
            resumen: result.propuesta.resumen,
            conteos: proposalCounts(result.propuesta),
            avisos: result.avisos,
            descartado: result.descartado,
        },
    }, 201);
});

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
