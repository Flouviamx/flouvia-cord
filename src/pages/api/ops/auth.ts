import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { secret } = await request.json();
    const validSecret = import.meta.env.OPS_SECRET;

    if (!validSecret) {
      return new Response(JSON.stringify({ error: 'OPS_SECRET no configurado en servidor' }), { status: 500 });
    }

    if (secret !== validSecret) {
      return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 401 });
    }

    // Setear cookie segura (HttpOnly)
    cookies.set('cord_ops_token', secret, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 días
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
};
