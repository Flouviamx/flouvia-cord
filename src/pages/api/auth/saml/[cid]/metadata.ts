// GET /api/auth/saml/[cid]/metadata — metadata XML del Service Provider (Cord)
// para esta conexión. Es lo que el admin del IdP importa al configurar la app.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getConnection, buildSamlInstance, generateMetadata } from '../../../../../lib/saml';

export const GET: APIRoute = async ({ params }) => {
  const cid = params.cid;
  if (!cid) return new Response('Not found', { status: 404 });

  const conn = await getConnection(cid);
  if (!conn) return new Response('Not found', { status: 404 });

  try {
    const saml = buildSamlInstance(conn, { kind: 'sp-acs' });
    const xml = generateMetadata(saml);
    return new Response(xml, { headers: { 'Content-Type': 'application/samlmetadata+xml' } });
  } catch (err) {
    console.error('[saml/metadata] Error:', err);
    return new Response('Error generando metadata', { status: 500 });
  }
};
