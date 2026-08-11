export const prerender = false;

import type { APIRoute } from 'astro';
import { assertCronAuth } from '../../../lib/cron-auth';
import { sql, withSystemTx } from '../../../lib/db';
import { reqContext } from '../../../lib/context';

export const GET: APIRoute = async ({ request }) => {
    const authError = assertCronAuth(request);
    if (authError) return authError;

    return reqContext.run({ userId: null, cronScope: true }, async () => {
        const [deleted] = await withSystemTx(sql`
            delete from identity_capture_sessions
            where expires_at < now()
               or (completed_at is not null and completed_at < now() - interval '1 day')
            returning id`);
        return new Response(JSON.stringify({ deleted: deleted.length }), {
            headers: { 'Content-Type': 'application/json' },
        });
    });
};
