// GET /api/cotizaciones/[id]/cfdi?type=pdf|xml
// Sirve el PDF o XML del CFDI emitido por Facturapi para esta cotización.
// Facturapi no expone URLs públicas: descarga el archivo con auth y lo streamea.
// Ruta INTERNA (protegida por el middleware de sesión + filtro por org).
export const prerender = false;

import type { APIRoute } from 'astro';
import { sql, getActiveOrgId } from '../../../../lib/db';

const FACTURAPI_KEY = import.meta.env.FACTURAPI_API_KEY || process.env.FACTURAPI_API_KEY || import.meta.env.FACTURAPI_KEY || process.env.FACTURAPI_KEY || '';
const FACTURAPI_BASE = (import.meta.env.FACTURAPI_URL || process.env.FACTURAPI_URL || 'https://www.facturapi.io/v2').replace(/\/$/, '');

export const GET: APIRoute = async ({ params, url }) => {
  const type = url.searchParams.get('type') === 'xml' ? 'xml' : 'pdf';
  const orgId = await getActiveOrgId();
  const id = params.id ?? '';

  // Documento fiscal emitido más reciente de esta cotización + la llave LIVE de la
  // org (si timbró bajo su propio RFC, la global no puede descargar su CFDI).
  const [doc] = await sql`
    select d.provider_data, o.facturapi_live_key
    from documentos_fiscales d
    join orgs o on o.id = d.org_id
    where d.cotizacion_id = ${id} and d.org_id = ${orgId} and d.status = 'issued'
    order by d.created_at desc limit 1`;

  const facturapiId = doc?.provider_data?.facturapi_id as string | undefined;
  if (!facturapiId) return new Response('CFDI no encontrado', { status: 404 });

  const apiKey = (doc?.facturapi_live_key as string) || FACTURAPI_KEY;
  if (!apiKey) return new Response('Facturapi no configurado', { status: 503 });
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/${type}`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    return new Response('No se pudo obtener el CFDI', { status: 502 });
  }
  if (!res.ok) return new Response('No se pudo obtener el CFDI', { status: 502 });

  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type === 'xml' ? 'application/xml' : 'application/pdf',
      'Content-Disposition': `inline; filename="cfdi-${facturapiId}.${type}"`,
    },
  });
};
