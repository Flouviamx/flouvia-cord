import type { APIRoute } from 'astro';
export const prerender = false;
// The host boundary answers this only for a registered pending/active customer domain.
export const GET: APIRoute = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
