import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { verifyPassword, createSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { identifier, email: fallbackEmail, password } = await request.json();
    const email = identifier || fallbackEmail;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
    }

    // Buscar usuario
    const users = await sql`select id, password_hash from users where email = ${email} limit 1`;
    if (users.length === 0) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    }
    const user = users[0];

    // Verificar contraseña
    const isValid = await verifyPassword(password, user.password_hash as string);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 });
    }

    // Crear sesión
    const ip = request.headers.get('x-forwarded-for') || 'desconocida';
    const userAgent = request.headers.get('user-agent') || 'desconocido';
    const sessionId = await createSession(user.id as string, userAgent, ip);

    cookies.set('cord_session', sessionId, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
};
