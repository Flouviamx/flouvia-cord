// POST /api/test-mode/reset — vacía los datos del ENTORNO DE PRUEBA (tipo Stripe
// "delete all test data"). Solo opera si la org activa es una SANDBOX: borra la
// org sandbox por completo (cascade limpia cotizaciones/clientes/productos/…);
// la próxima resolución en modo prueba la recrea fresca + reseed.
// Ruta INTERNA (el middleware exige sesión). Requiere estar en modo prueba
// (cookie cord_test_mode) para que getActiveOrgId resuelva la sandbox.
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../lib/db';

export const POST: APIRoute = async () => {
    const orgId = await getActiveOrgId(); // en modo prueba = la org sandbox

    // Guard duro: SOLO se borra si es una sandbox. Jamás tocar una org real.
    const [o] = await sql`select sandbox_of from orgs where id = ${orgId}`;
    if (!o?.sandbox_of) {
        return json({ error: 'Solo puedes vaciar datos dentro del entorno de prueba.' }, 409);
    }

    // Cascade elimina todas las filas hijas (cotizaciones, clientes, productos,
    // eventos, etc.). La condición sandbox_of is not null es una segunda red de
    // seguridad: aunque orgId apuntara mal, nunca borraría una org real.
    await sql`delete from orgs where id = ${orgId} and sandbox_of is not null`;

    return json({ ok: true });
};

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
