// POST /api/v1/cotizaciones/ia { texto } → { data: { items, moneda } }   (scope: write)
// Propone las líneas de una cotización a partir del texto de un pedido (el correo
// del cliente, en el complemento de Gmail). No crea nada: devuelve la propuesta
// para que el vendedor la confirme. Gasta una unidad de IA del plan.
export const prerender = false;

import { withApiAuth } from '../../../../lib/apikey';
import { sql, withOrgTx } from '../../../../lib/db';
import { fail, ok, readJsonBody } from '../../../../lib/apiv1';
import { armarLineasConIa } from '../../../../lib/ai-quote-draft';
import { normalizeCurrency } from '../../../../lib/currency';

const MAX_TEXTO = 6000;

export const POST = withApiAuth('write', async ({ request }, auth) => {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const texto = String((body as any)?.texto ?? '').trim();
    if (!texto) return fail('Falta el texto del pedido.', 'missing_text', 400);
    if (texto.length > MAX_TEXTO) return fail(`El texto es demasiado largo (máx ${MAX_TEXTO} caracteres).`, 'text_too_long', 400);

    const r = await armarLineasConIa(auth.orgId, { text: texto, origen: 'api/v1/cotizaciones/ia' });
    if (!r.ok) return fail(r.error, r.retryAfter ? 'rate_limited' : r.status === 429 ? 'ai_quota_exceeded' : r.status === 422 ? 'no_items' : 'ai_unavailable', r.status);

    const [[org]] = await withOrgTx(auth.orgId, sql`select moneda from orgs where id = ${auth.orgId}`);
    return ok({ items: r.items, moneda: normalizeCurrency(org?.moneda as string) });
});
