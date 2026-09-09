// DELETE /api/account { confirmEmail, password?, code? } — borra la cuenta
// PERSONAL del usuario (distinto de DELETE /api/org, que borra el
// NEGOCIO/org activa). Exige re-autenticación (contraseña o código TOTP/
// respaldo) y type-to-confirm del correo exacto de la cuenta.
//
// Antes esto era un alert() pidiendo escribir a soporte@flouvia.com — ver
// docs/historial/auth-clerk.md. El flujo real:
//   1) Si el usuario es dueño ÚNICO de alguna org con OTROS miembros
//      activos, se rechaza — transferir/eliminar esas orgs es decisión
//      suya, no algo para auto-resolver en silencio.
//   2) Las orgs donde es dueño y NO hay nadie más se borran junto con la
//      cuenta (mismo camino que DELETE /api/org, vía deleteOrgCascade()).
//   3) En las orgs que SOBREVIVEN (donde es miembro pero no dueño), se
//      tombstonean las referencias de texto SIN FK que dejaría colgadas
//      (creado_por/actor/created_by/invited_by) — sin FK no cascadean solas.
//   4) Se borra la fila de `users`, que sí cascadea sessions/oauth_accounts/
//      passkeys/tokens/org_members.
export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sql, withUserTx } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';
import { reauthenticate, clearSessionCookies } from '../../../lib/auth';
import { emailSchema, parseJsonBody } from '../../../lib/validation';
import { rateLimit, tooMany } from '../../../lib/ratelimit';
import { deleteOrgCascade } from '../../../lib/org-delete';

const schema = z.object({
    confirmEmail: emailSchema,
    password: z.string().max(256).optional(),
    code: z.string().trim().max(64).optional(),
});

const TOMBSTONE = 'deleted-user';

export const DELETE: APIRoute = async ({ request, cookies }) => {
    const userId = currentUserId();
    if (!userId) return json({ error: 'No autenticado' }, 401);

    const rl = await rateLimit(`account-delete:${userId}`, 5, 300);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const parsed = await parseJsonBody(request, schema);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

    const [user] = await sql`select email from users where id = ${userId} limit 1`;
    if (!user) return json({ error: 'No encontrado' }, 404);

    const confirmed = await reauthenticate(userId, { password: parsed.data.password, code: parsed.data.code });
    if (!confirmed) return json({ error: 'confirmation_required' }, 401);

    if (parsed.data.confirmEmail !== (user.email as string).toLowerCase()) {
        return json({ error: 'email_mismatch' }, 400);
    }

    // Las organizaciones que este usuario posee se resuelven con
    // `cord_account_owned_orgs`, una función SQL acotada (security definer).
    //
    // No es un rodeo: este flujo necesita ver a los OTROS miembros para decidir
    // si una organización queda huérfana, y ninguna política RLS se lo permite
    // —bajo el carril de usuario solo se ven las filas propias—. Con una consulta
    // normal, el `exists(... user_id <> yo)` daría siempre falso: TODA
    // organización se clasificaría como de dueño único y se borraría junto con
    // la cuenta. La función define propiedad y orfandad en un solo lugar para
    // que las dos ramas de abajo no puedan divergir.
    const [owned] = await withUserTx(userId, sql`
        select id, nombre, stripe_subscription_id, stripe_account_id, tiene_otros_miembros
          from cord_account_owned_orgs(${userId}::uuid)`);

    // 1) Dueño Y quedan otros miembros activos → bloquea la baja completa.
    const blocking = owned.filter((o) => o.tiene_otros_miembros === true);
    if (blocking.length) {
        return json({ error: 'blocking_orgs', orgs: blocking.map((o) => ({ id: o.id, nombre: o.nombre })) }, 409);
    }

    // 2) Dueño ÚNICO (nadie más activo) — se borran con la cuenta.
    const soleOwned = owned.filter((o) => o.tiene_otros_miembros !== true);
    for (const org of soleOwned) {
        await deleteOrgCascade({
            id: org.id as string,
            nombre: org.nombre as string,
            stripe_subscription_id: org.stripe_subscription_id as string | null,
            stripe_account_id: org.stripe_account_id as string | null,
        });
    }

    // 3) Scrub de referencias de texto SIN FK en las orgs que sobreviven. También
    // cross-org (un vendedor pudo cotizar en varias), así que va por la misma
    // función acotada: con una consulta normal afectaría cero filas y el id de
    // la cuenta borrada seguiría dentro de los registros.
    await withUserTx(userId, sql`select cord_account_scrub(${userId}::uuid, ${TOMBSTONE})`);

    // 4) Borra la cuenta (cascadea sessions/oauth_accounts/passkeys/tokens/
    // org_members restantes).
    await sql`delete from users where id = ${userId}`;

    clearSessionCookies(cookies);

    return json({ ok: true, redirect: '/' });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
