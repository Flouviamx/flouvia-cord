// /api/v1/events — historial de eventos del negocio, del más nuevo al más viejo.
//   GET ?type=&object_id=&limit=&cursor=   → { data: [...], meta: { next_cursor } }   (scope: read)
export const prerender = false;

import { withApiAuth } from '../../../lib/apikey';
import { fail, ok } from '../../../lib/apiv1';
import { EventsQueryError, listDomainEvents } from '../../../lib/domain-events-read';

export const GET = withApiAuth('read', async ({ url }, auth) => {
    try {
        const page = await listDomainEvents(auth.orgId, {
            type: url.searchParams.get('type') || null,
            objectId: url.searchParams.get('object_id') || null,
            cursor: url.searchParams.get('cursor') || null,
            limit: Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50)),
        });
        return ok(page.items, { next_cursor: page.nextCursor });
    } catch (error) {
        if (error instanceof EventsQueryError) return fail(error.message, 'invalid_request', 400);
        throw error;
    }
});
