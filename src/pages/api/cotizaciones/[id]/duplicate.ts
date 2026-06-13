// POST /api/cotizaciones/[id]/duplicate — copia una cotización a un nuevo borrador.
// Clona cliente, términos, notas, totales e items; asigna folio y public_token
// nuevos, status 'draft' y vigencia fresca (+30 días). Responde { id, folio }.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';

export const POST: APIRoute = async ({ params }) => {
    const id = params.id ?? '';
    const orgId = await getActiveOrgId();

    const [src] = await sql`select * from cotizaciones where id = ${id} and org_id = ${orgId}`;
    if (!src) return json({ error: 'Cotización no encontrada' }, 404);

    const items = await sql`select * from cotizacion_items where cotizacion_id = ${id} order by orden`;

    const [{ prefix }] = await sql`select quote_prefix as prefix from orgs where id = ${orgId}`;
    const [{ maxn }] = await sql`
        select coalesce(max(nullif(regexp_replace(folio, '\\D', '', 'g'), '')::int), 0) as maxn
        from cotizaciones where org_id = ${orgId}`;
    const folio = `${prefix}-${String(Number(maxn) + 1).padStart(4, '0')}`;

    const vigencia = new Date(); vigencia.setDate(vigencia.getDate() + 30);

    const [cot] = await sql`
        insert into cotizaciones
            (org_id, cliente_id, folio, status, subtotal, iva, total, terminos, vigencia, notas)
        values
            (${orgId}, ${src.cliente_id}, ${folio}, 'draft', ${src.subtotal}, ${src.iva}, ${src.total},
             ${src.terminos}, ${vigencia.toISOString()}, ${src.notas})
        returning id`;

    let orden = 0;
    for (const it of items as any[]) {
        await sql`
            insert into cotizacion_items
                (cotizacion_id, producto_id, descripcion, cantidad, precio_unitario, precio_negociado, orden)
            values
                (${cot.id}, ${it.producto_id}, ${it.descripcion}, ${it.cantidad},
                 ${it.precio_unitario}, ${it.precio_negociado}, ${orden++})`;
    }

    await sql`insert into eventos (org_id, cotizacion_id, tipo, detalle)
              values (${orgId}, ${cot.id}, 'created', ${'Duplicada de ' + src.folio})`;

    return json({ id: cot.id, folio });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
