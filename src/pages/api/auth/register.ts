import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { hashPassword, createSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { email, password, firstName, lastName } = await request.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
    }

    // Verificar si el usuario ya existe
    const existing = await sql`select id from users where email = ${email} limit 1`;
    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: 'email_exists' }), { status: 400 });
    }

    // Hashear contraseña (placeholder seguro Scrypt/Argon2id)
    const passwordHash = await hashPassword(password);

    // Crear usuario
    const [user] = await sql`
      insert into users (email, first_name, last_name, password_hash)
      values (${email}, ${firstName || null}, ${lastName || null}, ${passwordHash})
      returning id
    `;

    // Crear sesión
    const ip = request.headers.get('x-forwarded-for') || 'desconocida';
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const sessionId = await createSession(user.id as string, userAgent, ip);

    // Set cookie seguras (HttpOnly, Secure, Lax)
    cookies.set('cord_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 días
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error('Error en /api/auth/register:', error);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
};
