import type { APIRoute } from 'astro';
import { sql } from '../../../../lib/db';
// import * as argon2 from 'argon2';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token, password } = await request.json();
    
    if (!token || !password || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Datos inválidos' }), { status: 400 });
    }

    // 1. Buscar token en DB (y borrar los expirados para mantener limpia la BD)
    await sql`delete from password_reset_tokens where expires_at < now()`;

    const rows = await sql`
      select user_id, expires_at 
      from password_reset_tokens 
      where id = ${token}
      limit 1
    `;

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'El enlace es inválido o ha expirado.' }), { status: 400 });
    }

    const { user_id, expires_at } = rows[0];

    // Doble verificación por si la BD no limpió a tiempo
    if (new Date(expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'El enlace es inválido o ha expirado.' }), { status: 400 });
    }

    // 2. Hash de la nueva contraseña
    // const passwordHash = await argon2.hash(password);
    const passwordHash = 'dummy_hash';

    // 3. Actualizar contraseña del usuario y limpiar TODOS sus tokens
    await sql`
      update users 
      set password_hash = ${passwordHash}, updated_at = now() 
      where id = ${user_id}
    `;

    // 4. Invalida todas las sesiones activas del usuario (por seguridad)
    await sql`delete from sessions where user_id = ${user_id}`;
    
    // 5. Borrar el token de reseteo usado (y cualquier otro que tenga pendiente)
    await sql`delete from password_reset_tokens where user_id = ${user_id}`;

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('[reset/confirm]', error);
    return new Response(JSON.stringify({ error: 'Ocurrió un error inesperado' }), { status: 500 });
  }
};
