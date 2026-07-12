// POST /api/orgs/provision
// Provisiona una organización recién creada en Clerk: fija su país (para moneda /
// facturación) y, si es una sub-cuenta, la anida bajo su org padre. Se llama SIEMPRE
// tras `clerk.createOrganization(...)` — tanto para cuentas anidadas como separadas.
//
// Doble escritura a propósito (robustez):
//   1) Clerk publicMetadata (parentOrgId + countryCode) — fuente de verdad de la
//      AGRUPACIÓN en el switcher (se lee client-side sin roundtrip a Neon) y lo que
//      el webhook organization.updated reconcilia.
//   2) Neon orgs (country_code + parent_org_id) — al vuelo, para no esperar al
//      webhook async. El webhook es idempotente y reconcilia después.
export const prerender = false;

import type { APIRoute } from 'astro';
import { clerkClient } from '@clerk/astro/server';
import { sql } from '../../../lib/db';
import { currentUserId } from '../../../lib/context';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Países que hoy ofrecemos en el alta (ISO 3166-1 alpha-2). Mantener en sync con
// COUNTRIES de CreateWorkspaceModal.tsx.
const SUPPORTED = new Set(['MX', 'US', 'CO', 'AR', 'CL', 'PE', 'ES']);

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const userId = currentUserId();
  if (!userId) return json({ error: 'No autorizado' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const childOrgId = String(body.childOrgId || '').trim();
  const parentOrgId = body.parentOrgId ? String(body.parentOrgId).trim() : null;
  const countryCode = String(body.countryCode || 'MX').toUpperCase();
  const name = body.name ? String(body.name).slice(0, 120) : undefined;

  if (!childOrgId) return json({ error: 'childOrgId es requerido' }, 400);
  if (!SUPPORTED.has(countryCode)) return json({ error: 'País no soportado' }, 400);

  // Si es anidada, el usuario DEBE ser miembro activo del padre. El driver de Neon
  // devuelve un ARRAY de filas — nunca destructurar como `const [rows]`.
  if (parentOrgId) {
    const rows = await sql`
      select 1
      from org_members m
      join orgs o on o.id = m.org_id
      where o.clerk_org_id = ${parentOrgId}
        and m.clerk_user_id = ${userId}
        and m.estado = 'activo'
      limit 1`;
    if (!rows.length) {
      return json({ error: 'No tienes acceso a la organización padre o no existe.', nested: false }, 403);
    }
  }

  // 1) Metadata en Clerk (agrupación visual + país). Si es anidada y esto falla,
  //    abortamos: la anidación depende de este metadato. Si es separada, es
  //    best-effort (el país igual se persiste abajo).
  try {
    const clerk = clerkClient(context);
    await clerk.organizations.updateOrganization({
      organizationId: childOrgId,
      publicMetadata: { ...(parentOrgId ? { parentOrgId } : {}), countryCode },
    });
  } catch (e: any) {
    if (parentOrgId) {
      const msg = String(e?.errors?.[0]?.message || e?.message || 'No se pudo anidar la cuenta');
      return json({ error: msg, nested: false }, 502);
    }
  }

  // 2) Persistir en Neon al vuelo (upsert por clerk_org_id). El webhook reconcilia
  //    nombre/owner/seed; aquí solo fijamos país y padre.
  try {
    await sql`
      insert into orgs (clerk_org_id, nombre, country_code)
      values (${childOrgId}, ${name || 'Mi negocio'}, ${countryCode})
      on conflict (clerk_org_id) do update set country_code = ${countryCode}`;
    if (parentOrgId) {
      await sql`
        update orgs
        set parent_org_id = (select id from orgs where clerk_org_id = ${parentOrgId} limit 1)
        where clerk_org_id = ${childOrgId}`;
    }
  } catch { /* el webhook organization.updated lo reconcilia */ }

  return json({ ok: true });
};
