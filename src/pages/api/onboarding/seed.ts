// POST /api/onboarding/seed { industria } — precarga catálogo + clientes de ejemplo
// para la org activa según su giro. Lo dispara el onboarding cuando la cuenta está vacía.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';
import { findPack } from '../../../lib/onboarding';

export const POST: APIRoute = async ({ request }) => {
    let body: any;
    try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const pack = findPack(String(body.industria ?? ''));
    if (!pack) return json({ error: 'Industria no válida' }, 400);

    const orgId = await getActiveOrgId();

    for (const p of pack.productos) {
        await sql`insert into productos (org_id, sku, nombre, precio_lista, unidad, activo)
                  values (${orgId}, ${p.sku}, ${p.nombre}, ${p.precio}, ${p.unidad}, true)`;
    }
    for (const c of pack.clientes) {
        await sql`insert into clientes (org_id, empresa, contacto, email, terminos_default, limite_credito)
                  values (${orgId}, ${c.empresa}, ${c.contacto}, ${c.email}, ${c.terminos}, ${c.limite})`;
    }

    return json({ ok: true, productos: pack.productos.length, clientes: pack.clientes.length });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
