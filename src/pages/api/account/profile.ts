// PATCH /api/account/profile { firstName?, lastName?, avatarUrl? } — datos de
// perfil del usuario (no del negocio — eso es /api/org). Bajo /api/account/
// (NO /api/auth/, que es público) para heredar el gate de sesión del
// middleware automáticamente.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { parseJsonBody } from '../../../lib/validation';

// El avatar viaja como data URL (mismo patrón que el logo de marca en
// Ajustes › Branding — FileReader client-side, sin endpoint de upload
// aparte). Tope generoso pero acotado para no inflar la fila de `users`.
const profileSchema = z.object({
    firstName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    avatarUrl: z.string().max(2_000_000).startsWith('data:image/').optional().or(z.literal('')),
});

export const PATCH: APIRoute = async ({ request }) => {
    const userId = currentUserId();
    if (!userId) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });

    const parsed = await parseJsonBody(request, profileSchema, 2_100_000);
    if (!parsed.ok) return new Response(JSON.stringify({ error: parsed.error }), { status: parsed.status });
    const { firstName, lastName, avatarUrl } = parsed.data;

    if (firstName === undefined && lastName === undefined && avatarUrl === undefined) {
        return new Response(JSON.stringify({ error: 'Nada que actualizar' }), { status: 400 });
    }

    if (firstName !== undefined) await sql`update users set first_name = ${firstName || null} where id = ${userId}`;
    if (lastName !== undefined) await sql`update users set last_name = ${lastName || null} where id = ${userId}`;
    if (avatarUrl !== undefined) await sql`update users set avatar_url = ${avatarUrl || null} where id = ${userId}`;
    await sql`update users set updated_at = now() where id = ${userId}`;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
