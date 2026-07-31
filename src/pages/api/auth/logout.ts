import type { APIRoute } from 'astro';
import { invalidateSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const sessionId = cookies.get('cord_session')?.value;
    
    if (sessionId) {
      await invalidateSession(sessionId);
    }

    cookies.delete('cord_session', { path: '/' });

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error) {
    console.error('Error en /api/auth/logout:', error);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const sessionId = cookies.get('cord_session')?.value;
  if (sessionId) {
    await invalidateSession(sessionId);
  }
  cookies.delete('cord_session', { path: '/' });
  cookies.delete('cord_active_org', { path: '/' });
  return redirect('/sign-in');
};
