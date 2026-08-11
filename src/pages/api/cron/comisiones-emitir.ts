export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { assertCronAuth } from '../../../lib/cron-auth';
import { reqContext } from '../../../lib/context';
import { emitPlatformInvoice } from '../../../lib/fiscal/emit';
import { parseJsonBody } from '../../../lib/validation';

const schema = z.object({
    batchId: z.string().uuid(),
    confirmation: z.literal('TIMBRAR'),
}).strict();

// No está registrado en vercel.json. Ops lo invoca manualmente después de
// revisar receptor, base, IVA y total del borrador mensual.
export const POST: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;
    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        const result = await emitPlatformInvoice(parsed.data.batchId);
        return json(result, result.emitted ? 200 : 409);
    });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
